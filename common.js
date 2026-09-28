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

  function setKey(k) {
    try { localStorage.setItem(KEY_STORE, k); } catch (e) { /* private mode */ }
    history.replaceState(null, "", location.pathname + location.search + "#key=" + encodeURIComponent(k));
  }

  function clearKey() {
    try { localStorage.removeItem(KEY_STORE); } catch (e) { /* private mode */ }
    history.replaceState(null, "", location.pathname + location.search);
  }

  function request(method, body) {
    var opts = {
      method: method,
      headers: { "Content-Type": "application/json", "X-Todo-Key": getKey() }
    };
    if (body) opts.body = JSON.stringify(body);
    // The timestamp defeats any cache old Safari might apply to GETs.
    return fetch("api/tasks?t=" + Date.now(), opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var err = new Error(json.error || "HTTP " + res.status);
          err.status = res.status;
          err.tasks = json.tasks;
          throw err;
        }
        return json.tasks || [];
      });
    });
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

  function clockParts(now) {
    return {
      date: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      time: now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    };
  }

  window.DeskTodo = {
    MAX_TASKS: 10,
    getKey: getKey,
    clearKey: clearKey,
    askForKey: askForKey,
    clockParts: clockParts,
    list: function () { return request("GET"); },
    add: function (text, col) { return request("POST", { op: "add", text: text, col: col }); },
    move: function (id, col) { return request("POST", { op: "move", id: id, col: col }); },
    edit: function (id, text) { return request("POST", { op: "edit", id: id, text: text }); },
    done: function (id) { return request("POST", { op: "done", id: id }); }
  };
})();
