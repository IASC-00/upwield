/* 3D intro (v2, 18 Oct 2026): loaded by intro.js only when the intro is going to play.

   PUNCH ABOVE YOUR SIZE, in one beat.
     0.00  a line of light draws across a dark honed floor; a small ember wedge rises
           up through it
     0.95  it crouches and charges: the line pulls in, the core heats, embers lift
     1.45  PUNCH. It launches up to tower over the camera. The camera is knocked back
           and shakes, a shockwave ring tears across the floor and through the screen
           (distortion + chromatic split), sparks burst, everything blooms
     1.62  light runs over its faces while it stands there, rimmed in blue and teal
     2.05  it drops back to size and locks into the wordmark with a crisp settle; the
           letters (real DOM text, the site's own font) rise in one by one
     2.85  a sheen crosses the lockup
     3.45  the lockup glides into the header and lands on the real wordmark to the
           pixel while the page fades in around it; then the real one takes over
   Done at 4.2 design-seconds, played at CFG.rate so it lasts 3.4s on screen.

   Render pipeline: scene -> UnrealBloom -> OutputPass (ACES, sRGB) -> FINAL pass
   (shockwave distortion, chromatic aberration, flash, vignette, grain, then the
   site's own background added under it). The scene clears to black and is ADDED onto
   a shader copy of the page's CSS background, so an empty frame is exactly the page
   background and the hand-off has no seam. The lockup is DOM, so it lands pixel-exact.

   Every frame is a pure function of time t, so the test hook can seek to any moment.
   Colours, timings and quality tiers all live in CFG below. */
import * as THREE from './vendor/three/three.module.min.js';
import { RoomEnvironment } from './vendor/three/RoomEnvironment.js';
import { EffectComposer } from './vendor/three/post/EffectComposer.js';
import { RenderPass } from './vendor/three/post/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/post/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/post/OutputPass.js';
import { ShaderPass } from './vendor/three/post/ShaderPass.js';

/* ======================================================================== CONFIG */
const CFG = {
  dur: 4.2,                  // design timeline (all times below are on it)
  rate: 4.2 / 3.4,           // playback speed: the whole timeline plays in 3.4s
  t: {                       // seconds
    fieldIn: [0, 0.5],
    lineDraw: [0.08, 0.75],
    rise: [0.35, 0.95],      // wedge rises through the line
    crouch: [0.95, 1.45],    // anticipation + charge
    punch: 1.45,             // launch
    hit: 1.62,               // full height: impact
    drop: 2.05,              // starts back down to size
    lock: 2.65,              // locked into the lockup
    letters: 2.30, letterStagger: 0.04, letterDur: 0.50,
    sheen: [2.85, 3.45],
    fly: 3.45,               // glide into the header
    land: 4.00               // on the real wordmark
  },
  color: {                   // the site's tokens (upwield.css :root)
    paper: 0x050B18, ember: 0xFF6A45, emberDeep: 0xE24A24, teal: 0x6BA89E,
    beam: 0x3F82FF, sky: 0xA8C5FF, hot: 0xFFE3D6
  },
  wedge: { small: 0.34, tower: 3.0, towerPortrait: 2.15, depth: 0.28 },
  lockup: { gap: 0.12, wedge: 0.62, frac: 0.46, fracSquare: 0.66, fracPortrait: 0.8 }, // fracs: lockup width / screen width
  camera: { fov: 40, back: 4.7, backPortrait: 7.2 },
  post: {
    bloom: { base: 0.24, charge: 0.18, impact: 0.12, radius: 0.36, threshold: 1.0 },
    ca: { base: 0.0007, impact: 0.0035 }, // chromatic aberration (uv units)
    shock: { amp: 0.011, width: 0.11 },   // screen-space ripple
    flash: 0.13, vignette: 0.42, grain: 0.018
  },
  quality: {                 // chosen once from the device
    high: { dpr: 2, bloomScale: 0.5, samples: 2, sparks: 700, shadow: 1024 },
    low: { dpr: 1.5, bloomScale: 0.25, samples: 2, sparks: 260, shadow: 512 }
  }
};

/* ======================================================================== HELPERS */
const T = CFG.t, C = CFG.color;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const span = (t, a, b) => clamp((t - a) / (b - a));
const ease = x => x * x * (3 - 2 * x);
const outCubic = x => 1 - Math.pow(1 - x, 3);
const outExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const inOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const inOutQuint = x => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2);
const lerp = (a, b, k) => a + (b - a) * k;
const bump = (t, a, b) => Math.sin(Math.PI * span(t, a, b));
const pulse = (t, t0, decay) => (t < t0 ? 0 : Math.exp(-decay * (t - t0)));
// damped spring offset, starting at t0
const spring = (t, t0, amp, freq, damp) => (t < t0 ? 0 : amp * Math.exp(-damp * (t - t0)) * Math.cos(freq * (t - t0)));
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const hex3 = h => new THREE.Vector3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255); // raw sRGB

function canvasTex(w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const radialTex = stops => canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const lineTex = () => canvasTex(512, 32, (g) => {
  const gx = g.createLinearGradient(0, 0, 512, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.5, '#fff'); gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx; g.fillRect(0, 0, 512, 32);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, 32);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.5, '#000'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy; g.fillRect(0, 0, 512, 32);
});

/* ======================================================================== SHADERS */
// Value-noise fbm, shared by the wedge's inner glow and the shockwave.
const NOISE = `
  float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }`;

// The wedge: physical clearcoat ember, plus a fresnel rim (blue on the left edges,
// teal on the right) and an inner glow of drifting emissive noise that heats with
// the charge.
function wedgeMaterial(u) {
  const m = new THREE.MeshPhysicalMaterial({
    color: C.ember, roughness: 0.30, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
    sheen: 0.5, sheenColor: new THREE.Color(0xff8a60), sheenRoughness: 0.45,
    emissive: C.emberDeep, emissiveIntensity: 0.05, envMapIntensity: 1.5, transparent: true, fog: false
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObj; uniform float uTime, uCharge, uRim; uniform vec3 uRimA, uRimB, uHot;
        ${NOISE}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 V = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(abs(dot(normal, V)), 0.0, 1.0), 3.0);
          vec3 rimC = mix(uRimA, uRimB, smoothstep(-0.35, 0.35, normal.x));
          totalEmissiveRadiance += rimC * fr * uRim;
          float n = fbm(vObj * vec3(4.0, 4.0, 6.0) + vec3(0.0, -uTime * 0.9, uTime * 0.2));
          float core = smoothstep(0.15, 1.0, n) * (1.15 - vObj.y);
          totalEmissiveRadiance += uHot * core * uCharge;
        }`);
  };
  m.customProgramCacheKey = () => 'uw-wedge';
  return m;
}

// Sparks and embers: all motion in the vertex shader, from per-particle attributes.
const SPARK_VS = `
  attribute vec3 aVel; attribute vec4 aInfo; attribute vec3 aCol;   // aInfo: life, delay, size, drag
  uniform float uT, uScale; varying vec3 vCol; varying float vA;
  void main(){
    float tt = uT - aInfo.y, u = tt / aInfo.x;
    if (u <= 0.0 || u >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
    float d = aInfo.w;
    vec3 p = aVel * (1.0 - exp(-d * tt)) / d;
    p.y += -1.6 * tt * tt;
    p.y = abs(p.y);                                    // a bounce off the floor
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aInfo.z * uScale / -mv.z * (1.0 - u * 0.6);
    vCol = aCol; vA = pow(1.0 - u, 1.4);
  }`;
const SPARK_FS = `
  varying vec3 vCol; varying float vA;
  void main(){ vec2 q = gl_PointCoord - 0.5; float r = dot(q, q) * 4.0; if (r > 1.0) discard;
    gl_FragColor = vec4(vCol * vA * (1.0 - r) * (1.0 - r), 1.0); }`;

// The shockwave: a noisy, hot ring on the floor.
const RING_FS = `
  uniform float uR, uA, uW; uniform vec3 uCol; varying vec2 vUv;
  ${NOISE}
  void main(){
    vec2 q = vUv * 2.0 - 1.0; float d = length(q);
    float n = fbm(vec3(q * 3.0, uR * 2.0));
    float ring = exp(-pow((d - uR) / (uW * (0.7 + 0.6 * n)), 2.0));
    float fill = (1.0 - smoothstep(0.0, uR, d)) * 0.04;
    float a = (ring + fill) * uA * (1.0 - smoothstep(0.85, 1.0, d));
    gl_FragColor = vec4(uCol * a, 1.0);
  }`;
const UV_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// FINAL: runs after OutputPass, in display (sRGB) space.
const FINAL = {
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uShockC: { value: new THREE.Vector2(0.5, 0.5) }, uShockR: { value: -1 }, uShockA: { value: 0 }, uShockW: { value: 0.11 },
    uCA: { value: 0 }, uFlash: { value: 0 }, uVig: { value: 0 }, uGrain: { value: 0 }, uFx: { value: 1 },
    uPaper: { value: hex3(C.paper) }, uBeam: { value: hex3(C.beam) }, uSky: { value: hex3(C.sky) },
    uFlashC: { value: hex3(C.hot) }, uEmber: { value: hex3(C.ember) }
  },
  vertexShader: UV_VS,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes, uShockC; uniform float uTime, uShockR, uShockA, uShockW, uCA, uFlash, uVig, uGrain, uFx;
    uniform vec3 uPaper, uBeam, uSky, uFlashC, uEmber; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    // CSS radial-gradient(<rx>px <ry>px at <cx> <cy>, rgba(c, a), transparent <end>)
    float css(vec2 px, vec2 at, vec2 r, float a, float e){ float d = length((px - at) / r); return a * (1.0 - clamp(d / e, 0.0, 1.0)); }
    void main(){
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
      vec2 dv = (vUv - uShockC) * asp; float d = length(dv);
      vec2 dir = d > 0.0001 ? dv / d : vec2(0.0);
      float x = (d - uShockR) / uShockW;
      float rip = uShockA * 1.65 * x * exp(-x * x) * (1.0 - smoothstep(0.3, 0.9, vUv.y)); // kept low, on the floor, off the wedge
      vec2 uv = clamp(vUv - dir / asp * rip, 0.002, 0.998);
      vec2 ca = (vUv - 0.5) * uCA + dir / asp * abs(rip) * 0.6;
      vec3 col = vec3(
        texture2D(tDiffuse, clamp(uv + ca, 0.002, 0.998)).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, clamp(uv - ca, 0.002, 0.998)).b
      );
      col += uFlashC * uFlash * (1.0 - 0.6 * length(vUv - uShockC));
      col += uEmber * uFlash * 0.35;
      float vig = smoothstep(0.35, 1.05, length((vUv - 0.5) * vec2(1.25, 1.0)));
      col *= 1.0 - uVig * vig;
      col += (hash(vUv * uRes + fract(uTime * 7.31) * 91.7) - 0.5) * uGrain;
      col = max(col, 0.0) * uFx;
      // the page's own background (upwield.css body), so black here is the page
      vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
      vec3 bg = uPaper;
      float a2 = css(px, vec2(0.92, 0.04) * uRes, vec2(900.0, 560.0), 0.10, 0.60); bg = mix(bg, uSky, a2);
      float a1 = css(px, vec2(0.12, -0.08) * uRes, vec2(1200.0, 680.0), 0.20, 0.62); bg = mix(bg, uBeam, a1);
      gl_FragColor = vec4(bg + col, 1.0);
    }`
};

/* ======================================================================== LOCKUP (DOM) */
// The wordmark set exactly the way the header sets it, at a reference size: one row
// that carries the wedge (and defines the layout), one copy per letter (only that
// letter painted, so it can move alone while keeping the word's kerning), and a sheen.
const F0 = 100;
function buildLockup(overlay, before) {
  const word = 'upwield';
  const el = document.createElement('div');
  el.className = 'uw-lk';
  el.setAttribute('aria-hidden', 'true');
  const row = cls => { const r = document.createElement('div'); r.className = 'uw-lk-row ' + cls; el.appendChild(r); return r; };
  const base = row('uw-lk-base');
  base.innerHTML = '<span class="uw-lk-t">' + word + '</span><b class="uw-lk-w"><s></s></b>';
  const copies = [];
  for (let i = 0; i < word.length; i++) {
    const r = row('uw-lk-l');
    r.innerHTML = '<span class="uw-lk-t">' + word.split('').map((ch, j) => '<span' + (j === i ? ' class="on"' : '') + '>' + ch + '</span>').join('') + '</span>';
    copies.push(r);
  }
  const sheen = row('uw-lk-sheen');
  sheen.innerHTML = '<span class="uw-lk-t">' + word + '</span>';
  overlay.insertBefore(el, before);
  el.style.fontSize = F0 + 'px';
  el.style.transform = 'none';
  const rr = base.getBoundingClientRect();
  const w = base.querySelector('.uw-lk-w');
  const wr = w.getBoundingClientRect();
  const ax = wr.left - rr.left, ay = wr.bottom - rr.top + 0.04 * F0;   // anchor: wedge left edge, on the baseline
  const letters = copies.map(r => {
    const on = r.querySelector('.on').getBoundingClientRect();
    r.style.transformOrigin = (on.left - rr.left + on.width / 2) + 'px ' + ay + 'px';
    return r;
  });
  el.style.transformOrigin = ax + 'px ' + ay + 'px';
  return { el, letters, sheen: sheen.querySelector('.uw-lk-t'),
    wedge: w, ax, ay, rowW: rr.width, wedgeEm: ax / F0, remove() { if (el.parentNode) el.parentNode.removeChild(el); } };
}

/* ======================================================================== START */
export async function start(opts) {
  const { overlay, bg, skip, test, onDone, onFallback, release, setMark, target } = opts;
  const seekMode = test === '1';
  const checkSpeed = !test;

  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 700;
  const Q = coarse || small ? CFG.quality.low : CFG.quality.high;
  const dpr = Math.min(window.devicePixelRatio || 1, Q.dpr);

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 1);              // black = "nothing": FINAL adds the page bg
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'uw-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  let stopped = false, raf = 0, live = false;   // live: the clock has started
  const disposables = [];
  const keep = (...a) => { disposables.push(...a); return a[0]; };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CFG.camera.fov, 1, 0.05, 120);
  scene.fog = new THREE.Fog(0x000000, 6, 18);       // fades to black = to the page bg

  // ---- environment: a dark studio with a warm softbox and long blue / teal strips
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  room.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) o.material.color.setHex(0x070d1b); });
  const stripGeo = new THREE.BoxGeometry(1, 1, 1);
  const strip = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
  const strips = [strip(0xffe6d8, 9), strip(C.sky, 7), strip(C.teal, 8), strip(C.beam, 8)];
  [[0, -5, 8, 6, 9, 0.6], [1, -10, 3, -4, 0.6, 12], [2, 10, 3, -5, 0.6, 12], [3, 0, 1, -11, 20, 0.5], [0, 6, 5, 9, 4, 0.4]]
    .forEach(([mi, x, y, z, sx, sy]) => {
      const b = new THREE.Mesh(stripGeo, strips[mi]); b.position.set(x, y, z); b.scale.set(sx, sy, 0.2); b.lookAt(0, 1, 0); room.add(b);
    });
  const envRT = pmrem.fromScene(room, 0.025);
  room.dispose(); stripGeo.dispose(); strips.forEach(m => m.dispose());
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.9;

  // ---- lights
  const hemi = new THREE.HemisphereLight(0x3a5a99, 0x02050c, 0.35);
  const key = new THREE.DirectionalLight(0xfff0e6, 1.45);
  key.position.set(-4.4, 4.2, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(Q.shadow, Q.shadow);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -1.5, near: 0.5, far: 16 });
  key.shadow.radius = 5; key.shadow.bias = -0.0006;
  const rimB = new THREE.PointLight(C.beam, 0, 0, 1.5);   // behind the left edge
  const rimT = new THREE.PointLight(C.teal, 0, 0, 1.5);   // behind the right edge
  const core = new THREE.PointLight(C.ember, 0, 0, 1.8);  // the charge, on the floor in front
  const sweep = new THREE.PointLight(0xfff4ee, 0, 0, 1.6); // light running over the faces
  scene.add(hemi, key, key.target, rimB, rimT, core, sweep);

  // ---- floor: dark and honed, no grid
  const floorMat = keep(new THREE.MeshStandardMaterial({ color: 0x07112a, roughness: 0.5, metalness: 0.45, transparent: true }));
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(60, 60)), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);

  // ---- the line of light across the floor: hot core + wide soft glow
  const ltex = keep(lineTex());
  const quad = keep(new THREE.PlaneGeometry(1, 1));
  const addMat = (o) => keep(new THREE.MeshBasicMaterial(Object.assign({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false }, o)));
  const lineCoreMat = addMat({ map: ltex, color: new THREE.Color(C.hot).multiplyScalar(2.4) });
  const lineGlowMat = addMat({ map: ltex, color: new THREE.Color(C.beam).multiplyScalar(1.2) });
  const lineCore = new THREE.Mesh(quad, lineCoreMat), lineGlow = new THREE.Mesh(quad, lineGlowMat);
  [lineCore, lineGlow].forEach(m => { m.rotation.x = -Math.PI / 2; m.position.y = 0.004; m.renderOrder = 2; scene.add(m); });

  // light pooled on the floor under the wedge
  const poolMat = addMat({ map: keep(radialTex([[0, 'rgba(255,140,100,1)'], [0.35, 'rgba(255,106,69,.45)'], [1, 'rgba(255,106,69,0)']])) });
  const pool = new THREE.Mesh(quad, poolMat);
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.005; pool.renderOrder = 2;
  scene.add(pool);

  // ---- shockwave rings (floor)
  const ringGeo = keep(new THREE.PlaneGeometry(2, 2));
  const ringMat = (col) => keep(new THREE.ShaderMaterial({
    uniforms: { uR: { value: 0 }, uA: { value: 0 }, uW: { value: 0.035 }, uCol: { value: new THREE.Color(col).multiplyScalar(2.2) } },
    vertexShader: UV_VS, fragmentShader: RING_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  const rings = [ringMat(C.hot), ringMat(C.sky)].map(m => {
    const r = new THREE.Mesh(ringGeo, m); r.rotation.x = -Math.PI / 2; r.position.y = 0.006; r.renderOrder = 3; r.scale.setScalar(9); scene.add(r); return r;
  });

  // ---- the wedge: the wordmark's upward triangle, base on the floor, height 1
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0); shape.lineTo(0.5, 0); shape.lineTo(0, 1); shape.closePath();
  const DEP = CFG.wedge.depth;
  const wedgeGeo = keep(new THREE.ExtrudeGeometry(shape, {
    depth: DEP, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.028, bevelOffset: -0.028, bevelSegments: 5, curveSegments: 1
  }));
  wedgeGeo.translate(0, 0, -DEP / 2);
  const wU = { uTime: { value: 0 }, uCharge: { value: 0 }, uRim: { value: 0 },
    uRimA: { value: new THREE.Color(C.beam) }, uRimB: { value: new THREE.Color(C.teal) }, uHot: { value: new THREE.Color(0xff7a40).multiplyScalar(1.3) } };
  const wedgeMat = keep(wedgeMaterial(wU));
  const wedge = new THREE.Mesh(wedgeGeo, wedgeMat);
  wedge.castShadow = true;
  scene.add(wedge);

  // halo behind it and an anamorphic streak at the moment of impact
  const haloMat = keep(new THREE.SpriteMaterial({ map: keep(radialTex([[0, 'rgba(255,150,110,1)'], [0.25, 'rgba(255,106,69,.5)'], [0.6, 'rgba(226,74,36,.1)'], [1, 'rgba(226,74,36,0)']])),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  const halo = new THREE.Sprite(haloMat); halo.renderOrder = -1;
  const streakMat = keep(new THREE.SpriteMaterial({ map: ltex, color: new THREE.Color(C.hot).multiplyScalar(1.3), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
  const streak = new THREE.Sprite(streakMat); streak.renderOrder = 5;
  scene.add(halo, streak);

  // ---- sparks (burst at impact) + embers (lifting during the charge), GPU points
  const NS = Q.sparks;
  const R = rng(11);
  const aVel = new Float32Array(NS * 3), aInfo = new Float32Array(NS * 4), aCol = new Float32Array(NS * 3);
  const cE = new THREE.Color(0xffa078), cH = new THREE.Color(C.hot), cS = new THREE.Color(C.sky);
  for (let i = 0; i < NS; i++) {
    const ember = i < NS * 0.18;                       // the first share are slow embers
    const a = R() * Math.PI * 2;
    const sp = ember ? 0.15 + R() * 0.35 : 1.5 + R() * 5.5;
    const up = ember ? 0.5 + R() * 0.8 : 0.5 + R() * 4.5;
    aVel.set([Math.cos(a) * sp, up, Math.sin(a) * sp * 0.8], i * 3);
    // life, delay (relative to the hit; embers start during the charge), size, drag
    aInfo.set(ember ? [1.4 + R() * 1.2, -0.65 + R() * 0.6, 5 + R() * 6, 0.6] : [0.45 + R() * 1.1, R() * 0.07, 3 + R() * 7, 2.5 + R() * 2], i * 4);
    const c = (ember || R() < 0.6 ? cE : R() < 0.5 ? cH : cS).clone().multiplyScalar(ember ? 1.4 : 2.2);
    aCol.set([c.r, c.g, c.b], i * 3);
  }
  const sparkGeo = keep(new THREE.BufferGeometry());
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
  sparkGeo.setAttribute('aVel', new THREE.BufferAttribute(aVel, 3));
  sparkGeo.setAttribute('aInfo', new THREE.BufferAttribute(aInfo, 4));
  sparkGeo.setAttribute('aCol', new THREE.BufferAttribute(aCol, 3));
  const sparkMat = keep(new THREE.ShaderMaterial({ uniforms: { uT: { value: -9 }, uScale: { value: 1 } },
    vertexShader: SPARK_VS, fragmentShader: SPARK_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false; sparks.renderOrder = 4;
  scene.add(sparks);

  // ---- post-processing
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Q.samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), CFG.post.bloom.base, CFG.post.bloom.radius, CFG.post.bloom.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const fin = new ShaderPass(FINAL);
  composer.addPass(fin);
  const FU = fin.uniforms;
  FU.uShockW.value = CFG.post.shock.width;

  // ---- lockup geometry (font size 1 = 1 world unit), from the DOM measure
  const lk = buildLockup(overlay, skip);
  const wS = CFG.lockup.wedge;
  const L = lk.wedgeEm + wS;
  const Yc = 1.1, yB = Yc - 0.3;                    // lockup centre / baseline
  const x0 = -L / 2, wedgeLX = x0 + lk.wedgeEm;
  const wedgeEndX = wedgeLX + wS / 2, wedgeEndY = yB + 0.04;

  // ---- camera spline (rebuilt on resize): start, closest, knocked back, drift, lockup
  let W = 1280, H = 720, Dl = 4, ppuC = 100, tgt = null, portrait = false, s1 = CFG.wedge.tower;
  const tv = Math.tan(THREE.MathUtils.degToRad(CFG.camera.fov / 2));
  let camPath = null, lookPath = null;
  function layout() {
    W = innerWidth || 1280; H = innerHeight || 720;
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    bloom.resolution.set(W * Q.bloomScale, H * Q.bloomScale);
    bloom.setSize(Math.round(W * dpr * Q.bloomScale), Math.round(H * dpr * Q.bloomScale));
    FU.uRes.value.set(W, H);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    portrait = camera.aspect < 0.8;
    s1 = portrait ? CFG.wedge.towerPortrait : CFG.wedge.tower;
    const frac = portrait ? CFG.lockup.fracPortrait : camera.aspect < 1.2 ? CFG.lockup.fracSquare : CFG.lockup.frac;
    Dl = (L / 2) / (frac * tv * camera.aspect);
    ppuC = H / (2 * Dl * tv);
    const back = portrait ? CFG.camera.backPortrait : CFG.camera.back;
    camPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.55, 0.42, 2.9), new THREE.Vector3(0.12, 0.2, 1.75), new THREE.Vector3(-1.5, 0.14, back),
      new THREE.Vector3(1.2, 0.34, back + 0.35), new THREE.Vector3(0, Yc, Dl)], false, 'centripetal');
    lookPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(0, 0.17, 0), new THREE.Vector3(0, s1 * (portrait ? 0.38 : 0.47), 0),
      new THREE.Vector3(0.1, s1 * (portrait ? 0.41 : 0.5), 0), new THREE.Vector3(0, Yc, 0)], false, 'centripetal');
    sparkMat.uniforms.uScale.value = H * dpr * 0.012;
    tgt = target ? target() : null;
  }
  layout();

  // camera path parameter: four segments, each with its own weight
  function camU(t) {
    if (t < T.punch) return 0.25 * inOut(span(t, 0, T.punch));
    if (t < T.hit + 0.35) return 0.25 + 0.25 * outExpo(span(t, T.punch + 0.02, T.hit + 0.35));
    if (t < T.drop) return 0.5 + 0.25 * outCubic(span(t, T.hit + 0.35, T.drop));
    return 0.75 + 0.25 * inOutQuint(span(t, T.drop, T.lock + 0.1));
  }

  const look = new THREE.Vector3(), tmp = new THREE.Vector3();
  let releaseOn = false, markOn = false;

  function update(t) {
    t = clamp(t, 0, CFG.dur);
    const P = CFG.post;

    // ---- field
    const fieldIn = ease(span(t, ...T.fieldIn));
    const floorOut = ease(span(t, T.drop, T.drop + 0.6));
    floorMat.opacity = fieldIn * (1 - floorOut);
    floor.visible = floorMat.opacity > 0.003;

    // ---- the line: draws out, pulls in while the wedge charges, blown wide by the hit
    const draw = outExpo(span(t, ...T.lineDraw));
    const pull = inOut(span(t, T.crouch[0], T.punch));
    const blow = outExpo(span(t, T.hit - 0.04, T.hit + 0.6));
    const lineLen = 14 * draw * lerp(1, 0.3, pull) * (1 + 1.2 * blow);
    const lineA = draw * (1 - span(t, T.hit, T.hit + 0.6)) * (1 - floorOut) * (0.8 + 0.5 * pull);
    lineCore.scale.set(lineLen, 0.035 * (1 + 2 * pull), 1);
    lineGlow.scale.set(lineLen * 1.1, 0.5 * (1 + pull), 1);
    lineCoreMat.opacity = clamp(lineA); lineGlowMat.opacity = 0.55 * clamp(lineA);
    lineCore.visible = lineGlow.visible = lineA > 0.002;

    // ---- the wedge
    const s0 = CFG.wedge.small;
    const rise = outCubic(span(t, ...T.rise));
    const crouch = inOut(span(t, ...T.crouch));
    const punch = outExpo(span(t, T.punch, T.hit + 0.12));
    const drop = inOutQuint(span(t, T.drop, T.lock));
    let sz = lerp(s0, s1, punch) * (1 + spring(t, T.hit, 0.07, 30, 7));
    sz = lerp(sz, wS, drop) * (1 + spring(t, T.lock, 0.06, 26, 9));   // crisp settle when it locks
    const stretch = bump(t, T.punch, T.hit + 0.08);                    // squash, stretch, square
    const sqx = (1 + 0.14 * crouch * (1 - punch)) * (1 - 0.12 * stretch);
    const sqy = (1 - 0.2 * crouch * (1 - punch)) * (1 + 0.16 * stretch);
    wedge.scale.set(sz * sqx, sz * sqy, sz);
    wedge.position.set(lerp(0, wedgeEndX, drop), lerp(lerp(-s0 * 1.05, 0, rise), wedgeEndY, drop), 0);
    wedge.rotation.y = lerp(lerp(0.55, 0.3, crouch) - 0.7 * inOut(span(t, T.hit, T.drop + 0.2)), 0, drop);
    wedge.rotation.x = -0.06 * crouch * (1 - punch);
    const impact = pulse(t, T.hit - 0.03, 7);
    const charge = crouch * (1 - span(t, T.hit, T.hit + 0.5));
    wU.uTime.value = t;
    wU.uCharge.value = (0.05 * rise + 0.42 * charge + 0.3 * impact) * (1 - 0.8 * drop);
    wU.uRim.value = (0.4 + 0.8 * charge + 1.2 * impact) * fieldIn * (1 - drop) + 0.2;
    wedgeMat.emissiveIntensity = 0.05 + 0.2 * charge;

    // the DOM wedge takes over once it has locked
    const toFlat = ease(span(t, T.lock + 0.15, T.fly - 0.05));
    wedgeMat.opacity = 1 - toFlat;
    wedge.visible = sz > 0.001 && toFlat < 1;
    wedge.castShadow = toFlat < 0.5;

    const hs = Math.max(sz, 0.05);
    halo.position.set(wedge.position.x, wedge.position.y + hs * 0.45, -0.25 * hs);
    halo.scale.setScalar(hs * (2.4 + 1.2 * impact));
    haloMat.opacity = clamp((0.12 * rise + 0.3 * charge + 0.35 * impact) * (1 - 0.7 * drop) * (1 - toFlat));
    halo.visible = haloMat.opacity > 0.002;
    pool.scale.set(hs * 3.2, hs * 2.0, 1);
    poolMat.opacity = clamp((0.25 * rise + 0.5 * charge + 0.45 * impact) * (1 - floorOut));
    pool.visible = poolMat.opacity > 0.002;
    const sk = span(t, T.hit - 0.03, T.hit + 0.45);
    streak.position.set(0, 0.05, 0.3);
    streak.scale.set(lerp(2, 26, outExpo(sk)), 0.09 + 0.25 * (1 - sk), 1);
    streakMat.opacity = sk > 0 && sk < 1 ? Math.sin(Math.PI * Math.sqrt(sk)) : 0;
    streak.visible = streakMat.opacity > 0.002;

    // shockwave rings
    [[T.hit - 0.02, 0.8, 1], [T.hit + 0.07, 1.05, 0.75]].forEach(([a, len, amp], i) => {
      const k = span(t, a, a + len), m = rings[i].material.uniforms;
      m.uR.value = 0.03 + 0.95 * outExpo(k);
      m.uA.value = k > 0 && k < 1 ? amp * Math.pow(1 - k, 1.5) : 0;
      rings[i].visible = m.uA.value > 0.002;
    });

    // sparks + embers (time relative to the hit)
    sparkMat.uniforms.uT.value = t - T.hit;
    sparks.visible = t > T.hit - 1.0 && t < T.hit + 2.5;

    // ---- lights
    key.intensity = 1.45 * fieldIn * (1 - 0.35 * charge);
    key.target.position.set(0, 0.8, 0);
    hemi.intensity = 0.35 * fieldIn;
    const lit = fieldIn * (1 - toFlat);
    rimB.position.set(-0.85 * sz - 0.2, 0.75 * sz + 0.35, -0.7 * sz - 0.2);
    rimT.position.set(0.85 * sz + 0.2, 0.55 * sz + 0.35, -0.7 * sz - 0.2);
    const rimK = (0.8 + 1.6 * sz) * lit * (0.6 + 0.6 * charge + 0.8 * impact);
    rimB.intensity = rimK; rimT.intensity = rimK * 0.9;
    core.position.set(0, 0.06, 0.45 * sz + 0.15);
    core.intensity = (0.4 * rise + 1.8 * charge + 4 * impact) * (1 - drop);
    const sw1 = span(t, T.hit + 0.15, T.drop + 0.1), sw2 = span(t, T.lock - 0.1, T.lock + 0.5);
    if (t < T.lock - 0.1) {
      sweep.position.set(lerp(-1.4, 1.6, inOut(sw1)) * s1 * 0.6, lerp(0.4, 1.8, sw1), 1.4);
      sweep.intensity = 5.5 * Math.sin(Math.PI * sw1) * (1 - drop);
    } else {
      sweep.position.set(lerp(wedgeLX - 0.5, wedgeLX + wS + 0.5, inOut(sw2)), wedgeEndY + 0.5, 0.6);
      sweep.intensity = 4 * Math.sin(Math.PI * sw2) * (1 - toFlat);
    }
    scene.environmentRotation.set(0, -0.6 + 1.2 * inOut(span(t, 0, CFG.dur)), 0);

    // ---- camera: along the spline, then square on to the lockup
    const u = camU(t);
    camPath.getPoint(u, camera.position);
    lookPath.getPoint(u, look);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    let sh = t > T.hit - 0.01 && t < T.drop ? Math.exp(-(t - T.hit) * 7.5) : 0;   // impact shake
    if (sh > 0.001) {
      if (portrait) sh *= 0.45;                                       // tall screens: keep the apex in frame
      camera.rotateX(sh * 0.035 * Math.sin(t * 97.0));
      camera.rotateY(sh * 0.03 * Math.sin(t * 83.0 + 1.3));
      camera.rotateZ(sh * 0.02 * Math.sin(t * 71.0 + 2.1));
    }
    camera.updateMatrixWorld();

    // ---- post
    bloom.strength = (P.bloom.base + P.bloom.charge * charge + P.bloom.impact * impact) * (1 - toFlat);
    tmp.set(0, 0.02, 0).project(camera);                                          // the impact point on screen
    FU.uShockC.value.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
    const shk = span(t, T.hit - 0.02, T.hit + 0.75);
    FU.uShockR.value = shk > 0 && shk < 1 ? 1.6 * outCubic(shk) : -1;
    FU.uShockA.value = shk > 0 && shk < 1 ? P.shock.amp * Math.min(1, camera.aspect) * Math.pow(1 - shk, 1.3) : 0;   // gentler on tall screens
    FU.uCA.value = (P.ca.base + P.ca.impact * impact) * (1 - toFlat);
    FU.uFlash.value = t >= T.hit - 0.03 ? P.flash * Math.pow(1 - span(t, T.hit - 0.03, T.hit + 0.4), 2.4) : 0;
    const fx = 1 - toFlat;
    FU.uVig.value = P.vignette * fieldIn * fx;
    FU.uGrain.value = P.grain * fieldIn * fx;
    FU.uTime.value = t;

    // ---- lockup (DOM): letters rise in, sheen, glide into the header
    lk.letters.forEach((r, i) => {
      const k = outExpo(span(t, T.letters + i * T.letterStagger, T.letters + i * T.letterStagger + T.letterDur));
      r.style.opacity = clamp(k * 1.3).toFixed(3);
      r.style.transform = k >= 1 ? 'none' : `perspective(4em) translate3d(0, ${(0.34 * (1 - k)).toFixed(4)}em, ${(0.5 * (1 - k)).toFixed(4)}em) rotateX(${(-50 * (1 - k)).toFixed(2)}deg)`;
      r.style.filter = k >= 0.98 ? 'none' : `blur(${(0.06 * (1 - k)).toFixed(4)}em)`;
    });
    const shp = inOut(span(t, ...T.sheen));
    lk.sheen.style.backgroundPosition = `${lerp(-1.2, 1.4, shp) * lk.rowW}px 0`;
    lk.sheen.parentNode.style.opacity = shp > 0 && shp < 1 ? '1' : '0';
    lk.wedge.style.opacity = toFlat.toFixed(3);
    lk.wedge.style.setProperty('--sw', (lerp(-1.6, 1.6, inOut(span(t, T.sheen[0] + 0.35, T.sheen[1] + 0.2)))).toFixed(3));

    const fly = tgt ? inOut(span(t, T.fly, T.land)) : 0;
    let ppu = ppuC;
    let px = W / 2 + wedgeLX * ppuC, py = H / 2 - (yB - Yc) * ppuC;
    if (fly > 0) {
      ppu = Math.exp(lerp(Math.log(ppuC), Math.log(tgt.fs), fly));          // scale in log space
      px = lerp(px, tgt.left, fly); py = lerp(py, tgt.bottom + 0.04 * tgt.fs, fly);
    } else if (!tgt) ppu = ppuC * (1 + 0.06 * ease(span(t, T.fly, T.land)));
    lk.el.style.transform = `translate(${(px - lk.ax).toFixed(2)}px, ${(py - lk.ay).toFixed(2)}px) scale(${(ppu / F0).toFixed(5)})`;

    // ---- page + overlay
    const bgOp = 1 - ease(span(t, T.fly, T.fly + 0.38));
    bg.style.opacity = bgOp.toFixed(3);
    canvas.style.opacity = bgOp.toFixed(3);
    canvas.style.visibility = live && bgOp > 0 ? 'visible' : 'hidden';  // no warm-up frame ever shows
    skip.style.opacity = (1 - ease(span(t, T.fly, T.fly + 0.3))).toFixed(3);
    releaseOn = t >= T.land - 0.05;                                  // the hero rises into a clear page
    markOn = t >= T.land;
    // On landing the lockup and the real wordmark swap in the same frame: no crossfade,
    // so no double image (they differ by under a pixel of glyph rounding).
    lk.el.style.opacity = tgt ? (t < T.land ? '1' : '0') :
       (1 - ease(span(t, T.fly + 0.2, T.land + 0.2))).toFixed(3);
  }

  let relDone = null, markDone = null;
  function apply(t) {
    update(t);
    if (releaseOn !== relDone) { relDone = releaseOn; release(releaseOn); }
    if (markOn !== markDone) { markDone = markOn; setMark(markOn); }
  }
  // Once the canvas is fully faded there is nothing left to draw.
  const draw = t => { if (t < T.land) composer.render(); };

  function dispose() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('resize', onResize);
    canvas.removeEventListener('webglcontextlost', onLost);
    disposables.forEach(d => { try { d.dispose(); } catch (err) {} });
    try { key.shadow.dispose(); } catch (err) {}
    try { bloom.dispose(); composer.dispose(); rt.dispose(); } catch (err) {}
    try { envRT.dispose(); pmrem.dispose(); } catch (err) {}
    try { renderer.dispose(); renderer.forceContextLoss(); } catch (err) {}
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    lk.remove();
  }

  function onLost(ev) { ev.preventDefault(); const t = clock; dispose(); onFallback(t); }
  function onResize() { if (!stopped) { layout(); apply(clock); draw(clock); } }

  // Own clock, paused while the tab is hidden.
  let clock = 0, last = 0, hidden = false;
  function onVis() {
    hidden = document.hidden;
    if (!hidden && !stopped && !seekMode) { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  let probeStart = 0, probeFrames = 0;
  function frame(now) {
    if (stopped || hidden) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    clock += dt * CFG.rate;
    if (checkSpeed && clock < 0.6 * CFG.rate) {
      if (!probeStart) probeStart = now; else probeFrames++;
      if (now - probeStart > 500 && probeFrames >= 1 && (now - probeStart) / probeFrames > 50) {
        dispose(); onFallback(0); return;
      }
    }
    if (clock >= CFG.dur) { apply(CFG.dur); dispose(); onDone(); return; }
    apply(clock);
    draw(clock);
    raf = requestAnimationFrame(frame);
  }

  update(0);
  if (opts.cancelled && opts.cancelled()) { dispose(); return { stop() {}, seek() {} }; }
  overlay.insertBefore(canvas, lk.el);
  canvas.addEventListener('webglcontextlost', onLost);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);

  // Compile every shader (and warm the post chain) before the clock starts, with
  // everything visible once, so nothing builds mid-flight.
  try {
    const hiddenOnes = [];
    scene.traverse(o => { if (!o.visible) { hiddenOnes.push(o); o.visible = true; } });
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
    composer.render();
    hiddenOnes.forEach(o => { o.visible = false; });
    update(0);
  } catch (err) {}
  if (stopped || (opts.cancelled && opts.cancelled())) { dispose(); return { stop() {}, seek() {} }; }

  const ctrl = {
    stop: dispose,
    seek(t) { if (stopped) return; live = true; clock = t; apply(t); draw(t); }
  };
  if (seekMode) { ctrl.seek(0); return ctrl; }
  live = true;
  last = performance.now();
  raf = requestAnimationFrame(frame);
  return ctrl;
}
