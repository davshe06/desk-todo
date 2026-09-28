// The whole backend: one Vercel function over one Redis hash.
//
//   GET  /api/tasks                          -> { tasks }
//   POST /api/tasks { op: "add",  text, col } -> { tasks }
//   POST /api/tasks { op: "move", id, col }   -> { tasks }
//   POST /api/tasks { op: "edit", id, text }  -> { tasks }
//   POST /api/tasks { op: "done", id }        -> { tasks }
//
// Every request must send the secret from the TODO_KEY env var in the
// X-Todo-Key header. Each task is one field of the hash, so a check-off on
// the iPad and an add on the computer never overwrite each other.

const crypto = require("crypto");

const HASH = "desk-todo:tasks";
const MAX_TASKS = 10;
const MAX_TEXT = 140;
const COLUMNS = ["todo", "waiting"];

function redisConfig() {
  // Vercel's Upstash integration sets KV_*; a direct Upstash database sets UPSTASH_*.
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

async function redis(command) {
  const { url, token } = redisConfig();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `Redis HTTP ${res.status}`);
  return json.result;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function authorized(req) {
  const given = req.headers["x-todo-key"];
  if (typeof given !== "string" || !given) return false;
  // Hash both sides so timingSafeEqual always compares equal lengths.
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(process.env.TODO_KEY).digest();
  return crypto.timingSafeEqual(a, b);
}

function cleanText(text) {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) : "";
}

async function listTasks() {
  const flat = (await redis(["HGETALL", HASH])) || [];
  const tasks = [];
  for (let i = 0; i < flat.length; i += 2) {
    try {
      tasks.push(JSON.parse(flat[i + 1]));
    } catch {
      // A malformed field is skipped rather than breaking the whole list.
    }
  }
  return tasks.sort((a, b) => a.created - b.created);
}

async function getTask(id) {
  if (typeof id !== "string") return null;
  const raw = await redis(["HGET", HASH, id]);
  return raw ? JSON.parse(raw) : null;
}

function saveTask(task) {
  return redis(["HSET", HASH, task.id, JSON.stringify(task)]);
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return {};
}

module.exports = async function handler(req, res) {
  const { url, token } = redisConfig();
  if (!process.env.TODO_KEY) return send(res, 500, { error: "TODO_KEY is not set on the server." });
  if (!url || !token) return send(res, 500, { error: "No Redis database is connected." });
  if (!authorized(req)) return send(res, 401, { error: "Wrong or missing key." });

  try {
    if (req.method === "GET") return send(res, 200, { tasks: await listTasks() });
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return send(res, 405, { error: "Method not allowed." });
    }

    let body;
    try {
      body = await readBody(req);
    } catch {
      return send(res, 400, { error: "Body must be JSON." });
    }

    if (body.op === "add") {
      const text = cleanText(body.text);
      const col = COLUMNS.includes(body.col) ? body.col : "todo";
      if (!text) return send(res, 400, { error: "Task text is empty." });
      if ((await redis(["HLEN", HASH])) >= MAX_TASKS) {
        return send(res, 409, { error: `The list is full (${MAX_TASKS} tasks).`, tasks: await listTasks() });
      }
      await saveTask({ id: crypto.randomUUID(), text, col, created: Date.now() });
    } else if (body.op === "move" || body.op === "edit") {
      const task = await getTask(body.id);
      if (task) {
        if (body.op === "move" && COLUMNS.includes(body.col)) task.col = body.col;
        if (body.op === "edit" && cleanText(body.text)) task.text = cleanText(body.text);
        await saveTask(task);
      }
    } else if (body.op === "done") {
      if (typeof body.id === "string") await redis(["HDEL", HASH, body.id]);
    } else {
      return send(res, 400, { error: "Unknown op." });
    }

    return send(res, 200, { tasks: await listTasks() });
  } catch (err) {
    console.error(err);
    return send(res, 502, { error: "Couldn't reach the database." });
  }
};
