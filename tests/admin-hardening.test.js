/**
 * Regression coverage for admin rendering, notification batching and search actions.
 * Run with: node tests/admin-hardening.test.js
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { ROOT, bundleSource } = require("./helpers/page-scripts.js");

let passed = 0;
let failed = 0;
function t(name, condition, detail) {
  if (condition) {
    passed++;
    console.log("  ✓ " + name);
  } else {
    failed++;
    console.log("  ✗ " + name + (detail ? " -> " + detail : ""));
  }
}
function section(name) {
  console.log("\n" + name);
}

const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
const dom = new JSDOM(html, {
  url: "http://localhost/html/admin.html",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
const storage = {
  benamacademyAnnouncedEvents: JSON.stringify({
    orders: Array.from({ length: 620 }, (_, index) => String(index + 1)),
    users: [],
    reports: [],
  }),
};
window.fetch = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/json" },
  json: async () => [],
});
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value); },
    removeItem: (key) => { delete storage[key]; },
  },
  configurable: true,
});
window.scrollTo = () => {};
window.confirm = () => true;
window.alert = () => {};
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
const bridge = `
window.__hardening = {
  state: appState,
  setManager() { currentAdminUserRole = "manager"; },
  renderNotificationDropdownItems,
  renderNotificationsPage,
  openNotificationDetails,
  showToast,
  renderDashboardOrders,
  renderUsersTable,
  renderProductsTable,
  renderOrdersTable,
  initTables,
  refreshAllViews,
  switchView,
  reconcileNotifications,
  renderGlobalSearch,
  getAnnouncedEvents() { return announcedEvents; },
  replaceRenderers(users, products, orders, messages) {
    renderUsersTable = users;
    renderProductsTable = products;
    renderOrdersTable = orders;
    renderMessages = messages;
  },
};`;
window.eval(bundleSource("admin.html", { append: bridge }));
window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
const doc = window.document;
const api = window.__hardening;

section("HTML injection is rendered as text");
api.setManager();
const attack = '<img src=x onerror="window.__xss=1"><svg onload="window.__xss=2">';
const note = {
  id: "notice-<img>",
  type: "report",
  theme: "red",
  title: attack,
  desc: attack,
  time: attack,
  createdAt: Date.now(),
  unread: true,
  details: { "شرح": attack, "گزارش‌دهنده": attack },
};
api.state.notifications = [note];
api.renderNotificationDropdownItems();
api.renderNotificationsPage();
api.switchView("dashboard");
t("dropdown has no injected image or SVG", !doc.querySelector("#notifListContainer img, #notifListContainer svg"));
t("notification page has no injected element", !doc.querySelector("#notificationsPageList img, #notificationsPageList svg"));
t("notification list has no inline click code", ![...doc.querySelectorAll("#notifListContainer [onclick], #notificationsPageList [onclick]")].length);
api.openNotificationDetails(note);
t("detail content contains no injected elements", !doc.querySelector("#notifDetailDynamic img, #notifDetailDynamic svg"));
t("detail text preserves the submitted text", doc.getElementById("notifDetailDynamic").textContent.includes(attack));
api.openNotificationDetails({ type: "report", title: "گزارش", details: { "شناسه گزارش": "r-1", "لینک شواهد": "javascript:window.__xss=77" } });
t("unsafe evidence schemes are not made clickable", ![...doc.querySelectorAll("#notifDetailDynamic a")].some((link) => link.href.startsWith("javascript:")));
api.openNotificationDetails({ type: "report", title: "گزارش", details: { "شناسه گزارش": "r-2", "لینک شواهد": "https://example.test/evidence" } });
t("valid evidence links retain safe new-tab behavior", doc.querySelector('#notifDetailDynamic a[href="https://example.test/evidence"]')?.rel.includes("noopener"));
api.showToast(attack, "success");
t("toast uses text, not injected markup", !doc.querySelector("#toastContainer img, #toastContainer svg") && doc.querySelector("#toastContainer span")?.textContent === attack);

section("dashboard and table values are escaped");
api.state.orders = [{ id: attack, customer: attack, product: attack, amount: 123, status: attack }];
api.renderDashboardOrders();
t("dashboard order values do not create markup", !doc.querySelector("#dashboardOrdersTable img, #dashboardOrdersTable svg"));
api.state.users = [{ id: "unsafe", name: "Safe", email: attack, phone: "123", role: "کاربر عادی", status: attack }];
api.renderUsersTable();
t("user email and status do not create markup", !doc.querySelector("#usersManageTable img, #usersManageTable svg"));
t("user email is displayed literally", doc.querySelector("#usersManageTable tbody")?.textContent.includes(attack));

section("heavy hidden views are deferred");
let usersRendered = 0;
let productsRendered = 0;
let ordersRendered = 0;
let messagesRendered = 0;
api.replaceRenderers(
  () => usersRendered++,
  () => productsRendered++,
  () => ordersRendered++,
  () => messagesRendered++,
);
api.switchView("dashboard");
api.initTables();
api.refreshAllViews();
t("dashboard startup skips hidden user/product/order/message tables", usersRendered === 0 && productsRendered === 0 && ordersRendered === 0 && messagesRendered === 0);
api.switchView("users");
t("users table renders when its tab is opened", usersRendered === 1);
api.switchView("products");
t("products table renders when its tab is opened", productsRendered === 1);
api.switchView("orders");
t("orders table renders when its tab is opened", ordersRendered === 1);
api.switchView("messages");
t("messages render when their tab is opened", messagesRendered === 1);

section("notification ledger and search action safety");
t("ledger is no longer truncated to the last 500 IDs", !/slice\(-500\)/.test(fs.readFileSync(path.join(ROOT, "scripts/admin/notifications.js"), "utf8")));
api.state.notifications = [];
api.state.users = [];
api.state.orders = Array.from({ length: 620 }, (_, index) => ({ id: String(index + 1), status: "success" }));
api.reconcileNotifications();
t("events beyond the former 500-ID limit are still recognized", api.state.notifications.length === 0);
const searchSource = fs.readFileSync(path.join(ROOT, "scripts/admin/search.js"), "utf8");
t("global search no longer evaluates generated code", !/window\.eval\s*\(\s*action\s*\)/.test(searchSource));
const maliciousId = `x');window.__xss=99;//`;
api.state.users = [{ id: maliciousId, name: "Needle user", email: "n@example.test", role: "کاربر عادی", status: "فعال" }];
api.renderGlobalSearch("Needle user");
const maliciousResult = doc.querySelector('#globalSearchResults [data-action="editUser"]');
t("search result stores record ID as data, not executable markup", !!maliciousResult && !maliciousResult.hasAttribute("onclick") && maliciousResult.getAttribute("data-target-id") === maliciousId, doc.getElementById("globalSearchResults")?.textContent);
window.__xss = undefined;
maliciousResult?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

setTimeout(() => {
  t("malicious search ID is passed as data and cannot execute", window.__xss === undefined);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  dom.window.close();
}, 100);
