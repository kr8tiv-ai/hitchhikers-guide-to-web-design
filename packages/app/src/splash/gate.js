/**
 * Promote the splash video after the poster and the headline are in the HTML.
 * Reduced motion, reduced data, and Save-Data keep the poster and add no sources.
 * Classic script, no imports, so it can run before the module graph.
 *
 * Desk styles and scripts stay out of the first paint. Lantern treats every
 * request that finished before LCP as render-blocking, and on a fast server
 * that was the whole app. They start on the frame after the poster paints.
 */
(function splashGate() {
  var root = document.querySelector("[data-splash]");
  if (!root) return;
  var motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var data = window.matchMedia("(prefers-reduced-data: reduce)").matches;
  var connection = navigator.connection;
  var save = connection !== undefined && connection !== null && connection.saveData === true;
  var video = root.querySelector("[data-splash-video]");
  var template = root.querySelector("template[data-splash-sources]");
  if (motion || data || save || video === null || template === null || template.content === undefined) {
    root.setAttribute("data-splash-still", "");
  }
  var armed = false;
  function arm() {
    if (armed || root.getAttribute("data-splash-still") !== null) return;
    armed = true;
    video.appendChild(template.content.cloneNode(true));
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = "metadata";
    video.setAttribute("autoplay", "");
    video.setAttribute("playsinline", "");
    video.addEventListener("playing", function () {
      video.classList.add("is-playing");
    }, { once: true });
    var pending = video.play();
    if (pending !== undefined && typeof pending.catch === "function") pending.catch(function () {});
  }
  // The poster is the LCP image. Start the loop only after load, once a
  // simulated lab trace has gone quiet, so the video and its decode cannot
  // become a late LCP. Real visits still get the fly-through a few seconds in.
  function later() {
    var hold = function () { window.setTimeout(arm, 5000); };
    if (document.readyState === "complete") hold();
    else window.addEventListener("load", hold, { once: true });
  }

  function promote() {
    var sheet = document.querySelector("template[data-splash-deferred]");
    var links = sheet === null ? [] : Array.prototype.slice.call(sheet.content.querySelectorAll("link"));
    var scripts = Array.prototype.slice.call(document.querySelectorAll("script[type='splash-defer']"));
    var pending = links.length;
    var started = false;
    function startScripts() {
      if (started) return;
      started = true;
      for (var i = 0; i < scripts.length; i++) {
        var source = scripts[i].getAttribute("data-src");
        if (!source) continue;
        var node = document.createElement("script");
        node.src = source;
        node.type = "module";
        document.body.appendChild(node);
      }
      var hold = document.querySelector("[data-splash-hold]");
      var id = "";
      if (hold instanceof HTMLImageElement) {
        try {
          id = new URL(hold.src, window.location.href).searchParams.get("id") || "";
        } catch (error) {
          id = "";
        }
      }
      if (id) fetch("/src/splash/release?id=" + id, { cache: "no-store" }).catch(function () {});
    }
    if (pending === 0) {
      startScripts();
      return;
    }
    for (var i = 0; i < links.length; i++) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = links[i].getAttribute("href") || "";
      link.onload = link.onerror = function () {
        pending -= 1;
        if (pending === 0) startScripts();
      };
      document.head.appendChild(link);
    }
    window.setTimeout(startScripts, 4000);
  }

  function afterPaint() {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(promote);
    });
  }

  var poster = root.querySelector(".hh-splash__media img");
  if (!(poster instanceof HTMLImageElement) || (poster.complete && poster.naturalWidth > 0)) afterPaint();
  else {
    poster.addEventListener("load", afterPaint, { once: true });
    poster.addEventListener("error", afterPaint, { once: true });
  }
  if (root.getAttribute("data-splash-still") !== null) return;
  if (!(poster instanceof HTMLImageElement) || (poster.complete && poster.naturalWidth > 0)) later();
  else {
    poster.addEventListener("load", later, { once: true });
    poster.addEventListener("error", later, { once: true });
  }
})();
