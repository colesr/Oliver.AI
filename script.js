/* =========================================================================
   OLIVER — AI tribute chatbot front-end logic
   -------------------------------------------------------------------------
   Calls a Cloudflare Worker backend (see /worker in the repo, or the
   SETUP.md walkthrough) which holds the API key server-side and forwards
   requests to Claude with Oliver's system prompt. Never put a real API
   key directly in this file — it's public once hosted on GitHub Pages.

   Persistence: chat history is saved to this browser's localStorage, so
   it survives a refresh. It's local to this device only — not shared
   across visitors or devices.

   Feedback: each Oliver reply has upvote/downvote buttons. Votes are
   sent to the worker's /feedback route, which stores them and uses
   recent examples to steer future replies site-wide (see comments in
   worker.js for exactly what that does and doesn't mean).
========================================================================= */

(function () {
  "use strict";

  // Replace with your deployed worker URL, e.g.
  // "https://oliver-chat-worker.yoursubdomain.workers.dev"
  const WORKER_URL = "https://oliver-chat-worker.YOUR-SUBDOMAIN.workers.dev";
  const CHAT_ENDPOINT = WORKER_URL + "/chat";
  const FEEDBACK_ENDPOINT = WORKER_URL + "/feedback";

  const STORAGE_KEY = "oliver_chat_history_v1";

  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const messagesEl = document.getElementById("chatMessages");
  const clearBtn = document.getElementById("clearChat");

  const WELCOME_MESSAGE = {
    role: "assistant",
    content: "yo. it's Oliver. well — an AI built to riff in his spirit. type something, let's see where it goes.",
    vote: null,
  };

  // In-memory mirror of the conversation. Each entry:
  // { role: "user" | "assistant", content: string, vote: "up"|"down"|null }
  let history = loadHistory();

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [WELCOME_MESSAGE];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return [WELCOME_MESSAGE];
      return parsed;
    } catch {
      return [WELCOME_MESSAGE];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (err) {
      console.warn("Couldn't save chat history:", err);
    }
  }

  function renderAll() {
    messagesEl.innerHTML = "";
    history.forEach((entry, index) => renderMessage(entry, index));
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderMessage(entry, index) {
    if (entry.role === "user") {
      const bubble = document.createElement("div");
      bubble.className = "msg msg--user";
      bubble.textContent = entry.content;
      messagesEl.appendChild(bubble);
      return;
    }

    // Bot message, wrapped with vote controls underneath.
    const wrap = document.createElement("div");
    wrap.className = "msg--bot-wrap";

    const bubble = document.createElement("div");
    bubble.className = "msg msg--bot";
    bubble.textContent = entry.content;
    wrap.appendChild(bubble);

    // Don't show voting on the static welcome message — nothing
    // meaningful to vote on yet.
    if (index > 0) {
      const votes = document.createElement("div");
      votes.className = "msg-votes";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.textContent = "▲";
      upBtn.setAttribute("aria-label", "Good reply");
      if (entry.vote === "up") upBtn.classList.add("is-active-up");

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.textContent = "▼";
      downBtn.setAttribute("aria-label", "Bad reply");
      if (entry.vote === "down") downBtn.classList.add("is-active-down");

      upBtn.addEventListener("click", () => castVote(index, "up", upBtn, downBtn));
      downBtn.addEventListener("click", () => castVote(index, "down", upBtn, downBtn));

      votes.appendChild(upBtn);
      votes.appendChild(downBtn);
      wrap.appendChild(votes);
    }

    messagesEl.appendChild(wrap);
  }

  async function castVote(index, vote, upBtn, downBtn) {
    const entry = history[index];
    if (!entry || entry.vote === vote) return; // already voted this way

    const previousVote = entry.vote;
    entry.vote = vote;
    saveHistory();

    upBtn.classList.toggle("is-active-up", vote === "up");
    downBtn.classList.toggle("is-active-down", vote === "down");

    // Find the user message that prompted this reply (the entry right
    // before it) so the worker can log message+reply+vote together.
    const userEntry = history[index - 1];

    try {
      await fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userEntry ? userEntry.content : "",
          reply: entry.content,
          vote,
        }),
      });
    } catch (err) {
      console.warn("Couldn't record feedback:", err);
      // Don't roll back the UI for a failed feedback call — the vote
      // still reflects the user's real reaction locally.
    }
  }

  function showTyping() {
    const typing = document.createElement("div");
    typing.className = "msg--typing";
    typing.id = "typingIndicator";
    typing.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    const typing = document.getElementById("typingIndicator");
    if (typing) typing.remove();
  }

  async function getOliverReply(userText) {
    // Send only role/content to the model, and exclude the message we're
    // about to send — it's already in `history` (just pushed by the
    // caller) but the worker expects it separately as `message`, with
    // `history` being everything BEFORE it. Including it in both would
    // make it look like the user said it twice.
    const apiHistory = history
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText, history: apiHistory }),
    });

    if (!res.ok) {
      throw new Error("Worker responded with " + res.status);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.reply;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    history.push({ role: "user", content: text, vote: null });
    saveHistory();
    renderAll();
    input.value = "";
    input.focus();

    showTyping();
    try {
      const reply = await getOliverReply(text);
      hideTyping();
      history.push({ role: "assistant", content: reply, vote: null });
      saveHistory();
      renderAll();
    } catch (err) {
      hideTyping();
      history.push({
        role: "assistant",
        content: "brain's buffering — try again in a sec.",
        vote: null,
      });
      saveHistory();
      renderAll();
      console.error("Chat error:", err);
    }
  });

  clearBtn.addEventListener("click", function () {
    history = [WELCOME_MESSAGE];
    saveHistory();
    renderAll();
  });

  renderAll();
})();