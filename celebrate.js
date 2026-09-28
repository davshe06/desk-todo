// Check-off celebrations, shared by both pages.
//
//   var fx = Celebrate.pick();                      // random, never the same twice running
//   var h = Celebrate.burst(fx, circleEl, rowEl);   // the moment of the tap
//   h.cancel();                                     // on undo
//   Celebrate.exit(fx, rowEl, h, done);             // row leaves, then done()
//
// Force one with ?fx=rocket or #…&fx=rocket in the URL.
//
// iOS 12 Safari has no Element.animate(), so everything is CSS: keyframes for
// fixed motion (celebrate.css), and transitions on inline styles for
// particles, whose paths are random.
(function () {
  "use strict";

  var EFFECTS = ["confetti", "sparkles", "rocket", "balloons", "stamp"];
  var EXITS = {
    confetti: "fx-exit-slide",
    sparkles: "fx-exit-shrink",
    rocket: "fx-exit-whoosh",
    balloons: "fx-exit-float",
    stamp: "fx-exit-drop"
  };
  var COLORS = ["#F0A070", "#8FB0F5", "#6FBF84", "#F2D16B", "#E58AB8", "#C8612F", "#2F4F9E"];
  var STAR = '<svg width="100%" height="100%" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" fill="COLOR"></path></svg>';
  var ROCKET = '<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">' +
    '<path d="M12 25l-6 9 8-2zM32 25l6 9-8-2z" fill="#F0A070"></path>' +
    '<path d="M17 31h10l-5 11z" fill="#F2D16B"></path>' +
    '<path d="M22 3c7 6 10 14 10 22l-4 6H16l-4-6c0-8 3-16 10-22z" fill="#EDE7DD" stroke="#3A3731" stroke-width="1.5"></path>' +
    '<circle cx="22" cy="17" r="4" fill="#8FB0F5" stroke="#3A3731" stroke-width="1.5"></circle></svg>';
  var BALLOON = '<svg width="46" height="96" viewBox="0 0 46 96" aria-hidden="true">' +
    '<path d="M23 58c-3 10 5 16 0 26s4 10 2 12" fill="none" stroke="#8C857A" stroke-width="1.5"></path>' +
    '<ellipse cx="23" cy="27" rx="20" ry="25" fill="COLOR"></ellipse>' +
    '<path d="M19 55l4-4 4 4z" fill="COLOR"></path>' +
    '<ellipse cx="15" cy="17" rx="4" ry="7" fill="#FFFFFF" opacity="0.35"></ellipse></svg>';

  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var last = null;
  var layer = null;

  function forced() {
    var m = (location.search + location.hash).match(/fx=([a-z]+)/);
    return m && EFFECTS.indexOf(m[1]) >= 0 ? m[1] : null;
  }

  function pick() {
    var f = forced();
    if (f) return f;
    var choices = EFFECTS.filter(function (e) { return e !== last; });
    last = choices[Math.floor(Math.random() * choices.length)];
    return last;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function el(cls, html) {
    var node = document.createElement("div");
    node.className = cls;
    if (html) node.innerHTML = html;
    return node;
  }

  // Particles live in a fixed layer on <body>, so re-rendering a list never cuts them off.
  function place(node, x, y) {
    if (!layer) {
      layer = el("fx-layer");
      document.body.appendChild(layer);
    }
    node.style.left = x + "px";
    node.style.top = y + "px";
    layer.appendChild(node);
    return node;
  }

  // Two frames, so the start state is painted before the transition's end state is set.
  function later(fn) {
    requestAnimationFrame(function () { requestAnimationFrame(fn); });
  }

  function removeAfter(node, ms) {
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, ms);
  }

  function center(node) {
    var r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left };
  }

  function range(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(i);
    return out;
  }

  // 1. Confetti: pieces pop up and fall in arcs. X eases out; Y uses a curve
  // that dips negative first (up), then falls; the two together make the arc.
  function confetti(o) {
    range(30).forEach(function (i) {
      var x = el("fx-abs");
      var y = el("fx-abs");
      var bit = el("fx-confetti");
      bit.style.background = COLORS[i % COLORS.length];
      bit.style.width = Math.round(rand(6, 11)) + "px";
      bit.style.height = Math.round(rand(9, 16)) + "px";
      y.appendChild(bit);
      x.appendChild(y);
      place(x, o.x, o.y);
      var dur = Math.round(rand(1100, 1700));
      x.style.transition = "transform " + dur + "ms cubic-bezier(.15,.6,.4,1)";
      y.style.transition = "transform " + dur + "ms cubic-bezier(.3,-1.3,.7,1), opacity 300ms linear " + (dur - 300) + "ms";
      bit.style.transition = "transform " + dur + "ms linear";
      later(function () {
        x.style.transform = "translateX(" + Math.round(rand(-280, 280)) + "px)";
        y.style.transform = "translateY(" + Math.round(rand(120, 360)) + "px)";
        y.style.opacity = "0";
        bit.style.transform = "rotate(" + Math.round(rand(-900, 900)) + "deg)";
      });
      removeAfter(x, dur + 100);
    });
    return [];
  }

  // 2. Sparkles: a shockwave ring and a burst of stars.
  function sparkles(o) {
    var ring = place(el("fx-ring"), o.x, o.y);
    removeAfter(ring, 700);
    range(12).forEach(function (i) {
      var size = Math.round(rand(14, 26));
      var star = el("fx-star", STAR.replace("COLOR", COLORS[i % 5]));
      star.style.width = star.style.height = size + "px";
      star.style.marginLeft = star.style.marginTop = -size / 2 + "px";
      star.style.transform = "translate(0,0) scale(0.2)";
      star.style.transition = "transform 700ms cubic-bezier(.2,.8,.3,1), opacity 350ms linear 450ms";
      place(star, o.x, o.y);
      var angle = (i / 12) * Math.PI * 2 + rand(-0.2, 0.2);
      var r = rand(70, 140);
      later(function () {
        star.style.transform = "translate(" + Math.round(Math.cos(angle) * r) + "px," + Math.round(Math.sin(angle) * r) + "px) scale(1) rotate(90deg)";
        star.style.opacity = "0";
      });
      removeAfter(star, 900);
    });
    return [];
  }

  // 3. Rocket: launches up and off-screen, leaving smoke puffs along its path.
  function rocket(o) {
    var dx = Math.round(rand(220, 420)) * (Math.random() < 0.5 ? -1 : 1);
    var dy = -Math.round(o.y + 160);
    var angle = Math.atan2(dx, -dy) * 180 / Math.PI;
    var dur = 1200;
    var ship = el("fx-rocket", ROCKET);
    ship.style.transform = "translate(0,0) rotate(" + angle + "deg) scale(0.5)";
    ship.style.transition = "transform " + dur + "ms cubic-bezier(.55,0,.9,.45)";
    place(ship, o.x, o.y);
    later(function () {
      ship.style.transform = "translate(" + dx + "px," + dy + "px) rotate(" + angle + "deg) scale(1.3)";
    });
    removeAfter(ship, dur + 100);
    range(9).forEach(function (k) {
      setTimeout(function () {
        var p = Math.pow((k + 1) / 12, 2.2); // roughly where the ease-in curve has the ship
        var puff = el("fx-puff");
        puff.style.transform = "scale(0.4)";
        place(puff, o.x + dx * p, o.y + dy * p + 18);
        later(function () {
          puff.style.transform = "scale(" + rand(1.6, 2.4).toFixed(2) + ")";
          puff.style.opacity = "0";
        });
        removeAfter(puff, 900);
      }, k * 95);
    });
    return [];
  }

  // 4. Balloons: three float up from the row, swaying on their strings.
  function balloons(o, row) {
    var r = row ? center(row) : o;
    var span = row ? r.w : 200;
    var left = row ? r.left : o.x - 100;
    [0.3, 0.55, 0.8].forEach(function (f, i) {
      var rise = el("fx-abs");
      var sway = el("fx-balloon", BALLOON.replace(/COLOR/g, COLORS[(i * 2 + Math.floor(rand(0, 3))) % 5]));
      sway.style.animationDelay = -rand(0, 1).toFixed(2) + "s";
      rise.appendChild(sway);
      place(rise, left + span * f + rand(-20, 20), r.y - 20);
      var dur = Math.round(rand(2400, 3200));
      rise.style.transition = "transform " + dur + "ms cubic-bezier(.4,0,.8,.6)";
      later(function () {
        rise.style.transform = "translateY(" + -Math.round(r.y + 160) + "px)";
      });
      removeAfter(rise, dur + 100);
    });
    return [];
  }

  // 5. Stamp: slams onto the row and stays until the row leaves.
  function stamp(o, row) {
    var r = row ? center(row) : o;
    var s = place(el("fx-stamp"), r.x, r.y);
    s.textContent = "DONE!";
    if (row) row.classList.add("fx-shake");
    return [s];
  }

  var BURSTS = { confetti: confetti, sparkles: sparkles, rocket: rocket, balloons: balloons, stamp: stamp };

  function burst(kind, circle, row) {
    var lingering = [];
    if (!reduced && circle && BURSTS[kind]) {
      circle.classList.add("fx-pop");
      lingering = BURSTS[kind](center(circle), row);
    }
    return {
      els: lingering,
      cancel: function () {
        lingering.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
        lingering = [];
      }
    };
  }

  // Squeeze the row's space shut so the rows below glide up instead of jumping.
  function collapse(row, done) {
    row.style.height = row.offsetHeight + "px";
    row.style.minHeight = "0";
    row.style.overflow = "hidden";
    void row.offsetHeight;
    row.style.transition = "height 250ms ease, padding 250ms ease, border-width 250ms ease";
    row.style.height = "0px";
    row.style.paddingTop = row.style.paddingBottom = "0px";
    row.style.borderBottomWidth = "0px";
    setTimeout(done, 270);
  }

  function exit(kind, row, handle, done) {
    if (!row || !row.parentNode) {
      if (handle) handle.cancel();
      done();
      return;
    }
    row.classList.add(reduced ? "fx-exit-fade" : EXITS[kind] || "fx-exit-fade");
    if (handle) handle.els.forEach(function (n) { n.classList.add("fx-leave"); });
    setTimeout(function () {
      collapse(row, function () {
        if (handle) handle.cancel();
        done();
      });
    }, reduced ? 200 : 480);
  }

  window.Celebrate = { EFFECTS: EFFECTS, pick: pick, burst: burst, exit: exit };
})();
