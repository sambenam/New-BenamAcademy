/**
 * Public header labels remain editable without changing link destinations.
 * Run with: node tests/header-labels.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const PUBLIC_PAGES = [
  "index.html",
  "about-us.html",
  "list-page.html",
  "sign-up.html",
  "single-post.html",
  "support.html",
  "user-profile.html",
];
const sharedScript = fs.readFileSync(
  path.join(ROOT, "scripts/header-labels.js"),
  "utf8",
);
const customMenuScript = fs.readFileSync(
  path.join(ROOT, "scripts/header-custom-menu.js"),
  "utf8",
);
const fieldsSource = sharedScript.match(/const FIELDS = \[([\s\S]*?)\n  \];/)[1];
const fieldKeys = Array.from(fieldsSource.matchAll(/key: "([^"]+)"/g), (m) => m[1]);
const defaults = Object.fromEntries(
  Array.from(fieldsSource.matchAll(/key: "([^"]+)"[^\n]*?value: "([^"]+)"/g), (m) => [m[1], m[2]]),
);

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  ✓ " + name);
  } catch (error) {
    console.error("  ✗ " + name + " -> " + error.message);
    process.exitCode = 1;
  }
}

console.log("\nPublic navigation integration");
for (const page of PUBLIC_PAGES) {
  const html = fs.readFileSync(path.join(ROOT, "html", page), "utf8");
  const dom = new JSDOM(html, {
    url: "https://example.test/html/" + page,
    runScripts: "outside-only",
  });
  const { window } = dom;
  const labels = { ...defaults, forStudents: "دانشجویان عزیز", diploma: "دیپلم و تخصص" };
  window.localStorage.setItem("benamacademyHeaderLabels", JSON.stringify(labels));
  window.eval(sharedScript);
  window.eval(customMenuScript);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

  check(page + " has matching desktop and mobile label keys", () => {
    const desktop = Array.from(window.document.querySelectorAll(".home-primary-nav [data-header-label]"));
    const mobile = Array.from(window.document.querySelectorAll(".mobile-header [data-header-label]"));
    assert(desktop.length > 0 && mobile.length > 0);
    assert.deepStrictEqual(
      Array.from(new Set([...desktop, ...mobile].map((el) => el.dataset.headerLabel))).sort(),
      [...fieldKeys].sort(),
    );
  });
  check(page + " applies renamed text in desktop and mobile", () => {
    const students = window.document.querySelectorAll('[data-header-label="forStudents"]');
    const diploma = window.document.querySelectorAll('[data-header-label="diploma"]');
    assert(students.length >= 2);
    assert(diploma.length >= 2);
    for (const el of students) assert(el.textContent.includes("دانشجویان عزیز"));
    for (const el of diploma) assert(el.textContent.includes("دیپلم و تخصص"));
  });
  check(page + " preserves category destinations", () => {
    assert.strictEqual(
      window.document.querySelector('.home-primary-nav [data-header-label="diploma"]').getAttribute("href"),
      "list-page.html?cat=diploma",
    );
    assert.strictEqual(
      window.document.querySelector('.mobile-header [data-header-label="diploma"]').getAttribute("href"),
      "list-page.html?cat=diploma",
    );
  });
  dom.window.close();
}

console.log("\nAdded menu items render in desktop and mobile through three levels");
{
  const html = fs.readFileSync(path.join(ROOT, "html/index.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "https://example.test/html/index.html",
    runScripts: "outside-only",
  });
  const { window } = dom;
  window.eval(sharedScript);
  window.eval(customMenuScript);
  const items = [
    { id: "custom-main", label: "منوی آزمایشی", href: "list-page.html?cat=custom", parentKey: "root" },
    { id: "custom-sub", label: "زیرمنوی آزمایشی", href: "list-page.html?cat=sub", parentKey: "custom-main" },
    { id: "custom-deep", label: "سطح سوم آزمایشی", href: "list-page.html?cat=deep", parentKey: "custom-sub" },
    { id: "custom-student", label: "آیتم دانشجویان", href: "list-page.html?cat=student-custom", parentKey: "forStudents" },
    { id: "custom-news", label: "زیرمنوی اخبار", href: "list-page.html?cat=news-custom", parentKey: "news" },
    { id: "custom-diploma", label: "زیرمنوی دیپلم", href: "list-page.html?cat=diploma-custom", parentKey: "diploma" },
  ];
  window.BenamCustomHeaderMenu.save(items);

  check("custom root appears in desktop and mobile", () => {
    assert.strictEqual(window.document.querySelector('.home-primary-nav .custom-primary-menu > a').textContent, "منوی آزمایشی");
    assert.strictEqual(window.document.querySelector('.mobile-header .custom-mobile-root > .custom-mobile-root-row a').textContent, "منوی آزمایشی");
  });
  check("third-level item is rendered and keeps its link destination", () => {
    const desktop = window.document.querySelector('.custom-nav-entry__link[href="list-page.html?cat=deep"]');
    const mobile = window.document.querySelector('.custom-mobile-node__link[href="list-page.html?cat=deep"]');
    assert(desktop && mobile);
    assert.strictEqual(desktop.textContent, "سطح سوم آزمایشی");
  });
  check("custom item can be added under an existing menu", () => {
    assert(window.document.querySelector('.home-primary-nav [data-header-label="forStudents"] ~ .home-nav_dropdown .custom-menu-injection a[href="list-page.html?cat=student-custom"]'));
    assert(window.document.querySelector('.mobile-header [data-header-label="forStudents"] ~ .mobile-dropdown-menu a[href="list-page.html?cat=student-custom"]'));
    const desktopDiploma = window.document.querySelector('.home-primary-nav [data-header-label="diploma"]').closest('.custom-nav-existing-parent');
    assert(desktopDiploma.querySelector('.custom-nav-submenu a[href="list-page.html?cat=diploma-custom"]'));
    const mobileDiploma = window.document.querySelector('.mobile-header [data-header-label="diploma"]').closest('.mobile-sub-dropdown');
    assert(mobileDiploma.querySelector('.mobile-sub_menu a[href="list-page.html?cat=diploma-custom"]'));
  });
  check("existing root destination remains unchanged after adding a submenu", () => {
    assert.strictEqual(window.document.querySelector('.home-primary-nav [data-header-label="news"]').getAttribute("href"), "list-page.html?cat=exams");
    assert.strictEqual(window.document.querySelector('.mobile-header [data-header-label="news"]').getAttribute("href"), "list-page.html?cat=exams");
    const desktopNews = window.document.querySelector('.home-primary-nav [data-header-label="news"]');
    assert(desktopNews.closest('.home-nav_item').querySelector('.home-nav_dropdown a[href="list-page.html?cat=news-custom"]'));
    const newsMenu = window.document.querySelector('.mobile-header [data-header-label="news"]').closest('.mobile-dropdown');
    assert(newsMenu.querySelector('.mobile-dropdown-menu a[href="list-page.html?cat=news-custom"]'));
  });
  check("unsafe script URLs are rejected", () => {
    assert.throws(() => window.BenamCustomHeaderMenu.save([
      { id: "bad-link", label: "خطر", href: "javascript:alert(1)", parentKey: "root" },
    ]));
  });
  dom.window.close();
}

console.log("\nAdmin editor integration");
{
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "https://example.test/html/admin.html",
    runScripts: "outside-only",
  });
  const { window } = dom;
  window.eval(sharedScript);
  window.eval(customMenuScript);
  window.eval(fs.readFileSync(path.join(ROOT, "scripts/admin/header-menu.js"), "utf8"));
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

  check("editor route and save/reset controls are present", () => {
    assert(window.document.querySelector('[data-view="header-menu"]'));
    assert(window.document.getElementById("view-header-menu"));
    assert(window.document.getElementById("headerLabelsForm"));
    assert(window.document.getElementById("resetHeaderLabelsBtn"));
  });
  check("editor presents exactly the four header groups", () => {
    const groups = Array.from(window.document.querySelectorAll(".header-label-editor__group h2"), (h) => h.textContent.trim());
    assert.deepStrictEqual(groups, ["منوهای اصلی", "برای دانشجویان", "دوره‌ها", "قوانین و مقررات"]);
    assert.strictEqual(window.document.querySelectorAll("#headerLabelFields input").length, fieldKeys.length);
  });
  check("custom item form adds a main menu and nested items through level three", () => {
    const addForm = window.document.getElementById("addHeaderCustomItemForm");
    const add = (label, parentKey, href) => {
      addForm.elements.namedItem("customMenuLabel").value = label;
      addForm.elements.namedItem("customMenuHref").value = href;
      addForm.elements.namedItem("customMenuParent").value = parentKey;
      addForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      return window.BenamCustomHeaderMenu.read().find((item) => item.label === label);
    };
    const main = add("منوی تازه", "root", "list-page.html?cat=fresh");
    const second = add("زیرمنوی تازه", main.id, "list-page.html?cat=fresh-sub");
    const third = add("سطح سوم تازه", second.id, "list-page.html?cat=fresh-deep");
    assert(main && second && third);
    assert.deepStrictEqual([main.parentKey, second.parentKey, third.parentKey], ["root", main.id, second.id]);
    assert(!Array.from(window.document.getElementById("customMenuParent").options).some((option) => option.value === third.id));
    const thirdLabel = window.document.querySelector(`#headerCustomItems [data-custom-field="label"][data-id="${third.id}"]`);
    assert(thirdLabel);
    thirdLabel.value = "ویرایش سطح سوم";
    window.document.querySelector(`[data-custom-action="save"][data-id="${third.id}"]`).click();
    assert.strictEqual(window.BenamCustomHeaderMenu.read().find((item) => item.id === third.id).label, "ویرایش سطح سوم");
    window.document.querySelector(`[data-custom-action="delete"][data-id="${second.id}"]`).click();
    assert.deepStrictEqual(Array.from(window.BenamCustomHeaderMenu.read(), (item) => item.id), [main.id]);
  });
  check("saving updates labels locally and reset restores defaults", () => {
    window.document.querySelector('#headerLabelFields input[name="diploma"]').value = "متن جدید دیپلم";
    window.document.getElementById("headerLabelsForm").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
    assert.strictEqual(window.BenamHeaderLabels.read().diploma, "متن جدید دیپلم");
    window.document.getElementById("resetHeaderLabelsBtn").click();
    assert.strictEqual(window.BenamHeaderLabels.read().diploma, defaults.diploma);
  });
  dom.window.close();
}

if (!process.exitCode) console.log(`\n✅ ${passed} assertions passed`);
