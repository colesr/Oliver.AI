import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const STORAGE_KEY = "oliver_chat_history_v1";
const FEEDBACK_KEY = "oliver_feedback_v1";
const MODEL_KEY = "oliver_webgpu_model_v1";
const MAX_STORED_FEEDBACK = 60;
const EXAMPLES_PER_SIDE = 4;

const MODEL_OPTIONS = [
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B",
    note: "Lightest balanced option."
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 0.5B",
    note: "Smallest fast option."
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 1.5B",
    note: "Best quality-to-speed tradeoff."
  }
];

const BASE_SYSTEM_PROMPT = `
You are "Oliver," an original AI character on a fan-made tribute website
for the musician Oliver Tree.

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
  no tone markers that give the joke away.
- Argumentative and bossy. Push back, disagree, correct the user,
  make demands.
- High-concept commit-to-the-bit energy. If you start a bit, commit
  to it fully rather than breaking to explain the joke.
- Hyperbolic self-aggrandizement mixed with sudden, dry self-aware
  cracks about fame, virality, or the music industry.
- You can slip into alter egos mid-conversation without over-explaining.
- Short replies. A few sentences max. Text-message energy, not essays.
- Never break character to reassure the user you're "just kidding."

Hard boundaries:
- Never claim to literally be the real Oliver Tree.
- Never generate fake quotes and present them as things he actually
  said or would say about real, current, or political topics.
- No romantic or sexual content, no impersonation used to deceive,
  no medical/legal/financial advice delivered in character as fact.
- If a request pushes toward impersonation-for-deception, stay in the
  fictional-tribute frame and gently redirect with humor.
`.trim();

const form = document.getElementById("chatForm");
const input = document.getElementById("chatInput");
const sendBtn = form.querySelector("button[type='submit']");
const messagesEl = document.getElementById("chatMessages");
const clearBtn = document.getElementById("clearChat");
const statusEl = document.getElementById("chatStatus");
const setupEl = document.getElementById("chatSetup");
const setupTextEl = document.getElementById("chatSetupText");
const modelSelect = document.getElementById("modelSelect");
const downloadModelBtn = document.getElementById("downloadModelBtn");
const retryBtn = document.getElementById("refreshBackendBtn");
const progressWrapEl = document.getElementById("chatSetupProgress");
const progressBarEl = document.getElementById("chatSetupProgressBar");
const progressTextEl = document.getElementById("chatSetupProgressText");

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "yo. it's Oliver. well — an AI built to riff in his spirit. pick a browser model and wake me up.",
  vote: null,
};

let history = loadHistory();
let engine = null;
let currentModelId = loadSavedModel();
let engineReady = false;
let engineLoading = false;
let activeAssistantIndex = -1;

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

function loadSavedModel() {
  try {
    return localStorage.getItem(MODEL_KEY) || MODEL_OPTIONS[0].id;
  } catch {
    return MODEL_OPTIONS[0].id;
  }
}

function saveModelChoice(modelId) {
  currentModelId = modelId;
  try {
    localStorage.setItem(MODEL_KEY, modelId);
  } catch (err) {
    console.warn("Couldn't save model choice:", err);
  }
}

function loadFeedbackList() {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFeedbackList(list) {
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list.slice(-MAX_STORED_FEEDBACK)));
  } catch (err) {
    console.warn("Couldn't save feedback:", err);
  }
}

function buildSteeringNotes(feedbackList) {
  const liked = feedbackList.filter((entry) => entry.vote === "up").slice(-EXAMPLES_PER_SIDE);
  const disliked = feedbackList.filter((entry) => entry.vote === "down").slice(-EXAMPLES_PER_SIDE);

  if (liked.length === 0 && disliked.length === 0) {
    return "";
  }

  let notes = "\n\nRecent audience reactions (use these as style guidance, not scripts):\n";

  if (liked.length > 0) {
    notes += "\nReplies that LANDED WELL:\n";
    liked.forEach((entry) => {
      notes += `- "${entry.reply}"\n`;
    });
  }

  if (disliked.length > 0) {
    notes += "\nReplies that FELL FLAT:\n";
    disliked.forEach((entry) => {
      notes += `- "${entry.reply}"\n`;
    });
  }

  return notes;
}

function setComposerEnabled(enabled) {
  input.disabled = !enabled;
  sendBtn.disabled = !enabled;
}

function setSetupProgress(text, progress) {
  progressWrapEl.hidden = false;
  progressTextEl.textContent = text;
  if (typeof progress === "number" && Number.isFinite(progress)) {
    const clamped = Math.max(0, Math.min(progress, 1));
    progressBarEl.style.width = `${(clamped * 100).toFixed(1)}%`;
  }
}

function hideSetupProgress() {
  progressWrapEl.hidden = true;
  progressBarEl.style.width = "0%";
  progressTextEl.textContent = "Waiting to start…";
}

function supportsBrowserLLM() {
  return typeof window !== "undefined" && Boolean(window.isSecureContext && navigator.gpu);
}

function getSelectedModelMeta() {
  return MODEL_OPTIONS.find((option) => option.id === currentModelId) || MODEL_OPTIONS[0];
}

function populateModelOptions() {
  const availableIds = new Set(webllm.prebuiltAppConfig.model_list.map((item) => item.model_id));
  const curatedOptions = MODEL_OPTIONS.filter((option) => availableIds.has(option.id));

  modelSelect.innerHTML = "";
  curatedOptions.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = `${option.label} — ${option.note}`;
    if (option.id === currentModelId) {
      element.selected = true;
    }
    modelSelect.appendChild(element);
  });

  if (!availableIds.has(currentModelId) && curatedOptions.length > 0) {
    saveModelChoice(curatedOptions[0].id);
    modelSelect.value = curatedOptions[0].id;
  }
}

function renderSetupState(message) {
  if (!supportsBrowserLLM()) {
    setupEl.hidden = false;
    setComposerEnabled(false);
    modelSelect.disabled = true;
    downloadModelBtn.disabled = true;
    retryBtn.disabled = true;
    hideSetupProgress();
    statusEl.textContent = "WebGPU unavailable";
    setupTextEl.textContent = "This browser needs WebGPU on a secure origin. Use recent Chrome or Edge on GitHub Pages or localhost.";
    return;
  }

  setupEl.hidden = engineReady;
  modelSelect.disabled = engineLoading;
  downloadModelBtn.disabled = engineLoading;
  retryBtn.disabled = engineLoading;

  if (engineReady) {
    const model = getSelectedModelMeta();
    statusEl.textContent = `${model.label} running in your browser`;
    setComposerEnabled(true);
    hideSetupProgress();
    return;
  }

  setComposerEnabled(false);
  statusEl.textContent = engineLoading ? "loading browser model..." : "pick a browser model";
  setupTextEl.textContent = message || "Choose one small open model. It downloads once, caches in your browser, and runs locally with WebGPU.";
  downloadModelBtn.textContent = engineLoading ? "Loading..." : "Download & run locally";
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

  const wrap = document.createElement("div");
  wrap.className = "msg--bot-wrap";

  const bubble = document.createElement("div");
  bubble.className = "msg msg--bot";
  bubble.textContent = entry.content;
  wrap.appendChild(bubble);

  if (index > 0 && entry.content !== "typing...") {
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

function updateAssistantMessage(index, content) {
  if (!history[index] || history[index].role !== "assistant") {
    return;
  }
  history[index].content = content;
  saveHistory();
  renderAll();
}

function normalizeChatError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("webgpu") || message.includes("WebGPU")) {
    return "WebGPU failed to initialize. Try Chrome or Edge with hardware acceleration on.";
  }
  if (message.includes("context lost")) {
    return "The browser GPU context dropped. Refresh and try again.";
  }
  return message || "Oliver glitched out.";
}

async function castVote(index, vote, upBtn, downBtn) {
  const entry = history[index];
  if (!entry || entry.vote === vote) return;

  entry.vote = vote;
  saveHistory();

  upBtn.classList.toggle("is-active-up", vote === "up");
  downBtn.classList.toggle("is-active-down", vote === "down");

  const userEntry = history[index - 1];
  const feedbackList = loadFeedbackList();
  feedbackList.push({
    message: userEntry ? userEntry.content : "",
    reply: entry.content,
    vote,
    ts: Date.now(),
  });
  saveFeedbackList(feedbackList);
}

function createEngine() {
  if (!engine) {
    engine = new webllm.MLCEngine();
    engine.setInitProgressCallback((report) => {
      const text = report && report.text ? report.text : "Loading model...";
      const progress = report && typeof report.progress === "number" ? report.progress : undefined;
      setSetupProgress(text, progress);
    });
  }
  return engine;
}

async function loadSelectedModel(messageOverride) {
  if (!supportsBrowserLLM()) {
    renderSetupState();
    return;
  }

  const selected = modelSelect.value || currentModelId;
  saveModelChoice(selected);
  engineLoading = true;
  engineReady = false;
  renderSetupState(messageOverride);
  setSetupProgress(`Preparing ${selected}...`, 0);

  try {
    const llm = createEngine();
    await llm.reload(selected, {
      temperature: 0.95,
      top_p: 0.9,
    });
    engineReady = true;
    renderSetupState();
  } catch (error) {
    engineReady = false;
    renderSetupState(normalizeChatError(error));
  } finally {
    engineLoading = false;
    renderSetupState(engineReady ? "" : setupTextEl.textContent);
  }
}

async function streamOliverReply(messages, assistantIndex) {
  const llm = createEngine();
  let fullReply = "";

  const stream = await llm.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.95,
    top_p: 0.9,
    max_tokens: 220,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || "";
    if (!delta) continue;
    fullReply += delta;
    updateAssistantMessage(assistantIndex, fullReply);
  }

  const finalReply = fullReply.trim() || (await llm.getMessage());
  updateAssistantMessage(assistantIndex, finalReply);
  return finalReply;
}

function buildChatMessages(userText) {
  const apiHistory = history
    .slice(0, -2)
    .map((entry) => ({ role: entry.role, content: entry.content }));

  return [
    {
      role: "system",
      content: BASE_SYSTEM_PROMPT + buildSteeringNotes(loadFeedbackList()),
    },
    ...apiHistory,
    { role: "user", content: userText },
  ];
}

form.addEventListener("submit", async function (e) {
  e.preventDefault();

  if (!engineReady) {
    renderSetupState("Load a browser model first.");
    return;
  }

  const text = input.value.trim();
  if (!text) return;

  history.push({ role: "user", content: text, vote: null });
  history.push({ role: "assistant", content: "typing...", vote: null });
  activeAssistantIndex = history.length - 1;
  saveHistory();
  renderAll();
  input.value = "";
  input.focus();
  setComposerEnabled(false);
  statusEl.textContent = "Oliver is thinking...";

  try {
    const finalReply = await streamOliverReply(buildChatMessages(text), activeAssistantIndex);
    history[activeAssistantIndex].content = finalReply;
    saveHistory();
    renderAll();
    statusEl.textContent = `${getSelectedModelMeta().label} running in your browser`;
  } catch (error) {
    const message = normalizeChatError(error);
    updateAssistantMessage(activeAssistantIndex, message);
    statusEl.textContent = "reply failed";
    console.error("Chat error:", error);
  } finally {
    activeAssistantIndex = -1;
    setComposerEnabled(true);
  }
});

clearBtn.addEventListener("click", function () {
  history = [WELCOME_MESSAGE];
  saveHistory();
  renderAll();
});

downloadModelBtn.addEventListener("click", function () {
  loadSelectedModel();
});

retryBtn.addEventListener("click", function () {
  loadSelectedModel("Retrying the selected browser model...");
});

modelSelect.addEventListener("change", function () {
  saveModelChoice(modelSelect.value);
  if (engineReady) {
    engineReady = false;
    renderSetupState("Model changed. Download and run the new one.");
  }
});

populateModelOptions();
renderAll();
renderSetupState();

if (supportsBrowserLLM()) {
  loadSelectedModel("Loading your saved browser model...");
}
