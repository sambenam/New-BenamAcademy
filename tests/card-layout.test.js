/**
 * Home-page card layout — equal heights and stable title rhythm.
 *
 * Run with:  node tests/card-layout.test.js
 *
 * Covers the course and article cards that are actually rendered on the
 * homepage: short titles must not collapse cards or shift neighboring links,
 * and long Persian words must not push a card beyond its grid column.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { pageStyles } = require("./helpers/page-scripts.js");
const ROOT = path.join(__dirname, "..");

let p = 0,
  f = 0;
const t = (n, c, d) => {
  c
    ? (p++, console.log("  ✓ " + n))
    : (f++, console.log("  ✗ " + n + (d ? " -> " + d : "")));
};
const section = (s) => console.log("\n" + s);

/**
 * Every stylesheet index.html actually applies, concatenated in page order.
 *
 * @import has to be followed, not just the <link> list: index.html links
 * main/main.css, which is nothing but a list of @import lines. Reading only
 * the linked files finds an empty rulebook and every assertion below fails
 * for the wrong reason.
 */
function readCssWithImports(absPath, seen) {
  const visited = seen || new Set();
  if (visited.has(absPath) || !fs.existsSync(absPath)) return "";
  visited.add(absPath);

  const src = fs.readFileSync(absPath, "utf8");
  const dir = path.dirname(absPath);
  let out = "";

  [...src.matchAll(/@import\s+url\(['"]([^'"]+)['"]\)/g)].forEach((m) => {
    if (m[1].startsWith("http")) return; // web font, nothing to read
    out += readCssWithImports(path.join(dir, m[1]), visited) + "\n";
  });

  return out + src;
}

function homeCss() {
  return pageStyles("index.html")
    .map((rel) => readCssWithImports(path.join(ROOT, "styles", rel)))
    .join("\n");
}

/** The declaration block of one selector, or "" when absent. */
function block(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp("^" + escaped + "\\s*\\{([^}]*)\\}", "m"));
  return m ? m[1] : "";
}

const SECTIONS = [
  {
    name: "دوره‌های محبوب",
    card: ".popular-courses_item",
    title: ".course-title",
  },
  { name: "دوره‌های جدید", card: ".new-courses_item", title: ".course-title" },
  { name: "مقالات", card: ".article-item", title: ".article-title" },
];

/* ------------------------------------------------------------------- 1 */
section("۱. هر کارت ارتفاع ردیف گرید را پر می‌کند");
{
  const css = homeCss();
  SECTIONS.forEach(({ name, card }) => {
    const rules = block(css, card);
    t(
      `${name} — کارت height دارد`,
      /height:\s*100%/.test(rules),
      rules ? "(بدون height)" : "سلکتور پیدا نشد",
    );
  });
}

/* ------------------------------------------------------------------- 2 */
section("۲. عنوان ارتفاع ثابت دو خط دارد");
{
  const css = homeCss();
  // Two lines reserved, and capped at two so one long title cannot stretch
  // the whole row taller than the design allows.
  [...new Set(SECTIONS.map((s) => s.title))].forEach((sel) => {
    const rules = block(css, sel);
    t(
      `${sel} — min-height دارد`,
      /min-height:\s*calc\(/.test(rules),
      rules.slice(0, 60),
    );
    t(`${sel} — به دو خط محدود است`, /-webkit-line-clamp:\s*2/.test(rules));
    t(`${sel} — کلمه بلند می‌شکند`, /overflow-wrap:\s*anywhere/.test(rules));
  });
}

/* ------------------------------------------------------------------- 3 */
section("۳. در مرورگر واقعی: عنوان کوتاه و بلند یک شکل می‌شوند");
{
  const html = fs.readFileSync(path.join(ROOT, "html/index.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/html/index.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window,
    d = w.document;
  const store = {};
  Object.defineProperty(w, "localStorage", {
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
  Object.defineProperty(w, "console", {
    value: { log() {}, warn() {}, error: console.error },
    configurable: true,
  });

  // Load the stylesheets by hand: jsdom's outside-only mode does not fetch
  // <link>, and these assertions are entirely about computed style.
  pageStyles("index.html").forEach((rel) => {
    const style = d.createElement("style");
    style.textContent = fs.readFileSync(path.join(ROOT, "styles", rel), "utf8");
    d.head.appendChild(style);
  });

  // Five characters beside fifty-one - the case that broke.
  const probes = [
    "آزمون",
    "جدول حقوق",
    "آیین نامه ماده ۹۵ قانون مالیات های مستقیم مصوب ۱۴۰۵",
    "بخشنامه",
  ];

  SECTIONS.forEach(({ name, card, title }) => {
    const cards = [...d.querySelectorAll(card)];
    if (!cards.length) {
      t(`${name} — کارت پیدا شد`, false, card);
      return;
    }

    cards.forEach((c, i) => {
      const el = c.querySelector(title);
      if (el && probes[i])
        (el.querySelector("a") || el).textContent = probes[i];
    });

    const heights = new Set(cards.map((c) => w.getComputedStyle(c).height));
    t(
      `${name} — ارتفاع همه کارت‌ها یکسان`,
      heights.size === 1,
      [...heights].join(" / "),
    );

    const mins = new Set(
      cards.map((c) => {
        const el = c.querySelector(title);
        return el ? w.getComputedStyle(el).minHeight : "x";
      }),
    );
    t(
      `${name} — ارتفاع رزرو عنوان یکسان`,
      mins.size === 1,
      [...mins].join(" / "),
    );
  });
}

/* ------------------------------------------------------------------- 4 */
section("۴. تصویر کارت‌ها دست‌نخورده مانده");
{
  // height:100% on the card must not be confused with the height:100% these
  // already had on their <img>, which fills the banner area.
  const css = homeCss();
  [".popular-courses_img", ".new-courses_img", ".article-image img"].forEach(
    (sel) => {
      t(`${sel} هنوز height دارد`, /height:\s*100%/.test(block(css, sel)));
    },
  );
}

/* ------------------------------------------------------------------- 5 */
section("۵. فاصله‌ی انتهای هوم و جایگاه اخبار");
{
  const css = homeCss();
  const html = fs.readFileSync(path.join(ROOT, "html/index.html"), "utf8");
  const dom = new JSDOM(html);
  t("home-news باقی مانده است", !!dom.window.document.querySelector("[data-home-news]"));
  t("سکشن جداگانه‌ی آزمون‌ها حذف شده", !dom.window.document.querySelector(".exam-news-section"));

  const articlePadding = css.match(
    /body\.home-page \.courses-section,\s*body\.home-page \.featured-section,\s*body\.home-page \.articles-section\s*\{([^}]*)\}/m,
  );
  t(
    "مقالات از پایین فضای داخلی دارد",
    !!articlePadding && /padding-bottom:\s*30px/.test(articlePadding[1]),
  );
  t(
    "main فضای پایانی تا فوتر دارد",
    /padding:\s*0 0 48px/.test(block(css, "body.home-page .main")),
  );
  dom.window.close();
}

console.log(`\n${p} تست موفق، ${f} ناموفق`);
process.exit(f ? 1 : 0);
