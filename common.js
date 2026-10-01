// Shared by both pages. Written for iOS 12 Safari (iPad mini 2–4):
// ES2017 at most — no optional chaining, no ??, no object spread.
(function () {
  "use strict";

  var KEY_STORE = "desk-todo-key";

  // The key arrives once as #key=… in the URL and is remembered. It stays
  // in the URL too, because an iPad home-screen app keeps its own storage,
  // separate from Safari's, and starts from the URL it was saved with.
  function getKey() {
    var m = location.hash.match(/key=([^&]+)/);
    if (m) {
      var k = decodeURIComponent(m[1]);
      try { localStorage.setItem(KEY_STORE, k); } catch (e) { /* private mode */ }
      return k;
    }
    try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; }
  }

  // Puts the key in the URL, keeping any other settings there (fx=, poll=, …).
  function setKey(k) {
    try { localStorage.setItem(KEY_STORE, k); } catch (e) { /* private mode */ }
    var rest = location.hash.replace(/^#/, "").split("&").filter(function (p) {
      return p && p.indexOf("key=") !== 0;
    });
    history.replaceState(null, "", location.pathname + location.search + "#" + ["key=" + encodeURIComponent(k)].concat(rest).join("&"));
  }

  function clearKey() {
    try { localStorage.removeItem(KEY_STORE); } catch (e) { /* private mode */ }
    history.replaceState(null, "", location.pathname + location.search);
  }

  // Resolves with the whole JSON reply; rejects with err.status and err.json.
  function call(path, method, body) {
    var opts = {
      method: method,
      headers: { "Content-Type": "application/json", "X-Todo-Key": getKey() }
    };
    if (body) opts.body = JSON.stringify(body);
    // The timestamp defeats any cache old Safari might apply to GETs.
    return fetch(path + "?t=" + Date.now(), opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var err = new Error(json.error || "HTTP " + res.status);
          err.status = res.status;
          err.json = json;
          err.tasks = json.tasks;
          throw err;
        }
        return json;
      });
    });
  }

  // Task calls resolve with the task list; `me` (whose list this is) is kept on DeskTodo.me.
  function request(method, body) {
    return call("api/tasks", method, body).then(function (json) {
      if (json.me) window.DeskTodo.me = json.me;
      return json.tasks || [];
    });
  }

  function hashParam(name) {
    var m = location.hash.match(new RegExp("[#&]" + name + "=([^&]+)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // How often to check for changes. #…&poll=2 (seconds) overrides it, for testing.
  function pollMs(normal) {
    var s = Number(hashParam("poll"));
    return s > 0 ? s * 1000 : normal;
  }

  // The board stops checking overnight, 8 PM to 7 AM on the device's clock,
  // to stay well inside the database's free tier. #…&quiet=off disables that.
  var QUIET_FROM = 20;
  var QUIET_UNTIL = 7;

  function isQuiet(date) {
    if (hashParam("quiet") === "off") return false;
    var h = date.getHours();
    return h >= QUIET_FROM || h < QUIET_UNTIL;
  }

  // Shows the one-time "enter your key" card. onSaved runs after a key is entered.
  function askForKey(message, onSaved) {
    var box = document.getElementById("key-gate");
    var form = document.getElementById("key-form");
    var input = document.getElementById("key-input");
    document.getElementById("key-message").textContent = message;
    box.hidden = false;
    input.value = "";
    input.focus();
    form.onsubmit = function (e) {
      e.preventDefault();
      var k = input.value.trim();
      if (!k) return;
      setKey(k);
      box.hidden = true;
      onSaved();
    };
  }

  // How long since a task was last actioned. Older tasks predate `touched`
  // and fall back to when they were created.
  var HOUR = 3600000;
  var WARN_AFTER = 5 * HOUR;
  var ALERT_AFTER = 26 * HOUR;

  function ageOf(touched, now) {
    var ms = Math.max(0, now - touched);
    var hours = Math.floor(ms / HOUR);
    return {
      level: ms > ALERT_AFTER ? "alert" : ms > WARN_AFTER ? "warn" : "",
      label: hours < 24 ? hours + "h" : Math.floor(hours / 24) + "d " + (hours % 24) + "h"
    };
  }

  // Rows carry data-touched; this recolors them in place, so ages advance
  // without redrawing the list (which would cut off a running animation).
  function applyAges(root) {
    var now = Date.now();
    var rows = (root || document).querySelectorAll("[data-touched]");
    for (var i = 0; i < rows.length; i++) {
      var age = ageOf(Number(rows[i].getAttribute("data-touched")), now);
      rows[i].classList.toggle("age-warn", age.level === "warn");
      rows[i].classList.toggle("age-alert", age.level === "alert");
      var badge = rows[i].querySelector(".age");
      if (badge) badge.textContent = age.level ? age.label : "";
    }
  }

  function touchedOf(task) {
    return task.touched || task.created || Date.now();
  }

  function clockParts(now) {
    return {
      date: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      time: now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    };
  }

  window.DeskTodo = {
    MAX_TASKS: 15,
    me: null,
    call: call,
    pollMs: pollMs,
    isQuiet: isQuiet,
    QUIET_UNTIL: QUIET_UNTIL,
    getKey: getKey,
    clearKey: clearKey,
    askForKey: askForKey,
    clockParts: clockParts,
    applyAges: applyAges,
    touchedOf: touchedOf,
    list: function () { return request("GET"); },
    add: function (text, col) { return request("POST", { op: "add", text: text, col: col }); },
    move: function (id, col) { return request("POST", { op: "move", id: id, col: col }); },
    edit: function (id, text) { return request("POST", { op: "edit", id: id, text: text }); },
    done: function (id) { return request("POST", { op: "done", id: id }); }
  };
})();
