import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// ===================== CONSTANTES (metros, coords "Blender": x derecha, y hacia la portería rival) =====================
const P = new URLSearchParams(location.search);
const ESCALA = parseFloat(P.get('escala') || '1');      // escala de personajes (1 = 2,00 m como en el modelo)
const DURACION = parseFloat(P.get('tiempo') || '120');   // segundos de partido
const HW = 11, HL = 24;                    // medio ancho / medio largo entre líneas
const WX = 13.2, WY = 27.3;                // cara interior de las vallas
const GW = 5.0, POST_X = 5.28, POST_R = 0.28, GH = 4.0, GD = 2.5, BACK_H = 2.2;
const BR = 0.35;                           // radio del balón (un pelín mayor que el 0,30 del glb para que se lea en móvil)
const GRAV = 22;
const PR = 0.6 * ESCALA;                   // radio de colisión del jugador
const SPEED_USER = 7.6, SPEED_AI = 6.3, SPEED_GK = 5.6;
const g2t = (x, y, z = 0) => new THREE.Vector3(x, z, -y);   // juego -> three (Y-up)

// ===================== RENDER =====================
const app = document.getElementById('app');
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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

function layout() {
  const W = app.clientWidth, H = app.clientHeight;
  renderer.setSize(W, H, false);
  const Hf = W * 16 / 9;                       // marco de referencia 9:16 (como el preview)
  const t = Math.tan(THREE.MathUtils.degToRad(20));
  if (H > Hf + 1) {
    // móvil más alargado que 9:16: mismo encuadre arriba y franja extra abajo para los controles
    const fullH = Hf + 2 * (H - Hf);
    camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(t * fullH / Hf));
    camera.aspect = W / fullH;
    camera.setViewOffset(W, fullH, 0, H - Hf, W, H);
  } else {
    camera.clearViewOffset();
    camera.aspect = W / H;
    const hf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(23.14 / 2)));   // fov horizontal del preview
    // si la pantalla es más ancha que 9:16 mantenemos el FOV vertical de 40°
    camera.fov = 40;
  }
  camera.updateProjectionMatrix();
  placeJoyBase();
}
window.addEventListener('resize', layout);

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
  constructor(model, team, keeper, ringColor) {
    this.team = team;            // 0 = azul (usuario, ataca hacia +y), 1 = rojo (ataca hacia -y)
    this.keeper = keeper;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    model.scale.setScalar(ESCALA);
    this.body.add(model);
    this.root.add(this.body);
    this.shadow = blob(0.75 * ESCALA, 0.3); this.shadow.position.y = 0.02; this.root.add(this.shadow);
    this.ring = ring(ringColor, keeper ? 0.85 * ESCALA : 1.0 * ESCALA); this.ring.position.y = 0.03; this.root.add(this.ring);
    scene.add(this.root);
    this.pos = new THREE.Vector2(); this.vel = new THREE.Vector2();
    this.face = new THREE.Vector2(0, team === 0 ? 1 : -1);
    this.yaw = 0; this.walk = 0; this.kickT = 0; this.dashT = 0; this.dashCd = 0; this.stun = 0;
    this.lean = 0; this.tilt = 0;
  }
  place(x, y) { this.pos.set(x, y); this.vel.set(0, 0); this.face.set(0, this.team === 0 ? 1 : -1); this.dashT = 0; this.stun = 0; this.kickT = 0; }
  sync(dt, t) {
    const sp = this.vel.length();
    const targetYaw = Math.atan2(this.face.x, -this.face.y);   // los modelos miran a +Z de three (hacia la cámara) por defecto
    let d = targetYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 14);
    this.root.position.copy(g2t(this.pos.x, this.pos.y));
    this.root.rotation.y = this.yaw;
    // animación falsa: saltito al andar, balanceo lateral, inclinación hacia delante, patada
    this.walk += dt * (6 + sp * 1.6) * (sp > 0.3 ? 1 : 0);
    const moving = Math.min(1, sp / 5);
    const bob = Math.abs(Math.sin(this.walk)) * 0.16 * moving * ESCALA;
    this.lean += ((this.dashT > 0 ? 0.35 : 0.12 * moving) - this.lean) * Math.min(1, dt * 10);
    this.tilt = Math.sin(this.walk) * 0.09 * moving;
    let kick = 0;
    if (this.kickT > 0) { const k = 1 - this.kickT / 0.35; kick = k < 0.3 ? -0.25 * (k / 0.3) : 0.45 * Math.sin((k - 0.3) / 0.7 * Math.PI); }
    let stunWob = this.stun > 0 ? Math.sin(t * 40) * 0.15 : 0;
    this.body.position.y = bob;
    this.body.rotation.set(-(this.lean + kick), 0, this.tilt + stunWob);
    if (this.shadow) this.shadow.scale.setScalar(1 - bob * 0.8);
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
let ballMesh, ballShadow, aimArrow;

// ===================== ESTADO =====================
let user, rival, gkA, gkB, actors = [];
const S = { mode: 'menu', score: [0, 0], time: DURACION, pauseT: 0, kickoffTeam: 0, t: 0, goals: 0, saves: 0, shots: 0 };
const LOGS = []; const NAME = (a) => a === user ? 'conazo' : a === rival ? 'calcetrol' : a === gkA ? 'portero_azul' : 'portero_rojo';
function LOG(ev, a, extra) { LOGS.push({ t: +S.t.toFixed(2), ev, who: a ? NAME(a) : null, ...extra }); if (LOGS.length > 300) LOGS.shift(); }
window.__game = { LOGS, get input() { return input; }, pressShoot: () => pressShoot(), releaseShoot: () => releaseShoot(), S, ball, camera, scene, renderer, get actors() { return actors; } };

// ===================== INPUT =====================
const input = { jx: 0, jy: 0, shootDown: false, charge: 0, keys: {} };
const joyZona = document.getElementById('joyZona'), joyBase = document.getElementById('joyBase'), joyPunta = document.getElementById('joyPunta');
const btn = document.getElementById('btnChutar'), btnTxt = document.getElementById('btnTxt'), cargaAro = document.getElementById('carga');
let joyId = null, joyCx = 0, joyCy = 0, joyHome = { x: 84, y: 0 };
function placeJoyBase() {
  const zr = joyZona.getBoundingClientRect();
  joyHome = { x: 92, y: zr.height - 104 };
  if (joyId === null) setJoy(joyHome.x, joyHome.y);
}
function setJoy(x, y) { joyBase.style.left = x + 'px'; joyBase.style.top = y + 'px'; joyCx = x; joyCy = y; }
joyZona.addEventListener('pointerdown', (e) => {
  if (joyId !== null) return;
  joyId = e.pointerId; joyZona.setPointerCapture(e.pointerId);
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
btn.addEventListener('pointerdown', (e) => { btn.setPointerCapture(e.pointerId); pressShoot(); e.preventDefault(); });
btn.addEventListener('pointerup', () => releaseShoot());
btn.addEventListener('pointercancel', () => releaseShoot());
const keyMap = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
window.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) { input.keys[keyMap[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space') { if (!e.repeat) { if (S.mode === 'menu' || S.mode === 'end') startGame(); else pressShoot(); } e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code]) input.keys[keyMap[e.code]] = false;
  if (e.code === 'Space') releaseShoot();
});
window.addEventListener('blur', () => { input.keys = {}; input.jx = input.jy = 0; releaseShoot(true); });
document.addEventListener('contextmenu', (e) => e.preventDefault());

function pressShoot() {
  if (S.mode !== 'play' || input.shootDown) return;
  btn.classList.add('pulsado');
  if (ball.owner === user) { input.shootDown = true; input.charge = 0; }
  else { tryDash(user); }
}
function releaseShoot(cancel) {
  btn.classList.remove('pulsado');
  if (!input.shootDown) return;
  input.shootDown = false;
  if (!cancel && ball.owner === user && S.mode === 'play') shoot(user, user.face.clone(), 0.15 + 0.85 * input.charge, true);
  input.charge = 0;
}

// ===================== MECÁNICAS =====================
function tryDash(a) {
  if (a.dashCd > 0 || a.stun > 0) return false;
  a.dashT = 0.24; a.dashCd = a === user ? 0.8 : 2.0; return true;
}
function goalCenter(team) { return new THREE.Vector2(0, team === 0 ? HL : -HL); }  // portería que ataca el equipo
function shoot(a, dir, power, assist) {
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
  ball.pos.set(a.pos.x + dir.x * (PR + BR + 0.15), a.pos.y + dir.y * (PR + BR + 0.15), BR + 0.05);
  ball.vel.set(dir.x * sp, dir.y * sp, 1.5 + 5.5 * power * power);
  a.kickT = 0.35; a.face.copy(dir);
  S.shots++; sfx.kick(power); LOG('tiro', a, { pos: [+a.pos.x.toFixed(1), +a.pos.y.toFixed(1)], vel: [+ball.vel.x.toFixed(1), +ball.vel.y.toFixed(1), +ball.vel.z.toFixed(1)] });
}
function giveBall(a) {
  LOG('posesion', a, { from: ball.owner ? NAME(ball.owner) : null, b: [+ball.pos.x.toFixed(1), +ball.pos.y.toFixed(1), +ball.pos.z.toFixed(1)] });
  if (ball.owner && ball.owner !== a) { const v = ball.owner; v.stun = 0.55; const k = v.pos.clone().sub(a.pos).normalize().multiplyScalar(6); v.vel.copy(k); }
  ball.owner = a; ball.lastTouch = a; ball.vel.set(0, 0, 0); ball.ownT = 0;
}

function moveActor(a, wish, speed, dt) {
  if (a.stun > 0) { a.stun -= dt; a.vel.multiplyScalar(Math.exp(-6 * dt)); }
  else if (a.dashT > 0) { a.dashT -= dt; a.vel.copy(a.face).multiplyScalar(15); }
  else {
    const target = wish.clone().multiplyScalar(speed);
    const acc = 1 - Math.exp(-14 * dt);
    a.vel.lerp(target, acc);
    if (wish.lengthSq() > 0.01) a.face.copy(wish).normalize();
  }
  a.dashCd = Math.max(0, a.dashCd - dt); a.kickT = Math.max(0, a.kickT - dt);
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

// --- IA ---
const tmp2 = new THREE.Vector2();
function aiField(a, opp, dt) {
  const wish = new THREE.Vector2();
  const bp = new THREE.Vector2(ball.pos.x, ball.pos.y);
  const atkY = a.team === 0 ? HL : -HL, dirY = Math.sign(atkY);
  if (ball.owner === a) {
    // conducir hacia la portería, esquivando al rival
    const gk = a.team === 0 ? gkB : gkA;
    if (!a.aimX || Math.random() < dt * 0.4) a.aimX = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2.5);
    const target = new THREE.Vector2(a.aimX * 0.6, atkY - dirY * 6);
    wish.copy(target).sub(a.pos).normalize();
    const toOpp = opp.pos.clone().sub(a.pos); const dO = toOpp.length();
    if (dO < 4.5 && toOpp.dot(wish) > 0) { const side = new THREE.Vector2(-wish.y, wish.x); const sgn = Math.sign(side.dot(toOpp)) || 1; wish.addScaledVector(side, -sgn * 1.2).normalize(); }
    const distGoal = Math.abs(atkY - a.pos.y);
    a.holdT = (a.holdT || 0) + dt;
    const blocked = dO < 2.6 && toOpp.dot(new THREE.Vector2(0, dirY)) > 0;
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
    if (wish.lengthSq() > 0.04) wish.normalize(); else wish.set(0, 0);
  }
  return wish;
}
function aiKeeper(k, dt) {
  const s = k.team === 0 ? -1 : 1;           // portería propia: azul abajo (y-), rojo arriba (y+)
  const lineY = s * (HL - 0.9);
  if (ball.owner === k) {
    k.holdT = (k.holdT || 0) + dt;
    k.face.set(0, -s);
    if (k.holdT > 0.9) {
      const mate = k.team === 0 ? user : rival;
      const dir = mate.pos.clone().sub(k.pos); dir.x += (Math.random() - 0.5) * 2;
      if (dir.y * -s < 4) dir.set((Math.random() - 0.5) * 8, -s * 14);
      shoot(k, dir, 0.25 + Math.min(0.35, dir.length() / 60), false); ball.vel.z = 5.5; k.holdT = 0;
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
function moveKeeperFace(k, s) { const d = new THREE.Vector2(ball.pos.x - k.pos.x, ball.pos.y - k.pos.y); return d.lengthSq() > 0.01 ? d.normalize() : new THREE.Vector2(0, -s); }

function keeperContact(k) {
  if (ball.owner === k) return;
  if (ball.noCatch === k && ball.noCatchT > 0) return;
  const reach = 1.1 * ESCALA, d = Math.hypot(ball.pos.x - k.pos.x, ball.pos.y - k.pos.y);
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
  user.place(0, -3.2); rival.place(0, 3.2);
  gkA.place(0, -HL + 0.9); gkB.place(0, HL - 0.9);
  ball.pos.set(0, 0, BR); ball.vel.set(0, 0, 0); ball.owner = null; ball.noCatch = null;
  input.shootDown = false; input.charge = 0;
  S.mode = 'kickoff'; S.pauseT = 1.1; showBanner('¡YA!', '', 900);
}
function startGame() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  actx?.resume?.();
  S.score = [0, 0]; S.time = DURACION; S.goals = 0; S.saves = 0; S.shots = 0;
  elA.textContent = '0'; elB.textContent = '0';
  pantalla.classList.remove('visible');
  sfx.whistle(); kickoff();
}
document.getElementById('btnJugar').addEventListener('click', startGame);
function goalScored(team) {
  S.score[team]++; S.goals++; LOG('gol', null, { team });
  elA.textContent = S.score[0]; elB.textContent = S.score[1];
  showBanner('¡GOOOL!', team === 0 ? 'bAzul' : 'bRojo', 1800); sfx.goal();
  S.mode = 'goal'; S.pauseT = 2.0; ball.owner = null;
}
function endGame() {
  S.mode = 'end'; sfx.whistle();
  const [a, b] = S.score;
  resultado.innerHTML = `<div style="font-size:18px;opacity:.85">¡FINAL DEL PARTIDO!</div><div style="font-size:44px;margin:6px 0"><span style="color:#5ea0ff">${a}</span> - <span style="color:#ff6262">${b}</span></div>` +
    (a > b ? '<div style="color:#ffd23f">¡HAS GANADO! 🏆</div>' : a < b ? '<div>Has perdido… ¡revancha!</div>' : '<div>¡Empate!</div>');
  document.getElementById('btnJugar').textContent = 'JUGAR OTRA VEZ';
  document.getElementById('ayuda').style.display = 'none';
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
  moveActor(user, canMove ? wish : new THREE.Vector2(), SPEED_USER * (ball.owner === user ? 0.9 : 1) * (input.shootDown ? 0.55 : 1), dt);
  if (input.shootDown) { input.charge = Math.min(1, input.charge + dt / 0.85); }
  // --- rival IA ---
  moveActor(rival, playing ? aiField(rival, user, dt) : new THREE.Vector2(), SPEED_AI * (ball.owner === rival ? 0.88 : 1), dt);
  // --- porteros ---
  for (const k of [gkA, gkB]) {
    const r = playing ? aiKeeper(k, dt) : null;
    if (r && r.wish) { moveActor(k, r.wish, SPEED_GK, dt); if (ball.owner !== k) k.face.copy(r.face); }
    else moveActor(k, new THREE.Vector2(), SPEED_GK, dt);
    const s = k.team === 0 ? -1 : 1;
    // el portero no sale de su área
    k.pos.y = s > 0 ? THREE.MathUtils.clamp(k.pos.y, HL - 6, HL - 0.7) : THREE.MathUtils.clamp(k.pos.y, -HL + 0.7, -HL + 6);
    k.pos.x = THREE.MathUtils.clamp(k.pos.x, -8, 8);
  }
  separate();

  // --- balón ---
  prevBall.copy(ball.pos);
  ball.noCatchT = Math.max(0, ball.noCatchT - dt); ball.ownT = (ball.ownT || 0) + dt;
  if (ball.owner) {
    const o = ball.owner;
    if (o.keeper) {
      ball.pos.set(o.pos.x + o.face.x * 0.7 * ESCALA, o.pos.y + o.face.y * 0.7 * ESCALA, 1.1 * ESCALA);
      ball.vel.set(0, 0, 0);
    } else {
      const tgt = new THREE.Vector3(o.pos.x + o.face.x * (PR + BR + 0.12), o.pos.y + o.face.y * (PR + BR + 0.12), BR);
      ball.vel.set((tgt.x - ball.pos.x) / dt * 0.5, (tgt.y - ball.pos.y) / dt * 0.5, 0);
      ball.pos.lerp(tgt, Math.min(1, dt * 22));
      ball.pos.z = BR + Math.abs(Math.sin(o.walk)) * 0.08;
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
        if (a.dashT > 0 && dd < PR * 2 + 0.5 && ball.ownT > 0.7) { giveBall(a); a.dashT = 0; sfx.steal(); showBanner('¡ROBO!', a.team === 0 ? 'bAzul' : 'bRojo', 700); }
      } else if (!ball.owner && d < PR + BR + 0.15 && ball.pos.z < 1.3 * ESCALA) {
        const sp = Math.hypot(ball.vel.x, ball.vel.y);
        if (sp < 24 || a.dashT > 0) { giveBall(a); a.dashT = 0; }
        else { collideCircle2D(a.pos.x, a.pos.y, PR, 0.4); ball.lastTouch = a; }
      }
    }
    keeperContact(gkA); keeperContact(gkB);
    // gol: el balón entero cruza la línea entre postes y bajo el larguero
    if (Math.abs(ball.pos.x) < GW && ball.pos.z < GH) {
      if (ball.pos.y > HL + BR) goalScored(0);
      else if (ball.pos.y < -HL - BR) goalScored(1);
    }
  }
  if (S.mode === 'goal' && !ball.owner) { const n = 4; for (let i = 0; i < n; i++) stepBall(dt / n, ball.pos.clone()); }

  // --- UI botón ---
  const hasBall = ball.owner === user;
  btn.classList.toggle('entrada', !hasBall);
  btnTxt.textContent = hasBall ? 'CHUTAR' : 'ENTRADA';
  cargaAro.style.strokeDashoffset = String(289 * (1 - (input.shootDown ? input.charge : user.dashCd > 0 && !hasBall ? 1 - user.dashCd / 0.8 : 0)));
}

function render(dt) {
  for (const a of actors) a.sync(dt, S.t);
  ballMesh.position.copy(g2t(ball.pos.x, ball.pos.y, ball.pos.z));
  const v = new THREE.Vector3(ball.vel.x, 0, -ball.vel.y); const sp = v.length();
  if (ball.owner && !ball.owner.keeper) { v.set(ball.owner.vel.x, 0, -ball.owner.vel.y); }
  const vs = v.length();
  if (vs > 0.05) { const axis = new THREE.Vector3(0, 1, 0).cross(v).normalize(); ballMesh.rotateOnWorldAxis(axis, vs * dt / BR); }
  ballShadow.position.set(ball.pos.x, 0.025, -ball.pos.y);
  const h = ball.pos.z - BR; ballShadow.scale.setScalar(Math.max(0.4, 1 - h * 0.08)); ballShadow.material.opacity = Math.max(0.08, 0.35 - h * 0.03);
  // flecha de apuntado
  if (input.shootDown && ball.owner === user) {
    aimArrow.visible = true; aimArrow.position.copy(g2t(user.pos.x, user.pos.y, 0.05));
    aimArrow.rotation.y = Math.atan2(-user.face.x, user.face.y);
    aimArrow.scale.set(1, 1, 0.6 + 2.4 * input.charge);
    aimArrow.children[0].material.color.setHSL(0.13 - 0.13 * input.charge, 1, 0.55);
  } else aimArrow.visible = false;
  renderer.render(scene, camera);
}

let last = performance.now(), fpsAcc = 0, fpsN = 0;
window.__game.fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { window.__game.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (S.mode !== 'menu' && S.mode !== 'end') update(dt); else { for (const a of actors) a.vel.multiplyScalar(0.8); }
  render(dt);
}

// ===================== INICIO =====================
(async function init() {
  try {
    const [campo, conazo, calcetrol] = await Promise.all([load('assets/campo.glb'), load('assets/conazo.glb'), load('assets/calcetrol.glb')]);
    scene.add(matte(campo.scene));
    const mk = (g) => matte(g.scene.clone(true));
    user = new Actor(mk(conazo), 0, false, 0x3d8bff);
    rival = new Actor(mk(calcetrol), 1, false, 0xff4040);
    gkA = new Actor(mk(conazo), 0, true, 0x9cc4ff);
    gkB = new Actor(mk(calcetrol), 1, true, 0xffa0a0);
    actors = [user, rival, gkA, gkB];
    // flecha del jugador controlado
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 3), new THREE.MeshBasicMaterial({ color: 0x3d8bff }));
    tri.rotation.x = Math.PI; tri.position.y = 2.75 * ESCALA; user.root.add(tri); user.marker = tri;
    ballMesh = makeBall(); scene.add(ballMesh);
    ballShadow = blob(BR * 1.25, 0.35); scene.add(ballShadow);
    aimArrow = new THREE.Group();
    const shape = new THREE.Shape(); shape.moveTo(-0.22, 0.9); shape.lineTo(0.22, 0.9); shape.lineTo(0.22, 2.0); shape.lineTo(0.5, 2.0); shape.lineTo(0, 2.7); shape.lineTo(-0.5, 2.0); shape.lineTo(-0.22, 2.0); shape.closePath();
    const am = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    am.renderOrder = 3;
    aimArrow.add(am); aimArrow.visible = false; scene.add(aimArrow);
    // arrow apunta a -Z local (frente del personaje)
    am.rotation.set(-Math.PI / 2, 0, 0);
    user.place(0, -3.2); rival.place(0, 3.2); gkA.place(0, -HL + 0.9); gkB.place(0, HL - 0.9);
    layout();
    document.getElementById('cargando').classList.add('oculto');
    window.__game.ready = true;
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    document.getElementById('cargando').textContent = 'Error cargando: ' + err.message;
  }
})();
