/**
 * Admin panel — notifications and the bell
 *
 * Seven event sources reach the bell: new order, successful payment, failed
 * payment, new signup, staff profile change, admin deletion and violation
 * report.
 *
 * Two rules that are easy to confuse, and were the cause of a real bug:
 * creating a notification record and being allowed to SEE it are separate
 * things. pushAdminNotification() used to return null when the current
 * operator had no right to view the event - so the record was never created
 * at all, and a manager logging in later saw nothing. The record is always
 * built and stored; canReceiveNotification() only filters the display.
 *
 * reconcileNotifications() exists because notifications used to be raised
 * only from a 'storage' event, which fires only in OTHER tabs open at that
 * moment. An order placed overnight produced nothing at all.
 *
 * Split out of scripts/admin.js, which had grown to 5,241 lines. Every
 * classic <script> shares one global scope, so these files see each other
 * exactly as one file would. The load order in html/admin.html matters only
 * for code that runs while a file is being parsed; boot.js is last because
 * it is the only file that does that on purpose.
 */

/**
 * Mirror one notification to the server.
 *
 * Notifications were browser-only, so two operators never saw the same list
 * and a refresh could lose an event nobody had read yet. Writes go through
 * appApi as well now; the local copy stays as an offline cache.
 */
function syncNotification(notification) {
  if (
    typeof appApi === "undefined" ||
    !appApi.admin ||
    !appApi.admin.notifications
  )
    return;
  persistAdmin(appApi.admin.notifications.create(notification), "ثبت اعلان");
}

function formatNotificationTime(timestamp, fallback = "همین حالا") {
  if (!timestamp) return fallback;
  const minutes = Math.floor((Date.now() - Number(timestamp)) / 60000);
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return toPersianDigits(minutes) + " دقیقه پیش";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return toPersianDigits(hours) + " ساعت پیش";
  const days = Math.floor(hours / 24);
  if (days < 7) return toPersianDigits(days) + " روز پیش";
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return toPersianDigits(weeks) + " هفته پیش";
  return toPersianDigits(Math.floor(days / 30)) + " ماه پیش";
}

// Notification source mapping (7 sources as defined by user):
// purchase = ثبت سفارش جدید / پرداخت موفق / پرداخت ناموفق
// user     = ثبت نام کاربر جدید
// staff    = تغییر پروفایل توسط ادمین یا مدیر (NOT for admins)
// report   = گزارش تخلف (NOT for admins, later connected to support)
// deletion = حذف ادمین توسط مدیر
const notificationThemes = {
  purchase: "green",
  user: "blue",
  staff: "yellow",
  report: "red",
  deletion: "black",
};
// Frontend permission guard. The backend must apply this same policy when it delivers notification records.
function currentNotificationRole() {
  const member = appState.users.find((u) => u.id === currentStaffProfileId);
  return member
    ? member.role
    : currentAdminUserRole === "admin"
      ? "ادمین"
      : "مدیر سایت";
}
// Notification filtering rules (as per user requirements / backend will specify roles later):
// - Admins ("ادمین") receive ONLY: purchase (new order, success/fail), user (new user), deletion (admin deleted by manager)
// - Admins do NOT receive: staff (profile change by admin/manager), report (violation report)
// - Managers ("مدیر") receive ALL notification types
function canReceiveNotification(notification) {
  return (
    currentNotificationRole() !== "ادمین" ||
    !["staff", "report"].includes(notification.type)
  );
}
function visibleNotifications() {
  return appState.notifications.filter(canReceiveNotification);
}
let bellTimer = null;
let notificationIdHighWater = 0;
let notificationReconcileDepth = 0;
let notificationBatchChanged = false;
function pushAdminNotification(type, title, desc, details = {}) {
  const theme = notificationThemes[type] || "blue";
  // Recording an event and being allowed to see it are two different things.
  // This used to `return null` when the signed-in operator could not view the
  // type, so an admin editing their own profile created no record at all -
  // and the managers who were supposed to be told never found out. The event
  // is always stored; visibleNotifications() decides who sees it.
  const now = Date.now();
  notificationIdHighWater = Math.max(now, notificationIdHighWater + 1);
  const notification = {
    id: notificationIdHighWater,
    type,
    theme,
    title,
    desc,
    time: "همین حالا",
    createdAt: Date.now(),
    unread: true,
    fresh: true,
    details,
  };
  appState.notifications.unshift(notification);
  persistAdminNotifications();
  syncNotification(notification);
  // Only ring the bell for someone entitled to read it.
  if (canReceiveNotification(notification)) {
    activateNotificationBell(theme);
  }
  if (notificationReconcileDepth) {
    notificationBatchChanged = true;
  } else {
    renderNotificationDropdownItems();
    if (document.getElementById("view-notifications")?.classList.contains("active")) {
      renderNotificationsPage();
    }
  }
  return notification;
}
// Backend integration point: map the API response to { type, title, desc, details }.
// Each event type owns its display schema, so adding API fields never affects other notification types.
const notificationDetailSchemas = {
  purchase: {
    label: "سفارش و پرداخت",
    icon: "fa-bag-shopping",
    fields: [
      "شماره سفارش",
      "خریدار",
      "ایمیل خریدار",
      "تلفن خریدار",
      "محصول",
      "مبلغ",
      "وضعیت پرداخت",
      "روش پرداخت",
      "کد پیگیری",
      "تاریخ ثبت",
    ],
  },
  user: {
    label: "ثبت‌نام کاربر",
    icon: "fa-user-plus",
    fields: [
      "شناسه کاربر",
      "نام کاربر",
      "ایمیل",
      "تلفن",
      "نقش",
      "وضعیت حساب",
      "روش ثبت‌نام",
      "تاریخ ثبت‌نام",
    ],
  },
  staff: {
    label: "تغییرات پروفایل ادمین",
    icon: "fa-user-gear",
    fields: ["کاربر", "نقش", "موارد تغییرکرده", "زمان تغییر", "نشانی IP"],
  },
  deletion: {
    label: "حذف حساب مدیریت",
    icon: "fa-user-slash",
    fields: ["حساب حذف‌شده", "نقش", "حذف‌کننده", "شناسه حذف‌کننده", "تاریخ"],
  },
  report: {
    label: "گزارش تخلف",
    icon: "fa-flag",
    fields: [
      "شناسه گزارش",
      "گزارش‌دهنده",
      "کاربر/مورد گزارش‌شده",
      "نوع گزارش",
      "درجه اهمیت",
      "وضعیت رسیدگی",
      "شرح",
      "مدرک پیوست",
      "تاریخ",
    ],
  },
};

function activateNotificationBell(theme) {
  const bell = document.getElementById("notificationBtn");
  if (!bell) return;
  clearTimeout(bellTimer);
  bell.classList.remove(
    "bell-green",
    "bell-blue",
    "bell-yellow",
    "bell-red",
    "bell-black",
  );
  bell.classList.add("bell-red");
  bellTimer = setTimeout(
    () =>
      bell.classList.remove(
        "bell-green",
        "bell-blue",
        "bell-yellow",
        "bell-red",
        "bell-black",
      ),
    10000,
  );
}
function notificationCardSummary(n) {
  const d = n.details || {};
  if (n.type === "user")
    return `${d["نام کاربر"] || "کاربر جدید"} · ${d["ایمیل"] || "—"}`;
  if (n.type === "report")
    return `${d["شناسه گزارش"] || "گزارش"} · ${d["درجه اهمیت"] || "—"} · ${d["وضعیت رسیدگی"] || "جدید"}`;
  return n.desc;
}
/** Icon for a notification type. */
function notificationIcon(type) {
  return type === "purchase"
    ? "fa-circle-check"
    : type === "user"
      ? "fa-user-plus"
      : type === "staff"
        ? "fa-user-gear"
        : type === "deletion"
          ? "fa-user-slash"
          : "fa-flag";
}

function renderNotificationsPage() {
  const container = document.getElementById("notificationsPageList");
  if (!container) return;

  const items = visibleNotifications();
  const clearBtn = document.getElementById("clearAllNotifsBtn");
  if (clearBtn) clearBtn.style.display = items.length ? "inline-flex" : "none";

  if (!items.length) {
    container.innerHTML =
      '<p style="text-align:center;padding:2rem">اعلانی وجود ندارد.</p>';
    return;
  }

  const allowedThemes = new Set(["green", "blue", "yellow", "red", "black"]);
  container.innerHTML = items
    .map((n) => {
      const theme = allowedThemes.has(n.theme) ? n.theme : "blue";
      return `<div class="notification-item notification-${theme}" style="cursor: pointer;" data-open-notification="${escapeAttr(String(n.id))}">
      <i class="fas ${notificationIcon(n.type)}"></i>
      <div><strong>${escapeHtml(n.title || "اعلان")}</strong><p>${escapeHtml(notificationCardSummary(n))}</p>
        <small>${escapeHtml(formatNotificationTime(n.createdAt, n.time))}</small></div>
      <button type="button" class="notif-delete"
              title="حذف این اعلان" aria-label="حذف این اعلان"
              data-delete-notification="${escapeAttr(String(n.id))}">
        <i class="fas fa-trash"></i>
      </button>
    </div>`;
    })
    .join("");
}
window.pushAdminNotification = pushAdminNotification;

/* ============================================================================
   CATCHING UP ON EVENTS THAT HAPPENED WHILE THE PANEL WAS CLOSED
   ----------------------------------------------------------------------------
   Notifications used to be raised only from a "storage" event, which the
   browser fires only in *other* tabs that are open at the same time. So an
   order placed overnight, or a signup while the panel was shut, produced
   nothing at all - the operator opened the panel to an empty bell.

   Every source is reconciled on load instead: whatever is on record but has
   not been announced yet gets a notification. A seen-id ledger keeps that
   from repeating on the next refresh.
   ========================================================================== */
const ANNOUNCED_KEY = "benamacademyAnnouncedEvents";

function loadAnnouncedIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(ANNOUNCED_KEY));
    if (raw && typeof raw === "object") return raw;
  } catch (e) {}
  return { orders: [], users: [], reports: [] };
}

let announcedEvents = loadAnnouncedIds();
const announcedEventSets = {
  orders: new Set(Array.isArray(announcedEvents.orders) ? announcedEvents.orders.map(String) : []),
  users: new Set(Array.isArray(announcedEvents.users) ? announcedEvents.users.map(String) : []),
  reports: new Set(Array.isArray(announcedEvents.reports) ? announcedEvents.reports.map(String) : []),
};

function saveAnnouncedIds() {
  try {
    // Retain every seen ID. Truncating this ledger caused older events to be
    // announced again once their IDs fell out of the 500-entry window.
    announcedEvents = {
      orders: Array.from(announcedEventSets.orders),
      users: Array.from(announcedEventSets.users),
      reports: Array.from(announcedEventSets.reports),
    };
    localStorage.setItem(ANNOUNCED_KEY, JSON.stringify(announcedEvents));
  } catch (e) {}
}

function wasAnnounced(bucket, id) {
  return !!announcedEventSets[bucket]?.has(String(id));
}

function markAnnounced(bucket, id) {
  if (!announcedEventSets[bucket]) announcedEventSets[bucket] = new Set();
  const value = String(id);
  if (announcedEventSets[bucket].has(value)) return;
  announcedEventSets[bucket].add(value);
  announcedEvents[bucket] ||= [];
  announcedEvents[bucket].push(value);
}

/** One order -> one notification, worded by how the payment ended. */
function announceOrder(order) {
  if (!order || !order.id || wasAnnounced("orders", order.id)) return;
  markAnnounced("orders", order.id);

  const titles = {
    success: "پرداخت موفق",
    failed: "پرداخت ناموفق",
    cancelled: "سفارش لغو شده",
  };
  const title = titles[order.status] || "ثبت سفارش جدید";

  pushAdminNotification(
    "purchase",
    title,
    `سفارش ${order.id} ${
      order.status === "success"
        ? "با موفقیت پرداخت شد"
        : order.status === "failed"
          ? "با خطای پرداخت مواجه شد"
          : order.status === "cancelled"
            ? "توسط کاربر لغو شد"
            : "ثبت شد"
    }.`,
    {
      "شماره سفارش": order.id || "—",
      خریدار: order.customer || "—",
      "ایمیل خریدار": order.buyerEmail || "—",
      "تلفن خریدار": toPersianDigits(order.buyerPhone || "—"),
      محصول: order.product || "—",
      مبلغ:
        typeof formatOrderAmount === "function"
          ? formatOrderAmount(order.amount)
          : String(order.amount || "—"),
      "وضعیت پرداخت": getStatusText(order.status),
      "روش پرداخت": order.gateway || "درگاه پرداخت",
      "کد پیگیری": order.trackingCode || order.id || "—",
      "تاریخ ثبت": toPersianDigits(order.date || "—"),
    },
  );
}

/** A visitor who created an account on the public site. */
function announceUser(user) {
  if (!user || !user.id || wasAnnounced("users", user.id)) return;
  // Staff accounts are created inside the panel; only public signups qualify.
  if (user.role && user.role !== "کاربر عادی") return;
  markAnnounced("users", user.id);

  pushAdminNotification(
    "user",
    "ثبت‌نام کاربر جدید",
    `کاربر «${user.name || "جدید"}» به سامانه پیوست.`,
    {
      "شناسه کاربر": "#" + toPersianDigits(user.id),
      "نام کاربر": user.name || "—",
      ایمیل: user.email || "—",
      تلفن: toPersianDigits(user.phone || "—"),
      نقش: user.role || "کاربر عادی",
      "وضعیت حساب": user.status || "فعال",
      "روش ثبت‌نام": "فرم ثبت‌نام سایت",
      "تاریخ ثبت‌نام": toPersianDigits(
        user.createdAt
          ? new Date(user.createdAt).toLocaleDateString("fa-IR")
          : "—",
      ),
    },
  );
}

/** A violation report filed from the support page. */
function announceReport(report) {
  if (!report || !report.id || wasAnnounced("reports", report.id)) return;
  markAnnounced("reports", report.id);

  pushAdminNotification(
    "report",
    "گزارش تخلف جدید",
    `کاربر «${report.reporterName || "ناشناس"}» یک گزارش تخلف ثبت کرده است.`,
    {
      "شناسه گزارش": report.id,
      گزارش‌دهنده: report.reporterName || "ناشناس",
      "کاربر/مورد گزارش‌شده": report.subject || "—",
      "نوع گزارش": REPORT_KIND_LABELS[report.kind] || report.kind || "—",
      "درجه اهمیت":
        REPORT_SEVERITY_LABELS[report.severity] || report.severity || "متوسط",
      "وضعیت رسیدگی":
        report.status === "reviewed" ? "بررسی شد" : "در انتظار بررسی",
      شرح: report.description || "—",
      "مدرک پیوست": report.evidenceImage ? "تصویر پیوست شده" : "—",
      تاریخ: toPersianDigits(report.date || "—"),
    },
  );
}

const REPORT_KIND_LABELS = {
  content: "محتوای نامناسب",
  copyright: "نقض حق نشر",
  abuse: "سوءاستفاده یا توهین",
  fraud: "کلاهبرداری",
  other: "سایر موارد",
};
const REPORT_SEVERITY_LABELS = { low: "کم", medium: "متوسط", high: "زیاد" };

/**
 * Violation reports.
 *
 * Read straight from storage so the first paint is synchronous; the
 * authoritative copy arrives with hydrateFromApi(), which calls
 * appApi.admin.reports.list(). Once a real server is attached that call is
 * the only thing that matters and this becomes a cache read.
 */
function loadAbuseReports() {
  try {
    const raw = JSON.parse(localStorage.getItem("benamacademyReports"));
    if (Array.isArray(raw)) return raw;
  } catch (e) {}
  return [];
}

/**
 * Announce anything on record that has not been announced yet.
 * Safe to call repeatedly - the ledger stops duplicates.
 */
function reconcileNotifications() {
  notificationReconcileDepth++;
  notificationBatchChanged = false;
  try {
    // Oldest first, so the newest event ends up at the top of the list.
    (appState.orders || []).slice().reverse().forEach(announceOrder);
    (appState.users || []).forEach(announceUser);
    loadAbuseReports().slice().reverse().forEach(announceReport);
  } finally {
    notificationReconcileDepth = Math.max(0, notificationReconcileDepth - 1);
  }

  if (notificationBatchChanged) {
    renderNotificationDropdownItems();
    if (document.getElementById("view-notifications")?.classList.contains("active")) {
      renderNotificationsPage();
    }
  }
  saveAnnouncedIds();
}

function initNotifications() {
  const btn = document.getElementById("notificationBtn");
  const dropdown = document.getElementById("notificationDropdown");
  const markAllBtn = document.getElementById("markAllRead");

  if (btn && dropdown) {
    const setPanelOpen = (isOpen) => {
      dropdown.classList.toggle("active", isOpen);
      document.body.classList.toggle("notification-panel-open", isOpen);
      if (isOpen) lockBodyScroll();
      else unlockBodyScroll();
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = !dropdown.classList.contains("active");
      if (willOpen) {
        closeAdminHeaderPopovers();
        renderNotificationDropdownItems();
      }
      setPanelOpen(willOpen);
    });

    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
        setPanelOpen(false);
      }
    });

    // Escape should close it too - a panel you can only dismiss by clicking
    // elsewhere is a small trap for keyboard users.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dropdown.classList.contains("active")) {
        setPanelOpen(false);
      }
    });
  }

  updateNotificationBadge();

  if (markAllBtn) {
    markAllBtn.addEventListener("click", () => {
      dropdown.classList.remove("active");
      document.body.classList.remove("notification-panel-open");
      unlockBodyScroll();
      switchView("notifications");
      renderNotificationsPage();
    });
  }
}

function openNotificationDetails(notification) {
  if (!notification) return;
  const rawDetails = notification.details;
  const details = rawDetails && typeof rawDetails === "object" && !Array.isArray(rawDetails)
    ? rawDetails
    : {};
  const schema = notificationDetailSchemas[notification.type] || {
    label: "اعلان",
    icon: "fa-bell",
  };
  const allowedThemes = new Set(["green", "blue", "yellow", "red", "black"]);
  const theme = allowedThemes.has(notification.theme) ? notification.theme : "blue";
  const title = document.getElementById("notifDetailTitle");
  const time = document.getElementById("notifDetailTime");
  const hero = document.getElementById("notifDetailHero");
  const desc = document.getElementById("notifDetailDesc");
  const dynamic = document.getElementById("notifDetailDynamic");
  if (!title || !time || !hero || !desc || !dynamic) return;

  title.textContent = notification.title || "اعلان سیستم";
  time.textContent = formatNotificationTime(notification.createdAt, notification.time) +
    " · " + schema.label;
  hero.className = `notification-detail-hero notification-detail-hero--${theme}`;
  hero.innerHTML = `<i class="fas ${schema.icon || "fa-bell"}" id="notifDetailIcon" style="font-size: 24px;"></i><div><small>نوع اعلان</small><strong id="notifDetailType" style="font-size: 15px;">${escapeHtml(schema.label)}</strong></div>`;
  desc.textContent = notification.desc || "—";

  const entries = Object.entries(details).slice(0, 60);
  dynamic.innerHTML = entries.length
    ? `<div class="notification-detail-desc" style="margin-top:10px;padding:14px;border-radius:9px;line-height:1.9;">${entries.map(([key, value]) => `<p style="margin:4px 0;"><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value == null || value === "" ? "—" : String(value))}</p>`).join("")}</div>`
    : "";

  if (notification.type === "report") {
    if (details["شناسه گزارش"] != null) {
      const reply = document.createElement("button");
      reply.type = "button";
      reply.className = "btn-primary report-reply-btn";
      reply.setAttribute("data-notification-report-reply", String(details["شناسه گزارش"]));
      reply.innerHTML = '<i class="fas fa-reply"></i> پاسخ به کاربر';
      dynamic.appendChild(reply);
    }
    if (details["تصویر/فایل ضمیمه"]) {
      const evidence = document.createElement("div");
      evidence.className = "notification-evidence";
      const name = String(details["تصویر/فایل ضمیمه"]).slice(0, 255);
      const link = document.createElement("a");
      link.href = "data:text/plain;charset=utf-8," + encodeURIComponent(
        "فایل ضمیمه گزارش تخلف\nنام فایل: " + name + "\nتاریخ: " + String(details["تاریخ"] || "—"),
      );
      link.download = name || "attachment.txt";
      link.textContent = "دانلود فایل ضمیمه: " + name;
      evidence.appendChild(link);
      dynamic.appendChild(evidence);
    }
    if (details["لینک شواهد"] && details["لینک شواهد"] !== "#") {
      try {
        const evidenceUrl = new URL(String(details["لینک شواهد"]), window.location.href);
        if (evidenceUrl.protocol === "http:" || evidenceUrl.protocol === "https:") {
          const link = document.createElement("a");
          link.href = evidenceUrl.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "باز کردن لینک شواهد";
          dynamic.appendChild(link);
        }
      } catch (e) {
        // Invalid or non-web evidence links are shown only as escaped detail text.
      }
    }
  }
  openModal("notificationDetailModal");
}

/* ============================================================================
   REPLYING TO A VIOLATION REPORT
   ----------------------------------------------------------------------------
   A report used to be read-only: a manager could see it and nothing else.
   The answer now goes back as an ordinary support thread, so it appears in
   the reporter's "پیام‌های من" beside their other conversations and in the
   panel's messages tab. A second parallel inbox would have meant two places
   to check and two things to keep in sync.
   ========================================================================== */

function deleteNotification(notifId) {
  const notification = appState.notifications.find(
    (n) => String(n.id) === String(notifId),
  );
  if (!notification) return;

  if (!confirm("این اعلان حذف شود؟")) return;

  appState.notifications = appState.notifications.filter(
    (n) => String(n.id) !== String(notifId),
  );
  persistAdminNotifications();
  renderNotificationDropdownItems();
  renderNotificationsPage();
  showToast("اعلان حذف شد.", "success");
}

/** Clear every notification this operator can see. */
function clearAllNotifications() {
  const visible = visibleNotifications();
  if (!visible.length) {
    showToast("اعلانی برای حذف وجود ندارد.", "info");
    return;
  }
  if (!confirm(`همه ${toPersianDigits(visible.length)} اعلان حذف شوند؟`))
    return;

  // Only remove what this operator is allowed to see. An admin clearing
  // their list must not wipe manager-only records they cannot even read.
  const removable = new Set(visible.map((n) => String(n.id)));
  appState.notifications = appState.notifications.filter(
    (n) => !removable.has(String(n.id)),
  );
  persistAdminNotifications();
  renderNotificationDropdownItems();
  renderNotificationsPage();
  showToast("همه اعلان‌ها حذف شدند.", "success");
}

/**
 * Red count on the bell.
 *
 * The badge element existed in the markup but nothing ever wrote to it, so it
 * stayed permanently hidden no matter how many notifications arrived. Counts
 * only what this operator is allowed to see, so an admin is not shown a
 * number made up of manager-only events they cannot open.
 */
function updateNotificationBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  const unread = visibleNotifications().filter((n) => n.unread).length;
  if (unread > 0) {
    badge.textContent = toPersianDigits(unread > 99 ? "99+" : unread);
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

function renderNotificationDropdownItems() {
  updateNotificationBadge();

  const container = document.getElementById("notifListContainer");
  if (!container) return;
  const allowedThemes = new Set(["green", "blue", "yellow", "red", "black"]);
  container.innerHTML = visibleNotifications()
    .slice(0, 10)
    .map((n) => {
      const theme = allowedThemes.has(n.theme) ? n.theme : "blue";
      return `<div class="notif-item notif-item--${theme}" style="cursor: pointer;" data-open-notification="${escapeAttr(String(n.id))}"><span class="notif-event-dot"></span><div><div style="font-size:13px;color:var(--text-primary);font-weight:600;">${escapeHtml(n.title || "اعلان")}</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${escapeHtml(notificationCardSummary(n))} · ${escapeHtml(formatNotificationTime(n.createdAt, n.time))}</div></div></div>`;
    })
    .join("");
}

// One delegated handler covers both notification lists without embedding
// notification data or executable code in generated HTML attributes.
document.addEventListener("click", (event) => {
  const reply = event.target.closest("[data-notification-report-reply]");
  if (reply) {
    event.stopPropagation();
    openReportReply(reply.getAttribute("data-notification-report-reply"));
    return;
  }
  const trigger = event.target.closest("[data-open-notification]");
  if (!trigger || event.target.closest("[data-delete-notification]")) return;
  const id = trigger.getAttribute("data-open-notification");
  const notification = appState.notifications.find((item) => String(item.id) === String(id));
  if (notification) openNotificationDetails(notification);
});
