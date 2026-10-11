/* 3D intro (11 Oct 2026): loaded by intro.js only when the intro is going to play.
   The headline, staged: punch above your size. The wedge from the wordmark appears
   small on the floor of the field. It grows until it towers over a low camera, ember
   on its face, teal along one edge, while a beam of blue climbs the other. Then it
   comes back down to size and settles into the wordmark as the letters rise beside
   it, a glint crosses it, and the page opens through a widening wedge. About 5s.
   Every frame is a pure function of time t, so the test hook can seek to any moment. */
import * as THREE from './vendor/three/three.module.min.js';
import { RoomEnvironment } from './vendor/three/RoomEnvironment.js';

const DUR = 5.0;          // page fully shown
const REVEAL = 3.95;      // the wedge opens onto the page from here
const FOV = 40;
const NAVY = 0x050B18;
const EMBER = 0xFF6A45, TEAL = 0x6BA89E, BEAM = 0x3F82FF, SKY = 0xA8C5FF, INK = '#E9F3FF';
const DEP = 0.3;          // wedge thickness, in wedge heights

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const span = (t, a, b) => clamp((t - a) / (b - a));
const ease = x => x * x * (3 - 2 * x);
const outCubic = x => 1 - Math.pow(1 - x, 3);
const outBack = x => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const inOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a, b, k) => a + (b - a) * k;

/* The wordmark, set the way the site sets it: Outfit 600, -0.03em tracking. */
function wordCanvas() {
  const F = 200, pad = 40;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `600 ${F}px "Outfit", system-ui, sans-serif`;
  ctx.font = font;
  let w;
  if ('letterSpacing' in ctx) { ctx.letterSpacing = `${-0.03 * F}px`; w = ctx.measureText('upwield').width; }
  else w = ctx.measureText('upwield').width - 0.03 * F * 6;
  c.width = Math.ceil(w + pad * 2); c.height = Math.round(F * 1.3);
  const bl = Math.round(F * 0.98);
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${-0.03 * F}px`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  if ('letterSpacing' in ctx) ctx.fillText('upwield', pad, bl);
  else { let x = pad; for (const ch of 'upwield') { ctx.fillText(ch, x, bl); x += ctx.measureText(ch).width - 0.03 * F; } }
  return { canvas: c, F, pad, bl, textW: w };
}

export async function start(opts) {
  const { overlay, test, onDone, onFallback, reveal, release } = opts;
  const seekMode = test === '1';
  const checkSpeed = !test;

  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 700;
  const dprCap = coarse || small ? 1.5 : 2;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'uw-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  let stopped = false, raf = 0;
  const disposables = [];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 80);
  scene.fog = new THREE.Fog(NAVY, 5, 17);

  // A dark room with long softboxes in the site's blue and teal, so the clearcoat on
  // the wedge carries the field's light.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  room.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) o.material.color.setHex(0x0b1324); });
  const stripGeo = new THREE.BoxGeometry(1, 1, 1);
  const mB = new THREE.MeshBasicMaterial({ color: new THREE.Color(SKY).multiplyScalar(8) });
  const mT = new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAL).multiplyScalar(7) });
  const mW = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(6) });
  [[mB, -8, 7, 6, 22, 0.6, -0.25], [mT, 9, 2, 4, 0.6, 14, 0], [mW, 2, 9, 12, 16, 0.5, 0.1], [mB, -11, 0, 2, 0.6, 9, 0]]
    .forEach(([m, x, y, z, sx, sy, rz]) => {
      const b = new THREE.Mesh(stripGeo, m); b.position.set(x, y, z); b.scale.set(sx, sy, 0.2); b.rotation.z = rz; room.add(b);
    });
  const envRT = pmrem.fromScene(room, 0.03);
  room.dispose(); stripGeo.dispose(); mB.dispose(); mT.dispose(); mW.dispose();
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.85;

  // ---- lights
  scene.add(new THREE.HemisphereLight(0x3a5a99, 0x02050c, 0.5));
  const key = new THREE.DirectionalLight(0xfff2ea, 1.5);
  key.position.set(-4.2, 3.4, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -1, near: 0.5, far: 14 });
  key.shadow.radius = 4;
  key.shadow.bias = -0.0008;
  scene.add(key, key.target);
  const rim = new THREE.PointLight(TEAL, 0, 0, 1.4);       // run lean: teal along one edge
  const beamL = new THREE.PointLight(BEAM, 0, 0, 1.4);     // the blue that climbs the other
  const glint = new THREE.PointLight(0xffffff, 0, 0, 1.6);
  scene.add(rim, beamL, glint);

  // ---- the floor of the field: dark, faintly gridded in the site's blue
  const floorGeo = new THREE.PlaneGeometry(60, 60);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a1630, roughness: 0.42, metalness: 0.55, transparent: true });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(40, 80, BEAM, BEAM);
  grid.material.transparent = true; grid.material.opacity = 0; grid.material.depthWrite = false;
  grid.position.y = 0.002;
  scene.add(grid);
  disposables.push(floorGeo, floorMat, grid.geometry, grid.material);

  // ---- the wedge: the wordmark's upward triangle, base on the floor, height 1
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0); shape.lineTo(0.5, 0); shape.lineTo(0, 1); shape.closePath();
  const wedgeGeo = new THREE.ExtrudeGeometry(shape, {
    depth: DEP, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 1
  });
  wedgeGeo.translate(0, 0, -DEP / 2);
  const wedgeMat = new THREE.MeshPhysicalMaterial({
    color: EMBER, roughness: 0.55, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.3,
    emissive: EMBER, emissiveIntensity: 0.07, envMapIntensity: 0.55, transparent: true, fog: false
  });
  const wedge = new THREE.Mesh(wedgeGeo, wedgeMat);
  wedge.castShadow = true;
  scene.add(wedge);
  disposables.push(wedgeGeo, wedgeMat);

  // ---- the wordmark: the real lettering, with a few layers behind it for depth
  const wc = wordCanvas();
  const wtex = new THREE.CanvasTexture(wc.canvas);
  wtex.colorSpace = THREE.SRGBColorSpace;
  wtex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const S = 1 / wc.F;                                   // world units per canvas px at font size 1
  const planeW = wc.canvas.width * S, planeH = wc.canvas.height * S;
  const wordGeo = new THREE.PlaneGeometry(planeW, planeH);
  const word = new THREE.Group();
  const faceMat = new THREE.MeshBasicMaterial({ map: wtex, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, fog: false });
  disposables.push(wtex, wordGeo, faceMat);
  const layers = [];
  for (let i = 4; i >= 1; i--) {
    const m = new THREE.MeshBasicMaterial({ map: wtex, color: new THREE.Color(0x1b2c52).lerp(new THREE.Color(0x0a1428), i / 4),
      transparent: true, opacity: 0, depthWrite: false, fog: false });
    const l = new THREE.Mesh(wordGeo, m); l.position.z = -0.012 * i; word.add(l); layers.push(m); disposables.push(m);
  }
  word.add(new THREE.Mesh(wordGeo, faceMat));
  scene.add(word);

  // ---- lockup geometry, font size 1: text, a 0.12em gap, then the 0.62em wedge
  const textW = wc.textW * S, gap = 0.12, wS = 0.62;
  const L = textW + gap + wS;
  const Yc = 1.15;                                      // where the lockup floats
  const yB = Yc - 0.3;                                  // its baseline
  const wordX = -L / 2 - wc.pad * S + planeW / 2;
  const wordY = yB + (wc.bl * S - planeH / 2);     // canvas baseline lands on yB
  const wedgeEndX = -L / 2 + textW + gap, wedgeEndY = yB + 0.04;

  let Dl = 4;
  function layout() {
    const w = innerWidth || 1280, h = innerHeight || 800;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tv = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const frac = camera.aspect < 0.8 ? 0.8 : camera.aspect < 1.2 ? 0.66 : 0.5;
    Dl = (L / 2) / (frac * tv * camera.aspect);
  }
  layout();

  const look = new THREE.Vector3(), pA = new THREE.Vector3(), lA = new THREE.Vector3();
  const pB = new THREE.Vector3(), lB = new THREE.Vector3(), tmp = new THREE.Vector3();
  let revealK = 0;

  function update(t) {
    t = clamp(t, 0, DUR);
    const portrait = camera.aspect < 0.8;

    // 1. The field fades up; the grid draws outward (0 - 0.7s).
    const fieldIn = ease(span(t, 0, 0.7));
    // 4. The floor falls away while the wedge comes back down to size (2.45 - 3.0s).
    const floorOut = ease(span(t, 2.45, 3.0));
    floorMat.opacity = fieldIn * (1 - floorOut);
    grid.material.opacity = 0.2 * fieldIn * (1 - floorOut);
    floor.visible = grid.visible = floorMat.opacity > 0.003;

    // 2. The wedge appears small on the floor (0.15 - 0.7s).
    const pop = outBack(span(t, 0.15, 0.7));
    // 3. It grows until it towers over the camera (0.7 - 2.45s).
    const grow = inOut(span(t, 0.7, 2.45));
    const s0 = 0.3, s1 = portrait ? 2.6 : 3.2;
    // 4. ...and settles into the wordmark (2.45 - 3.35s).
    const settle = inOut(span(t, 2.45, 3.35));
    const sA = lerp(s0, s1, grow) * pop;
    const s = lerp(sA, wS, settle);
    const bump = 1 + 0.07 * Math.sin(Math.PI * span(t, 3.45, 3.85));   // a small lift as the glint lands
    wedge.scale.set(s * bump, s * bump, s);
    wedge.position.set(lerp(0, wedgeEndX + wS / 2, settle), lerp(0, wedgeEndY, settle), 0);
    wedge.rotation.y = lerp(0.42, 0, inOut(span(t, 0.2, 3.2)));
    wedge.visible = s > 0.001;

    // 5. The page opens through a widening wedge, from the wordmark's wedge.
    const open = span(t, REVEAL, 4.85);
    revealK = open > 0 ? ease(open) : 0;
    const fadeLock = ease(span(t, 4.35, 4.85));
    wedgeMat.opacity = 1 - fadeLock;

    // A blue light climbs the left edge while the wedge rises (1.0 - 2.5s).
    const climb = span(t, 1.0, 2.5);
    const sv = sA;                                     // the beam rides the rising wedge
    const along = ease(climb);
    const ex = lerp(-0.5, 0, along) * sv, ey = along * sv;
    beamL.position.set(ex - 0.35 * sv, ey + 0.1, 0.9 * sv);
    beamL.intensity = (3 + 3 * sv) * Math.sin(Math.PI * climb) + 1.2 * fieldIn * (1 - settle);

    // Teal rides the right edge from the start; it eases off as the wedge settles.
    rim.position.set(0.75 * sA + 0.15, 0.5 * sA, -0.35 * sA - 0.1);
    rim.intensity = (3 + 2.5 * sA) * fieldIn * (1 - 0.7 * settle) * (1 - fadeLock);

    // The glint crosses the settled wordmark (3.35 - 3.95s).
    const g = span(t, 3.3, 3.95);
    glint.position.set(lerp(-L * 0.7, L * 0.7, ease(g)), Yc + 0.4, 1.1);
    glint.intensity = 7 * Math.sin(Math.PI * g);

    // The letters rise beside the wedge as it lands, the way the hero type rises.
    const rise = outCubic(span(t, 2.85, 3.45));
    const wordA = rise * (1 - fadeLock);
    faceMat.opacity = wordA;
    layers.forEach(m => { m.opacity = wordA; });
    const grow2 = 1 + 0.1 * ease(span(t, 4.3, 4.85));
    word.position.set(wordX, wordY - 0.16 * (1 - rise), 0);
    word.scale.setScalar(grow2);
    word.visible = wordA > 0.003;

    // Camera. A: starts above and to the right of the small wedge, drops low and
    // close so the grown wedge towers. B: comes round to face the lockup.
    const cam = inOut(span(t, 0, 2.45));
    // A ends low and back far enough that the tip stands against the sky, base cut by the frame.
    pA.set(lerp(0.85, -0.45, cam), lerp(0.48, 0.06, cam), lerp(2.7, s1 * (portrait ? 1.25 : 1.06), cam));
    lA.set(lerp(0, 0.05, cam), lerp(0.16, s1 * 0.6, cam), 0);
    pB.set(0, Yc, Dl);
    lB.set(0, Yc, 0);
    camera.position.lerpVectors(pA, pB, settle);
    camera.position.z += 0.25 * ease(span(t, 4.2, 4.85));        // drifts back as it opens
    look.lerpVectors(lA, lB, settle);
    camera.lookAt(look);
    camera.rotateZ(0.04 * Math.sin(Math.PI * cam) * (1 - settle));

    key.target.position.set(0, 0.6, 0);
    key.intensity = 1.5 * fieldIn;
    scene.environmentRotation.set(0, -0.5 + 1.0 * inOut(span(t, 0, 4)), 0);
    canvas.style.opacity = (1 - ease(span(t, 4.7, 5.0))).toFixed(3);
  }

  // Where on screen the wordmark's wedge sits, so the page opens from it.
  function wedgeScreen() {
    tmp.set(wedgeEndX + wS / 2, wedgeEndY + wS * 0.42, 0).project(camera);
    return [(tmp.x * 0.5 + 0.5) * innerWidth, (-tmp.y * 0.5 + 0.5) * innerHeight];
  }

  let released = false;
  function apply(t) {
    update(t);
    if (revealK > 0) {
      if (!released) { released = true; release(); }
      const [x, y] = wedgeScreen();
      reveal(revealK, x, y);
    } else reveal(0);
  }

  function dispose() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('resize', onResize);
    canvas.removeEventListener('webglcontextlost', onLost);
    disposables.forEach(d => { try { d.dispose(); } catch (err) {} });
    try { key.shadow.dispose(); } catch (err) {}
    try { envRT.dispose(); pmrem.dispose(); } catch (err) {}
    try { renderer.dispose(); renderer.forceContextLoss(); } catch (err) {}
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  function onLost(ev) { ev.preventDefault(); const at = clock; dispose(); onFallback(at); }
  function onResize() { if (!stopped) { layout(); apply(clock); renderer.render(scene, camera); } }

  // Own clock, paused while the tab is hidden.
  let clock = 0, last = 0, hidden = false;
  function onVis() {
    hidden = document.hidden;
    if (!hidden && !stopped && !seekMode) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  let probeStart = 0, probeFrames = 0;
  function frame(now) {
    if (stopped || hidden) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    clock += dt;
    if (checkSpeed && clock < 0.6) {
      if (!probeStart) probeStart = now; else probeFrames++;
      if (now - probeStart > 500 && probeFrames >= 1 && (now - probeStart) / probeFrames > 50) {
        dispose(); onFallback(0); return;
      }
    }
    if (clock >= DUR) { apply(DUR); dispose(); onDone(); return; }
    apply(clock);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  update(0);
  if (opts.cancelled && opts.cancelled()) { dispose(); return { stop() {}, seek() {} }; }
  overlay.insertBefore(canvas, overlay.firstChild);
  canvas.addEventListener('webglcontextlost', onLost);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);

  // Compile every shader before the clock starts so the first second does not stutter.
  try {
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (err) {}
  if (stopped) return { stop: dispose, seek() {} };

  const ctrl = {
    stop: dispose,
    seek(t) { if (stopped) return; clock = t; apply(t); renderer.render(scene, camera); }
  };
  if (seekMode) { ctrl.seek(0); return ctrl; }
  last = performance.now();
  raf = requestAnimationFrame(frame);
  return ctrl;
}
