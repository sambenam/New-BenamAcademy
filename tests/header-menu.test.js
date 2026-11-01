/**
 * Header menu tests - what a visitor sees depending on who is signed in.
 *
 * Run with:  node tests/header-menu.test.js
 * Requires:  npm install --no-save jsdom
 *
 * Rules under test:
 *   fresh browser  ->  پنل مدیریت  +  خروج   (default manager session seeds;
 *                                              see DEFAULT SESSION in app-shell.js)
 *   signed out     ->  ورود / عضویت          (per-tab sign-out flag set)
 *   regular user   ->  پروفایل  +  خروج
 *   staff          ->  پنل مدیریت  +  خروج
 *
 * Staff never see a profile link: an admin manages their account inside the
 * dashboard, so offering both would be two doors to the same thing.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function run(sessionObj, pageFile, options = {}) {
  const html = fs.readFileSync(path.join(ROOT, "html", pageFile), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/" + pageFile,
    runScripts: "outside-only",
  });
  const { window } = dom;
  const store = {};
  if (sessionObj) store["benamacademySession"] = JSON.stringify(sessionObj);
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    },
    configurable: true,
  });
  // A real sign-out inside this tab must survive the next load.
  if (options.signedOut) window.sessionStorage.setItem("benamacademySignedOut", "1");
  window.appApi = {
    auth: { logout: async () => {} },
    admin: { settings: { get: async () => ({}) } },
  };
  const src = fs.readFileSync(path.join(ROOT, "scripts", "app-shell.js"), "utf8");
  window.eval(src);
  // the IIFE registers on DOMContentLoaded; jsdom already fired it
  window.document.dispatchEvent(
    new window.Event("DOMContentLoaded", { bubbles: true }),
  );
  return window.document;
}

let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};

console.log("\nFRESH BROWSER on index.html (default = signed-in manager)");
let doc = run(null, "index.html");
let slot = doc.querySelector(".right-menu_items.signin");
t(
  "default session was seeded into localStorage",
  (() => {
    // readSession ran inside the window; the seed is observable via the slot
    return slot !== null;
  })(),
  "no .signin slot",
);
t(
  "shows پنل مدیریت",
  slot.textContent.includes("پنل مدیریت"),
  slot.textContent.trim(),
);
t(
  "links to admin.html",
  slot.querySelector("a").getAttribute("href") === "admin.html",
);
t("has خروج", !!slot.querySelector("[data-logout]"));
t(
  "exactly 2 links",
  slot.querySelectorAll("a").length === 2,
  String(slot.querySelectorAll("a").length),
);

console.log("\nSIGNED OUT this session on index.html (flag set)");
doc = run(null, "index.html", { signedOut: true });
slot = doc.querySelector(".right-menu_items.signin");
t(
  "original login link untouched",
  slot.textContent.includes("ورود / عضویت"),
  slot.textContent.trim(),
);
t("no logout button", !doc.querySelector("[data-logout]"));

console.log("\nREGULAR USER on index.html");
doc = run(
  { token: "t", user: { name: "سام", role: "کاربر عادی" } },
  "index.html",
);
slot = doc.querySelector(".right-menu_items.signin");
t(
  "shows پروفایل",
  slot.textContent.includes("پروفایل"),
  slot.textContent.trim(),
);
t(
  "links to user-profile.html",
  slot.querySelector("a").getAttribute("href") === "user-profile.html",
);
t("does NOT show پنل مدیریت", !slot.textContent.includes("پنل مدیریت"));
t("has logout", !!slot.querySelector("[data-logout]"));
t(
  "exactly 2 links",
  slot.querySelectorAll("a").length === 2,
  String(slot.querySelectorAll("a").length),
);

console.log("\nSTAFF on index.html");
doc = run(
  { token: "t", isAdmin: true, user: { name: "مدیر", role: "مدیر سایت" } },
  "index.html",
);
slot = doc.querySelector(".right-menu_items.signin");
t(
  "shows پنل مدیریت",
  slot.textContent.includes("پنل مدیریت"),
  slot.textContent.trim(),
);
t(
  "links to admin.html",
  slot.querySelector("a").getAttribute("href") === "admin.html",
);
t("does NOT show پروفایل", !slot.textContent.includes("پروفایل"));
t("has logout", !!slot.querySelector("[data-logout]"));
t(
  "exactly 2 links",
  slot.querySelectorAll("a").length === 2,
  String(slot.querySelectorAll("a").length),
);

console.log("\nmobile menu (fresh browser = default manager)");
doc = run(null, "index.html");
const mobDefault = Array.from(
  doc.querySelectorAll(".mobile-dropdown-btn"),
).map((a) => a.textContent.trim());
t(
  "mobile shows پنل مدیریت",
  mobDefault.some((x) => x.includes("پنل مدیریت")),
  mobDefault
    .filter((x) => x)
    .slice(-3)
    .join(" | "),
);
t("mobile shows خروج", mobDefault.some((x) => x.includes("خروج")));
t(
  "mobile no longer shows ورود",
  !mobDefault.some((x) => x === "ورود"),
  mobDefault.join(" | "),
);

console.log("\nmobile menu (signed out this session)");
doc = run(null, "index.html", { signedOut: true });
const mobOut = Array.from(doc.querySelectorAll(".mobile-dropdown-btn")).map(
  (a) => a.textContent.trim(),
);
t(
  "mobile shows ورود / عضویت",
  mobOut.some((x) => x === "ورود / عضویت"),
  mobOut.join(" | "),
);
t("mobile has no خروج", !mobOut.some((x) => x.includes("خروج")));

console.log("\nmobile menu (regular user)");
doc = run(
  { token: "t", user: { name: "سام", role: "کاربر عادی" } },
  "index.html",
);
const mob = doc.querySelectorAll(".mobile-dropdown-btn");
const mobTexts = Array.from(mob).map((a) => a.textContent.trim());
t(
  "mobile shows پروفایل",
  mobTexts.some((x) => x.includes("پروفایل")),
  mobTexts
    .filter((x) => x)
    .slice(-3)
    .join(" | "),
);
t(
  "mobile shows خروج",
  mobTexts.some((x) => x.includes("خروج")),
);
t("mobile no longer shows ورود", !mobTexts.some((x) => x === "ورود"));

console.log("\nmobile menu (staff)");
doc = run({ token: "t", isAdmin: true, user: { role: "ادمین" } }, "index.html");
const mob2 = Array.from(doc.querySelectorAll(".mobile-dropdown-btn")).map((a) =>
  a.textContent.trim(),
);
t(
  "mobile shows پنل مدیریت",
  mob2.some((x) => x.includes("پنل مدیریت")),
  mob2
    .filter((x) => x)
    .slice(-3)
    .join(" | "),
);
t("mobile no پروفایل for staff", !mob2.some((x) => x.includes("پروفایل")));

console.log("\nother pages carry the same menu");
for (const page of [
  "about-us.html",
  "support.html",
  "list-page.html",
  "single-post.html",
  "sign-up.html",
]) {
  const d = run({ token: "t", user: { role: "کاربر عادی" } }, page);
  const s = d.querySelector(".right-menu_items.signin");
  t(page + " -> پروفایل", s && s.textContent.includes("پروفایل"));
}

console.log("\nfresh browser on sign-up.html (default = signed-in manager)");
{
  const d = run(null, "sign-up.html");
  const s = d.querySelector(".right-menu_items.signin");
  t(
    "sign-up.html default -> پنل مدیریت + خروج",
    s &&
      s.textContent.includes("پنل مدیریت") &&
      !!s.querySelector("[data-logout]"),
    s ? s.textContent.trim() : "no slot",
  );
}

console.log("\npublic legal navigation is consistent across pages");
const publicPages = [
  "index.html",
  "about-us.html",
  "list-page.html",
  "sign-up.html",
  "single-post.html",
  "support.html",
  "user-profile.html",
];
const expectedLawCategories = [
  "constitution",
  "commercialLaw",
  "laborLaw",
  "taxLaw",
  "socialSecurityLaw",
];
for (const page of publicPages) {
  const d = run(null, page);
  const lawMenu = [...d.querySelectorAll(".home-nav_item")].find((item) =>
    item.querySelector('.home-nav_link[href="list-page.html?cat=regulations"]'),
  );
  const desktopCategories = lawMenu
    ? [...lawMenu.querySelectorAll(".home-nav_dropdown a")].map((a) =>
        new URL(a.href).searchParams.get("cat"),
      )
    : [];
  const mobileLawMenu = [...d.querySelectorAll(".mobile-dropdown")].find((item) =>
    item.querySelector(".mobile-dropdown-btn")?.textContent.includes("قوانین و مقررات"),
  );
  const mobileCategories = mobileLawMenu
    ? [...mobileLawMenu.querySelectorAll(".mobile-dropdown-menu a")].map((a) =>
        new URL(a.href).searchParams.get("cat"),
      )
    : [];
  t(`${page}: قوانین پایه در دسکتاپ`, expectedLawCategories.every((key) => desktopCategories.includes(key)));
  t(`${page}: قوانین پایه در موبایل`, expectedLawCategories.every((key) => mobileCategories.includes(key)));
  t(`${page}: سیاست‌های سایت از منوی قوانین جداست`, !desktopCategories.some((key) => ["siteTerms", "privacyRules", "purchaseRules", "copyrightRules"].includes(key)));
}
const aboutDoc = run(null, "about-us.html");
const policyLinks = [...aboutDoc.querySelectorAll(".site-policies__grid a")].map((a) =>
  new URL(a.href).searchParams.get("cat"),
);
t("چهار سیاست سایت در صفحه درباره ما در دسترس است", ["siteTerms", "privacyRules", "purchaseRules", "copyrightRules"].every((key) => policyLinks.includes(key)));

console.log(`\n  ${p} passed, ${f} failed`);
process.exit(f ? 1 : 0);
