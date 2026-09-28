# Desk To-Do

A tiny two-column to-do list. Add tasks from your computer; an iPad mini on
your desk shows them and checks them off with a tap.

- **Computer** (`/`): add, edit, move between **To Do** and **Awaiting
  Response**, and complete tasks. Up to 10 tasks.
- **iPad** (`/board.html`): a dark, full-screen board. Tap a task to check it
  off; it disappears after 3 seconds (tap again to undo). Refreshes every 5
  seconds and says so if it loses the connection.

No framework, no build step, no dependencies. The board runs on iOS 12 Safari
(iPad mini 2–4).

## How it works

```
index.html + computer.js ─┐
                          ├─► api/tasks.js (Vercel function) ─► Upstash Redis (one hash)
board.html + board.js ────┘        checks X-Todo-Key against TODO_KEY
```

## Setup (about 5 minutes)

1. **Deploy.** In Vercel: *Add New → Project*, import `davshe06/desk-todo`.
   Framework preset **Other**; leave build settings empty. Deploy.
2. **Add storage.** In the project: *Storage → Create Database → Upstash for
   Redis* (free plan), and connect it to this project. That sets
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
3. **Set your key.** *Settings → Environment Variables*: add `TODO_KEY` with
   a long random value (for example the output of `openssl rand -hex 16`).
   Then *Deployments → Redeploy* so the function picks it up.
4. **Computer.** Open `https://<your-project>.vercel.app/#key=<TODO_KEY>` and
   bookmark it.
5. **iPad.** In Safari open
   `https://<your-project>.vercel.app/board.html#key=<TODO_KEY>`, then
   *Share → Add to Home Screen*. Open it from the home screen so it runs
   full-screen.
   - *Settings → Display & Brightness → Auto-Lock → Never*, and keep it
     plugged in.
   - Optional: *Settings → Accessibility → Guided Access* keeps it on this
     one app.

The key lives in the link, so treat the link like a password. If a key is
missing or wrong, either page asks for it.

## Developing

```sh
node tools/dev-server.cjs      # http://localhost:3000/#key=dev-key (fake in-memory Redis)
node tools/browser-test.cjs    # API + both pages in Chromium
```
