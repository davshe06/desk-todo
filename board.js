// The iPad board: shows both columns, and a tap checks a task off.
// Written for iOS 12 Safari — ES2017 at most, no optional chaining or ??.
(function () {
  "use strict";

  var T = window.DeskTodo;
  var POLL_MS = 5000;
  var UNDO_MS = 3000;
  var STALE_MS = 60000;
  var CHECK_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#141311" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';

  var tasks = [];
  var lastShown = "";
  var checked = {}; // id -> true while the 3-second undo window runs
  var timers = {};
  var gone = {}; // id -> time checked off; hidden until the server agrees it's deleted
  var lastOk = 0;
  var loaded = false;
  var loadedAt = Date.now();

  var board = document.getElementById("board");

  function visible(list) {
    return list.filter(function (t) { return !gone[t.id]; });
  }

  function load() {
    if (!T.getKey()) {
      T.askForKey("Type the key you set as TODO_KEY in Vercel. You only need to do this once.", load);
      return;
    }
    T.list()
      .then(function (list) {
        lastOk = Date.now();
        loaded = true;
        var ids = {};
        list.forEach(function (t) { ids[t.id] = true; });
        Object.keys(gone).forEach(function (id) {
          if (!ids[id]) delete gone[id];
          else if (Date.now() - gone[id] > POLL_MS) sendDone(id); // an earlier delete didn't land
        });
        var next = visible(list);
        var json = JSON.stringify(next);
        if (json !== lastShown) {
          lastShown = json;
          tasks = next;
          render();
        }
        tick();
      })
      .catch(function (err) {
        if (err.status === 401) {
          T.clearKey();
          T.askForKey("That key didn't work. Check it and try again.", load);
        }
        tick();
      });
  }

  function sendDone(id) {
    gone[id] = Date.now();
    T.done(id).catch(function () { /* retried by the next load */ });
  }

  function toggle(id) {
    if (checked[id]) {
      clearTimeout(timers[id]);
      delete timers[id];
      delete checked[id];
      render();
      return;
    }
    checked[id] = true;
    render();
    timers[id] = setTimeout(function () {
      delete timers[id];
      delete checked[id];
      tasks = tasks.filter(function (t) { return t.id !== id; });
      lastShown = JSON.stringify(tasks);
      sendDone(id);
      render();
    }, UNDO_MS);
  }

  function row(task) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = checked[task.id] ? "task done" : "task";
    btn.setAttribute("aria-pressed", checked[task.id] ? "true" : "false");

    var inner = document.createElement("span");
    inner.className = "inner";
    var circle = document.createElement("span");
    circle.className = "circle";
    circle.innerHTML = CHECK_SVG;
    var label = document.createElement("span");
    label.className = "label";
    label.textContent = task.text;
    var undo = document.createElement("span");
    undo.className = "undo";
    undo.textContent = "Tap to undo";

    inner.appendChild(circle);
    inner.appendChild(label);
    inner.appendChild(undo);
    btn.appendChild(inner);
    btn.addEventListener("click", function () { toggle(task.id); });
    return btn;
  }

  function render() {
    ["todo", "waiting"].forEach(function (col) {
      var items = tasks.filter(function (t) { return t.col === col; });
      var list = document.getElementById("list-" + col);
      list.textContent = "";
      items.forEach(function (t) { list.appendChild(row(t)); });
      if (!items.length && loaded) {
        var empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = col === "todo" ? "All clear." : "Not waiting on anyone.";
        list.appendChild(empty);
      }
      document.getElementById("count-" + col).textContent = items.length;
      document.getElementById("col-" + col).className = items.length > 6 ? "column compact" : "column";
    });
  }

  function tick() {
    var now = new Date();
    var parts = T.clockParts(now);
    document.getElementById("date").textContent = parts.date;
    document.getElementById("time").textContent = parts.time;

    var fresh = document.getElementById("fresh");
    var age = Date.now() - lastOk;
    if (!lastOk) {
      fresh.textContent = "Connecting…";
    } else if (age < STALE_MS) {
      fresh.textContent = "Updated just now";
    } else {
      fresh.textContent = "Offline · last updated " + T.clockParts(new Date(lastOk)).time;
    }
    board.className = lastOk && age >= STALE_MS ? "board stale" : "board";

    // Pick up new deploys: reload once overnight, when nothing is mid-undo.
    if (now.getHours() === 3 && Date.now() - loadedAt > 3600000 && !Object.keys(timers).length) {
      location.reload();
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) load();
  });
  setInterval(load, POLL_MS);
  setInterval(tick, 10000);

  tick();
  render();
  load();
})();
