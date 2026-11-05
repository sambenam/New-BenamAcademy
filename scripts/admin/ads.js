/**
 * Admin panel — promotional ads ("تبلیغات" tab)
 *
 * A bottom bar that slides up on the home, list and single-post pages and
 * stays fixed while the page scrolls. This tab is the full CRUD for it:
 * create, edit, toggle active/inactive and delete. The public bar itself
 * lives in scripts/ads-banner.js and reads GET /ads.
 *
 * Every write goes through appApi.admin.ads, so once the backend is live the
 * same tab keeps working unchanged. See docs/API_CONTRACT.md.
 *
 * Loaded as a classic <script>, so it shares the panel's single global scope.
 */

/** Persian label for each page an ad can target. */
const AD_PAGE_LABELS = {
  home: "صفحه اصلی",
  list: "صفحه دسته‌بندی",
  single: "صفحه مطلب",
};

const AD_PAGES = ["home", "list", "single"];

function adPagesSummary(ad) {
  const pages =
    Array.isArray(ad.pages) && ad.pages.length ? ad.pages : AD_PAGES;
  return pages.map((p) => AD_PAGE_LABELS[p] || p).join("، ");
}

/** The ad row thumbnail, or a placeholder when there is no image. */
function adThumbHtml(ad) {
  if (ad.image) {
    return `<img class="ads-thumb" src="${escapeAttr(ad.image)}" alt="" />`;
  }
  return `<div class="ads-thumb ads-thumb--empty"><i class="fas fa-image"></i></div>`;
}

function renderAdsTable() {
  const tbody = document.getElementById("adsTableBody");
  if (!tbody) return;
  const ads = Array.isArray(appState.ads) ? appState.ads : [];

  const empty = document.getElementById("adsEmpty");
  if (empty) empty.style.display = ads.length ? "none" : "block";

  tbody.innerHTML = ads
    .map((ad) => {
      const active = ad.active !== false;
      return `<tr>
        <td>${adThumbHtml(ad)}</td>
        <td class="ads-title-cell">
          <strong>${escapeHtml(ad.title || "—")}</strong>
          ${ad.text ? `<small>${escapeHtml(ad.text)}</small>` : ""}
        </td>
        <td>${escapeHtml(adPagesSummary(ad))}</td>
        <td>${ad.delay ? toPersianDigits(ad.delay) + " ثانیه" : "بلافاصله"}</td>
        <td>
          <label class="ads-switch" title="${active ? "غیرفعال کردن" : "فعال کردن"}">
            <input type="checkbox" data-ad-toggle="${escapeAttr(String(ad.id))}" ${active ? "checked" : ""} />
            <span class="ads-switch__track"><span class="ads-switch__thumb"></span></span>
            <small>${active ? "فعال" : "غیرفعال"}</small>
          </label>
        </td>
        <td class="ads-actions">
          <button type="button" class="btn-secondary" data-ad-edit="${escapeAttr(String(ad.id))}" title="ویرایش"><i class="fas fa-pen"></i></button>
          <button type="button" class="btn-secondary ads-delete-btn" data-ad-delete="${escapeAttr(String(ad.id))}" title="حذف"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    })
    .join("");
}

function resetAdForm() {
  const form = document.getElementById("adForm");
  if (form) form.reset();
  const idField = document.getElementById("adId");
  if (idField) idField.value = "";
  AD_PAGES.forEach((p) => {
    const cb = document.getElementById("adPage_" + p);
    if (cb) cb.checked = true;
  });
  const delay = document.getElementById("adDelay");
  if (delay) delay.value = "0";
  const active = document.getElementById("adActive");
  if (active) active.checked = true;
  const linkText = document.getElementById("adLinkText");
  if (linkText) linkText.value = "مشاهده";
  const preview = document.getElementById("adImagePreview");
  if (preview) preview.style.display = "none";
  const modalTitle = document.getElementById("adFormTitle");
  if (modalTitle) modalTitle.textContent = "افزودن تبلیغ جدید";
}

function openAdForm(id) {
  resetAdForm();
  const ad =
    id != null
      ? (appState.ads || []).find((a) => String(a.id) === String(id))
      : null;
  if (ad) {
    document.getElementById("adId").value = ad.id;
    document.getElementById("adTitle").value = ad.title || "";
    document.getElementById("adText").value = ad.text || "";
    document.getElementById("adImage").value = ad.image || "";
    document.getElementById("adLink").value = ad.link || "";
    document.getElementById("adLinkText").value = ad.linkText || "مشاهده";
    document.getElementById("adDelay").value = String(
      ad.delay != null ? ad.delay : 0,
    );
    document.getElementById("adActive").checked = ad.active !== false;
    const pages =
      Array.isArray(ad.pages) && ad.pages.length ? ad.pages : AD_PAGES;
    AD_PAGES.forEach((p) => {
      const cb = document.getElementById("adPage_" + p);
      if (cb) cb.checked = pages.indexOf(p) !== -1;
    });
    const preview = document.getElementById("adImagePreview");
    if (preview && ad.image) {
      preview.src = ad.image;
      preview.style.display = "";
    }
    const modalTitle = document.getElementById("adFormTitle");
    if (modalTitle) modalTitle.textContent = "ویرایش تبلیغ";
  }
  openModal("adFormModal");
}

function readAdForm() {
  const pages = AD_PAGES.filter((p) => {
    const cb = document.getElementById("adPage_" + p);
    return cb && cb.checked;
  });
  return {
    title: document.getElementById("adTitle").value.trim(),
    text: document.getElementById("adText").value.trim(),
    image: document.getElementById("adImage").value.trim(),
    link: document.getElementById("adLink").value.trim(),
    linkText: document.getElementById("adLinkText").value.trim(),
    delay: Number(document.getElementById("adDelay").value) || 0,
    active: document.getElementById("adActive").checked,
    pages: pages,
  };
}

function persistAdWrite(promise, successMessage, label, rollback) {
  Promise.resolve(promise)
    .then((result) => {
      if (result && result._localOnly) {
        showToast(
          "تبلیغ فقط در همین مرورگر ذخیره شد؛ پس از آماده‌شدن بک‌اند، دوباره از سرور استفاده می‌شود.",
          "info",
        );
      } else {
        showToast(successMessage, "success");
      }
    })
    .catch((error) => {
      if (typeof rollback === "function") rollback();
      renderAdsTable();
      const detail = error && error.message ? error.message : "خطای ناشناخته";
      const status = error && error.status ? ` (HTTP ${error.status})` : "";
      console.warn("admin ads: " + label + " failed", error);
      showToast(`${label} ذخیره نشد${status}: ${detail}`, "error");
    });
}

function saveAd(event) {
  event.preventDefault();
  const payload = readAdForm();
  if (!payload.title) {
    showToast("عنوان تبلیغ الزامی است.", "error");
    return;
  }

  const id = document.getElementById("adId").value;
  const previousAds = (appState.ads || []).map((ad) => ({ ...ad }));
  if (id) {
    const index = (appState.ads || []).findIndex(
      (a) => String(a.id) === String(id),
    );
    if (index !== -1) {
      appState.ads[index] = { ...appState.ads[index], ...payload };
      persistAdWrite(
        appApi.admin.ads.update(id, payload),
        "تبلیغ به‌روزرسانی شد.",
        "ویرایش تبلیغ",
        () => { appState.ads = previousAds; },
      );
    }
  } else {
    const created = {
      ...payload,
      id: "ad-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8),
      createdAt: Date.now(),
    };
    appState.ads.unshift(created);
    persistAdWrite(
      appApi.admin.ads.create(created),
      "تبلیغ جدید افزوده شد.",
      "افزودن تبلیغ",
      () => { appState.ads = previousAds; },
    );
  }

  renderAdsTable();
  closeModal("adFormModal");
}

function deleteAd(id) {
  const ad = (appState.ads || []).find((a) => String(a.id) === String(id));
  if (!ad) return;
  if (!confirm(`تبلیغ «${ad.title || "بدون عنوان"}» حذف شود؟`)) return;
  const previousAds = appState.ads.map((item) => ({ ...item }));
  appState.ads = appState.ads.filter((a) => String(a.id) !== String(id));
  persistAdWrite(
    appApi.admin.ads.remove(id),
    "تبلیغ حذف شد.",
    "حذف تبلیغ",
    () => { appState.ads = previousAds; },
  );
  renderAdsTable();
}

function toggleAd(id) {
  const ad = (appState.ads || []).find((a) => String(a.id) === String(id));
  if (!ad) return;
  const previousActive = ad.active;
  ad.active = ad.active === false ? true : false;
  persistAdWrite(
    appApi.admin.ads.update(id, { active: ad.active }),
    "وضعیت تبلیغ تغییر کرد.",
    "تغییر وضعیت تبلیغ",
    () => { ad.active = previousActive; },
  );
  renderAdsTable();
}

function initAdsAdmin() {
  const addBtn = document.getElementById("addAdBtn");
  if (addBtn) addBtn.addEventListener("click", () => openAdForm());

  const form = document.getElementById("adForm");
  if (form) form.addEventListener("submit", saveAd);

  const closeBtn = document.getElementById("adFormClose");
  if (closeBtn)
    closeBtn.addEventListener("click", () => closeModal("adFormModal"));

  // Image: a URL field plus an optional file picker that fills it with a data
  // URL, the same pattern the product form uses.
  const fileInput = document.getElementById("adImageFile");
  const urlInput = document.getElementById("adImage");
  const preview = document.getElementById("adImagePreview");
  if (fileInput && urlInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        urlInput.value = e.target.result;
        if (preview) {
          preview.src = e.target.result;
          preview.style.display = "";
        }
      };
      reader.readAsDataURL(file);
    });
  }
  if (urlInput && preview) {
    urlInput.addEventListener("input", () => {
      if (urlInput.value) {
        preview.src = urlInput.value;
        preview.style.display = "";
      } else {
        preview.style.display = "none";
      }
    });
  }

  // Delegate edit/delete/toggle from the table body, bound once.
  const tbody = document.getElementById("adsTableBody");
  if (tbody && tbody.dataset.adsBound !== "true") {
    tbody.dataset.adsBound = "true";
    tbody.addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-ad-edit]");
      if (editBtn) {
        openAdForm(editBtn.getAttribute("data-ad-edit"));
        return;
      }
      const delBtn = e.target.closest("[data-ad-delete]");
      if (delBtn) {
        deleteAd(delBtn.getAttribute("data-ad-delete"));
      }
    });
    tbody.addEventListener("change", (e) => {
      const toggle = e.target.closest("[data-ad-toggle]");
      if (toggle) toggleAd(toggle.getAttribute("data-ad-toggle"));
    });
  }

  renderAdsTable();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdsAdmin);
} else {
  initAdsAdmin();
}
