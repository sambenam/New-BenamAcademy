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
    { id: "custom-student-group", kind: "group", label: "عنوان افزوده دانشجویان", href: "", parentKey: "forStudents" },
    { id: "custom-student-group-link", kind: "link", label: "آیتم عنوان افزوده", href: "list-page.html?cat=student-group-item", parentKey: "custom-student-group" }
  ];
  window.BenamCustomHeaderMenu.save(items);

  check("custom root appears in desktop and mobile", () => {
    assert.strictEqual(window.document.querySelector('.home-primary-nav .custom-primary-menu > a').textContent, "منوی آزمایشی");
    assert.strictEqual(window.document.querySelector('.mobile-header .custom-mobile-root > .custom-mobile-root-row a').textContent, "منوی آزمایشی");
    const desktopOrder = Array.from(window.document.querySelector('.home-primary-nav').children);
    const aboutLink = window.document.querySelector('.home-primary-nav [data-header-label="aboutUs"]');
    const aboutDesktop = aboutLink.closest('.home-nav_item') || aboutLink;
    const customMain = window.document.querySelector('.home-primary-nav .custom-primary-menu');
    const regulationsLink = window.document.querySelector('.home-primary-nav [data-header-label="regulations"]');
    const newsLink = window.document.querySelector('.home-primary-nav [data-header-label="news"]');
    const newsDesktop = newsLink.closest('.home-nav_item') || newsLink;
    assert(desktopOrder.indexOf(customMain) > desktopOrder.indexOf(regulationsLink.closest('.home-nav_item')));
    assert(desktopOrder.indexOf(customMain) < desktopOrder.indexOf(newsDesktop));
    assert(desktopOrder.indexOf(customMain) < desktopOrder.indexOf(aboutDesktop));
    const mobileOrder = Array.from(window.document.querySelector('.mobile-header .mobile-menu_list').children);
    const customMobileMain = window.document.querySelector('.mobile-header .custom-mobile-root');
    const mobileRegulations = window.document.querySelector('.mobile-header [data-header-label="regulations"]').closest('.mobile-dropdown');
    const mobileNews = window.document.querySelector('.mobile-header [data-header-label="news"]').closest('.mobile-dropdown');
    assert(mobileOrder.indexOf(customMobileMain) > mobileOrder.indexOf(mobileRegulations));
    assert(mobileOrder.indexOf(customMobileMain) < mobileOrder.indexOf(mobileNews));
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
  check("custom title groups and their links render on both layouts", () => {
    const heading = Array.from(window.document.querySelectorAll('.home-primary-nav .home-nav_dropdown strong')).find((node) => node.textContent === "عنوان افزوده دانشجویان");
    assert(heading);
    const groupSection = heading.closest("section");
    const studentsDropdown = window.document.querySelector('.home-primary-nav [data-header-label="forStudents"] ~ .home-nav_dropdown');
    assert.strictEqual(groupSection.parentElement, studentsDropdown);
    const existingProjectHeading = studentsDropdown.querySelector('strong[data-header-label="studentsProjects"]');
    assert(Array.from(studentsDropdown.children).indexOf(groupSection) > Array.from(studentsDropdown.children).indexOf(existingProjectHeading.closest("section")));
    assert(groupSection.querySelector('a[href="list-page.html?cat=student-group-item"]'));
    const mobileTitle = Array.from(window.document.querySelectorAll('.mobile-header .custom-mobile-node strong')).find((node) => node.textContent === "عنوان افزوده دانشجویان");
    assert(mobileTitle);
    assert(mobileTitle.closest("li").querySelector('a[href="list-page.html?cat=student-group-item"]'));
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
  check("deleting a static title/root hides its descendants and can be restored", () => {
    window.BenamCustomHeaderMenu.hideStatic("studentsBooks");
    const staticBookGroup = window.document.querySelector('.home-primary-nav strong[data-header-label="studentsBooks"]').closest("section");
    assert.strictEqual(staticBookGroup.hidden, true);
    assert.strictEqual(window.document.querySelector('.mobile-header [data-header-label="diploma"]').closest(".mobile-sub-dropdown").hidden, true);
    window.BenamCustomHeaderMenu.restoreStructure();
    window.BenamCustomHeaderMenu.hideStatic("forStudents");
    assert.strictEqual(window.document.querySelector('.home-primary-nav [data-header-label="forStudents"]').closest(".home-nav_item").hidden, true);
    assert.strictEqual(window.document.querySelector('.mobile-header [data-header-label="forStudents"]').closest(".mobile-dropdown").hidden, true);
    window.BenamCustomHeaderMenu.restoreStructure();
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
  window.confirm = () => true;
  window.eval(sharedScript);
  window.eval(customMenuScript);
  window.eval(fs.readFileSync(path.join(ROOT, "scripts/admin/header-menu.js"), "utf8"));
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

  check("editor route and save/reset controls are present", () => {
    assert(window.document.querySelector('[data-view="header-menu"]'));
    assert(window.document.getElementById("view-header-menu"));
    assert(window.document.getElementById("headerLabelsForm"));
    assert(window.document.getElementById("resetHeaderLabelsBtn"));
    assert(window.document.getElementById("customMenuHref") === null);
    assert(window.document.getElementById("customMenuParent").options[0].textContent.includes("بعد از قوانین و مقررات"));
  });
  check("editor presents exactly the four header groups", () => {
    const groups = Array.from(window.document.querySelectorAll(".header-label-editor__group h2"), (h) => h.textContent.trim());
    assert.deepStrictEqual(groups, ["منوهای اصلی", "برای دانشجویان:", "دوره‌ها:", "قوانین و مقررات:"]);
    assert.strictEqual(window.document.querySelectorAll("#headerLabelFields input").length, fieldKeys.length);
    const studentSubgroups = Array.from(window.document.querySelectorAll(".header-label-editor__group:nth-of-type(2) .header-label-editor__subgroup-title label"), (label) => label.textContent.trim());
    assert.deepStrictEqual(studentSubgroups, ["عنوان زیرگروه اول:", "عنوان زیرگروه دوم:", "عنوان زیرگروه سوم:"]);
    const firstSubgroupKeys = Array.from(window.document.querySelectorAll(".header-label-editor__group:nth-of-type(2) .header-label-editor__subgroup:nth-of-type(1) .header-label-editor__fields input"), (input) => input.name);
    assert.deepStrictEqual(firstSubgroupKeys, ["diploma", "associate_degree", "bachelor", "master", "phd"]);
  });
  check("custom item form adds a main menu and nested items through level three", () => {
    const addForm = window.document.getElementById("addHeaderCustomItemForm");
    const add = (label, parentKey) => {
      addForm.elements.namedItem("customMenuLabel").value = label;
      addForm.elements.namedItem("customMenuParent").value = parentKey;
      addForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      return window.BenamCustomHeaderMenu.read().find((item) => item.label === label);
    };
    const main = add("منوی تازه", "root");
    const second = add("زیرمنوی تازه", main.id);
    const third = add("سطح سوم تازه", second.id);
    assert(main && second && third);
    const mainPanel = window.document.querySelector(`#view-header-menu [data-custom-id="${main.id}"]`);
    assert(mainPanel.classList.contains("header-label-editor__group"));
    assert(mainPanel.textContent.includes("مقصد دسته"));
    assert.strictEqual(window.document.querySelector('#view-header-menu input[data-custom-field="href"]'), null);
    assert.deepStrictEqual([main.parentKey, second.parentKey, third.parentKey], ["root", main.id, second.id]);
    assert.strictEqual(new URL(main.href, window.location.href).searchParams.get("cat"), "custom-منوی-تازه");
    assert(!Array.from(window.document.getElementById("customMenuParent").options).some((option) => option.value === third.id));
    const thirdHref = third.href;
    const thirdLabel = window.document.querySelector(`#view-header-menu [data-custom-field="label"][data-id="${third.id}"]`);
    assert(thirdLabel);
    thirdLabel.value = "ویرایش سطح سوم";
    window.document.getElementById("headerLabelsForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    const renamedThird = window.BenamCustomHeaderMenu.read().find((item) => item.id === third.id);
    assert.strictEqual(renamedThird.label, "ویرایش سطح سوم");
    assert.strictEqual(renamedThird.href, thirdHref);
    window.document.querySelector(`[data-custom-action="delete"][data-id="${second.id}"]`).click();
    assert.deepStrictEqual(Array.from(window.BenamCustomHeaderMenu.read(), (item) => item.id), [main.id]);

    const studentTitle = add("عنوان چهارم دانشجویان", "forStudents");
    const studentLink = add("آیتم زیر عنوان چهارم", studentTitle.id);
    assert.strictEqual(studentTitle.kind, "group");
    assert.strictEqual(studentTitle.href, "");
    assert.strictEqual(studentLink.kind, "link");
    const studentTitleSection = window.document.querySelector(`#view-header-menu [data-custom-id="${studentTitle.id}"]`);
    assert.strictEqual(studentTitleSection.className, "header-label-editor__subgroup");
    assert(studentTitleSection.querySelector(`[data-custom-field="label"][data-id="${studentTitle.id}"]`));
    assert.strictEqual(studentTitleSection.querySelector(".header-label-editor__subgroup-title label").textContent.trim(), "عنوان زیرگروه چهارم:");
    const studentSection = window.document.querySelector('#headerLabelFields [data-header-section="forStudents"]');
    assert.strictEqual(studentSection.querySelectorAll('.header-label-editor__subgroup:not(.header-label-editor__subgroup--mobile)').length, 4);
    assert(studentTitleSection.textContent.includes("محل قرارگیری"));
    assert(studentSection.querySelector(`[data-custom-field="label"][data-id="${studentLink.id}"]`));
    const nextStudentTitle = add("عنوان پنجم دانشجویان", "forStudents");
    const nextStudentTitleSection = window.document.querySelector(`#view-header-menu [data-custom-id="${nextStudentTitle.id}"]`);
    assert.strictEqual(nextStudentTitleSection.querySelector(".header-label-editor__subgroup-title label").textContent.trim(), "عنوان زیرگروه پنجم:");
    window.document.querySelector(`[data-custom-action="delete"][data-id="${nextStudentTitle.id}"]`).click();
    window.document.querySelector(`[data-custom-action="delete"][data-id="${studentTitle.id}"]`).click();
    assert(!window.BenamCustomHeaderMenu.read().some((item) => item.id === studentTitle.id || item.id === studentLink.id));

    window.document.querySelector('[data-static-delete="studentsBooks"]').click();
    assert(window.BenamCustomHeaderMenu.isHidden("studentsBooks"));
    assert(window.BenamCustomHeaderMenu.isHidden("diploma"));
    assert.strictEqual(window.document.querySelector('#headerLabelFields [name="studentsBooks"]'), null);
    window.document.querySelector('#headerLabelFields [name="courses"]').value = "دوره‌های ویرایش‌شده";
    window.document.getElementById("headerLabelsForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    assert.strictEqual(window.BenamHeaderLabels.read().studentsBooks, defaults.studentsBooks);
    window.document.getElementById("restoreHeaderStructureBtn").click();
    assert(!window.BenamCustomHeaderMenu.isHidden("studentsBooks"));
    assert(window.document.querySelector('#headerLabelFields [name="studentsBooks"]'));

    window.document.querySelector('[data-static-delete="forStudents"]').click();
    assert(window.BenamCustomHeaderMenu.isHidden("forStudents"));
    assert.strictEqual(window.document.querySelector('[data-header-section="forStudents"]'), null);
    window.document.getElementById("restoreHeaderStructureBtn").click();
    assert(!window.BenamCustomHeaderMenu.isHidden("forStudents"));
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
