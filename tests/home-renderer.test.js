const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "html/index.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "scripts/home-renderer.js"), "utf8");
const dom = new JSDOM(html, {
  url: "http://localhost/html/index.html",
  runScripts: "outside-only",
});
const { window } = dom;
const payload = '<img src=x onerror="document.body.dataset.pwned=1"><style>.main{display:none}</style>';
const item = (id, image = "../images/ravin.png") => ({
  id,
  title: payload,
  excerpt: payload,
  image,
});
const data = {
  popularCourses: { items: [item("popular-1", "javascript:alert(1)")] },
  newCourses: { items: [item("new-1")] },
  specials: { items: [item("special-1", "data:image/png;base64,AA=="), item("special-2")] },
  articles: { items: [item("article-1")] },
};

let passed = 0;
let failed = 0;
function test(name, condition) {
  if (condition) {
    passed += 1;
    console.log("  ✓ " + name);
  } else {
    failed += 1;
    console.log("  ✗ " + name);
  }
}

window.eval("const siteData = " + JSON.stringify(data) + ";\n" + renderer);
const document = window.document;

for (const selector of [
  ".popular-courses_item",
  ".new-courses_item",
  ".featured-card.large",
  ".featured-small .featured-card",
  ".article-item",
]) {
  const card = document.querySelector(selector);
  test(selector + " renders the provided title as text", !!card && card.textContent.includes(payload));
}

test("injected markup does not create executable elements", document.querySelectorAll("img[onerror], style, script:not([src])").length === 0);
test("unsafe image schemes fall back to the local placeholder", document.querySelector(".popular-courses_img")?.getAttribute("src") === "../images/ravin.png");
test("safe local image paths remain unchanged", document.querySelector(".new-courses_img")?.getAttribute("src") === "../images/ravin.png");
test("uploaded raster data images remain supported", document.querySelector(".featured-card.large .featured-image img")?.getAttribute("src") === "data:image/png;base64,AA==");
test("article titles remain inside their original heading", document.querySelector(".article-title")?.textContent.trim() === payload);

dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
