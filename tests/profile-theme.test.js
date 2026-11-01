/**
 * The profile uses one fixed dark palette; the site no longer exposes a
 * day/night switch.
 *
 * Run with: node tests/profile-theme.test.js
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let passed = 0;
let failed = 0;
function test(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log("  ✓ " + name);
  } else {
    failed += 1;
    console.log("  ✗ " + name + (detail ? " -> " + detail : ""));
  }
}

const profileHtml = fs.readFileSync(path.join(ROOT, "html/user-profile.html"), "utf8");
const dom = new JSDOM(profileHtml, { url: "http://localhost/html/user-profile.html" });
const document = dom.window.document;
const styles = fs
  .readdirSync(path.join(ROOT, "styles"), { recursive: true })
  .filter((name) => String(name).endsWith(".css"))
  .map((name) => fs.readFileSync(path.join(ROOT, "styles", name), "utf8"))
  .join("\n");
const scripts = fs
  .readdirSync(path.join(ROOT, "scripts"), { recursive: true })
  .filter((name) => String(name).endsWith(".js"))
  .map((name) => fs.readFileSync(path.join(ROOT, "scripts", name), "utf8"))
  .join("\n");
const pages = fs
  .readdirSync(path.join(ROOT, "html"))
  .filter((name) => name.endsWith(".html"))
  .map((name) => fs.readFileSync(path.join(ROOT, "html", name), "utf8"))
  .join("\n");

console.log("\nSingle fixed dark appearance");
test("profile uses the fixed dark text token", /--up-text:\s*#f1f5f9/i.test(styles));
test("profile uses the fixed dark page background", /--up-page:\s*linear-gradient\([^;]*#0f172a/i.test(styles));
test("profile field focus stays dark", /--up-field-focus:\s*rgba\(15,\s*23,\s*42/i.test(styles));

console.log("\nNo theme switch remains in pages or assets");
test("no theme-switch control in HTML", !pages.includes("themeToggleBtn") && !pages.includes("class=\"theme-toggle\""));
test("no switch script included or defined", !pages.includes("toggle-btn.js") && !scripts.includes("toggleBenamacademyTheme"));
test("no light-theme CSS selectors remain", !styles.includes("data-theme"));
test("no toggle stylesheet remains", !fs.existsSync(path.join(ROOT, "styles/main/toggle.css")));
test("no toggle script remains", !fs.existsSync(path.join(ROOT, "scripts/toggle-btn.js")));

test("profile structure remains", !!document.querySelector(".profile-sidebar"));
test("profile form remains", !!document.querySelector("#tab-info .form-control"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
