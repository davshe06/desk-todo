// Each person's task list. The key in X-Todo-Key decides whose list it is
// (see _lib.js); nobody can reach another person's list.
//
//   GET  /api/tasks                          -> { tasks, me }
//   POST /api/tasks { op: "add",  text, col } -> { tasks, me }
//   POST /api/tasks { op: "move", id, col }   -> { tasks, me }
//   POST /api/tasks { op: "edit", id, text }  -> { tasks, me }
//   POST /api/tasks { op: "done", id }        -> { tasks, me }
//
// Each task is one field of the person's hash, so a check-off on the iPad and
// an add on the computer never overwrite each other.
//
// A task is { id, text, col, created, touched }. `touched` is the last time it
// was actioned (added, its text changed, or moved between columns); the pages
// color a task by how long ago that was.

const crypto = require("crypto");
const { redis, send, guard, readBody } = require("./_lib.js");

const MAX_TASKS = 15;
const MAX_TEXT = 140;
const COLUMNS = ["todo", "waiting"];

function cleanText(text) {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) : "";
}

async function listTasks(hash) {
  const flat = (await redis(["HGETALL", hash])) || [];
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

async function getTask(hash, id) {
  if (typeof id !== "string") return null;
  const raw = await redis(["HGET", hash, id]);
  return raw ? JSON.parse(raw) : null;
}

function saveTask(hash, task) {
  return redis(["HSET", hash, task.id, JSON.stringify(task)]);
}

module.exports = async function handler(req, res) {
  let who;
  try {
    who = await guard(req, res);
  } catch (err) {
    console.error(err);
    return send(res, 502, { error: "Couldn't reach the database." });
  }
  if (!who) return;
  const hash = who.hash;
  const me = { name: who.name, admin: who.admin };

  try {
    if (req.method === "GET") return send(res, 200, { tasks: await listTasks(hash), me });
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
      if ((await redis(["HLEN", hash])) >= MAX_TASKS) {
        return send(res, 409, { error: `The list is full (${MAX_TASKS} tasks).`, tasks: await listTasks(hash), me });
      }
      const now = Date.now();
      await saveTask(hash, { id: crypto.randomUUID(), text, col, created: now, touched: now });
    } else if (body.op === "move" || body.op === "edit") {
      const task = await getTask(hash, body.id);
      if (task) {
        const text = cleanText(body.text);
        if (body.op === "move" && COLUMNS.includes(body.col) && body.col !== task.col) {
          task.col = body.col;
          task.touched = Date.now();
        }
        if (body.op === "edit" && text && text !== task.text) {
          task.text = text;
          task.touched = Date.now();
        }
        await saveTask(hash, task);
      }
    } else if (body.op === "done") {
      if (typeof body.id === "string") await redis(["HDEL", hash, body.id]);
    } else {
      return send(res, 400, { error: "Unknown op." });
    }

    return send(res, 200, { tasks: await listTasks(hash), me });
  } catch (err) {
    console.error(err);
    return send(res, 502, { error: "Couldn't reach the database." });
  }
};
