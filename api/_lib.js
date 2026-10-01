// Shared by the API functions. Vercel doesn't route files starting with "_".
//
// People and keys. TODO_KEY (env) is the admin: it owns the original list
// (desk-todo:tasks) and can manage everyone else. Everyone else has a key
// stored in the desk-todo:people hash:
//
//   desk-todo:people   key -> { id, name, created }
//   desk-todo:tasks:ID one field per task, like the admin's list
//
// Keys are stored in plain text so the admin page can always show a person's
// links again. They're only as secret as the database itself.

const crypto = require("crypto");

const PEOPLE = "desk-todo:people";
const ADMIN = { id: "admin", name: "", admin: true, hash: "desk-todo:tasks" };

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

function sameSecret(given, expected) {
  // Hash both sides so timingSafeEqual always compares equal lengths.
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// A warm function instance remembers recent key lookups for a minute, so most
// requests cost one Redis command, not two. A removed or reset key can
// therefore keep working for up to a minute on an instance that cached it.
const CACHE_MS = 60000;
const cache = new Map();

function forget(key) {
  cache.delete(key);
}

// Who is calling: the admin, a person, or null.
async function whoIs(req) {
  const key = req.headers["x-todo-key"];
  if (typeof key !== "string" || !key || key.length > 200) return null;
  if (sameSecret(key, process.env.TODO_KEY)) return ADMIN;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.person;

  const raw = await redis(["HGET", PEOPLE, key]);
  let person = null;
  if (raw) {
    const p = JSON.parse(raw);
    person = { id: p.id, name: p.name, admin: false, hash: `desk-todo:tasks:${p.id}` };
  }
  cache.set(key, { person, at: Date.now() });
  return person;
}

// Checks every endpoint shares: env configured, then the caller's key.
async function guard(req, res) {
  const { url, token } = redisConfig();
  if (!process.env.TODO_KEY) return send(res, 500, { error: "TODO_KEY is not set on the server." }), null;
  if (!url || !token) return send(res, 500, { error: "No Redis database is connected." }), null;
  const who = await whoIs(req);
  if (!who) return send(res, 401, { error: "Wrong or missing key." }), null;
  return who;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return {};
}

module.exports = { PEOPLE, redis, send, guard, readBody, forget };
