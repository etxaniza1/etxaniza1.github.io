import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ===================== CONSTANTES (metros, coords "Blender": x derecha, y hacia la portería rival) =====================
const P = new URLSearchParams(location.search);
const ESCALA = parseFloat(P.get('escala') || '1.3');      // escala de personajes (1 = 2,00 m; 1.3 se lee mejor en móvil)
const DURACION = parseFloat(P.get('tiempo') || '120');   // segundos de partido
// Por defecto: apaisado 16:9, campo en vertical, cámara G. ?vertical=1 recupera el modo retrato antiguo.
const VERTICAL = (P.has('vertical') && P.get('vertical') !== '0')
  || (P.get('horizontal') === '0');
const HORIZONTAL = !VERTICAL;
const CAM_MODE = (P.get('camara') || (HORIZONTAL ? 'G' : 'A')).toUpperCase();
if (HORIZONTAL) document.body.classList.add('horizontal');
const HW = 15, HL = 24;                    // medio ancho / medio largo entre líneas (campo 30×48 m)
const WX = 17.2, WY = 27.3;                // cara interior de las vallas (RUN_X 2.2 / RUN_Y 3.3)
const GW = 5.0, POST_X = 5.28, POST_R = 0.28, GH = 4.0, GD = 2.5, BACK_H = 2.2;
const BR = 0.35;                           // radio del balón (un pelín mayor que el 0,30 del glb para que se lea en móvil)
const GRAV = 22;
const PR = 0.6 * ESCALA;                   // radio de colisión del jugador
const SPEED_USER = 7.6, SPEED_AI = 6.3, SPEED_GK = 5.6;
const DRIBBLE_T = 0.32, DRIBBLE_CD = 1.5, DRIBBLE_SPEED = 13.5;
const DASH_T = 0.26, DASH_CD_USER = 1.1, DASH_CD_AI = 2.0, DASH_SPEED = 16, DASH_MISS_STUN = 0.42;
const TURBO_MULT = 1.38, TURBO_DRAIN = 1 / 2.5, TURBO_REGEN = 1 / 4.2, TURBO_MIN = 0.1;
const g2t = (x, y, z = 0) => new THREE.Vector3(x, z, -y);   // juego -> three (Y-up)
// personajes jugables (glb con rig + animaciones) y parámetros de animación (anim_meta.json, exportado desde Blender)
const CHARS = [
  { key: 'conazo', name: 'CONAZO', file: 'assets/conazo_anim.glb', color: '#F2751A', card: 'assets/cards/conazo.png' },
  { key: 'calcetrol', name: 'CALCETROL', file: 'assets/calcetrol_anim.glb', color: '#E5343A', card: 'assets/cards/calcetrol.png' },
  { key: 'buton', name: 'BUTÓN', file: 'assets/buton_anim.glb', color: '#F8B715', card: 'assets/cards/buton.png' },
];
const GLB = {};          // key -> gltf
let META = {};           // key -> metadatos de animación
const KICK_RATE = 1.45, TACKLE_RATE = 1.5, DIVE_RATE = 1.35, RUN_MIN = 1.7;
const DRIBBLE_PUSH = 0.55;   // cuánto se adelanta el balón tras cada toque (m)

// ===================== RENDER =====================
const app = document.getElementById('app');
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, HORIZONTAL ? 2 : 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a8d8f5');
const camera = new THREE.PerspectiveCamera(40, 9 / 16, 1, 500);
// GameCamera (Blender Z-up): loc (0,-58.10,46.33), rot X 52° -> 38° bajo la horizontal
camera.position.copy(g2t(0, -58.101, 46.329));
camera.rotation.set(THREE.MathUtils.degToRad(-38), 0, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a7a, 1.25));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(-0.384, 0.743, 0.548).multiplyScalar(50);   // dirección del Sol de Blender (42°,0,-35°)
scene.add(sun);

// Cámaras en pantalla apaisada 16:9 (?horizontal=1&camara=A…G2).
// A/B/C: campo de LADO (porterías izq/der). D/E/F/G: campo VERTICAL tipo Balón Brawl
// (portería rival ARRIBA), scroll en Y. F=60° cenital; G=45° más perspectiva, desde detrás
// de tu portería, con horizonte / gradas de fondo arriba.
// D,H,look en metros, coords Blender (x derecha, y hacia la portería rival, z arriba).
const CAMS = {
  A: { layout: 'side',  D: 32.0, H: 25.0, pitch: 38, fov: 40, xLook: 0.0, follow: false, viewHalfY: 26.5 },
  B: { layout: 'side',  D: 21.0, H: 15.2, pitch: 40, fov: 40, xLook: 5.0, follow: true,  viewHalfY: 14.0 },
  C: { layout: 'side',  D: 22.5, H:  9.0, pitch: 28, fov: 34, xLook: 5.5, follow: true,  viewHalfY: 10.8 },
  D: { layout: 'brawl', D: 38.8, H: 61.1, pitch: 60, fov: 40, yLook: -3.5, follow: false, viewLen: 62.0 },
  E: { layout: 'brawl', D: 10.08, H: 22.65, pitch: 60, fov: 40, lookOff: 3.00, follow: true, viewLen: 23.0, behind: 6.09, ahead: 16.91 },
  F: { layout: 'brawl', D: 13.16, H: 29.55, pitch: 60, fov: 40, lookOff: 3.91, follow: true, viewLen: 30.0, behind: 7.94, ahead: 22.06 },
  // G: base F pero 45° bajo la horizontal, cámara detrás del jugador (y de tu portería al defender),
  //    se ve el estadio de fondo y el cielo arriba. Sigue en Y, personajes legibles.
  G:  { layout: 'brawl', D: 21.6, H: 25.0, pitch: 45, fov: 50, lookOff: 3.4, follow: true, viewLen: 27.5, behind: 12.5, ahead: 18.5, aheadPlay: 7.5, showBoard: false },
  // G2: 40°, un poco más alejada, aún más horizonte. El videomarcador 3D se oculta (choca con el HUD y muestra 0-0 fijo).
  G2: { layout: 'brawl', D: 27.09, H: 26.75, pitch: 40, fov: 50, lookOff: 4.79, follow: true, viewLen: 32.0, behind: 14.62, ahead: 22.0, aheadPlay: 8, showBoard: false },
};
let camMode = CAMS[CAM_MODE] ? CAM_MODE : 'A';
let camFollowY = 0;
let campoRoot = null, camApron = null, camClipPlane = null;
function camCfg() { return CAMS[camMode]; }
function applyCamClip(side) {
  if (!campoRoot || !camClipPlane) return;
  campoRoot.traverse((o) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((m) => { m.clippingPlanes = side ? [camClipPlane] : []; });
  });
  if (camApron) camApron.visible = !!side;
  // Videomarcador 3D: oculto en D/E/F (se recorta y choca con el HUD). G/G2 pueden remostrarlo.
  const hideBoard = HORIZONTAL && !side && !camCfg().showBoard;
  campoRoot.traverse((o) => {
    if (/^(Marcador|Texto_Marcador)/.test(o.name)) o.visible = !hideBoard;
  });
}
function updateSideCam(cfg, snap) {
  if (cfg.follow && ball && (S.mode === 'play' || S.mode === 'kickoff' || S.mode === 'goal' || S.mode === 'end')) {
    const half = cfg.viewHalfY;
    const target = THREE.MathUtils.clamp(ball.pos.y, -HL + half * 0.65, HL - half * 0.65);
    camFollowY = snap ? target : camFollowY + (target - camFollowY) * 0.14;
  } else if (!cfg.follow) {
    camFollowY = 0;
  }
  camera.position.copy(g2t(cfg.D, camFollowY, cfg.H));
  camera.up.set(0, 1, 0);
  camera.lookAt(g2t(cfg.xLook, camFollowY, 0));
}
function updateBrawlCam(cfg, snap) {
  if (cfg.follow && user && (S.mode === 'play' || S.mode === 'kickoff' || S.mode === 'goal' || S.mode === 'end')) {
    const behind = cfg.behind || 8;
    const lo = -HL + behind * 0.35;                 // la cámara puede quedar detrás de tu portería
    const hi =  HL - (cfg.aheadPlay != null ? cfg.aheadPlay : (cfg.ahead || 16) * 0.28);
    const target = THREE.MathUtils.clamp(user.pos.y, lo, hi);
    camFollowY = snap ? target : camFollowY + (target - camFollowY) * 0.16;
    camera.position.copy(g2t(0, camFollowY - cfg.D, cfg.H));
    camera.up.set(0, 1, 0);
    camera.lookAt(g2t(0, camFollowY + cfg.lookOff, 0));
  } else {
    camFollowY = 0;
    camera.position.copy(g2t(0, -cfg.D, cfg.H));
    camera.up.set(0, 1, 0);
    camera.lookAt(g2t(0, cfg.yLook || 0, 0));
  }
}
function updateHorizCam(snap) {
  if (!HORIZONTAL) return;
  const cfg = camCfg();
  if (cfg.layout === 'brawl') updateBrawlCam(cfg, snap);
  else updateSideCam(cfg, snap);
  camera.fov = cfg.fov;
  camera.updateProjectionMatrix();
  applyCamClip(cfg.layout === 'side');
}
function setCamMode(m, snap) {
  if (!CAMS[m]) return;
  camMode = m;
  camFollowY = cfgFollowYStart();
  if (HORIZONTAL) {
    camera.clearViewOffset();
    updateHorizCam(true);
  }
}
function cfgFollowYStart() {
  const cfg = camCfg();
  if (cfg.layout === 'brawl' && cfg.follow && user) {
    const behind = cfg.behind || 8;
    const lo = -HL + behind * 0.35;
    const hi = HL - (cfg.aheadPlay != null ? cfg.aheadPlay : (cfg.ahead || 16) * 0.28);
    return THREE.MathUtils.clamp(user.pos.y, lo, hi);
  }
  if (cfg.follow && ball) return THREE.MathUtils.clamp(ball.pos.y, -HL + (cfg.viewHalfY || 14) * 0.65, HL - (cfg.viewHalfY || 14) * 0.65);
  return 0;
}

function fitVisualViewport() {
  const vv = window.visualViewport;
  const w = Math.max(1, Math.round((vv && vv.width) || window.innerWidth));
  const h = Math.max(1, Math.round((vv && vv.height) || window.innerHeight));
  const ox = (vv && vv.offsetLeft) || 0;
  const oy = (vv && vv.offsetTop) || 0;
  if (HORIZONTAL) {
    app.style.position = 'fixed';
    app.style.width = w + 'px';
    app.style.height = h + 'px';
    app.style.left = ox + 'px';
    app.style.top = oy + 'px';
    app.style.right = 'auto';
    app.style.bottom = 'auto';
    app.style.margin = '0';
  } else {
    app.style.position = app.style.width = app.style.height = '';
    app.style.left = app.style.top = app.style.right = app.style.bottom = app.style.margin = '';
  }
  document.documentElement.style.setProperty('--vvw', w + 'px');
  document.documentElement.style.setProperty('--vvh', h + 'px');
}
function layout() {
  fitVisualViewport();
  const W = app.clientWidth, H = app.clientHeight;
  renderer.setSize(W, H, false);
  camera.clearViewOffset();
  camera.aspect = W / H;
  if (HORIZONTAL) {
    updateHorizCam(true);
  } else {
    const Hf = W * 16 / 9;                       // marco de referencia 9:16 (como el preview)
    const t = Math.tan(THREE.MathUtils.degToRad(20));
    if (H > Hf + 1) {
      // móvil más alargado que 9:16: mismo encuadre arriba y franja extra abajo para los controles
      const fullH = Hf + 2 * (H - Hf);
      camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(t * fullH / Hf));
      camera.aspect = W / fullH;
      camera.setViewOffset(W, fullH, 0, H - Hf, W, H);
    } else {
      camera.aspect = W / H;
      // si la pantalla es más ancha que 9:16 mantenemos el FOV vertical de 40°
      camera.fov = 40;
    }
    camera.updateProjectionMatrix();
  }
  placeJoyBase();
}
function onViewportChange() {
  layout();
  if (typeof layoutMenu === 'function') layoutMenu();
  if (typeof updateOrient === 'function') updateOrient();
}
window.addEventListener('resize', onViewportChange);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', onViewportChange);
  window.visualViewport.addEventListener('scroll', onViewportChange);
}

// ===================== CARGA =====================
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));
function matte(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = true;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => { if (m.roughness !== undefined) { m.roughness = 1; m.metalness = 0; } });
    }
  });
  return root;
}

// ===================== AUDIO (muy simple) =====================
let actx = null;
function beep(freq, dur, type = 'square', vol = 0.08, slide = 0) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
  o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
}
const sfx = {
  kick: (p) => beep(140 + 80 * p, 0.12, 'triangle', 0.25, -90),
  whistle: () => { beep(2100, 0.18, 'sine', 0.06); setTimeout(() => beep(2100, 0.35, 'sine', 0.06), 220); },
  goal: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'square', 0.05), i * 110)); },
  steal: () => beep(320, 0.08, 'square', 0.05, 200),
  save: () => beep(200, 0.15, 'sawtooth', 0.05, -100),
  dribble: () => beep(480, 0.1, 'triangle', 0.07, 220),
  dash: () => beep(180, 0.1, 'sawtooth', 0.06, -80),
  miss: () => beep(110, 0.16, 'square', 0.05, -40),
};

// ===================== ENTIDADES =====================
function blob(r, op = 0.32) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: op, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; return m;
}
function ring(color, r) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2; return m;
}

class Actor {
  constructor(charKey, team, keeper, ringColor) {
    this.team = team;            // 0 = azul (usuario, ataca hacia +y), 1 = rojo (ataca hacia -y)
    this.keeper = keeper;
    this.charKey = charKey;
    this.meta = META[charKey];
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    const model = matte(SkeletonUtils.clone(GLB[charKey].scene));
    model.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
    model.scale.setScalar(ESCALA);
    this.model = model;
    this.body.add(model);
    this.root.add(this.body);
    this.shadow = blob(0.75 * ESCALA, 0.3); this.shadow.position.y = 0.02; this.root.add(this.shadow);
    this.ring = ring(ringColor, keeper ? 0.85 * ESCALA : 1.0 * ESCALA); this.ring.position.y = 0.03; this.root.add(this.ring);
    scene.add(this.root);
    // animación
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of GLB[charKey].animations) {
      const a = this.mixer.clipAction(clip);
      if (!/^(Idle|Walk|Run|Dribble|GK_Idle|Celebrate)$/.test(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[clip.name] = a;
    }
    this.cur = null; this.play(keeper ? 'GK_Idle' : 'Idle', 0);
    this.pos = new THREE.Vector2(); this.vel = new THREE.Vector2();
    this.face = new THREE.Vector2(0, team === 0 ? 1 : -1);
    this.yaw = 0; this.kickT = 0; this.dashT = 0; this.dashCd = 0; this.stun = 0;
    this.dribbleT = 0; this.dribbleCd = 0; this.dashHit = false; this.dashEnded = false;
    this.energy = 1; this.sprinting = false;
    this.kickPending = null; this.kickAnimT = 0; this.tackleT = 0; this.diveT = 0; this.diveClip = null; this.celebrate = false;
  }
  dispose() { this.mixer.stopAllAction(); scene.remove(this.root); }
  place(x, y) {
    this.pos.set(x, y); this.vel.set(0, 0); this.face.set(0, this.team === 0 ? 1 : -1);
    this.yaw = Math.atan2(this.face.x, -this.face.y);
    this.dashT = 0; this.stun = 0; this.kickT = 0; this.dribbleT = 0; this.dashCd = 0; this.dribbleCd = 0;
    this.dashHit = false; this.dashEnded = false; this.sprinting = false;
    this.kickPending = null; this.kickAnimT = 0; this.tackleT = 0; this.diveT = 0; this.celebrate = false;
  }
  // fase (0-1) del clip actual; los ciclos de marcha empiezan con el pie izquierdo apoyando, así se pueden encadenar
  phase(name) { const a = this.actions[name]; return a ? (a.time / a.getClip().duration) % 1 : 0; }
  play(name, fade = 0.15, restart = false) {
    const next = this.actions[name]; if (!next) return;
    if (this.cur === name && !restart) return;
    const prev = this.cur ? this.actions[this.cur] : null;
    const gait = /^(Walk|Run|Dribble)$/;
    const ph = prev && gait.test(this.cur) && gait.test(name) ? this.phase(this.cur) : 0;
    next.reset(); next.setEffectiveTimeScale(1); next.setEffectiveWeight(1);
    next.time = ph * next.getClip().duration;
    if (prev && prev !== next && fade > 0) { next.fadeIn(fade); prev.fadeOut(fade); }
    else if (prev && prev !== next) prev.stop();
    next.play();
    this.cur = name;
  }
  chooseAnim() {
    const sp = this.vel.length(), E = ESCALA, M = this.meta;
    let want, ts = 1;
    if (this.celebrate) want = 'Celebrate';
    else if (this.keeper && this.diveT > 0) { want = this.diveClip; ts = DIVE_RATE; }
    else if (this.tackleT > 0) { want = 'Tackle'; ts = TACKLE_RATE; }
    else if (this.kickAnimT > 0) { want = 'Kick'; ts = KICK_RATE; }
    else if (this.stun > 0) want = this.keeper ? 'GK_Idle' : 'Idle';
    else if (this.dribbleT > 0) { want = 'Dribble'; ts = sp / (M.Dribble.speed * E); }
    else if (ball.owner === this && !this.keeper && sp > 0.4) { want = 'Dribble'; ts = sp / (M.Dribble.speed * E); }
    else if (this.keeper && sp > 0.35) {
      // portero: si se mueve de lado (mirando al balón) hace pasitos de espera; si va de frente, corre
      const along = Math.abs(this.vel.x * this.face.x + this.vel.y * this.face.y) / sp;
      if (along > 0.6 && sp > RUN_MIN) { want = 'Run'; ts = sp / (M.Run.speed * E); }
      else { want = 'GK_Idle'; ts = 1 + Math.min(1.2, sp / 3); }
    }
    else if (sp > RUN_MIN) { want = 'Run'; ts = sp / (M.Run.speed * E); }
    else if (sp > 0.35) { want = 'Walk'; ts = sp / (M.Walk.speed * E); }
    else want = this.keeper ? 'GK_Idle' : 'Idle';
    const fade = want === 'Kick' || want === 'Tackle' || (want && want.startsWith('GK_Dive')) ? 0.06 : 0.16;
    this.play(want, fade);
    const a = this.actions[want];
    if (a) a.setEffectiveTimeScale(THREE.MathUtils.clamp(ts, 0.3, 3.2));
  }
  sync(dt, t) {
    const targetYaw = Math.atan2(this.face.x, -this.face.y);   // los modelos miran a +Z de three (hacia la cámara) por defecto
    let d = targetYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 14);
    this.root.position.copy(g2t(this.pos.x, this.pos.y));
    this.root.rotation.y = this.yaw;
    this.kickAnimT = Math.max(0, this.kickAnimT - dt);
    this.tackleT = Math.max(0, this.tackleT - dt);
    this.chooseAnim();
    this.mixer.update(dt);
    // aturdido: tambaleo (encima de la animación)
    const stunWob = this.stun > 0 && this.tackleT <= 0 ? Math.sin(t * 40) * 0.12 : 0;
    this.body.rotation.set(0, 0, stunWob);
  }
}

// balón
function makeBall() {
  const geo = new THREE.IcosahedronGeometry(BR, 2);
  const phi = (1 + Math.sqrt(5)) / 2;
  const dirs = [[0,1,phi],[0,-1,phi],[0,1,-phi],[0,-1,-phi],[1,phi,0],[-1,phi,0],[1,-phi,0],[-1,-phi,0],[phi,0,1],[-phi,0,1],[phi,0,-1],[-phi,0,-1]].map((v) => new THREE.Vector3(...v).normalize());
  const pos = geo.attributes.position; const cols = [];
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(pos, i + k));
    c.normalize();
    const dark = Math.max(...dirs.map((d) => c.dot(d))) > 0.95;
    for (let k = 0; k < 3; k++) cols.push(...(dark ? [0.05, 0.05, 0.06] : [1, 1, 1]));
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: false }));
}

const ball = { pos: new THREE.Vector3(0, 0, BR), vel: new THREE.Vector3(), owner: null, noCatch: null, noCatchT: 0, lastTouch: null };
let ballMesh, ballShadow, aimArrow, ballGhost;

// ===================== ESTADO =====================
let user, rival, gkA, gkB, actors = [];
const S = { mode: 'menu', score: [0, 0], time: DURACION, pauseT: 0, kickoffTeam: 0, t: 0, goals: 0, saves: 0, shots: 0 };
const LOGS = []; const NAME = (a) => a === user ? 'usuario' : a === rival ? 'rival' : a === gkA ? 'portero_azul' : 'portero_rojo';
function LOG(ev, a, extra) { LOGS.push({ t: +S.t.toFixed(2), ev, who: a ? NAME(a) : null, ...extra }); if (LOGS.length > 300) LOGS.shift(); }
window.__game = {
  LOGS,
  get input() { return input; },
  pressShoot: () => pressShoot(),
  releaseShoot: () => releaseShoot(),
  pressRegate: () => tryDribble(user),
  pressEntrada: () => tryDash(user),
  setTurbo: (on) => { input.turboDown = !!on; },
  S, ball, camera, scene, renderer, ESCALA,
  get actors() { return actors; },
  get user() { return user; },
  get rival() { return rival; },
};

// ===================== INPUT =====================
const input = { jx: 0, jy: 0, shootDown: false, turboDown: false, charge: 0, keys: {} };
const joyZona = document.getElementById('joyZona'), joyBase = document.getElementById('joyBase'), joyPunta = document.getElementById('joyPunta');
const acciones = document.getElementById('acciones');
const btnChutar = document.getElementById('btnChutar'), btnRegate = document.getElementById('btnRegate');
const btnEntrada = document.getElementById('btnEntrada'), btnTurbo = document.getElementById('btnTurbo');
const cargaAro = document.getElementById('carga'), cargaRegate = document.getElementById('cargaRegate');
const cargaEntrada = document.getElementById('cargaEntrada'), cargaTurbo = document.getElementById('cargaTurbo');
let joyId = null, joyCx = 0, joyCy = 0, joyHome = { x: 84, y: 0 };
function cssEnvPx(expr) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;width:${expr};height:0;`;
  document.body.appendChild(el);
  const v = el.getBoundingClientRect().width;
  el.remove();
  return Number.isFinite(v) ? v : 0;
}
function placeJoyBase() {
  const zr = joyZona.getBoundingClientRect();
  if (!zr.width || !zr.height) return;
  if (HORIZONTAL) {
    const short = Math.min(app.clientWidth, app.clientHeight);
    const joyS = Math.max(64, Math.min(112, short * 0.20));
    const pad = Math.max(10, short * 0.018);
    const sl = cssEnvPx('env(safe-area-inset-left, 0px)');
    const sb = cssEnvPx('env(safe-area-inset-bottom, 0px)');
    joyHome = { x: sl + pad + joyS / 2, y: zr.height - (sb + pad + joyS / 2) };
  } else {
    joyHome = { x: 92, y: zr.height - 104 };
  }
  if (joyId === null) setJoy(joyHome.x, joyHome.y);
}
function setJoyDir(jx, jy) {
  input.jx = jx; input.jy = jy;
  const short = Math.min(app.clientWidth || 390, app.clientHeight || 390);
  const M = HORIZONTAL ? Math.max(28, Math.min(48, short * 0.08)) : 52;
  joyPunta.style.transform = `translate(${jx * M}px,${-jy * M}px)`;
}
function setJoy(x, y) { joyBase.style.left = x + 'px'; joyBase.style.top = y + 'px'; joyCx = x; joyCy = y; }

// Evitar zoom, scroll y gestos del navegador (multitáctil de juego sí está permitido)
const swallow = (e) => { e.preventDefault(); };
document.addEventListener('touchmove', swallow, { passive: false });
document.addEventListener('gesturestart', swallow);
document.addEventListener('gesturechange', swallow);
document.addEventListener('gestureend', swallow);
document.addEventListener('dblclick', swallow);
document.addEventListener('contextmenu', swallow);

function bindHold(el, onDown, onUp) {
  const downIds = new Set();
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerId === joyId) return;
    downIds.add(e.pointerId);
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    onDown(e);
    e.preventDefault();
    e.stopPropagation();
  });
  const end = (e) => {
    if (!downIds.has(e.pointerId)) return;
    downIds.delete(e.pointerId);
    if (downIds.size === 0) onUp(e);
    e.preventDefault();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

joyZona.addEventListener('pointerdown', (e) => {
  if (joyId !== null) return;
  if (e.target.closest && e.target.closest('.btnAccion')) return;
  joyId = e.pointerId;
  try { joyZona.setPointerCapture(e.pointerId); } catch (_) {}
  const r = joyZona.getBoundingClientRect(); setJoy(e.clientX - r.left, e.clientY - r.top);
  e.preventDefault();
});
joyZona.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joyId) return;
  const r = joyZona.getBoundingClientRect();
  let dx = e.clientX - r.left - joyCx, dy = e.clientY - r.top - joyCy;
  const L = Math.hypot(dx, dy), M = 52;
  if (L > M) { dx *= M / L; dy *= M / L; }
  joyPunta.style.transform = `translate(${dx}px,${dy}px)`;
  const n = Math.min(1, L / M);
  input.jx = L > 6 ? dx / M : 0; input.jy = L > 6 ? -dy / M : 0;
  if (n < 0.12) { input.jx = 0; input.jy = 0; }
});
const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; input.jx = input.jy = 0; joyPunta.style.transform = ''; setJoy(joyHome.x, joyHome.y); };
joyZona.addEventListener('pointerup', joyEnd); joyZona.addEventListener('pointercancel', joyEnd);

bindHold(btnChutar, () => pressShoot(), () => releaseShoot());
bindHold(btnRegate, () => { btnRegate.classList.add('pulsado'); tryDribble(user); }, () => btnRegate.classList.remove('pulsado'));
bindHold(btnEntrada, () => { btnEntrada.classList.add('pulsado'); tryDash(user); }, () => btnEntrada.classList.remove('pulsado'));
bindHold(btnTurbo, () => { input.turboDown = true; }, () => { input.turboDown = false; });

const keyMap = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
window.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) { input.keys[keyMap[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'Enter') { if (!e.repeat) { if (S.mode === 'menu') menuPlay(); else if (S.mode === 'end') startGame(); else if (e.code === 'Space') pressShoot(); } e.preventDefault(); }
  if (S.mode === 'menu' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !e.repeat) menuStep(e.code === 'ArrowLeft' ? -1 : 1);
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { input.turboDown = true; e.preventDefault(); }
  if (e.code === 'KeyE' && !e.repeat) {
    if (S.mode === 'play') { if (ball.owner === user) tryDribble(user); else tryDash(user); }
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code]) input.keys[keyMap[e.code]] = false;
  if (e.code === 'Space') releaseShoot();
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.turboDown = false;
});
window.addEventListener('blur', () => { input.keys = {}; input.jx = input.jy = 0; input.turboDown = false; releaseShoot(true); });

function pressShoot() {
  if (S.mode !== 'play' || input.shootDown) return;
  if (ball.owner !== user) return;
  btnChutar.classList.add('pulsado');
  input.shootDown = true; input.charge = 0;
}
function releaseShoot(cancel) {
  btnChutar.classList.remove('pulsado');
  if (!input.shootDown) return;
  input.shootDown = false;
  if (!cancel && ball.owner === user && S.mode === 'play') shoot(user, user.face.clone(), 0.15 + 0.85 * input.charge, true);
  input.charge = 0;
}

// ===================== MECÁNICAS =====================
function tryDash(a) {
  if (!a || a.dashCd > 0 || a.stun > 0 || a.dribbleT > 0 || a.dashT > 0) return false;
  if (ball.owner === a) return false;
  a.dashT = DASH_T; a.dashCd = a === user ? DASH_CD_USER : DASH_CD_AI;
  a.dashHit = false; a.dashEnded = false;
  a.tackleT = a.meta.Tackle.frames / 30 / TACKLE_RATE; a.play('Tackle', 0.05, true);
  sfx.dash(); LOG('entrada', a, {});
  return true;
}
function tryDribble(a) {
  if (!a || ball.owner !== a || a.keeper) return false;
  if (a.dribbleCd > 0 || a.stun > 0 || a.dribbleT > 0 || a.dashT > 0) return false;
  const dir = new THREE.Vector2();
  if (a === user && (Math.abs(input.jx) > 0.15 || Math.abs(input.jy) > 0.15)) dir.set(input.jx, input.jy);
  else {
    const side = new THREE.Vector2(-a.face.y, a.face.x);
    const opp = a === user ? rival : user;
    if (opp) {
      const toOpp = opp.pos.clone().sub(a.pos);
      if (side.dot(toOpp) > 0) side.multiplyScalar(-1);
    }
    dir.copy(side);
  }
  if (dir.lengthSq() < 0.01) dir.set(-a.face.y, a.face.x);
  dir.normalize();
  a.face.copy(dir);
  a.dribbleT = DRIBBLE_T; a.dribbleCd = DRIBBLE_CD;
  if (a === user) { input.shootDown = false; input.charge = 0; btnChutar.classList.remove('pulsado'); }
  sfx.dribble(); LOG('regate', a, { dir: [+dir.x.toFixed(2), +dir.y.toFixed(2)] });
  return true;
}
function updateEnergy(a, want, moving, dt) {
  const can = want && moving && a.stun <= 0 && a.dashT <= 0 && a.dribbleT <= 0 && (a.sprinting ? a.energy > 0 : a.energy > TURBO_MIN);
  if (can) {
    a.sprinting = true;
    a.energy = Math.max(0, a.energy - TURBO_DRAIN * dt);
    if (a.energy <= 0) a.sprinting = false;
  } else {
    a.sprinting = false;
    a.energy = Math.min(1, a.energy + TURBO_REGEN * dt);
  }
}
function goalCenter(team) { return new THREE.Vector2(0, team === 0 ? HL : -HL); }  // portería que ataca el equipo
// el chut empieza la animación y el balón sale en el frame de impacto (marcado en Blender)
function kickLocal(a) {   // posición del balón en el impacto (m, relativo al jugador: adelante / derecha)
  const t = a.meta.Kick.toe_at_impact;   // coords de Blender: x (izq +), y (adelante -)
  return { fwd: -t[1] * ESCALA + BR * 0.85, right: -t[0] * ESCALA };
}
function shoot(a, dir, power, assist, loft) {
  if (a.kickPending) return;
  dir = dir.clone(); if (dir.lengthSq() < 0.01) dir.set(0, a.team === 0 ? 1 : -1);
  dir.normalize();
  a.face.copy(dir);
  const impact = a.meta.Kick.impact / 30 / KICK_RATE;
  a.kickPending = { dir, power, assist, loft, t: impact };
  a.kickAnimT = a.meta.Kick.frames / 30 / KICK_RATE * 0.8;
  a.play('Kick', 0.06, true);
}
function updateKick(a, dt) {
  const k = a.kickPending; if (!k) return;
  a.vel.multiplyScalar(Math.exp(-9 * dt));
  if (ball.owner !== a) { a.kickPending = null; return; }
  k.t -= dt;
  if (k.t <= 0) { a.kickPending = null; releaseShot(a, k.dir, k.power, k.assist, k.loft); }
}
function releaseShot(a, dir, power, assist, loft) {
  dir = dir.clone().normalize();
  if (dir.lengthSq() < 0.01) dir.set(0, a.team === 0 ? 1 : -1);
  if (assist) {
    // ayuda a apuntar: si el tiro va hacia la portería rival, se corrige para que entre entre los postes
    const gy = goalCenter(a.team).y;
    if (dir.y * Math.sign(gy) > 0.3) {
      const t = (gy - a.pos.y) / dir.y; const xh = a.pos.x + dir.x * t;
      if (Math.abs(xh) < 10) { dir.set(THREE.MathUtils.clamp(xh, -GW + 0.8, GW - 0.8) - a.pos.x, gy - a.pos.y).normalize(); }
    }
  }
  const sp = 13 + 19 * power;
  ball.owner = null; ball.noCatch = a; ball.noCatchT = 0.35; ball.lastTouch = a;
  if (Math.hypot(ball.pos.x - a.pos.x, ball.pos.y - a.pos.y) < PR + BR * 0.5) ball.pos.set(a.pos.x + dir.x * (PR + BR + 0.15), a.pos.y + dir.y * (PR + BR + 0.15), BR + 0.05);
  ball.pos.z = Math.max(ball.pos.z, BR + 0.05);
  ball.vel.set(dir.x * sp, dir.y * sp, loft !== undefined ? loft : 1.5 + 5.5 * power * power);
  a.kickT = 0.35; a.face.copy(dir);
  S.shots++; sfx.kick(power); LOG('tiro', a, { pos: [+a.pos.x.toFixed(1), +a.pos.y.toFixed(1)], vel: [+ball.vel.x.toFixed(1), +ball.vel.y.toFixed(1), +ball.vel.z.toFixed(1)] });
}
function giveBall(a) {
  LOG('posesion', a, { from: ball.owner ? NAME(ball.owner) : null, b: [+ball.pos.x.toFixed(1), +ball.pos.y.toFixed(1), +ball.pos.z.toFixed(1)] });
  if (ball.owner && ball.owner !== a) { const v = ball.owner; v.stun = 0.55; v.kickPending = null; const k = v.pos.clone().sub(a.pos).normalize().multiplyScalar(6); v.vel.copy(k); }
  ball.owner = a; ball.lastTouch = a; ball.vel.set(0, 0, 0); ball.ownT = 0;
}

function moveActor(a, wish, speed, dt) {
  if (a.diveT > 0) {
    a.diveT -= dt; const el = a.diveDur - a.diveT;
    if (el < 0.38) a.vel.copy(a.diveDir).multiplyScalar(7.5 * (1 - el / 0.5)); else a.vel.multiplyScalar(Math.exp(-8 * dt));
  } else if (a.stun > 0) { a.stun -= dt; a.vel.multiplyScalar(Math.exp(-6 * dt)); }
  else if (a.dribbleT > 0) { a.dribbleT -= dt; a.vel.copy(a.face).multiplyScalar(DRIBBLE_SPEED); }
  else if (a.dashT > 0) {
    a.dashT -= dt; a.vel.copy(a.face).multiplyScalar(DASH_SPEED);
    if (a.dashT <= 0) a.dashEnded = true;
  } else {
    const target = wish.clone().multiplyScalar(speed);
    const acc = 1 - Math.exp(-14 * dt);
    a.vel.lerp(target, acc);
    if (wish.lengthSq() > 0.01) a.face.copy(wish).normalize();
  }
  a.dashCd = Math.max(0, a.dashCd - dt);
  a.dribbleCd = Math.max(0, a.dribbleCd - dt);
  a.kickT = Math.max(0, a.kickT - dt);
  a.pos.addScaledVector(a.vel, dt);
  // límites: vallas y porterías
  const m = PR;
  a.pos.x = THREE.MathUtils.clamp(a.pos.x, -WX + m, WX - m);
  a.pos.y = THREE.MathUtils.clamp(a.pos.y, -WY + m, WY - m);
  if (Math.abs(a.pos.y) > HL - m) {
    const lim = POST_X + POST_R + m;
    if (Math.abs(a.pos.x) < lim) {
      const dy = Math.abs(a.pos.y) - (HL - m), dx = lim - Math.abs(a.pos.x);
      if (dx < dy && Math.abs(a.pos.y) > HL) a.pos.x = Math.sign(a.pos.x || 1) * lim;
      else a.pos.y = Math.sign(a.pos.y) * (HL - m);
    }
  }
}
function separate() {
  for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
    const a = actors[i], b = actors[j];
    const d = b.pos.clone().sub(a.pos); const L = d.length(), min = PR * 2;
    if (L < min && L > 1e-4) { d.multiplyScalar((min - L) / L / 2); a.pos.sub(d); b.pos.add(d); }
  }
}

// --- física del balón ---
function collideCircle2D(cx, cy, r, restitution) {
  const dx = ball.pos.x - cx, dy = ball.pos.y - cy, L = Math.hypot(dx, dy), min = r + BR;
  if (L < min && L > 1e-5) {
    const nx = dx / L, ny = dy / L; ball.pos.x = cx + nx * min; ball.pos.y = cy + ny * min;
    const vn = ball.vel.x * nx + ball.vel.y * ny;
    if (vn < 0) { ball.vel.x -= (1 + restitution) * vn * nx; ball.vel.y -= (1 + restitution) * vn * ny; if (-vn > 4) sfx.kick(0.1); }
    return true;
  }
  return false;
}
function stepBall(dt, prev) {
  const b = ball;
  b.vel.z -= GRAV * dt;
  b.pos.addScaledVector(b.vel, dt);
  // suelo
  if (b.pos.z < BR) {
    b.pos.z = BR;
    if (b.vel.z < -2.5) b.vel.z = -b.vel.z * 0.5; else b.vel.z = 0;
    const f = Math.exp(-1.1 * dt); b.vel.x *= f; b.vel.y *= f;
    const sp = Math.hypot(b.vel.x, b.vel.y); if (sp < 0.15) { b.vel.x = 0; b.vel.y = 0; }
  } else { const f = Math.exp(-0.15 * dt); b.vel.x *= f; b.vel.y *= f; }
  // vallas (0,9 m de alto: si va muy alto, rebota igual; el estadio es cerrado)
  const e = 0.72;
  if (b.pos.x > WX - BR) { b.pos.x = WX - BR; b.vel.x = -Math.abs(b.vel.x) * e; }
  if (b.pos.x < -WX + BR) { b.pos.x = -WX + BR; b.vel.x = Math.abs(b.vel.x) * e; }
  if (b.pos.y > WY - BR) { b.pos.y = WY - BR; b.vel.y = -Math.abs(b.vel.y) * e; }
  if (b.pos.y < -WY + BR) { b.pos.y = -WY + BR; b.vel.y = Math.abs(b.vel.y) * e; }
  if (b.pos.z > 9) { b.pos.z = 9; b.vel.z = -Math.abs(b.vel.z) * 0.5; }
  // porterías
  for (const s of [1, -1]) {
    const gl = s * HL, back = s * (HL + GD);
    // postes
    if (b.pos.z < GH + BR) { collideCircle2D(POST_X, gl, POST_R, 0.6); collideCircle2D(-POST_X, gl, POST_R, 0.6); }
    // larguero (cilindro en x)
    if (Math.abs(b.pos.x) < POST_X) {
      const dy = b.pos.y - gl, dz = b.pos.z - GH, L = Math.hypot(dy, dz), min = POST_R + BR;
      if (L < min && L > 1e-5) {
        const ny = dy / L, nz = dz / L; b.pos.y = gl + ny * min; b.pos.z = GH + nz * min;
        const vn = b.vel.y * ny + b.vel.z * nz; if (vn < 0) { b.vel.y -= 1.6 * vn * ny; b.vel.z -= 1.6 * vn * nz; sfx.kick(0.1); }
      }
    }
    // redes: laterales (x=±POST_X), fondo (y=back), techo inclinado
    const inY = (y) => s > 0 ? (y > gl && y < back) : (y < gl && y > back);
    const roofZ = (y) => GH + (BACK_H - GH) * Math.min(1, Math.abs(y - gl) / GD);
    if (inY(b.pos.y) || inY(prev.y)) {
      for (const sx of [1, -1]) {
        const wasIn = Math.abs(prev.x) < POST_X, isIn = Math.abs(b.pos.x) < POST_X;
        if (b.pos.z < roofZ(b.pos.y) + BR && Math.sign(b.pos.x) === sx && wasIn !== isIn) {
          b.pos.x = sx * (wasIn ? POST_X - BR : POST_X + BR); b.vel.x *= -0.15; b.vel.y *= 0.5;
        }
      }
      if (Math.abs(b.pos.x) < POST_X + BR && b.pos.z < roofZ(b.pos.y) + 0.1 && b.pos.z > 0) {
        // dentro de la portería: el balón no pasa del fondo
        if (s > 0 && b.pos.y > back - BR && prev.y <= back) { b.pos.y = back - BR; b.vel.y = -Math.abs(b.vel.y) * 0.15; b.vel.x *= 0.5; }
        if (s < 0 && b.pos.y < back + BR && prev.y >= back) { b.pos.y = back + BR; b.vel.y = Math.abs(b.vel.y) * 0.15; b.vel.x *= 0.5; }
      }
      // techo de la red desde fuera (balón que cae sobre la portería)
      if (Math.abs(b.pos.x) < POST_X && inY(b.pos.y) && prev.z >= roofZ(prev.y) + BR - 0.05 && b.pos.z < roofZ(b.pos.y) + BR) {
        b.pos.z = roofZ(b.pos.y) + BR; b.vel.z = Math.abs(b.vel.z) * 0.3; b.vel.y += s * -1.5;
      }
    }
    // fondo de red desde detrás (por si el balón llega desde fuera)
    if (Math.abs(b.pos.x) < POST_X && b.pos.z < BACK_H + BR) {
      if (s > 0 && prev.y >= back + BR - 0.01 && b.pos.y < back + BR) { b.pos.y = back + BR; b.vel.y = Math.abs(b.vel.y) * 0.3; }
      if (s < 0 && prev.y <= back - BR + 0.01 && b.pos.y > back - BR) { b.pos.y = back - BR; b.vel.y = -Math.abs(b.vel.y) * 0.3; }
    }
  }
}

// posición del balón respecto al jugador que lo lleva: en Dribble va y vuelve al pie derecho en cada toque
function ballOffset(o) {
  if (o.kickPending) return kickLocal(o);
  const D = o.meta.Dribble, t = D.toe_at_touch;
  const toeF = -t[1] * ESCALA + BR * 0.9, toeR = -t[0] * ESCALA * 0.8;
  if (o.cur === 'Dribble') {
    const u = ((o.phase('Dribble') - D.touch_phase) % 1 + 1) % 1;   // 0 = toque
    const push = DRIBBLE_PUSH * ESCALA * Math.min(1, o.vel.length() / 4);
    return { fwd: toeF + push * Math.sin(Math.PI * u) ** 0.8, right: toeR };
  }
  return { fwd: toeF + 0.12, right: toeR * 0.5 };
}

// --- IA ---
const tmp2 = new THREE.Vector2();
function aiField(a, opp, dt) {
  const wish = new THREE.Vector2();
  const bp = new THREE.Vector2(ball.pos.x, ball.pos.y);
  const atkY = a.team === 0 ? HL : -HL, dirY = Math.sign(atkY);
  a.wantTurbo = false;
  if (ball.owner === a) {
    // conducir hacia la portería, esquivando al rival
    const gk = a.team === 0 ? gkB : gkA;
    if (!a.aimX || Math.random() < dt * 0.4) a.aimX = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2.5);
    const target = new THREE.Vector2(a.aimX * 0.6, atkY - dirY * 6);
    wish.copy(target).sub(a.pos).normalize();
    const toOpp = opp.pos.clone().sub(a.pos); const dO = toOpp.length();
    if (dO < 4.5 && toOpp.dot(wish) > 0) { const side = new THREE.Vector2(-wish.y, wish.x); const sgn = Math.sign(side.dot(toOpp)) || 1; wish.addScaledVector(side, -sgn * 1.2).normalize(); }
    const distGoal = Math.abs(atkY - a.pos.y);
    if (distGoal > 8 && a.energy > 0.25) a.wantTurbo = true;
    a.holdT = (a.holdT || 0) + dt;
    if (dO < 3.2 && a.dribbleCd <= 0 && a.holdT > 0.3 && Math.random() < dt * 1.6) { tryDribble(a); }
    const blocked = dO < 2.6 && toOpp.dot(new THREE.Vector2(0, dirY)) > 0;
    if (a.kickPending) return wish.set(0, 0);
    if ((distGoal < 15 && a.holdT > 0.4) || (blocked && distGoal < 26 && a.holdT > 0.8) || a.holdT > 6) {
      const aimX = Math.abs(gk.pos.x - 3.6) > Math.abs(gk.pos.x + 3.6) ? 3.6 : -3.6;
      const err = (Math.random() - 0.5) * 2.4;
      const dir = new THREE.Vector2(aimX + err, atkY).sub(a.pos);
      shoot(a, dir, 0.45 + Math.random() * 0.5, false); a.holdT = 0;
      return wish.set(0, 0);
    }
  } else if (ball.owner === opp) {
    a.holdT = 0;
    // presionar al poseedor, ponerse entre él y nuestra portería
    const ownY = -atkY;
    const target = opp.pos.clone().lerp(new THREE.Vector2(0, ownY), 0.12);
    wish.copy(target).sub(a.pos);
    const d = opp.pos.distanceTo(a.pos);
    if (d > 5 && a.energy > 0.3) a.wantTurbo = true;
    if (d < 2.4 && a.dashCd <= 0 && (ball.ownT || 0) > 0.7 && Math.random() < dt * 2.2) { a.face.copy(opp.pos.clone().sub(a.pos).normalize()); tryDash(a); }
    if (wish.lengthSq() > 0.04) wish.normalize(); else wish.set(0, 0);
  } else {
    a.holdT = 0;
    // ir a por el balón (con predicción)
    const pred = bp.clone().addScaledVector(new THREE.Vector2(ball.vel.x, ball.vel.y), 0.35);
    pred.x = THREE.MathUtils.clamp(pred.x, -WX + 1, WX - 1); pred.y = THREE.MathUtils.clamp(pred.y, -WY + 1, WY - 1);
    // llegar un poco por detrás del balón respecto a la portería que ataca
    pred.y -= dirY * 0.4;
    wish.copy(pred).sub(a.pos);
    if (wish.length() > 5 && a.energy > 0.3) a.wantTurbo = true;
    if (wish.lengthSq() > 0.04) wish.normalize(); else wish.set(0, 0);
  }
  return wish;
}
function aiKeeper(k, dt) {
  const s = k.team === 0 ? -1 : 1;           // portería propia: azul abajo (y-), rojo arriba (y+)
  const lineY = s * (HL - 0.9);
  if (ball.owner === k) {
    k.holdT = (k.holdT || 0) + dt;
    if (k.kickPending) return new THREE.Vector2(0, 0);
    k.face.set(0, -s);
    if (k.holdT > 0.9) {
      const mate = k.team === 0 ? user : rival;
      const dir = mate.pos.clone().sub(k.pos); dir.x += (Math.random() - 0.5) * 2;
      if (dir.y * -s < 4) dir.set((Math.random() - 0.5) * 8, -s * 14);
      shoot(k, dir, 0.25 + Math.min(0.35, dir.length() / 60), false, 5.5); k.holdT = -5;
    }
    return new THREE.Vector2(0, 0);
  }
  k.holdT = 0;
  let tx = ball.pos.x * 0.55;
  const comingIn = ball.vel.y * s > 4 && !ball.owner;
  if (comingIn) {
    const tt = (lineY - ball.pos.y) / ball.vel.y;
    if (tt > 0 && tt < 2) tx = ball.pos.x + ball.vel.x * tt;
  }
  k.react = (k.react || 0) - dt;
  if (k.react > 0) tx = k.lastTx ?? tx; else { k.lastTx = tx; if (comingIn && !k.wasComing) k.react = 0.15 + Math.random() * 0.15; }
  k.wasComing = comingIn;
  if (comingIn && k.diveT <= 0 && k.react <= 0 && !ball.owner) {
    const tt = (lineY - ball.pos.y) / ball.vel.y;
    const bx = ball.pos.x + ball.vel.x * tt;
    if (tt > 0.05 && tt < 0.5 && Math.abs(bx - k.pos.x) > 1.0 * ESCALA && Math.abs(bx) < GW + 0.6) startDive(k, bx);
  }
  tx = THREE.MathUtils.clamp(tx, -GW + 0.6, GW - 0.6);
  // salir un poco si el balón está suelto y cerca
  let ty = lineY;
  const near = Math.hypot(ball.pos.x, ball.pos.y - s * HL) < 8 && !ball.owner && Math.hypot(ball.vel.x, ball.vel.y) < 6;
  if (near) { tx = THREE.MathUtils.clamp(ball.pos.x, -GW, GW); ty = THREE.MathUtils.clamp(ball.pos.y, s > 0 ? HL - 6 : -HL + 0.9, s > 0 ? HL - 0.9 : -HL + 6); }
  else ty = lineY;
  const wish = new THREE.Vector2(tx - k.pos.x, ty - k.pos.y);
  const L = wish.length(); if (L > 0.2) wish.multiplyScalar(Math.min(1, L / 1.2) / L); else wish.set(0, 0);
  const f = k.face.clone(); const r = moveKeeperFace(k, s); return { wish, face: r };
}
function startDive(k, bx) {
  const side = Math.sign(bx - k.pos.x) || 1;
  const left = new THREE.Vector2(-k.face.y, k.face.x);
  const dir = new THREE.Vector2(side, 0);
  k.diveClip = dir.dot(left) > 0 ? 'GK_Dive_L' : 'GK_Dive_R';
  k.diveDur = k.diveT = k.meta[k.diveClip].frames / 30 / DIVE_RATE;
  k.diveDir = dir;
  k.play(k.diveClip, 0.05, true); LOG('estirada', k, { side });
}
function moveKeeperFace(k, s) { const d = new THREE.Vector2(ball.pos.x - k.pos.x, ball.pos.y - k.pos.y); return d.lengthSq() > 0.01 ? d.normalize() : new THREE.Vector2(0, -s); }

function keeperContact(k) {
  if (ball.owner === k) return;
  if (ball.noCatch === k && ball.noCatchT > 0) return;
  const diving = k.diveT > 0 && (k.diveDur - k.diveT) > 0.12 && (k.diveDur - k.diveT) < 0.6;
  const reach = (diving ? 1.75 : 1.1) * ESCALA, d = Math.hypot(ball.pos.x - k.pos.x, ball.pos.y - k.pos.y);
  if (d > reach + BR || ball.pos.z > 2.7 * ESCALA) return;
  // solo dentro de su área grande aprox.
  const s = k.team === 0 ? -1 : 1;
  if (Math.abs(ball.pos.y - s * HL) > 8) return;
  if (ball.owner && ball.owner !== k) {
    if (Math.random() < 0.04) { giveBall(k); sfx.save(); }   // robo en carrera, poco probable por frame
    return;
  }
  const sp = Math.hypot(ball.vel.x, ball.vel.y);
  const pCatch = THREE.MathUtils.clamp(1.5 - sp / 30, 0.2, 1);
  if (Math.random() < pCatch) { giveBall(k); ball.pos.z = 1.1; if (sp > 8) { S.saves++; sfx.save(); } }
  else {
    // despeje / parada a córner
    ball.vel.y = -s * Math.abs(ball.vel.y) * 0.45; ball.vel.x = (Math.random() - 0.5) * 14 + (ball.pos.x - k.pos.x) * 3; ball.vel.z = 4;
    ball.noCatch = k; ball.noCatchT = 0.4; S.saves++; sfx.save(); k.kickT = 0.35; LOG('despeje', k, {});
  }
}

// ===================== FLUJO DE PARTIDO =====================
const elA = document.getElementById('golesA'), elB = document.getElementById('golesB'), elReloj = document.getElementById('reloj');
const banner = document.getElementById('banner'), pantalla = document.getElementById('pantalla'), resultado = document.getElementById('resultado');
function showBanner(txt, cls = '', ms = 1400) {
  banner.textContent = txt; banner.className = 'on ' + cls;
  clearTimeout(showBanner.t); if (ms) showBanner.t = setTimeout(() => banner.className = cls, ms);
}
function kickoff() {
  for (const a of actors) a.celebrate = false;
  user.place(0, -3.2); rival.place(0, 3.2);
  gkA.place(0, -HL + 0.9); gkB.place(0, HL - 0.9);
  ball.pos.set(0, 0, BR); ball.vel.set(0, 0, 0); ball.owner = null; ball.noCatch = null;
  input.shootDown = false; input.charge = 0;
  S.mode = 'kickoff'; S.pauseT = 1.1; showBanner('¡YA!', '', 900);
}
function startGame() {
  if (!user) return;
  tryLandscape();
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  actx?.resume?.();
  S.score = [0, 0]; S.time = DURACION; S.goals = 0; S.saves = 0; S.shots = 0;
  if (user) user.energy = 1; if (rival) rival.energy = 1;
  elA.textContent = '0'; elB.textContent = '0';
  pantalla.classList.remove('visible'); menuEl.classList.remove('visible'); hudSet(true);
  sfx.whistle(); kickoff();
}
document.getElementById('btnJugar').addEventListener('click', startGame);
document.getElementById('btnMenu').addEventListener('click', () => openMenu());
function goalScored(team) {
  S.score[team]++; S.goals++; LOG('gol', null, { team });
  elA.textContent = S.score[0]; elB.textContent = S.score[1];
  showBanner('¡GOOOL!', team === 0 ? 'bAzul' : 'bRojo', 1800); sfx.goal();
  S.mode = 'goal'; S.pauseT = 2.4; ball.owner = null;
  for (const a of actors) { a.celebrate = a.team === team; a.kickPending = null; a.diveT = 0; a.tackleT = 0; a.kickAnimT = 0; }
}
function endGame() {
  S.mode = 'end'; sfx.whistle();
  const [a, b] = S.score;
  for (const x of actors) x.celebrate = (a > b && x.team === 0) || (b > a && x.team === 1);
  resultado.innerHTML = `<div style="font-size:18px;opacity:.85">¡FINAL DEL PARTIDO!</div><div style="font-size:44px;margin:6px 0"><span style="color:#5ea0ff">${a}</span> - <span style="color:#ff6262">${b}</span></div>` +
    (a > b ? '<div style="color:#ffd23f">¡HAS GANADO! 🏆</div>' : a < b ? '<div>Has perdido… ¡revancha!</div>' : '<div>¡Empate!</div>');
  document.getElementById('btnJugar').textContent = 'JUGAR OTRA VEZ';
  pantalla.classList.add('visible');
}
function fmt(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }

// ===================== BUCLE =====================
const prevBall = new THREE.Vector3();
function update(dt) {
  S.t += dt;
  if (S.mode === 'kickoff') { S.pauseT -= dt; if (S.pauseT <= 0) S.mode = 'play'; }
  if (S.mode === 'goal') { S.pauseT -= dt; if (S.pauseT <= 0) { if (S.time <= 0) endGame(); else kickoff(); } }
  const playing = S.mode === 'play';
  if (playing) {
    S.time -= dt; if (S.time <= 0) { S.time = 0; if (S.score[0] !== S.score[1] || true) { endGame(); } }
  }
  elReloj.textContent = fmt(S.time); elReloj.classList.toggle('poco', S.time <= 15);

  // --- usuario ---
  const wish = new THREE.Vector2(input.jx, input.jy);
  if (input.keys.u) wish.y += 1; if (input.keys.d) wish.y -= 1; if (input.keys.l) wish.x -= 1; if (input.keys.r) wish.x += 1;
  if (wish.length() > 1) wish.normalize();
  const canMove = playing;
  if (user) updateEnergy(user, playing && input.turboDown, wish.lengthSq() > 0.04, dt);
  const userSp = SPEED_USER * (ball.owner === user ? 0.9 : 1) * (input.shootDown ? 0.55 : 1) * (user && user.sprinting ? TURBO_MULT : 1);
  moveActor(user, canMove ? wish : new THREE.Vector2(), userSp, dt);
  if (input.shootDown) {
    if (ball.owner !== user) { input.shootDown = false; input.charge = 0; btnChutar.classList.remove('pulsado'); }
    else input.charge = Math.min(1, input.charge + dt / 0.85);
  }
  // --- rival IA ---
  const aiWish = playing ? aiField(rival, user, dt) : new THREE.Vector2();
  if (rival) updateEnergy(rival, playing && !!rival.wantTurbo, aiWish.lengthSq() > 0.04, dt);
  const aiSp = SPEED_AI * (ball.owner === rival ? 0.88 : 1) * (rival && rival.sprinting ? TURBO_MULT : 1);
  moveActor(rival, aiWish, aiSp, dt);
  // --- porteros ---
  for (const k of [gkA, gkB]) {
    const r = playing ? aiKeeper(k, dt) : null;
    if (r && r.wish) { moveActor(k, r.wish, SPEED_GK, dt); if (ball.owner !== k && k.diveT <= 0) k.face.copy(r.face); }
    else moveActor(k, new THREE.Vector2(), SPEED_GK, dt);
    const s = k.team === 0 ? -1 : 1;
    // el portero no sale de su área
    k.pos.y = s > 0 ? THREE.MathUtils.clamp(k.pos.y, HL - 6, HL - 0.7) : THREE.MathUtils.clamp(k.pos.y, -HL + 0.7, -HL + 6);
    k.pos.x = THREE.MathUtils.clamp(k.pos.x, -10, 10);
  }
  separate();
  for (const a of actors) updateKick(a, dt);

  // --- balón ---
  prevBall.copy(ball.pos);
  ball.noCatchT = Math.max(0, ball.noCatchT - dt); ball.ownT = (ball.ownT || 0) + dt;
  if (ball.owner) {
    const o = ball.owner;
    if (o.keeper) {
      ball.pos.set(o.pos.x + o.face.x * 0.7 * ESCALA, o.pos.y + o.face.y * 0.7 * ESCALA, 1.1 * ESCALA);
      ball.vel.set(0, 0, 0);
    } else {
      const off = ballOffset(o);
      const rx = o.face.y, ry = -o.face.x;   // derecha del jugador
      const tgt = new THREE.Vector3(o.pos.x + o.face.x * off.fwd + rx * off.right, o.pos.y + o.face.y * off.fwd + ry * off.right, BR);
      ball.vel.set((tgt.x - ball.pos.x) / dt * 0.5, (tgt.y - ball.pos.y) / dt * 0.5, 0);
      ball.pos.lerp(tgt, Math.min(1, dt * (o.kickPending ? 16 : 20)));
      ball.pos.z = BR;
      ball.pos.x = THREE.MathUtils.clamp(ball.pos.x, -WX + BR, WX - BR); ball.pos.y = THREE.MathUtils.clamp(ball.pos.y, -WY + BR, WY - BR);
    }
    if (o.stun > 0) ball.owner = null;
  } else if (S.mode !== 'kickoff') {
    // subpasos para que los tiros rápidos no atraviesen postes
    const n = Math.ceil(Math.hypot(ball.vel.x, ball.vel.y, ball.vel.z) * dt / 0.15) || 1;
    for (let i = 0; i < Math.min(n, 8); i++) { const p = ball.pos.clone(); stepBall(dt / Math.min(n, 8), p); }
  }
  if (playing) {
    // contacto con jugadores de campo
    for (const a of [user, rival]) {
      if (ball.owner === a || a.stun > 0) continue;
      if (ball.noCatch === a && ball.noCatchT > 0) continue;
      const d = Math.hypot(ball.pos.x - a.pos.x, ball.pos.y - a.pos.y);
      if (ball.owner && !ball.owner.keeper) {
        // robo: solo con entrada (dash) contra el poseedor
        const o = ball.owner; const dd = a.pos.distanceTo(o.pos);
        if ((a.dashT > 0 || a.dashEnded) && dd < PR * 2 + 0.5 && ball.ownT > 0.55) {
          if (o.dribbleT > 0) {
            a.dashT = 0; a.dashEnded = false; a.dashHit = true; a.stun = DASH_MISS_STUN;
            sfx.miss(); showBanner('¡REGATE!', o.team === 0 ? 'bAzul' : 'bRojo', 700); LOG('regate_falla_entrada', o, { vs: NAME(a) });
          } else {
            a.dashHit = true; a.dashT = 0; a.dashEnded = false; a.tackleT = Math.min(a.tackleT, 0.22);
            giveBall(a); sfx.steal(); showBanner('¡ROBO!', a.team === 0 ? 'bAzul' : 'bRojo', 700);
          }
        }
      } else if (!ball.owner && d < PR + BR + 0.15 && ball.pos.z < 1.3 * ESCALA) {
        const sp = Math.hypot(ball.vel.x, ball.vel.y);
        if (sp < 24 || a.dashT > 0) { giveBall(a); if (a.dashT > 0) a.tackleT = Math.min(a.tackleT, 0.22); a.dashT = 0; a.dashHit = true; a.dashEnded = false; }
        else { collideCircle2D(a.pos.x, a.pos.y, PR, 0.4); ball.lastTouch = a; }
      }
    }
    for (const a of [user, rival]) {
      if (a.dashEnded && !a.dashHit) { a.stun = DASH_MISS_STUN; sfx.miss(); LOG('entrada_falla', a, {}); }
      a.dashEnded = false;
    }
    keeperContact(gkA); keeperContact(gkB);
    // gol: el balón entero cruza la línea entre postes y bajo el larguero
    if (Math.abs(ball.pos.x) < GW && ball.pos.z < GH) {
      if (ball.pos.y > HL + BR) goalScored(0);
      else if (ball.pos.y < -HL - BR) goalScored(1);
    }
  }
  if (S.mode === 'goal' && !ball.owner) { const n = 4; for (let i = 0; i < n; i++) stepBall(dt / n, ball.pos.clone()); }

  // --- UI botones ---
  const hasBall = ball.owner === user;
  acciones.classList.toggle('con-balon', !!hasBall);
  acciones.classList.toggle('sin-balon', !hasBall);
  const ring = (el, fill) => { if (el) el.style.strokeDashoffset = String(289 * (1 - Math.max(0, Math.min(1, fill)))); };
  ring(cargaAro, input.shootDown ? input.charge : 0);
  ring(cargaRegate, user ? (user.dribbleCd > 0 ? 1 - user.dribbleCd / DRIBBLE_CD : 1) : 1);
  ring(cargaEntrada, user ? (user.dashCd > 0 ? 1 - user.dashCd / DASH_CD_USER : 1) : 1);
  ring(cargaTurbo, user ? user.energy : 1);
  btnRegate.classList.toggle('cd', !!(user && user.dribbleCd > 0));
  btnEntrada.classList.toggle('cd', !!(user && user.dashCd > 0));
  btnTurbo.classList.toggle('pulsado', !!(input.turboDown && user && user.sprinting));
  btnTurbo.classList.toggle('activo', !!(user && user.sprinting));
  btnTurbo.classList.toggle('vacio', !!(user && user.energy <= TURBO_MIN && !user.sprinting));
}

function render(dt) {
  if (S.mode === 'menu') { renderMenu(dt); return; }
  for (const a of actors) a.sync(dt, S.t);
  ballMesh.position.copy(g2t(ball.pos.x, ball.pos.y, ball.pos.z));
  const v = new THREE.Vector3(ball.vel.x, 0, -ball.vel.y);
  if (ball.owner && !ball.owner.keeper) v.set(ball.owner.vel.x, 0, -ball.owner.vel.y);
  const vs = v.length();
  if (vs > 0.05) { const axis = new THREE.Vector3(0, 1, 0).cross(v); if (axis.lengthSq() > 0.01) ballMesh.rotateOnWorldAxis(axis.normalize(), vs * dt / BR); }
  ballShadow.position.set(ball.pos.x, 0.025, -ball.pos.y);
  ballGhost.position.copy(ballMesh.position); ballGhost.quaternion.copy(ballMesh.quaternion);
  const h = ball.pos.z - BR; ballShadow.scale.setScalar(Math.max(0.4, 1 - h * 0.08)); ballShadow.material.opacity = Math.max(0.08, 0.35 - h * 0.03);
  // flecha de apuntado
  if (input.shootDown && ball.owner === user) {
    aimArrow.visible = true; aimArrow.position.copy(g2t(user.pos.x, user.pos.y, 0.05));
    aimArrow.rotation.y = Math.atan2(-user.face.x, user.face.y);
    aimArrow.scale.set(1, 1, 0.6 + 2.4 * input.charge);
    aimArrow.children[0].material.color.setHSL(0.13 - 0.13 * input.charge, 1, 0.55);
  } else aimArrow.visible = false;
  if (HORIZONTAL) updateHorizCam(false);
  renderer.render(scene, camera);
}

let last = performance.now(), fpsAcc = 0, fpsN = 0;
window.__game.fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (window.__game.paused) return;   // solo para pruebas automáticas (avance manual con __game.advance)
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { window.__game.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (S.mode !== 'menu' && S.mode !== 'end') update(dt); else { for (const a of actors) a.vel.multiplyScalar(0.8); }
  if (S.mode === 'menu' || ballMesh) render(dt);
}

// ===================== MENÚ DE PERSONAJES =====================
const menuEl = document.getElementById('menu');
const hudEls = ['hud', 'joyZona', 'acciones'].map((id) => document.getElementById(id));
function hudSet(on) { for (const e of hudEls) if (e) e.style.visibility = on ? '' : 'hidden'; }
const menuScene = new THREE.Scene();
menuScene.background = new THREE.Color('#2459c9');
const menuCam = new THREE.PerspectiveCamera(30, 9 / 16, 0.1, 100);
menuScene.add(new THREE.HemisphereLight(0xffffff, 0x5d6f9c, 1.3));
const mSun = new THREE.DirectionalLight(0xffffff, 2.0); mSun.position.set(-2.5, 4, 5); menuScene.add(mSun);
const burst = new THREE.Group();
{ // rayos de fondo planos, estilo pantalla de selección
  const N = 20, R = 40;
  for (let i = 0; i < N; i += 2) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); sh.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); sh.closePath();
    burst.add(new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: '#2d6ae0' })));
  }
  burst.position.set(0, 1.4, -8); menuScene.add(burst);
}
const ped = new THREE.Group();
{
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.2, 56), new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 1, metalness: 0 }));
  top.position.y = -0.1; ped.add(top);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 56), new THREE.MeshStandardMaterial({ color: '#1b2440', roughness: 1, metalness: 0 }));
  rim.position.y = -0.2; ped.add(rim);
  const sh = blob(0.8, 0.28); sh.position.y = 0.005; ped.add(sh);
  menuScene.add(ped);
}
const menuChars = [];
let sel = 0, rivalSel = 1, popT = 1, userYaw = 0, menuT = 0, drag = null;
let campoReady = null, matchKeys = null;
function buildMenuChars() {
  for (const c of CHARS) {
    const model = matte(SkeletonUtils.clone(GLB[c.key].scene));
    model.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
    const root = new THREE.Group(); root.add(model); root.visible = false; menuScene.add(root);
    const mixer = new THREE.AnimationMixer(model); const actions = {};
    for (const clip of GLB[c.key].animations) actions[clip.name] = mixer.clipAction(clip);
    const cel = actions.Celebrate; cel.setLoop(THREE.LoopOnce, 1); cel.clampWhenFinished = true;
    actions.Idle.play();
    mixer.addEventListener('finished', (e) => {
      if (e.action === cel) { actions.Idle.reset().play(); cel.crossFadeTo(actions.Idle, 0.3, false); }
    });
    menuChars.push({ root, model, mixer, actions });
  }
}
const mNombre = document.getElementById('mNombre'), mVs = document.getElementById('mVs'), mCartas = document.getElementById('mCartas');
function buildMenuUI() {
  CHARS.forEach((c, i) => {
    const d = document.createElement('div'); d.className = 'carta'; d.style.setProperty('--c', c.color);
    d.innerHTML = `<div class="cartaFoto"><img src="${c.card}" alt="" draggable="false"></div><div class="cartaNom">${c.name}</div>`;
    d.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (i !== sel) selectChar(i); });
    mCartas.appendChild(d);
  });
  document.getElementById('mPrev').addEventListener('pointerdown', (e) => { e.preventDefault(); menuStep(-1); });
  document.getElementById('mNext').addEventListener('pointerdown', (e) => { e.preventDefault(); menuStep(1); });
  document.getElementById('btnMenuJugar').addEventListener('click', () => menuPlay());
  const st = document.getElementById('menuStage');
  st.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, x0: e.clientX, t: performance.now() }; try { st.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
  st.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; userYaw += (e.clientX - drag.x) * 0.012; drag.x = e.clientX; });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dtm = performance.now() - drag.t;
    if (Math.abs(dx) > 70 && dtm < 300) { userYaw -= dx * 0.012; menuStep(dx < 0 ? 1 : -1); }   // deslizar rápido = cambiar
    drag = null;
  };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
}
function pickRival() {
  const others = CHARS.map((_, i) => i).filter((i) => i !== sel);
  rivalSel = others[Math.floor(Math.random() * others.length)];
}
function selectChar(i, celebrate = true) {
  sel = (i + CHARS.length) % CHARS.length;
  menuChars.forEach((m, k) => { m.root.visible = k === sel; });
  const m = menuChars[sel];
  popT = 0; userYaw = 0;
  if (celebrate) {
    const cel = m.actions.Celebrate, idle = m.actions.Idle;
    cel.reset().setEffectiveWeight(1).play(); idle.crossFadeTo(cel, 0.12, false);
  }
  const c = CHARS[sel];
  mNombre.textContent = c.name; mNombre.style.setProperty('--c', c.color);
  [...mCartas.children].forEach((d, k) => d.classList.toggle('sel', k === sel));
  pickRival();
  mVs.innerHTML = `RIVAL <b style="background:${CHARS[rivalSel].color}">${CHARS[rivalSel].name}</b>`;
  sfx.dribble && actx && sfx.dribble();
}
function menuStep(d) { if (S.mode === 'menu') selectChar(sel + d); }
function openMenu() {
  S.mode = 'menu';
  pantalla.classList.remove('visible'); menuEl.classList.add('visible'); hudSet(false);
  showBanner('', '', 0);
  selectChar(sel, false);
}
async function menuPlay() {
  if (S.mode !== 'menu') return;
  tryLandscape();
  const btn = document.getElementById('btnMenuJugar');
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (!window.__game.ready) { btn.textContent = 'CARGANDO…'; btn.disabled = true; }
  await campoReady;
  btn.textContent = 'JUGAR'; btn.disabled = false;
  setupMatch(CHARS[sel].key, CHARS[rivalSel].key);
  document.getElementById('btnJugar').textContent = 'JUGAR OTRA VEZ';
  startGame();
}
function setupMatch(uk, rk) {
  if (matchKeys && matchKeys[0] === uk && matchKeys[1] === rk) return;
  for (const a of actors) a.dispose();
  user = new Actor(uk, 0, false, 0x3d8bff);
  rival = new Actor(rk, 1, false, 0xff4040);
  gkA = new Actor(uk, 0, true, 0x9cc4ff);
  gkB = new Actor(rk, 1, true, 0xffa0a0);
  actors = [user, rival, gkA, gkB];
  const tri = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 3), new THREE.MeshBasicMaterial({ color: 0x3d8bff }));
  tri.rotation.x = Math.PI; tri.position.y = 2.75 * ESCALA; user.root.add(tri); user.marker = tri;
  user.place(0, -3.2); rival.place(0, 3.2); gkA.place(0, -HL + 0.9); gkB.place(0, HL - 0.9);
  document.querySelector('#marcador .azul .nom').textContent = CHARS.find((c) => c.key === uk).name;
  document.querySelector('#marcador .rojo .nom').textContent = CHARS.find((c) => c.key === rk).name;
  matchKeys = [uk, rk];
}
function layoutMenu() {
  const W = app.clientWidth, H = app.clientHeight;
  if (!W || !H) return;
  menuCam.aspect = W / H;
  if (HORIZONTAL) {
    // el personaje se ve en la mitad izquierda; encuadre un poco más cercano
    const visH = H < 520 ? 5.5 : 4.7;
    const dist = visH / 2 / Math.tan(THREE.MathUtils.degToRad(menuCam.fov / 2));
    const halfW = dist * Math.tan(THREE.MathUtils.degToRad(menuCam.fov / 2)) * (W / H);
    // lookAt descentra el personaje: hay que mirar a la derecha para que quede en la mitad izquierda
    menuCam.position.set(0, 1.05, dist);
    menuCam.lookAt(halfW * 0.46, 0.20, 0);
  } else {
    // el personaje ocupa la franja central (entre el título y las cartas)
    const visH = 6.7 * Math.max(1, (9 / 16) / (W / H) * 0.82);
    const dist = visH / 2 / Math.tan(THREE.MathUtils.degToRad(menuCam.fov / 2));
    menuCam.position.set(0, 1.25, dist);
    menuCam.lookAt(0, 0.12, 0);
  }
  menuCam.updateProjectionMatrix();
}
function renderMenu(dt) {
  const m = menuChars[sel]; if (!m) return;
  menuT += dt; burst.rotation.z += dt * 0.07;
  popT = Math.min(1, popT + dt * 3.2);
  const k = popT, back = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;   // easeOutBack
  m.root.scale.setScalar(0.35 + 0.65 * back);
  if (!drag) userYaw *= Math.exp(-0.8 * dt);
  m.root.rotation.y = Math.sin(menuT * 0.7) * 0.5 + userYaw;
  m.mixer.update(dt);
  renderer.render(menuScene, menuCam);
}

// ===================== ORIENTACIÓN (aviso + lock landscape) =====================
async function tryLandscape() {
  if (!HORIZONTAL) return;
  try {
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      if (root.requestFullscreen) await root.requestFullscreen();
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    }
  } catch (_) {}
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) {}
}
function isPortraitScreen() {
  return window.innerHeight > window.innerWidth + 24;
}
function updateOrient() {
  const show = HORIZONTAL && isPortraitScreen();
  const el = document.getElementById('giraMovil');
  if (el) {
    el.classList.toggle('visible', show);
    el.setAttribute('aria-hidden', show ? 'false' : 'true');
  }
  document.body.classList.toggle('gira-activo', show);
}
updateOrient();
window.addEventListener('resize', () => { updateOrient(); layoutMenu(); });
window.addEventListener('orientationchange', () => { updateOrient(); layoutMenu(); });
const giraEl = document.getElementById('giraMovil');
if (giraEl) {
  giraEl.addEventListener('pointerdown', () => { tryLandscape(); });
}

// ===================== INICIO =====================
function setupField(campo) {
  campoRoot = matte(campo.scene);
  scene.add(campoRoot);
  // Recorte de la grada derecha: solo en cámaras de LADO (A/B/C). D/E/F ven el estadio entero.
  camClipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), WX + 3.0);
  renderer.localClippingEnabled = true;
  camApron = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 170),
    new THREE.MeshStandardMaterial({ color: 0xc4684e, roughness: 1, metalness: 0 })
  );
  camApron.rotation.x = -Math.PI / 2;
  camApron.position.set(WX + 3.0 + 35, -0.03, 0);
  camApron.visible = false;
  scene.add(camApron);
  if (HORIZONTAL) applyCamClip(camCfg().layout === 'side');
  ballMesh = makeBall(); scene.add(ballMesh);
  // silueta del balón cuando queda tapado por un jugador (la cámara es alta y el balón va delante del pie)
  ballGhost = new THREE.Mesh(ballMesh.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, depthFunc: THREE.GreaterDepth }));
  ballGhost.renderOrder = 6; scene.add(ballGhost);
  ballShadow = blob(BR * 1.25, 0.35); scene.add(ballShadow);
  aimArrow = new THREE.Group();
  const shape = new THREE.Shape(); shape.moveTo(-0.22, 0.9); shape.lineTo(0.22, 0.9); shape.lineTo(0.22, 2.0); shape.lineTo(0.5, 2.0); shape.lineTo(0, 2.7); shape.lineTo(-0.5, 2.0); shape.lineTo(-0.22, 2.0); shape.closePath();
  const am = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  am.renderOrder = 3;
  aimArrow.add(am); aimArrow.visible = false; scene.add(aimArrow);
  am.rotation.set(-Math.PI / 2, 0, 0);   // la flecha apunta a -Z local (frente del personaje)
}
Object.assign(window.__game, {
  paused: false,
  advance: (sec, step = 1 / 60) => { for (let t = 0; t < sec - 1e-6; t += step) { if (S.mode !== 'menu' && S.mode !== 'end') update(step); render(step); } },
  forceGoal: (team) => goalScored(team),
  selectChar: (i) => selectChar(i), menuPlay: () => menuPlay(), openMenu: () => openMenu(),
  get menuSel() { return sel; }, get rivalSel() { return rivalSel; }, CHARS,
  HORIZONTAL, VERTICAL, CAMS,
  tryLandscape, updateOrient,
  setCamMode: (m) => setCamMode(m, true),
  setJoyDir,
  setupMatch,
});
Object.defineProperty(window.__game, 'camMode', { get: () => camMode });
(async function init() {
  const cargando = document.getElementById('cargando');
  try {
    cargando.textContent = 'Cargando personajes…';
    META = await (await fetch('assets/anim_meta.json')).json();
    const gl = await Promise.all(CHARS.map((c) => load(c.file)));
    CHARS.forEach((c, i) => { GLB[c.key] = gl[i]; });
    buildMenuChars(); buildMenuUI();
    layout(); layoutMenu(); updateOrient();
    cargando.classList.add('oculto');
    openMenu();
    window.__game.menuReady = true;
    requestAnimationFrame(frame);
    campoReady = load('assets/campo.glb').then((campo) => { setupField(campo); window.__game.ready = true; });
    await campoReady;
  } catch (err) {
    console.error(err);
    cargando.classList.remove('oculto');
    cargando.textContent = 'Error cargando: ' + err.message;
  }
})();
