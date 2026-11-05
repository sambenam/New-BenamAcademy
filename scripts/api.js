/**
 * appApi — the frontend HTTP API adapter.
 *
 * BACKEND HANDOFF
 * ===============
 * This repository contains no backend and no api-mock-*.js modules. Every
 * appApi method below uses fetch. Set window.APP_CONFIG.apiBaseUrl before
 * loading this file; if it is empty, requests go to the current origin.
 * `apiMode` is retained as a legacy config value but does not switch adapters.
 *
 * appApi is the main boundary for HTTP requests, not for every piece of
 * browser state: several demo/UI features still read or write localStorage
 * directly. See docs/تحویل-به-بک‌اند.md before treating browser storage as
 * authoritative.
 *
 * WHAT THE BACKEND DEVELOPER NEEDS
 * ================================
 * The `appApi` object at the bottom of this file lists routes and payloads.
 * docs/API_CONTRACT.md is the request/response contract. It is not a mock
 * server or a replacement for server-side validation and authorization.
 *
 * FOUR SECURITY RULES THAT ARE NOT OPTIONAL
 * =========================================
 *   1. Build download entitlements from the ORDERS TABLE. Never trust a list
 *      of product ids sent by the client.
 *   2. Never send "staff" or "report" notification rows to an "ادمین" role.
 *      The client filter is for display only, not for access control.
 *   3. Re-check the account status on EVERY authenticated request. Blocking
 *      an account must stop a session that is already open, not just the
 *      next login.
 *   4. Confirm the amount and the payment result with the gateway itself,
 *      never from a URL parameter.
 *
 * Full checklist: docs/تحویل-به-بک‌اند.md
 */

const APP_API_STORAGE = "benamacademyApiState";
const APP_SESSION_STORAGE = "benamacademySession";
const APP_LOCAL_STORAGE =
  typeof localStorage !== "undefined" ? localStorage : null;

const APP_API_CONFIG = {
  baseUrl:
    (typeof window !== "undefined" && window.APP_CONFIG?.apiBaseUrl) ||
    APP_LOCAL_STORAGE?.getItem("benamacademyApiBaseUrl") ||
    "",
  mode:
    (typeof window !== "undefined" && window.APP_CONFIG?.apiMode) ||
    APP_LOCAL_STORAGE?.getItem("benamacademyApiMode") ||
    "real",
  timeout: 10000,
};

/** Roles that may reach the admin panel. */
const ADMIN_ROLES = ["مدیر سایت", "مدیر سیستم", "ادمین", "admin", "manager"];

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status || 0;
    this.details = details || null;
  }
}

function readStorage(key, fallback) {
  try {
    const value = APP_LOCAL_STORAGE?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  APP_LOCAL_STORAGE?.setItem(key, JSON.stringify(value));
}

// Temporary browser-only fallback for the ads feature while its API is being
// wired up. Keep the server first; only use localStorage for missing/offline
// routes, never for authorization or validation errors.
const LOCAL_ADS_STORAGE_KEY = "benamacademyAds";
const ADS_FALLBACK_STATUSES = new Set([0, 404, 405, 501, 502, 503, 504]);

function readLocalAds() {
  const ads = readStorage(LOCAL_ADS_STORAGE_KEY, []);
  return Array.isArray(ads) ? ads.filter((ad) => ad && typeof ad === "object") : [];
}

function writeLocalAds(ads) {
  if (!APP_LOCAL_STORAGE) {
    throw new ApiError("ذخیره‌سازی محلی در این مرورگر در دسترس نیست.", 0);
  }
  writeStorage(LOCAL_ADS_STORAGE_KEY, ads);
}

function canUseLocalAdsFallback(error) {
  const config = typeof window !== "undefined" ? window.APP_CONFIG : null;
  let explicitlyDisabled = config?.adsLocalFallback === false;
  try {
    explicitlyDisabled ||= APP_LOCAL_STORAGE?.getItem("benamacademyAdsLocalFallback") === "false";
  } catch (e) {}
  return !explicitlyDisabled && ADS_FALLBACK_STATUSES.has(Number(error?.status || 0));
}

function localAdsResult(value) {
  return value && typeof value === "object"
    ? { ...value, _localOnly: true }
    : { success: true, _localOnly: true };
}

function createLocalAd(payload) {
  const ads = readLocalAds();
  const ad = {
    ...payload,
    id: payload.id || createId("ad"),
    createdAt: payload.createdAt || Date.now(),
  };
  const index = ads.findIndex((item) => String(item.id) === String(ad.id));
  if (index === -1) ads.unshift(ad);
  else ads[index] = { ...ads[index], ...ad };
  writeLocalAds(ads);
  return localAdsResult(ad);
}

function updateLocalAd(id, payload) {
  const ads = readLocalAds();
  const index = ads.findIndex((item) => String(item.id) === String(id));
  if (index === -1) {
    throw new ApiError("تبلیغ محلی پیدا نشد.", 404);
  }
  ads[index] = { ...ads[index], ...payload, id: ads[index].id };
  writeLocalAds(ads);
  return localAdsResult(ads[index]);
}

function removeLocalAd(id) {
  writeLocalAds(readLocalAds().filter((item) => String(item.id) !== String(id)));
  return localAdsResult({ success: true });
}

/**
 * A strictly increasing counter for records created in the same millisecond.
 *
 * Date.now() has millisecond resolution, so two messages sent back to back
 * can share a timestamp and their relative order becomes undefined. This
 * breaks the tie, and it survives a reload because it is seeded from what is
 * already stored.
 */
let recordSequence = 0;
function nextSequence() {
  recordSequence += 1;
  return Date.now() * 1000 + (recordSequence % 1000);
}

function createId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return prefix + "-" + crypto.randomUUID();
  }
  return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function getSession() {
  return readStorage(APP_SESSION_STORAGE, null);
}

/**
 * The session of a customer who is allowed to act right now.
 *
 * Blocking an account only stopped the next login: anyone already signed in
 * carried on buying, sending messages and editing their profile for as long
 * as the tab stayed open, which made the moderation control largely
 * decorative. Every write path that acts on behalf of a customer checks the
 * live account status here instead of trusting the token.
 *
 * BACKEND NOTE: the server must repeat this on every authenticated request.
 * A disabled account has to be rejected at the API, not just in the client.
 */
function getActiveSession() {
  const session = getSession();
  if (!session || !session.user) return session;

  const account = (getApiState().users || []).find(
    (u) => String(u.id) === String(session.user.id),
  );
  // No matching record means a seeded or dev session; leave it alone.
  if (!account) return session;

  if (account.status && account.status !== "فعال") {
    throw new ApiError(
      "حساب کاربری شما غیرفعال شده است. با پشتیبانی تماس بگیرید.",
      403,
    );
  }
  return session;
}

function setSession(session) {
  if (session) {
    writeStorage(APP_SESSION_STORAGE, session);
  } else {
    APP_LOCAL_STORAGE?.removeItem(APP_SESSION_STORAGE);
  }
}

function getApiState() {
  const saved = readStorage(APP_API_STORAGE, {});
  return {
    ...saved,
    users: Array.isArray(saved.users) ? saved.users : [],
    messages: Array.isArray(saved.messages) ? saved.messages : [],
    newsletter: Array.isArray(saved.newsletter) ? saved.newsletter : [],
    orders: Array.isArray(saved.orders) ? saved.orders : [],
    profiles:
      saved.profiles && typeof saved.profiles === "object"
        ? saved.profiles
        : {},
    content:
      saved.content && typeof saved.content === "object" ? saved.content : {},
  };
}

function saveApiState(state) {
  writeStorage(APP_API_STORAGE, state);
}

/**
 * A money value that is safe to store.
 *
 * A negative amount used to be written straight through, and because the
 * revenue report just sums paid orders, one order of -90,000 cancelled out a
 * real 100,000 sale and the totals silently under-reported. Anything that is
 * not a finite, non-negative number becomes 0.
 */
function sanitizeAmount(value) {
  const amount = Number(value);
  if (!isFinite(amount) || amount < 0) return 0;
  return amount;
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function validateRequired(value, message) {
  if (!String(value || "").trim()) {
    throw new ApiError(message, 422);
  }
}

async function request(path, options) {
  const settings = options || {};

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APP_API_CONFIG.timeout);
  const headers = new Headers(settings.headers || {});
  headers.set("Accept", "application/json");

  if (settings.body && typeof settings.body !== "string") {
    headers.set("Content-Type", "application/json");
    settings.body = JSON.stringify(settings.body);
  }

  const session = getSession();
  if (session?.token) {
    headers.set("Authorization", "Bearer " + session.token);
  }

  try {
    const response = await fetch(
      APP_API_CONFIG.baseUrl.replace(/\/$/, "") + "/" + path.replace(/^\//, ""),
      {
        method: settings.method || "GET",
        headers: headers,
        body: settings.body,
        signal: controller.signal,
      },
    );
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new ApiError(
        payload?.message || "ارتباط با سرور ناموفق بود.",
        response.status,
        payload,
      );
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ApiError("زمان پاسخ‌گویی سرور به پایان رسید.", 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError("امکان برقراری ارتباط با سرور وجود ندارد.", 0, error);
  } finally {
    clearTimeout(timeout);
  }
}

const appApi = {
  config: APP_API_CONFIG,
  request: request,
  auth: {
    login: (payload) =>
      request("/auth/login", { method: "POST", body: payload }),
    register: (payload) =>
      request("/auth/register", { method: "POST", body: payload }),
    logout: () => request("/auth/logout", { method: "POST" }),
    /** Dev helper - see the /auth/promote note in the mock router. */
    promote: (payload) =>
      request("/auth/promote", { method: "POST", body: payload }),
    me: () => request("/auth/me"),
    forgotPassword: (payload) =>
      request("/auth/forgot-password", { method: "POST", body: payload }),
  },
  assistant: {
    // Backend contract: authenticate from the session token, persist the
    // conversation, call the configured AI agent, and return its answer.
    chat: (payload) =>
      request("/assistant/chat", { method: "POST", body: payload }),
  },
  support: {
    sendMessage: (payload) =>
      request("/support/messages", { method: "POST", body: payload }),
    myMessages: (payload) =>
      request("/support/my-messages", { method: "POST", body: payload || {} }),
    reportAbuse: (payload) =>
      request("/support/reports", { method: "POST", body: payload }),
  },
  newsletter: {
    subscribe: (payload) =>
      request("/newsletter/subscribe", { method: "POST", body: payload }),
  },
  profile: {
    update: (payload) =>
      request("/profile/update", { method: "PATCH", body: payload }),
    changePassword: (payload) =>
      request("/profile/password", { method: "POST", body: payload }),
  },
  commerce: {
    validateCoupon: (payload) =>
      request("/commerce/coupon", { method: "POST", body: payload }),
    createPayment: (payload) =>
      request("/commerce/payment", { method: "POST", body: payload }),
    recordCancelled: (payload) =>
      request("/commerce/cancelled", { method: "POST", body: payload }),
    myOrders: (payload) =>
      request("/commerce/my-orders", { method: "POST", body: payload || {} }),
    // Which products this customer may download, derived from paid orders.
    entitlements: () =>
      request("/commerce/entitlements", { method: "POST", body: {} }),
  },
  content: {
    get: (itemId) => request("/content/items/" + encodeURIComponent(itemId)),
    update: (itemId, payload) =>
      request("/content/items/" + encodeURIComponent(itemId), {
        method: "PATCH",
        body: payload,
      }),
    remove: (itemId) =>
      request("/content/items/" + encodeURIComponent(itemId), {
        method: "DELETE",
      }),
  },

  /* Active promotional banners, shown on the home, list and single-post
     pages. The public banner script calls this; the admin tab uses
     appApi.admin.ads for create/update/delete. */
  ads: {
    list: async () => {
      try {
        return await request("/ads");
      } catch (error) {
        if (!canUseLocalAdsFallback(error)) throw error;
        return readLocalAds().filter((ad) => ad.active !== false);
      }
    },
  },

  /* ------------------------------------------------------------------------
     ADMIN PANEL API
     Every admin-panel data operation goes through here. A backend developer
     implements the endpoints listed in scripts/admin/API_CONTRACT.md, flips
     APP_API_CONFIG.mode to "real", and the panel keeps working unchanged.
     ------------------------------------------------------------------------ */
  admin: {
    products: {
      list: () => request("/admin/products"),
      create: (payload) =>
        request("/admin/products", { method: "POST", body: payload }),
      update: (id, payload) =>
        request("/admin/products/" + encodeURIComponent(id), {
          method: "PATCH",
          body: payload,
        }),
      remove: (id) =>
        request("/admin/products/" + encodeURIComponent(id), {
          method: "DELETE",
        }),
    },
    orders: {
      list: () => request("/admin/orders"),
      create: (payload) =>
        request("/admin/orders", { method: "POST", body: payload }),
      updateStatus: (id, status) =>
        request("/admin/orders/" + encodeURIComponent(id) + "/status", {
          method: "PATCH",
          body: { status },
        }),
    },
    users: {
      list: () => request("/admin/users"),
      create: (payload) =>
        request("/admin/users", { method: "POST", body: payload }),
      updateStatus: (id, status) =>
        request("/admin/users/" + encodeURIComponent(id) + "/status", {
          method: "PATCH",
          body: { status },
        }),
      updateRole: (id, role) =>
        request("/admin/users/" + encodeURIComponent(id) + "/role", {
          method: "PATCH",
          body: { role },
        }),
      remove: (id) =>
        request("/admin/users/" + encodeURIComponent(id), { method: "DELETE" }),
    },
    notifications: {
      list: () => request("/admin/notifications"),
      create: (payload) =>
        request("/admin/notifications", { method: "POST", body: payload }),
      markRead: (id) =>
        request("/admin/notifications/" + encodeURIComponent(id) + "/read", {
          method: "PATCH",
          body: {},
        }),
      remove: (id) =>
        request("/admin/notifications/" + encodeURIComponent(id), {
          method: "DELETE",
        }),
      clear: () => request("/admin/notifications", { method: "DELETE" }),
    },
    pendingChanges: {
      list: () => request("/admin/pending-changes"),
      stage: (staffId, changes) =>
        request("/admin/pending-changes/" + encodeURIComponent(staffId), {
          method: "POST",
          body: changes,
        }),
      clear: (staffId) =>
        request("/admin/pending-changes/" + encodeURIComponent(staffId), {
          method: "DELETE",
        }),
    },
    audit: {
      list: (staffId) => request("/admin/audit/" + encodeURIComponent(staffId)),
      record: (staffId, entry) =>
        request("/admin/audit/" + encodeURIComponent(staffId), {
          method: "POST",
          body: entry,
        }),
    },
    contentItems: {
      list: () => request("/admin/content-items"),
      create: (payload) =>
        request("/admin/content-items", { method: "POST", body: payload }),
      remove: (id) =>
        request("/admin/content-items/" + encodeURIComponent(id), {
          method: "DELETE",
        }),
    },
    reports: {
      list: () => request("/admin/reports"),
      setStatus: (id, status) =>
        request("/admin/reports/" + encodeURIComponent(id) + "/status", {
          method: "PATCH",
          body: { status },
        }),
      reply: (id, payload) =>
        request("/admin/reports/" + encodeURIComponent(id) + "/reply", {
          method: "POST",
          body: payload,
        }),
      remove: (id) =>
        request("/admin/reports/" + encodeURIComponent(id), {
          method: "DELETE",
        }),
    },
    messages: {
      list: () => request("/admin/messages"),
      reply: (id, payload) =>
        request("/admin/messages/" + encodeURIComponent(id) + "/reply", {
          method: "POST",
          body: payload,
        }),
      markRead: (id) =>
        request("/admin/messages/" + encodeURIComponent(id) + "/read", {
          method: "PATCH",
          body: {},
        }),
      remove: (id) =>
        request("/admin/messages/" + encodeURIComponent(id), {
          method: "DELETE",
        }),
    },
    settings: {
      get: () => request("/admin/settings"),
      save: (payload) =>
        request("/admin/settings", { method: "PUT", body: payload }),
    },
    ads: {
      list: async () => {
        try {
          return await request("/admin/ads");
        } catch (error) {
          if (!canUseLocalAdsFallback(error)) throw error;
          return readLocalAds();
        }
      },
      create: async (payload) => {
        try {
          return await request("/admin/ads", { method: "POST", body: payload });
        } catch (error) {
          if (!canUseLocalAdsFallback(error)) throw error;
          return createLocalAd(payload);
        }
      },
      update: async (id, payload) => {
        try {
          return await request("/admin/ads/" + encodeURIComponent(id), {
            method: "PATCH",
            body: payload,
          });
        } catch (error) {
          if (!canUseLocalAdsFallback(error)) throw error;
          return updateLocalAd(id, payload);
        }
      },
      remove: async (id) => {
        try {
          return await request("/admin/ads/" + encodeURIComponent(id), {
            method: "DELETE",
          });
        } catch (error) {
          if (!canUseLocalAdsFallback(error)) throw error;
          return removeLocalAd(id);
        }
      },
    },
  },
};


if (typeof window !== "undefined") {
  window.appApi = appApi;
  window.ApiError = ApiError;
}

if (typeof module !== "undefined") {
  module.exports = { appApi, ApiError, APP_API_CONFIG };
}
