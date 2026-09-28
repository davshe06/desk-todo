# Desk To-Do — working notes

Two-column to-do list (To Do / Awaiting Response), max 10 tasks. Added and
managed from a computer (`index.html` + `computer.js`), displayed and checked
off on an iPad mini (`board.html` + `board.js`). Backend is one Vercel
function, `api/tasks.js`, over one Upstash Redis hash (`desk-todo:tasks`, one
field per task so concurrent edits don't clobber each other).

## Rules

- **The iPad is an iPad mini 2–4: iOS 12 Safari.** Page code (`common.js`,
  `board.js`, `computer.js`) stays ES2017: no optional chaining, `??`, object
  spread, or `catch {}` without a binding. `board.html` CSS: no flex `gap`
  (Safari 14.1+); use margins. `<button>` can't be a flex container in old
  Safari; put a flex `<span>` inside.
- No framework, no build step, no dependencies.
- Auth is a shared secret: `TODO_KEY` env var ↔ `X-Todo-Key` header. The key
  rides in the URL hash (`#key=…`) because an iOS home-screen app has storage
  separate from Safari's.
- Redis env: `KV_REST_API_URL`/`KV_REST_API_TOKEN` (Vercel's Upstash
  integration) or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`.

- Check-off celebrations live in `celebrate.js` / `celebrate.css`, shared by
  both pages. iOS 12 has no `Element.animate()`: fixed motion is CSS
  keyframes (no `var()` inside them); random particle paths are CSS
  transitions on inline styles, started two animation frames after insert.
  Particles go in a fixed layer on `<body>` so list re-renders don't cut
  them off. Animate `transform`/`opacity` only (iPad mini 2 is an A7).

## Before committing

```sh
node tools/browser-test.cjs   # must pass; covers API, both pages, offline, 10-task fit
```

Chromium: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
