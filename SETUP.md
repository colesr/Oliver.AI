# Running Oliver in the browser with WebGPU

Oliver now runs fully in the browser with WebGPU through WebLLM. There is
no Ollama server, no Node chat backend, and no cloud API key in the live
chat path.

## What this means

- The first model download happens once per browser profile
- After that, the model is cached and reused locally
- Chat history and vote feedback stay in browser storage
- This architecture can be hosted on GitHub Pages because it is static

## Browser requirements

- Recent **Chrome** or **Edge** recommended
- **WebGPU** must be available
- Use a **secure origin**: GitHub Pages (`https://...`) or localhost

## Local preview

If you want to preview the site locally before pushing:

```bash
npm start
```

Then open:

```text
http://127.0.0.1:3000
```

## First run

1. Open the page
2. Pick a browser model
3. Click **Download & run locally**
4. Wait for the download/caching progress to finish
5. Start chatting

## Suggested models

- `Llama-3.2-1B-Instruct-q4f16_1-MLC` — lightest balanced option
- `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` — smallest fast option
- `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` — best quality/speed tradeoff

## GitHub Pages

To publish this version on GitHub Pages, deploy the contents of
`ProductionFiles\` as your static site. No backend deployment is required
for chat anymore.
