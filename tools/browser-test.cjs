// End-to-end test: the API, the computer page, and the iPad board, against
// the local dev server with a fake Redis. Fails on any page error.
//
//   node tools/browser-test.cjs [screenshot-dir]

const assert = require("assert");
const path = require("path");
const { start } = require("./dev-server.cjs");

function loadPlaywright() {
  try { return require("playwright"); } catch { return require("/opt/node22/lib/node_modules/playwright"); }
}
const { chromium } = loadPlaywright();

const PORT = 3917;
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = "test-key-123";
const SHOTS = process.argv[2];

async function api(method, body, key = KEY) {
  const res = await fetch(`${BASE}/api/tasks`, {
    method,
    headers: { "Content-Type": "application/json", "X-Todo-Key": key },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

async function testApi(hash) {
  assert.equal((await api("GET", null, "wrong")).status, 401, "wrong key rejected");
  assert.equal((await api("GET", null, "")).status, 401, "missing key rejected");
  assert.deepEqual((await api("GET")).json.tasks, [], "starts empty");

  let r = await api("POST", { op: "add", text: "  Send   invoice ", col: "todo" });
  assert.equal(r.status, 200);
  assert.equal(r.json.tasks[0].text, "Send invoice", "whitespace collapsed");
  const id = r.json.tasks[0].id;

  assert.equal((await api("POST", { op: "add", text: "   " })).status, 400, "empty text rejected");
  assert.equal((await api("POST", { op: "nope" })).status, 400, "unknown op rejected");
  r = await api("POST", { op: "add", text: "x".repeat(300), col: "bogus" });
  assert.equal(r.json.tasks[1].text.length, 140, "text capped");
  assert.equal(r.json.tasks[1].col, "todo", "bad column falls back to todo");

  assert.ok(r.json.tasks[0].touched >= r.json.tasks[0].created, "new task is touched");

  // Moving or editing resets the age clock; a no-op edit or move doesn't.
  const backdate = () => {
    const t = JSON.parse(hash[id]);
    t.touched = 1000;
    hash[id] = JSON.stringify(t);
  };
  const touchedNow = (res) => res.json.tasks.find((t) => t.id === id).touched;
  backdate();
  r = await api("POST", { op: "move", id, col: "waiting" });
  assert.equal(r.json.tasks.find((t) => t.id === id).col, "waiting", "move");
  assert.ok(touchedNow(r) > 1000, "move touches");
  backdate();
  r = await api("POST", { op: "move", id, col: "waiting" });
  assert.equal(touchedNow(r), 1000, "move to the same column doesn't touch");
  r = await api("POST", { op: "edit", id, text: "Send Q3 invoice" });
  assert.equal(r.json.tasks.find((t) => t.id === id).text, "Send Q3 invoice", "edit");
  assert.ok(touchedNow(r) > 1000, "edit touches");
  backdate();
  r = await api("POST", { op: "edit", id, text: "Send Q3 invoice" });
  assert.equal(touchedNow(r), 1000, "unchanged edit doesn't touch");

  for (let i = 0; i < 13; i++) await api("POST", { op: "add", text: `t${i}` });
  r = await api("POST", { op: "add", text: "sixteenth" });
  assert.equal(r.status, 409, "16th task refused");
  assert.equal(r.json.tasks.length, 15);

  r = await api("POST", { op: "done", id });
  assert.ok(!r.json.tasks.some((t) => t.id === id), "done removes");
  assert.equal((await api("PUT")).status, 405);

  for (const k of Object.keys(hash)) delete hash[k];
  console.log("✓ API");
}

async function waitText(page, selector, text, timeout = 12000) {
  await page.waitForFunction(
    ([s, t]) => Array.from(document.querySelectorAll(s)).some((n) => n.textContent.includes(t)),
    [selector, text],
    { timeout }
  );
}

async function run() {
  const { server, hash, state } = await start(PORT, { key: KEY });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const errors = [];
  const watch = (page, name) => {
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    page.on("console", (m) => {
      // A deliberate 401/5xx in these tests logs a failed-resource line; those are expected.
      if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`);
    });
  };

  try {
    await testApi(hash);

    // Computer page: no key yet → the key card; a wrong key → asked again.
    const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    watch(desk, "computer");
    await desk.goto(BASE + "/");
    await desk.waitForSelector("#key-gate:not([hidden])");
    await desk.fill("#key-input", "wrong");
    await desk.click("#key-form button");
    await waitText(desk, "#key-message", "didn't work");
    await desk.fill("#key-input", KEY);
    await desk.click("#key-form button");
    await waitText(desk, "#status-text", "Synced");
    assert.ok(desk.url().includes("#key=" + KEY), "key kept in URL for bookmarking");

    // Add with Enter and with the button, to both columns.
    await desk.fill("#new-task", "Send Q3 invoice");
    await desk.press("#new-task", "Enter");
    await desk.fill("#new-task", "Book dentist");
    await desk.click("#add");
    await desk.click('.seg button[data-col="waiting"]');
    await desk.fill("#new-task", "Contract redlines from legal");
    await desk.press("#new-task", "Enter");
    await waitText(desk, "#list-waiting", "Contract redlines");
    await waitText(desk, "#status-text", "Synced");
    assert.equal(Object.keys(hash).length, 3, "three tasks stored");
    assert.equal(await desk.textContent("#count-todo"), "2");

    // Edit in place.
    await desk.click('#list-todo .text:has-text("Book dentist")');
    await desk.fill("#list-todo .edit", "Book dentist appointment");
    await desk.press("#list-todo .edit", "Enter");
    await waitText(desk, "#list-todo", "Book dentist appointment");
    await waitText(desk, "#status-text", "Synced");

    // iPad board: an iPad-sized touch viewport.
    const ipad = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
    watch(ipad, "board");
    await ipad.goto(`${BASE}/board.html#key=${KEY}`);
    await waitText(ipad, "#list-todo", "Book dentist appointment");
    await waitText(ipad, "#list-waiting", "Contract redlines");
    await waitText(ipad, "#fresh", "Updated just now");
    if (SHOTS) await ipad.screenshot({ path: path.join(SHOTS, "board.png") });

    // Tap, then tap again within 3 seconds: undone, still there.
    const row = ipad.locator('.task:has-text("Send Q3 invoice")');
    await row.tap();
    await ipad.waitForSelector('.task.done:has-text("Send Q3 invoice")');
    await waitText(ipad, ".task.done", "Tap to undo");
    if (SHOTS) await ipad.screenshot({ path: path.join(SHOTS, "board-checked.png") });
    await row.tap();
    await ipad.waitForTimeout(3500);
    assert.equal(await ipad.locator('.task:not(.done):has-text("Send Q3 invoice")').count(), 1, "undo keeps the task");

    // Tap and leave it: gone from the iPad, the store, and the computer.
    await row.tap();
    await ipad.waitForSelector('.task:has-text("Send Q3 invoice")', { state: "detached", timeout: 5000 });
    await new Promise((r) => setTimeout(r, 500));
    assert.ok(!JSON.stringify(hash).includes("Send Q3 invoice"), "deleted on the server");
    await desk.waitForFunction(() => !document.querySelector("#list-todo").textContent.includes("Send Q3 invoice"), null, { timeout: 12000 });

    // Move and complete on the computer; the board follows.
    await desk.click('#list-todo .task:has-text("Book dentist") .move');
    await waitText(ipad, "#list-waiting", "Book dentist appointment");
    await desk.click('#list-waiting .task:has-text("Contract redlines") .check');
    await ipad.waitForFunction(() => !document.body.textContent.includes("Contract redlines"), null, { timeout: 12000 });
    await waitText(desk, "#list-todo", "Nothing to do");
    await waitText(ipad, "#list-todo", "All clear");

    // Fill to fifteen: the Add button disables and the board tightens a long column.
    for (let i = 1; i <= 14; i++) {
      await desk.fill("#new-task", `Task number ${i}`);
      await desk.press("#new-task", "Enter");
    }
    await waitText(desk, "#slots", "15");
    await waitText(desk, "#status-text", "Synced");
    assert.ok(await desk.isDisabled("#add"), "add disabled at fifteen");
    await desk.fill("#new-task", "one too many");
    await desk.press("#new-task", "Enter");
    await waitText(desk, "#status-text", "full");
    await waitText(ipad, "#count-waiting", "15");
    assert.ok((await ipad.getAttribute("#col-waiting", "class")).includes("dense"), "long column goes dense");
    const overflow = await ipad.evaluate(() => {
      const c = document.getElementById("col-waiting");
      return c.scrollHeight - c.clientHeight;
    });
    assert.ok(overflow <= 0, `fifteen tasks fit on the iPad without scrolling (overflow ${overflow}px)`);
    if (SHOTS) await desk.screenshot({ path: path.join(SHOTS, "computer-full.png") });
    if (SHOTS) await ipad.screenshot({ path: path.join(SHOTS, "board-full.png") });

    // Losing the connection: after a minute the board says so.
    const stale = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    watch(stale, "stale-board");
    await stale.clock.install();
    await stale.goto(`${BASE}/board.html#key=${KEY}`);
    await waitText(stale, "#fresh", "Updated just now");
    state.redisDown = true;
    await stale.clock.fastForward(70000);
    await stale.clock.runFor(11000);
    await waitText(stale, "#fresh", "Offline");
    assert.ok((await stale.getAttribute("#board", "class")).includes("stale"));
    if (SHOTS) await stale.screenshot({ path: path.join(SHOTS, "board-offline.png") });
    state.redisDown = false;

    // A bad stored key on the board asks again.
    const badKey = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    watch(badKey, "bad-key-board");
    await badKey.goto(`${BASE}/board.html#key=nope`);
    await badKey.waitForSelector("#key-gate:not([hidden])");

    // Portrait iPad still shows both columns.
    await ipad.setViewportSize({ width: 768, height: 1024 });
    if (SHOTS) await ipad.screenshot({ path: path.join(SHOTS, "board-portrait.png") });

    // Narrow computer window stacks the columns without sideways scrolling.
    await desk.setViewportSize({ width: 390, height: 844 });
    const sideways = await desk.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(sideways <= 0, "no horizontal scroll at 390px");

    // Every celebration, forced with &fx=: plays on tap, cleans up on undo, and the task still leaves.
    for (const k of Object.keys(hash)) delete hash[k];
    for (const fx of ["confetti", "sparkles", "rocket", "balloons", "stamp"]) {
      await api("POST", { op: "add", text: `Celebrate with ${fx}`, col: "todo" });
      await api("POST", { op: "add", text: "Stays put", col: "waiting" });
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
      watch(page, `board-${fx}`);
      await page.goto(`${BASE}/board.html#key=${KEY}&fx=${fx}`);
      const task = page.locator(`.task:has-text("Celebrate with ${fx}")`);
      await task.waitFor();
      await task.tap();
      await page.waitForTimeout(fx === "balloons" ? 900 : 350);
      const particles = await page.evaluate(() => (document.querySelector(".fx-layer") || { children: [] }).children.length);
      assert.ok(particles > 0, `${fx}: particles on tap`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `fx-board-${fx}.png`) });
      if (fx === "stamp") {
        await task.tap(); // undo takes the stamp away
        assert.equal(await page.locator(".fx-stamp").count(), 0, "undo removes the stamp");
        await page.waitForTimeout(400);
        await task.tap();
      }
      await page.waitForSelector(`.task:has-text("Celebrate with ${fx}")`, { state: "detached", timeout: 6000 });
      await page.waitForTimeout(300);
      assert.equal(await page.locator(".fx-stamp").count(), 0, `${fx}: nothing left behind`);
      assert.ok(!JSON.stringify(hash).includes(`Celebrate with ${fx}`), `${fx}: deleted on the server`);
      assert.equal(await page.locator('.task:has-text("Stays put")').count(), 1, `${fx}: other tasks untouched`);
      await page.close();

      // The computer page gets the same effect.
      await api("POST", { op: "add", text: `Desk ${fx}`, col: "todo" });
      const deskFx = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      watch(deskFx, `computer-${fx}`);
      await deskFx.goto(`${BASE}/#key=${KEY}&fx=${fx}`);
      await waitText(deskFx, "#list-todo", `Desk ${fx}`);
      await deskFx.click(`#list-todo .task:has-text("Desk ${fx}") .check`);
      await deskFx.waitForTimeout(fx === "balloons" ? 900 : 300);
      if (SHOTS) await deskFx.screenshot({ path: path.join(SHOTS, `fx-computer-${fx}.png`) });
      await deskFx.waitForFunction((t) => !document.querySelector("#list-todo").textContent.includes(t), `Desk ${fx}`, { timeout: 5000 });
      await waitText(deskFx, "#status-text", "Synced");
      assert.ok(!JSON.stringify(hash).includes(`Desk ${fx}`), `${fx}: computer check-off deleted on the server`);
      await deskFx.close();
      for (const k of Object.keys(hash)) delete hash[k];
    }
    console.log("✓ Celebrations (all five, both pages)");

    // Age colors: fresh, 6 hours (orange), 27 hours (red), and an old task with no `touched` (uses created).
    for (const k of Object.keys(hash)) delete hash[k];
    const HOUR = 3600000;
    const seed = (id, text, col, hoursAgo, field = "touched") => {
      const t = { id, text, col, created: Date.now() - hoursAgo * HOUR };
      if (field === "touched") t.touched = Date.now() - hoursAgo * HOUR;
      hash[id] = JSON.stringify(t);
    };
    seed("a1", "Fresh task", "todo", 1);
    seed("a2", "Six hours old", "todo", 6);
    seed("a3", "Over a day old", "waiting", 27);
    seed("a4", "Legacy task", "waiting", 30, "created");
    for (const [name, url, sel] of [
      ["board", `${BASE}/board.html#key=${KEY}`, ".task"],
      ["computer", `${BASE}/#key=${KEY}`, ".task"],
    ]) {
      const page = await browser.newPage({ viewport: name === "board" ? { width: 1024, height: 768 } : { width: 1280, height: 800 } });
      watch(page, `ages-${name}`);
      await page.goto(url);
      await waitText(page, "#list-waiting", "Legacy task");
      const ages = await page.evaluate((s) => Array.from(document.querySelectorAll(s)).map((r) => ({
        text: r.textContent, warn: r.classList.contains("age-warn"), alert: r.classList.contains("age-alert"),
        badge: r.querySelector(".age").textContent,
      })), sel);
      const find = (t) => ages.find((a) => a.text.includes(t));
      assert.ok(!find("Fresh task").warn && !find("Fresh task").alert && find("Fresh task").badge === "", `${name}: fresh is plain`);
      assert.ok(find("Six hours old").warn && find("Six hours old").badge === "6h", `${name}: 6h is orange`);
      assert.ok(find("Over a day old").alert && find("Over a day old").badge === "1d 3h", `${name}: 27h is red`);
      assert.ok(find("Legacy task").alert, `${name}: falls back to created`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `ages-${name}.png`) });
      await page.close();
    }
    // Moving the red task on the computer resets it to plain on the board.
    const mover = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    watch(mover, "ages-move");
    await mover.goto(`${BASE}/#key=${KEY}`);
    await mover.click('#list-waiting .task:has-text("Over a day old") .move');
    await mover.waitForFunction(() => {
      const r = Array.from(document.querySelectorAll("#list-todo .task")).find((n) => n.textContent.includes("Over a day old"));
      return r && !r.classList.contains("age-alert");
    });
    await waitText(mover, "#status-text", "Synced");
    assert.ok(JSON.parse(hash.a3).touched > Date.now() - 60000, "move reset the clock on the server");
    await mover.close();
    console.log("✓ Age colors");

    // Keep-awake: the board offers a hint and survives whichever path the browser takes.
    const awake = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    watch(awake, "keepawake");
    await awake.goto(`${BASE}/board.html#key=${KEY}`);
    await awake.waitForSelector("#awake-hint", { state: "attached" });
    await awake.tap("header");
    await awake.waitForTimeout(500);
    await awake.close();

    assert.deepEqual(errors, [], "no page errors");
    console.log("✓ Computer page");
    console.log("✓ iPad board");
    console.log("All tests passed.");
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
