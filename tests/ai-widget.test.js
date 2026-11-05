/**
 * Frontend assistant widget: auth gate, authenticated API call, safe rendering
 * and the human-support fallback.
 * Run with: node tests/ai-widget.test.js
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./helpers/page-scripts.js");

const html = fs.readFileSync(path.join(ROOT, "html/index.html"), "utf8");
const widgetSource = fs.readFileSync(path.join(ROOT, "scripts/ai-widget.js"), "utf8");
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

function bootWidget(session, assistantChat, supportSend) {
  const dom = new JSDOM(html, {
    url: "http://localhost/html/index.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  if (session) window.localStorage.setItem("benamacademySession", JSON.stringify(session));
  window.matchMedia = () => ({ matches: true });
  window.appApi = {
    assistant: { chat: assistantChat || (async () => ({ answer: "پاسخ" })) },
    support: { sendMessage: supportSend || (async () => ({ success: true })) },
  };
  window.eval(widgetSource);
  return { dom, window, document: window.document };
}

async function clickSend(document, question) {
  document.getElementById("aiInput").value = question;
  document.getElementById("aiSendBtn").click();
  await new Promise((resolve) => setTimeout(resolve, 5));
}

(async () => {
  const guest = bootWidget(null);
  test("guest cannot send a question", guest.document.getElementById("aiInput").disabled && guest.document.getElementById("aiSendBtn").disabled);
  test("guest receives a sign-in link", !!guest.document.querySelector(".ai-login-hint a[href='sign-up.html']"));
  test("chat toggle exposes its expanded state", guest.document.getElementById("aiToggleBtn").getAttribute("aria-expanded") === "false");
  guest.document.getElementById("aiToggleBtn").click();
  test("opening the chat updates aria-expanded", guest.document.getElementById("aiToggleBtn").getAttribute("aria-expanded") === "true");
  guest.dom.window.close();

  const incomplete = bootWidget({ token: "seed", user: { name: "مدیر سایت", role: "مدیر سایت" } });
  test("demo session without a stable identity stays locked", incomplete.document.getElementById("aiInput").disabled);
  incomplete.dom.window.close();

  const sent = [];
  const supportSent = [];
  const userSession = { token: "user-token", user: { id: "user-42", name: "کاربر", email: "user@example.test" } };
  const signedIn = bootWidget(
    userSession,
    async (payload) => {
      sent.push(payload);
      return { answer: "پاسخ <img src=x onerror=alert(1)>", conversationId: "conversation-7" };
    },
    async (payload) => supportSent.push(payload),
  );
  test("account with a stable identity can send", !signedIn.document.getElementById("aiInput").disabled);
  await clickSend(signedIn.document, "پرسش اول");
  test("assistant request sends only the question and conversation context", sent[0]?.message === "پرسش اول" && sent[0]?.conversationId === null && !("email" in sent[0]));
  test("assistant answer is rendered as text, not markup", signedIn.document.querySelectorAll(".ai-message.bot img").length === 0 && signedIn.document.querySelector(".ai-message.bot:last-child")?.textContent.includes("<img"));
  test("successful AI answer does not create a duplicate support ticket", supportSent.length === 0);
  await clickSend(signedIn.document, "پرسش دوم");
  test("follow-up request carries the returned conversationId", sent[1]?.conversationId === "conversation-7");
  test("message log is announced accessibly", signedIn.document.getElementById("aiMessages").getAttribute("aria-live") === "polite");
  signedIn.dom.window.close();

  const fallbackPayloads = [];
  const fallback = bootWidget(
    userSession,
    async () => { throw Object.assign(new Error("assistant route missing"), { status: 503 }); },
    async (payload) => fallbackPayloads.push(payload),
  );
  await clickSend(fallback.document, "نیاز به راهنمایی دارم");
  test("unavailable assistant endpoint falls back to support inbox", fallbackPayloads.length === 1 && fallbackPayloads[0]?.source === "ai" && fallbackPayloads[0]?.message === "نیاز به راهنمایی دارم");
  test("fallback response clearly says it was sent to humans", fallback.document.querySelector(".ai-message.bot:last-child")?.textContent.includes("کارشناسان ثبت شد"));
  fallback.dom.window.close();

  let supportCalled = false;
  const failedRequest = bootWidget(
    userSession,
    async () => { throw Object.assign(new Error('<svg onload="alert(1)">'), { status: 500 }); },
    async () => { supportCalled = true; },
  );
  await clickSend(failedRequest.document, "سوال ناموفق");
  test("unexpected server errors do not silently become support tickets", !supportCalled);
  test("backend error text cannot inject markup", failedRequest.document.querySelectorAll(".ai-message.bot svg").length === 0 && failedRequest.document.querySelector(".ai-message.bot:last-child")?.textContent.includes("<svg"));
  failedRequest.dom.window.close();

  // Exercise the public API adapter itself: relative assistant URL, JSON body
  // and bearer token are all sent through the shared request wrapper.
  const apiDom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/html/index.html",
    runScripts: "outside-only",
  });
  const apiWindow = apiDom.window;
  apiWindow.APP_CONFIG = { apiMode: "real", apiBaseUrl: "/api" };
  apiWindow.Headers = global.Headers;
  apiWindow.AbortController = global.AbortController;
  apiWindow.localStorage.setItem("benamacademySession", JSON.stringify({ token: "bearer-token", user: { id: "user-42" } }));
  let requestSeen;
  apiWindow.fetch = async (url, options) => {
    requestSeen = { url, options };
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ answer: "سلام", conversationId: "c-1" }),
    };
  };
  const apiSource = fs.readFileSync(path.join(ROOT, "scripts/api.js"), "utf8");
  apiWindow.eval(apiSource);
  const apiResult = await apiWindow.appApi.assistant.chat({ message: "سلام", conversationId: null });
  test("appApi exposes the backend assistant route", requestSeen?.url === "/api/assistant/chat" && requestSeen.options.method === "POST");
  test("assistant request includes auth and the expected payload", requestSeen?.options.headers.get("Authorization") === "Bearer bearer-token" && JSON.parse(requestSeen.options.body).message === "سلام");
  test("assistant response is returned to the widget", apiResult.answer === "سلام" && apiResult.conversationId === "c-1");
  apiDom.window.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
