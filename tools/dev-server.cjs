// Local stand-in for Vercel: serves the static files, runs api/tasks.js, and
// fakes the Upstash REST endpoint with an in-memory hash.
//
//   node tools/dev-server.cjs            -> http://localhost:3000/#key=dev-key
//   PORT=4000 TODO_KEY=secret node tools/dev-server.cjs

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".css": "text/css" };

// One in-memory store: { [redisKey]: { [field]: value } }.
function fakeRedis(store, cmd) {
  const [op, name, a, b] = cmd;
  if (op === "DEL") {
    const had = name in store;
    delete store[name];
    return had ? 1 : 0;
  }
  const hash = store[name] || (store[name] = {});
  switch (op) {
    case "HGETALL": return [].concat(...Object.entries(hash));
    case "HGET": return hash[a] === undefined ? null : hash[a];
    case "HSET": { const isNew = !(a in hash); hash[a] = b; return isNew ? 1 : 0; }
    case "HDEL": { const had = a in hash; delete hash[a]; return had ? 1 : 0; }
    case "HLEN": return Object.keys(hash).length;
    default: throw new Error(`fake redis: unsupported ${op}`);
  }
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(data); }
    });
  });
}

function start(port, opts = {}) {
  const store = {};
  const hash = (store["desk-todo:tasks"] = {}); // the admin's list
  const state = { redisDown: false };
  process.env.TODO_KEY = opts.key || process.env.TODO_KEY || "dev-key";
  process.env.KV_REST_API_URL = `http://127.0.0.1:${port}/__redis`;
  process.env.KV_REST_API_TOKEN = "dev-token";
  const handlers = { "/api/tasks": require("../api/tasks.js"), "/api/people": require("../api/people.js") };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/__redis") {
      const cmd = await readJson(req);
      res.setHeader("Content-Type", "application/json");
      if (state.redisDown || req.headers.authorization !== "Bearer dev-token") {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: "down" }));
      }
      return res.end(JSON.stringify({ result: fakeRedis(store, cmd) }));
    }
    if (handlers[url.pathname]) {
      if (req.method === "POST") req.body = await readJson(req);
      return handlers[url.pathname](req, res);
    }
    const file = path.join(ROOT, url.pathname === "/" ? "index.html" : path.normalize(url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => server.listen(port, () => resolve({ server, hash, store, state })));
}

module.exports = { start };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  start(port).then(() => {
    console.log(`Computer: http://localhost:${port}/#key=${process.env.TODO_KEY}`);
    console.log(`iPad:     http://localhost:${port}/board.html#key=${process.env.TODO_KEY}`);
  });
}
