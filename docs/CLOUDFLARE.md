# Turning on the AI characters

Out of the box, Bolt and the villagers speak from a short list of scripted lines. This guide connects them to Claude so they can hold a real conversation. It takes about 15 minutes, once.

## How it works

The game is a public web page, so it can never hold your API key. Instead, a small program called a Worker runs on your free Cloudflare account and holds the key for you:

```
tablet  ->  your Worker (has the key, checks the family code)  ->  Claude
```

The Worker only answers when both of these are true:

- the request comes from the game's own address (`https://brandonrussell.io`), and
- it carries your **family code**, a passphrase you choose and type into the game once per device.

The Worker also decides who each character is and what they may talk about. Nothing typed into the game can change those rules. They live in `worker/src/index.ts` if you want to read or adjust them.

## What you need

- An Anthropic API key. Create one at <https://console.anthropic.com> under **API keys**. It starts with `sk-ant-`.
- A free Cloudflare account: <https://dash.cloudflare.com/sign-up>.
- This project on your PC, with Node.js installed (you already have both).

## Steps

Open a terminal in the project's `worker` folder for all of these.

1. **Install the Worker's tools**

   ```
   cd worker
   npm install
   ```

2. **Log in to Cloudflare.** This opens your browser; click **Allow**.

   ```
   npx wrangler login
   ```

3. **Publish the Worker**

   ```
   npx wrangler deploy
   ```

   The first time, Cloudflare asks you to pick a `workers.dev` subdomain; any name is fine. When it finishes it prints the Worker's address, something like:

   ```
   https://oliverblox-ai.your-name.workers.dev
   ```

   Copy that address.

4. **Give the Worker your API key.** Paste the key when asked. It is stored encrypted at Cloudflare and never appears in the code or on GitHub.

   ```
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

5. **Choose a family code.** Any phrase you will remember, for example three random words.

   ```
   npx wrangler secret put FAMILY_CODE
   ```

6. **Tell the game.** On each device Oliver plays on:

   - Open the game and press Play.
   - Press and hold the gear button (top right) for two seconds.
   - Paste the Worker address into **AI helper address**.
   - Type the family code into **Family code**.
   - Press **Save**.

7. **Try it.** Tap the robot button to talk to Bolt, type or say something, and he should answer in his own words. If he answers with one of the scripted lines instead, open the grown-ups panel again: the transcript shows a line such as `(AI error 401 ...)` that tells you what went wrong (see Troubleshooting).

## Keeping costs and content in check

- **Set a spending cap.** In the Anthropic console, under **Settings > Limits**, set a monthly limit you are comfortable with. This is the real safety net: once it is reached, the characters fall back to their scripted lines and nothing more is charged.
- **Expected cost.** The Worker uses Claude Haiku 5.5, the cheapest current model, and asks for very short replies, so a reply should cost a small fraction of a cent. I have not measured this against real play, so check the console's usage page after the first session.
- **A smarter model.** If the characters seem too simple, change `MODEL` in `worker/src/index.ts` to `claude-opus-5-5` and run `npx wrangler deploy` again. It costs roughly forty times more per reply.
- **Read what was said.** The grown-ups panel shows everything Oliver and the characters have said on that device.
- **Change the rules.** Edit the `RULES` text or the character descriptions in `worker/src/index.ts`, then run `npx wrangler deploy`.
- **Turn it off.** Clear the address in the grown-ups panel on a device, or delete the Worker from the Cloudflare dashboard.

## Troubleshooting

| Transcript shows | Meaning | Fix |
| --- | --- | --- |
| `AI error 401` | Wrong family code | Re-enter it in the grown-ups panel, or set it again with step 5 |
| `AI error 403` | The game is being played from an address the Worker does not allow | Add the address to `ALLOWED_ORIGINS` in `worker/wrangler.toml` and deploy again |
| `AI error 502` | Claude rejected the request, most often a mistyped API key or the spending cap | Repeat step 4, and check the Anthropic console |
| `AI error 429` | Too many requests at once | Wait a moment |
| `could not reach the AI` | The Worker address is wrong or the device is offline | Check the address in the grown-ups panel |

To watch the Worker's own log while you test, run `npx wrangler tail` in the `worker` folder.

## What has and has not been tested

The Worker's gatekeeping was tested locally: it refused requests from other sites, with a wrong family code, and with malformed content, and it passed a request through to Anthropic. That last test used a fake key, so a real conversation has not been run yet. Step 7 is the first real one.
