/**
 * Homepage news ticker uses the first ten entries from the header news
 * destination (siteData.exams), rather than a separate static list.
 * Run with: node tests/home-news.test.js
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { ROOT, pageScripts } = require("./helpers/page-scripts.js");

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "html/index.html"), "utf8"), {
  url: "http://localhost/html/index.html",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
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

const source = fs.readFileSync(path.join(ROOT, "scripts/home-news.js"), "utf8");
const news = Array.from({ length: 12 }, (_, index) => ({
  id: `exams-${index + 1}`,
  title: index === 0 ? '<img src=x onerror="window.pwned=1">خبر اول' : `خبر شماره ${index + 1}`,
  excerpt: `خلاصه خبر ${index + 1}`,
}));
window.eval(`const siteData = ${JSON.stringify({
  exams: { title: "اخبار", items: news },
  other: { title: "سایر", items: [{ id: "other-1", title: "خبر نامرتبط" }] },
})};\n${source}`);

const cards = [...window.document.querySelectorAll(".home-news_item")];
test("homepage renders at most the first ten header-news items", cards.length === 10, String(cards.length));
test("first displayed card uses the first news title", cards[0]?.querySelector("strong")?.textContent.includes("خبر اول"));
test("the tenth displayed card is item ten", cards[9]?.querySelector("strong")?.textContent === "خبر شماره 10");
test("cards link to their matching article pages", cards[0]?.getAttribute("href") === "single-post.html?id=exams-1");
test("items from other categories are excluded", !window.document.querySelector(".home-news_track")?.textContent.includes("خبر نامرتبط"));
test("news title is rendered as text, not executable markup", window.document.querySelectorAll(".home-news_item img[onerror]").length === 0 && !window.pwned);
test("carousel controls are created for the ten news cards", window.document.querySelectorAll(".home-news_dot").length > 1);

Object.defineProperty(window, "innerWidth", { configurable: true, value: 650 });
window.dispatchEvent(new window.Event("resize"));
test("mobile carousel shows one card per step", window.document.querySelectorAll(".home-news_dot").length === 10);

const scripts = pageScripts("index.html");
test("homepage loads site data before its news renderer", scripts.indexOf("data.js") !== -1 && scripts.indexOf("data.js") < scripts.indexOf("home-news.js"));

window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
