/* ============================================================================
   دستیار بنام آکادمی
   ----------------------------------------------------------------------------
   The browser sends each question to the site's authenticated assistant API.
   The backend owns the conversation, AI provider credentials and any human
   hand-off. If that endpoint is explicitly unavailable, the question is filed
   through the existing support inbox instead of receiving a fake AI answer.
   ========================================================================== */

const widget = document.getElementById("aiWidget");
const toggleBtn = document.getElementById("aiToggleBtn");
const messagesEl = document.getElementById("aiMessages");
const inputEl = document.getElementById("aiInput");
const sendBtn = document.getElementById("aiSendBtn");

let aiConversationId = null;
let aiConversationOwner = null;

/** Return a signed-in user only when the session has a usable identity. */
function aiCurrentUser() {
  try {
    const raw = localStorage.getItem("benamacademySession");
    if (!raw) return null;
    const session = JSON.parse(raw);
    const user = session && session.user;
    const hasIdentity = user && (String(user.id || "").trim() || String(user.email || "").trim());
    return session && session.token && hasIdentity ? user : null;
  } catch (error) {
    return null;
  }
}

function setChatOpen(isOpen) {
  if (!widget) return;
  widget.classList.toggle("open", isOpen);
  if (toggleBtn) toggleBtn.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    refreshAiGate();
    if (inputEl && !inputEl.disabled) inputEl.focus();
  } else if (toggleBtn) {
    toggleBtn.focus();
  }
}

function openChat() {
  setChatOpen(true);
}

function closeChat() {
  setChatOpen(false);
}

if (toggleBtn) {
  toggleBtn.addEventListener("click", () =>
    widget.classList.contains("open") ? closeChat() : openChat(),
  );
}

/** All dynamic chat content, including backend errors, is plain text. */
function addMessage(text, who = "bot", extraClass = "") {
  if (!messagesEl) return null;
  const div = document.createElement("div");
  div.className = `ai-message ${who}${extraClass ? " " + extraClass : ""}`;
  div.textContent = String(text == null ? "" : text);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function refreshAiGate() {
  if (!inputEl || !sendBtn || !messagesEl) return;
  const user = aiCurrentUser();
  const locked = !user;

  inputEl.disabled = locked;
  sendBtn.disabled = locked;
  inputEl.placeholder = locked
    ? "برای گفتگو ابتدا وارد حساب کاربری شوید"
    : "سوالت رو بنویس...";

  const existing = messagesEl.querySelector(".ai-login-hint");
  if (locked && !existing) {
    const hint = document.createElement("div");
    hint.className = "ai-message bot ai-login-hint";
    hint.append("برای ارسال پرسش با حساب کاربری وارد شوید: ");
    const link = document.createElement("a");
    link.href = "sign-up.html";
    link.textContent = "ورود / عضویت";
    hint.append(link);
    messagesEl.appendChild(hint);
  } else if (!locked && existing) {
    existing.remove();
  }

  if (!user) {
    aiConversationId = null;
    aiConversationOwner = null;
  }
}

function aiUserKey(user) {
  return String(user.id || user.email || "").trim().toLowerCase();
}

function isAssistantEndpointUnavailable(error) {
  return [404, 501, 503].includes(Number(error && error.status));
}

async function sendToHumanSupport(question, user) {
  if (typeof appApi === "undefined" || !appApi.support || typeof appApi.support.sendMessage !== "function") {
    throw new Error("سرویس پشتیبانی در دسترس نیست.");
  }

  await appApi.support.sendMessage({
    name: user.name || "کاربر",
    email: user.email || (user.id ? user.id + "@account.local" : ""),
    subject: "ai",
    message: question,
    source: "ai",
  });

  return {
    answer: "دستیار خودکار فعلاً در دسترس نیست. پرسش شما برای پاسخ‌گویی کارشناسان ثبت شد؛ پاسخ را در بخش «پیام‌های من» ببینید.",
    needsHuman: true,
  };
}

async function askAssistant(question, user) {
  const owner = aiUserKey(user);
  if (owner !== aiConversationOwner) {
    aiConversationOwner = owner;
    aiConversationId = null;
  }

  const assistantApi = typeof appApi !== "undefined" && appApi.assistant;
  if (!assistantApi || typeof assistantApi.chat !== "function") {
    return sendToHumanSupport(question, user);
  }

  let result;
  try {
    result = await assistantApi.chat({
      message: question,
      conversationId: aiConversationId,
    });
  } catch (error) {
    if (isAssistantEndpointUnavailable(error)) {
      return sendToHumanSupport(question, user);
    }
    throw error;
  }

  if (result && typeof result.conversationId === "string" && result.conversationId.trim()) {
    aiConversationId = result.conversationId;
  }

  const answer = result && typeof result.answer === "string" ? result.answer.trim() : "";
  if (answer) return result;
  if (result && result.needsHuman === true) {
    return {
      ...result,
      answer: "پرسش شما برای پاسخ‌گویی کارشناسان ارجاع شد؛ نتیجه را در بخش «پیام‌های من» ببینید.",
    };
  }
  throw new Error("پاسخ معتبری از دستیار دریافت نشد.");
}

async function sendMessage() {
  if (!inputEl || !sendBtn) return;
  const text = inputEl.value.trim();
  if (!text) return;

  const user = aiCurrentUser();
  if (!user) {
    refreshAiGate();
    return;
  }

  addMessage(text, "user");
  inputEl.value = "";
  inputEl.disabled = true;
  sendBtn.disabled = true;

  const typing = addMessage("در حال آماده‌کردن پاسخ…", "bot", "ai-typing");
  try {
    const result = await askAssistant(text, user);
    if (typing) typing.remove();
    addMessage(result.answer, "bot");
  } catch (error) {
    if (typing) typing.remove();
    const reason = error && error.message ? error.message : "خطای نامشخص";
    addMessage("پرسش ارسال نشد: " + reason, "bot", "ai-error");
  } finally {
    refreshAiGate();
    if (inputEl && !inputEl.disabled) inputEl.focus();
  }
}

if (sendBtn) sendBtn.addEventListener("click", sendMessage);
if (inputEl) {
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });
}

document.addEventListener("click", (event) => {
  const suggestion = event.target && typeof event.target.closest === "function"
    ? event.target.closest(".ai-suggestion")
    : null;
  if (!suggestion) return;
  if (!aiCurrentUser()) {
    openChat();
    refreshAiGate();
    return;
  }
  if (!inputEl || inputEl.disabled) return;
  inputEl.value = suggestion.textContent.trim();
  sendMessage();
});

window.addEventListener("storage", (event) => {
  if (event.key === "benamacademySession") refreshAiGate();
});
window.addEventListener("focus", refreshAiGate);

if (toggleBtn) {
  toggleBtn.setAttribute("aria-controls", "aiChatWindow");
  toggleBtn.setAttribute("aria-expanded", "false");
}
refreshAiGate();
