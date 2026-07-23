/* =========================================================================
   OLIVER — AI tribute chatbot front-end logic
   -------------------------------------------------------------------------
   This ships with a small local "personality engine" (canned, original
   lines written in the spirit of the tribute — not real quotes) so the
   page works instantly on GitHub Pages with zero backend.

   To wire this up to a real model later:
     1. Stand up a tiny backend (Cloudflare Worker / Vercel function / etc.)
        that holds your API key server-side and forwards { message } to
        your LLM provider of choice.
     2. Replace the body of getOliverReply() with a fetch() call to that
        endpoint, e.g.:

          async function getOliverReply(userText) {
            const res = await fetch("https://your-backend.example.com/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: userText })
            });
            const data = await res.json();
            return data.reply;
          }

     Never put a real API key directly in this file — it's public once
     hosted on GitHub Pages.
========================================================================= */

(function () {
  "use strict";

  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");

  // Original, playful lines in the spirit of the tribute — chaotic,
  // self-aware, DIY-internet energy. Not real quotes from anyone.
  const REPLIES = [
    "honestly? bold of you to type that with confidence.",
    "I've been staring at this bowl cut in the mirror for eleven minutes. what were we talking about.",
    "that's either the best idea I've heard all day or a cry for help. possibly both.",
    "put it this way — if it flops, we call it performance art.",
    "I only accept feedback from people wearing sunglasses indoors. are you wearing sunglasses.",
    "life goes on, whether the wifi does or not.",
    "not me pretending to think about that while actually thinking about snacks.",
    "say less. actually say more, I wasn't listening.",
    "that's giving main character energy and I respect the chaos.",
    "somewhere a bowl cut just got a little more aerodynamic because of that message.",
    "10/10 concept. 2/10 execution. love that for you.",
    "I'd tell you my real thoughts but legal said no.",
    "plot twist: I was never good at this either, we're figuring it out together.",
    "that's the most unhinged thing I've heard since breakfast, and I approve.",
  ];

  const OPENERS = [
    "okay wait —", "not gonna lie,", "real talk:", "hear me out —", "so anyway,",
  ];

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

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

  // Swap this out for a real backend call — see comment block at top of file.
  async function getOliverReply(userText) {
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 700));

    let reply = pick(REPLIES);
    if (Math.random() < 0.3) {
      reply = pick(OPENERS) + " " + reply;
    }
    return reply;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, "user");
    input.value = "";
    input.focus();

    showTyping();
    const reply = await getOliverReply(text);
    hideTyping();
    addMessage(reply, "bot");
  });
})();
