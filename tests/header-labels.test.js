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

console.log("\nAdmin editor integration");
{
  const html = fs.readFileSync(path.join(ROOT, "html/admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "https://example.test/html/admin.html",
    runScripts: "outside-only",
  });
  const { window } = dom;
  window.eval(sharedScript);
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
