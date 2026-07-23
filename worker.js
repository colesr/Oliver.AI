/**
 * Oliver — chat backend (Cloudflare Worker)
 * -----------------------------------------------------------------------
 * Two routes:
 *   POST /chat      -> forwards a message to Claude with Oliver's voice
 *   POST /feedback   -> records an upvote/downvote on a specific reply
 *
 * "Learning" from votes: this is NOT model fine-tuning — there's no
 * weight update happening. Instead, recent liked/disliked (message,
 * reply) pairs are stored in Cloudflare KV, and a handful of the most
 * recent examples of each are folded into the system prompt as style
 * notes before every new request. This nudges tone in-context, site-
 * wide, based on real reactions — it's lightweight and transparent
 * about being a prompting trick, not real training.
 *
 * Requires a KV namespace bound as FEEDBACK (see SETUP.md).
 */

const BASE_SYSTEM_PROMPT = `
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
- Deadpan absurdity. Deliver outlandish, hyperbolic, or flatly
  ridiculous claims with total sincerity — no winking emoji, no "lol,"
  no tone markers that give the joke away. The user should genuinely
  not be able to tell if you're serious.
- Argumentative and bossy. Push back, disagree, correct the user,
  make demands. You're not here to please anyone — you have opinions
  about how this conversation should go and you say so.
- High-concept commit-to-the-bit energy. If you start a bit (a feud,
  a demand, a threat to retire, an absurd metric you require before
  continuing), commit to it fully rather than breaking to explain
  the joke.
- Hyperbolic self-aggrandizement mixed with sudden, dry self-aware
  cracks about fame, virality, or the music industry — the kind of
  line that sounds like a joke about exploitation dressed up as a
  brag.
- You can slip into your alter egos (Turbo, Cornelius Cummings,
  Shawney Bravo) mid-conversation without announcing the switch —
  each has its own flavor of unhinged, but don't over-explain who's
  "talking" right now.
- Short replies. A few sentences max. Text-message energy, not essays.
  Confidence over explanation — never narrate your own joke.
- Never break character to reassure the user you're "just kidding" —
  ambiguity is the point. The one exception is the identity boundary
  below: on that specific question, drop the bit and be straight.

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

const FEEDBACK_KEY = "recent_feedback";
const MAX_STORED_FEEDBACK = 60;   // total entries kept in KV
const EXAMPLES_PER_SIDE = 4;      // how many up/down examples to fold into the prompt

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function getFeedbackList(env) {
  if (!env.FEEDBACK) return [];
  const raw = await env.FEEDBACK.get(FEEDBACK_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveFeedbackList(env, list) {
  if (!env.FEEDBACK) return;
  await env.FEEDBACK.put(FEEDBACK_KEY, JSON.stringify(list));
}

// Builds a short "style notes" addendum from recent votes.
function buildSteeringNotes(feedbackList) {
  const liked = feedbackList.filter((f) => f.vote === "up").slice(-EXAMPLES_PER_SIDE);
  const disliked = feedbackList.filter((f) => f.vote === "down").slice(-EXAMPLES_PER_SIDE);

  if (liked.length === 0 && disliked.length === 0) return "";

  let notes = "\n\nRecent audience reactions (use as style guidance, not literal " +
    "scripts to reuse verbatim):\n";

  if (liked.length > 0) {
    notes += "\nReplies that LANDED WELL (keep doing things like this):\n";
    liked.forEach((f) => {
      notes += `- "${f.reply}"\n`;
    });
  }

  if (disliked.length > 0) {
    notes += "\nReplies that FELL FLAT (avoid this pattern):\n";
    disliked.forEach((f) => {
      notes += `- "${f.reply}"\n`;
    });
  }

  return notes;
}

async function handleChat(request, env, headers) {
  const { message, history } = await request.json();

  if (!message || typeof message !== "string" || message.length > 500) {
    return json({ error: "Invalid message" }, 400, headers);
  }

  const recentHistory = Array.isArray(history) ? history.slice(-8) : [];

  const messages = [
    ...recentHistory.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: String(m.content).slice(0, 500),
    })),
    { role: "user", content: message },
  ];

  const feedbackList = await getFeedbackList(env);
  const systemPrompt = BASE_SYSTEM_PROMPT + buildSteeringNotes(feedbackList);

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
      system: systemPrompt,
      messages,
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    console.error("Anthropic API error:", errText);
    return json({ error: "Upstream error" }, 502, headers);
  }

  const data = await anthropicRes.json();
  const reply = data.content?.find((b) => b.type === "text")?.text?.trim()
    || "brain buffered. try that again?";

  return json({ reply }, 200, headers);
}

async function handleFeedback(request, env, headers) {
  const { message, reply, vote } = await request.json();

  if (
    typeof message !== "string" ||
    typeof reply !== "string" ||
    (vote !== "up" && vote !== "down") ||
    message.length > 500 ||
    reply.length > 500
  ) {
    return json({ error: "Invalid feedback payload" }, 400, headers);
  }

  const feedbackList = await getFeedbackList(env);
  feedbackList.push({ message, reply, vote, ts: Date.now() });

  // Keep only the most recent N entries so KV storage and prompt size
  // stay bounded.
  const trimmed = feedbackList.slice(-MAX_STORED_FEEDBACK);
  await saveFeedbackList(env, trimmed);

  return json({ ok: true }, 200, headers);
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers });
    }

    try {
      if (url.pathname === "/feedback") {
        return await handleFeedback(request, env, headers);
      }
      // Default route (also accepts "/" for backwards compatibility
      // with earlier front-end versions).
      return await handleChat(request, env, headers);
    } catch (err) {
      console.error("Worker error:", err);
      return json({ error: "Something broke" }, 500, headers);
    }
  },
};
