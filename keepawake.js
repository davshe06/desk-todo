// Best effort at keeping the iPad's screen on while the board is open.
//
// Newer browsers have the Screen Wake Lock API (iOS 16.4+). iOS 12–15 doesn't,
// so there the board quietly plays a tiny silent looping video, which iOS
// treats as "something is playing" and doesn't dim for. That trick and the
// clip (keepawake.mp4) come from NoSleep.js by Rich Tibbett, MIT licensed;
// see THIRD_PARTY_NOTICES.md.
//
// The reliable fix is still Settings → Display & Brightness → Auto-Lock →
// Never. If the trick can't start without a tap, the board shows a hint and
// the next tap anywhere starts it.
(function () {
  "use strict";

  var hint = document.getElementById("awake-hint");
  var video = null;
  var on = false;

  function started() {
    on = true;
    if (hint) hint.hidden = true;
  }

  function failed() {
    on = false;
    if (hint) hint.hidden = false;
  }

  function viaWakeLock() {
    return navigator.wakeLock.request("screen").then(function (lock) {
      started();
      lock.addEventListener("release", function () { on = false; });
    });
  }

  function viaVideo() {
    if (!video) {
      video = document.createElement("video");
      video.setAttribute("playsinline", "");
      video.setAttribute("muted", "");
      video.setAttribute("aria-hidden", "true");
      video.muted = true;
      video.src = "keepawake.mp4";
      video.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;";
      document.body.appendChild(video);
      // Jump back before the clip ends, so it never stops playing.
      video.addEventListener("timeupdate", function () {
        if (video.currentTime > 0.5) video.currentTime = Math.random() * 0.5;
      });
    }
    var playing = video.play();
    if (playing && playing.then) return playing.then(started);
    started();
    return Promise.resolve();
  }

  function enable() {
    try {
      ("wakeLock" in navigator ? viaWakeLock() : viaVideo()).catch(failed);
    } catch (e) {
      failed();
    }
  }

  // iOS only lets media start from inside a tap handler, so retry on each tap
  // until it sticks.
  function onTap() {
    if (!on) enable();
  }
  document.addEventListener("touchend", onTap);
  document.addEventListener("click", onTap);

  // Both a wake lock and the video stop when the app is in the background.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) enable();
  });

  enable();
})();
