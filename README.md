# EduProtocol — School Management App with a Real Database

This package takes your single-file EduProtocol app and gives it **permanent,
server-side storage**. Before, everything lived in the browser's `localStorage`,
so data was stuck on one device and could be wiped by clearing the browser.
Now the data is stored in a real **SQLite database on the server**, shared
across every device and browser that opens the site.

The best part: **your app's own code did not have to change.** A tiny "sync
shim" is injected automatically. When the app saves, the data is pushed to the
server; when it loads, the data is pulled back.

---

## What's inside

```
eduprotocol/
  server.js        Node + Express server. Serves the app and the database API.
  sync-shim.js     Injected into the page; bridges localStorage <-> server.
  public/
    index.html     Your EduProtocol app (served by the server).
  package.json     Dependencies and the `start` script.
  Dockerfile       For container-based hosts.
  .gitignore
  data/            SQLite database lives here (created on first run).
```

### How the database works
- One table (`app_state`) holds the whole app document as JSON, keyed by a
  single row. A second table (`state_history`) keeps the last 50 snapshots so
  you have a rolling backup.
- API endpoints:
  - `GET  /api/health` — quick status check.
  - `GET  /api/state`  — read the saved data.
  - `PUT  /api/state`  — save data (used by the app while running).
  - `POST /api/state`  — save on tab close (via `sendBeacon`).

---

## Run it locally

Requires Node.js 16 or newer.

```bash
npm install
npm start
```

Then open <http://localhost:3000>. Register your school and start using it —
everything you enter is now saved in `data/eduprotocol.db`.

---

## Put it on the internet

Any host that runs a Node.js web service with a persistent disk works. The app
listens on the port given by the `PORT` environment variable (hosts set this
automatically).

> **Important about storage:** SQLite writes to a file on disk. Pick a host
> that gives you a **persistent disk / volume** and point `DATA_DIR` at it,
> otherwise the database is wiped on every redeploy. Each option below says how.

### Option A — Render (simple, free tier)
1. Push this folder to a GitHub repository.
2. On <https://render.com> create a **New > Web Service** from that repo.
3. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add a **Disk** (e.g. 1 GB) mounted at `/data`, then set an environment
   variable `DATA_DIR=/data`. This keeps your database across deploys.
5. Deploy. Render gives you a public `https://...onrender.com` URL.

### Option B — Railway
1. Push to GitHub, then on <https://railway.app> create a project from the repo.
2. Railway auto-detects Node and runs `npm start`.
3. Add a **Volume** mounted at `/data` and set `DATA_DIR=/data`.
4. Generate a public domain under the service's Networking settings.

### Option C — Fly.io (uses the Dockerfile)
1. Install the `flyctl` CLI and run `fly launch` in this folder (it detects the
   Dockerfile). Say no to deploying immediately.
2. Create a volume: `fly volumes create eduprotocol_data --size 1`.
3. In `fly.toml`, mount it and set the data dir:
   ```toml
   [env]
     DATA_DIR = "/data"
   [[mounts]]
     source = "eduprotocol_data"
     destination = "/data"
   ```
4. `fly deploy`. You get a public `https://<app>.fly.dev` URL.

### Option D — Any VPS / Docker host
```bash
docker build -t eduprotocol .
docker run -d -p 80:3000 -v /srv/eduprotocol-data:/data --name eduprotocol eduprotocol
```
The `-v` flag keeps the database on the host so it survives restarts.

---

## If you'd rather use a hosted (managed) database

SQLite is the simplest option and needs no extra service. If you specifically
want a managed cloud database (e.g. **Supabase/Postgres**), the same design
applies: keep the two endpoints (`GET`/`PUT /api/state`) and store the JSON
document in a one-row table. Swap the `better-sqlite3` calls in `server.js` for
a Postgres client (`pg`) writing to a `jsonb` column. The browser sync shim
does not change at all.

---

## Optional: lock it down

For a quick prototype the API is open. To require a shared secret:
1. Set an environment variable on your host: `APP_ACCESS_TOKEN=some-long-secret`.
2. Tell the page the same token by adding this one line in
   `public/index.html` just after `<head>`:
   ```html
   <script>window.EDUPROTOCOL_TOKEN = "some-long-secret";</script>
   ```
Then every read/write must carry the token. This is a light guard, not full
authentication — for real multi-school production you'd add per-user accounts
and server-side authorization.

---

## Notes & honest limitations
- The whole app document is saved as one JSON blob. That is perfect for this
  app's size and keeps the browser code untouched. If the data grows very large
  or you need many people editing the exact same second, move to per-record
  tables and row-level APIs.
- Keep backups: the `state_history` table holds the last 50 snapshots, and you
  can also copy `data/eduprotocol.db` at any time.
