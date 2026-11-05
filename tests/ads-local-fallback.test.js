/**
 * Temporary local persistence for ad CRUD when the ads API is not installed.
 * Run with: node tests/ads-local-fallback.test.js
 */
const assert = require("node:assert/strict");

let fetchStatus = 404;
const storage = {
  benamacademyAds: JSON.stringify([
    { id: "ad-active", title: "فعال", active: true, pages: ["home"] },
    { id: "ad-off", title: "خاموش", active: false, pages: ["home"] },
  ]),
};
global.localStorage = {
  getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
  setItem(key, value) { storage[key] = String(value); },
  removeItem(key) { delete storage[key]; },
};
global.window = {
  APP_CONFIG: { apiBaseUrl: "https://ads-api.test", adsLocalFallback: true },
};
global.fetch = async () => ({
  ok: fetchStatus >= 200 && fetchStatus < 300,
  status: fetchStatus,
  headers: { get: () => "text/plain" },
  text: async () => "route unavailable",
});

const { appApi } = require("../scripts/api.js");
let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  passed++;
  console.log("  ✓ " + name);
}

(async () => {
  console.log("\nAPI unavailable: use this browser's saved ads");
  const adminList = await appApi.admin.ads.list();
  check("admin list loads local active and inactive ads", adminList.length === 2);
  const publicList = await appApi.ads.list();
  check("public list only returns active local ads", publicList.length === 1 && publicList[0].id === "ad-active");

  const created = await appApi.admin.ads.create({
    id: "ad-new",
    title: "آزمایشی",
    active: true,
    pages: ["home", "list"],
  });
  check("create reports that it used local storage", created._localOnly === true);
  check("created ad survives through localStorage", JSON.parse(storage.benamacademyAds).some((ad) => ad.id === "ad-new"));

  const updated = await appApi.admin.ads.update("ad-new", { title: "ویرایش‌شده", active: false });
  check("update persists locally", updated._localOnly && JSON.parse(storage.benamacademyAds).find((ad) => ad.id === "ad-new").title === "ویرایش‌شده");

  const removed = await appApi.admin.ads.remove("ad-new");
  check("delete persists locally", removed._localOnly && !JSON.parse(storage.benamacademyAds).some((ad) => ad.id === "ad-new"));

  console.log("\nDo not hide authentication errors");
  fetchStatus = 401;
  await assert.rejects(appApi.admin.ads.create({ id: "forbidden", title: "x" }), (error) => error.status === 401);
  check("401 is returned rather than silently stored locally", !JSON.parse(storage.benamacademyAds).some((ad) => ad.id === "forbidden"));

  console.log("\nFallback can be turned off");
  fetchStatus = 404;
  global.window.APP_CONFIG.adsLocalFallback = false;
  await assert.rejects(appApi.admin.ads.list(), (error) => error.status === 404);
  check("strict API mode respects adsLocalFallback=false", true);

  console.log(`\n${passed} passed, 0 failed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
