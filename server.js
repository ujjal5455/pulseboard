// PulseBoard: a live "I'm lost" meter and anonymous question wall for classrooms.
const express = require('express');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

// Optional .env file for AI keys (GROQ_API_KEY=...), so they survive terminal restarts
if (fs.existsSync(path.join(__dirname, '.env'))) process.loadEnvFile(path.join(__dirname, '.env'));

const BASE_PORT = Number(process.env.PORT) || 4300; // 3000 is often taken by dev tools
let port = BASE_PORT; // moves up if the port is busy
const MOOD_TTL_MS = 2 * 60 * 1000;   // a tap counts for 2 minutes
const PRESENT_MS = 10 * 60 * 1000;   // phones seen in the last 10 min count as "in class"
const SAMPLE_MS = 3000;              // timeline resolution
const MAX_SAMPLES = 1200;            // ~1 hour of timeline
const MAX_QUESTIONS = 200;
const QUESTION_COOLDOWN_MS = 5000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ---------- State (in memory: a restart starts a fresh class) ----------
const students = new Map(); // clientId -> { mood, at, online, seen, lastQ, fake }
let questions = [];         // { id, text, at, fake }
let timeline = [];          // { t, lost, slow, joined }
let nextQuestionId = 1;

const isFresh = s => s.mood && Date.now() - s.at < MOOD_TTL_MS;

function stats() {
  const now = Date.now();
  const c = { ok: 0, slow: 0, lost: 0, joined: 0 };
  for (const s of students.values()) {
    if (s.online <= 0 && now - s.seen > PRESENT_MS) continue;
    c.joined++;
    if (isFresh(s)) c[s.mood]++;
  }
  const pct = n => Math.round((n / Math.max(c.joined, 1)) * 100);
  return { ...c, okPct: pct(c.ok), slowPct: pct(c.slow), lostPct: pct(c.lost) };
}

function addQuestion(text, fake = false) {
  const q = { id: nextQuestionId++, text, at: Date.now(), fake };
  questions.push(q);
  if (questions.length > MAX_QUESTIONS) questions.shift();
  io.to('board').emit('question', q);
}

function resetClass() {
  for (const s of students.values()) s.mood = null;
  questions = [];
  timeline = [];
  io.emit('reset');
}

// ---------- Demo mode: a simulated class, so the board looks alive without real phones ----------
const DEMO_SIZE = 36;
const DEMO_QUESTIONS = [
  "What's the actual difference between TCP and UDP?",
  'Why is UDP used for video calls if it loses packets?',
  'When would I pick UDP over TCP?',
  'Is TCP always slower than UDP?',
  'Can you explain the 3-way handshake again?',
  'What does SYN-ACK mean?',
  'Why does the handshake need 3 steps and not 2?',
  'How do I calculate the subnet mask for /26?',
  'How many hosts fit in a /24 subnet?',
  'Subnetting went too fast, can you redo the example?',
  'Will subnetting be in the exam?',
  'Can you share the slides after class?',
];
let demoTimer = null;

function startDemo() {
  if (demoTimer) return;
  for (let i = 0; i < DEMO_SIZE; i++) {
    students.set(`demo-${i}`, { mood: null, at: 0, online: 1, seen: Date.now(), fake: true });
  }
  let tick = 0;
  demoTimer = setInterval(() => {
    tick++;
    const wave = (1 - Math.cos(tick / 9)) / 2; // calm → confused → calm, every ~57 s
    for (const s of students.values()) {
      if (!s.fake || Math.random() > 0.3) continue;
      const r = Math.random();
      s.mood = r < wave * 0.6 ? 'lost' : r < wave * 0.6 + 0.2 ? 'slow' : 'ok';
      s.at = s.seen = Date.now();
    }
    if (tick % 3 === 0 && Math.random() < wave + 0.15) {
      addQuestion(DEMO_QUESTIONS[Math.floor(Math.random() * DEMO_QUESTIONS.length)], true);
    }
  }, 1000);
  io.to('board').emit('demo', true);
}

function stopDemo() {
  clearInterval(demoTimer);
  demoTimer = null;
  for (const [id, s] of students) if (s.fake) students.delete(id);
  questions = questions.filter(q => !q.fake);
  io.to('board').emit('demo', false);
  io.to('board').emit('questions', questions);
}

// ---------- AI summary: any free OpenAI-compatible provider, keyword grouping as fallback ----------
const PROVIDERS = {
  groq: { url: 'https://api.groq.com/openai/v1', keyVar: 'GROQ_API_KEY', model: 'openai/gpt-oss-120b' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai', keyVar: 'GEMINI_API_KEY', model: 'gemini-2.5-flash' },
  openrouter: { url: 'https://openrouter.ai/api/v1', keyVar: 'OPENROUTER_API_KEY', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  ollama: { url: 'http://localhost:11434/v1', keyVar: null, model: 'llama3.2' },
};

function pickProvider() {
  const name = process.env.AI_PROVIDER
    || Object.keys(PROVIDERS).find(n => PROVIDERS[n].keyVar && process.env[PROVIDERS[n].keyVar]);
  const p = PROVIDERS[name];
  if (!p) return null;
  return {
    name,
    url: process.env.AI_BASE_URL || p.url,
    key: p.keyVar ? process.env[p.keyVar] : '',
    model: process.env.AI_MODEL || p.model,
  };
}
const ai = pickProvider();
const authHeaders = () => (ai.key ? { Authorization: `Bearer ${ai.key}` } : {});

// Free models get retired often; if ours is gone, pick a current chat model from the provider's list
const MODEL_PREFERENCE = [/gpt-oss-120b/, /gemini-[\d.]+-flash$/, /llama.*70b/, /qwen/, /gpt-oss/, /flash/, /llama/];

async function pickModel() {
  const res = await fetch(`${ai.url}/models`, { headers: authHeaders(), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`could not list models (${res.status})`);
  let ids = (await res.json()).data.map(m => m.id.replace(/^models\//, ''));
  if (ai.name === 'openrouter') ids = ids.filter(id => id.endsWith(':free'));
  for (const re of MODEL_PREFERENCE) {
    const id = ids.find(i => re.test(i) && !/guard|whisper|tts|embed|vision|audio/i.test(i));
    if (id) return id;
  }
  throw new Error('no suitable chat model found');
}

async function chat(prompt) {
  const res = await fetch(`${ai.url}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ model: ai.model, temperature: 0.2, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(20000),
  });
  if (res.ok) return (await res.json()).choices?.[0]?.message?.content || '';
  const body = await res.text();
  const err = new Error(`${res.status} ${body.slice(0, 200)}`);
  err.modelMissing = res.status === 404 || /model_not_found|decommissioned|model.*(not exist|not found)/i.test(body);
  throw err;
}

async function aiSummary(texts) {
  const prompt = `Students in a live lecture sent these anonymous questions:
${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Group them into at most 4 themes of confusion, biggest first. Reply with JSON only, no other text:
{"themes":[{"title":"short theme name","count":<number of questions>,"example":"one representative question"}],"tip":"one short sentence the teacher can act on right now"}`;

  let text;
  try {
    text = await chat(prompt);
  } catch (e) {
    if (!e.modelMissing) throw e;
    const old = ai.model;
    ai.model = await pickModel();
    console.log(`  Model ${old} is unavailable, switched to ${ai.model}`);
    io.to('board').emit('config-changed');
    text = await chat(prompt);
  }
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  if (!Array.isArray(json.themes)) throw new Error('AI reply had no themes');
  return { themes: json.themes.slice(0, 4), tip: String(json.tip || '') };
}

const STOP_WORDS = new Set(`the and for are was were can could would should does did you your this that there these those
what why how when which who with about again from into than then not just any more most actually going get use used
using explain mean means difference between always need step steps after before class sir maam please also`.split(/\s+/));

// "subnetting", "subnets" -> "subnet" so related questions land in one group
const stem = w => (w.length > 5 ? w.replace(/(tting|ing|ed|es|s)$/, m => (m === 'tting' ? 't' : '')) : w);

function keywordSummary(texts) {
  const groups = new Map(); // stem -> question indexes
  const labels = new Map(); // stem -> shortest original word, for display
  texts.forEach((t, i) => {
    const words = (t.toLowerCase().match(/[a-z0-9/+-]{3,}/g) || []).filter(w => !STOP_WORDS.has(w));
    for (const s of new Set(words.map(stem))) groups.set(s, [...(groups.get(s) || []), i]);
    for (const w of words) {
      const s = stem(w);
      if (!labels.has(s) || w.length < labels.get(s).length) labels.set(s, w);
    }
  });
  const used = new Set();
  const themes = [];
  for (const [s, idxs] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const fresh = idxs.filter(i => !used.has(i));
    if (fresh.length < 2) continue;
    fresh.forEach(i => used.add(i));
    const word = labels.get(s);
    themes.push({ title: word.length <= 4 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1), count: fresh.length, example: texts[fresh[0]] });
    if (themes.length === 4) break;
  }
  const tip = themes.length
    ? `Most questions are about "${themes[0].title}". Worth a quick recap.`
    : 'Questions are spread out. No single topic stands out yet.';
  return { themes, tip };
}

// ---------- Public link (cloudflared quick tunnel) and QR code ----------
let publicUrl = process.env.PUBLIC_URL || null;

function lanIp() {
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|virtual|vmware|vbox|loopback|wsl/i.test(name)) continue;
    const v4 = list.find(i => i.family === 'IPv4' && !i.internal);
    if (v4) return v4.address;
  }
  return 'localhost';
}

function joinUrlFor(req) {
  if (publicUrl) return publicUrl;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (/^(localhost|127\.|\[::1\])/.test(host)) return `http://${lanIp()}:${port}`;
  return `${req.headers['x-forwarded-proto'] || req.protocol}://${host}`;
}

function startTunnel() {
  const knownPaths = [
    path.join(process.env['ProgramFiles(x86)'] || '', 'cloudflared', 'cloudflared.exe'),
    path.join(process.env.ProgramFiles || '', 'cloudflared', 'cloudflared.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
  ];
  const bin = process.env.CLOUDFLARED || knownPaths.find(p => fs.existsSync(p)) || 'cloudflared';
  const cf = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`]);
  cf.on('error', e => console.error(`  Could not start cloudflared (${e.message}). Install it or set CLOUDFLARED to its path.`));
  const onLog = buf => {
    const m = buf.toString().match(/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !publicUrl) {
      publicUrl = m[0];
      console.log(`\n  Public link ready: ${publicUrl}\n  Open the board at: ${publicUrl}/board\n`);
      io.to('board').emit('config-changed');
    }
  };
  cf.stdout.on('data', onLog);
  cf.stderr.on('data', onLog);
  process.on('exit', () => cf.kill());
  process.on('SIGINT', () => process.exit());
}

// ---------- HTTP routes ----------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'join.html')));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/api/config', async (req, res) => {
  const joinUrl = joinUrlFor(req);
  res.json({
    joinUrl,
    qr: await QRCode.toDataURL(joinUrl, { margin: 1, width: 600, errorCorrectionLevel: 'M' }),
    ai: ai ? `${ai.name} · ${ai.model}` : null,
  });
});

app.post('/api/summary', async (req, res) => {
  const texts = questions.map(q => q.text);
  if (!texts.length) return res.json({ source: 'none', themes: [], tip: 'No questions yet.' });
  if (ai) {
    try {
      const summary = await aiSummary(texts); // may switch ai.model, so build the label after
      return res.json({ source: `${ai.name} · ${ai.model}`, ...summary });
    } catch (e) {
      console.warn(`  AI summary failed, using keyword grouping: ${e.message}`);
    }
  }
  res.json({ source: 'keyword grouping', ...keywordSummary(texts) });
});

// ---------- Real-time events ----------
io.on('connection', socket => {
  const { role, clientId } = socket.handshake.auth || {};

  if (role === 'board') {
    socket.join('board');
    socket.emit('init', { stats: stats(), questions, timeline, demo: !!demoTimer });
    socket.on('reset', resetClass);
    socket.on('demo', on => (on ? startDemo() : stopDemo()));
    return;
  }

  const id = String(clientId || socket.id).slice(0, 64);
  const me = students.get(id) || { mood: null, at: 0, online: 0, seen: 0, lastQ: 0 };
  me.online++;
  me.seen = Date.now();
  students.set(id, me);
  socket.emit('hello', {
    mood: isFresh(me) ? me.mood : null,
    left: isFresh(me) ? MOOD_TTL_MS - (Date.now() - me.at) : 0,
    ttl: MOOD_TTL_MS,
  });

  socket.on('mood', mood => {
    if (!['ok', 'slow', 'lost', null].includes(mood)) return;
    me.mood = mood;
    me.at = me.seen = Date.now();
  });

  socket.on('question', (raw, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (text.length < 3) return reply({ ok: false, error: 'Type a little more.' });
    if (Date.now() - me.lastQ < QUESTION_COOLDOWN_MS) return reply({ ok: false, error: 'Wait a few seconds before sending another.' });
    me.lastQ = me.seen = Date.now();
    addQuestion(text);
    reply({ ok: true });
  });

  socket.on('disconnect', () => {
    me.online--;
    me.seen = Date.now();
  });
});

setInterval(() => io.to('board').emit('stats', stats()), 500);

setInterval(() => {
  const s = stats();
  if (!s.joined && !timeline.length) return; // don't record an empty room
  const point = { t: Date.now(), lost: s.lostPct, slow: s.slowPct, joined: s.joined };
  timeline.push(point);
  if (timeline.length > MAX_SAMPLES) timeline.shift();
  io.to('board').emit('sample', point);
}, SAMPLE_MS);

function onListenError(err) {
  if (err.code !== 'EADDRINUSE' || port >= BASE_PORT + 10) throw err;
  console.log(`  Port ${port} is busy, trying ${port + 1}...`);
  server.listen(++port);
}
server.on('error', onListenError);
server.once('listening', () => {
  server.off('error', onListenError);
  console.log(`\n  PulseBoard is running`);
  console.log(`  Board (teacher screen): http://localhost:${port}/board`);
  console.log(`  Students join (same Wi-Fi): http://${lanIp()}:${port}`);
  console.log(ai
    ? `  AI summary: ${ai.name} (${ai.model})`
    : '  AI summary: keyword grouping (set GROQ_API_KEY or GEMINI_API_KEY to use a free AI model)');
  if (process.argv.includes('--share')) startTunnel();
});
server.listen(port);
