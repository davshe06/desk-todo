// The computer page: add, edit, move and complete tasks.
(function () {
  "use strict";

  var T = window.DeskTodo;
  var COLS = {
    todo: { label: "To Do", moveTo: "waiting", moveLabel: "Move to Awaiting →" },
    waiting: { label: "Awaiting Response", moveTo: "todo", moveLabel: "← Move to To Do" }
  };
  var POLL_MS = T.pollMs(15000);

  var tasks = [];
  var addCol = "todo";
  var editingId = null;
  var inFlight = 0;
  var animating = 0;

  var input = document.getElementById("new-task");
  var addBtn = document.getElementById("add");
  var statusEl = document.getElementById("status");
  var statusText = document.getElementById("status-text");

  // "Sam's list", or for the admin, a link to manage people.
  function showWho() {
    var me = T.me;
    if (!me) return;
    var who = document.getElementById("who");
    who.textContent = me.admin ? "Your list · " : me.name + "\u2019s list";
    if (me.admin) {
      var a = document.createElement("a");
      a.href = "admin.html" + location.hash;
      a.textContent = "Manage people \u2192";
      who.appendChild(a);
    }
    who.hidden = false;
  }

  function setStatus(kind, text) {
    statusEl.className = "status " + kind;
    if (kind === "ok") showWho();
    statusText.textContent = text;
  }

  function onError(err) {
    if (err.status === 401) {
      T.clearKey();
      T.askForKey("That key didn't work. Check it and try again.", refresh);
      return;
    }
    if (err.tasks) {
      tasks = err.tasks;
      render();
    }
    if (err.status === 409) setStatus("error", "List is full");
    else if (err.status >= 500) setStatus("error", err.message);
    else setStatus("error", "Offline. Changes may not have saved");
  }

  // Every change is shown immediately, then replaced by the server's list.
  function save(request) {
    inFlight++;
    setStatus("saving", "Saving…");
    render();
    return request
      .then(function (list) {
        tasks = list;
        setStatus("ok", "Synced");
      })
      .catch(onError)
      .then(function () {
        inFlight--;
        render();
      });
  }

  function refresh() {
    if (!T.getKey()) {
      T.askForKey("Paste the access key from your link. You only need to do this once.", refresh);
      return;
    }
    if (inFlight || editingId || animating) return;
    T.list()
      .then(function (list) {
        if (inFlight || editingId || animating) return;
        tasks = list;
        render();
        setStatus("ok", "Synced");
      })
      .catch(onError);
  }

  function add() {
    var text = input.value.replace(/\s+/g, " ").trim();
    if (!text) return;
    if (tasks.length >= T.MAX_TASKS) {
      setStatus("error", "List is full. Check something off first");
      return;
    }
    tasks.push({ id: "pending-" + Date.now(), text: text, col: addCol, created: Date.now(), touched: Date.now(), pending: true });
    input.value = "";
    save(T.add(text, addCol));
  }

  // Saves at once; the celebration plays while the request is out, then the row leaves.
  function complete(task, li, check) {
    if (task.leaving) return;
    task.leaving = true;
    animating++;
    li.className += " checked";
    var kind = Celebrate.pick();
    var handle = Celebrate.burst(kind, check, li);
    var request = T.done(task.id);
    request.catch(function () { /* reported by save() below */ });
    setTimeout(function () {
      Celebrate.exit(kind, li, handle, function () {
        animating--;
        tasks = tasks.filter(function (t) { return t.id !== task.id; });
        save(request);
      });
    }, kind === "stamp" ? 900 : 500);
  }

  function move(task) {
    task.col = COLS[task.col].moveTo;
    task.touched = Date.now();
    save(T.move(task.id, task.col));
  }

  function startEdit(task) {
    editingId = task.id;
    render();
  }

  function finishEdit(task, field, keep) {
    if (editingId !== task.id) return;
    editingId = null;
    var text = field.value.replace(/\s+/g, " ").trim();
    if (keep && text && text !== task.text) {
      task.text = text;
      task.touched = Date.now();
      save(T.edit(task.id, text));
    } else {
      render();
    }
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function row(task) {
    var li = el("li", task.pending ? "task pending" : "task");
    li.setAttribute("data-touched", T.touchedOf(task));

    var check = el("button", "check");
    check.type = "button";
    check.setAttribute("aria-label", "Complete: " + task.text);
    check.title = "Done";
    check.onclick = function () { complete(task, li, check); };
    li.appendChild(check);

    if (editingId === task.id) {
      var field = el("input", "edit");
      field.value = task.text;
      field.maxLength = 140;
      field.setAttribute("aria-label", "Edit task");
      field.onkeydown = function (e) {
        if (e.key === "Enter") finishEdit(task, field, true);
        if (e.key === "Escape") finishEdit(task, field, false);
      };
      field.onblur = function () { finishEdit(task, field, true); };
      li.appendChild(field);
      setTimeout(function () { field.focus(); field.select(); }, 0);
    } else {
      var text = el("button", "text", task.text);
      text.type = "button";
      text.title = "Click to edit";
      text.onclick = function () { startEdit(task); };
      li.appendChild(text);
    }

    var age = el("span", "age");
    age.title = "Time since this task was added, edited or moved";
    li.appendChild(age);

    var mv = el("button", "move", COLS[task.col].moveLabel);
    mv.type = "button";
    mv.onclick = function () { move(task); };
    li.appendChild(mv);
    return li;
  }

  function render() {
    Object.keys(COLS).forEach(function (col) {
      var list = document.getElementById("list-" + col);
      var items = tasks.filter(function (t) { return t.col === col && !t.leaving; });
      list.textContent = "";
      items.forEach(function (t) { list.appendChild(row(t)); });
      if (!items.length) list.appendChild(el("li", "empty", col === "todo" ? "Nothing to do. Nice." : "Not waiting on anyone."));
      document.getElementById("count-" + col).textContent = items.length;
    });
    document.getElementById("slots").textContent = tasks.length;
    T.applyAges();
    var full = tasks.length >= T.MAX_TASKS;
    addBtn.disabled = full;
    input.placeholder = full ? "List is full. Check something off first." : "What needs doing?";
  }

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") add();
  });
  addBtn.addEventListener("click", add);
  Array.prototype.forEach.call(document.querySelectorAll(".seg button"), function (btn) {
    btn.addEventListener("click", function () {
      addCol = btn.getAttribute("data-col");
      Array.prototype.forEach.call(document.querySelectorAll(".seg button"), function (b) {
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      input.focus();
    });
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refresh();
  });
  window.addEventListener("focus", refresh);
  // Only checks while the tab is showing; coming back to it checks at once.
  setInterval(function () { if (!document.hidden) refresh(); }, POLL_MS);
  setInterval(function () { T.applyAges(); }, 30000);
  document.getElementById("max").textContent = T.MAX_TASKS;

  render();
  refresh();
  input.focus();
})();
