/* Homepage intro (11 Oct 2026). Loaded in <head> so the page never flashes first.
   Plays once per tab. Nothing happens without JS, with reduced motion, on a link to a
   section (#...), or once seen in this tab.
   The idea is the headline: punch above your size. The wedge from the wordmark starts
   small on the floor of the field, grows until it towers over the camera, lit ember
   on its face and teal along one edge while a beam of blue climbs the other, then it
   settles back into the wordmark and the page opens through a widening wedge.
   3D first (intro3d.js + three.js, fetched only now). With no WebGL, a failed load,
   a lost context or a GPU too slow for the first frames, the 2D version plays: the
   same story in CSS. Skip button (first Tab stop) and Esc end it at once. Never more
   than 9s on screen.
   Test hook: ?introtest=1 builds the scene, does not run the clock, and exposes
   window.__introSeek(seconds); ?introtest=rt plays in real time without the speed
   check; ?introtest=2d forces the 2D version. */
(function () {
  var KEY = 'upwieldIntroSeen', root = document.documentElement;
  var seen = false;
  try { seen = sessionStorage.getItem(KEY) === '1'; } catch (e) {}
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hashLink = location.hash && location.hash.length > 1;
  if (seen || reduce || hashLink || !('animate' in Element.prototype)) return;

  var test = null;
  try { test = new URLSearchParams(location.search).get('introtest'); } catch (e) {}
  var here = document.currentScript && document.currentScript.src;
  var base = here ? here.slice(0, here.lastIndexOf('/') + 1) : 'intro/';

  root.classList.add('uw-cover', 'uw-lock', 'uw-hold');
  var overlay = null, skip = null, anims = [], timers = [], finished = false, ctrl3d = null, mode = '';
  var shown = 0, lastTick = Date.now();
  // Failsafe: 9s of visible time, whatever happens (off while seeking in tests).
  var safety = test === '1' ? null : setInterval(function () {
    var now = Date.now();
    if (!document.hidden) shown += now - lastTick;
    lastTick = now;
    if (shown > 9000) finish();
  }, 250);

  function remember() { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} }

  function release() { root.classList.remove('uw-hold'); }

  function finish() {
    if (finished) return;
    finished = true;
    if (safety) clearInterval(safety);
    timers.forEach(clearTimeout);
    anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
    if (ctrl3d) { try { ctrl3d.stop(); } catch (e) {} ctrl3d = null; }
    document.removeEventListener('keydown', onKey);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    root.classList.remove('uw-cover', 'uw-lock', 'uw-hold');
    remember();
    window.__introMode = mode + ':done';
  }

  function onKey(e) { if (e.key === 'Escape') finish(); }

  /* The page comes up through a wedge: an upward triangle cut out of the overlay,
     growing from (cx, cy) in pixels until it holds the whole screen. k: 0..1. */
  function reveal(k, cx, cy) {
    if (!overlay) return;
    if (k <= 0) { overlay.style.clipPath = ''; return; }
    var w = window.innerWidth, h = window.innerHeight;
    // Size that contains every corner: for an upward triangle with apex above the
    // centre, the bottom corners are the hardest to reach.
    var s = (Math.max(w, h) * 2.6 + 40) * k;
    var ax = cx, ay = cy - s * 0.62, lx = cx - s * 0.58, rx = cx + s * 0.58, by = cy + s * 0.38;
    overlay.style.clipPath = 'polygon(evenodd, 0 0, ' + w + 'px 0, ' + w + 'px ' + h + 'px, 0 ' + h + 'px, 0 0, ' +
      ax.toFixed(1) + 'px ' + ay.toFixed(1) + 'px, ' + rx.toFixed(1) + 'px ' + by.toFixed(1) + 'px, ' +
      lx.toFixed(1) + 'px ' + by.toFixed(1) + 'px, ' + ax.toFixed(1) + 'px ' + ay.toFixed(1) + 'px)';
  }

  function makeOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'uw';
    skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'uw-skip';
    skip.textContent = 'Skip intro';
    skip.addEventListener('click', finish);
    overlay.appendChild(skip);
    document.body.insertBefore(overlay, document.body.firstChild);
    document.addEventListener('keydown', onKey);
    root.classList.remove('uw-cover');
  }

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return false;
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch (e) { return false; }
  }

  function fontReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.race([
      document.fonts.load('600 200px "Outfit"'),
      new Promise(function (r) { setTimeout(r, 1500); })
    ]).catch(function () {});
  }

  function play3D() {
    mode = '3d';
    window.__introMode = '3d:loading';
    var gaveUp = false;
    var slow = setTimeout(function () { gaveUp = true; fallback(); }, 3200);
    timers.push(slow);
    fontReady().then(function () {
      return import(base + 'intro3d.js');
    }).then(function (m) {
      if (finished || gaveUp) return;
      return m.start({
        overlay: overlay, test: test, reveal: reveal, release: release,
        cancelled: function () { return finished || gaveUp; },
        onDone: finish,
        onFallback: function (at) { ctrl3d = null; if (at < 2) fallback(); else finish(); }
      }).then(function (c) {
        if (finished || gaveUp) { if (c) c.stop(); return; }
        clearTimeout(slow);
        ctrl3d = c;
        window.__introMode = '3d';
        if (test === '1') { window.__introSeek = function (s) { if (ctrl3d) ctrl3d.seek(s); }; window.__introReady = true; }
      });
    }).catch(function () { clearTimeout(slow); fallback(); });
  }

  function fallback() {
    if (finished || mode === '2d') return;
    if (ctrl3d) { try { ctrl3d.stop(); } catch (e) {} ctrl3d = null; }
    reveal(0);
    play2D();
  }

  /* 2D: the same story in CSS. A small wedge on a glowing floor line grows until it
     fills the screen, its edges catching teal and blue, then shrinks back into the
     wordmark and the page opens through a widening wedge. About 3.9s. */
  function play2D() {
    if (finished) return;
    mode = '2d';
    window.__introMode = '2d';
    try {
      var w = window.innerWidth || 1280, h = window.innerHeight || 800;
      var stage = document.createElement('div');
      stage.className = 'uw2';
      stage.setAttribute('aria-hidden', 'true');
      stage.innerHTML = '<i class="uw2-floor"></i><b class="uw2-wedge"><s></s></b>' +
        '<span class="uw2-mark">upwield<b class="uw2-mw"></b></span>';
      overlay.insertBefore(stage, skip);
      var wedge = stage.querySelector('.uw2-wedge'), floor = stage.querySelector('.uw2-floor');
      var mark = stage.querySelector('.uw2-mark'), mw = stage.querySelector('.uw2-mw');

      // The wedge sits on the floor line, 4% of the short side, then grows to tower.
      var base = Math.min(w, h) * 0.06, tall = Math.max(w, h) * 1.25;
      var fy = h * 0.72;
      wedge.style.width = wedge.style.height = base + 'px';
      wedge.style.transformOrigin = '50% 100%';
      wedge.style.left = (w / 2 - base / 2) + 'px';
      wedge.style.top = (fy - base) + 'px';
      floor.style.top = fy + 'px';

      anims.push(floor.animate([{ opacity: 0, transform: 'scaleX(.2)' }, { opacity: 1, transform: 'none' }],
        { duration: 700, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' }));
      anims.push(wedge.animate([
        { transform: 'scale(0)', offset: 0 },
        { transform: 'scale(1)', offset: 0.2 },
        { transform: 'scale(1)', offset: 0.28 },
        { transform: 'scale(' + (tall / base).toFixed(2) + ')', offset: 0.78 },
        { transform: 'scale(' + (tall / base * 1.04).toFixed(2) + ')', offset: 1 }
      ], { duration: 2300, delay: 150, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'both' }));
      anims.push(stage.querySelector('.uw2-wedge s').animate([
        { transform: 'translateY(100%)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'translateY(-100%)', opacity: 0 }
      ], { duration: 1300, delay: 900, easing: 'cubic-bezier(.3,.6,.2,1)', fill: 'both' }));

      // Then the screen-filling wedge is gone and the wordmark is there.
      timers.push(setTimeout(function () {
        if (finished) return;
        anims.push(wedge.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }));
        anims.push(floor.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }));
        anims.push(mark.animate([
          { opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }
        ], { duration: 600, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' }));
      }, 2350));

      // The page comes up through a widening wedge from where the mark's wedge sits.
      timers.push(setTimeout(function () {
        if (finished) return;
        release();
        var r = mw.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height * 0.7, t0 = performance.now();
        anims.push(skip.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }));
        (function step(now) {
          if (finished) return;
          var k = Math.min(1, (now - t0) / 800);
          reveal(k * k * (3 - 2 * k), cx, cy);
          if (k < 1) requestAnimationFrame(step); else finish();
        })(t0);
      }, 3100));
    } catch (err) {
      finish();
    }
  }

  function begin() {
    if (finished) return;
    try {
      makeOverlay();
      if (test !== '2d' && hasWebGL()) play3D(); else play2D();
    } catch (e) { finish(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin);
  else begin();
})();
