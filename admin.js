// The admin portal: add, rename, re-key and remove people.
(function () {
  "use strict";

  var T = window.DeskTodo;
  var people = [];
  var justAdded = null;

  var listEl = document.getElementById("people");
  var messageEl = document.getElementById("message");
  var nameInput = document.getElementById("new-name");

  document.getElementById("back").href = "./" + location.hash;

  function say(kind, text) {
    messageEl.className = "message " + kind;
    messageEl.textContent = text;
    messageEl.hidden = !text;
  }

  function base() {
    return location.origin + location.pathname.replace(/[^/]*$/, "");
  }

  function links(p) {
    var k = encodeURIComponent(p.key);
    return { computer: base() + "#key=" + k, ipad: base() + "board.html#key=" + k };
  }

  function onError(err) {
    if (err.status === 401) {
      T.clearKey();
      T.askForKey("That key didn't work. Use the TODO_KEY you set in Vercel.", load);
    } else if (err.status === 403) {
      say("error", "This page needs the admin key (your TODO_KEY), not a person's key.");
    } else {
      if (err.json && err.json.people) {
        people = err.json.people;
        render();
      }
      say("error", err.message);
    }
  }

  function act(body, done) {
    return T.call("api/people", "POST", body).then(function (json) {
      people = json.people || [];
      if (done) done(json);
      render();
    }).catch(onError);
  }

  function load() {
    if (!T.getKey()) {
      T.askForKey("Paste your TODO_KEY from Vercel. You only need to do this once.", load);
      return;
    }
    T.call("api/people", "GET").then(function (json) {
      people = json.people || [];
      render();
    }).catch(onError);
  }

  function copy(input, btn) {
    function flash() {
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = "Copy"; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(flash, function () {
        input.select();
        document.execCommand("copy");
        flash();
      });
    } else {
      input.select();
      document.execCommand("copy");
      flash();
    }
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function button(cls, text, onClick) {
    var b = el("button", cls, text);
    b.type = "button";
    b.onclick = onClick;
    return b;
  }

  function linkRow(label, url) {
    var row = el("div", "link-row");
    row.appendChild(el("span", "", label));
    var input = el("input");
    input.readOnly = true;
    input.value = url;
    input.setAttribute("aria-label", label + " link");
    input.onfocus = function () { input.select(); };
    row.appendChild(input);
    var btn = button("ghost", "Copy", function () { copy(input, btn); });
    row.appendChild(btn);
    return row;
  }

  function card(p) {
    var box = el("section", p.id === justAdded ? "person new" : "person");
    box.setAttribute("data-person", p.name);

    var head = el("div", "person-head");
    head.appendChild(el("h2", "", p.name));
    head.appendChild(el("span", "meta", p.tasks + (p.tasks === 1 ? " task" : " tasks") +
      " · added " + new Date(p.created).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })));
    box.appendChild(head);

    if (p.id === justAdded) {
      box.appendChild(el("p", "send-note", "Send " + p.name + " these two links. The iPad one goes in Safari, then Share → Add to Home Screen."));
    }

    var l = links(p);
    box.appendChild(linkRow("Computer link", l.computer));
    box.appendChild(linkRow("iPad link", l.ipad));

    var actions = el("div", "actions");
    actions.appendChild(button("ghost", "Rename", function () {
      var name = window.prompt("New name for " + p.name + ":", p.name);
      if (name && name.trim() && name.trim() !== p.name) {
        act({ op: "rename", id: p.id, name: name }, function () { say("ok", "Renamed to " + name.trim() + "."); });
      }
    }));
    actions.appendChild(button("ghost", "New key", function () {
      if (window.confirm("Give " + p.name + " a new key? Their current links stop working (within a minute), and you'll need to send them the new ones. Their tasks stay.")) {
        act({ op: "reset", id: p.id }, function () {
          justAdded = p.id;
          say("ok", p.name + " has a new key. Send them the new links below.");
        });
      }
    }));
    actions.appendChild(button("ghost danger", "Remove", function () {
      if (window.confirm("Remove " + p.name + "? This deletes their list and all " + p.tasks + " of their tasks, and their links stop working. This can't be undone.")) {
        act({ op: "remove", id: p.id }, function () { say("ok", p.name + " was removed."); });
      }
    }));
    box.appendChild(actions);
    return box;
  }

  function render() {
    listEl.textContent = "";
    if (!people.length) {
      listEl.appendChild(el("div", "empty", "No one else yet. Add someone above to give them their own list."));
      return;
    }
    people.forEach(function (p) { listEl.appendChild(card(p)); });
  }

  document.getElementById("add-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = nameInput.value.replace(/\s+/g, " ").trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    act({ op: "add", name: name }, function (json) {
      justAdded = json.added;
      nameInput.value = "";
      say("ok", name + " is set up with their own list.");
    });
  });

  load();
})();
