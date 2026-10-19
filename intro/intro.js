/* Homepage intro (v2, 18 Oct 2026). Loaded in <head> so the page never flashes first.
   Plays once per tab. Nothing happens without JS, with reduced motion, on a link to a
   section (#...), or once seen in this tab.
   The idea is the headline: punch above your size. A line of light draws across a dark
   floor and a small ember wedge rises out of it. It crouches, charges, and punches up
   to tower over the camera: a flash, a shockwave across the floor, sparks, the camera
   knocked back. Light runs over it, then it drops back to size and locks into the
   wordmark as the letters rise in, a sheen crosses, and the lockup glides up into the
   header exactly where the real wordmark sits while the page fades in around it.
   3D first (intro3d.js + three.js, fetched only now, WebGL2 only). With no WebGL2, a
   failed load, a lost context or a GPU too slow for the first frames, the 2D version
   plays: the same story in CSS. While it plays the page is inert and focus sits on
   Skip; Skip and Esc end it at once. Never more than 7.5s on screen.
   Test hook (localhost / 127.0.0.1 only): ?introtest=1 builds the scene, does not run the clock, and exposes
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
  // Test hooks only on a local server, never on the live site.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    try { test = new URLSearchParams(location.search).get('introtest'); } catch (e) {}
  }
  var here = document.currentScript && document.currentScript.src;
  var base = here ? here.slice(0, here.lastIndexOf('/') + 1) : 'intro/';

  // uw-mark hides the header wordmark until the intro's own lockup lands on it.
  root.classList.add('uw-cover', 'uw-lock', 'uw-hold', 'uw-mark');
  var overlay = null, bg = null, skip = null, anims = [], timers = [], finished = false, ctrl3d = null, mode = '';
  var inerted = [];
  var shown = 0, lastTick = Date.now();
  // Failsafe: 7.5s of visible time, whatever happens (30s while seeking in tests).
  var limit = test === '1' ? 30000 : 7500;
  var safety = setInterval(function () {
    var now = Date.now();
    if (!document.hidden) shown += now - lastTick;
    lastTick = now;
    if (shown > limit) finish();
  }, 250);

  function remember() { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} }

  function release(on) { root.classList.toggle('uw-hold', on === false); }
  function setMark(visible) { root.classList.toggle('uw-mark', !visible); }

  var byKey = false;
  function finish() {
    if (finished) return;
    finished = true;
    if (safety) clearInterval(safety);
    timers.forEach(clearTimeout);
    anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
    if (ctrl3d) { try { ctrl3d.stop(); } catch (e) {} ctrl3d = null; }
    document.removeEventListener('keydown', onKey);
    inerted.forEach(function (el) { el.inert = false; });
    inerted = [];
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    root.classList.remove('uw-cover', 'uw-lock', 'uw-hold', 'uw-mark');
    // Keyboard users who end it (Esc, or Skip by key) land on the header wordmark, so
    // focus is not dropped to <body>; no ring is left on it for anyone else.
    var mark = document.querySelector('.navbar .wordmark');
    if (byKey && mark) { try { mark.focus({ preventScroll: true }); } catch (e) {} }
    remember();
    window.__introMode = mode + ':done';
  }

  function onKey(e) { if (e.key === 'Escape') { byKey = true; finish(); } }

  /* Where the header wordmark's wedge sits on screen, so the lockup can land on it.
     null when there is no visible header wordmark (then the lockup just fades). */
  function target() {
    var w = document.querySelector('.navbar .wordmark .wedge');
    if (!w) return null;
    var r = w.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > innerHeight) return null;
    var fs = parseFloat(getComputedStyle(w.parentNode).fontSize) || 25;
    return { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom, fs: fs };
  }

  function makeOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'uw';
    bg = document.createElement('div');
    bg.className = 'uw-bg';
    overlay.appendChild(bg);
    skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'uw-skip';
    skip.textContent = 'Skip intro';
    skip.addEventListener('click', function (e) { byKey = e.detail === 0; finish(); });
    overlay.appendChild(skip);
    document.body.insertBefore(overlay, document.body.firstChild);
    // Keyboard and screen readers stay on the intro while it plays.
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el !== overlay && !el.inert) { el.inert = true; inerted.push(el); }
    });
    try { skip.focus({ preventScroll: true }); } catch (e) {}
    document.addEventListener('keydown', onKey);
    root.classList.remove('uw-cover');
  }

  // three r169 renders through WebGL2 only.
  function hasWebGL2() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2');
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
    var slow = setTimeout(function () { gaveUp = true; fallback(0); }, 2600);
    timers.push(slow);
    fontReady().then(function () {
      return import(base + 'intro3d.js?v=20261018');
    }).then(function (m) {
      if (finished || gaveUp) return;
      return m.start({
        overlay: overlay, bg: bg, skip: skip, test: test, release: release, setMark: setMark, target: target,
        cancelled: function () { return finished || gaveUp; },
        onDone: finish,
        onFallback: function (at) { ctrl3d = null; if (at < 2.2) fallback(at); else finish(); }
      }).then(function (c) {
        if (finished || gaveUp) { if (c) c.stop(); return; }
        clearTimeout(slow);
        ctrl3d = c;
        window.__introMode = '3d';
        if (test === '1') { window.__introSeek = function (s) { if (ctrl3d) ctrl3d.seek(s); }; window.__introReady = true; }
      });
    }).catch(function () { clearTimeout(slow); fallback(0); });
  }

  function fallback(at) {
    if (finished || mode === '2d') return;
    if (ctrl3d) { try { ctrl3d.stop(); } catch (e) {} ctrl3d = null; }
    bg.style.opacity = '';
    release(false);
    setMark(false);
    play2D(at || 0);
  }

  /* 2D: the same story in CSS, 3.4s (keyframes written on the 4.2s design timeline). The line draws, the wedge rises small,
     crouches and punches up to fill the screen (flash, ring, shake), drops into the
     wordmark as the letters rise, then the lockup flies into the header. */
  function play2D(startAt) {
    if (finished) return;
    mode = '2d';
    window.__introMode = '2d';
    try {
      var w = window.innerWidth || 1280, h = window.innerHeight || 800;
      var stage = document.createElement('div');
      stage.className = 'uw2';
      stage.setAttribute('aria-hidden', 'true');
      var letters = 'upwield'.split('').map(function (c) { return '<i>' + c + '</i>'; }).join('');
      stage.innerHTML = '<i class="uw2-floor"></i><i class="uw2-ring"></i>' +
        '<span class="uw2-mark"><span class="uw2-txt">' + letters + '</span><b class="uw2-mw"><s></s></b></span>' +
        '<i class="uw2-flash"></i>';
      overlay.insertBefore(stage, skip);
      var floor = stage.querySelector('.uw2-floor'), ring = stage.querySelector('.uw2-ring');
      var mark = stage.querySelector('.uw2-mark'), mw = stage.querySelector('.uw2-mw');
      var flash = stage.querySelector('.uw2-flash'), sheen = mw.querySelector('s');
      var ls = stage.querySelectorAll('.uw2-txt i');

      // Lay the lockup out in pixels, centred, so the flight to the header is exact.
      var mr = mark.getBoundingClientRect();
      var ml = Math.round((w - mr.width) / 2), mt = Math.round(h * 0.46 - mr.height / 2);
      mark.style.left = ml + 'px'; mark.style.top = mt + 'px';
      var M = mw.getBoundingClientRect();
      var fy = h * 0.7;
      floor.style.top = fy + 'px';
      ring.style.top = fy + 'px';

      // The wedge's own journey, relative to its place in the lockup (origin: base centre).
      var wx = M.left + M.width / 2, wy = M.bottom;
      var k0 = Math.min(w, h) * 0.07 / M.width, kT = h * 0.92 / M.height;
      function at(x, y, k, sx, sy) {
        return 'translate(' + (x - wx).toFixed(1) + 'px,' + (y - wy).toFixed(1) + 'px) scale(' +
          (k * (sx || 1)).toFixed(3) + ',' + (k * (sy || 1)).toFixed(3) + ')';
      }
      mw.style.transformOrigin = '50% 100%';
      var DES = 4.2, D = 3400;               // design seconds -> real ms, same as the 3D rate
      function o(s) { return s / DES; }
      function ms(s) { return s / DES * D; }
      anims.push(mw.animate([
        { transform: at(w / 2, fy + M.height * k0, k0), offset: 0 },
        { transform: at(w / 2, fy + M.height * k0, k0), offset: o(0.35), easing: 'cubic-bezier(.22,.61,.36,1)' },
        { transform: at(w / 2, fy, k0), offset: o(0.95), easing: 'cubic-bezier(.4,0,.6,1)' },
        { transform: at(w / 2, fy, k0, 1.12, 0.8), offset: o(1.45), easing: 'cubic-bezier(.16,1,.3,1)' },
        { transform: at(w / 2, fy + h * 0.08, kT * 1.06), offset: o(1.62), easing: 'ease-out' },
        { transform: at(w / 2, fy + h * 0.08, kT * 0.98), offset: o(1.8), easing: 'ease-in-out' },
        { transform: at(w / 2, fy + h * 0.08, kT), offset: o(2.05), easing: 'cubic-bezier(.7,0,.2,1)' },
        { transform: 'translate(0,0) scale(1.05)', offset: o(2.6), easing: 'ease-out' },
        { transform: 'none', offset: o(2.75) },
        { transform: 'none', offset: 1 }
      ], { duration: D, fill: 'both' }));
      anims.push(sheen.animate([{ transform: 'translateX(-120%) skewX(-20deg)' }, { transform: 'translateX(-120%) skewX(-20deg)', offset: o(1.7), easing: 'ease-in-out' },
        { transform: 'translateX(220%) skewX(-20deg)', offset: o(2.15) }, { transform: 'translateX(220%) skewX(-20deg)' }],
        { duration: D, fill: 'both' }));
      anims.push(floor.animate([
        { opacity: 0, transform: 'scaleX(0)', offset: 0, easing: 'cubic-bezier(.16,1,.3,1)' }, { opacity: 1, transform: 'scaleX(1)', offset: o(0.75), easing: 'ease-in' },
        { opacity: 1, transform: 'scaleX(.35)', offset: o(1.45), easing: 'cubic-bezier(.16,1,.3,1)' }, { opacity: 1, transform: 'scaleX(1.6)', offset: o(1.8) },
        { opacity: 0, transform: 'scaleX(1.8)', offset: o(2.2) }, { opacity: 0, offset: 1 }
      ], { duration: D, fill: 'both' }));
      anims.push(ring.animate([
        { opacity: 0, transform: 'translate(-50%,-50%) scale(.05)', offset: 0 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.05)', offset: o(1.6) },
        { opacity: 1, offset: o(1.66), easing: 'cubic-bezier(.16,1,.3,1)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1)', offset: o(2.25) }, { opacity: 0, offset: 1 }
      ], { duration: D, fill: 'both' }));
      anims.push(flash.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: o(1.58) }, { opacity: 0.55, offset: o(1.62) }, { opacity: 0, offset: o(1.95) }, { opacity: 0 }],
        { duration: D, fill: 'both' }));
      anims.push(stage.animate([{ transform: 'none', offset: 0 }, { transform: 'none', offset: o(1.6) },
        { transform: 'translate(9px,-7px)', offset: o(1.65) }, { transform: 'translate(-7px,5px)', offset: o(1.71) },
        { transform: 'translate(4px,3px)', offset: o(1.78) }, { transform: 'translate(-2px,-2px)', offset: o(1.86) },
        { transform: 'none', offset: o(1.95) }, { transform: 'none' }], { duration: D, fill: 'both' }));
      Array.prototype.forEach.call(ls, function (l, i) {
        var s0 = 2.3 + i * 0.04;
        anims.push(l.animate([{ opacity: 0, transform: 'translateY(.35em)' }, { opacity: 0, transform: 'translateY(.35em)', offset: o(s0), easing: 'cubic-bezier(.16,1,.3,1)' },
          { opacity: 1, transform: 'none', offset: o(s0 + 0.5) }, { opacity: 1, transform: 'none' }],
          { duration: D, fill: 'both' }));
      });

      // The lockup flies into the header while the page fades in around it.
      var T = target();
      if (T) {
        var kk = T.width / M.width;
        mark.style.transformOrigin = (M.left - ml) + 'px ' + (M.top - mt) + 'px';
        var fly = 'translate(' + (T.left - M.left).toFixed(1) + 'px,' + (T.top - M.top).toFixed(1) + 'px) scale(' + kk.toFixed(4) + ')';
        anims.push(mark.animate([{ transform: 'none', offset: 0 }, { transform: 'none', offset: o(3.45), easing: 'cubic-bezier(.65,0,.25,1)' },
          { transform: fly, offset: o(4.0) }, { transform: fly }],
          { duration: D, fill: 'both' }));
      }
      anims.push(mark.animate([{ opacity: 1 }, { opacity: 1, offset: o(4.04) }, { opacity: 0, offset: o(4.05) }, { opacity: 0 }], { duration: D, fill: 'both' }));
      anims.push(bg.animate([{ opacity: 1 }, { opacity: 1, offset: o(3.45) }, { opacity: 0, offset: o(3.83) }, { opacity: 0 }], { duration: D, fill: 'both' }));
      anims.push(skip.animate([{ opacity: 1 }, { opacity: 1, offset: o(3.45) }, { opacity: 0, offset: o(3.7) }, { opacity: 0 }], { duration: D, fill: 'both' }));
      var skipMs = startAt && startAt > 0.5 ? Math.min(ms(startAt), D - 200) : 0;
      if (skipMs > 0) {
        anims.forEach(function (a) { try { a.currentTime = skipMs; } catch (e) {} });
      }
      timers.push(setTimeout(function () { if (!finished) release(true); }, Math.max(0, ms(3.95) - skipMs)));
      timers.push(setTimeout(function () { if (!finished) setMark(true); }, Math.max(0, ms(4.0) - skipMs)));
      timers.push(setTimeout(finish, Math.max(0, D - skipMs)));
    } catch (err) {
      finish();
    }
  }

  function begin() {
    if (finished) return;
    try {
      makeOverlay();
      if (test !== '2d' && hasWebGL2()) play3D(); else play2D();
    } catch (e) { finish(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin);
  else begin();
})();
