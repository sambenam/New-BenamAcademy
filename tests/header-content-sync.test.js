/**
 * Custom header destinations are live categories in the site-content admin.
 * Run with: node tests/header-content-sync.test.js
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { ROOT, adminScripts, pageScripts } = require("./helpers/page-scripts.js");

let passed = 0;
let failed = 0;
function test(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log("  ✓ " + name);
  } else {
    failed += 1;
    console.log("  ✗ " + name + (detail ? " -> " + detail : ""));
  }
}

const initialHeaderItems = [
  { id: "custom-tax-menu", kind: "menu", label: "مالیات تازه", href: "list-page.html?cat=custom-tax", parentKey: "root" },
  { id: "custom-tax-group", kind: "group", label: "موضوعات مالیات", href: "", parentKey: "custom-tax-menu" },
  { id: "custom-tax-return", kind: "link", label: "اظهارنامه", href: "list-page.html?cat=custom-tax-return", parentKey: "custom-tax-group" },
  { id: "custom-student-tax", kind: "link", label: "مالیات بر درآمد", href: "list-page.html?cat=custom-student-tax", parentKey: "studentsBooks" },
];

function boot() {
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/admin.html#site-content",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.scrollTo = () => {};
  const store = {
    benamacademyHeaderCustomItems: JSON.stringify(initialHeaderItems),
    benamacademyAddedItems: JSON.stringify([
      { id: "existing-custom-student-item", title: "مقالهٔ مالیات", categoryKey: "custom-student-tax", excerpt: "خلاصه" },
    ]),
    benamacademySession: JSON.stringify({
      token: "test",
      isAdmin: true,
      user: { id: 1, name: "مدیر", email: "manager@example.test", role: "مدیر سایت" },
    }),
  };
  Object.defineProperty(w, "localStorage", {
    value: {
      getItem: (key) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: (key) => { delete store[key]; },
    },
    configurable: true,
  });
  Object.defineProperty(w, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });
  w.appApi = {
    auth: { logout: async () => {} },
    content: { update: async () => ({}), remove: async () => ({}) },
    admin: {
      users: { list: async () => [] },
      products: { list: async () => [], create: async () => ({}), update: async () => ({}), remove: async () => ({}) },
      orders: { list: async () => [] },
      messages: { list: async () => [] },
      settings: { get: async () => ({}), save: async () => ({}) },
    },
  };
  const sources = adminScripts().map((file) => fs.readFileSync(path.join(ROOT, "scripts", file), "utf8"));
  sources.push(`window.__testApi = {
    get siteData() { return siteData; },
    getGroups: getContentCategoryGroups,
    findSiteItem,
    saveAddedItem,
    applyContentOverrides,
    populateCategorySelect,
    renderContentTable,
  };`);
  w.eval(sources.join("\n;\n"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  w.confirm = () => true;
  w.showToast = () => {};
  return { dom, w, store };
}

const { dom, w, store } = boot();
const keyForStudentItem = "custom-student-tax";
const studentCategory = w.__testApi.siteData[keyForStudentItem];

test("custom header link creates a category in siteData", !!studentCategory);
test("custom category title follows its header label", studentCategory && studentCategory.title === "مالیات بر درآمد", studentCategory && studentCategory.title);
test("saved content is loaded into the custom category", studentCategory && studentCategory.items.some((item) => item.id === "existing-custom-student-item"));

const groups = w.__testApi.getGroups({ includeCustom: true, includeFallback: true });
const studentsGroup = groups.find((group) => group.id === "group-students");
const customMenuGroup = groups.find((group) => group.id === "group-custom-header-custom-tax-menu");
test("custom student category appears under the students header group", studentsGroup && studentsGroup.categories.includes(keyForStudentItem));
test("custom main menu gets its own content group", !!customMenuGroup);
test("custom main-menu destination and descendants appear in that group", customMenuGroup && ["custom-tax", "custom-tax-return"].every((key) => customMenuGroup.categories.includes(key)));

w.__testApi.populateCategorySelect();
const select = w.document.getElementById("newItemCategory");
test("custom header category can be selected for new content", !!select.querySelector('option[value="custom-student-tax"]'));

w.__testApi.renderContentTable();
const contentTable = w.document.getElementById("groupedContentContainer");
test("custom category and its content appear in the content manager", contentTable.textContent.includes("مالیات بر درآمد") && contentTable.textContent.includes("مقالهٔ مالیات"));

const beforeEditHref = w.BenamCustomHeaderMenu.read().find((item) => item.id === "custom-student-tax").href;
const updatedItems = w.BenamCustomHeaderMenu.read();
updatedItems.find((item) => item.id === "custom-student-tax").label = "مالیات حقوق";
w.BenamCustomHeaderMenu.save(updatedItems);
test("renaming the header label updates the content category title", w.__testApi.siteData[keyForStudentItem].title === "مالیات حقوق");
test("renaming keeps the generated category destination stable", w.BenamCustomHeaderMenu.read().find((item) => item.id === "custom-student-tax").href === beforeEditHref);

const nextItems = w.BenamCustomHeaderMenu.read();
nextItems.push({ id: "custom-student-extra", kind: "link", label: "مالیات تکمیلی", href: "list-page.html?cat=custom-student-extra", parentKey: "studentsBooks" });
w.BenamCustomHeaderMenu.save(nextItems);
test("new header destinations sync immediately without reloading", !!w.__testApi.siteData["custom-student-extra"]);
test("new category is immediately available in the add-content selector", !!select.querySelector('option[value="custom-student-extra"]'));

w.__testApi.saveAddedItem({ id: "new-custom-article", title: "راهنمای مالیات تکمیلی", categoryKey: "custom-student-extra", excerpt: "مطلب تازه" });
w.__testApi.applyContentOverrides(w.__testApi.siteData);
test("admin can save a content item into the new header category", w.__testApi.findSiteItem("new-custom-article")?.categoryKey === "custom-student-extra");

const publicHtml = fs.readFileSync(path.join(ROOT, "html/list-page.html"), "utf8");
const publicDom = new JSDOM(publicHtml, {
  url: "http://localhost/html/list-page.html?cat=custom-student-extra",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const publicWindow = publicDom.window;
Object.defineProperty(publicWindow, "localStorage", {
  value: {
    getItem: (key) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  },
  configurable: true,
});
Object.defineProperty(publicWindow, "console", {
  value: { log() {}, warn() {}, error: console.error },
  configurable: true,
});
const publicSources = pageScripts("list-page.html").map((file) => fs.readFileSync(path.join(ROOT, "scripts", file), "utf8"));
publicWindow.eval(publicSources.join("\n;\n"));
test("public category page resolves the generated header destination", publicWindow.document.getElementById("page-title").textContent === "مالیات تکمیلی");
test("content added in admin appears on the generated header destination", publicWindow.document.getElementById("posts-list").textContent.includes("راهنمای مالیات تکمیلی"));

const withoutExtraDestination = w.BenamCustomHeaderMenu.read().filter((item) => item.id !== "custom-student-extra");
w.BenamCustomHeaderMenu.save(withoutExtraDestination);
test("removing a header link preserves its existing content category", !!w.__testApi.siteData["custom-student-extra"] && w.__testApi.siteData["custom-student-extra"].items.some((item) => item.id === "new-custom-article"));
const activeGroupsAfterRemoval = w.__testApi.getGroups({ includeCustom: true, includeFallback: false });
test("removed header destination is no longer offered as an active menu category", !activeGroupsAfterRemoval.some((group) => group.categories.includes("custom-student-extra")));

console.log(`\n${passed} passed, ${failed} failed`);
setTimeout(() => {
  dom.window.close();
  publicDom.window.close();
}, 50);
if (failed) process.exit(1);
