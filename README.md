# PulseBoard

A live "I'm lost" meter and anonymous question wall for classrooms, shown on the classroom board (BenQ display / projector).

- **Students** scan the QR code: 👍 Got it · 🐢 Slow down · 😵 I'm lost, plus anonymous questions. No app, no login.
- **The board** shows the lost meter, a question wall, a class timeline, and an alert when 30%+ of the class is lost.
- **AI summary** groups the questions into themes using a free AI model (keyword grouping if no key is set).

## Run it

```bash
npm install
npm run share
```

`npm run share` starts the server and a free cloudflared tunnel, so phones on any network can join. Open the **Board** link it prints on the big screen; the QR code points to the public link automatically.

`npm start` runs without the tunnel (phones must be on the same Wi-Fi). The server uses port 4300 (or the next free one, or `PORT` if set).

## Free AI for the summary (optional)

Set one key before starting. The first one found is used:

| Provider | Get a free key | Variable |
|---|---|---|
| Groq (fastest) | https://console.groq.com/keys | `GROQ_API_KEY` |
| Google Gemini | https://aistudio.google.com/apikey | `GEMINI_API_KEY` |
| OpenRouter | https://openrouter.ai/keys | `OPENROUTER_API_KEY` |
| Ollama (local, no key) | https://ollama.com | `AI_PROVIDER=ollama` |

Easiest: put it in the `.env` file in this folder (git-ignored), e.g. `GROQ_API_KEY=your-key`. Or set it in the terminal you start from:

```powershell
$env:GROQ_API_KEY = "your-key"; npm run share
```

The default Groq model is `openai/gpt-oss-120b`. If a model gets retired, the server picks a current one from the provider's list automatically; set `AI_MODEL` to choose one yourself. If the AI call fails for any other reason, the board falls back to keyword grouping, so the demo never breaks.

## Deploy to Render (free)

1. Push this repo to GitHub (`.env` is git-ignored, so your key stays local).
2. On [render.com](https://render.com): **New > Blueprint**, pick the repo. `render.yaml` sets up a free Node web service.
3. Paste your `GROQ_API_KEY` when asked, then **Apply**.
4. Open `https://<your-service>.onrender.com/board`. The QR code points to the Render link automatically.

The free tier sleeps after 15 minutes with no visitors; the next visit takes 30–60 s to wake it. Open the board a minute before you pitch.

## Demo tips

- **▶ Demo** simulates 36 students (a confusion wave peaks ~25 s in), in case the venue Wi-Fi fails.
- Click the QR code to show it full screen for the audience.
- **↺ New class** clears everything.
