/* =========================================================================
   OLIVER — AI tribute chatbot front-end logic
   -------------------------------------------------------------------------
   Calls a Cloudflare Worker backend (see /worker in the repo, or the
   SETUP.md walkthrough) which holds the API key server-side and forwards
   requests to Claude with Oliver's system prompt. Never put a real API
   key directly in this file — it's public once hosted on GitHub Pages.
========================================================================= */

(function () {
  "use strict";

  // Replace with your deployed worker URL, e.g.
  // "https://oliver-chat-worker.yoursubdomain.workers.dev"
  const WORKER_URL = "https://oliver-chat-worker.YOUR-SUBDOMAIN.workers.dev";

  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");

  // Rolling chat history sent to the worker so Oliver has context
  // across a few turns. Kept short to bound request size.
  const history = [];

  function addMessage(text, who) {
    const bubble = document.createElement("div");
    bubble.className = "msg " + (who === "user" ? "msg--user" : "msg--bot");
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function showTyping() {
    const typing = document.createElement("div");
    typing.className = "msg--typing";
    typing.id = "typingIndicator";
    typing.innerHTML = "<span></span><span></span><span></span>";
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    const typing = document.getElementById("typingIndicator");
    if (typing) typing.remove();
  }

  async function getOliverReply(userText) {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText, history }),
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

    addMessage(text, "user");
    input.value = "";
    input.focus();

    showTyping();
    try {
      const reply = await getOliverReply(text);
      hideTyping();
      addMessage(reply, "bot");
      history.push({ role: "user", content: text });
      history.push({ role: "assistant", content: reply });
    } catch (err) {
      hideTyping();
      addMessage("brain's buffering — try again in a sec.", "bot");
      console.error("Chat error:", err);
    }
  });
})();
