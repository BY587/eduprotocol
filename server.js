/*
 * EduProtocol server
 * ------------------
 * Serves the single-page app and gives it a REAL, permanent database.
 *
 * How it works:
 *  - The app keeps all its data in one JSON document (the `DB` object it
 *    already builds in the browser).
 *  - This server stores that document in a SQLite database on disk, so it
 *    survives page reloads, new devices and server restarts.
 *  - A tiny "sync shim" is injected into index.html automatically, so the
 *    app's own code does NOT need to be changed. When the app saves, the
 *    data is pushed to this server; when it loads, the data is pulled back.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'eduprotocol.db');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Optional shared access token. If APP_ACCESS_TOKEN is set, every /api/state
// request must carry it (?token=... or x-app-token header). Leave unset for
// an open prototype.
const ACCESS_TOKEN = process.env.APP_ACCESS_TOKEN || '';

// ---- Database bootstrap ---------------------------------------------------
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id         TEXT PRIMARY KEY,
    data       TEXT,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS state_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    data       TEXT,
    saved_at   TEXT
  );
`);

const STATE_ID = 'global';
const getState = db.prepare('SELECT data, updated_at FROM app_state WHERE id = ?');
const upsertState = db.prepare(`
  INSERT INTO app_state (id, data, updated_at) VALUES (@id, @data, @updated_at)
  ON CONFLICT(id) DO UPDATE SET data = @data, updated_at = @updated_at
`);
const insertHistory = db.prepare('INSERT INTO state_history (data, saved_at) VALUES (?, ?)');
const trimHistory = db.prepare(
  'DELETE FROM state_history WHERE id NOT IN (SELECT id FROM state_history ORDER BY id DESC LIMIT 50)'
);

// ---- App ------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ type: ['text/plain', 'application/*+json'], limit: '50mb' }));

function tokenOk(req) {
  if (!ACCESS_TOKEN) return true;
  const t = req.query.token || req.get('x-app-token') || '';
  return t === ACCESS_TOKEN;
}

app.get('/api/health', (req, res) => {
  const row = getState.get(STATE_ID);
  res.json({ ok: true, hasData: !!(row && row.data), updatedAt: row ? row.updated_at : null });
});

// Read the whole app state
app.get('/api/state', (req, res) => {
  if (!tokenOk(req)) return res.status(401).json({ ok: false, error: 'bad token' });
  const row = getState.get(STATE_ID);
  res.json({ ok: true, data: row ? row.data : null, updatedAt: row ? row.updated_at : null });
});

// Save the whole app state (PUT from fetch, POST from sendBeacon)
function saveHandler(req, res) {
  if (!tokenOk(req)) return res.status(401).json({ ok: false, error: 'bad token' });
  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) { /* treat as raw */ payload = { data: payload }; }
  }
  let data = payload && payload.data != null ? payload.data : payload;
  if (data != null && typeof data !== 'string') data = JSON.stringify(data);
  const when = new Date().toISOString();
  upsertState.run({ id: STATE_ID, data: data, updated_at: when });
  try { insertHistory.run(data, when); trimHistory.run(); } catch (e) {}
  res.json({ ok: true, updatedAt: when });
}
app.put('/api/state', saveHandler);
app.post('/api/state', saveHandler);

// ---- Static files with auto-injected sync shim ----------------------------
const SHIM = fs.readFileSync(path.join(__dirname, 'sync-shim.js'), 'utf8');

function serveIndex(res) {
  const file = path.join(PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(file)) {
    return res.status(500).send('public/index.html not found. Put your app HTML there.');
  }
  let html = fs.readFileSync(file, 'utf8');
  const inject = '<script data-eduprotocol-sync>\n' + SHIM + '\n</script>';
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => m + '\n' + inject);
  } else {
    html = inject + html;
  }
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
}

app.get('/', (req, res) => serveIndex(res));
app.get('/index.html', (req, res) => serveIndex(res));
app.use(express.static(PUBLIC_DIR));

app.listen(PORT, () => {
  console.log(`EduProtocol running on http://127.0.0.1:${PORT}`);
  console.log(`Database file: ${DB_FILE}`);
  if (ACCESS_TOKEN) console.log('Access token protection: ON');
});
