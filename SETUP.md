# Setting up Oliver's chat backend on Cloudflare Workers

This connects your live "Oliver" chatbot to a real Claude model, without
ever exposing your API key in the public GitHub Pages site.

## What you'll end up with
- A free Cloudflare Worker at a URL like
  `https://oliver-chat-worker.yoursubdomain.workers.dev`
- Your Anthropic API key stored as a secret on Cloudflare (never in your
  GitHub repo, never visible to site visitors)
- Your `script.js` pointed at that worker URL

---

## 1. Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign
   up or log in.
2. Go to **API Keys** and create a new key.
3. Copy it somewhere safe — you'll paste it once in step 4 and never
   need to put it in a file.
4. Add a small amount of credit to the account (Settings → Billing) —
   the API is pay-as-you-go, not part of a Claude.ai subscription.

## 2. Create a Cloudflare account

1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
   and make a free account.
2. No credit card needed for the free Workers tier (100,000 requests/day).

## 3. Install Wrangler (Cloudflare's CLI)

You'll need [Node.js](https://nodejs.org) installed first (any recent
LTS version). Then, in a terminal:

```bash
npm install -g wrangler
```

Log in:

```bash
wrangler login
```

This opens a browser window — approve access, then return to the
terminal.

## 4. Set up the worker project

1. Create a folder for the worker (separate from your GitHub Pages repo
   is fine, or a subfolder like `/worker` in the same repo):

   ```bash
   mkdir oliver-worker && cd oliver-worker
   ```

2. Drop in the two files I gave you: `worker.js` and `wrangler.toml`.

3. Add your API key as a secret (this prompts you to paste it — it does
   **not** get saved into any file you can accidentally commit):

   ```bash
   wrangler secret put ANTHROPIC_API_KEY
   ```

   Paste your key from step 1 when prompted, hit enter.

## 5. Deploy

```bash
wrangler deploy
```

Wrangler will print a URL when it's done, something like:

```
https://oliver-chat-worker.yoursubdomain.workers.dev
```

That's your live backend. Copy that URL.

## 6. Point your front-end at it

In `script.js`, find this line near the top:

```js
const WORKER_URL = "https://oliver-chat-worker.YOUR-SUBDOMAIN.workers.dev";
```

Replace it with the real URL Wrangler gave you. Commit and push to
GitHub, and your live site will now be talking to Claude for real.

## 6b. Create the KV namespace for feedback

This is what lets upvotes/downvotes steer Oliver's tone over time.

From inside `oliver-worker`:

```bash
wrangler kv namespace create FEEDBACK
```

This prints something like:

```
[[kv_namespaces]]
binding = "FEEDBACK"
id = "abc123yourrealidhere"
```

Copy that `id` value into your `wrangler.toml`, replacing
`PASTE_YOUR_KV_NAMESPACE_ID_HERE`. Then redeploy:

```bash
wrangler deploy
```

If you skip this step, the chat still works fine — voting just won't
persist or influence future replies (the worker silently no-ops if the
KV binding isn't there).

## 7. (Recommended) Lock down CORS

Right now the worker accepts requests from any website. Once you know
your GitHub Pages URL (e.g. `https://yourusername.github.io`), open
`wrangler.toml` and uncomment/set:

```toml
[vars]
ALLOWED_ORIGIN = "https://yourusername.github.io"
```

Then redeploy:

```bash
wrangler deploy
```

This stops other sites from quietly using your worker (and your API
credits) without permission.

## 8. Test it

Open your GitHub Pages site, type a message to Oliver, and you should
get a real, dynamic reply within a second or two. Check the Cloudflare
dashboard (Workers & Pages → your worker → Logs) if something doesn't
work — errors from the Anthropic API will show up there.

---

### Cost note
Claude API usage is billed per token, not a flat fee. A tribute chatbot
with short back-and-forth messages is cheap — typically fractions of a
cent per exchange — but keep an eye on usage in the Anthropic console,
especially once the CORS lockdown (step 7) is in place so random
traffic can't run up your bill.
