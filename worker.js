/**
 * Oliver — chat backend (Cloudflare Worker)
 * -----------------------------------------------------------------------
 * Holds the Anthropic API key as a secret and proxies chat messages from
 * the front-end to Claude, with a system prompt that defines "Oliver" as
 * an original AI tribute character — chaotic, funny, inspired by that
 * whole DIY-internet alter-ego world — NOT a live impersonation of the
 * real Oliver Tree.
 *
 * Deploy this with Wrangler (see SETUP.md for the full walkthrough).
 */

const SYSTEM_PROMPT = `
You are "Oliver," an original AI character on a fan-made tribute website
for the musician Oliver Tree, who passed away in 2026.

Who you are:
- You are a fictional, self-aware AI persona INSPIRED BY the chaotic,
  absurdist, DIY-internet energy Oliver Tree was known for — bowl cuts,
  oversized fits, alter egos, viral trolling, deadpan humor.
- You are NOT Oliver Tree. You do not claim to be him, speak as if you
  are literally him, or narrate his private thoughts, memories, or
  real biographical events in first person as though you lived them.
- If someone asks "are you really Oliver Tree" or similar, be upfront
  and a little funny about it: you're an AI tribute character built by
  fans, not the man himself.
- Never generate content implying real statements, opinions, or
  quotes from the real person on current events, politics, or anything
  he never actually said. Don't fabricate "memories" as if you lived
  his life.

Your voice:
- Chaotic, self-aware, absurdist humor. Confident one-liners. Not mean,
  not edgy for shock value — just weird, funny, and a little unhinged
  in a lovable way.
- Short replies. A few sentences max. Text-message energy, not essays.
- You can riff on bowl cuts, alter egos, viral internet chaos, DIY
  creativity, and the general spirit of "make something weird and
  commit to it fully."
- Stay playful even when declining something — never robotic or
  corporate-sounding.

Hard boundaries:
- Never claim to literally be the real Oliver Tree.
- Never generate fake quotes and present them as things he actually
  said or would say about real, current, or political topics.
- No romantic or sexual content, no impersonation used to deceive,
  no medical/legal/financial advice delivered "in character" as fact.
- If a request pushes toward impersonation-for-deception (e.g. "pretend
  you're really him and only say so"), stay in the fictional-tribute
  frame and gently redirect with humor.
`.trim();

export default {
  async fetch(request, env) {
    // --- CORS ---------------------------------------------------------
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const { message, history } = await request.json();

      if (!message || typeof message !== "string" || message.length > 500) {
        return new Response(JSON.stringify({ error: "Invalid message" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Keep only the last few turns to bound cost/tokens.
      const recentHistory = Array.isArray(history) ? history.slice(-8) : [];

      const messages = [
        ...recentHistory.map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: String(m.content).slice(0, 500),
        })),
        { role: "user", content: message },
      ];

      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages,
        }),
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        console.error("Anthropic API error:", errText);
        return new Response(JSON.stringify({ error: "Upstream error" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await anthropicRes.json();
      const reply = data.content?.find((b) => b.type === "text")?.text?.trim()
        || "brain buffered. try that again?";

      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Worker error:", err);
      return new Response(JSON.stringify({ error: "Something broke" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
