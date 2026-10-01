// The admin portal's API. Only the admin key (TODO_KEY) gets in.
//
//   GET  /api/people                       -> { people }
//   POST /api/people { op: "add", name }    -> { people, added }
//   POST /api/people { op: "rename", id, name }
//   POST /api/people { op: "reset", id }    -> new key; the old links stop working
//   POST /api/people { op: "remove", id }   -> deletes the person and their tasks
//
// people: [{ id, name, key, created, tasks }], tasks = how many they have.

const crypto = require("crypto");
const { PEOPLE, redis, send, guard, readBody, forget } = require("./_lib.js");

const MAX_NAME = 40;

function cleanName(name) {
  return typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "";
}

function newKey() {
  return crypto.randomBytes(18).toString("base64url");
}

async function listPeople() {
  const flat = (await redis(["HGETALL", PEOPLE])) || [];
  const people = [];
  for (let i = 0; i < flat.length; i += 2) {
    try {
      const p = JSON.parse(flat[i + 1]);
      people.push({ id: p.id, name: p.name, created: p.created, key: flat[i] });
    } catch {
      // Skip a malformed entry rather than hiding everyone.
    }
  }
  people.sort((a, b) => a.created - b.created);
  await Promise.all(people.map(async (p) => {
    p.tasks = (await redis(["HLEN", `desk-todo:tasks:${p.id}`])) || 0;
  }));
  return people;
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
  if (!who.admin) return send(res, 403, { error: "Only the admin key can manage people." });

  try {
    if (req.method === "GET") return send(res, 200, { people: await listPeople() });
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
      const name = cleanName(body.name);
      if (!name) return send(res, 400, { error: "Give them a name." });
      const person = { id: crypto.randomUUID(), name, created: Date.now() };
      const key = newKey();
      await redis(["HSET", PEOPLE, key, JSON.stringify(person)]);
      return send(res, 200, { people: await listPeople(), added: person.id });
    }

    // The rest act on an existing person, found by id.
    const people = await listPeople();
    const person = people.find((p) => p.id === body.id);
    if (!person) return send(res, 404, { error: "No such person.", people });
    const stored = { id: person.id, name: person.name, created: person.created };

    if (body.op === "rename") {
      const name = cleanName(body.name);
      if (!name) return send(res, 400, { error: "Give them a name." });
      stored.name = name;
      await redis(["HSET", PEOPLE, person.key, JSON.stringify(stored)]);
      forget(person.key);
    } else if (body.op === "reset") {
      await redis(["HSET", PEOPLE, newKey(), JSON.stringify(stored)]);
      await redis(["HDEL", PEOPLE, person.key]);
      forget(person.key);
    } else if (body.op === "remove") {
      await redis(["HDEL", PEOPLE, person.key]);
      await redis(["DEL", `desk-todo:tasks:${person.id}`]);
      forget(person.key);
    } else {
      return send(res, 400, { error: "Unknown op." });
    }

    return send(res, 200, { people: await listPeople() });
  } catch (err) {
    console.error(err);
    return send(res, 502, { error: "Couldn't reach the database." });
  }
};
