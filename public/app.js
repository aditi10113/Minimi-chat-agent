const chat = document.querySelector("#chat");
const welcome = document.querySelector("#welcome");
const messagesEl = document.querySelector("#messages");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const newChatButton = document.querySelector("#new-chat");
const clearButton = document.querySelector("#clear-chat");

const SESSION_KEY = "minimi.session.v1";
let sessionId = localStorage.getItem(SESSION_KEY);
if (!sessionId) {
  sessionId = makeId();
  localStorage.setItem(SESSION_KEY, sessionId);
}
let busy = false;

function makeId() {
  return "s_" + crypto.randomUUID().replaceAll("-", "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

// Small safe Markdown renderer: escapes HTML first, then supports common chat formatting.
function renderMarkdown(raw) {
  let s = escapeHtml(raw);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.*?)\*/g, "<em>$1</em>");
  const lines = s.split(/\r?\n/);
  const out = [];
  let list = null;
  const closeList = () => { if (list) { out.push(list === "ul" ? "</ul>" : "</ol>"); list = null; } };
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)/);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) { closeList(); out.push(kind === "ul" ? "<ul>" : "<ol>"); list = kind; }
      out.push(`<li>${(bullet || numbered)[1]}</li>`);
    } else {
      closeList();
      if (!line.trim()) continue;
      if (/^###\s+/.test(line)) out.push(`<h3>${line.replace(/^###\s+/, "")}</h3>`);
      else if (/^##\s+/.test(line)) out.push(`<h3>${line.replace(/^##\s+/, "")}</h3>`);
      else out.push(`<p>${line}</p>`);
    }
  }
  closeList();
  return out.join("");
}

function addMessage(message) {
  const wrap = document.createElement("article");
  wrap.className = `message ${message.role}`;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = message.role === "user" ? "Y" : "m";
  const body = document.createElement("div");
  body.className = "message-body";
  const label = document.createElement("div");
  label.className = "message-label";
  const date = message.createdAt ? new Date(message.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
  label.textContent = `${message.role === "user" ? "YOU" : "MINIMI"}${date ? " · " + date : ""}`;
  const text = document.createElement("div");
  text.className = "message-text";
  text.innerHTML = message.role === "user" ? escapeHtml(message.content).replace(/\n/g, "<br>") : renderMarkdown(message.content);
  body.append(label, text);

  if (message.sources?.length) {
    const sources = document.createElement("div");
    sources.className = "sources";
    const title = document.createElement("div");
    title.className = "sources-label";
    title.textContent = "SOURCES";
    sources.append(title);
    message.sources.forEach(source => {
      const a = document.createElement("a");
      a.className = "source-link";
      a.href = source.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = source.title || new URL(source.url).hostname;
      a.title = source.url;
      sources.append(a);
    });
    body.append(sources);
  }
  wrap.append(avatar, body);
  messagesEl.append(wrap);
}

function scrollToBottom() {
  chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
}

function setBusy(value) {
  busy = value;
  sendButton.disabled = value;
  input.disabled = value;
  sendButton.innerHTML = value ? "…" : "<span>↑</span>";
}

function showTyping() {
  const row = document.createElement("div");
  row.id = "typing";
  row.className = "message assistant";
  row.innerHTML = '<div class="avatar">m</div><div class="message-body"><div class="message-label">MINIMI IS THINKING</div><div class="typing">Searching and thinking<span>.</span><span>.</span><span>.</span></div></div>';
  messagesEl.append(row);
  scrollToBottom();
}
function removeTyping() { document.querySelector("#typing")?.remove(); }

async function loadHistory() {
  try {
    const res = await fetch(`/api/history/${encodeURIComponent(sessionId)}`);
    if (!res.ok) throw new Error("History unavailable");
    const data = await res.json();
    messagesEl.innerHTML = "";
    data.messages.forEach(addMessage);
    welcome.hidden = data.messages.length > 0;
    scrollToBottom();
  } catch (err) {
    console.error(err);
  }
}

async function sendMessage(text) {
  if (busy || !text.trim()) return;
  welcome.hidden = true;
  addMessage({ role: "user", content: text, createdAt: new Date().toISOString() });
  input.value = "";
  input.style.height = "auto";
  setBusy(true);
  showTyping();
  scrollToBottom();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: text,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    removeTyping();
    addMessage({ role: "assistant", content: data.answer, sources: data.sources, createdAt: new Date().toISOString() });
  } catch (error) {
    removeTyping();
    addMessage({ role: "assistant", content: `I hit a problem: ${error.message}\n\nYour question is still in this chat. Please check the server/API configuration and try again.`, createdAt: new Date().toISOString() });
  } finally {
    setBusy(false);
    input.focus();
    scrollToBottom();
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  sendMessage(input.value);
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
});
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
document.querySelectorAll(".suggestion").forEach(button => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});

async function resetConversation() {
  if (busy) return;
  try { await fetch(`/api/history/${encodeURIComponent(sessionId)}`, { method: "DELETE" }); }
  catch (error) { console.error(error); }
  sessionId = makeId();
  localStorage.setItem(SESSION_KEY, sessionId);
  messagesEl.innerHTML = "";
  welcome.hidden = false;
  input.focus();
}
newChatButton.addEventListener("click", resetConversation);
clearButton.addEventListener("click", resetConversation);

loadHistory();
