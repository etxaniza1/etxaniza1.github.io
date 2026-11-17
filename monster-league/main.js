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
const HW = 19, HL = 24;                    // medio ancho / medio largo entre líneas (campo v5 38×48 m)
const WX = 21.2, WY = 28.0;                // cara interior de las vallas (RUN_X 2.2 / RUN_Y 3.3)
const GW = 5.0, POST_X = 5.28, POST_R = 0.28, GH = 4.0, GD = 2.8;   // v6: portería de caja (techo horizontal)
const NET_X = POST_X - 0.11, NET_Z = GH - 0.08;   // caras interiores de la red (laterales / techo)
const BR = 0.35;                           // radio del balón (un pelín mayor que el 0,30 del glb para que se lea en móvil)
// update 14: física del balón más realista. Gravedad algo por encima de 9,81 (balón y personajes a escala ×1,3) para que pese;
// rozamiento del aire cuadrático (a = -k·|v|·v), bote con restitución 0,65 y pérdida por fricción en el impacto, rodadura en césped.
const GRAV = 11;
const AIR_K = 0.0065, ROLL_DRAG = 0.45, ROLL_DECEL = 1.2, BOUNCE_E = 0.65, BOUNCE_MIN = 0.9;
const GK_REACH = 2.0, GK_REACH_DIVE = 1.6;   // altura de alcance del portero (×ESCALA): de pie+salto / en estirada
const PR = 0.6 * ESCALA;                   // radio de colisión del jugador
const SPEED_USER = 7.6, SPEED_AI = 6.3, SPEED_GK = 5.6;
const DRIBBLE_T = 0.32, DRIBBLE_CD = 1.5, DRIBBLE_SPEED = 13.5;
const DASH_T = 0.26, DASH_CD_USER = 1.1, DASH_CD_AI = 2.0, DASH_SPEED = 16, DASH_MISS_STUN = 0.42;
const TURBO_MULT = 1.38, TURBO_DRAIN = 1 / 2.5, TURBO_REGEN = 1 / 4.2, TURBO_MIN = 0.1;
const g2t = (x, y, z = 0) => new THREE.Vector3(x, z, -y);   // juego -> three (Y-up)
// personajes jugables (glb con rig + animaciones) y parámetros de animación (anim_meta.json, exportado desde Blender)
const ASSET_V = 'v=29';   // cache busting de modelos y tarjetas
// update 27: badges (retratos ilustrados) del selector. Añadir la clave aquí y el archivo assets/badges/<clave>.webp
// (recortado con rig/badge.py). Los personajes sin badge siguen con su tarjeta de siempre.
const BADGES = ['conazo', 'calcetrol', 'buton', 'lobo', 'zorro', 'gecko', 'rino', 'turtobola', 'conejo', 'carnero', 'pepi', 'mofeta', 'pantera', 'murcielago', 'ladri'];
const CHARS = [
  { key: 'conazo', name: 'CONAZO', color: '#F2751A' },
  { key: 'calcetrol', name: 'CALCETROL', color: '#E5343A', toon: true },   // update 22: nuevo modelo Tripo (mismo id/stats/carta)
  { key: 'buton', name: 'BUTÓN', color: '#F8B715' },
  { key: 'lobo', name: 'LOBO', color: '#3B4FA8', toon: true },   // update 29: nuevo modelo Tripo (lobo de verdad)
  { key: 'zorro', name: 'ZORRO', color: '#E2552D', toon: true },
  { key: 'gecko', name: 'GECKO', color: '#58A83A', toon: true },
  { key: 'rino', name: 'RINO', color: '#7C838B' },
  { key: 'turtobola', name: 'TURTOBOLA', color: '#1F7A5A', toon: true },   // update 20: personaje nuevo (Tripo)
  { key: 'conejo', name: 'CONEJO ANTENA', color: '#7A5CCF', toon: true },   // update 22: personaje nuevo (Tripo)
  { key: 'carnero', name: 'DJ CARNERO', color: '#2E2B3A', toon: true },     // update 22: personaje nuevo (Tripo)
  { key: 'pepi', name: 'PEPI', color: '#5E7D1C', toon: true },              // update 22: Pepi el pepinillo (Tripo)
  { key: 'mofeta', name: 'BADGER MOFETA', color: '#A23CC4', toon: true },  // update 25: Badger Mofeta (Tripo m9)
  { key: 'pantera', name: 'PANTERA', color: '#1E8FB8', toon: true },       // update 29: Black Panther (Tripo)
  { key: 'murcielago', name: 'MURCIÉLAGO', color: '#B3263A', toon: true }, // update 29: Vampire Bat (Tripo)
  { key: 'ladri', name: 'LADRI', color: '#C4502A', toon: true },           // update 29: Ladri el ladrillo (Tripo)
].map((c) => ({ scale: 1, file: `assets/${c.key}_anim.glb?${ASSET_V}`, card: `assets/cards/${c.key}.png?${ASSET_V}`,
  badge: BADGES.includes(c.key) ? `assets/badges/${c.key}.webp?${ASSET_V}` : null, ...c }));
// ===================== STATS DE PERSONAJE (update 17) =====================
// Escala 1-100. ATAQUE: vel (velocidad), tir (potencia de tiro), pre (precisión/control), reg (regate).
// DEFENSA: ent (entrada/robo), fis (físico: aguantar entradas y choques), ref (reflejos: su portero).
// Todos suman 556 puntos (nadie es mejor en total); la MEDIA premia la especialidad (como en las cartas de fútbol).
const STATS = {
  conazo: { vel: 80, tir: 80, pre: 82, reg: 79, ent: 78, fis: 78, ref: 79, pos: 'MC', lema: 'Equilibrado: hace de todo bien' },
  calcetrol: { vel: 84, tir: 74, pre: 80, reg: 92, ent: 74, fis: 66, ref: 86, pos: 'EXT', lema: 'Escurridizo: se estira y se escapa' },
  buton: { vel: 64, tir: 86, pre: 74, reg: 66, ent: 84, fis: 95, ref: 87, pos: 'DFC', lema: 'Un muro: no hay quien lo mueva' },
  lobo: { vel: 88, tir: 78, pre: 76, reg: 80, ent: 88, fis: 74, ref: 72, pos: 'MCD', lema: 'Cazador: rápido y muerde en la presión' },
  zorro: { vel: 86, tir: 72, pre: 90, reg: 88, ent: 70, fis: 64, ref: 86, pos: 'MP', lema: 'Astuto: precisión y engaño' },
  gecko: { vel: 93, tir: 66, pre: 78, reg: 90, ent: 76, fis: 60, ref: 93, pos: 'EI', lema: 'Eléctrico: el más rápido, tiro flojo' },
  turtobola: { vel: 64, tir: 80, pre: 72, reg: 59, ent: 90, fis: 96, ref: 95, pos: 'POR', lema: 'Blindado: lento, pero bajo palos no pasa nada' },
  conejo: { vel: 82, tir: 68, pre: 92, reg: 88, ent: 70, fis: 60, ref: 96, pos: 'MCO', lema: 'Señal perfecta: lo capta todo antes que nadie' },
  carnero: { vel: 72, tir: 90, pre: 78, reg: 84, ent: 76, fis: 90, ref: 66, pos: 'SD', lema: 'Pincha el ritmo: aguanta, gira y suelta el bajo' },
  pepi: { vel: 92, tir: 72, pre: 74, reg: 92, ent: 80, fis: 58, ref: 88, pos: 'ED', lema: 'Avinagrado: rápido, escurridizo y siempre de mal humor' },
  mofeta: { vel: 66, tir: 78, pre: 72, reg: 62, ent: 94, fis: 96, ref: 88, pos: 'DFC', lema: 'Muro apestoso: nadie quiere acercarse' },
  rino: { vel: 70, tir: 94, pre: 68, reg: 64, ent: 86, fis: 92, ref: 82, pos: 'DC', lema: 'Ariete: el cañón más fuerte' },
  pantera: { vel: 92, tir: 90, pre: 80, reg: 84, ent: 72, fis: 70, ref: 68, pos: 'DC', lema: 'Sombra letal: aparece de la nada y la clava' },
  murcielago: { vel: 94, tir: 70, pre: 76, reg: 93, ent: 78, fis: 58, ref: 87, pos: 'EI', lema: 'Cazador nocturno: vuela por la banda y nadie lo toca' },
  ladri: { vel: 64, tir: 76, pre: 74, reg: 62, ent: 94, fis: 96, ref: 90, pos: 'DFC', lema: 'Muro de ladrillo: por aquí no pasa ni el aire' },
};
const STAT_KEYS = ['vel', 'tir', 'pre', 'reg', 'ent', 'fis', 'ref'];
const STAT_NAMES = { vel: 'VELOCIDAD', tir: 'TIRO', pre: 'PRECISIÓN', reg: 'REGATE', ent: 'ENTRADA', fis: 'FÍSICO', ref: 'REFLEJOS' };
for (const k in STATS) {
  const t = STATS[k], all = STAT_KEYS.map((x) => t[x]), top3 = [...all].sort((a, b) => b - a).slice(0, 3);
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  t.atq = Math.round(avg([t.vel, t.tir, t.pre, t.reg])); t.def = Math.round(avg([t.ent, t.fis, t.ref]));
  t.media = Math.round(0.75 * avg(top3) + 0.25 * avg(all) - 3);
  t.rareza = t.media >= 84 ? 'oro' : t.media >= 78 ? 'plata' : 'bronce';
}
// efecto moderado en el juego: 65 -> ×(1-amp), 80 -> ×1, 95 -> ×(1+amp)
function statF(v, amp = 0.15) { return THREE.MathUtils.clamp(1 + amp * (v - 80) / 15, 1 - amp, 1 + amp); }
function actorStats(a) {
  const t = STATS[a.charKey] || STATS.conazo;
  return { t, vel: statF(t.vel), tir: statF(t.tir, 0.12), reg: statF(t.reg), ent: statF(t.ent), fis: statF(t.fis), ref: statF(t.ref), jitterDeg: (100 - t.pre) * 0.09 };
}
const GLB = {};          // key -> gltf
let META = {};           // key -> metadatos de animación
const USER_KICK_DELAY = 0;   // update 12: 0 = el balón sale en el mismo frame (la animación arranca en el impacto)
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

// ===================== AJUSTES + CALIDAD (update 10, rendimiento update 11) =====================
const AJ_KEY = 'ml_ajustes_v1', AJ_VER = 13;
const IS_TOUCH = (navigator.maxTouchPoints || 0) > 0 || matchMedia('(pointer: coarse)').matches;
// lod: fracción de triángulos de los personajes en partida (simplificación meshopt en tiempo de carga; el menú usa el modelo completo)
// shadowEvery: el mapa de sombras se recalcula cada N frames (luz fija, solo se mueven jugadores y balón)
const QUALITY = {
  baja:  { label: 'Baja',  pr: () => Math.min(DPR(), 1),   prFloor: 0.75, shadow: 0,    soft: false, aniso: 1,  lod: 0.2,  lodErr: 0.012 },
  media: { label: 'Media', pr: () => Math.min(DPR(), 1.5), prFloor: 1,    shadow: 0,    soft: false, aniso: 4,  lod: 0.35, lodErr: 0.006 },
  alta:  { label: 'Alta',  pr: () => Math.min(DPR(), 2),   prFloor: 1,    shadow: 2048, soft: true,  aniso: 16, lod: 1,    shadowEvery: 2 },
  ultra: { label: 'Ultra', pr: () => Math.min(DPR(), 3),   prFloor: 1,    shadow: 4096, soft: true,  aniso: 16, lod: 1,    shadowEvery: 1 },
};
const DEFAULT_QUALITY = IS_TOUCH ? 'media' : 'alta';
function DPR() { return window.devicePixelRatio || 1; }
function loadAjustes() {
  let a = null;
  try { a = JSON.parse(localStorage.getItem(AJ_KEY) || 'null'); } catch (_) { a = null; }
  if (!a || typeof a !== 'object') a = {};
  // migración v10 -> v11: en la v10 'alta' era el valor por defecto y no se distinguía si el usuario la había elegido.
  // Baja/Media/Ultra sí eran elecciones explícitas y se respetan; 'alta' sin marca de elección pasa al nuevo defecto.
  if ((a.ver || 10) < 11) { if (a.quality === 'alta' && !a.qSet) a.quality = DEFAULT_QUALITY; a.ver = 11; }
  if (!QUALITY[a.quality]) a.quality = DEFAULT_QUALITY;
  a.opacity = Math.max(0.3, Math.min(1, +a.opacity || 1));
  a.showFps = !!a.showFps;
  // update 13: el apuntado con mini-joystick vuelve a ser lo normal. Se elimina 'aimManual' (v12) y nadie se queda sin apuntado;
  // la opción nueva 'instantTap' (disparo instantáneo al tocar, sin apuntar) empieza apagada.
  if ((a.ver || 0) < 13) { delete a.aimManual; a.instantTap = false; a.ver = 13; }
  a.instantTap = !!a.instantTap;
  // update 15: asistencia de apuntado (fricción de mira sobre la portería) activada por defecto
  if ((a.ver || 0) < 15) { a.aimAssist = true; a.ver = 15; }
  a.aimAssist = a.aimAssist !== false;
  a.swipeShot = !!a.swipeShot;
  a.especiales = a.especiales !== false;   // update 29: especiales activados por defecto   // update 24: chut por deslizamiento (apagado por defecto)
  if (!a.ctrl || typeof a.ctrl !== 'object') a.ctrl = {};
  return a;
}
function saveAjustes() { try { localStorage.setItem(AJ_KEY, JSON.stringify(AJ)); } catch (_) {} }
const AJ = loadAjustes();
const editor = { view: 'con', savedCls: null, on: false, from: null, draft: null, opa: 1, sel: null, drag: null };
// estado del ajuste automático: pila de pasos aplicados (para poder deshacerlos si sobra rendimiento)
const QS = { prStep: 0, shadowLevel: 0, lowSecs: 0, highSecs: 0, steps: 0, hist: [], upLocked: false, disabled: false };
const _texSeen = new Set();
function applyTextureQuality(root) {
  const q = QUALITY[AJ.quality];
  const maxA = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
  const an = Math.max(1, Math.min(maxA, q.aniso));
  const roots = root ? [root] : [scene, ...Object.values(GLB || {}).map((g) => g && g.scene).filter(Boolean)];
  for (const r of roots) r.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'aoMap', 'metalnessMap']) {
      const t = m[k]; if (!t || !t.isTexture) continue;
      if (t.anisotropy !== an || t.minFilter !== THREE.LinearMipmapLinearFilter) {
        t.anisotropy = an; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
      }
      _texSeen.add(t);
    }
  });
}
function shadowFlags(root, cast, receive) {
  if (!root) return;
  root.traverse((o) => { if (o.isMesh && !o.userData.outline && !(o.material && o.material.isMeshBasicMaterial && !(o.material.userData && o.material.userData.toon))) { o.castShadow = cast; o.receiveShadow = receive && !(o.material.userData && o.material.userData.toon); } });
}
// sombras: nivel 0 = las de la calidad; 1 = sin suavizado; 2 = 1024 px; 3 = solo sombra "blob"
function shadowSize() {
  const q = QUALITY[AJ.quality];
  if (!q.shadow || QS.shadowLevel >= 3) return 0;
  return QS.shadowLevel >= 2 ? Math.min(q.shadow, 1024) : q.shadow;
}
function targetPixelRatio() {
  const q = QUALITY[AJ.quality], top = q.pr();
  return Math.max(Math.min(top, q.prFloor), top - 0.25 * QS.prStep);
}
renderer.shadowMap.autoUpdate = false;   // se marca needsUpdate desde render() cada shadowEvery frames
let shadowEvery = 1;
function applyQuality(reason) {
  const q = QUALITY[AJ.quality];
  const pr = targetPixelRatio();
  if (Math.abs(renderer.getPixelRatio() - pr) > 1e-3) { renderer.setPixelRatio(pr); if (typeof layout === 'function' && reason !== 'init') { try { layout(); } catch (_) {} } }
  const size = shadowSize();
  const on = size > 0;
  // r187: PCFSoftShadowMap ya no existe; PCFShadowMap filtra con shadow.radius (suavizado real)
  const type = THREE.PCFShadowMap, soft = q.soft && QS.shadowLevel < 1;
  const changed = renderer.shadowMap.enabled !== on || renderer.shadowMap.type !== type || (on && sun.shadow.mapSize.x !== size);
  renderer.shadowMap.enabled = on; renderer.shadowMap.type = type;
  sun.castShadow = on;
  shadowEvery = Math.max(1, (q.shadowEvery || 1) + (QS.shadowLevel >= 2 ? 1 : 0));
  if (on) {
    sun.shadow.mapSize.set(size, size);
    const c = sun.shadow.camera, E = 38;
    c.left = -E; c.right = E; c.top = E; c.bottom = -E; c.near = 1; c.far = 160; c.updateProjectionMatrix();
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = soft ? (AJ.quality === 'ultra' ? 4 : 3) : 1;
    sun.position.set(-0.384, 0.743, 0.548).multiplyScalar(70);
    renderer.shadowMap.needsUpdate = true;
  }
  if (changed) {
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) m.needsUpdate = true; });
  }
  // sombras "blob" bajo los personajes: más suaves si hay sombra real (siguen dando contacto con el suelo)
  let acts = []; try { acts = actors; } catch (_) {}
  for (const a of acts) { if (a.shadow) a.shadow.material.opacity = on ? 0.16 : 0.3; applyLOD(a); }
  OUTLINE_MAT.visible = AJ.quality !== 'baja';   // update 20: contorno caricatura apagado en Baja
  applyTextureQuality();
  window.__game && (window.__game.quality = { level: AJ.quality, pixelRatio: renderer.getPixelRatio(), shadows: on ? size : 0, soft: on && soft, shadowEvery: on ? shadowEvery : 0, lod: q.lod, fallbackSteps: QS.steps, prStep: QS.prStep, shadowLevel: QS.shadowLevel });
  try { updateFpsMeter(); } catch (_) {}
}
function setQuality(level, explicit = true) {
  if (!QUALITY[level]) return;
  AJ.quality = level; if (explicit) AJ.qSet = true;
  Object.assign(QS, { prStep: 0, shadowLevel: 0, lowSecs: 0, highSecs: 0, steps: 0, hist: [], upLocked: false });
  saveAjustes(); applyQuality();
}
// Ajuste automático (todas las calidades, solo en partida): FPS < 45 durante 3 s seguidos -> un paso abajo
// (primero sombras: suavizado -> 1024 -> solo blob; luego resolución en pasos de 0.25 hasta 1.0, 0.75 en Baja).
// Si después va sobrado (>= 58 FPS durante 10 s) deshace un paso; si vuelve a caer, ya no sube más (sin oscilar).
function qualityStepDown() {
  const q = QUALITY[AJ.quality];
  if (q.shadow && QS.shadowLevel < 3) { QS.shadowLevel++; QS.hist.push('s'); return true; }
  if (renderer.getPixelRatio() > Math.min(q.pr(), q.prFloor) + 0.01) { QS.prStep++; QS.hist.push('p'); return true; }
  return false;
}
function qualityTick(fps) {
  if (QS.disabled) return;
  if (S.mode === 'menu' || S.mode === 'end' || S.paused || document.hidden) { QS.lowSecs = QS.highSecs = 0; return; }
  QS.lowSecs = fps < 45 ? QS.lowSecs + 1 : 0;
  QS.highSecs = fps >= 58 ? QS.highSecs + 1 : 0;
  if (QS.lowSecs >= 3) {
    QS.lowSecs = 0;
    if (QS.hist.wasUp) QS.upLocked = true;
    QS.hist.wasUp = false;
    if (qualityStepDown()) { QS.steps++; applyQuality('fallback'); }
  } else if (QS.highSecs >= 10 && QS.hist.length && !QS.upLocked) {
    QS.highSecs = 0;
    const k = QS.hist.pop(); if (k === 's') QS.shadowLevel--; else QS.prStep--;
    QS.hist.wasUp = true; QS.steps++;
    applyQuality('fallback-up');
  }
}

// ---- LOD de personajes (meshopt simplifier, se carga aparte; si no está listo se usa el modelo completo) ----
let Simplifier = null;
const simplifierReady = import('./vendor/addons/libs/meshopt_simplifier.module.js?v=20')
  .then((m) => m.MeshoptSimplifier.ready.then(() => { Simplifier = m.MeshoptSimplifier; try { for (const a of actors) applyLOD(a); } catch (_) {} }))
  .catch((e) => { console.info('LOD no disponible', e && e.message); });
const _lodCache = new Map();
function lodGeometry(src, ratio, err) {
  if (!Simplifier || ratio >= 0.999 || !src.index) return src;
  const key = src.uuid + '|' + ratio;
  let g = _lodCache.get(key);
  if (g) return g;
  const P = src.attributes.position, n = P.count, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i); }
  const idx = new Uint32Array(src.index.count);
  for (let i = 0; i < idx.length; i++) idx[i] = src.index.getX(i);
  const target = Math.max(3, Math.floor(idx.length * ratio / 3) * 3);
  const [out] = Simplifier.simplify(idx, pos, 3, target, err, []);
  if (out.length >= idx.length * 0.95) { _lodCache.set(key, src); return src; }
  g = new THREE.BufferGeometry();
  for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);   // atributos compartidos (misma subida a GPU)
  g.setIndex(new THREE.BufferAttribute(n < 65536 ? new Uint16Array(out) : out, 1));
  if (src.boundingBox) g.boundingBox = src.boundingBox.clone();
  if (src.boundingSphere) g.boundingSphere = src.boundingSphere.clone();
  g.userData.lodOf = src.uuid;
  _lodCache.set(key, g);
  return g;
}
function applyLOD(a) {
  if (!a || !a.model) return;
  const q = QUALITY[AJ.quality];
  a.model.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.userData.srcGeom || (o.userData.srcGeom = o.geometry);
    const g = lodGeometry(src, q.lod, q.lodErr || 0.006);
    if (o.geometry !== g) o.geometry = g;
    if (o.material && (o.material.userData?.toon || o.material.userData?.outline || (Array.isArray(o.material) && o.material[0]?.userData?.toon))) ensureSmoothN(g);
  });
}
// MeshPhysicalMaterial (KHR_materials_specular) -> MeshStandardMaterial: con rugosidad 1 se ve igual y el shader es más barato
function toStandard(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const conv = (m) => {
      if (!m || !m.isMeshPhysicalMaterial) return m;
      const n = new THREE.MeshStandardMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(n, m);
      n.roughness = 1; n.metalness = 0;
      return n;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}
// Campo: todas las mallas estáticas opacas sin textura se fusionan en UNA malla con color por vértice (51 draw calls -> 1)
const NET_MESHES = [];
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const keep = (o) => { for (let p = o; p && p !== root; p = p.parent) if (/^(Marcador|Texto_Marcador)/.test(p.name)) return true; return false; };
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || Array.isArray(o.material)) return;
    const m = o.material;
    if (!m.isMeshStandardMaterial || m.transparent || m.map || m.vertexColors || m.alphaTest > 0 || keep(o) || !o.geometry.attributes.normal) return;
    if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0) return;
    if (/^net$/i.test(m.name || '')) { NET_MESHES.push(o); return; }   // update 16: la red se deforma, va aparte
    list.push(o);
  });
  if (list.length < 2) return 0;
  let nv = 0, ni = 0;
  for (const o of list) { const g = o.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), I = new Uint32Array(ni);
  const v = new THREE.Vector3(), mtx = new THREE.Matrix4(), nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  for (const o of list) {
    const g = o.geometry, pa = g.attributes.position, na = g.attributes.normal, c = o.material.color;
    mtx.multiplyMatrices(inv, o.matrixWorld); nm.getNormalMatrix(mtx);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(mtx); P.set([v.x, v.y, v.z], (vo + i) * 3);
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N.set([v.x, v.y, v.z], (vo + i) * 3);
      C[(vo + i) * 3] = c.r; C[(vo + i) * 3 + 1] = c.g; C[(vo + i) * 3 + 2] = c.b;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) I[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < pa.count; i++) I[io++] = i + vo;
    vo += pa.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.setIndex(new THREE.BufferAttribute(I, 1));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'Campo_Fusionado'; mesh.receiveShadow = true;
  for (const o of list) { o.removeFromParent(); o.geometry.dispose(); }
  root.add(mesh);
  return list.length;
}

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
  G:  { layout: 'brawl', D: 20.3, H: 23.5, pitch: 45, fov: 50, lookOff: 3.2, follow: true, viewLen: 27.5, behind: 12.5, ahead: 18.5, aheadPlay: 7.5, showBoard: false },
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
  if (cfg.follow && ball && (S.mode === 'play' || S.mode === 'kickoff' || S.mode === 'goal' || S.mode === 'out' || S.mode === 'end')) {
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
  if (cfg.follow && user && (S.mode === 'play' || S.mode === 'kickoff' || S.mode === 'goal' || S.mode === 'out' || S.mode === 'end')) {
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

// Tamaño real de la pantalla de juego.
// · Pantalla completa (Fullscreen API) o app en inicio (standalone/fullscreen display-mode): el área visible es
//   la ventana entera -> innerWidth/innerHeight (visualViewport puede llegar con valores viejos tras el cambio).
// · Navegador normal: visualViewport (excluye la barra del navegador que tapaba los botones).
function isFullscreenLike() {
  if (document.fullscreenElement || document.webkitFullscreenElement) return true;
  if (window.navigator.standalone) return true;
  try {
    return matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  } catch (_) { return false; }
}
function viewportBox() {
  const vv = window.visualViewport;
  const iw = window.innerWidth, ih = window.innerHeight;
  const de = document.documentElement;
  if (isFullscreenLike() || !vv) {
    const w = Math.max(1, Math.round(iw || de.clientWidth));
    const h = Math.max(1, Math.round(ih || de.clientHeight));
    return { w, h, ox: 0, oy: 0 };
  }
  let w = Math.round(vv.width), h = Math.round(vv.height);
  // visualViewport con orientación vieja (Chrome Android al girar/entrar en fullscreen): no fiarse si no cuadra
  if (!w || !h || (w > h) !== (iw > ih) || w > iw + 2 || h > ih + 2) { w = iw; h = ih; return { w, h, ox: 0, oy: 0 }; }
  return { w: Math.max(1, w), h: Math.max(1, h), ox: vv.offsetLeft || 0, oy: vv.offsetTop || 0 };
}
let lastVP = '';
function fitVisualViewport() {
  const { w, h, ox, oy } = viewportBox();
  lastVP = `${w}x${h}@${ox},${oy}|${window.innerWidth}x${window.innerHeight}|${isFullscreenLike() ? 1 : 0}`;
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
  document.body.classList.toggle('pantalla-completa', isFullscreenLike());
}
// clave barata para detectar cambios de tamaño que no avisan con evento (se mira en cada frame)
function vpKey() {
  const { w, h, ox, oy } = viewportBox();
  return `${w}x${h}@${ox},${oy}|${window.innerWidth}x${window.innerHeight}|${isFullscreenLike() ? 1 : 0}`;
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
  applyControls();
}
function onViewportChange() {
  layout();
  if (typeof layoutMenu === 'function') layoutMenu();
  if (typeof updateOrient === 'function') updateOrient();
}
// Re-encaje en todos los cambios de pantalla, y otra vez unos ms después: al entrar en pantalla completa
// o girar el móvil, Android/iOS mandan el evento antes de tener el tamaño final.
let relayoutTimers = [];
function onViewportChangeLate() {
  onViewportChange();
  relayoutTimers.forEach(clearTimeout);
  relayoutTimers = [60, 180, 400, 800, 1500].map((ms) => setTimeout(onViewportChange, ms));
}
window.addEventListener('resize', onViewportChange);
window.addEventListener('orientationchange', onViewportChangeLate);
document.addEventListener('fullscreenchange', onViewportChangeLate);
document.addEventListener('webkitfullscreenchange', onViewportChangeLate);
if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', onViewportChangeLate);
try { matchMedia('(display-mode: standalone)').addEventListener('change', onViewportChangeLate); } catch (_) {}
try { matchMedia('(display-mode: fullscreen)').addEventListener('change', onViewportChangeLate); } catch (_) {}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', onViewportChange);
  window.visualViewport.addEventListener('scroll', onViewportChange);
}
if (window.ResizeObserver) new ResizeObserver(() => { if (vpKey() !== lastVP) onViewportChange(); }).observe(document.documentElement);

// ===================== ESTILO CARICATURA (update 20, rehecho en update 21) =====================
// Personajes Tripo (toon:true): textura a plena luz (sin la iluminación del campo) + sombreado cel de 2 tonos suave
// (conserva el volumen) + contorno negro limpio. Las normales del sombreado y del contorno son normales SUAVIZADAS
// (promedio por posición, ignorando costuras UV/aristas duras), con skinning: sin grietas ni manchas en las costuras.
// Contorno: casco invertido desplazado en espacio de pantalla -> grosor constante (~2 px), más fino de lejos.
// No se tocan los modelos: solo materiales/atributos en three.js. El contorno se apaga en calidad Baja.
const TOON = { shadow: 0.74, px: 2.0, near: 16, minK: 0.55, outline: { value: new THREE.Vector4(0.004, 0.008, 16, 0.55) } };
// normales suavizadas por posición (atributo 'oNormal'); se calcula una vez por geometría (también en las de LOD)
function ensureSmoothN(g) {
  if (!g || g.attributes.oNormal || !g.attributes.normal) return g;
  const P = g.attributes.position, N = g.attributes.normal, n = P.count, map = new Map(), out = new Float32Array(n * 3);
  const key = (i) => `${Math.round(P.getX(i) * 2e3)},${Math.round(P.getY(i) * 2e3)},${Math.round(P.getZ(i) * 2e3)}`;
  const acc = []; const id = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = key(i); let a = map.get(k);
    if (a === undefined) { a = acc.length; map.set(k, a); acc.push([0, 0, 0]); }
    id[i] = a; const v = acc[a]; v[0] += N.getX(i); v[1] += N.getY(i); v[2] += N.getZ(i);
  }
  for (let i = 0; i < n; i++) {
    const v = acc[id[i]], l = Math.hypot(v[0], v[1], v[2]) || 1;
    out[i * 3] = v[0] / l; out[i * 3 + 1] = v[1] / l; out[i * 3 + 2] = v[2] / l;
  }
  g.setAttribute('oNormal', new THREE.BufferAttribute(out, 3));
  return g;
}
const SMOOTH_NORMAL_VS = 'vec3 objectNormal = oNormal;\n#ifdef USE_TANGENT\n\tvec3 objectTangent = vec3( tangent.xyz );\n#endif';
function toonPatch(m) {
  m.toneMapped = false; m.userData.toon = true;
  const u = m.userData.toonU = { uToonShadow: { value: TOON.shadow }, uDye: { value: new THREE.Color(1, 1, 1) }, uDyeAmt: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute vec3 oNormal;\nvarying vec3 vToonN;\nvoid main() {')
      .replace('#include <beginnormal_vertex>', SMOOTH_NORMAL_VS)
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n#ifdef USE_SKINNING\n\tvToonN = normalize( transformedNormal );\n#else\n\tvToonN = normalize( normalMatrix * oNormal );\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec3 vToonN;\nuniform float uToonShadow;\nuniform float uDyeAmt;\nuniform vec3 uDye;\nvoid main() {')
      .replace('vec3 outgoingLight = reflectedLight.indirectDiffuse;', `vec3 outgoingLight = reflectedLight.indirectDiffuse;
	vec3 tn = normalize( vToonN );
	float nl = dot( tn, normalize( vec3( -0.45, 0.62, 0.64 ) ) );
	float fw = max( fwidth( nl ), 0.02 );
	float lit = smoothstep( 0.08 - fw, 0.08 + fw, nl );           // 2 tonos con borde nítido pero antialias
	float rim = smoothstep( 0.0, 0.35, tn.z );                    // los bordes que se curvan se oscurecen un poco (volumen)
	outgoingLight *= mix( uToonShadow, 1.0, lit ) * mix( 0.9, 1.0, rim );
	float lumT = dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) );
	outgoingLight = mix( outgoingLight, uDye * ( 0.3 + 1.1 * lumT ), uDyeAmt );`);
  };
  m.customProgramCacheKey = () => 'mlToon21';
  return m;
}
function makeToonMat(src) {
  const m = new THREE.MeshBasicMaterial({ map: src.map || null, color: 0xffffff, side: src.side, transparent: false });
  m.name = src.name; return toonPatch(m);
}
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x101116, side: THREE.BackSide, toneMapped: false });
OUTLINE_MAT.userData.outline = true;
OUTLINE_MAT.onBeforeCompile = (sh) => {
  sh.uniforms.uOutline = TOON.outline;
  sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute vec3 oNormal;\nuniform vec4 uOutline;\nvoid main() {')
    .replace('#include <beginnormal_vertex>', SMOOTH_NORMAL_VS)
    .replace('#include <project_vertex>', `#include <project_vertex>
	#ifdef USE_SKINNING
		vec3 onrm = normalize( transformedNormal );
	#else
		vec3 onrm = normalize( normalMatrix * oNormal );
	#endif
	#ifdef FLIP_SIDED
		onrm = - onrm;   // BackSide invierte transformedNormal: el casco debe salir HACIA FUERA (en v20 iba hacia dentro -> manchas)
	#endif
	vec2 cn = ( projectionMatrix * vec4( onrm, 0.0 ) ).xy; float cl = length( cn );
	float kd = clamp( uOutline.z / max( gl_Position.w, 0.01 ), uOutline.w, 1.0 );   // más fino de lejos
	if ( cl > 1e-5 ) gl_Position.xy += cn / cl * uOutline.xy * kd * gl_Position.w;
	gl_Position.z += 0.0004 * gl_Position.w;`);
};
OUTLINE_MAT.customProgramCacheKey = () => 'mlOutline21';
// grosor del contorno en píxeles del destino (pantalla o render target de los retratos)
function setOutlinePx(w, h, px = TOON.px) { TOON.outline.value.set((2 * px) / Math.max(1, w), (2 * px) / Math.max(1, h), TOON.near, TOON.minK); }
const _dbs = new THREE.Vector2();
function syncOutline() { renderer.getDrawingBufferSize(_dbs); setOutlinePx(_dbs.x, _dbs.y, TOON.px * Math.max(1, renderer.getPixelRatio() * 0.85)); }
function applyToon(model, key) {
  const c = CHARS.find((x) => x.key === key); if (!c || !c.toon) return model;
  const skinned = []; model.traverse((o) => { if (o.isSkinnedMesh && !o.userData.outline) skinned.push(o); });
  for (const o of skinned) {
    ensureSmoothN(o.geometry);
    o.material = Array.isArray(o.material) ? o.material.map(makeToonMat) : makeToonMat(o.material);
    const ol = new THREE.SkinnedMesh(o.geometry, OUTLINE_MAT);
    ol.bind(o.skeleton, o.bindMatrix); ol.bindMode = o.bindMode; ol.frustumCulled = false; ol.castShadow = false; ol.receiveShadow = false;
    ol.userData.outline = true; ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale);
    o.parent.add(ol); o.userData.outlineMesh = ol;
  }
  return model;
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
    const model = applyToon(matte(SkeletonUtils.clone(GLB[charKey].scene)), charKey);
    model.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
    this.charScale = (CHARS.find((c) => c.key === charKey) || {}).scale || 1;   // multiplicador por personaje (todos 1: alturas igualadas en el modelado)
    model.scale.setScalar(ESCALA * this.charScale);
    this.model = model;
    applyLOD(this);   // menos triángulos en partida según calidad (el menú usa el modelo completo)
    this.body.add(model);
    this.root.add(this.body);
    shadowFlags(model, true, false);
    this.shadow = blob(0.75 * ESCALA, renderer.shadowMap.enabled ? 0.16 : 0.3); this.shadow.position.y = 0.02; this.root.add(this.shadow);
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
    this.sf = actorStats(this); this.dashSp = DASH_SPEED; this.dribSp = DRIBBLE_SPEED;
    this.energy = 1; this.sprinting = false;
    this.kickPending = null; this.kickAnimT = 0; this.tackleT = 0; this.diveT = 0; this.diveClip = null; this.celebrate = false; this.introT = 0;
    this.esp = 0; espReset(this);   // update 29: carga del especial (0-1) y estados de los especiales
  }
  dispose() { this.mixer.stopAllAction(); scene.remove(this.root); }
  place(x, y) {
    this.pos.set(x, y); this.vel.set(0, 0); this.face.set(0, this.team === 0 ? 1 : -1);
    this.yaw = Math.atan2(this.face.x, -this.face.y);
    this.dashT = 0; this.stun = 0; this.kickT = 0; this.dribbleT = 0; this.dashCd = 0; this.dribbleCd = 0;
    this.dashHit = false; this.dashEnded = false; this.sprinting = false;
    this.kickPending = null; this.kickAnimT = 0; this.tackleT = 0; this.diveT = 0; this.celebrate = false;
    espReset(this); if (typeof espGhostVis === 'function') espGhostVis(this, false);
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
    else if (this.introT > 0 && !this.keeper && sp < 0.35 && this.actions.Intro) want = 'Intro';   // update 21: presentación antes del saque
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
    this.yaw += d * Math.min(1, dt * (this === user ? 26 : 14));
    this.root.position.copy(g2t(this.pos.x, this.pos.y));
    this.root.rotation.y = this.yaw;
    this.kickAnimT = Math.max(0, this.kickAnimT - dt);
    this.tackleT = Math.max(0, this.tackleT - dt);
    if (this.introT > 0) this.introT = this.vel.lengthSq() > 0.12 ? 0 : Math.max(0, this.introT - dt);
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

const ball = { pos: new THREE.Vector3(0, 0, BR), vel: new THREE.Vector3(), owner: null, noCatch: null, noCatchT: 0, lastTouch: null, backspin: 0, w: new THREE.Vector3(), fx: { curve: 0, lift: 0, dip: 0 } };
let ballMesh, ballShadow, aimArrow, ballGhost, aimLine;

// ===================== ESTADO =====================
let user, rival, gkA, gkB, actors = [];
const S = { paused: false, mode: 'menu', score: [0, 0], time: DURACION, pauseT: 0, kickoffTeam: 0, t: 0, goals: 0, saves: 0, shots: 0 };
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
const btnChutar = document.getElementById('btnChutar'), btnRegate = document.getElementById('btnRegate'), btnAlto = document.getElementById('btnAlto');
const btnEntrada = document.getElementById('btnEntrada'), btnTurbo = document.getElementById('btnTurbo');
const btnEspecial = document.getElementById('btnEspecial'), cargaEspecial = document.getElementById('cargaEspecial');   // update 29
const cargaAro = document.getElementById('carga'), cargaRegate = document.getElementById('cargaRegate'), cargaAlto = document.getElementById('cargaAlto');
const cargaEntrada = document.getElementById('cargaEntrada'), cargaTurbo = document.getElementById('cargaTurbo');
let joyId = null, joyCx = 0, joyCy = 0, joyHome = { x: 84, y: 0 }, joyScale = 1;
// Caché de geometría de los controles: se mide SOLO al recolocar (layout/resize/editor), nunca en cada toque ni en cada frame
const RC = { app: null, zona: null, btn: new Map() };
function cacheCtrlRects() {
  RC.app = app.getBoundingClientRect(); RC.zona = joyZona.getBoundingClientRect(); RC.btn.clear();
  for (const el of [btnChutar, btnRegate, btnAlto, btnEntrada, btnTurbo, btnEspecial]) RC.btn.set(el, el.getBoundingClientRect());
}
const appRect = () => RC.app || (RC.app = app.getBoundingClientRect());
const zonaRect = () => RC.zona || (RC.zona = joyZona.getBoundingClientRect());
const btnRect = (el) => RC.btn.get(el) || el.getBoundingClientRect();
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
  joyHome = customJoyHome(joyHome, zr);
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
const swallow = (e) => { if (e.cancelable !== false) e.preventDefault(); };   // sin aviso si el navegador ya no permite cancelar
// update 25: los paneles con scroll (ajustes, tienda, colección, torneo/liga) SÍ se desplazan con el dedo.
// Antes este preventDefault global en touchmove bloqueaba cualquier scroll táctil (AJUSTES no bajaba en el móvil).
const SCROLL_SEL = '.ajCaja, .tiCaja, .coLado, .coCuadro, .coLiga, #coCuerpo, .scrollPanel';
function inScroller(t) {
  const el = t && t.closest ? t.closest(SCROLL_SEL) : null;
  for (let e = el; e && e !== document.body; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) return true; }
  return false;
}
document.addEventListener('touchmove', (e) => { if (e.touches.length === 1 && inScroller(e.target)) return; swallow(e); }, { passive: false });
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
  if (joyId !== null || editor.on) return;
  if (e.target.closest && e.target.closest('.btnAccion')) return;
  joyId = e.pointerId;
  try { joyZona.setPointerCapture(e.pointerId); } catch (_) {}
  const r = zonaRect(); setJoy(e.clientX - r.left, e.clientY - r.top);
  e.preventDefault();
});
joyZona.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joyId) return;
  const r = zonaRect();
  let dx = e.clientX - r.left - joyCx, dy = e.clientY - r.top - joyCy;
  const L = Math.hypot(dx, dy), M = 52 * joyScale;
  if (L > M) { dx *= M / L; dy *= M / L; }
  joyPunta.style.transform = `translate(${dx / joyScale}px,${dy / joyScale}px)`;
  const n = Math.min(1, L / M);
  input.jx = L > 6 ? dx / M : 0; input.jy = L > 6 ? -dy / M : 0;
  if (n < 0.12) { input.jx = 0; input.jy = 0; }
});
const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; input.jx = input.jy = 0; joyPunta.style.transform = ''; setJoy(joyHome.x, joyHome.y); };
joyZona.addEventListener('pointerup', joyEnd); joyZona.addEventListener('pointercancel', joyEnd);

// ---- CHUTAR / REGATE estilo Brawl Stars ----
// Toque corto: acción rápida hacia donde apunta el joystick de mover (o la portería rival / auto si no hay dirección).
// Mantener: aparece un mini joystick en el botón; arrastrando apuntas (y en el chut, la distancia = potencia);
// al soltar se ejecuta. Volver al centro cancela. Independiente del joystick de mover (multitáctil).
const AIM_TAP_MS = 180, AIM_SHOW_MS = 110;
const aimJoy = document.getElementById('aimJoy'), aimKnob = document.getElementById('aimKnob');
const aim = { id: null, kind: null, el: null, cx: 0, cy: 0, t0: 0, dragged: false, shown: false, dx: 0, dy: 0, R: 60, dir: new THREE.Vector2(0, 1), power: 0, cancel: false, active: false };
function aimRadius(el) { const r = btnRect(el); return Math.max(46, Math.min(84, r.width * 0.95)); }
function aimDeadPx() { return THREE.MathUtils.clamp(aim.R * 0.16, 10, 12); }   // zona muerta ~10-12 px
function showAimJoy(on) {
  aim.shown = on;
  if (!aimJoy) return;
  if (on) {
    const ar = appRect();
    aimJoy.style.width = aimJoy.style.height = (aim.R * 2) + 'px';
    aimJoy.style.left = (aim.cx - ar.left - aim.R) + 'px';
    aimJoy.style.top = (aim.cy - ar.top - aim.R) + 'px';
    aimJoy.className = 'on ' + aim.kind; aimJoy._z = '';
    if (aim.kind === 'alto') {   // zonas del chut alto en el anillo: suave / perfecta / alta, según la distancia al centro
      const d0 = aimDeadPx() / aim.R, f = (c) => ((d0 + c * (1 - d0)) * 100).toFixed(1) + '%';
      aimJoy.style.setProperty('--z0', f(0)); aimJoy.style.setProperty('--z1', f(ALTO_PERFECT[0])); aimJoy.style.setProperty('--z2', f(ALTO_PERFECT[1]));
    }
  } else { aimJoy.className = ''; aimJoy._z = ''; aimKnob.style.transform = ''; }
}
function aimUpdateFromPointer(x, y) {
  let dx = x - aim.cx, dy = y - aim.cy;
  const L = Math.hypot(dx, dy);
  if (L > aimDeadPx()) aim.dragged = true;
  const k = L > aim.R ? aim.R / L : 1;
  aim.dx = dx * k; aim.dy = dy * k;
  if (aimKnob) aimKnob.style.transform = `translate(${aim.dx}px,${aim.dy}px)`;
  aim.cancel = aim.dragged && L < aimDeadPx();
  if (L > 1) {   // pantalla arriba = hacia la portería rival (+y), cámara G mira a +y
    const raw = Math.atan2(-dy, dx);
    const w = AJ.aimAssist && aim.dragged && (aim.kind === 'chutar' || aim.kind === 'alto') ? goalWindow() : null;
    if (w && aim.rawAng !== undefined) {
      // update 15: fricción de mira. Si la dirección pasa por la portería rival, el giro del dedo cuenta al 45 % y hay un leve imán
      // hacia el centro (proporcional al movimiento: si no mueves el dedo no se mueve sola). Fuera de la portería vuelve con el dedo.
      const d = wrapAng(raw - aim.rawAng);
      let a = aim.ang;
      if (angIn(a, w)) { a += d * AIM_FRICTION; a += wrapAng(w.c - a) * Math.min(AIM_MAGNET, Math.abs(d) * 1.2); }
      else a += d + wrapAng(raw - (a + d)) * 0.35;
      aim.ang = wrapAng(a);
    } else aim.ang = raw;
    aim.rawAng = raw;
    aim.onGoal = !!(w && angIn(aim.ang, w));
    aim.dir.set(Math.cos(aim.ang), Math.sin(aim.ang));
  }
  if (aimJoy) aimJoy.classList.toggle('porteria', !!aim.onGoal && !aim.cancel);
  aim.power = THREE.MathUtils.clamp((Math.min(L, aim.R) - aimDeadPx()) / (aim.R - aimDeadPx()), 0, 1);
  if (aim.kind === 'alto' && aimJoy) {
    const z = !aim.dragged || aim.cancel ? '' : aim.power < ALTO_PERFECT[0] ? 'zSuave' : aim.power <= ALTO_PERFECT[1] ? 'zPerfecta' : 'zAlta';
    if (aimJoy._z !== z) { aimJoy.classList.remove('zSuave', 'zPerfecta', 'zAlta'); if (z) aimJoy.classList.add(z); aimJoy._z = z; }
  }
  if (aimJoy) aimJoy.classList.toggle('cancel', aim.cancel);
}
const AIM_FRICTION = 0.45, AIM_MAGNET = 0.1, AIM_GOAL_MARGIN = 0.6;
function wrapAng(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
function angIn(a, w) { return wrapAng(a - w.lo) >= 0 && wrapAng(w.hi - a) >= 0; }
// abanico de direcciones desde el balón que pasan entre los postes de la portería rival (con un pequeño margen)
function goalWindow() {
  if (!user) return null;
  const gy = goalCenter(user.team).y, px = ball.pos.x, py = ball.pos.y, s = Math.sign(gy);
  if ((gy - py) * s < 0.5) return null;
  const a1 = Math.atan2(gy - py, -(GW + AIM_GOAL_MARGIN) - px), a2 = Math.atan2(gy - py, GW + AIM_GOAL_MARGIN - px);
  return s > 0 ? { lo: a2, hi: a1, c: Math.atan2(gy - py, -px) } : { lo: a1, hi: a2, c: Math.atan2(gy - py, -px) };
}
function moveDir() {
  const d = new THREE.Vector2(input.jx, input.jy);
  if (input.keys.u) d.y += 1; if (input.keys.d) d.y -= 1; if (input.keys.l) d.x -= 1; if (input.keys.r) d.x += 1;
  return d.lengthSq() > 0.04 ? d.normalize() : null;
}
function quickShot() {
  if (S.mode !== 'play' || ball.owner !== user || user.kickPending) return false;
  let dir = moveDir();
  if (!dir) dir = goalCenter(user.team).sub(user.pos);          // sin dirección: a portería rival
  shoot(user, dir, 0.72, true); LOG('tiro_rapido', user, {});
  return true;
}
function aimedShot(dir, p) {
  if (S.mode !== 'play' || ball.owner !== user) return false;
  shoot(user, dir.clone(), 0.35 + 0.65 * p, false); LOG('tiro_apuntado', user, { p: +p.toFixed(2) });
  return true;
}
function lobDir() {   // CHUT ALTO sin arrastrar: dirección del joystick de mover o portería rival
  const md = moveDir();
  return md || goalCenter(user.team).sub(user.pos).normalize();
}
function quickLob(c = 0) {   // toque = vaselina suave mínima (update 14: ya no hay 'globo medio' por toque rápido)
  if (S.mode !== 'play' || ball.owner !== user || user.kickPending) return false;
  shootLob(user, lobDir(), c); return true;
}
function aimedLob(dir, p) {
  if (S.mode !== 'play' || ball.owner !== user) return false;
  shootLob(user, dir.clone(), p); return true;
}
// ---- Acciones del jugador (update 13) ----
// Por defecto (como v10/v11): CHUTAR / REGATE / CHUT ALTO con mini-joystick estilo Brawl. Toque corto = acción rápida al SOLTAR
// (sin umbral de tiempo) hacia el joystick de mover; al salir de la zona muerta (~11 px) aparece al instante el joystick de
// apuntar con la flecha; volver al centro cancela. Mantener quieto también lo abre. CHUT ALTO (update 14): la carga sube desde
// el toque (~1,1 s al 100 %, zona perfecta 45-60 %) y el mini-joystick solo da la dirección; un toque = vaselina suave. Opción 'Disparo instantáneo al tocar': Chutar/Regate en el pointerdown, sin apuntar. Si la acción no es posible aún (sin balón, enfriamiento),
// se guarda 150 ms en un buffer y se ejecuta en cuanto se pueda.
const INPUT_BUFFER_MS = 150;
function altoCharge(t0) { return THREE.MathUtils.clamp((performance.now() - t0 - 60) / 1000 / ALTO_CHARGE_S, 0, 1); }   // 60 ms de margen: un toque = vaselina mínima
function doAction(kind, b) {
  if (S.mode !== 'play' || !user || S.paused) return false;
  if (kind === 'swipe') return swipeShoot(b.m);
  if (kind === 'chutar') return quickShot();
  if (kind === 'regate') return ball.owner === user && !user.kickPending ? tryDribble(user) : false;
  if (kind === 'alto') return quickLob();
  if (kind === 'entrada') return tryDash(user);
  return false;
}
function bufferAction(kind) { input.buf = { kind, until: performance.now() + INPUT_BUFFER_MS }; }
function runBuffer() {
  const b = input.buf; if (!b) return;
  if (performance.now() > b.until) { input.buf = null; return; }
  if (doAction(b.kind, b)) input.buf = null;
}
// ---- medidor de latencia (del pointerdown al cambio de velocidad del balón o del jugador) ----
const LAT = { pending: false, kind: '', t0: 0, sp0: 0, bv0: 0, until: 0 };
const LAT_NAMES = { chutar: 'Chutar', regate: 'Regate', alto: 'Chut alto', entrada: 'Entrada', turbo: 'Turbo' };
function markAction(kind, e) {
  const now = performance.now();
  let t0 = e && typeof e.timeStamp === 'number' ? e.timeStamp : now;
  if (!(t0 > now - 2000 && t0 <= now + 1)) t0 = now;   // navegadores con timeStamp no comparable
  Object.assign(LAT, { pending: true, kind, t0, sp0: user ? user.vel.length() : 0, bv0: Math.hypot(ball.vel.x, ball.vel.y, ball.vel.z), own0: ball.owner, until: now + 1500 });
}
function checkLatency() {
  if (!LAT.pending) return;
  const now = performance.now();
  if (now > LAT.until) { LAT.pending = false; return; }
  const bv = Math.hypot(ball.vel.x, ball.vel.y, ball.vel.z), sp = user ? user.vel.length() : 0;
  const ballMoved = LAT.own0 === user && ball.owner !== user && Math.abs(bv - LAT.bv0) > 1;
  const userMoved = Math.abs(sp - LAT.sp0) > 0.5;
  if (!(ballMoved || userMoved)) return;
  LAT.pending = false;
  window.__game.lastAction = { kind: LAT.kind, ms: Math.round(now - LAT.t0) };
  updateFpsMeter(true);
}
function aimEnd(e, cancelAll) {
  if (aim.id === null || (e && e.pointerId !== aim.id)) return;
  const el = aim.el, kind = aim.kind;
  if (e) aimUpdateFromPointer(e.clientX, e.clientY);
  const quick = !aim.dragged;
  // latencia: con mini-joystick la acción sale al SOLTAR, así que se mide desde el pointerup
  if (e && !cancelAll && !aim.cancel) markAction(kind, e);
  if (!cancelAll && !aim.cancel) {
    if (kind === 'chutar') { if (quick) quickShot(); else aimedShot(aim.dir, aim.power); }
    else if (kind === 'alto') aimedLob(quick ? lobDir() : aim.dir, quick ? 0 : aim.power);   // update 16: carga = distancia del mini-joystick al centro; toque = vaselina mínima
    else { if (quick) tryDribble(user); else tryDribble(user, aim.dir); }
  } else if (aim.cancel) LOG('apuntado_cancelado', user, { kind });
  el.classList.remove('pulsado', 'apuntando');
  aim.id = null; aim.kind = null; aim.el = null; aim.active = false; aim.cancel = false; aim.dragged = false; aim.onGoal = false;
  showAimJoy(false);
}
function bindAim(el, kind) {
  const instIds = new Set();
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.pointerId === joyId) return;
    if (AJ.swipeShot && kind === 'chutar') { swipeStart(e, el); return; }   // update 24: chut por deslizamiento
    const instant = AJ.instantTap && (kind === 'chutar' || kind === 'regate');
    if (instant) {
      markAction(kind, e);
      instIds.add(e.pointerId);
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      el.classList.add('pulsado');
      if (!doAction(kind)) bufferAction(kind);
      return;
    }
    if (aim.id !== null) return;
    if (S.mode !== 'play' || !user || ball.owner !== user || user.kickPending) { bufferAction(kind); return; }   // aún sin balón: toque rápido en buffer
    const r = btnRect(el);
    Object.assign(aim, { id: e.pointerId, kind, el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, t0: performance.now(), dragged: false, shown: false, dx: 0, dy: 0, R: aimRadius(el), power: 0, cancel: false, active: true, rawAng: undefined, onGoal: false });
    const md = moveDir(); aim.dir.copy(md || (kind !== 'regate' ? goalCenter(user.team).sub(user.pos).normalize() : user.face));
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    el.classList.add('pulsado');
  });
  const up = (e) => { if (instIds.delete(e.pointerId) && !instIds.size && aim.el !== el) el.classList.remove('pulsado'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
window.addEventListener('pointermove', (e) => {
  if (aim.id === null || e.pointerId !== aim.id) return;
  aimUpdateFromPointer(e.clientX, e.clientY);
  if (aim.dragged && !aim.shown) { showAimJoy(true); aim.el.classList.add('apuntando'); }
}, { passive: true });
window.addEventListener('pointerup', (e) => aimEnd(e));
window.addEventListener('pointercancel', (e) => aimEnd(e, true));
for (const el of [btnChutar, btnRegate, btnAlto, btnEntrada, btnTurbo, btnEspecial, joyZona]) el.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
bindAim(btnChutar, 'chutar');
bindAim(btnRegate, 'regate');
bindAim(btnAlto, 'alto');
bindHold(btnEntrada, (e) => { btnEntrada.classList.add('pulsado'); markAction('entrada', e); if (!doAction('entrada')) bufferAction('entrada'); }, () => btnEntrada.classList.remove('pulsado'));
bindHold(btnEspecial, (e) => { markAction('especial', e); btnEspecial.classList.add('pulsado'); if (S.mode === 'play' && !S.paused) espUse(user); }, () => btnEspecial.classList.remove('pulsado'));   // update 29
bindHold(btnTurbo, (e) => { markAction('turbo', e); input.turboDown = true; btnTurbo.classList.add('pulsado'); turboKick(); }, () => { input.turboDown = false; btnTurbo.classList.remove('pulsado'); });

// ---- CHUT POR DESLIZAMIENTO (update 24, opción de AJUSTES; apagado por defecto) ----
// Un solo gesto sustituye a CHUTAR + CHUT ALTO: se desliza el dedo desde el botón CHUTAR o desde la zona derecha libre.
//  · dirección del desliz = dirección del tiro (pantalla arriba = portería rival). Con la asistencia de apuntado activada,
//    un leve imán hacia el centro de la portería cuando el desliz ya pasa entre los postes.
//  · VELOCIDAD del desliz (pico en una ventana de 70 ms) = potencia.
//  · LONGITUD del desliz = altura: corto = tiro raso/tenso, medio = chut a media altura, largo = vaselina/globo.
//  · un toque sin deslizar (< zona muerta) = tiro rápido como hasta ahora. Rastro blanco como respuesta (sin colores de acierto).
// Las longitudes y velocidades se miden en fracciones del lado corto de la pantalla -> mismo gesto en móvil grande o pequeño.
const SW = { DEAD: 0.045, LEN0: 0.10, LEN1: 0.62, V0: 0.7, V1: 3.6, WIN: 70, RAS: 0.18, MAG: 0.25 };
const swipe = { id: null, el: null, pts: [], last: null };
const trailCv = document.getElementById('swipeTrail'), trailCx = trailCv ? trailCv.getContext('2d') : null;
const trail = { pts: [], rel: 0, live: false, dpr: 1 };
function swipeRef() { const r = appRect(); return Math.max(240, Math.min(r.width || 390, r.height || 390)); }
// mapeo puro (lo usan las pruebas): pts = [{x, y, t}] en px de pantalla y ms; ref = lado corto en px
function swipeMap(pts, ref = swipeRef()) {
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) / ref;
  let v = 0, j = 0;
  for (let i = 1; i < pts.length; i++) {
    while (j < i - 1 && pts[i].t - pts[j + 1].t >= SW.WIN) j++;
    const dt = Math.max(35, pts[i].t - pts[j].t);   // ventana mínima: un par de eventos casi simultáneos no dan un pico falso
    v = Math.max(v, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) / ref / (dt / 1000));
  }
  if (pts.length === 2) v = len / (Math.max(35, b.t - a.t) / 1000);
  const tap = len < SW.DEAD;
  const power = THREE.MathUtils.clamp((v - SW.V0) / (SW.V1 - SW.V0), 0, 1);
  const height = THREE.MathUtils.clamp((len - SW.LEN0) / (SW.LEN1 - SW.LEN0), 0, 1);
  return { tap, len: +len.toFixed(3), v: +v.toFixed(2), power: +power.toFixed(3), height: +height.toFixed(3), ang: Math.atan2(-dy, dx), ...swipeShotParams(power, height) };
}
// potencia (0-1) y altura (0-1) -> tiro. Raso: chut normal con poca elevación. Alto: velocidad horizontal y vertical directas.
function swipeShotParams(power, height) {
  if (height < SW.RAS) return { kind: 'raso', pw: 0.22 + 0.78 * power, vz: 0.4 + 2.0 * power * power + 3.0 * height };
  const e = (height - SW.RAS) / (1 - SW.RAS);
  return { kind: e < 0.45 ? 'medio' : 'alto', pw: 0.3 + 0.7 * power, hs: (12 + 19 * power) * (1 - 0.32 * e), vz: 2.6 + 9.4 * e };
}
function swipeDir(m) {
  let ang = m.ang;
  const w = AJ.aimAssist ? goalWindow() : null;
  if (w && angIn(ang, w)) ang += wrapAng(w.c - ang) * SW.MAG;
  return new THREE.Vector2(Math.cos(ang), Math.sin(ang));
}
function swipeShoot(m) {
  if (S.mode !== 'play' || ball.owner !== user || user.kickPending) return false;
  if (m.tap) return quickShot();
  const dir = swipeDir(m);
  if (m.kind === 'raso') shoot(user, dir, m.pw, false, m.vz);
  else shoot(user, dir, m.pw, false, m.vz, m.hs);
  window.__game.lastSwipe = m;
  LOG('chut_desliz', user, { k: m.kind, p: m.power, h: m.height, len: m.len, v: m.v });
  return true;
}
function swipeStart(e, el) {
  if (swipe.id !== null || e.pointerId === joyId) return false;
  if (S.mode !== 'play' && S.mode !== 'kickoff') return false;
  swipe.id = e.pointerId; swipe.el = el;
  swipe.pts = [{ x: e.clientX, y: e.clientY, t: e.timeStamp || performance.now() }];
  try { el.setPointerCapture(e.pointerId); } catch (_) {}
  if (el === btnChutar) el.classList.add('pulsado');
  const ar = appRect(); trail.pts = [{ x: e.clientX - ar.left, y: e.clientY - ar.top, t: performance.now() }]; trail.live = true; trail.rel = 0;
  return true;
}
function swipeMove(e) {
  if (e.pointerId !== swipe.id) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null, list = evs && evs.length ? evs : [e];
  const ar = appRect();
  for (const q of list) {
    swipe.pts.push({ x: q.clientX, y: q.clientY, t: q.timeStamp || e.timeStamp || performance.now() });
    trail.pts.push({ x: q.clientX - ar.left, y: q.clientY - ar.top, t: performance.now() });
  }
  if (swipe.pts.length > 240) swipe.pts.splice(1, swipe.pts.length - 240);
}
function swipeEnd(e, cancel) {
  if (swipe.id === null || (e && e.pointerId !== swipe.id)) return;
  if (e && !cancel) swipeMove(e);
  const el = swipe.el; if (el) el.classList.remove('pulsado');
  const pts = swipe.pts; swipe.id = null; swipe.el = null; swipe.pts = [];
  trail.live = false; trail.rel = performance.now();
  if (cancel || !pts.length) return;
  const m = swipeMap(pts.length > 1 ? pts : [pts[0], pts[0]]);
  swipe.last = m; window.__game.lastSwipeMap = m;
  if (e) markAction('chutar', e);
  if (!swipeShoot(m)) input.buf = { kind: 'swipe', m, until: performance.now() + INPUT_BUFFER_MS };
}
window.addEventListener('pointermove', swipeMove, { passive: true });
window.addEventListener('pointerup', (e) => swipeEnd(e));
window.addEventListener('pointercancel', (e) => swipeEnd(e, true));
const swipeZona = document.getElementById('swipeZona');
if (swipeZona) {
  swipeZona.addEventListener('pointerdown', (e) => { if (!AJ.swipeShot || editor.on || !document.body.classList.contains('enPartido') || S.mode === 'menu' || S.mode === 'end') return; e.preventDefault(); swipeStart(e, swipeZona); });
  swipeZona.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
}
// rastro blanco del dedo (se dibuja en cada frame; se desvanece en ~0,35 s al soltar)
function drawTrail() {
  if (!trailCx) return;
  const now = performance.now();
  const W = app.clientWidth, H = app.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (trailCv.width !== Math.round(W * dpr) || trailCv.height !== Math.round(H * dpr)) { trailCv.width = Math.round(W * dpr); trailCv.height = Math.round(H * dpr); }
  if (!trail.pts.length) { if (trail.drawn) { trailCx.clearRect(0, 0, trailCv.width, trailCv.height); trail.drawn = false; } return; }
  const fade = trail.live ? 1 : 1 - (now - trail.rel) / 350;
  trailCx.setTransform(dpr, 0, 0, dpr, 0, 0); trailCx.clearRect(0, 0, W, H);
  if (fade <= 0) { trail.pts = []; trail.drawn = false; return; }
  const pts = trail.live ? trail.pts.filter((p) => now - p.t < 260) : trail.pts.slice(-28);
  if (trail.live && pts.length < 2 && trail.pts.length) pts.unshift(trail.pts[trail.pts.length - 1]);
  trailCx.lineCap = 'round'; trailCx.lineJoin = 'round';
  for (let i = 1; i < pts.length; i++) {
    const k = i / (pts.length - 1);
    trailCx.strokeStyle = `rgba(255,255,255,${(0.15 + 0.8 * k) * fade})`;
    trailCx.lineWidth = 3 + 11 * k;
    trailCx.shadowColor = 'rgba(255,255,255,0.6)'; trailCx.shadowBlur = 10 * k * fade;
    trailCx.beginPath(); trailCx.moveTo(pts[i - 1].x, pts[i - 1].y); trailCx.lineTo(pts[i].x, pts[i].y); trailCx.stroke();
  }
  const h = pts[pts.length - 1];
  if (h) { trailCx.shadowBlur = 14 * fade; trailCx.fillStyle = `rgba(255,255,255,${0.9 * fade})`; trailCx.beginPath(); trailCx.arc(h.x, h.y, 8, 0, Math.PI * 2); trailCx.fill(); }
  trail.drawn = true;
}

const keyMap = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
window.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) { input.keys[keyMap[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'Enter') { if (!e.repeat) { if (S.mode === 'menu') menuPlay(); else if (S.mode === 'end') startGame(); else if (e.code === 'Space') pressShoot(); } e.preventDefault(); }
  if (S.mode === 'menu' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !e.repeat) menuStep(e.code === 'ArrowLeft' ? -1 : 1);
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { input.turboDown = true; e.preventDefault(); }
  if (e.code === 'KeyQ' && !e.repeat) { input.qT0 = performance.now(); e.preventDefault(); }
  if ((e.code === 'KeyR' || e.code === 'KeyF') && !e.repeat && S.mode === 'play' && !S.paused) { espUse(user); e.preventDefault(); }   // update 29: ESPECIAL
  if (e.code === 'Escape' && !e.repeat) { if (S.paused) resumeGame(); else openPause(); }
  if (e.code === 'KeyE' && !e.repeat) {
    if (S.mode === 'play') { if (ball.owner === user) tryDribble(user); else tryDash(user); }
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code]) input.keys[keyMap[e.code]] = false;
  if (e.code === 'Space') releaseShoot();
  if (e.code === 'KeyQ' && input.qT0) { const c = altoCharge(input.qT0); input.qT0 = 0; quickLob(c); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.turboDown = false;
});
window.addEventListener('blur', () => { input.keys = {}; input.jx = input.jy = 0; input.turboDown = false; input.qT0 = 0; releaseShoot(true); aimEnd(null, true); });

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
  if (!a || a.dashCd > 0 || a.stun > 0 || a.dribbleT > 0 || a.dashT > 0 || a.freezeT > 0 || a.slipT > 0 || a.chargeT > 0) return false;
  if (ball.owner === a) return false;
  if (a === user) { const md = moveDir(); if (md) a.face.copy(md); }
  a.dashT = DASH_T; a.dashCd = (a === user ? DASH_CD_USER : DASH_CD_AI) / a.sf.ent;
  a.dashSp = DASH_SPEED * a.sf.ent;
  a.vel.copy(a.face).multiplyScalar(a.dashSp);   // impulso inmediato
  a.dashHit = false; a.dashEnded = false;
  a.tackleT = a.meta.Tackle.frames / 30 / TACKLE_RATE; a.play('Tackle', 0.05, true);
  sfx.dash(); LOG('entrada', a, {});
  return true;
}
function tryDribble(a, forceDir) {
  if (!a || ball.owner !== a || a.keeper) return false;
  if (a.dribbleCd > 0 || a.stun > 0 || a.dribbleT > 0 || a.dashT > 0 || a.freezeT > 0 || a.slipT > 0 || a.chargeT > 0) return false;
  const dir = new THREE.Vector2();
  const md = a === user ? moveDir() : null;
  if (forceDir && forceDir.lengthSq() > 0.01) dir.copy(forceDir);
  else if (md) dir.copy(md);
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
  a.dribbleT = DRIBBLE_T; a.dribbleCd = DRIBBLE_CD / a.sf.reg;
  a.dribSp = DRIBBLE_SPEED * a.sf.reg;
  a.vel.copy(dir).multiplyScalar(a.dribSp);   // impulso inmediato
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
function shoot(a, dir, power, assist, loft, hspeed) {
  if (a.kickPending || a.freezeT > 0 || a.slipT > 0) return;
  dir = dir.clone(); if (dir.lengthSq() < 0.01) dir.set(0, a.team === 0 ? 1 : -1);
  dir.normalize();
  a.face.copy(dir);
  const impact = a.meta.Kick.impact / 30 / KICK_RATE;
  // Jugador humano: la animación arranca ya avanzada (se salta la preparación) y el balón sale a los ~70 ms
  // en lugar de ~210 ms -> el chut se siente inmediato. La IA mantiene la animación completa.
  const t = a === user ? Math.min(impact, USER_KICK_DELAY) : impact;
  a.kickAnimT = a.meta.Kick.frames / 30 / KICK_RATE * 0.8 - (impact - t);
  a.play('Kick', a === user ? 0.03 : 0.06, true);
  if (a === user && impact > t) { const k = a.actions.Kick; if (k) k.time = (impact - t) * KICK_RATE; }
  if (a === user && t <= 0) { releaseShot(a, dir, power, assist, loft, hspeed); return; }   // update 12: el balón sale en el mismo frame del toque
  a.kickPending = { dir, power, assist, loft, hspeed, t };
}
function updateKick(a, dt) {
  const k = a.kickPending; if (!k) return;
  a.vel.multiplyScalar(Math.exp(-9 * dt));
  if (ball.owner !== a) { a.kickPending = null; return; }
  k.t -= dt;
  if (k.t <= 0) { a.kickPending = null; releaseShot(a, k.dir, k.power, k.assist, k.loft, k.hspeed); }
}
const _wv = new THREE.Vector3(), _wa = new THREE.Vector3();
function releaseShot(a, dir, power, assist, loft, hspeed) {
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
  let sp = hspeed !== undefined ? hspeed : (13 + 19 * power) * (a.keeper ? 1 : a.sf.tir);   // TIRO: potencia (las vaselinas no cambian)
  if (!a.keeper) {   // PRECISIÓN: pequeña dispersión aleatoria (menos con más precisión; la mitad en vaselinas)
    const j = THREE.MathUtils.degToRad(a.sf.jitterDeg * (hspeed !== undefined ? 0.5 : 1)) * (Math.random() * 2 - 1);
    if (j) dir.rotateAround(new THREE.Vector2(), j);
  }
  const lob = hspeed !== undefined, bfx = a === user ? bootShot(dir, lob) : null;
  if (bfx) { sp *= bfx.speed; if (loft !== undefined) loft *= bfx.speed; if (bfx.jitter) dir.rotateAround(new THREE.Vector2(), bfx.jitter); }
  Object.assign(ball.fx, { curve: bfx ? bfx.curve : 0, lift: bfx ? bfx.lift : 0, dip: bfx ? bfx.dip : 0 });
  ball.owner = null; ball.noCatch = a; ball.noCatchT = 0.35; ball.lastTouch = a;
  if (Math.hypot(ball.pos.x - a.pos.x, ball.pos.y - a.pos.y) < PR + BR * 0.5) ball.pos.set(a.pos.x + dir.x * (PR + BR + 0.15), a.pos.y + dir.y * (PR + BR + 0.15), BR + 0.05);
  ball.pos.z = Math.max(ball.pos.z, BR + 0.05);
  ball.vel.set(dir.x * sp, dir.y * sp, loft !== undefined ? loft : 0.8 + 3.2 * power * power);   // chut normal: raso / poca altura
  if (hspeed !== undefined) ball.pos.z = BR + 0.02;
  // giro: chut raso = rueda hacia delante; chut alto = efecto de retroceso (más en la vaselina suave)
  ball.backspin = hspeed !== undefined ? THREE.MathUtils.clamp(1.1 - hspeed / 28, 0.1, 1) * (bfx ? bfx.backspin : 1) : 0;
  if (bfx && bfx.dip) ball.backspin = 0;
  ball.w.set(0, 1, 0).cross(_wv.set(ball.vel.x, 0, -ball.vel.y)).multiplyScalar((ball.backspin > 0 ? -0.6 * ball.backspin : bfx && bfx.dip ? 0.05 : 0.7) / BR);
  if (ball.fx.curve) ball.w.y += ball.fx.curve * 60;   // giro vertical visible en la rosca
  a.kickT = 0.35; a.face.copy(dir);
  if (a.espDecoy) { espSpawnDecoy(a, a.espDecoy); a.espDecoy = null; }   // update 29: BALÓN TRAMPA
  S.shots++; sfx.kick(power); LOG('tiro', a, { pos: [+a.pos.x.toFixed(1), +a.pos.y.toFixed(1)], vel: [+ball.vel.x.toFixed(1), +ball.vel.y.toFixed(1), +ball.vel.z.toFixed(1)] });
}
function giveBall(a) {
  LOG('posesion', a, { from: ball.owner ? NAME(ball.owner) : null, b: [+ball.pos.x.toFixed(1), +ball.pos.y.toFixed(1), +ball.pos.z.toFixed(1)] });
  if (ball.owner && ball.owner !== a) { const v = ball.owner; v.stun = 0.55 / v.sf.fis; v.kickPending = null; const k = v.pos.clone().sub(a.pos).normalize().multiplyScalar(6); v.vel.copy(k); }
  ball.owner = a; ball.lastTouch = a; ball.vel.set(0, 0, 0); ball.ownT = 0;
}

function moveActor(a, wish, speed, dt) {
  if (a.freezeT > 0) { a.freezeT = Math.max(0, a.freezeT - dt); a.vel.set(0, 0); a.dashCd = Math.max(0, a.dashCd - dt); a.dribbleCd = Math.max(0, a.dribbleCd - dt); return; }   // update 29: BOTÓN DE PAUSA
  if (a.slipT > 0) { a.slipT -= dt; a.vel.copy(a.slipV).multiplyScalar(Math.max(0.25, a.slipT / 1.1)); }   // RESBALÓN: desliza sin control
  else if (a.chargeT > 0) { a.chargeT -= dt; a.vel.copy(a.face).multiplyScalar(17); }   // EMBESTIDA
  else if (a.scaredT > 0 && a.stun <= 0) { a.vel.lerp(a.scaredDir.clone().multiplyScalar(5.5), 1 - Math.exp(-10 * dt)); a.face.copy(a.scaredDir).multiplyScalar(-1); }   // AULLIDO: recula asustado
  else if (a.diveT > 0) {
    a.diveT -= dt; const el = a.diveDur - a.diveT;
    if (el < 0.38) a.vel.copy(a.diveDir).multiplyScalar(7.5 * a.sf.ref * (1 - el / 0.5)); else a.vel.multiplyScalar(Math.exp(-8 * dt));
  } else if (a.stun > 0) { a.stun -= dt; a.vel.multiplyScalar(Math.exp(-6 * dt)); }
  else if (a.dribbleT > 0) { a.dribbleT -= dt; a.vel.copy(a.face).multiplyScalar(a.dribSp); }
  else if (a.dashT > 0) {
    a.dashT -= dt; a.vel.copy(a.face).multiplyScalar(a.dashSp);
    if (a.dashT <= 0) a.dashEnded = true;
  } else {
    const target = wish.clone().multiplyScalar(speed);
    const acc = 1 - Math.exp(-(a === user ? 26 : 14) * a.sf.vel * dt);   // usuario: menos inercia (~40 ms) para que responda ya
    a.vel.lerp(target, acc);
    if (wish.lengthSq() > 0.01) a.face.copy(wish).normalize();
  }
  a.dashCd = Math.max(0, a.dashCd - dt);
  a.dribbleCd = Math.max(0, a.dribbleCd - dt);
  a.kickT = Math.max(0, a.kickT - dt);
  a.pos.addScaledVector(a.vel, dt);
  if (a.slipT > 0 || a.chargeT > 0) { const m0 = PR; if (Math.abs(a.pos.x) > WX - m0 - 0.05 || Math.abs(a.pos.y) > WY - m0 - 0.05) { a.chargeT = 0; if (a.slipV) a.slipV.multiplyScalar(-0.4); } }
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
    if (L < min && L > 1e-4) {   // FÍSICO: el más fuerte desplaza más al otro en los choques
      const wa = a.sf.t.fis, wb = b.sf.t.fis, ka = wb / (wa + wb);
      d.multiplyScalar((min - L) / L); a.pos.addScaledVector(d, -ka); b.pos.addScaledVector(d, 1 - ka);
    }
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
// integración del vuelo (la usa también la predicción de trayectoria, para que coincida con el real)
function airStep(p, v, dt, fx) {
  // rozamiento cuadrático del aire (en las 3 componentes) + gravedad; integración semi-implícita
  const sp = Math.hypot(v.x, v.y, v.z), f = 1 / (1 + AIR_K * sp * dt);
  v.x *= f; v.y *= f; v.z = v.z * f - GRAV * dt;
  // update 15: efecto de las botas. curve = Magnus lateral (a = curve·|v|, perpendicular a la velocidad, giro que se va
  // perdiendo); lift = sustentación por retroceso; dip = 'hoja seca': sin giro, cae de golpe en la bajada
  if (fx && p.z > BR + 0.02) {
    if (fx.curve) { const vx = v.x; v.x -= v.y * fx.curve * dt; v.y += vx * fx.curve * dt; fx.curve *= 1 - 0.35 * dt; }
    if (fx.lift) v.z += fx.lift * dt;
    if (fx.dip && v.z < 0) v.z -= GRAV * fx.dip * dt;
  }
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
}
// predicción del vuelo hasta el primer bote (misma integración que el balón real; sin colisiones)
const _pp = new THREE.Vector3(), _pv = new THREE.Vector3(), _pfx = { curve: 0, lift: 0, dip: 0 };
function predictFlight(pos, vel, out, maxT = 5, h = 1 / 120, fx) {
  _pp.copy(pos); _pv.copy(vel); let t = 0, peak = pos.z;
  const pf = fx ? Object.assign(_pfx, fx) : null;
  if (out) out.length = 0;
  while (t < maxT) {
    airStep(_pp, _pv, h, pf); t += h; peak = Math.max(peak, _pp.z);
    if (out) out.push(_pp.x, _pp.y, _pp.z);
    if (_pp.z <= BR && _pv.z < 0) { _pp.z = BR; break; }
  }
  return { x: _pp.x, y: _pp.y, t, peak, dist: Math.hypot(_pp.x - pos.x, _pp.y - pos.y) };
}
// CHUT ALTO con carga (update 14), 'trompa de elefante': la carga c (0-1) se acumula desde que se toca el botón (~1,1 s al 100 %).
// Poca carga = vaselina suave, lenta, alta y corta. ~50 % (zona perfecta 45-60 %) = chut tenso, rápido y más plano que entra a media
// altura bajo el larguero. Mucha carga = muy rápido y recto pero llega demasiado alto y se va por encima. Al subir la carga sube la
// velocidad, baja el ángulo de salida y (a partir de la mitad) sube la altura con la que llega a la portería.
const ALTO_CHARGE_S = 1.1, ALTO_PERFECT = [0.45, 0.6];
function lobParams(c) {
  c = THREE.MathUtils.clamp(c, 0, 1);
  const v = 10 + 23 * c;
  let s = Math.min(1, c / 0.55); s = s * s * (3 - 2 * s);
  const ang = THREE.MathUtils.degToRad(62 - 42 * s + 1.5 * Math.max(0, c - 0.55) / 0.45);
  return { c, v, ang, h: v * Math.cos(ang), vz: v * Math.sin(ang) };
}
function shootLob(a, dir, c) {
  const lp = lobParams(c);
  shoot(a, dir, 0.3 + 0.7 * lp.c, false, lp.vz, lp.h);
  LOG('chut_alto', a, { c: +lp.c.toFixed(2), v: +lp.v.toFixed(1), ang: Math.round(THREE.MathUtils.radToDeg(lp.ang)) });
}
// ---- RED DE GOL CON FÍSICA (update 16) ----
// La red es un muelle muy amortiguado: el balón la abomba (hasta ~0,7 m), pierde casi toda la velocidad y cae dentro.
// eje 'x' (laterales), 'y' (fondo), 'z' (techo); sgn = sentido hacia fuera; lim = coordenada del plano (con el radio) en ese eje
const NET_K = 140, NET_C = 26, NET_MAXPEN = 0.7;
function netPush(b, ax, sgn, lim, dt, gl, s) {
  const pen = (b.pos[ax] - lim) * sgn; if (pen <= 0) return;
  // update 23: la red está fija en el marco -> cerca de la boca (laterales / techo) apenas cede; al fondo cede del todo
  const depth = (b.pos.y - gl) * s, maxPen = ax === 'y' ? NET_MAXPEN : NET_MAXPEN * THREE.MathUtils.clamp((depth - 0.2) / 1.1, 0.12, 1);
  let vn = b.vel[ax] * sgn;
  vn += (-NET_K * pen - NET_C * vn) * dt;                   // muelle + amortiguación (casi crítica: sin rebote)
  if (pen > maxPen) { b.pos[ax] = lim + sgn * maxPen; vn = Math.min(vn, 0); }   // tope suave (pen nunca salta: el plano tiene signo)
  b.vel[ax] = vn * sgn;
  const f = Math.exp(-5 * dt);                              // la malla agarra el balón: frena lo tangencial
  for (const k of ['x', 'y', 'z']) if (k !== ax && !(k === 'z' && b.vel.z < 0)) b.vel[k] *= f;
  if (ax !== 'z') b.backspin = 0;
  if (b.fx) b.fx.curve = 0;
  netImpact(b, ax, sgn, Math.min(pen, NET_MAXPEN));
}
// deformación visual: impactos con amplitud que sigue al balón mientras empuja y luego oscila amortiguada hasta 0
const NET_FX = { mesh: null, base: null, sideOf: null, imps: [], dirty: false };
function netImpact(b, ax, sgn, pen) {
  let im = NET_FX.imps.find((i) => i.ax === ax && i.sgn === sgn && Math.sign(i.gy) === Math.sign(b.pos.y) && i.push);
  if (!im) { im = { ax, sgn, gy: b.pos.y, amp: 0, vel: 0, push: true, p: new THREE.Vector3(), d: new THREE.Vector3() }; NET_FX.imps.push(im); if (NET_FX.imps.length > 4) NET_FX.imps.shift(); if (pen > 0.05) sfx.bounce && sfx.bounce(); }
  // centro del abombamiento: donde el balón toca el plano de la red (coords three: x, z_juego -> y, -y_juego -> z)
  const gx = b.pos.x, gy = b.pos.y, gz = b.pos.z;
  im.p.set(ax === 'x' ? gx - sgn * pen : gx, ax === 'z' ? gz - pen : gz, -(ax === 'y' ? gy - sgn * pen : gy));
  im.d.set(ax === 'x' ? sgn : 0, ax === 'z' ? 1 : 0, ax === 'y' ? -sgn : 0);
  im.amp = Math.max(im.amp * 0.6, pen + BR * 0.6); im.vel = 0; im.touched = 2;
}
function setupNet() {
  const o = NET_MESHES[0]; if (!o) return;
  o.updateWorldMatrix(true, false);
  const pa = o.geometry.attributes.position, n = pa.count, P = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage));
  if (o.geometry.attributes.normal) { const na = o.geometry.attributes.normal, N = new Float32Array(n * 3), nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld); for (let i = 0; i < n; i++) { v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N.set([v.x, v.y, v.z], i * 3); } g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); }
  g.setIndex(o.geometry.index.clone()); g.computeBoundingSphere();
  const mat = o.material.clone(); mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'Red_Porterias'; mesh.receiveShadow = true; mesh.frustumCulled = false;
  o.removeFromParent(); scene.add(mesh);
  // peso por vértice: la red está fija en el marco (boca de la portería) y en el suelo
  const W = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const depth = Math.abs(-P[i * 3 + 2]) - HL, gz = P[i * 3 + 1];
    W[i] = THREE.MathUtils.clamp(depth / 0.7, 0, 1) * THREE.MathUtils.clamp(gz / 0.5, 0, 1);
  }
  Object.assign(NET_FX, { mesh, base: P.slice(), W });
}
function updateNet(dt) {
  const F = NET_FX; if (!F.mesh) return;
  for (const im of F.imps) {
    if (im.touched > 0) { im.touched--; continue; }     // el balón sigue empujando: la amplitud la marca él
    im.push = false;
    im.vel += (-170 * im.amp - 5 * im.vel) * dt; im.amp += im.vel * dt;   // la malla vuelve oscilando
  }
  F.imps = F.imps.filter((im) => im.push || Math.abs(im.amp) > 0.004 || Math.abs(im.vel) > 0.02);
  if (!F.imps.length && !F.dirty) return;
  const P = F.mesh.geometry.attributes.position.array, B = F.base, W = F.W, n = W.length, R2 = 1 / (1.05 * 1.05);
  P.set(B);
  for (const im of F.imps) {
    const zs = Math.sign(im.p.z);
    for (let i = 0; i < n; i++) {
      const w = W[i]; if (!w) continue;
      const k = i * 3; if (B[k + 2] * zs <= 0) continue;
      const dx = B[k] - im.p.x, dy = B[k + 1] - im.p.y, dz = B[k + 2] - im.p.z, d2 = (dx * dx + dy * dy + dz * dz) * R2;
      if (d2 > 6) continue;
      const a = im.amp * w * Math.exp(-d2);
      P[k] += im.d.x * a; P[k + 1] += im.d.y * a; P[k + 2] += im.d.z * a;
    }
  }
  F.mesh.geometry.attributes.position.needsUpdate = true;
  F.dirty = F.imps.length > 0;
}
function stepBall(dt, prev) {
  const b = ball;
  airStep(b.pos, b.vel, dt, b.fx);
  // suelo: bote con restitución y algo de fricción en el impacto; rodadura con rozamiento
  if (b.pos.z < BR) {
    b.pos.z = BR;
    if (b.vel.z < -BOUNCE_MIN) {
      // bote: restitución 0,65 (menos en impactos fuertes) y fricción con el césped proporcional al golpe; el retroceso 'muerde'
      const vin = -b.vel.z, e = BOUNCE_E - Math.min(0.1, vin * 0.006);
      b.vel.z = vin * e;
      const sp = Math.hypot(b.vel.x, b.vel.y);
      if (sp > 0.01) {
        const loss = Math.min(0.45, 0.3 * (1 + e) * vin / Math.max(sp, 4) + 0.06 + 0.22 * b.backspin);
        b.vel.x *= 1 - loss; b.vel.y *= 1 - loss;
      }
      b.backspin *= 0.35;
      if (vin > 4) sfx.bounce && sfx.bounce();
    } else b.vel.z = 0;
    if (b.fx.dip || b.fx.lift) { b.fx.dip = 0; b.fx.lift = 0; }
    b.fx.curve *= Math.exp(-6 * dt);   // en el suelo el efecto se apaga enseguida
    if (b.vel.z === 0) {
      b.backspin = 0;
      const sp = Math.hypot(b.vel.x, b.vel.y);
      if (sp > 0) {
        const nsp = Math.max(0, sp * Math.exp(-ROLL_DRAG * dt) - ROLL_DECEL * dt);
        if (nsp < 0.12) { b.vel.x = 0; b.vel.y = 0; } else { b.vel.x *= nsp / sp; b.vel.y *= nsp / sp; }
      }
    }
  }
  // vallas (estadio cerrado: rebota también por arriba)
  const e = 0.72;
  if (b.pos.x > WX - BR) { b.pos.x = WX - BR; b.vel.x = -Math.abs(b.vel.x) * e; }
  if (b.pos.x < -WX + BR) { b.pos.x = -WX + BR; b.vel.x = Math.abs(b.vel.x) * e; }
  if (b.pos.y > WY - BR) { b.pos.y = WY - BR; b.vel.y = -Math.abs(b.vel.y) * e; }
  if (b.pos.y < -WY + BR) { b.pos.y = -WY + BR; b.vel.y = Math.abs(b.vel.y) * e; }
  if (b.pos.z > 40) { b.pos.z = 40; b.vel.z = -Math.abs(b.vel.z) * 0.5; }
  // línea de fondo: ¿la cruza entera por la boca (gol) o por fuera / por encima del larguero (fuera)?
  for (const s of [1, -1]) {
    const yl = s * (HL + BR);
    if ((prev.y - yl) * s < 0 && (b.pos.y - yl) * s >= 0 && !b.lineEvent) {
      const t = (yl - prev.y) / ((b.pos.y - prev.y) || 1e-6);
      const xc = prev.x + (b.pos.x - prev.x) * t, zc = prev.z + (b.pos.z - prev.z) * t;
      b.lineEvent = (Math.abs(xc) < GW && zc < GH) ? { type: 'gol', s } : { type: 'fuera', s, z: zc };
    }
  }
  // porterías de caja
  for (const s of [1, -1]) {
    const gl = s * HL, back = s * (HL + GD);
    const inY = (y) => (s > 0 ? (y > gl && y < back) : (y < gl && y > back));
    // postes y larguero
    if (b.pos.z < GH + BR) { if (collideCircle2D(POST_X, gl, POST_R, 0.62) | collideCircle2D(-POST_X, gl, POST_R, 0.62)) { b.vel.z *= 0.9; b.backspin = 0; } }
    if (Math.abs(b.pos.x) < POST_X) {
      const dy = b.pos.y - gl, dz = b.pos.z - GH, L = Math.hypot(dy, dz), min = POST_R + BR;
      if (L < min && L > 1e-5) {
        const ny = dy / L, nz = dz / L; b.pos.y = gl + ny * min; b.pos.z = GH + nz * min;
        const vn = b.vel.y * ny + b.vel.z * nz; if (vn < 0) { b.vel.y -= 1.62 * vn * ny; b.vel.z -= 1.62 * vn * nz; b.vel.x *= 0.9; b.backspin = 0; if (-vn > 3) sfx.kick(0.1); }
      }
    }
    // ¿balón dentro de la portería (incluida la red abombada)? así no se confunde con choques desde fuera
    const inBox = (b.pos.y - gl) * s > 0 && (b.pos.y - back) * s < 0.8 && Math.abs(b.pos.x) < NET_X + 0.8 && b.pos.z < NET_Z + 0.8;
    if (inBox && (inY(prev.y) || b.netGoal === s)) b.netGoal = s; else if (b.netGoal === s && !inBox) b.netGoal = 0;
    const nearY = inY(b.pos.y) || inY(prev.y) || b.netGoal === s;
    if (!nearY) {
      // red trasera desde detrás (balón que vuelve del muro)
      if (Math.abs(b.pos.x) < NET_X && b.pos.z < NET_Z && (prev.y - back) * s >= BR - 0.01 && (b.pos.y - back) * s < BR) {
        b.pos.y = back + s * BR; b.vel.y = s * Math.abs(b.vel.y) * 0.25; b.vel.x *= 0.7;
      }
      continue;
    }
    const wasIn = Math.abs(prev.x) < NET_X && prev.z < NET_Z;
    // dentro de la caja de la red: la malla frena el balón (no vuelve a salir rodando)
    if (Math.abs(b.pos.x) < NET_X && b.pos.z < NET_Z && (b.pos.y - gl) * s > BR) { const f = Math.exp(-3.5 * dt); b.vel.x *= f; b.vel.y *= f; }
    // laterales de red
    for (const sx of [1, -1]) {
      if (b.pos.z >= NET_Z + BR) continue;
      const pIn = Math.abs(prev.x) <= NET_X - BR + 0.01, nIn = Math.abs(b.pos.x) <= NET_X - BR;
      if (((wasIn && pIn) || b.netSide === sx) && !nIn && Math.sign(b.pos.x) === sx && Math.abs(b.pos.x) < NET_X + 0.9) {   // desde dentro: la red se abomba y amortigua
        b.netSide = sx;
        netPush(b, 'x', sx, sx * (NET_X - BR), dt, gl, s);   // update 23: plano con signo (antes +NET_X en ambos lados -> el balón 'saltaba' de un lateral al otro)
      } else if (b.netSide === sx && nIn) { b.netSide = 0; }
      else if (!wasIn && Math.abs(prev.x) >= NET_X + BR - 0.01 && Math.abs(b.pos.x) < NET_X + BR && Math.sign(b.pos.x) === sx) {   // desde fuera
        b.pos.x = sx * (NET_X + BR); b.vel.x = -b.vel.x * 0.3; b.vel.y *= 0.7;
      }
    }
    if (Math.abs(b.pos.x) < NET_X + 0.05) {
      // red trasera (desde dentro): frena en seco y cae
      if (b.pos.z < NET_Z && (b.pos.y - back) * s > -BR) netPush(b, 'y', s, back - s * BR, dt, gl, s);
      // techo desde dentro
      if ((b.pos.y - gl) * s > 0 && b.pos.z > NET_Z - BR && b.pos.z < NET_Z + 0.9 && (prev.z <= NET_Z - BR + 0.01 || b.netRoof)) { b.netRoof = true; netPush(b, 'z', 1, NET_Z - BR, dt, gl, s); }
      else b.netRoof = false;
      // techo desde fuera (vaselina que cae encima): bota poco y rueda hacia atrás
      if (!b.netRoof && prev.z >= NET_Z + BR - 0.02 && b.pos.z < NET_Z + BR) {
        b.pos.z = NET_Z + BR; b.vel.z = Math.abs(b.vel.z) * 0.25; b.vel.x *= 0.7; b.vel.y = b.vel.y * 0.7 + s * 1.2;
        b.onRoof = true;
      }
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
// update 22: bot de campo rehecho. Envoltorio con tiempo de reacción humano (al cambiar la posesión sigue un instante con lo que
// hacía) y dirección suavizada (sin temblores). Respeta al portero rival cuando tiene el balón en las manos (se aleja ≥ 9 m, fuera
// del área, en la línea del saque) y solo vuelve a presionar cuando lo suelta. Presión de contención (lado de su portería, a ~1,5 m)
// en vez de pegarse; tiros con criterio (ángulo/distancia) y errores según su PRECISIÓN. Velocidades sin cambios.
const tmp2 = new THREE.Vector2();
const AI = { keeperGap: 9.0, boxDepth: 10.5, standOff: 1.5, react: [0.16, 0.34] };
function aiField(a, opp, dt) {
  if (!a.aiS) { a.aiS = new THREE.Vector2(); a.aiOwner = ball.owner; a.reactT = 0; }
  if (ball.owner !== a.aiOwner) { a.aiOwner = ball.owner; a.reactT = AI.react[0] + Math.random() * (AI.react[1] - AI.react[0]); }
  a.reactT = Math.max(0, a.reactT - dt);
  const keeperHold = ball.owner && ball.owner.keeper;
  if (a.reactT > 0 && ball.owner !== a && !keeperHold) return a.aiS.clone();   // reacción (no con el portero: se aparta ya)
  const raw = aiFieldRaw(a, opp, dt);
  if (ball.owner === a && a.kickPending) { a.aiS.set(0, 0); return a.aiS.clone(); }
  a.aiS.lerp(raw, 1 - Math.exp(-dt * (ball.owner === a ? 11 : 7.5)));
  if (raw.lengthSq() < 1e-4 && a.aiS.lengthSq() < 0.03) a.aiS.set(0, 0);
  return a.aiS.clone();
}
function aiArrive(a, target, slow = 1.2, stop = 0.35) {   // ir a un punto frenando al llegar (sin oscilar alrededor)
  const w = target.clone().sub(a.pos), L = w.length();
  if (L < stop) return w.set(0, 0);
  return w.multiplyScalar(Math.min(1, L / slow) / L);
}
function aiFieldRaw(a, opp, dt) {
  const wish = new THREE.Vector2();
  const bp = new THREE.Vector2(ball.pos.x, ball.pos.y);
  const atkY = a.team === 0 ? HL : -HL, dirY = Math.sign(atkY), ownY = -atkY;
  const oppGk = a.team === 0 ? gkB : gkA, ownGk = a.team === 0 ? gkA : gkB;
  a.wantTurbo = false;
  if (ball.owner === a) {
    a.pressT = 0;
    if (!a.aimX || Math.random() < dt * 0.4) a.aimX = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4.5);
    const distGoal = Math.abs(atkY - a.pos.y);
    // muy escorado y cerca de la línea: recorta hacia dentro en vez de chutar sin ángulo
    const wide = Math.abs(a.pos.x) > 10 && distGoal < 10;
    const target = new THREE.Vector2(wide ? a.pos.x * 0.3 : a.aimX * 0.6, atkY - dirY * (wide ? 9 : 6));
    wish.copy(target).sub(a.pos).normalize();
    const toOpp = opp.pos.clone().sub(a.pos); const dO = toOpp.length();
    if (dO < 4.5 && toOpp.dot(wish) > 0) { const side = new THREE.Vector2(-wish.y, wish.x); const sgn = Math.sign(side.dot(toOpp)) || 1; wish.addScaledVector(side, -sgn * 1.2).normalize(); }
    if (distGoal > 8 && a.energy > 0.25) a.wantTurbo = true;
    a.holdT = (a.holdT || 0) + dt;
    if (dO < 3.2 && a.dribbleCd <= 0 && a.holdT > 0.3 && Math.random() < dt * 1.4) { tryDribble(a); }
    const blocked = dO < 2.6 && toOpp.dot(new THREE.Vector2(0, dirY)) > 0;
    if (a.kickPending) return wish.set(0, 0);
    const angOk = Math.abs(a.pos.x) < 4 + distGoal * 0.9;                 // ángulo razonable a portería
    const goodShot = distGoal < 15 && angOk && a.holdT > 0.4;
    const forced = (blocked && distGoal < 24 && angOk && a.holdT > 0.8) || a.holdT > 6;
    if (goodShot || forced) {
      const aimX = Math.abs(oppGk.pos.x - 3.6) > Math.abs(oppGk.pos.x + 3.6) ? 3.6 : -3.6;
      const pre = a.sf.t.pre, mishit = Math.random() < 0.08;            // a veces la pega mal (error humano)
      const err = (Math.random() - 0.5) * (1.6 + distGoal * 0.08) * (0.7 + (100 - pre) / 40) * (mishit ? 2 : 1);
      const dir = new THREE.Vector2(aimX + err, atkY).sub(a.pos);
      shoot(a, dir, mishit ? 0.35 + Math.random() * 0.2 : 0.45 + Math.random() * 0.5, false); a.holdT = 0;
      LOG('bot_tiro', a, { d: +distGoal.toFixed(1), err: +err.toFixed(2), mishit });
      return wish.set(0, 0);
    }
    return wish;
  }
  a.holdT = 0;
  // el portero RIVAL tiene el balón en las manos: no presionar. Apartarse ≥ 9 m, fuera del área, en la línea del saque
  if (ball.owner === oppGk) {
    a.pressT = 0;
    const kp = oppGk.pos, lane = opp.pos.clone().sub(kp);
    if (lane.lengthSq() < 1) lane.set(0, dirY);
    lane.normalize();
    const t = kp.clone().addScaledVector(lane, AI.keeperGap + 1);
    const lineY = atkY;                                                  // su portería es la que atacamos
    if (Math.abs(t.y - lineY) < AI.boxDepth + 0.5) t.y = lineY - dirY * (AI.boxDepth + 0.5);
    t.x = THREE.MathUtils.clamp(t.x, -HW + 1, HW - 1);
    if (a.pos.distanceTo(kp) < AI.keeperGap) { const away = a.pos.clone().sub(kp).normalize(); return wish.copy(away).add(aiArrive(a, t, 2)).normalize(); }
    return aiArrive(a, t, 2.0, 0.5);
  }
  // nuestro portero tiene el balón: desmarcarse para recibir (lejos del rival)
  if (ball.owner === ownGk) {
    const sx = opp.pos.x > 0 ? -1 : 1;
    return aiArrive(a, new THREE.Vector2(sx * 7, ownY + dirY * 15), 2.0, 0.6);
  }
  if (ball.owner === opp) {
    // contención: ponerse en el lado de nuestra portería a ~1,5 m y esperar el momento de la entrada (no pegarse)
    const toGoal = new THREE.Vector2(0, ownY).sub(opp.pos); const dG = toGoal.length(); toGoal.normalize();
    const d = opp.pos.distanceTo(a.pos);
    const stand = dG > 30 ? 3.2 : AI.standOff;                           // lejos de nuestra portería: no hace falta morder
    const target = opp.pos.clone().addScaledVector(toGoal, stand).addScaledVector(opp.vel, 0.25);
    if (d > 5 && a.energy > 0.3) a.wantTurbo = true;
    a.pressT = d < 3 ? (a.pressT || 0) + dt : 0;
    if (d < 2.4 && a.dashCd <= 0 && (ball.ownT || 0) > 0.7 && a.pressT > 0.35 && Math.random() < dt * 1.9) { a.face.copy(opp.pos.clone().sub(a.pos).normalize()); tryDash(a); }
    return aiArrive(a, target, 1.0, 0.25);
  }
  // balón suelto: ir a por él con predicción
  a.pressT = 0;
  let pred = bp.clone().addScaledVector(new THREE.Vector2(ball.vel.x, ball.vel.y), 0.35);
  if (ball.pos.z > 1.2) { const l = predictFlight(ball.pos, ball.vel, null, 4, 1 / 60); pred = new THREE.Vector2(l.x, l.y); }
  pred.x = THREE.MathUtils.clamp(pred.x, -WX + 1, WX - 1); pred.y = THREE.MathUtils.clamp(pred.y, -WY + 1, WY - 1);
  pred.y -= dirY * 0.4;
  // el balón va a manos de nuestro portero (está en su área y llega él antes): no estorbar, desmarcarse
  if (Math.abs(pred.y - ownY) < 7 && ownGk.pos.distanceTo(pred) + 1.5 < a.pos.distanceTo(pred)) {
    const sx = opp.pos.x > 0 ? -1 : 1; return aiArrive(a, new THREE.Vector2(sx * 6, ownY + dirY * 13), 2.0, 0.6);
  }
  wish.copy(pred).sub(a.pos);
  if (wish.length() > 5 && a.energy > 0.3) a.wantTurbo = true;
  if (wish.lengthSq() > 0.04) wish.normalize(); else wish.set(0, 0);
  return wish;
}
function aiKeeper(k, dt) {
  const s = k.team === 0 ? -1 : 1;           // portería propia: azul abajo (y-), rojo arriba (y+)
  const lineY = s * (HL - 0.9);
  if (ball.owner === k) {
    k.holdT = (k.holdT || 0) + dt;
    if (k.kickPending) return new THREE.Vector2(0, 0);
    k.face.set(0, -s);
    // update 22: saca cuando el rival se ha apartado (o como mucho a los 1,8 s) y nunca por la línea donde espera el rival
    const mate = k.team === 0 ? user : rival, foe = k.team === 0 ? rival : user;
    const foeNear = foe && !S.practice && (foe.pos.distanceTo(k.pos) < AI.keeperGap - 0.4 || Math.abs(foe.pos.y - s * HL) < AI.boxDepth);
    if (k.holdT > (foeNear ? 1.8 : 0.9)) {
      const dir = mate.pos.clone().sub(k.pos); dir.x += (Math.random() - 0.5) * 2;
      if (dir.y * -s < 4) dir.set((Math.random() - 0.5) * 8, -s * 14);
      if (foe && !S.practice) {   // ¿el rival corta la línea del saque? -> a la banda contraria
        const u = dir.clone().normalize(), rel = foe.pos.clone().sub(k.pos), along = rel.dot(u), perp = Math.abs(rel.x * u.y - rel.y * u.x);
        if (along > 0 && along < dir.length() + 2 && perp < 2.5) dir.set(-Math.sign(foe.pos.x - k.pos.x || 1) * (8 + Math.random() * 4), -s * (13 + Math.random() * 4));
      }
      shoot(k, dir, 0.25 + Math.min(0.35, dir.length() / 60), false, 5.5); k.holdT = -5;
    }
    return new THREE.Vector2(0, 0);
  }
  k.holdT = 0;
  // update 29: BALÓN TRAMPA -> el portero sigue al señuelo mientras exista
  const B = k.decoy && k.decoy.alive ? k.decoy : ball, bOwner = B === ball ? ball.owner : null;
  let tx = B.pos.x * 0.55;
  const comingIn = B.vel.y * s > 4 && !bOwner;
  if (comingIn) {
    const tt = (lineY - B.pos.y) / B.vel.y;
    if (tt > 0 && tt < 2) tx = B.pos.x + B.vel.x * tt;
  }
  k.react = (k.react || 0) - dt;
  if (k.react > 0) tx = k.lastTx ?? tx; else { k.lastTx = tx; if (comingIn && !k.wasComing) { k.react = 0.15 + Math.random() * 0.15; if (k.fetidaT > 0 && B === ball) { k.react = 0.6 + Math.random() * 0.15; k.fetidaT = 0; LOG('fetida_reaccion_tarde', k, {}); } } }   // BOMBA FÉTIDA: reacciona tarde
  k.wasComing = comingIn;
  if (comingIn && k.diveT <= 0 && k.react <= 0 && !bOwner) {
    const tt = (lineY - B.pos.y) / B.vel.y;
    const bx = B.pos.x + B.vel.x * tt;
    if (tt > 0.05 && tt < 0.5 && Math.abs(bx - k.pos.x) > 1.0 * ESCALA && Math.abs(bx) < GW + 0.6) startDive(k, bx);
  }
  tx = THREE.MathUtils.clamp(tx, -GW + 0.6, GW - 0.6);
  // salir un poco si el balón está suelto y cerca
  let ty = lineY;
  const foeK = k.team === 0 ? rival : user;   // jugador de campo contrario
  const bsp = Math.hypot(ball.vel.x, ball.vel.y), dBallK = Math.hypot(ball.pos.x - k.pos.x, ball.pos.y - k.pos.y);
  const dBallF = foeK && !S.practice ? Math.hypot(ball.pos.x - foeK.pos.x, ball.pos.y - foeK.pos.y) : 99;
  // update 22: sale a por el balón suelto si está en su zona y llega claramente antes que el delantero (balones al hueco)
  const near = !ball.owner && ball.pos.z < 1.6 && ((Math.hypot(ball.pos.x, ball.pos.y - s * HL) < 8 && bsp < 6) ||
    (Math.abs(ball.pos.y - s * HL) < 12 && Math.abs(ball.pos.x) < GW + 5 && bsp < 9 && dBallK < dBallF * 0.75));
  if (near) { tx = THREE.MathUtils.clamp(ball.pos.x, -GW, GW); ty = THREE.MathUtils.clamp(ball.pos.y, s > 0 ? HL - 6 : -HL + 0.9, s > 0 ? HL - 0.9 : -HL + 6); }
  else ty = lineY;
  // el rival se acerca con el balón: el portero sale a tapar ángulo (y se expone a la vaselina)
  const h = ball.owner;
  if (h && h !== k && h.team !== k.team && !h.keeper) {
    const dGoal = Math.abs(s * HL - h.pos.y);
    const out = THREE.MathUtils.clamp((18 - dGoal) * 0.4, 0, dGoal < 10 && Math.abs(h.pos.x) < GW + 2 ? 5 : 4);   // 1 contra 1: sale más
    if (out > 0) { ty = lineY - s * out; tx = THREE.MathUtils.clamp(h.pos.x * 0.45, -GW + 0.6, GW - 0.6); }
    k.outY = ty;
  }
  // vaselina por encima: vuelve a la línea andando hacia atrás (más lento)
  const lobOver = !ball.owner && ball.lastTouch && ball.lastTouch.team !== k.team && ball.pos.z > 1.2 && ball.vel.y * s > 2;
  k.lobT = lobOver ? (k.lobT || 0) + dt : 0;
  k.backpedal = lobOver;
  const wish = new THREE.Vector2(tx - k.pos.x, ty - k.pos.y);
  const L = wish.length(); if (L > 0.2) wish.multiplyScalar(Math.min(1, L / 1.2) / L * (k.backpedal ? (k.lobT < 0.35 ? 0 : 0.4) : 1)); else wish.set(0, 0);   // vaselina: tarda en reaccionar y recula despacio
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
  if (ball.owner === k || window.__game.noKeepers) return;   // noKeepers: solo pruebas automáticas (tiros a la red)
  if (ball.noCatch === k && ball.noCatchT > 0) return;
  const diving = k.diveT > 0 && (k.diveDur - k.diveT) > 0.12 && (k.diveDur - k.diveT) < 0.6;
  const reach = (diving ? 1.75 : k.backpedal ? 0.8 : 1.1) * ESCALA, d = Math.hypot(ball.pos.x - k.pos.x, ball.pos.y - k.pos.y);   // reculando llega peor
  const reachZ = (diving ? GK_REACH_DIVE : GK_REACH) * ESCALA;     // por encima de esto (vaselina) no llega
  if (d > reach + BR || ball.pos.z - BR > reachZ) return;
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

// ===================== ESPECIALES (update 29) =====================
// Cada personaje tiene un ESPECIAL único que se carga con el tiempo (ESP_T s). Botón ESPECIAL (brilla cuando está listo),
// tecla R / F en teclado. El bot también los usa (espAI). Se pueden desactivar en AJUSTES (AJ.especiales, activados por defecto).
const ESP_T = 22;   // segundos para cargar el especial
const ESPECIALES = {
  turtobola: { name: 'BALÓN TRAMPA', desc: 'Chuta un balón falso: el portero rival se lanza a por él mientras el de verdad va al otro palo.', need: 'balon', col: '#3fd18b' },
  conazo: { name: 'ZONA CORTADA', desc: 'Planta una barrera de conos delante del rival: le corta el paso 3 s.', need: 'cerca', rango: 14, col: '#ff8a2a' },
  calcetrol: { name: 'PESTE A PIES', desc: 'Nube de olor a calcetín: el rival que la cruza va a cámara lenta.', col: '#b6d84a' },
  buton: { name: 'BOTÓN DE PAUSA', desc: 'Pulsa pausa: el rival se queda congelado 1 s.', col: '#ffd23f' },
  lobo: { name: 'AULLIDO', desc: 'Aúlla: el rival cercano se asusta, suelta el balón y recula.', need: 'cerca', rango: 9, col: '#8fa6ff' },
  zorro: { name: 'FINTA ASTUTA', desc: 'Regate automático que deja al rival clavado en el sitio.', need: 'balon', col: '#ff7a3d' },
  gecko: { name: 'LENGUA PEGAJOSA', desc: 'Atrapa con la lengua un balón suelto a distancia (hasta 11 m).', need: 'suelto', col: '#ff6fa8' },
  rino: { name: 'EMBESTIDA', desc: 'Carga en línea recta: derriba a quien se cruce y le quita el balón.', col: '#c9d0d6' },
  conejo: { name: 'INTERFERENCIA', desc: 'Señal pirata: los controles del rival se invierten 2 s.', col: '#a98bff' },
  carnero: { name: 'DROP DEL BAJO', desc: 'Onda expansiva de bajo: empuja al rival y al balón.', need: 'cerca', rango: 8, col: '#ff3fd0' },
  pepi: { name: 'RESBALÓN', desc: 'Charco de vinagre: el rival que lo pisa resbala sin control.', col: '#d8ef4a' },
  mofeta: { name: 'BOMBA FÉTIDA', desc: 'Nube en la portería rival: su portero reacciona tarde al siguiente tiro.', col: '#b04cff' },
  pantera: { name: 'SPRINT SOMBRA', desc: 'Se vuelve sombra 2 s: semitransparente, muy rápida y nadie le roba.', col: '#38e1ff' },
  murcielago: { name: 'VUELO NOCTURNO', desc: 'Oscurece la pantalla del rival y vuela por encima de las entradas.', col: '#ff4d6d' },
  ladri: { name: 'MURO', desc: 'Levanta un muro de ladrillo delante de su portería durante 5 s.', col: '#e0683a' },
};
const ESP = { fx: [], obst: [], zonas: [], decoys: [], lengua: null, tex: {}, usos: [] };
const espOn = () => AJ.especiales !== false;
const espFoe = (a) => S.practice ? null : (a === user ? rival : a === rival ? user : null);
const espGkFoe = (a) => a.team === 0 ? gkB : gkA;
const espGkOwn = (a) => a.team === 0 ? gkA : gkB;
function espReset(a) { Object.assign(a, { freezeT: 0, slowT: 0, invertT: 0, slipT: 0, ghostT: 0, flyT: 0, scaredT: 0, blindT: 0, chargeT: 0, downT: 0, slipCd: 0 }); }
// ---- texturas generadas (una vez) ----
function espTex(k) {
  if (ESP.tex[k]) return ESP.tex[k];
  const cv = document.createElement('canvas'), S2 = k === 'brick' ? 256 : 128; cv.width = cv.height = S2; const c = cv.getContext('2d');
  if (k === 'soft') { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }
  else if (k === 'puff') { for (let i = 0; i < 7; i++) { const x = 34 + Math.random() * 60, y = 34 + Math.random() * 60, r = 22 + Math.random() * 18; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.6, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); } }
  else if (k === 'charco') { const g = c.createRadialGradient(64, 64, 10, 64, 64, 62); g.addColorStop(0, 'rgba(230,250,140,.95)'); g.addColorStop(0.7, 'rgba(190,220,60,.85)'); g.addColorStop(0.92, 'rgba(120,150,30,.7)'); g.addColorStop(1, 'rgba(120,150,30,0)'); c.fillStyle = g; c.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = 50 + Math.sin(i * 2.7) * 8 + Math.cos(i * 1.3) * 5; c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } c.fill(); c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(48, 46, 14, 6, -0.5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(80, 76, 7, 3, -0.5, 0, Math.PI * 2); c.fill(); }
  else if (k === 'brick') { c.fillStyle = '#7a3a24'; c.fillRect(0, 0, 256, 256); const bh = 32, bw = 64; for (let r = 0; r < 8; r++) for (let i = -1; i < 5; i++) { const x = i * bw + (r % 2 ? bw / 2 : 0); const v = 150 + Math.floor(Math.random() * 50); c.fillStyle = `rgb(${v + 40},${Math.floor(v * 0.45)},${Math.floor(v * 0.3)})`; c.fillRect(x + 3, r * bh + 3, bw - 6, bh - 6); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x + 3, r * bh + 3, bw - 6, 5); } }
  else if (k === 'cono') { for (let i = 0; i < 8; i++) { c.fillStyle = i % 3 === 1 ? '#ffffff' : '#ff7a1a'; c.fillRect(0, i * 16, 128, 16); } }
  else if (k === 'ruido') { const im = c.createImageData(128, 128); for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v; im.data[i + 3] = 255; } c.putImageData(im, 0, 0); }
  else if (k === 'bat') { c.fillStyle = '#1c1024'; c.strokeStyle = '#ff4d6d'; c.lineWidth = 3; c.beginPath(); c.moveTo(64, 50); c.quadraticCurveTo(40, 30, 6, 44); c.quadraticCurveTo(22, 52, 18, 66); c.quadraticCurveTo(32, 58, 40, 70); c.quadraticCurveTo(50, 62, 64, 80); c.quadraticCurveTo(78, 62, 88, 70); c.quadraticCurveTo(96, 58, 110, 66); c.quadraticCurveTo(106, 52, 122, 44); c.quadraticCurveTo(88, 30, 64, 50); c.fill(); c.stroke(); c.beginPath(); c.arc(64, 52, 9, 0, Math.PI * 2); c.fill(); }
  else { // texto/icono: k = 'txt:<texto>:<color>' (lienzo 256×128)
    cv.width = 256; const [, t, col] = k.split(':'); let fs = 92; c.font = `bold ${fs}px "Lilita One", Arial Black, sans-serif`;
    while (c.measureText(t).width > 228 && fs > 30) { fs -= 4; c.font = `bold ${fs}px "Lilita One", Arial Black, sans-serif`; }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = 16; c.strokeStyle = '#14193a'; c.strokeText(t, 128, 68); c.fillStyle = col || '#fff'; c.fillText(t, 128, 68);
  }
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.userData.asp = cv.width / cv.height; if (k === 'brick') { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; }
  return (ESP.tex[k] = tx);
}
function espSprite(tex, color, size, opacity = 1, add = false) {
  const m = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color), transparent: true, opacity, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
  const s = new THREE.Sprite(m); s.userData.asp = tex.userData.asp || 1; espScale(s, size); s.renderOrder = 5; return s;
}
function espScale(s, v) { s.scale.set(v * (s.userData.asp || 1), v, 1); }
// efecto visual temporal: upd(k, obj, dt) con k = 0..1 de su vida
function espFx(obj, life, upd, parent = scene) { parent.add(obj); ESP.fx.push({ obj, t: 0, life, upd, parent }); return obj; }
function espDispose(o) { o.traverse?.((n) => { if (n.geometry) n.geometry.dispose(); if (n.material && !n.material.userData?.keep) (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => m.dispose()); }); }
function espPuffs(x, y, z, color, n, spread, size, life, rise = 0.6, add = false) {
  for (let i = 0; i < n; i++) {
    const s = espSprite(espTex('puff'), color, size * (0.7 + Math.random() * 0.6), 0.85, add);
    const ox = (Math.random() - 0.5) * spread, oy = (Math.random() - 0.5) * spread, oz = Math.random() * spread * 0.4;
    s.position.copy(g2t(x + ox, y + oy, z + oz)); const v = new THREE.Vector3(ox, rise + Math.random() * rise, -oy).multiplyScalar(0.8);
    const s0 = s.scale.x;
    espFx(s, life * (0.7 + Math.random() * 0.5), (k, o, dt) => { o.position.addScaledVector(v, dt); o.scale.setScalar(s0 * (1 + k * 0.8)); o.material.opacity = 0.85 * (1 - k); });
  }
}
function espShock(x, y, color, r1, life, z = 0.08, width = 0.35) {
  const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.copy(g2t(x, y, z)); m.renderOrder = 4;
  espFx(m, life, (k, o) => { const r = 0.3 + (r1 - 0.3) * (1 - Math.pow(1 - k, 2.2)); o.scale.setScalar(r); o.material.opacity = 0.9 * (1 - k); });
}
function espIcon(a, txt, color, life, size = 1.3) {   // icono encima de la cabeza de un jugador
  const s = espSprite(espTex(`txt:${txt}:${color}`), 0xffffff, size);
  s.position.set(0, 2.95 * ESCALA, 0);
  return espFx(s, life, (k, o, dt) => { o.position.y = 2.95 * ESCALA + Math.sin(k * 18) * 0.08; o.material.opacity = k > 0.8 ? (1 - k) * 5 : 1; const p = Math.min(1, k * 8); espScale(o, size * (0.5 + 0.5 * p + (p < 1 ? 0 : 0.06 * Math.sin(k * 30)))); }, a.root);
}
// ---- sonido sintetizado (WebAudio) ----
let _nb = null;
function espNoise(dur, { vol = 0.12, f = 1200, f2 = null, q = 0.8, type = 'bandpass', delay = 0 } = {}) {
  if (!actx) return; if (!_nb) { _nb = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate); const d = _nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t0 = actx.currentTime + delay, s = actx.createBufferSource(), fl = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = _nb; fl.type = type; fl.frequency.setValueAtTime(f, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur); fl.Q.value = q;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.04, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl).connect(g).connect(actx.destination); s.start(t0); s.stop(t0 + dur + 0.05);
}
function espTone(f, dur, { type = 'sine', vol = 0.1, f2 = null, delay = 0, vib = 0, vibF = 6, att = 0.02 } = {}) {
  if (!actx) return;
  const t0 = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  if (vib) { const l = actx.createOscillator(), lg = actx.createGain(); l.frequency.value = vibF; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}
const espSfx = {
  listo: () => { espTone(880, 0.12, { type: 'triangle', vol: 0.06 }); espTone(1320, 0.18, { type: 'triangle', vol: 0.06, delay: 0.09 }); },
  turtobola: () => { espTone(160, 0.14, { type: 'triangle', vol: 0.22, f2: 70 }); espTone(150, 0.14, { type: 'triangle', vol: 0.16, f2: 70, delay: 0.05 }); espNoise(0.4, { f: 2400, f2: 600, vol: 0.06, delay: 0.05 }); },
  conazo: () => { [0, 0.09, 0.18].forEach((d) => { espTone(220, 0.1, { type: 'square', vol: 0.07, f2: 120, delay: d }); espNoise(0.12, { f: 900, vol: 0.08, delay: d }); }); },
  calcetrol: () => { espNoise(0.9, { f: 300, f2: 120, q: 3, vol: 0.18, type: 'lowpass' }); espTone(110, 0.6, { type: 'sawtooth', vol: 0.05, f2: 70, vib: 8 }); },
  buton: () => { espTone(1200, 0.05, { type: 'square', vol: 0.08 }); espTone(600, 0.5, { type: 'sawtooth', vol: 0.08, f2: 60, delay: 0.05 }); },
  lobo: () => { espTone(330, 1.3, { type: 'sawtooth', vol: 0.07, f2: 620, vib: 14, vibF: 5.5, att: 0.15 }); espTone(495, 1.3, { type: 'sine', vol: 0.06, f2: 760, vib: 10, vibF: 5.5, att: 0.2 }); },
  zorro: () => { espNoise(0.25, { f: 3000, f2: 800, vol: 0.12 }); espTone(700, 0.18, { type: 'triangle', vol: 0.08, f2: 1400 }); },
  gecko: () => { espTone(300, 0.12, { type: 'square', vol: 0.06, f2: 1200 }); espTone(1200, 0.22, { type: 'sine', vol: 0.09, f2: 200, delay: 0.14 }); espNoise(0.08, { f: 1500, vol: 0.1, delay: 0.32 }); },
  rino: () => { espNoise(0.9, { f: 180, f2: 90, q: 1, vol: 0.25, type: 'lowpass' }); espTone(70, 0.8, { type: 'sawtooth', vol: 0.08, f2: 45 }); },
  golpe: () => { espNoise(0.25, { f: 400, f2: 100, vol: 0.25, type: 'lowpass' }); espTone(90, 0.25, { type: 'square', vol: 0.12, f2: 40 }); },
  conejo: () => { espNoise(0.9, { f: 4000, f2: 1500, q: 0.5, vol: 0.06, type: 'highpass' }); [0, 0.12, 0.24].forEach((d, i) => espTone(1500 - i * 300, 0.08, { type: 'square', vol: 0.05, delay: d })); },
  carnero: () => { espNoise(0.15, { f: 3000, f2: 8000, vol: 0.05 }); espTone(140, 0.9, { type: 'sine', vol: 0.35, f2: 38, delay: 0.12 }); espTone(70, 0.9, { type: 'square', vol: 0.06, f2: 30, delay: 0.12 }); espNoise(0.5, { f: 120, vol: 0.2, type: 'lowpass', delay: 0.12 }); },
  pepi: () => { espNoise(0.5, { f: 700, f2: 2500, q: 4, vol: 0.12 }); espTone(400, 0.3, { type: 'sine', vol: 0.06, f2: 900, delay: 0.05 }); },
  resbalon: () => { espTone(900, 0.45, { type: 'sine', vol: 0.09, f2: 200 }); espNoise(0.3, { f: 2000, vol: 0.06 }); },
  mofeta: () => { espTone(500, 0.35, { type: 'sine', vol: 0.06, f2: 1100 }); espNoise(0.9, { f: 250, f2: 120, q: 2, vol: 0.2, type: 'lowpass', delay: 0.3 }); },
  pantera: () => { espNoise(0.6, { f: 600, f2: 4000, q: 1.5, vol: 0.12 }); espTone(220, 0.5, { type: 'sawtooth', vol: 0.05, f2: 880 }); },
  murcielago: () => { [0, 0.07, 0.14, 0.21].forEach((d) => espTone(3200 + Math.random() * 800, 0.05, { type: 'sine', vol: 0.05, f2: 2200, delay: d })); espNoise(0.5, { f: 500, f2: 200, vol: 0.12, delay: 0.1 }); },
  ladri: () => { [0, 0.12, 0.24, 0.36].forEach((d) => { espNoise(0.12, { f: 300, vol: 0.18, type: 'lowpass', delay: d }); espTone(120, 0.1, { type: 'square', vol: 0.06, f2: 60, delay: d }); }); },
  puf: () => espNoise(0.3, { f: 1500, f2: 300, vol: 0.1 }),
};
// ---- ¿se puede usar ahora? ----
function espReady(a) { return !!(a && !a.keeper && espOn() && ESPECIALES[a.charKey] && a.esp >= 1); }
function espCanUse(a) {
  if (!espReady(a) || S.mode !== 'play' || a.stun > 0 || a.freezeT > 0 || a.slipT > 0 || a.chargeT > 0) return false;
  const e = ESPECIALES[a.charKey], foe = espFoe(a);
  if (e.need === 'balon') return ball.owner === a;
  if (e.need === 'suelto') return !ball.owner && Math.hypot(ball.pos.x - a.pos.x, ball.pos.y - a.pos.y) < 11 && ball.pos.z < 3.5;
  if (e.need === 'cerca') return !!foe && foe.pos.distanceTo(a.pos) < e.rango;
  return true;
}
function espUse(a, auto = false) {
  if (!espCanUse(a)) { if (a === user && espReady(a) && !auto) espNoSe(a); return false; }
  const k = a.charKey, e = ESPECIALES[k], foe = espFoe(a);
  a.esp = 0; a.espUsedT = S.t;
  const ok = (ESP_FN[k] || (() => true))(a, foe);
  (espSfx[k] || espSfx.listo)();
  showBanner('¡' + e.name + '!', a.team === 0 ? 'bAzul esp' : 'bRojo esp', 1100);
  espShock(a.pos.x, a.pos.y, e.col, 3.2, 0.5);
  ESP.usos.push({ t: +S.t.toFixed(2), who: NAME(a), k });
  LOG('especial', a, { k, ok });
  return true;
}
function espNoSe(a) {   // pulsado pero no aplicable ahora
  const e = ESPECIALES[a.charKey];
  const m = e.need === 'balon' ? 'NECESITAS EL BALÓN' : e.need === 'suelto' ? 'BALÓN SUELTO CERCA' : e.need === 'cerca' ? 'RIVAL DEMASIADO LEJOS' : '';
  if (m) showBanner(m, '', 700);
  sfx.miss();
}
// ---- obstáculos (conos, muro) y zonas (nube, charco) ----
function espAddObst(o) { ESP.obst.push(o); scene.add(o.mesh); return o; }
function espAddZona(z) { ESP.zonas.push(z); if (z.mesh) scene.add(z.mesh); return z; }
function espClear() {
  for (const o of ESP.obst) { scene.remove(o.mesh); espDispose(o.mesh); }
  for (const z of ESP.zonas) if (z.mesh) { scene.remove(z.mesh); espDispose(z.mesh); }
  for (const f of ESP.fx) { f.parent.remove(f.obj); espDispose(f.obj); }
  for (const d of ESP.decoys) { scene.remove(d.mesh); }
  ESP.obst.length = ESP.zonas.length = ESP.fx.length = ESP.decoys.length = 0; ESP.lengua = null;
  for (const k of [gkA, gkB]) if (k) { k.decoy = null; k.fetidaT = 0; }
  for (const a of actors) { espReset(a); espGhostVis(a, false); }
  espVelo(0); espRuido(0);
}
// ---- efectos por personaje ----
const ESP_FN = {
  turtobola(a, foe) {   // tiro de verdad al palo lejos del portero + señuelo al otro palo (el portero se tira a por el señuelo)
    const gk = espGkFoe(a), gy = goalCenter(a.team).y;
    const sReal = gk && gk.pos.x > 0.3 ? -1 : gk && gk.pos.x < -0.3 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    a.espDecoy = { x: -sReal * (GW - 1.1), y: gy };
    shoot(a, new THREE.Vector2(sReal * (GW - 1.2) - a.pos.x, gy - a.pos.y), 0.92, a === user);
    return true;
  },
  conazo(a, foe) {   // barrera de 3 conos en el camino del rival, 3 s
    const h = foe.vel.lengthSq() > 1 ? foe.vel.clone().normalize() : a.pos.clone().sub(foe.pos).normalize();
    const c = foe.pos.clone().addScaledVector(h, 1.9), side = new THREE.Vector2(-h.y, h.x);
    const pts = [-1.6, 0, 1.6].map((o) => c.clone().addScaledVector(side, o));
    pts.forEach((p, i) => {
      const g = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.1, 20, 1, true), new THREE.MeshBasicMaterial({ map: espTex('cono'), side: THREE.DoubleSide }));
      cone.position.y = 1.05 + 0.12; g.add(cone);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 1.5), new THREE.MeshBasicMaterial({ color: 0xff7a1a })); base.position.y = 0.12; g.add(base);
      const ol = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.25, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x14193a, side: THREE.BackSide })); ol.position.y = 1.1; g.add(ol);
      g.position.copy(g2t(p.x, p.y)); g.scale.setScalar(0.01);
      espAddObst({ kind: 'cono', x: p.x, y: p.y, r: 0.9, t: 3.0, life: 3.0, blocks: foe.team, mesh: g, delay: i * 0.07 });
    });
    // cinta entre conos
    const tape = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.04), new THREE.MeshBasicMaterial({ map: espTex('cono') }));
    tape.position.copy(g2t(c.x, c.y, 1.3)); tape.rotation.y = Math.atan2(side.y, side.x) * 1; tape.rotation.y = -Math.atan2(side.y, side.x);
    espAddObst({ kind: 'cinta', x: c.x, y: c.y, r: 0, t: 3.0, life: 3.0, blocks: -1, mesh: tape });
    espPuffs(c.x, c.y, 0.2, 0xffffff, 8, 3, 1.4, 0.6);
    foe.vel.multiplyScalar(0.2);
    return true;
  },
  calcetrol(a, foe) {   // nube que ralentiza (entre los dos si está cerca; si no, donde está calcetrol)
    const p = foe && foe.pos.distanceTo(a.pos) < 10 ? a.pos.clone().lerp(foe.pos, 0.6) : a.pos.clone();
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) { const s = espSprite(espTex('puff'), i % 2 ? 0xb6d84a : 0x8aa83a, 2.4 + Math.random() * 1.2, 0.75); const an = i / 9 * Math.PI * 2; s.position.set(Math.cos(an) * 1.7 * Math.random(), 0.6 + Math.random() * 1.6, Math.sin(an) * 1.7); s.userData.ph = Math.random() * 6; g.add(s); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), new THREE.MeshBasicMaterial({ map: espTex('soft'), color: 0x9fc23a, transparent: true, opacity: 0.55, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06; g.add(disc);
    g.position.copy(g2t(p.x, p.y));
    espAddZona({ kind: 'nube', x: p.x, y: p.y, r: 3.2, t: 6, life: 6, team: a.team, mesh: g });
    return true;
  },
  buton(a, foe) {   // congela al rival 1 s
    if (!foe) return false;
    foe.freezeT = 1.0; foe.vel.set(0, 0); foe.kickPending = null; foe.dashT = 0; foe.dribbleT = 0;
    espIcon(foe, 'II', '#ffd23f', 1.1, 1.5);
    const ice = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.9 * ESCALA, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    ice.position.y = 1.45 * ESCALA;
    espFx(ice, 1.05, (k, o) => { o.material.opacity = 0.35 * (k < 0.1 ? k * 10 : k > 0.85 ? (1 - k) / 0.15 : 1); o.scale.setScalar(1 + 0.03 * Math.sin(k * 40)); }, foe.root);
    espPuffs(foe.pos.x, foe.pos.y, 1, 0xd8f4ff, 8, 2, 0.8, 0.8, 0.3);
    return true;
  },
  lobo(a, foe) {   // susto: suelta el balón, recula y queda aturdido
    const away = foe.pos.clone().sub(a.pos).normalize();
    if (ball.owner === foe) { ball.owner = null; ball.vel.set(-away.x * 4 + away.y * 3, -away.y * 4 - away.x * 3, 3); ball.noCatch = foe; ball.noCatchT = 0.8; }
    foe.scaredT = 1.1; foe.scaredDir = away; foe.kickPending = null;
    espIcon(foe, '!!', '#ff5050', 1.2, 1.4);
    const moon = espSprite(espTex('soft'), 0xfff3b0, 2.6, 1, true); moon.position.set(0, 3.9 * ESCALA, 0);
    espFx(moon, 1.4, (k, o) => { o.material.opacity = Math.sin(Math.PI * k); }, a.root);
    for (let i = 0; i < 3; i++) setTimeout(() => espShock(a.pos.x, a.pos.y, 0x8fa6ff, 9, 0.8, 0.1 + i * 0.6, 0.12), i * 180);
    return true;
  },
  zorro(a, foe) {   // regate automático + rival clavado
    const side = new THREE.Vector2(-a.face.y, a.face.x);
    if (foe) { const to = foe.pos.clone().sub(a.pos); if (side.dot(to) > 0) side.multiplyScalar(-1); }
    const dir = side.multiplyScalar(0.75).add(new THREE.Vector2(0, a.team === 0 ? 0.65 : -0.65)).normalize();
    a.dribbleCd = 0; tryDribble(a, dir); a.dribbleT = 0.5;
    if (foe && foe.pos.distanceTo(a.pos) < 9) { foe.stun = Math.max(foe.stun, 1.25); foe.dashT = 0; espIcon(foe, '?', '#ffb03d', 1.3, 1.5); }
    for (let i = 0; i < 6; i++) setTimeout(() => espPuffs(a.pos.x, a.pos.y, 0.6, 0xff9a4a, 2, 0.8, 0.9, 0.5, 0.3), i * 60);
    return true;
  },
  gecko(a) {   // lengua: se estira hasta el balón y lo trae
    const tongue = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 1, 10), new THREE.MeshBasicMaterial({ color: 0xff5f9e }));
    tongue.geometry.translate(0, 0.5, 0); tongue.geometry.rotateX(Math.PI / 2);   // crece hacia +Z local
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff3f86 }));
    const g = new THREE.Group(); g.add(tongue); g.add(tip); scene.add(g);
    ESP.lengua = { a, t: 0, g, tongue, tip, grab: false };
    ball.owner = null;
    return true;
  },
  rino(a, foe) {   // embestida recta 0,9 s
    const md = a === user ? moveDir() : null;
    let dir = md ? md.clone() : a.face.clone();
    if (a !== user && foe) dir = foe.pos.clone().sub(a.pos).normalize();
    a.face.copy(dir.normalize()); a.chargeT = 0.9; a.chargeHit = false; a.dashT = 0; a.dribbleT = 0;
    return true;
  },
  conejo(a, foe) {   // controles invertidos 2 s (el bot se mueve errático)
    if (!foe) return false;
    foe.invertT = 2.0;
    espIcon(foe, '~?~', '#c7b3ff', 2.0, 1.6);
    for (let i = 0; i < 4; i++) setTimeout(() => espShock(a.pos.x, a.pos.y, 0xa98bff, 12, 0.7, 2.6 * ESCALA, 0.08), i * 150);
    if (foe === user) espRuido(2.0);
    return true;
  },
  carnero(a, foe) {   // onda expansiva: empuja al rival y al balón
    const R = 8;
    for (let i = 0; i < 3; i++) setTimeout(() => espShock(a.pos.x, a.pos.y, i === 1 ? 0x46e6ff : 0xff3fd0, R + 1, 0.55, 0.12 + i * 0.05, 0.22), 120 + i * 110);
    for (let i = 0; i < 8; i++) { const s = espSprite(espTex('txt:♪:#ff6ee0'), 0xffffff, 1.1); const an = i / 8 * Math.PI * 2; const v = new THREE.Vector3(Math.cos(an) * 6, 2.5, Math.sin(an) * 6); s.position.copy(g2t(a.pos.x, a.pos.y, 1.6)); espFx(s, 0.9, (k, o, dt) => { o.position.addScaledVector(v, dt); o.material.opacity = 1 - k; }); }
    if (foe && foe.pos.distanceTo(a.pos) < R) {
      const d = foe.pos.clone().sub(a.pos); const L = Math.max(0.5, d.length()); d.normalize();
      const f = 1 - L / R * 0.5;
      foe.vel.copy(d).multiplyScalar(15 * f); foe.stun = Math.max(foe.stun, 0.7); foe.kickPending = null; foe.dashT = 0;
      if (ball.owner === foe) { ball.owner = null; ball.vel.set(d.x * 11, d.y * 11, 4); ball.noCatch = foe; ball.noCatchT = 0.5; }
    }
    if (!ball.owner) { const d = new THREE.Vector2(ball.pos.x - a.pos.x, ball.pos.y - a.pos.y); const L = d.length(); if (L < R && L > 0.2) { d.normalize(); ball.vel.x += d.x * 12 * (1 - L / R * 0.5); ball.vel.y += d.y * 12 * (1 - L / R * 0.5); ball.vel.z = Math.max(ball.vel.z, 3); } }
    return true;
  },
  pepi(a, foe) {   // charco de vinagre en el camino del rival
    let p = a.pos.clone().addScaledVector(a.face, -2.2);
    if (foe && foe.pos.distanceTo(a.pos) < 12) p = foe.pos.clone().addScaledVector(foe.vel.lengthSq() > 1 ? foe.vel.clone().normalize() : a.pos.clone().sub(foe.pos).normalize(), 2.2);
    p.x = THREE.MathUtils.clamp(p.x, -WX + 2, WX - 2); p.y = THREE.MathUtils.clamp(p.y, -WY + 2, WY - 2);
    const m = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40), new THREE.MeshBasicMaterial({ map: espTex('charco'), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(g2t(p.x, p.y, 0.05)); m.renderOrder = 3; m.scale.setScalar(0.01);
    espAddZona({ kind: 'charco', x: p.x, y: p.y, r: 2.3, t: 7, life: 7, team: a.team, mesh: m });
    for (let i = 0; i < 10; i++) { const s = espSprite(espTex('soft'), 0xd8ef4a, 0.5); const v = new THREE.Vector3((Math.random() - 0.5) * 6, 5 + Math.random() * 3, (Math.random() - 0.5) * 6); s.position.copy(g2t(p.x, p.y, 0.3)); espFx(s, 0.7, (k, o, dt) => { v.y -= 14 * dt; o.position.addScaledVector(v, dt); o.material.opacity = 1 - k; }); }
    return true;
  },
  mofeta(a) {   // nube fétida en la portería rival: su portero reacciona tarde al siguiente tiro
    const gk = espGkFoe(a); if (!gk) return false;
    gk.fetidaT = 9;
    const gy = goalCenter(a.team).y, s = Math.sign(gy);
    const g = new THREE.Group();
    for (let i = 0; i < 12; i++) { const sp = espSprite(espTex('puff'), i % 3 ? 0x9a3fd6 : 0x6fbf3a, 2.6 + Math.random() * 1.4, 0.7); sp.position.set((Math.random() - 0.5) * 2 * GW, 0.8 + Math.random() * 2.6, s * (1 + Math.random() * 3.5)); sp.userData.ph = Math.random() * 6; g.add(sp); }
    g.position.copy(g2t(0, gy));
    espAddZona({ kind: 'fetida', x: 0, y: gy - s * 2, r: 0, t: 9, life: 9, team: a.team, mesh: g, gk });
    // bomba que vuela hasta la portería
    const b = espSprite(espTex('soft'), 0xb04cff, 1.2, 1, true); const p0 = g2t(a.pos.x, a.pos.y, 1.5), p1 = g2t(0, gy, 1.5);
    espFx(b, 0.45, (k, o) => { o.position.lerpVectors(p0, p1, k); o.position.y += Math.sin(Math.PI * k) * 5; });
    espIcon(gk, 'ZzZ', '#c58bff', 3, 1.5);
    return true;
  },
  pantera(a) { a.ghostT = 2.0; espGhostVis(a, true); return true; },
  murcielago(a, foe) {
    a.flyT = 2.2;
    if (foe === user) espVelo(1.7); else if (foe) foe.blindT = 1.7;
    for (let i = 0; i < 7; i++) { const s = espSprite(espTex('bat'), 0xffffff, 1.3); const an = Math.random() * Math.PI * 2; const v = new THREE.Vector3(Math.cos(an) * 7, 3 + Math.random() * 3, Math.sin(an) * 7); s.position.copy(g2t(a.pos.x, a.pos.y, 2)); espFx(s, 1.1, (k, o, dt) => { o.position.addScaledVector(v, dt); o.material.opacity = 1 - k * k; }); }
    if (foe) espIcon(foe, '•_•', '#ff4d6d', 1.7, 1.4);
    return true;
  },
  ladri(a) {   // muro delante de su portería, 5 s
    const s = a.team === 0 ? -1 : 1, y = s * (HL - 3.2), W2 = GW + 1.2;
    const geo = new THREE.BoxGeometry(W2 * 2, 2.4, 0.7); const tx = espTex('brick').clone(); tx.needsUpdate = true; tx.repeat.set(W2 * 2 / 2.6, 1.2);
    const m = new THREE.Mesh(geo, [new THREE.MeshLambertMaterial({ color: 0x8a3e24 }), new THREE.MeshLambertMaterial({ color: 0x8a3e24 }), new THREE.MeshLambertMaterial({ color: 0xa04a2a }), new THREE.MeshLambertMaterial({ color: 0x5a2616 }), new THREE.MeshLambertMaterial({ map: tx }), new THREE.MeshLambertMaterial({ map: tx })]);
    const ol = new THREE.Mesh(new THREE.BoxGeometry(W2 * 2 + 0.12, 2.52, 0.82), new THREE.MeshBasicMaterial({ color: 0x14193a, side: THREE.BackSide })); m.add(ol);
    m.position.copy(g2t(0, y, -1.3)); shadowFlags(m, true, true);
    espAddObst({ kind: 'muro', x: 0, y, hw: W2, hd: 0.45, t: 5, life: 5, blocks: 1 - a.team, ball: s, mesh: m });
    for (let i = -4; i <= 4; i++) espPuffs(i * W2 / 4, y, 0.2, 0xd8b090, 1, 1.2, 1.6, 0.8, 0.5);
    return true;
  },
};
// ---- pantera: sombra semitransparente ----
function espGhostVis(a, on) {
  if (!a || !a.model) return;
  if (!!a._ghostOn === on) return; a._ghostOn = on;
  a.model.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.outline) { o.visible = !on; return; }
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((m) => { if (on) { m.userData.espT = m.transparent; m.transparent = true; m.opacity = 0.38; m.depthWrite = false; if (m.color) { m.userData.espC = m.color.getHex(); m.color.setHex(0x6a7cff); } } else { m.transparent = !!m.userData.espT; m.opacity = 1; m.depthWrite = true; if (m.color && m.userData.espC !== undefined) m.color.setHex(m.userData.espC); } m.needsUpdate = true; });
  });
}
// ---- pantalla oscura (murciélago) y ruido (conejo) para el usuario ----
function espVelo(t) { const el = document.getElementById('espVelo'); if (!el) return; ESP.veloT = t; el.classList.toggle('on', t > 0); }
function espRuido(t) { const el = document.getElementById('espRuido'); if (!el) return; ESP.ruidoT = t; el.classList.toggle('on', t > 0); }
// ---- multiplicador de velocidad por estados ----
function espSpeedMul(a) {
  let m = 1;
  if (a.slowT > 0) m *= 0.45;
  if (a.ghostT > 0) m *= 1.55;
  if (a.flyT > 0) m *= 1.15;
  return m;
}
// IA: dirección errática (interferencia) / ciega (vuelo nocturno)
function espAiWish(a, wish, dt) {
  if (a.invertT > 0) { a._errA = (a._errA || 0) + dt * (4 + Math.sin(S.t * 7) * 3); return new THREE.Vector2(Math.cos(a._errA), Math.sin(a._errA * 1.3)).normalize(); }
  if (a.blindT > 0) { return wish.clone().rotateAround(new THREE.Vector2(), Math.sin(S.t * 3) * 1.4).multiplyScalar(0.55); }
  return wish;
}
// ---- IA: cuándo usa el bot su especial ----
function espAI(a, opp, dt) {
  if (!espReady(a) || !espCanUse(a)) return;
  a._espAiT = (a._espAiT || 0) - dt; if (a._espAiT > 0) return; a._espAiT = 0.25;
  const k = a.charKey, d = opp ? opp.pos.distanceTo(a.pos) : 99, atkY = goalCenter(a.team).y, dG = Math.abs(atkY - a.pos.y), ownY = -atkY;
  const oppBall = ball.owner === opp, myBall = ball.owner === a, oppToGoal = opp ? Math.abs(ownY - opp.pos.y) : 99;
  const bD = Math.hypot(ball.pos.x - a.pos.x, ball.pos.y - a.pos.y), oD = opp ? Math.hypot(ball.pos.x - opp.pos.x, ball.pos.y - opp.pos.y) : 99;
  let want = false;
  switch (k) {
    case 'turtobola': want = myBall && dG < 20 && Math.abs(a.pos.x) < 11; break;
    case 'conazo': want = oppBall && d < 9 && oppToGoal < 34; break;
    case 'calcetrol': want = (oppBall && d < 6) || (myBall && d < 4); break;
    case 'buton': want = (oppBall && d < 5) || (myBall && d < 3.5 && dG < 26); break;
    case 'lobo': want = oppBall && d < 6.5; break;
    case 'zorro': want = myBall && d < 3.8; break;
    case 'gecko': want = !ball.owner && bD > 3 && bD < 10.5 && oD < bD + 2; break;
    case 'rino': want = oppBall && d < 8 && d > 2.5; break;
    case 'conejo': want = (oppBall && d < 10) || (myBall && d < 4.5); break;
    case 'carnero': want = d < 6 && (oppBall || (!ball.owner && bD < 5)); break;
    case 'pepi': want = oppBall && d < 9 && d > 3; break;
    case 'mofeta': want = myBall && dG < 26; break;
    case 'pantera': want = myBall && dG < 32 && d < 8; break;
    case 'murcielago': want = (myBall && d < 6) || (oppBall && opp === user && d < 8); break;
    case 'ladri': want = oppBall && oppToGoal < 22; break;
  }
  if (want && Math.random() < 0.7) espUse(a, true);
}
// ---- actualización (cada paso de simulación) ----
function espUpdate(dt, playing) {
  const fld = S.practice ? [user] : [user, rival];
  for (const a of fld) {
    if (!a) continue;
    if (playing && espOn() && a.esp < 1) { a.esp = Math.min(1, a.esp + dt / ESP_T); if (a.esp >= 1 && a === user) espSfx.listo(); }
    for (const k of ['slowT', 'invertT', 'ghostT', 'flyT', 'scaredT', 'blindT', 'downT', 'slipCd']) if (a[k] > 0) a[k] = Math.max(0, a[k] - dt);
    if (a._ghostOn && a.ghostT <= 0) espGhostVis(a, false);
    if (a.ghostT > 0 && (a._trailT = (a._trailT || 0) - dt) <= 0) { a._trailT = 0.05; espPuffs(a.pos.x, a.pos.y, 1.1, 0x2a2f6a, 1, 0.5, 1.6, 0.45, 0.1); }
    // rino: choque durante la embestida
    if (a.chargeT > 0) {
      if ((a._dustT = (a._dustT || 0) - dt) <= 0) { a._dustT = 0.045; espPuffs(a.pos.x - a.face.x * 0.8, a.pos.y - a.face.y * 0.8, 0.2, 0xc8b89a, 1, 0.6, 1.3, 0.5, 0.4); }
      const f = espFoe(a);
      if (f && !a.chargeHit && f.pos.distanceTo(a.pos) < PR * 2 + 0.5) {
        a.chargeHit = true; a.chargeT = Math.min(a.chargeT, 0.12);
        const d = f.pos.clone().sub(a.pos).normalize();
        f.vel.copy(d).multiplyScalar(11); f.stun = Math.max(f.stun, 1.4); f.downT = 1.4; f.kickPending = null; f.dashT = 0; f.dribbleT = 0;
        if (ball.owner === f) giveBall(a), f.stun = Math.max(f.stun, 1.4);
        espSfx.golpe(); espPuffs(f.pos.x, f.pos.y, 0.6, 0xffffff, 8, 1.5, 1.2, 0.6); espIcon(f, '*', '#ffd23f', 1.2, 1.5); LOG('embestida_golpe', a, {});
      }
    }
    // zonas
    for (const z of ESP.zonas) {
      if (z.team === a.team || z.r <= 0) continue;
      const inside = Math.hypot(a.pos.x - z.x, a.pos.y - z.y) < z.r;
      if (z.kind === 'nube' && inside) { if (a.slowT <= 0) espIcon(a, 'puaj', '#b6d84a', 1.0, 1.6); a.slowT = Math.max(a.slowT, 0.6); }
      if (z.kind === 'charco' && inside && a.slipCd <= 0 && a.slipT <= 0 && a.flyT <= 0) {
        a.slipT = 1.1; a.slipCd = 2.2; a.slipSpin = 0;
        const v = a.vel.lengthSq() > 1 ? a.vel.clone() : a.face.clone().multiplyScalar(5); a.slipV = v.multiplyScalar(1.15);
        if (ball.owner === a) { ball.owner = null; ball.vel.set(a.slipV.x * 0.9, a.slipV.y * 0.9, 1.5); ball.noCatch = a; ball.noCatchT = 0.8; }
        a.kickPending = null; a.dashT = 0; a.dribbleT = 0; espSfx.resbalon(); espIcon(a, '!?', '#d8ef4a', 1.1, 1.5); LOG('resbalon', a, {});
      }
    }
  }
  // obstáculos y zonas: vida
  for (let i = ESP.obst.length - 1; i >= 0; i--) {
    const o = ESP.obst[i]; o.t -= dt; const el = o.life - o.t;
    if (o.kind === 'cono') { const k = THREE.MathUtils.clamp((el - (o.delay || 0)) / 0.18, 0, 1); const out = o.t < 0.25 ? o.t / 0.25 : 1; o.mesh.scale.setScalar(Math.max(0.01, (k < 1 ? k * 1.15 : 1) * out)); }
    if (o.kind === 'cinta') o.mesh.scale.set(Math.min(1, el / 0.3) * (o.t < 0.25 ? o.t / 0.25 : 1) + 0.001, 1, 1);
    if (o.kind === 'muro') { const up = THREE.MathUtils.clamp(el / 0.35, 0, 1), dn = THREE.MathUtils.clamp(o.t / 0.35, 0, 1); o.mesh.position.y = -1.3 + 2.5 * Math.min(1 - Math.pow(1 - up, 3), dn) + (up < 1 ? 0 : 0); if (up < 1 && Math.random() < 0.5) espPuffs((Math.random() - 0.5) * 2 * o.hw, o.y, 0.1, 0xd8b090, 1, 0.5, 1.2, 0.5, 0.6); }
    if (o.t <= 0) { scene.remove(o.mesh); espDispose(o.mesh); ESP.obst.splice(i, 1); }
  }
  for (let i = ESP.zonas.length - 1; i >= 0; i--) {
    const z = ESP.zonas[i]; z.t -= dt; const el = z.life - z.t, fin = THREE.MathUtils.clamp(z.t / 0.6, 0, 1), ini = THREE.MathUtils.clamp(el / 0.35, 0, 1);
    if (z.kind === 'charco') z.mesh.scale.setScalar(Math.max(0.01, (1 - Math.pow(1 - ini, 3)) * (0.5 + 0.5 * fin)));
    if (z.mesh && (z.kind === 'nube' || z.kind === 'fetida')) { z.mesh.children.forEach((s) => { if (s.isSprite) { s.material.opacity = 0.72 * ini * fin; s.position.y += Math.sin(S.t * 1.7 + s.userData.ph) * 0.004; s.material.rotation = Math.sin(S.t * 0.8 + s.userData.ph) * 0.4; } else s.material.opacity = 0.5 * ini * fin; }); }
    if (z.kind === 'charco') z.mesh.material.opacity = fin;
    if (z.kind === 'fetida' && (z.gk.fetidaT <= 0)) z.t = Math.min(z.t, 0.6);
    if (z.t <= 0) { if (z.mesh) { scene.remove(z.mesh); espDispose(z.mesh); } ESP.zonas.splice(i, 1); }
  }
  for (const k of [gkA, gkB]) if (k && k.fetidaT > 0) k.fetidaT = Math.max(0, k.fetidaT - dt);
  // lengua del gecko
  const L = ESP.lengua;
  if (L) {
    L.t += dt; const a = L.a, mouth = new THREE.Vector3(a.pos.x + a.face.x * 0.35, a.pos.y + a.face.y * 0.35, 1.55 * ESCALA);
    const bp = new THREE.Vector3(ball.pos.x, ball.pos.y, ball.pos.z), D = bp.clone().sub(mouth), dist = D.length();
    let reach;
    if (L.t < 0.16) reach = dist * (L.t / 0.16);
    else { if (!L.grab) { L.grab = true; espSfx.puf(); } const k = Math.min(1, (L.t - 0.16) / 0.26); reach = dist * (1 - k); ball.owner = null; ball.vel.set(0, 0, 0);
      const tgt = mouth.clone().addScaledVector(D.clone().normalize(), Math.max(0.6, reach)); ball.pos.set(tgt.x, tgt.y, Math.max(BR, tgt.z)); }
    const ang = Math.atan2(D.x, D.y); a.face.set(Math.sin(ang), Math.cos(ang));
    L.g.position.copy(g2t(mouth.x, mouth.y, mouth.z));
    L.g.lookAt(g2t(bp.x, bp.y, bp.z)); L.tongue.scale.set(1, 1, Math.max(0.05, reach)); L.tip.position.set(0, 0, Math.max(0.05, reach));
    if (L.t > 0.42 || ball.owner) { scene.remove(L.g); espDispose(L.g); ESP.lengua = null; if (!ball.owner && S.mode === 'play') { giveBall(a); ball.noCatch = null; } LOG('lengua', a, {}); }
  }
  // señuelos (balón trampa)
  for (let i = ESP.decoys.length - 1; i >= 0; i--) {
    const d = ESP.decoys[i]; d.t += dt; d.alive = d.t < d.life;
    d.vel.z -= GRAV * dt; d.pos.addScaledVector(d.vel, dt); if (d.pos.z < BR) { d.pos.z = BR; d.vel.z = Math.abs(d.vel.z) * 0.5; d.vel.x *= 0.98; d.vel.y *= 0.98; }
    d.mesh.position.copy(g2t(d.pos.x, d.pos.y, d.pos.z)); d.mesh.rotation.x += dt * 12;
    const lineCross = Math.abs(d.pos.y) > HL - 0.3;
    if (!d.alive || lineCross) {
      espPuffs(d.pos.x, d.pos.y, d.pos.z, 0xffffff, 10, 1.2, 1.3, 0.6); espSfx.puf();
      const t = espSprite(espTex('txt:PUF:#ffffff'), 0xffffff, 2); t.position.copy(g2t(d.pos.x, d.pos.y, d.pos.z + 1.2)); espFx(t, 0.8, (k, o) => { o.material.opacity = 1 - k; o.position.y += 0.02; });
      scene.remove(d.mesh); ESP.decoys.splice(i, 1); if (d.gk && d.gk.decoy === d) d.gk.decoy = null;
    }
  }
  // overlays del usuario
  if (ESP.veloT > 0) { ESP.veloT -= dt; if (ESP.veloT <= 0) espVelo(0); }
  if (ESP.ruidoT > 0) { ESP.ruidoT -= dt; if (ESP.ruidoT <= 0) espRuido(0); }
}
function espSpawnDecoy(a, tgt) {
  const gk = espGkFoe(a); if (!ballMesh) return;
  const mesh = ballMesh.clone(); scene.add(mesh);
  const dir = new THREE.Vector2(tgt.x - a.pos.x, tgt.y - a.pos.y).normalize(), sp = 21;
  const d = { mesh, pos: new THREE.Vector3(a.pos.x + dir.x * (PR + BR + 0.15) - dir.y * 0.4, a.pos.y + dir.y * (PR + BR + 0.15) + dir.x * 0.4, BR + 0.05), vel: new THREE.Vector3(dir.x * sp, dir.y * sp, 2.2), t: 0, life: 1.6, alive: true, gk };
  ESP.decoys.push(d); if (gk) { gk.decoy = d; gk.react = 0; gk.wasComing = false; }
  LOG('señuelo', a, {});
}
// colisiones con obstáculos (después de mover a todos)
function espCollide() {
  for (const o of ESP.obst) {
    if (o.kind === 'cinta') continue;
    for (const a of actors) {
      if (a.team !== o.blocks || (a.flyT > 0)) continue;
      if (o.kind === 'cono') {
        const dx = a.pos.x - o.x, dy = a.pos.y - o.y, L = Math.hypot(dx, dy), m = o.r + PR;
        if (L < m) { const nx = L > 1e-4 ? dx / L : 0, ny = L > 1e-4 ? dy / L : 1; a.pos.set(o.x + nx * m, o.y + ny * m); const vn = a.vel.x * nx + a.vel.y * ny; if (vn < 0) { a.vel.x -= vn * nx; a.vel.y -= vn * ny; } }
      } else if (o.kind === 'muro' && !a.keeper) {
        const dx = a.pos.x - o.x, dy = a.pos.y - o.y, mx = o.hw + PR, my = o.hd + PR;
        if (Math.abs(dx) < mx && Math.abs(dy) < my) {
          const px = mx - Math.abs(dx), py = my - Math.abs(dy);
          if (py < px) { a.pos.y = o.y + Math.sign(dy || -o.ball) * my; a.vel.y = 0; } else { a.pos.x = o.x + Math.sign(dx || 1) * mx; a.vel.x = 0; }
        }
      }
    }
    // el muro para el balón que viene de fuera hacia la portería
    if (o.kind === 'muro' && o.t < o.life - 0.2) {
      const s = o.ball, rel = (ball.pos.y - o.y) * s;
      if (Math.abs(ball.pos.x - o.x) < o.hw + BR && ball.pos.z < 2.5 + BR && rel > -o.hd - BR && rel < o.hd + BR && ball.vel.y * s > 0 && (prevBall.y - o.y) * s <= -o.hd - BR * 0.5) {
        if (ball.owner && !ball.owner.keeper) ball.owner = null;
        ball.pos.y = o.y - s * (o.hd + BR + 0.02); ball.vel.y = -ball.vel.y * 0.55; ball.vel.x *= 0.8; ball.vel.z = Math.max(ball.vel.z, 1.5);
        espPuffs(ball.pos.x, o.y, ball.pos.z, 0xd8b090, 4, 0.8, 1, 0.4); espSfx.golpe(); LOG('muro_para', null, {});
      }
    }
  }
}
// ---- efectos visuales por frame ----
function espRender(dt) {
  for (let i = ESP.fx.length - 1; i >= 0; i--) {
    const f = ESP.fx[i]; f.t += dt; const k = Math.min(1, f.t / f.life);
    f.upd(k, f.obj, dt);
    if (f.t >= f.life) { f.parent.remove(f.obj); espDispose(f.obj); ESP.fx.splice(i, 1); }
  }
  for (const a of actors) {
    if (a.keeper) continue;
    // murciélago: vuela (sube y baja) ; resbalón: gira ; derribado: tumbado
    let lift = 0; if (a.flyT > 0) { const k = a.flyT; lift = Math.min(1, (2.2 - k) / 0.25, k / 0.3) * (1.1 + Math.sin(S.t * 9) * 0.15); }
    a.body.position.y = lift;
    if (a.slipT > 0) { a.slipSpin = (a.slipSpin || 0) + dt * 14; a.body.rotation.y = a.slipSpin; a.body.rotation.z = Math.sin(a.slipSpin * 0.5) * 0.25; }
    else if (a.downT > 0) { const k = Math.min(1, (1.4 - a.downT) / 0.18, a.downT / 0.3); a.body.rotation.x = -1.35 * k; a.body.rotation.y = 0; }
    else if (a.body.rotation.x || a.body.rotation.y) { a.body.rotation.x = 0; a.body.rotation.y = 0; }
    if (a.freezeT > 0) a.mixer.timeScale = 0; else if (a.mixer.timeScale === 0) a.mixer.timeScale = 1;
  }
}
// ---- UI: botón y barras ----
const espMiniA = document.querySelector('#marcador .azul .espMini b'), espMiniB = document.querySelector('#marcador .rojo .espMini b');
function espUI() {
  const on = espOn() && !!user && !!ESPECIALES[user.charKey];
  document.body.classList.toggle('sinEsp', !on);
  if (!on || !btnEspecial) return;
  const v = (289 * (1 - Math.max(0, Math.min(1, user.esp || 0)))).toFixed(1);
  if (cargaEspecial._v !== v) { cargaEspecial._v = v; cargaEspecial.style.strokeDashoffset = v; }
  const full = user.esp >= 1, can = full && espCanUse(user);
  btnEspecial.classList.toggle('lleno', full); btnEspecial.classList.toggle('usable', can);
  const pa = Math.round((user.esp || 0) * 100) + '%', pb = Math.round(((rival && rival.esp) || 0) * 100) + '%';
  if (espMiniA && espMiniA._w !== pa) { espMiniA._w = pa; espMiniA.style.width = pa; espMiniA.parentNode.classList.toggle('lleno', user.esp >= 1); }
  if (espMiniB && rival && espMiniB._w !== pb) { espMiniB._w = pb; espMiniB.style.width = pb; espMiniB.parentNode.classList.toggle('lleno', rival.esp >= 1); }
}
function espSetBtnLabel() {
  if (!btnEspecial || !user) return;
  const e = ESPECIALES[user.charKey]; btnEspecial.style.setProperty('--ec', e ? e.col : '#fff');
  const n = btnEspecial.querySelector('.espNom'); if (n) n.textContent = e ? e.name : '';
}
function setEspeciales(on) {
  AJ.especiales = !!on; saveAjustes();
  const b = document.getElementById('ajEspeciales');
  if (b) { b.textContent = 'ESPECIALES: ' + (AJ.especiales ? 'SÍ' : 'NO'); b.classList.toggle('on', AJ.especiales); }
  if (!AJ.especiales) { for (const a of actors) a.esp = 0; if (ballMesh) espClear(); }
  document.body.classList.toggle('sinEsp', !AJ.especiales);
}
function espHTML(key, cls = 'espInfo') { const e = ESPECIALES[key]; return e ? `<div class="${cls}" style="--ec:${e.col}"><b>★ ${e.name}</b><span>${e.desc}</span></div>` : ''; }

// ===================== FLUJO DE PARTIDO =====================
const elA = document.getElementById('golesA'), elB = document.getElementById('golesB'), elReloj = document.getElementById('reloj');
const banner = document.getElementById('banner'), pantalla = document.getElementById('pantalla'), resultado = document.getElementById('resultado');
function showBanner(txt, cls = '', ms = 1400) {
  banner.textContent = txt; banner.className = 'on ' + cls;
  clearTimeout(showBanner.t); if (ms) showBanner.t = setTimeout(() => banner.className = cls, ms);
}
function kickoff(first) {
  for (const a of actors) a.celebrate = false;
  espClear();
  if (S.practice) { practiceBall(true); return; }
  if (first) { S.vsT = 1.5; showVsCards(true); }   // update 17: cartas enfrentadas 1,5 s antes del saque
  user.place(0, -3.2); rival.place(0, 3.2);
  gkA.place(0, -HL + 0.9); gkB.place(0, HL - 0.9);
  if (first) for (const a of [user, rival]) a.introT = a.actions.Intro ? a.actions.Intro.getClip().duration - 0.15 : 0;   // update 21
  ball.pos.set(0, 0, BR); ball.vel.set(0, 0, 0); ball.owner = null; ball.noCatch = null;
  input.shootDown = false; input.charge = 0;
  S.mode = 'kickoff'; S.pauseT = 1.1 + (first ? 1.5 : 0); if (!first) showBanner('¡YA!', '', 900);
}
function startGame() {
  if (!user) return;
  tryLandscape();
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  actx?.resume?.();
  S.score = [0, 0]; S.time = DURACION; S.goals = 0; S.saves = 0; S.shots = 0;
  if (user) user.energy = 1; if (rival) rival.energy = 1;
  for (const a of [user, rival]) if (a) a.esp = 0; ESP.usos.length = 0; espSetBtnLabel();
  elA.textContent = '0'; elB.textContent = '0'; elReloj._t = null;
  applyPracticeHud();
  applyBoots(user.model, bootEquip());
  pantalla.classList.remove('visible'); menuEl.classList.remove('visible'); hudSet(true);
  sfx.whistle(); kickoff(true);
}
document.getElementById('btnJugar').addEventListener('click', startGame);
document.getElementById('btnMenu').addEventListener('click', () => openMenu());
// ===================== BOTAS Y TIENDA (update 15) =====================
// Todas gratis. Se recolorean las zapatillas del modelo (material principal y puntera) sin tocar el personaje.
// Efectos (solo en los chuts del jugador): se integran en airStep (física real) y en la previsualización.
const BOOTS = {
  clasicas: { name: 'CLÁSICAS', desc: 'Las de siempre. Sin efecto.', c1: null, c2: null, c1v: 0xffffff },
  rosca: { name: 'ROSCA', desc: 'Efecto lateral: el balón curva hacia donde muevas el joystick de mover al soltar.', c1: 0x1f6b5a, c2: 0xd9b54a, c1v: 0x7fe0c8 },
  canon: { name: 'CAÑÓN', desc: '+15 % de potencia, pero menos control: el tiro se desvía un poco.', c1: 0x2d2e33, c2: 0xc8432c, c1v: 0xff8a6a },
  hojaseca: { name: 'HOJA SECA', desc: 'Sin giro: el balón flota y cae de golpe al final.', c1: 0xe6e0d2, c2: 0x3b4150, c1v: 0xf5efdc },
  picadora: { name: 'PICADORA', desc: 'Vaselinas con mucho retroceso: suben más, caen vertical y frenan al botar.', c1: 0x5b3f6e, c2: 0xc7b089, c1v: 0xd7b8f0 },
};
const BOOT_KEY = 'ml_botas_v1';
const BOOTS_ST = (() => { let b = null; try { b = JSON.parse(localStorage.getItem(BOOT_KEY) || 'null'); } catch (_) {} b = b && typeof b === 'object' ? b : {};
  b.owned = Array.isArray(b.owned) ? b.owned.filter((k) => BOOTS[k]) : []; if (!b.owned.includes('clasicas')) b.owned.unshift('clasicas');
  if (!BOOTS[b.equip] || !b.owned.includes(b.equip)) b.equip = 'clasicas'; return b; })();
function saveBoots() { try { localStorage.setItem(BOOT_KEY, JSON.stringify(BOOTS_ST)); } catch (_) {} }
function bootEquip() { return BOOTS_ST.equip; }
// parámetros del efecto para un chut del usuario en dirección dir (preview = sin aleatoriedad)
function bootShot(dir, lob, preview) {
  const k = bootEquip(), r = { speed: 1, curve: 0, lift: 0, dip: 0, jitter: 0, backspin: 1 };
  if (k === 'rosca') { const md = moveDir(); if (md) { const d = dir.clone().normalize(); r.curve = 0.22 * THREE.MathUtils.clamp(d.x * md.y - d.y * md.x, -1, 1) * (lob ? 0.7 : 1); } }
  else if (k === 'canon') { r.speed = 1.15; if (!preview) r.jitter = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * 4); }
  else if (k === 'hojaseca') { r.dip = lob ? 0.7 : 0.9; r.lift = lob ? 0 : 2.2; r.backspin = 0; }
  else if (k === 'picadora' && lob) { r.backspin = 2.2; r.lift = 2.6; }
  return r;
}
const BOOT_MAIN = /(_Zapa|Shoe_Navy|_Bota_Marino)$/, BOOT_TOE = /(_Zapa_Puntera|Shoe_Toe_Gray|_Bota_Puntera)$/;
function applyBoots(model, key) {
  if (!model) return false;
  const b = BOOTS[key] || BOOTS.clasicas; let found = false;
  const map = model.userData.bootMats || (model.userData.bootMats = new Map());
  model.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => {
      if (!m || !m.name) return m;
      const main = BOOT_MAIN.test(m.name), toe = !main && BOOT_TOE.test(m.name);
      if (!main && !toe) return m;
      found = true;
      let c = map.get(m.uuid);
      if (!c) { c = m.userData.bootClone ? m : (m.userData.toon ? makeToonMat(m) : m.clone()); c.userData.bootClone = true; c.userData.orig = m.color.getHex(); map.set(m.uuid, c); map.set(c.uuid, c); }
      const hex = main ? b.c1 : b.c2;
      if (c.userData.toon) {   // update 20: zapatillas texturizadas (Tripo): tinte sobre la textura; Clásicas = textura original intacta
        const hx = main ? b.c1 : null; c.userData.toonU.uDyeAmt.value = hx === null || hx === undefined ? 0 : 0.8; if (hx !== null && hx !== undefined) c.userData.toonU.uDye.value.setHex(hx);
        return c;
      }
      c.color.setHex(hex === null || hex === undefined ? c.userData.orig : hex);
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  return found;
}
function refreshBootsVisual() {
  for (const m of menuChars) applyBoots(m.model, bootEquip());
  renderPortraits(); if (S.mode === 'menu') showBigCard();
  if (user) applyBoots(user.model, bootEquip());
}
const tiendaEl = document.getElementById('tienda'), tiendaLista = document.getElementById('tiendaLista');
function renderTienda() {
  tiendaLista.innerHTML = '';
  for (const [k, b] of Object.entries(BOOTS)) {
    const own = BOOTS_ST.owned.includes(k), eq = BOOTS_ST.equip === k;
    const d = document.createElement('div'); d.className = 'bota' + (eq ? ' equipada' : ''); d.dataset.k = k;
    const c1 = b.c1 === null ? '#1a1d2b' : '#' + b.c1.toString(16).padStart(6, '0'), c2 = b.c2 === null ? '#2e3036' : '#' + b.c2.toString(16).padStart(6, '0');
    d.innerHTML = `<div class="botaIco" style="--c1:${c1};--c2:${c2}"><i></i><b></b><u></u></div><div class="botaTxt"><div class="botaNom">${b.name}</div><div class="botaDesc">${b.desc}</div></div>` +
      `<button class="botaBtn ${eq ? 'eq' : own ? 'own' : ''}">${eq ? 'EQUIPADAS' : own ? 'EQUIPAR' : 'OBTENER · GRATIS'}</button>`;
    d.querySelector('button').addEventListener('click', () => {
      if (!BOOTS_ST.owned.includes(k)) { BOOTS_ST.owned.push(k); sfx.steal && actx && sfx.steal(); }
      else BOOTS_ST.equip = k;
      saveBoots(); refreshBootsVisual(); renderTienda(); LOG('tienda', null, { k, equip: BOOTS_ST.equip });
    });
    tiendaLista.appendChild(d);
  }
}
function renderTiendaEsp() {   // update 29: especiales de los personajes (el tuyo primero)
  const el = document.getElementById('tiendaEsp'); if (!el) return;
  const ks = [CHARS[sel].key, ...CHARS.map((c) => c.key).filter((k) => k !== CHARS[sel].key)];
  el.innerHTML = ks.map((k, i) => { const c = CHARS.find((x) => x.key === k), e = ESPECIALES[k]; return `<div class="tiEsp${i === 0 ? ' tuyo' : ''}" style="--ec:${e.col};--c:${c.color}"><img src="${c.badge || c.card}" alt=""><div><div class="tiEspNom"><b>${e.name}</b><small>${c.name}${i === 0 ? ' · TU PERSONAJE' : ''}</small></div><div class="tiEspDesc">${e.desc}</div></div></div>`; }).join('');
}
function openTienda() { if (S.mode !== 'menu') return; renderTienda(); renderTiendaEsp(); tiendaEl.classList.add('visible'); }
function closeTienda() { tiendaEl.classList.remove('visible'); }
document.getElementById('btnMenuTienda').addEventListener('click', openTienda);
document.getElementById('tiendaCerrar').addEventListener('click', closeTienda);

// ===================== MODO PRÁCTICA (update 15) =====================
// Solo tu personaje y el balón en el campo completo, porterías vacías, sin tiempo. Marcador = goles / chuts.
// Tras gol o fuera el balón reaparece al instante delante del jugador.
function practiceBall(resetPos) {
  if (resetPos) { user.place(0, -6); user.vel.set(0, 0); user.face.set(0, 1); }
  Object.assign(user, { kickPending: null, stun: 0, celebrate: false });
  const f = user.face.lengthSq() > 0.01 ? user.face.clone().normalize() : new THREE.Vector2(0, 1);
  const bx = THREE.MathUtils.clamp(user.pos.x + f.x * 1.6, -WX + 1, WX - 1), by = THREE.MathUtils.clamp(user.pos.y + f.y * 1.6, -HL + 1.5, HL - 1.5);
  ball.pos.set(bx, by, BR); ball.vel.set(0, 0, 0); ball.w.set(0, 0, 0); ball.owner = null; ball.noCatch = null; ball.noCatchT = 0; ball.lineEvent = null; ball.backspin = 0;
  input.shootDown = false; input.charge = 0;
  S.mode = 'play';
}
function applyPracticeHud() {
  const pr = !!S.practice;
  document.body.classList.toggle('practica', pr);
  for (const a of [rival, gkA, gkB]) if (a) { a.root.visible = !pr; if (pr) { a.place(0, 900); a.vel.set(0, 0); } }
  if (user) actors = pr ? [user] : [user, rival, gkA, gkB];
  document.querySelector('#marcador .azul .nom').textContent = pr ? 'GOLES' : CHARS.find((c) => c.key === matchKeys[0]).name;
  document.querySelector('#marcador .rojo .nom').textContent = pr ? 'CHUTS' : CHARS.find((c) => c.key === matchKeys[1]).name;
  if (pr) { elReloj.textContent = 'PRÁCTICA'; elReloj._t = 'P'; elReloj.classList.remove('poco'); }
  else { elReloj._t = fmt(S.time); elReloj.textContent = elReloj._t; }
}
function practiceLine(ev) {
  if (ev.type === 'gol' && ev.s > 0) { S.score[0]++; S.goals++; showBanner('¡GOL!', 'bAzul', 900); sfx.goal(); }
  else showBanner(ev.type === 'gol' ? '¡EN PROPIA!' : (ev.z > GH - 0.3 ? '¡POR ENCIMA!' : '¡FUERA!'), '', 800);
  LOG(ev.type === 'gol' ? 'practica_gol' : 'practica_fuera', user, { s: ev.s });
  if (aim.active) aimEnd(null, true);
  if (ev.type === 'gol') { S.mode = 'goal'; S.pauseT = 1.8; ball.owner = null; user.kickPending = null; return; }   // se ve el balón en la red
  practiceBall(false);
}
function goalScored(team) {
  if (S.practice) { practiceLine({ type: 'gol', s: team === 0 ? 1 : -1 }); return; }
  S.score[team]++; S.goals++; LOG('gol', null, { team });
  elA.textContent = S.score[0]; elB.textContent = S.score[1];
  showBanner('¡GOOOL!', team === 0 ? 'bAzul' : 'bRojo', 1800); sfx.goal();
  S.mode = 'goal'; S.pauseT = 2.6; ball.owner = null;   // update 16: tiempo para ver el balón en la red
  for (const a of actors) { a.celebrate = a.team === team; a.kickPending = null; a.diveT = 0; a.tackleT = 0; a.kickAnimT = 0; }
}
// balón fuera por la línea de fondo (incl. por encima del larguero): saque de puerta del portero de ese lado
function ballOut(ev) {
  S.mode = 'out'; S.pauseT = 1.3; S.outSide = ev.s;
  LOG('fuera', ball.lastTouch, { s: ev.s, z: +(ev.z || 0).toFixed(2) });
  showBanner(ev.z > GH - 0.3 ? '¡POR ENCIMA!' : '¡FUERA!', '', 1100);
  for (const a of actors) { a.kickPending = null; }
  if (aim.active) aimEnd(null, true);
}
function goalKick() {
  const k = S.outSide > 0 ? gkB : gkA;
  k.place(THREE.MathUtils.clamp(ball.pos.x * 0.2, -3, 3), S.outSide * (HL - 2.5));
  ball.vel.set(0, 0, 0); ball.lineEvent = null; giveBall(k); ball.pos.set(k.pos.x, k.pos.y, 1.1 * ESCALA);
  k.holdT = 0.2;
  S.mode = 'play';
}
function endGame() {
  S.mode = 'end'; sfx.whistle(); setEnPartido(false);
  const [a, b] = S.score;
  for (const x of actors) x.celebrate = (a > b && x.team === 0) || (b > a && x.team === 1);
  resultado.innerHTML = `<div style="font-size:18px;opacity:.85">¡FINAL DEL PARTIDO!</div><div style="font-size:44px;margin:6px 0"><span style="color:#5ea0ff">${a}</span> - <span style="color:#ff6262">${b}</span></div>` +
    (a > b ? '<div style="color:#ffd23f">¡HAS GANADO! 🏆</div>' : a < b ? '<div>Has perdido… ¡revancha!</div>' : '<div>¡Empate!</div>');
  if (S.comp) {   // update 24: partido de torneo / liga -> se guarda y se vuelve al cuadro / tabla
    showBanner(`FINAL ${a} - ${b}`, a > b ? 'bAzul' : a < b ? 'bRojo' : '', 1700);
    clearTimeout(endGame.t); endGame.t = setTimeout(() => { if (S.mode === 'end' && S.comp) compAfterMatch(a, b); }, 1800);
    return;
  }
  document.getElementById('btnJugar').textContent = 'JUGAR OTRA VEZ';
  pantalla.classList.add('visible');
}
function fmt(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }

// ===================== BUCLE =====================
const prevBall = new THREE.Vector3();
// Turbo: el impulso se nota desde el primer frame (velocidad a tope de sprint en la dirección del joystick)
function turboKick(w) {
  if (!user || S.mode !== 'play' || S.paused) return;
  const wish = w || moveDir(); if (!wish || wish.lengthSq() < 0.04) return;
  if (user.stun > 0 || user.dashT > 0 || user.dribbleT > 0 || user.diveT > 0) return;
  if (!(user.energy > TURBO_MIN)) return;
  user.sprinting = true; user._spr = true;
  const sp = SPEED_USER * user.sf.vel * (ball.owner === user ? 0.9 : 1) * TURBO_MULT;
  const d = wish.clone().normalize();
  if (user.vel.dot(d) < sp) user.vel.copy(d).multiplyScalar(sp);
}
function update(dt) {
  S.t += dt;
  if (S.vsT > 0) { S.vsT -= dt; if (S.vsT <= 0) { S.vsT = 0; showVsCards(false); showBanner('¡YA!', '', 900); } }
  if (S.mode === 'kickoff') { S.pauseT -= dt; if (S.pauseT <= 0) S.mode = 'play'; }
  if (S.mode === 'goal') { S.pauseT -= dt; if (S.pauseT <= 0) { if (S.practice) practiceBall(false); else if (S.time <= 0) endGame(); else kickoff(); } }
  if (S.mode === 'out' && S.time <= 0) endGame();
  const playing = S.mode === 'play';
  if (playing && !S.practice) {
    S.time -= dt; if (S.time <= 0) { S.time = 0; if (S.score[0] !== S.score[1] || true) { endGame(); } }
  }
  if (S.practice) { const sc = S.score[0] + '/' + S.shots; if (elA._s !== sc) { elA._s = sc; elA.textContent = S.score[0]; elB.textContent = S.shots; } }
  else { const rt = fmt(S.time); if (rt !== elReloj._t) { elReloj._t = rt; elReloj.textContent = rt; elReloj.classList.toggle('poco', S.time <= 15); } }

  // --- usuario ---
  const wish = new THREE.Vector2(input.jx, input.jy);
  if (input.keys.u) wish.y += 1; if (input.keys.d) wish.y -= 1; if (input.keys.l) wish.x -= 1; if (input.keys.r) wish.x += 1;
  if (user && user.invertT > 0) wish.multiplyScalar(-1);   // update 29: INTERFERENCIA (controles invertidos)
  if (wish.lengthSq() > 1e-6) wish.normalize();   // update 23: el joystick solo da dirección; cualquier inclinación (fuera de la zona muerta del 12 %) = velocidad máxima
  const canMove = playing;
  if (playing) runBuffer();
  if (user) updateEnergy(user, playing && input.turboDown, wish.lengthSq() > 0.04, dt);
  if (user && user.sprinting && !user._spr && wish.lengthSq() > 0.04) turboKick(wish);
  if (user) user._spr = user.sprinting;
  const userSp = SPEED_USER * (user ? user.sf.vel : 1) * (ball.owner === user ? 0.9 : 1) * (input.shootDown ? 0.55 : 1) * (user && user.sprinting ? TURBO_MULT : 1) * (user ? espSpeedMul(user) : 1);
  moveActor(user, canMove ? wish : new THREE.Vector2(), userSp, dt);
  if (input.shootDown) {
    if (ball.owner !== user) { input.shootDown = false; input.charge = 0; btnChutar.classList.remove('pulsado'); }
    else input.charge = Math.min(1, input.charge + dt / 0.85);
  }
  // --- rival IA ---
  if (!S.practice) {
  const aiWish = playing && rival.freezeT <= 0 && rival.slipT <= 0 ? espAiWish(rival, aiField(rival, user, dt), dt) : new THREE.Vector2();
  if (playing) espAI(rival, user, dt);   // update 29: el bot usa su especial
  if (rival) updateEnergy(rival, playing && !!rival.wantTurbo, aiWish.lengthSq() > 0.04, dt);
  const aiSp = SPEED_AI * rival.sf.vel * (ball.owner === rival ? 0.88 : 1) * (rival && rival.sprinting ? TURBO_MULT : 1) * espSpeedMul(rival);
  moveActor(rival, aiWish, aiSp, dt);
  // --- porteros ---
  for (const k of [gkA, gkB]) {
    const r = playing ? aiKeeper(k, dt) : null;
    if (r && r.wish) { moveActor(k, r.wish, SPEED_GK * k.sf.ref * (k.fetidaT > 0 ? 0.6 : 1), dt); if (ball.owner !== k && k.diveT <= 0) k.face.copy(r.face); }
    else moveActor(k, new THREE.Vector2(), SPEED_GK, dt);
    const s = k.team === 0 ? -1 : 1;
    // el portero no sale de su área
    k.pos.y = s > 0 ? THREE.MathUtils.clamp(k.pos.y, HL - 6, HL - 0.7) : THREE.MathUtils.clamp(k.pos.y, -HL + 0.7, -HL + 6);
    k.pos.x = THREE.MathUtils.clamp(k.pos.x, -10, 10);
  }
  }
  separate();
  espCollide();
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
    for (const a of S.practice ? [user] : [user, rival]) {
      if (ball.owner === a || a.stun > 0) continue;
      if (ball.noCatch === a && ball.noCatchT > 0) continue;
      const d = Math.hypot(ball.pos.x - a.pos.x, ball.pos.y - a.pos.y);
      if (ball.owner && !ball.owner.keeper) {
        // robo: solo con entrada (dash) contra el poseedor
        const o = ball.owner; const dd = a.pos.distanceTo(o.pos);
        if ((a.dashT > 0 || a.dashEnded) && dd < (PR * 2 + 0.5) * a.sf.ent && ball.ownT > 0.55) {
          // FÍSICO vs ENTRADA: probabilidad (0-40 %) de aguantar la entrada sin perder el balón
          const keep = THREE.MathUtils.clamp(0.1 + (o.sf.t.fis - a.sf.t.ent) * 0.015, 0, 0.4);
          if (o.ghostT > 0 || o.flyT > 0) {   // update 29: SPRINT SOMBRA / VUELO NOCTURNO: la entrada no le toca
            a.dashT = 0; a.dashEnded = false; a.dashHit = true; a.stun = DASH_MISS_STUN;
            sfx.miss(); showBanner(o.flyT > 0 ? '¡POR ENCIMA!' : '¡SOMBRA!', o.team === 0 ? 'bAzul' : 'bRojo', 700); LOG('especial_esquiva', o, { vs: NAME(a) });
          } else if (o.dribbleT <= 0 && Math.random() < keep) {
            a.dashT = 0; a.dashEnded = false; a.dashHit = true; a.stun = DASH_MISS_STUN;
            showBanner('¡AGUANTA!', o.team === 0 ? 'bAzul' : 'bRojo', 700); LOG('aguanta_entrada', o, { vs: NAME(a), p: +keep.toFixed(2) });
          } else if (o.dribbleT > 0) {
            a.dashT = 0; a.dashEnded = false; a.dashHit = true; a.stun = DASH_MISS_STUN;
            sfx.miss(); showBanner('¡REGATE!', o.team === 0 ? 'bAzul' : 'bRojo', 700); LOG('regate_falla_entrada', o, { vs: NAME(a) });
          } else {
            a.dashHit = true; a.dashT = 0; a.dashEnded = false; a.tackleT = Math.min(a.tackleT, 0.22);
            giveBall(a); sfx.steal(); showBanner('¡ROBO!', a.team === 0 ? 'bAzul' : 'bRojo', 700);
          }
        }
      } else if (!ball.owner && d < PR + BR + 0.15 && ball.pos.z < 1.05 * ESCALA) {   // solo balones bajos (pecho para abajo)
        const sp = Math.hypot(ball.vel.x, ball.vel.y);
        if (sp < 24 || a.dashT > 0) { giveBall(a); if (a.dashT > 0) a.tackleT = Math.min(a.tackleT, 0.22); a.dashT = 0; a.dashHit = true; a.dashEnded = false; }
        else { collideCircle2D(a.pos.x, a.pos.y, PR, 0.4); ball.lastTouch = a; }
      }
    }
    for (const a of S.practice ? [user] : [user, rival]) {
      if (a.dashEnded && !a.dashHit) { a.stun = DASH_MISS_STUN; sfx.miss(); LOG('entrada_falla', a, {}); }
      a.dashEnded = false;
    }
    if (!S.practice) { keeperContact(gkA); keeperContact(gkB); }
    // gol: el balón entero cruza la línea entre postes y por debajo del larguero (lo detecta stepBall)
    const ev = ball.lineEvent;
    if (ev) {
      ball.lineEvent = null;
      if (S.practice) practiceLine(ev);
      else if (ev.type === 'gol') goalScored(ev.s > 0 ? 0 : 1);
      else ballOut(ev);
    }
  } else ball.lineEvent = null;
  espUpdate(dt, playing);   // update 29: especiales
  if (S.mode === 'out') { S.pauseT -= dt; if (S.pauseT <= 0) goalKick(); }

  // --- apuntado (CHUTAR / REGATE mantenidos) ---
  if (aim.active) {
    if (ball.owner !== user || S.mode !== 'play') aimEnd(null, true);
    else if (!aim.shown && performance.now() - aim.t0 > AIM_SHOW_MS) { showAimJoy(true); aim.el.classList.add('apuntando'); }
  }
  // --- UI botones ---
  const hasBall = ball.owner === user;
  if (!editor.on) {
    acciones.classList.toggle('con-balon', !!hasBall);
    acciones.classList.toggle('sin-balon', !hasBall);
  }
  const ring = (el, fill) => { if (!el) return; const v = (289 * (1 - Math.max(0, Math.min(1, fill)))).toFixed(1); if (el._v !== v) { el._v = v; el.style.strokeDashoffset = v; } };
  ring(cargaAro, input.shootDown ? input.charge : (aim.active && aim.kind === 'chutar' && aim.dragged && !aim.cancel ? aim.power : 0));
  const altoC = aim.active && aim.kind === 'alto' && !aim.cancel ? (aim.dragged ? aim.power : 0) : -1;
  const qC = input.qT0 && hasBall ? altoCharge(input.qT0) : -1;   // teclado Q: carga por tiempo (solo teclado)
  ring(cargaAlto, Math.max(0, altoC, qC));
  updateChargeBar(qC);
  ring(cargaRegate, user ? (user.dribbleCd > 0 ? 1 - user.dribbleCd / DRIBBLE_CD : 1) : 1);
  ring(cargaEntrada, user ? (user.dashCd > 0 ? 1 - user.dashCd / DASH_CD_USER : 1) : 1);
  ring(cargaTurbo, user ? user.energy : 1);
  btnRegate.classList.toggle('cd', !!(user && user.dribbleCd > 0));
  btnEntrada.classList.toggle('cd', !!(user && user.dashCd > 0));
  btnTurbo.classList.toggle('pulsado', !!input.turboDown);
  btnTurbo.classList.toggle('activo', !!(user && user.sprinting));
  btnTurbo.classList.toggle('vacio', !!(user && user.energy <= TURBO_MIN && !user.sprinting));
  espUI();
}

// línea de apuntado en el césped (botones CHUTAR / REGATE mantenidos)
function makeAimLine() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const edge = new THREE.MeshBasicMaterial({ color: 0x14193a, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
  // tramo: plano 1×1 que crece hacia -Z local (adelante); se escala en Z
  const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2); sg.translate(0, 0, -0.5);
  const shadow = new THREE.Mesh(sg, edge); shadow.renderOrder = 3; shadow.position.y = 0.035;
  const strip = new THREE.Mesh(sg, mat); strip.renderOrder = 4; strip.position.y = 0.045;
  const hs = new THREE.Shape(); hs.moveTo(-0.85, 0); hs.lineTo(0.85, 0); hs.lineTo(0, 1.25); hs.closePath();
  const hg = new THREE.ShapeGeometry(hs); hg.rotateX(-Math.PI / 2);
  const head = new THREE.Mesh(hg, mat); head.renderOrder = 4; head.position.y = 0.05;
  const headSh = new THREE.Mesh(hg, edge); headSh.renderOrder = 3; headSh.position.y = 0.04; headSh.scale.setScalar(1.25);
  g.add(shadow, strip, headSh, head);
  g.userData = { strip, shadow, head, headSh, mat };
  g.visible = false;
  return g;
}
// trayectoria prevista del CHUT ALTO: puntos en arco + sombra en el césped + punto de caída
const LOB_DOTS = 34;
let lobArc, lobGround, lobLand, flightMark;
const _lobPts = [], _m4 = new THREE.Matrix4();
function makeLobPreview() {
  lobArc = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), LOB_DOTS);
  lobGround = new THREE.InstancedMesh(new THREE.CircleGeometry(0.11, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x14193a, transparent: true, opacity: 0.35, depthWrite: false }), LOB_DOTS);
  lobGround.renderOrder = 3;
  lobLand = new THREE.Group();
  const r1 = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.05, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }));
  const r2 = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  const cr = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.12).rotateX(-Math.PI / 2), r1.material);
  const cr2 = cr.clone(); cr2.rotation.y = Math.PI / 2;
  for (const m of [r1, r2, cr, cr2]) { m.renderOrder = 4; m.position.y = 0.05; lobLand.add(m); }
  flightMark = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
  flightMark.renderOrder = 3;
  for (const o of [lobArc, lobGround, lobLand, flightMark]) { o.visible = false; o.frustumCulled = false; scene.add(o); }
}
// barra de carga del CHUT ALTO encima del botón (zona perfecta marcada); c < 0 = oculta
const cargaBarra = document.getElementById('cargaBarra'), cargaFill = cargaBarra && cargaBarra.querySelector('.fill');
if (cargaBarra) document.getElementById('app').appendChild(cargaBarra);   // relativo a #app, no al panel de botones
let _cbOn = false, _cbW = '';
function updateChargeBar(c) {
  if (!cargaBarra) return;
  const on = c >= 0;
  if (on !== _cbOn) {
    _cbOn = on; cargaBarra.classList.toggle('on', on);
    if (on) {   // colocar sobre el botón (el usuario puede haberlo movido en el editor)
      const r = btnRect(btnAlto), app = document.getElementById('app').getBoundingClientRect();
      cargaBarra.style.left = (r.left - app.left + r.width / 2) + 'px';
      cargaBarra.style.top = (r.top - app.top + r.height / 2 - aimRadius(btnAlto) - 8) + 'px';   // por encima del mini-joystick
    }
  }
  if (!on) return;
  const w = (c * 100).toFixed(1) + '%';
  if (w !== _cbW) {
    _cbW = w; cargaFill.style.width = w;
    cargaBarra.dataset.z = c < ALTO_PERFECT[0] ? 'suave' : c <= ALTO_PERFECT[1] ? 'perfecta' : 'alta';
  }
}
function updateShotPreview() {   // update 15: con botas de efecto, el chut con mini-joystick enseña su trayectoria (curva / caída)
  const bf = bootShot(aim.dir, false, true), pw = 0.35 + 0.65 * aim.power, sp = (13 + 19 * pw) * bf.speed;
  const start = new THREE.Vector3(ball.pos.x + aim.dir.x * 0.4, ball.pos.y + aim.dir.y * 0.4, BR + 0.05);
  predictFlight(start, new THREE.Vector3(aim.dir.x * sp, aim.dir.y * sp, 0.8 + 3.2 * pw * pw), _lobPts, 1.6, 1 / 120, bf);
  const n = _lobPts.length / 3;
  for (let i = 0; i < LOB_DOTS; i++) {
    const k = Math.min(n - 1, Math.round((i + 0.5) / LOB_DOTS * (n - 1))) * 3;
    _m4.makeTranslation(_lobPts[k], _lobPts[k + 2], -_lobPts[k + 1]); lobArc.setMatrixAt(i, _m4);
    _m4.makeTranslation(_lobPts[k], 0.03, -_lobPts[k + 1]); lobGround.setMatrixAt(i, _m4);
  }
  lobArc.instanceMatrix.needsUpdate = true; lobGround.instanceMatrix.needsUpdate = true;
  lobArc.material.color.setHex(aim.onGoal ? 0x5dff8a : BOOTS[bootEquip()].c1v);
  aim.shotPrev = { curve: +bf.curve.toFixed(3), dip: bf.dip, end: [+_lobPts[(n - 1) * 3].toFixed(2), +_lobPts[(n - 1) * 3 + 1].toFixed(2)] };
}
function updateLobPreview(on, shotPrev) {
  if (!lobArc) return;
  lobArc.visible = lobGround.visible = !!(on || shotPrev); lobLand.visible = !!on;
  if (shotPrev && !on) { updateShotPreview(); return; }
  if (!on) return;
  if (!aim.dragged) aim.dir.copy(lobDir());
  aim.lobP = aim.dragged && !aim.cancel ? aim.power : 0;
  const lp = lobParams(aim.lobP);
  const start = new THREE.Vector3(ball.pos.x + aim.dir.x * 0.4, ball.pos.y + aim.dir.y * 0.4, BR + 0.02);
  const bf = bootShot(aim.dir, true, true);
  const land = predictFlight(start, new THREE.Vector3(aim.dir.x * lp.h * bf.speed, aim.dir.y * lp.h * bf.speed, lp.vz * bf.speed), _lobPts, 5, 1 / 120, bf);
  const n = _lobPts.length / 3;
  for (let i = 0; i < LOB_DOTS; i++) {
    const k = Math.min(n - 1, Math.round((i + 0.5) / LOB_DOTS * (n - 1))) * 3;
    const x = _lobPts[k], y = _lobPts[k + 1], z = _lobPts[k + 2];
    _m4.makeTranslation(x, z, -y); lobArc.setMatrixAt(i, _m4);
    _m4.makeTranslation(x, 0.03, -y); lobGround.setMatrixAt(i, _m4);
  }
  lobArc.instanceMatrix.needsUpdate = true; lobGround.instanceMatrix.needsUpdate = true;
  lobLand.position.set(land.x, 0, -land.y);
  lobLand.children[0].material.color.setHex(0xffffff);   // update 22: diana de caída siempre blanca (sin pista verde/roja)
  aim.lobLand = { c: +aim.lobP.toFixed(2), x: +land.x.toFixed(2), y: +land.y.toFixed(2), peak: +land.peak.toFixed(2), dist: +land.dist.toFixed(2) };
  const perf = aim.lobP >= ALTO_PERFECT[0] && aim.lobP <= ALTO_PERFECT[1];
  void perf; lobArc.material.color.setHex(0xffffff);   // update 22: arco siempre blanco (sin pista de la zona perfecta)
}
function updateFlightMark() {
  if (!flightMark) return;
  const on = !ball.owner && ball.pos.z > 1.4 && S.mode !== 'menu';
  flightMark.visible = on;
  if (!on) return;
  const l = predictFlight(ball.pos, ball.vel, null, 4, 1 / 60, ball.fx);
  flightMark.position.set(l.x, 0.04, -l.y);
  flightMark.scale.setScalar(0.8 + Math.min(1.2, ball.pos.z * 0.08));
}
function updateAimLine() {
  if (!aimLine) return;
  const on = aim.active && aim.shown && !aim.cancel && user && ball.owner === user && S.mode === 'play';
  updateLobPreview(on && aim.kind === 'alto', on && aim.kind === 'chutar' && aim.dragged && bootEquip() !== 'clasicas');
  updateFlightMark();
  aimLine.visible = !!on && aim.kind !== 'alto';
  if (!aimLine.visible) return;
  if (!aim.dragged) {      // mantenido sin arrastrar: enseña la dirección del toque rápido
    const md = moveDir();
    aim.dir.copy(md || (aim.kind === 'chutar' ? goalCenter(user.team).sub(user.pos).normalize() : aim.dir));
  }
  const isShot = aim.kind === 'chutar';
  const len = isShot ? (aim.dragged ? 5 + 15 * aim.power : 11) : DRIBBLE_SPEED * DRIBBLE_T + 1.2;
  const u = aimLine.userData, start = 0.9 * ESCALA, w = isShot ? 0.42 : 0.5;
  u.mat.color.set(isShot ? (aim.dragged ? (aim.onGoal ? 0x5dff8a : new THREE.Color().setHSL(0.14 - 0.12 * aim.power, 1, 0.55)) : 0xffd23f) : 0xd77bff);
  const body = Math.max(0.3, len - start - 1.25);
  for (const m of [u.strip, u.shadow]) { m.scale.set(m === u.shadow ? w + 0.16 : w, 1, body); m.position.z = -start; }
  u.head.position.z = -(start + body); u.headSh.position.z = -(start + body) + 0.12;
  aimLine.position.copy(g2t(user.pos.x, user.pos.y, 0));
  aimLine.rotation.y = Math.atan2(-aim.dir.x, aim.dir.y);
}
function render(dt) {
  updateNet(dt);
  if (S.mode === 'menu') { renderMenu(dt); return; }
  for (const a of actors) a.sync(dt, S.t);
  espRender(dt);   // update 29: efectos de especiales (después de sync: tumbado / vuelo / resbalón)
  ballMesh.position.copy(g2t(ball.pos.x, ball.pos.y, ball.pos.z));
  // giro del balón: en el suelo rueda sin deslizar (ω = up×v / r, con transición tras el bote); en el aire conserva su giro
  const v = _wv.set(ball.vel.x, 0, -ball.vel.y);
  if (ball.owner && !ball.owner.keeper) v.set(ball.owner.vel.x, 0, -ball.owner.vel.y);
  if (ball.owner && ball.owner.keeper) ball.w.multiplyScalar(Math.exp(-6 * dt));
  else if (ball.owner || ball.pos.z <= BR + 0.03) { _wa.set(0, 1, 0).cross(v).multiplyScalar(1 / BR); ball.w.lerp(_wa, 1 - Math.exp(-(ball.owner ? 30 : 12) * dt)); }
  else ball.w.multiplyScalar(Math.exp(-0.25 * dt));
  const wl = ball.w.length();
  if (wl > 0.05) ballMesh.rotateOnWorldAxis(_wa.copy(ball.w).multiplyScalar(1 / wl), wl * dt);
  ballShadow.position.set(ball.pos.x, 0.025, -ball.pos.y);
  ballGhost.position.copy(ballMesh.position); ballGhost.quaternion.copy(ballMesh.quaternion);
  const h = ball.pos.z - BR; ballShadow.scale.setScalar(Math.max(0.45, 1 + h * 0.05)); ballShadow.material.opacity = Math.max(0.12, 0.42 - h * 0.025);   // sombra: más grande y clara cuanto más alto
  // flecha de apuntado
  if (input.shootDown && ball.owner === user) {
    aimArrow.visible = true; aimArrow.position.copy(g2t(user.pos.x, user.pos.y, 0.05));
    aimArrow.rotation.y = Math.atan2(-user.face.x, user.face.y);
    aimArrow.scale.set(1, 1, 0.6 + 2.4 * input.charge);
    aimArrow.children[0].material.color.setHSL(0.13 - 0.13 * input.charge, 1, 0.55);
  } else aimArrow.visible = false;
  updateAimLine();
  if (HORIZONTAL) updateHorizCam(false);
  if (renderer.shadowMap.enabled && (++render.n % shadowEvery) === 0) renderer.shadowMap.needsUpdate = true;
  syncOutline(); renderer.render(scene, camera);
  drawTrail();
  checkLatency();
}

render.n = 0;
let last = performance.now(), fpsAcc = 0, fpsN = 0;
frame.n = 0;
window.__game.fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (HORIZONTAL && (++frame.n % 30) === 0 && vpKey() !== lastVP) onViewportChange();   // tamaño cambiado sin evento
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (window.__game.paused) return;   // solo para pruebas automáticas (avance manual con __game.advance)
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { window.__game.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; qualityTick(window.__game.fps); updateFpsMeter(); }
  if (S.paused) { if (ballMesh) render(0); return; }   // menú de pausa abierto: juego congelado
  if (S.mode !== 'menu' && S.mode !== 'end') update(dt); else { for (const a of actors) a.vel.multiplyScalar(0.8); }
  if (S.mode === 'menu' || ballMesh) render(dt);
}

// ===================== PAUSA (tocar el marcador) =====================
const pausaEl = document.getElementById('pausa'), marcadorEl = document.getElementById('marcador');
function resetInputs() {
  input.keys = {}; input.turboDown = false; releaseShoot(true);
  if (typeof aimEnd === 'function') aimEnd(null, true);
  if (typeof swipeEnd === 'function') swipeEnd(null, true);
  joyId = null; input.jx = input.jy = 0; joyPunta.style.transform = ''; setJoy(joyHome.x, joyHome.y);
}
function openPause() {
  if (S.paused || !['play', 'kickoff', 'goal', 'out'].includes(S.mode)) return;
  S.paused = true; resetInputs();
  pausaEl.classList.add('visible'); LOG('pausa', null, {});
}
function resumeGame() {
  if (!S.paused) return;
  S.paused = false; pausaEl.classList.remove('visible'); last = performance.now();
}
function quitMatch() {
  S.vsT = 0; showVsCards(false);
  S.paused = false; pausaEl.classList.remove('visible'); resetInputs();
  if (S.practice) { S.practice = false; applyPracticeHud(); }
  if (ballMesh) { ball.owner = null; ball.vel.set(0, 0, 0); espClear(); }
  LOG('salir_partido', null, {});
  const sc = S.comp; S.comp = null;
  openMenu();
  if (sc) openComp(sc.type);   // update 24: de vuelta al cuadro / tabla (el partido queda pendiente)
}
marcadorEl.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); openPause(); });
document.getElementById('btnReanudar').addEventListener('click', resumeGame);
document.getElementById('btnSalir').addEventListener('click', quitMatch);
document.getElementById('btnReiniciarBalon').addEventListener('click', () => { if (!S.practice) return; practiceBall(false); resumeGame(); LOG('practica_reiniciar', user, {}); });
pausaEl.addEventListener('pointerdown', (e) => { if (e.target === pausaEl) { e.preventDefault(); resumeGame(); } });

// ===================== MENÚ DE PERSONAJES =====================
const menuEl = document.getElementById('menu');
const hudEls = ['hud', 'joyZona', 'acciones'].map((id) => document.getElementById(id));
function hudSet(on) { for (const e of hudEls) if (e) e.style.visibility = on ? '' : 'hidden'; setEnPartido(on); }
// update 25: la zona de deslizamiento solo existe en partido (antes tapaba el menú y la pantalla final -> "se congela")
function setEnPartido(on) { document.body.classList.toggle('enPartido', !!on); if (!on && typeof swipeEnd === 'function') swipeEnd(null, true); }
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
    const model = applyToon(matte(SkeletonUtils.clone(GLB[c.key].scene)), c.key);
    model.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
    const root = new THREE.Group(); root.add(model); root.visible = false; menuScene.add(root);
    const mixer = new THREE.AnimationMixer(model); const actions = {};
    for (const clip of GLB[c.key].animations) actions[clip.name] = mixer.clipAction(clip);
    const cel = actions.Celebrate; cel.setLoop(THREE.LoopOnce, 1); cel.clampWhenFinished = true;
    const intro = actions.Intro;   // update 21: presentación propia de los personajes Tripo
    if (intro) { intro.setLoop(THREE.LoopOnce, 1); intro.clampWhenFinished = true; }
    actions.Idle.play();
    mixer.addEventListener('finished', (e) => {
      if (e.action === cel || (intro && e.action === intro)) { actions.Idle.reset().play(); e.action.crossFadeTo(actions.Idle, 0.35, false); }
    });
    menuChars.push({ root, model, mixer, actions });
  }
  for (const m of menuChars) applyBoots(m.model, bootEquip());
}
// ===================== CARTAS (update 17) =====================
// Retratos: render offscreen de los modelos 3D reales del menú (con las botas equipadas) a una imagen por personaje.
const PORTRAITS = {};
function renderPortraits() {
  try {
    const W = 300, H = 330;
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const ps = new THREE.Scene();
    ps.add(new THREE.HemisphereLight(0xffffff, 0x3a4566, 2.4));
    const dl = new THREE.DirectionalLight(0xffffff, 2.0); dl.position.set(2.5, 4, 5); ps.add(dl);
    const cam = new THREE.PerspectiveCamera(26, W / H, 0.05, 100);
    const buf = new Uint8Array(W * H * 4), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'), img = cx.createImageData(W, H);
    const prevRT = renderer.getRenderTarget(), pc = new THREE.Color(); renderer.getClearColor(pc); const pa = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    CHARS.forEach((c, i) => {
      const m = menuChars[i]; if (!m) return;
      const parent = m.root.parent, vis = m.root.visible, sc = m.root.scale.x, ry = m.root.rotation.y;
      ps.add(m.root); m.root.visible = true; m.root.scale.setScalar(1); m.root.rotation.y = -0.38;
      m.mixer.update(0.0001); m.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m.model, true), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      const h = size.y * 0.8, cy = box.max.y - h / 2 + size.y * 0.03;      // de las rodillas a la cabeza
      const dist = h / 2 / Math.tan(THREE.MathUtils.degToRad(13)) + size.z / 2;
      cam.position.set(ctr.x, cy + h * 0.08, ctr.z + dist); cam.lookAt(ctr.x, cy, ctr.z);
      setOutlinePx(W, H, 1.6); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(ps, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      cx.putImageData(img, 0, 0); PORTRAITS[c.key] = cv.toDataURL('image/png');
      parent.add(m.root); m.root.visible = vis; m.root.scale.setScalar(sc); m.root.rotation.y = ry;
    });
    renderer.setRenderTarget(prevRT); renderer.setClearColor(pc, pa); rt.dispose();
  } catch (e) { console.info('retratos: se usan las imágenes', e); }
}
function cardHTML(key) {
  const c = CHARS.find((x) => x.key === key), t = STATS[key];
  const bars = STAT_KEYS.map((k, i) => `<div class="cs ${i < 4 ? 'at' : 'de'}"><span>${STAT_NAMES[k].slice(0, 3)}</span><i><b style="width:${t[k]}%"></b></i><em>${t[k]}</em></div>`).join('');
  return `<div class="mlCard ${t.rareza}" data-k="${key}" style="--c:${c.color}">` +
    `<div class="mlFoto"><img src="${PORTRAITS[key] || c.card}" alt="" draggable="false"></div>` +
    `<div class="mlTop"><div class="mlMedia">${t.media}</div><div class="mlPos">${t.pos}</div></div><div class="mlRar">${t.rareza.toUpperCase()}</div>` +
    `<div class="mlNom">${c.name}</div>` + (ESPECIALES[key] ? `<div class="mlEsp" style="--ec:${ESPECIALES[key].col}">★ ${ESPECIALES[key].name}</div>` : '') +
    `<div class="mlAD"><div class="mlA"><small>ATQ</small>${t.atq}</div><div class="mlD"><small>DEF</small>${t.def}</div></div>` +
    `<div class="mlStats">${bars}</div><div class="mlBrillo"></div></div>`;
}
function playCardIn(el) { el.classList.remove('entra'); void el.offsetWidth; el.classList.add('entra'); }
const mCartaGrande = document.getElementById('mCartaGrande');
function showBigCard() { if (!mCartaGrande) return; mCartaGrande.innerHTML = cardHTML(CHARS[sel].key); playCardIn(mCartaGrande.firstChild); }
// colección navegable
const colEl = document.getElementById('coleccion'), colLista = document.getElementById('colLista');
let colIdx = 0;
function openColeccion() {
  if (S.mode !== 'menu') return;
  colLista.innerHTML = CHARS.map((c) => `<div class="colItem">${cardHTML(c.key)}<div class="colLema">${STATS[c.key].lema}</div>${espHTML(c.key, 'colEsp')}</div>`).join('');
  [...colLista.children].forEach((d, i) => d.addEventListener('click', () => { if (i === colIdx) { selectChar(i); closeColeccion(); } else colGo(i); }));
  colEl.classList.add('visible'); colGo(sel);
}
function colGo(i) {
  colIdx = (i + CHARS.length) % CHARS.length;
  const n = CHARS.length;
  [...colLista.children].forEach((d, k) => { let o = k - colIdx; if (o > n / 2) o -= n; if (o < -n / 2) o += n; d.classList.toggle('act', o === 0); d.classList.toggle('lejos', Math.abs(o) > 2); d.style.setProperty('--o', o); });
  playCardIn(colLista.children[colIdx].firstChild);
  document.getElementById('colElegir').textContent = 'ELEGIR ' + CHARS[colIdx].name;
}
function closeColeccion() { colEl.classList.remove('visible'); }
document.getElementById('btnMenuCartas').addEventListener('click', openColeccion);
document.getElementById('colPrev').addEventListener('click', () => colGo(colIdx - 1));
document.getElementById('colNext').addEventListener('click', () => colGo(colIdx + 1));
document.getElementById('colElegir').addEventListener('click', () => { selectChar(colIdx); closeColeccion(); });
document.getElementById('colCerrar').addEventListener('click', closeColeccion);
// enfrentamiento al empezar el partido: tu carta vs la del rival
const vsEl = document.getElementById('vsCartas');
function showVsCards(on) {
  if (!vsEl) return;
  if (on) {
    vsEl.innerHTML = `<div class="vsC izq">${cardHTML(matchKeys[0])}</div><div class="vsTxt">VS</div><div class="vsC der">${cardHTML(matchKeys[1])}</div>`;
    vsEl.classList.add('visible'); vsEl.querySelectorAll('.mlCard').forEach(playCardIn);
  } else vsEl.classList.remove('visible');
}
const mNombre = document.getElementById('mNombre'), mVs = document.getElementById('mVs'), mCartas = document.getElementById('mCartas');
function buildMenuUI() {
  mCartas.classList.toggle('muchas', CHARS.length > 8);   // update 22: 11 personajes -> rejilla de 6 columnas (2 filas)
  mCartas.classList.toggle('muchisimas', CHARS.length > 12);   // update 29: 15 personajes -> 8 columnas
  CHARS.forEach((c, i) => {
    const d = document.createElement('div'); d.className = 'carta'; d.style.setProperty('--c', c.color);
    if (c.badge) d.classList.add('conBadge');
    d.innerHTML = `<div class="cartaFoto"><img src="${c.badge || c.card}" alt="" draggable="false"></div><div class="cartaNom">${c.name}</div>`;
    d.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (i !== sel) selectChar(i); });
    mCartas.appendChild(d);
  });
  document.getElementById('mPrev').addEventListener('pointerdown', (e) => { e.preventDefault(); menuStep(-1); });
  document.getElementById('mNext').addEventListener('pointerdown', (e) => { e.preventDefault(); menuStep(1); });
  document.getElementById('btnMenuJugar').addEventListener('click', () => menuPlay());
  document.getElementById('btnMenuPractica').addEventListener('click', () => menuPlay(true));
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
    const cel = m.actions.Intro || m.actions.Celebrate, idle = m.actions.Idle;
    cel.reset().setEffectiveWeight(1).play(); idle.crossFadeTo(cel, m.actions.Intro ? 0.2 : 0.12, false);
  }
  const c = CHARS[sel];
  mNombre.textContent = c.name; mNombre.style.setProperty('--c', c.color);
  const mEsp = document.getElementById('mEsp'); if (mEsp) mEsp.innerHTML = espHTML(c.key, 'mEspIn');   // update 29: especial en el selector
  showBigCard();
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
async function menuPlay(practice = false) {
  if (S.mode !== 'menu') return;
  S.practice = !!practice;
  tryLandscape();
  const btn = document.getElementById('btnMenuJugar');
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (!window.__game.ready) { btn.textContent = 'CARGANDO…'; btn.disabled = true; }
  await campoReady;
  btn.textContent = 'JUGAR'; btn.disabled = false;
  if (S.practice) { const rk = matchKeys && matchKeys[0] === CHARS[sel].key ? matchKeys[1] : CHARS[rivalSel].key; setupMatch(CHARS[sel].key, rk); }
  else setupMatch(CHARS[sel].key, CHARS[rivalSel].key);
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
// ===================== TORNEO Y LIGA (update 24) =====================
// TORNEO: eliminatoria de 8 (cuartos, semis, final). LIGA: 8 equipos a una vuelta (7 jornadas, 4 partidos por jornada).
// Tus partidos se juegan; los demás se simulan con la MEDIA/ATQ/DEF de las cartas y algo de azar (Poisson).
// Empate en eliminatoria = tanda de penaltis simulada (TIRO del lanzador contra REFLEJOS del rival). Progreso en localStorage.
const COMP_KEY = 'ml_competicion_v1', COMP_N = 8;
function compRng(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function poisson(l, r) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 12); return k - 1; }
function simLambda(a, b) {
  const A = STATS[a], B = STATS[b];
  return THREE.MathUtils.clamp(1.35 * Math.exp((A.atq - B.def) / 28 + (A.media - B.media) / 22), 0.35, 3.8);
}
function simScore(a, b, r) { return [poisson(simLambda(a, b), r), poisson(simLambda(b, a), r)]; }
function simPens(a, b, r) {
  const pa = THREE.MathUtils.clamp(0.74 + (STATS[a].tir - STATS[b].ref) / 300, 0.55, 0.92);
  const pb = THREE.MathUtils.clamp(0.74 + (STATS[b].tir - STATS[a].ref) / 300, 0.55, 0.92);
  let ga = 0, gb = 0;
  for (let i = 0; i < 5; i++) { ga += r() < pa ? 1 : 0; gb += r() < pb ? 1 : 0; }
  for (let n = 0; ga === gb && n < 30; n++) { ga += r() < pa ? 1 : 0; gb += r() < pb ? 1 : 0; }
  if (ga === gb) ga++;
  return [ga, gb];
}
function shuffled(arr, r) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function compTeams(user, r) { return shuffled([user, ...shuffled(CHARS.map((c) => c.key).filter((k) => k !== user), r).slice(0, COMP_N - 1)], r); }
// calendario de liga: método del círculo (cada equipo juega una vez contra todos)
function roundRobin(teams) {
  const n = teams.length, t = [...teams], rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const ms = [];
    for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; ms.push(r % 2 === 0 ? { a, b } : { a: b, b: a }); }
    rounds.push(ms);
    t.splice(1, 0, t.pop());
  }
  return rounds;
}
function newTorneo(user, seed = (Date.now() & 0x7fffffff)) {
  const r = compRng(seed), teams = compTeams(user, r);
  const qf = []; for (let i = 0; i < COMP_N; i += 2) qf.push({ a: teams[i], b: teams[i + 1] });
  return { type: 'torneo', user, seed, step: 1, teams, rounds: [qf, [], []], round: 0, done: false, champion: null, last: null };
}
function newLiga(user, seed = (Date.now() & 0x7fffffff)) {
  const r = compRng(seed), teams = compTeams(user, r);
  return { type: 'liga', user, seed, step: 1, teams, fixtures: roundRobin(teams), jornada: 0, done: false, champion: null, last: null };
}
function compR(c) { return compRng((c.seed + c.step++ * 7919) >>> 0); }
function playKO(m, ga, gb, r) {
  m.ga = ga; m.gb = gb; m.played = true;
  if (ga === gb) { const p = simPens(m.a, m.b, r); m.pa = p[0]; m.pb = p[1]; }
  m.w = ga > gb || (ga === gb && m.pa > m.pb) ? m.a : m.b;
}
// registra TU resultado (goles tuyos, goles del rival) y simula el resto de la ronda / jornada
function compRecord(c, gu, gr) {
  const r = compR(c);
  if (c.type === 'torneo') {
    const ms = c.rounds[c.round];
    for (const m of ms) {
      if (m.played) continue;
      if (m.a === c.user) playKO(m, gu, gr, r);
      else if (m.b === c.user) playKO(m, gr, gu, r);
      else { const s = simScore(m.a, m.b, r); playKO(m, s[0], s[1], r); }
    }
    c.last = { round: c.round, user: ms.find((m) => m.a === c.user || m.b === c.user) || null };
    compAdvanceKO(c, r);
  } else {
    const ms = c.fixtures[c.jornada];
    for (const m of ms) {
      if (m.played) continue;
      if (m.a === c.user) { m.ga = gu; m.gb = gr; } else if (m.b === c.user) { m.ga = gr; m.gb = gu; }
      else { const s = simScore(m.a, m.b, r); m.ga = s[0]; m.gb = s[1]; }
      m.played = true;
    }
    c.last = { jornada: c.jornada };
    c.jornada++;
    if (c.jornada >= c.fixtures.length) { c.done = true; c.champion = standings(c)[0].k; }
  }
  return c;
}
function compAdvanceKO(c, r) {
  // ronda terminada -> siguiente ronda con los ganadores (si te eliminan se simula hasta la final)
  while (!c.done) {
    const ms = c.rounds[c.round];
    if (ms.some((m) => !m.played)) {
      if (ms.some((m) => m.a === c.user || m.b === c.user)) return;
      for (const m of ms) if (!m.played) { const s = simScore(m.a, m.b, r); playKO(m, s[0], s[1], r); }
    }
    const win = ms.map((m) => m.w);
    if (win.length === 1) { c.done = true; c.champion = win[0]; return; }
    c.round++;
    c.rounds[c.round] = []; for (let i = 0; i < win.length; i += 2) c.rounds[c.round].push({ a: win[i], b: win[i + 1] });
    if (c.rounds[c.round].some((m) => m.a === c.user || m.b === c.user)) return;
  }
}
function compUserAlive(c) { return c.type !== 'torneo' || c.rounds[c.round].some((m) => m.a === c.user || m.b === c.user); }
function compNextOpp(c) {
  if (c.done) return null;
  const ms = c.type === 'torneo' ? c.rounds[c.round] : c.fixtures[c.jornada];
  const m = ms.find((x) => !x.played && (x.a === c.user || x.b === c.user));
  return m ? (m.a === c.user ? m.b : m.a) : null;
}
// clasificación: 3 puntos victoria, 1 empate. Desempate: PTS, DG, GF, nombre
function standings(c) {
  const T = {}; for (const k of c.teams) T[k] = { k, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
  for (const j of c.fixtures) for (const m of j) {
    if (!m.played) continue;
    const A = T[m.a], B = T[m.b];
    A.pj++; B.pj++; A.gf += m.ga; A.gc += m.gb; B.gf += m.gb; B.gc += m.ga;
    if (m.ga > m.gb) { A.g++; B.p++; A.pts += 3; } else if (m.ga < m.gb) { B.g++; A.p++; B.pts += 3; } else { A.e++; B.e++; A.pts++; B.pts++; }
  }
  const nm = (k) => (CHARS.find((x) => x.key === k) || { name: k }).name;
  return Object.values(T).map((t) => (t.dg = t.gf - t.gc, t)).sort((x, y) => y.pts - x.pts || y.dg - x.dg || y.gf - x.gf || nm(x.k).localeCompare(nm(y.k)));
}
function compLoad() {
  try { const c = JSON.parse(localStorage.getItem(COMP_KEY) || 'null'); return c && typeof c === 'object' ? c : {}; } catch (_) { return {}; }
}
function compSave(all) { try { localStorage.setItem(COMP_KEY, JSON.stringify(all)); } catch (_) {} }
function compValid(c) { return c && c.teams && c.teams.every((k) => STATS[k] && CHARS.some((x) => x.key === k)); }
// ---- interfaz ----
const compEl = document.getElementById('comp'), coCuerpo = document.getElementById('coCuerpo'), coTit = document.getElementById('coTit');
const coJugar = document.getElementById('coJugar'), coNuevo = document.getElementById('coNuevo');
let COMP = null;      // competición abierta en pantalla
const RONDAS = ['CUARTOS', 'SEMIFINALES', 'FINAL'];
const cName = (k) => (CHARS.find((x) => x.key === k) || { name: k }).name;
const cCol = (k) => (CHARS.find((x) => x.key === k) || { color: '#888' }).color;
const cImg = (k) => { const c = CHARS.find((x) => x.key === k); return c ? c.card : ''; };
function teamChip(k, c, extra = '') {
  return `<div class="coEq${k === c.user ? ' tu' : ''}${extra}" style="--c:${cCol(k)}"><i><img src="${cImg(k)}" alt="" draggable="false"></i><span>${cName(k)}</span></div>`;
}
function koMatchHTML(m, c, ri) {
  if (!m) return `<div class="coPar vacio"><div class="coFila"><div class="coEq"><i></i><span>¿?</span></div><b>-</b></div><div class="coFila"><div class="coEq"><i></i><span>¿?</span></div><b>-</b></div></div>`;
  const row = (k, g, p) => `<div class="coFila${m.played && m.w === k ? ' gana' : m.played ? ' pierde' : ''}">${teamChip(k, c)}<b>${m.played ? g : '-'}${m.played && m.pa !== undefined ? `<small>(${p})</small>` : ''}</b></div>`;
  const yours = m.a === c.user || m.b === c.user;
  return `<div class="coPar${yours ? ' tuyo' : ''}${m.played ? '' : ' pend'}">${row(m.a, m.ga, m.pa)}${row(m.b, m.gb, m.pb)}${m.played && m.pa !== undefined ? '<em>PENALTIS</em>' : ''}</div>`;
}
function torneoHTML(c) {
  let h = '<div class="coCuadro">';
  for (let r = 0; r < 3; r++) {
    const n = 4 >> r, ms = c.rounds[r] || [];
    h += `<div class="coRonda r${r}"><div class="coRTit${r === c.round && !c.done ? ' act' : ''}">${RONDAS[r]}</div><div class="coRPars">`;
    for (let i = 0; i < n; i++) h += koMatchHTML(ms[i], c, r);
    h += '</div></div>';
  }
  const ch = c.done ? c.champion : null;
  h += `<div class="coRonda coCopa"><div class="coRTit">CAMPEÓN</div><div class="coRPars"><div class="coTrofeo${ch ? ' lleno' : ''}">${trophySVG()}${ch ? teamChip(ch, c, ' campeon') : '<div class="coEq"><i></i><span>¿?</span></div>'}</div></div></div>`;
  return h + '</div>';
}
function ligaHTML(c) {
  const st = standings(c), J = c.fixtures.length;
  let h = '<div class="coLiga"><div class="coTabla"><table><thead><tr><th>#</th><th class="eq">EQUIPO</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th class="pts">PTS</th></tr></thead><tbody>';
  st.forEach((t, i) => {
    h += `<tr class="${t.k === c.user ? 'tu' : ''}${i === 0 && t.pj ? ' lider' : ''}"><td class="pos">${i + 1}</td><td class="eq">${teamChip(t.k, c)}</td><td>${t.pj}</td><td>${t.g}</td><td>${t.e}</td><td>${t.p}</td><td>${t.gf}</td><td>${t.gc}</td><td>${t.dg > 0 ? '+' : ''}${t.dg}</td><td class="pts">${t.pts}</td></tr>`;
  });
  h += '</tbody></table></div><div class="coLado">';
  const lj = c.last ? c.last.jornada : null;
  if (lj !== null && lj !== undefined) {
    h += `<div class="coSub">RESULTADOS · JORNADA ${lj + 1}</div><div class="coRes">`;
    for (const m of c.fixtures[lj]) h += `<div class="coResF${m.a === c.user || m.b === c.user ? ' tuyo' : ''}">${teamChip(m.a, c)}<b>${m.ga} - ${m.gb}</b>${teamChip(m.b, c, ' der')}</div>`;
    h += '</div>';
  }
  if (!c.done) {
    h += `<div class="coSub">JORNADA ${c.jornada + 1} DE ${J}</div><div class="coRes prox">`;
    for (const m of c.fixtures[c.jornada]) h += `<div class="coResF${m.a === c.user || m.b === c.user ? ' tuyo' : ''}">${teamChip(m.a, c)}<b>vs</b>${teamChip(m.b, c, ' der')}</div>`;
    h += '</div>';
  }
  return h + '</div></div>';
}
function trophySVG() {
  return '<svg class="copaSvg" viewBox="0 0 64 64" aria-hidden="true"><path d="M18 6h28v14c0 9-6 16-14 16s-14-7-14-16z" fill="#ffd23f" stroke="#14193a" stroke-width="3"/><path d="M18 11H8c0 8 4 13 11 14M46 11h10c0 8-4 13-11 14" fill="none" stroke="#14193a" stroke-width="3"/><path d="M27 36h10v8H27z" fill="#e6a915" stroke="#14193a" stroke-width="3"/><path d="M20 44h24l3 10H17z" fill="#8a5fd1" stroke="#14193a" stroke-width="3"/><path d="M25 12c0 6 2 10 5 12" fill="none" stroke="#fff6c4" stroke-width="3" stroke-linecap="round"/></svg>';
}
function finalHTML(c) {
  const won = c.champion === c.user;
  const sub = c.type === 'torneo' ? (won ? '¡CAMPEÓN DEL TORNEO!' : 'CAMPEÓN DEL TORNEO') : (won ? '¡CAMPEÓN DE LIGA!' : 'CAMPEÓN DE LIGA');
  let extra = '';
  if (c.type === 'liga') { const st = standings(c), pos = st.findIndex((t) => t.k === c.user) + 1; extra = `<div class="coFinTxt">${won ? `${st[0].pts} puntos · ${st[0].g} G · ${st[0].e} E · ${st[0].p} P` : `Has terminado ${pos}º con ${st[pos - 1].pts} puntos`}</div>`; }
  else if (!won) extra = `<div class="coFinTxt">Has caído en ${RONDAS[c.rounds.findIndex((rs) => rs.some((m) => (m.a === c.user || m.b === c.user) && m.w !== c.user))] || 'el torneo'}</div>`;
  else extra = '<div class="coFinTxt">Cuartos, semis y final: ¡imbatible!</div>';
  return `<div class="coFin${won ? ' gana' : ''}"><div class="coRayos"></div>${won ? '<div class="coConfeti">' + Array.from({ length: 26 }, (_, i) => `<i style="--i:${i}"></i>`).join('') + '</div>' : ''}` +
    `<div class="coFinCopa">${trophySVG()}</div><div class="coFinFoto" style="--c:${cCol(c.champion)}"><img src="${PORTRAITS[c.champion] || cImg(c.champion)}" alt=""></div>` +
    `<div class="coFinSub">${sub}</div><div class="coFinNom" style="--c:${cCol(c.champion)}">${cName(c.champion)}</div>${extra}</div>`;
}
function renderComp(view) {
  const c = COMP; if (!c) return;
  compEl.className = 'visible ' + c.type + (view === 'fin' ? ' fin' : '');
  const opp = compNextOpp(c);
  const coTu = document.getElementById('coTu'); if (coTu) coTu.innerHTML = `<small>TU EQUIPO</small>${teamChip(c.user, c)}`;
  if (view === 'fin') {
    coTit.textContent = c.type === 'torneo' ? 'TORNEO MONSTER' : 'LIGA MONSTER';
    coCuerpo.innerHTML = finalHTML(c);
    coJugar.textContent = c.type === 'torneo' ? (c.done ? 'VER CUADRO' : '') : 'VER TABLA';
    coJugar.dataset.act = 'tabla'; coNuevo.style.display = '';
    coNuevo.textContent = c.type === 'torneo' ? 'NUEVO TORNEO' : 'NUEVA LIGA';
    return;
  }
  if (c.type === 'torneo') {
    coTit.innerHTML = `TORNEO MONSTER <small>${c.done ? 'TERMINADO' : RONDAS[c.round]}</small>`;
    coCuerpo.innerHTML = torneoHTML(c);
  } else {
    coTit.innerHTML = `LIGA MONSTER <small>${c.done ? 'TERMINADA' : 'JORNADA ' + (c.jornada + 1) + '/' + c.fixtures.length}</small>`;
    coCuerpo.innerHTML = ligaHTML(c);
  }
  if (opp) { coJugar.innerHTML = `JUGAR <small>vs ${cName(opp)}</small>`; coJugar.dataset.act = 'jugar'; }
  else if (c.done) { coJugar.textContent = c.type === 'torneo' ? 'VER CAMPEÓN' : 'VER CAMPEÓN'; coJugar.dataset.act = 'fin'; }
  coNuevo.style.display = c.done || (c.type === 'torneo' && !compUserAlive(c)) ? '' : 'none';
  coNuevo.textContent = c.type === 'torneo' ? 'NUEVO TORNEO' : 'NUEVA LIGA';
}
function openComp(type, fresh) {
  if (S.mode !== 'menu' && S.mode !== 'end') return;
  const all = compLoad(), uk = CHARS[sel].key;
  let c = all[type];
  if (fresh || !compValid(c) || c.done) c = type === 'torneo' ? newTorneo(uk) : newLiga(uk);
  all[type] = c; compSave(all); COMP = c;
  menuEl.classList.remove('visible'); pantalla.classList.remove('visible');
  renderComp(c.done ? 'fin' : null);
  compEl.querySelectorAll('.coPar, .coTabla tr, .coResF').forEach((el, i) => el.style.setProperty('--d', i));
}
function closeComp() { compEl.className = ''; COMP = null; openMenu(); }
async function compPlay() {
  const c = COMP, opp = c && compNextOpp(c); if (!opp) return;
  if (!window.__game.ready) { coJugar.textContent = 'CARGANDO…'; await campoReady; }
  S.practice = false; S.comp = { type: c.type, opp };
  compEl.className = '';
  setupMatch(c.user, opp);
  tryLandscape();
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  S.mode = 'menu'; startGame();
}
// al terminar tu partido de competición: se guarda, se simula el resto y se vuelve al cuadro / tabla
function compAfterMatch(gu, gr) {
  const sc = S.comp; S.comp = null;
  const all = compLoad(), c = all[sc.type]; if (!compValid(c)) return false;
  compRecord(c, gu, gr); all[sc.type] = c; compSave(all); COMP = c;
  hudSet(false);
  renderComp(c.done && c.champion === c.user ? 'fin' : null);
  const yours = compEl.querySelector('.coPar.tuyo, .coResF.tuyo'); if (yours) yours.classList.add('nuevo');
  return true;
}
coJugar.addEventListener('click', () => {
  const a = coJugar.dataset.act;
  if (a === 'jugar') compPlay(); else if (a === 'fin') renderComp('fin'); else if (a === 'tabla') renderComp(null);
});
coNuevo.addEventListener('click', () => { if (COMP) { const t = COMP.type; S.mode = 'menu'; openComp(t, true); } });
document.getElementById('coSalir').addEventListener('click', closeComp);
document.getElementById('btnMenuTorneo').addEventListener('click', () => openComp('torneo'));
document.getElementById('btnMenuLiga').addEventListener('click', () => openComp('liga'));
function layoutMenu() {
  const W = app.clientWidth, H = app.clientHeight;
  if (!W || !H) return;
  menuCam.aspect = W / H;
  if (HORIZONTAL) {
    // el personaje se ve en la mitad izquierda; encuadre un poco más cercano
    const visH = H < 520 ? 6.2 : 5.3;   // update 17: algo más pequeño para dejar sitio a la carta
    const dist = visH / 2 / Math.tan(THREE.MathUtils.degToRad(menuCam.fov / 2));
    const halfW = dist * Math.tan(THREE.MathUtils.degToRad(menuCam.fov / 2)) * (W / H);
    // lookAt descentra el personaje: hay que mirar a la derecha para que quede en la mitad izquierda
    menuCam.position.set(0, 1.05, dist);
    menuCam.lookAt(halfW * 0.22, 0.20, 0);   // update 17: deja sitio a la carta grande a la izquierda
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
  syncOutline(); renderer.render(menuScene, menuCam);
}

// ===================== ORIENTACIÓN (aviso + lock landscape) =====================
async function tryLandscape() {
  if (!HORIZONTAL) return;
  try {
    const root = document.documentElement;
    const gesture = !navigator.userActivation || navigator.userActivation.isActive;
    if (!document.fullscreenElement && gesture) {
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
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
  shadowFlags(campoRoot, false, true);
  window.__game.campoMerged = mergeStatic(campoRoot);
  setupNet();
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
  ballMesh = makeBall(); scene.add(ballMesh); shadowFlags(ballMesh, true, false);
  // silueta del balón cuando queda tapado por un jugador (la cámara es alta y el balón va delante del pie)
  ballGhost = new THREE.Mesh(ballMesh.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, depthFunc: THREE.GreaterDepth }));
  ballGhost.renderOrder = 6; scene.add(ballGhost);
  ballShadow = blob(BR * 1.25, 0.35); scene.add(ballShadow);
  aimArrow = new THREE.Group();
  const shape = new THREE.Shape(); shape.moveTo(-0.22, 0.9); shape.lineTo(0.22, 0.9); shape.lineTo(0.22, 2.0); shape.lineTo(0.5, 2.0); shape.lineTo(0, 2.7); shape.lineTo(-0.5, 2.0); shape.lineTo(-0.22, 2.0); shape.closePath();
  const am = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  am.renderOrder = 3;
  aimArrow.add(am); aimArrow.visible = false; scene.add(aimArrow);
  aimLine = makeAimLine(); scene.add(aimLine);
  makeLobPreview();
  applyQuality('campo');
  am.rotation.set(-Math.PI / 2, 0, 0);   // la flecha apunta a -Z local (frente del personaje)
}

// ===================== CONTROLES PERSONALIZABLES + EDITOR (update 10) =====================
const CTRL = {
  joy: { el: joyBase, name: 'Joystick' },
  chutar: { el: btnChutar, name: 'Chutar' },
  regate: { el: btnRegate, name: 'Regate' },
  turbo: { el: btnTurbo, name: 'Turbo' },
  entrada: { el: btnEntrada, name: 'Entrada' },
  alto: { el: btnAlto, name: 'Chut alto' },
  especial: { el: btnEspecial, name: 'Especial' },
};
const BTN_IDS = ['chutar', 'regate', 'turbo', 'entrada', 'alto', 'especial'];
const S_MIN = 0.6, S_MAX = 1.6, CTRL_MARGIN = 6, TOP_RESERVE = 46;   // TOP_RESERVE: marcador
const clampS = (v) => Math.max(S_MIN, Math.min(S_MAX, +v || 1));
let _ins = null, _insKey = '';
function safeInsets() {
  const k = vpKey();
  if (!_ins || _insKey !== k) {
    _ins = { t: cssEnvPx('env(safe-area-inset-top, 0px)'), r: cssEnvPx('env(safe-area-inset-right, 0px)'), b: cssEnvPx('env(safe-area-inset-bottom, 0px)'), l: cssEnvPx('env(safe-area-inset-left, 0px)') };
    _insKey = k;
  }
  return _ins;
}
// centro (coords del #app) limitado para que el control (ya escalado) no salga de pantalla ni entre en la safe-area
function clampCenter(cx, cy, w, h, W, H, ins, box) {
  let x0 = ins.l + CTRL_MARGIN + w / 2, x1 = W - ins.r - CTRL_MARGIN - w / 2;
  let y0 = ins.t + TOP_RESERVE + h / 2, y1 = H - ins.b - CTRL_MARGIN - h / 2;
  if (box) { x0 = Math.max(x0, box.x0 + w / 2); x1 = Math.min(x1, box.x1 - w / 2); y0 = Math.max(y0, box.y0 + h / 2); y1 = Math.min(y1, box.y1 - h / 2); }
  const cl = (v, a, b) => (a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)));
  return [cl(cx, x0, x1), cl(cy, y0, y1)];
}
function liveCtrl() { return editor.on ? editor.draft : AJ.ctrl; }
function applyControls() {
  const cfg = liveCtrl(), opa = editor.on ? editor.opa : AJ.opacity;
  acciones.style.opacity = opa < 0.999 ? opa : '';
  joyBase.style.opacity = opa < 0.999 ? opa : '';
  joyScale = HORIZONTAL ? clampS(cfg.joy && cfg.joy.s) : 1;
  joyBase.style.scale = joyScale !== 1 ? String(joyScale) : '';
  if (HORIZONTAL) {
    const ar = app.getBoundingClientRect(), cr = acciones.getBoundingClientRect();
    const W = ar.width, H = ar.height, ins = safeInsets();
    for (const id of BTN_IDS) {
      const el = CTRL[id].el, c = cfg[id];
      el.style.left = el.style.top = el.style.right = el.style.bottom = ''; el.style.scale = '';
      if (!c || !W || !H) continue;
      const sc = clampS(c.s);
      if (sc !== 1) el.style.scale = String(sc);
      const bw = el.offsetWidth, bh = el.offsetHeight;
      let cx, cy;
      if (c.x == null) {   // tamaño cambiado pero posición por defecto: re-limitar igualmente
        const r = el.getBoundingClientRect(); cx = (r.left + r.right) / 2 - ar.left; cy = (r.top + r.bottom) / 2 - ar.top;
      } else { cx = c.x * W; cy = c.y * H; }
      [cx, cy] = clampCenter(cx, cy, bw * sc, bh * sc, W, H, ins);
      el.style.left = (cx - (cr.left - ar.left) - bw / 2) + 'px';
      el.style.top = (cy - (cr.top - ar.top) - bh / 2) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    }
  }
  placeJoyBase();
  cacheCtrlRects();
}
function customJoyHome(def, zr) {
  if (!HORIZONTAL) return def;
  const ar = app.getBoundingClientRect(), W = ar.width, H = ar.height;
  if (!W || !H) return def;
  const ox = zr.left - ar.left, oy = zr.top - ar.top;
  const c = liveCtrl().joy;
  const js = joyBase.offsetWidth * joyScale;
  let cx = def.x + ox, cy = def.y + oy;
  if (c && c.x != null) { cx = c.x * W; cy = c.y * H; }
  [cx, cy] = clampCenter(cx, cy, js, js, W, H, safeInsets(), { x0: ox, x1: ox + zr.width, y0: oy, y1: oy + zr.height });
  return { x: cx - ox, y: cy - oy };
}

const ajustesEl = document.getElementById('ajustes'), editorEl = document.getElementById('editor');
const edSel = document.getElementById('edSel'), edTam = document.getElementById('edTam'), edTamV = document.getElementById('edTamV');
const edOpa = document.getElementById('edOpa'), edOpaV = document.getElementById('edOpaV'), ajInfo = document.getElementById('ajInfo');
let ajFrom = null;
const fpsMeter = document.getElementById('fpsMeter'), btnAjFps = document.getElementById('ajFps');
function setShowFps(on) {
  AJ.showFps = !!on; saveAjustes();
  document.body.classList.toggle('fps-on', AJ.showFps);
  if (btnAjFps) { btnAjFps.textContent = 'CONTADOR FPS: ' + (AJ.showFps ? 'SÍ' : 'NO'); btnAjFps.classList.toggle('on', AJ.showFps); }
  updateFpsMeter();
}
function updateFpsMeter() {
  if (!AJ.showFps || !fpsMeter) return;
  const la = window.__game.lastAction;
  const f = window.__game.fps || 0, t = `${f} FPS · ${f ? (1000 / f).toFixed(0) : '–'} ms · ×${renderer.getPixelRatio().toFixed(2).replace(/\.?0+$/, '')}` +
    `\nÚltima acción: ${la ? `${LAT_NAMES[la.kind] || la.kind} ${la.ms} ms` : '–'}`;
  if (fpsMeter._t !== t) { fpsMeter._t = t; fpsMeter.textContent = t; }
}
function refreshAjustes() {
  for (const b of document.querySelectorAll('#ajCalidad button')) b.classList.toggle('sel', b.dataset.q === AJ.quality);
  const q = window.__game.quality || {};
  const sh = q.shadows ? `sombras ${q.soft ? 'suaves' : 'normales'} ${q.shadows}px` : 'sin sombras reales';
  ajInfo.textContent = `Resolución ×${(q.pixelRatio || renderer.getPixelRatio()).toFixed(2).replace(/\.?0+$/, '')} · ${sh}` + (q.lod < 1 ? ' · modelos ligeros' : '') + (q.fallbackSteps ? ' · ajustado por rendimiento' : '');
}
function openAjustes(from) {
  ajFrom = from || (S.paused ? 'pausa' : 'menu');
  if (ajFrom === 'pausa') pausaEl.classList.remove('visible');
  refreshAjustes();
  ajustesEl.classList.add('visible');
}
function closeAjustes() {
  ajustesEl.classList.remove('visible');
  if (ajFrom === 'pausa' && S.paused) pausaEl.classList.add('visible');
  ajFrom = null;
}
function edSelect(id) {
  editor.sel = id;
  for (const k in CTRL) CTRL[k].el.classList.toggle('ctrlSel', k === id);
  if (!id) { edSel.textContent = 'Arrastra un control para moverlo'; edTam.disabled = true; edTamV.textContent = '–'; return; }
  const d = editor.draft[id] || (editor.draft[id] = { s: 1 });
  edSel.textContent = CTRL[id].name;
  edTam.disabled = false; edTam.value = Math.round(clampS(d.s) * 100); edTamV.textContent = edTam.value + '%';
}
function edView(v) {
  editor.view = v === 'sin' ? 'sin' : 'con';
  acciones.classList.toggle('con-balon', editor.view === 'con');
  acciones.classList.toggle('sin-balon', editor.view === 'sin');
  for (const b of document.querySelectorAll('#edVista button')) b.classList.toggle('sel', b.dataset.v === editor.view);
  if (editor.sel && editor.sel !== 'joy' && editor.sel !== 'turbo' && editor.sel !== 'especial' && getComputedStyle(CTRL[editor.sel].el).visibility === 'hidden') edSelect(null);
}
function edSyncOpa() { edOpa.value = Math.round(editor.opa * 100); edOpaV.textContent = edOpa.value + '%'; }
function openEditor() {
  ajustesEl.classList.remove('visible');
  editor.on = true; editor.draft = JSON.parse(JSON.stringify(AJ.ctrl || {})); editor.opa = AJ.opacity; editor.drag = null;
  resetInputs();
  editor.savedCls = acciones.className;
  document.body.classList.add('editando'); editorEl.classList.add('visible');
  edSelect(null); edView('con'); edSyncOpa(); applyControls();
}
function closeEditor(save) {
  if (!editor.on) return;
  if (save) {
    for (const k of Object.keys(editor.draft)) { const d = editor.draft[k]; if (d && d.x == null && clampS(d.s) === 1) delete editor.draft[k]; }
    AJ.ctrl = editor.draft; AJ.opacity = editor.opa; saveAjustes();
  }
  edSelect(null);
  editor.on = false; editor.draft = null; editor.drag = null;
  if (editor.savedCls != null) acciones.className = editor.savedCls;
  document.body.classList.remove('editando'); editorEl.classList.remove('visible');
  applyControls();
  openAjustes(ajFrom || (S.paused ? 'pausa' : 'menu'));
}
function ctrlIdOf(el) { for (const k in CTRL) if (CTRL[k].el === el) return k; return null; }
function storeCenterFromDom(id) {
  const ar = app.getBoundingClientRect(), r = CTRL[id].el.getBoundingClientRect();
  const d = editor.draft[id] || (editor.draft[id] = { s: 1 });
  d.x = +(((r.left + r.right) / 2 - ar.left) / ar.width).toFixed(4);
  d.y = +(((r.top + r.bottom) / 2 - ar.top) / ar.height).toFixed(4);
}
window.addEventListener('pointerdown', (e) => {
  if (!editor.on) return;
  if (e.target.closest && e.target.closest('.edBarra')) return;
  e.preventDefault(); e.stopPropagation();
  const t = e.target.closest && e.target.closest('.btnAccion, #joyBase');
  const id = t ? ctrlIdOf(t) : null;
  if (!id) return;
  edSelect(id);
  const r = t.getBoundingClientRect();
  editor.drag = { id, pid: e.pointerId, ox: e.clientX - (r.left + r.right) / 2, oy: e.clientY - (r.top + r.bottom) / 2 };
}, true);
window.addEventListener('pointermove', (e) => {
  if (!editor.on || !editor.drag || e.pointerId !== editor.drag.pid) return;
  e.preventDefault(); e.stopPropagation();
  const ar = app.getBoundingClientRect(), d = editor.draft[editor.drag.id];
  d.x = (e.clientX - editor.drag.ox - ar.left) / ar.width;
  d.y = (e.clientY - editor.drag.oy - ar.top) / ar.height;
  applyControls();
}, true);
const edUp = (e) => {
  if (!editor.on) return;
  if (editor.drag && e.pointerId === editor.drag.pid) { storeCenterFromDom(editor.drag.id); editor.drag = null; }
  if (!(e.target.closest && e.target.closest('.edBarra'))) e.stopPropagation();
};
window.addEventListener('pointerup', edUp, true); window.addEventListener('pointercancel', edUp, true);
edTam.addEventListener('input', () => {
  if (!editor.sel) return;
  const d = editor.draft[editor.sel]; d.s = clampS(edTam.value / 100); edTamV.textContent = edTam.value + '%';
  applyControls();
});
edOpa.addEventListener('input', () => { editor.opa = Math.max(0.3, Math.min(1, edOpa.value / 100)); edSyncOpa(); applyControls(); });
for (const b of document.querySelectorAll('#edVista button')) b.addEventListener('click', () => edView(b.dataset.v));
document.getElementById('edGuardar').addEventListener('click', () => closeEditor(true));
document.getElementById('edCancelar').addEventListener('click', () => closeEditor(false));
document.getElementById('edReset').addEventListener('click', () => { editor.draft = {}; editor.opa = 1; edSelect(null); edSyncOpa(); applyControls(); });
document.getElementById('ajEditar').addEventListener('click', openEditor);
document.getElementById('ajCerrar').addEventListener('click', closeAjustes);
btnAjFps.addEventListener('click', () => setShowFps(!AJ.showFps));
const btnAjInst = document.getElementById('ajInstantaneo');
function setInstantTap(on) {
  AJ.instantTap = !!on; saveAjustes();
  btnAjInst.textContent = 'DISPARO INSTANTÁNEO AL TOCAR (SIN APUNTAR): ' + (AJ.instantTap ? 'SÍ' : 'NO'); btnAjInst.classList.toggle('on', AJ.instantTap);
}
btnAjInst.addEventListener('click', () => setInstantTap(!AJ.instantTap));
setInstantTap(AJ.instantTap);
const btnAjDesliz = document.getElementById('ajDesliz'), ajDeslizNota = document.getElementById('ajDeslizNota');
function setSwipeShot(on) {
  AJ.swipeShot = !!on; saveAjustes();
  btnAjDesliz.textContent = 'CHUT POR DESLIZAMIENTO: ' + (AJ.swipeShot ? 'SÍ' : 'NO'); btnAjDesliz.classList.toggle('on', AJ.swipeShot);
  if (ajDeslizNota) ajDeslizNota.style.display = AJ.swipeShot ? '' : 'none';
  document.body.classList.toggle('desliz', AJ.swipeShot);
  const t = btnChutar.querySelector('.btnTxt'); if (t) t.textContent = AJ.swipeShot ? 'DESLIZA' : 'CHUTAR';
  if (!AJ.swipeShot) swipeEnd(null, true);
}
btnAjDesliz.addEventListener('click', () => setSwipeShot(!AJ.swipeShot));
setSwipeShot(AJ.swipeShot);
const btnAjAsist = document.getElementById('ajAsistencia');
function setAimAssist(on) {
  AJ.aimAssist = !!on; saveAjustes();
  btnAjAsist.textContent = 'ASISTENCIA DE APUNTADO: ' + (AJ.aimAssist ? 'SÍ' : 'NO'); btnAjAsist.classList.toggle('on', AJ.aimAssist);
}
btnAjAsist.addEventListener('click', () => setAimAssist(!AJ.aimAssist));
setAimAssist(AJ.aimAssist);
document.getElementById('ajEspeciales').addEventListener('click', () => setEspeciales(!espOn()));
setEspeciales(espOn());
setShowFps(AJ.showFps);
for (const b of document.querySelectorAll('#ajCalidad button')) b.addEventListener('click', () => { setQuality(b.dataset.q); refreshAjustes(); });
const btnAjustes = document.getElementById('btnAjustes');
btnAjustes.addEventListener('pointerdown', (e) => e.stopPropagation());
btnAjustes.addEventListener('click', (e) => { e.stopPropagation(); openAjustes('menu'); });
document.getElementById('btnPausaAjustes').addEventListener('click', () => openAjustes('pausa'));
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (editor.on) { closeEditor(false); e.stopPropagation(); } else if (ajustesEl.classList.contains('visible')) { closeAjustes(); e.stopPropagation(); }
}, true);

Object.defineProperty(window.__game, 'practice', { get: () => !!S.practice });
Object.assign(window.__game, {
  paused: false,
  advance: (sec, step = 1 / 60, draw = true) => { for (let t = 0; t < sec - 1e-6; t += step) { if (S.mode !== 'menu' && S.mode !== 'end') update(step); if (draw) render(step); } },
  forceGoal: (team) => goalScored(team),
  selectChar: (i) => selectChar(i), STATS, openColeccion, closeColeccion, colGo, menuPlay: (pr) => menuPlay(pr), goalWindow, setAimAssist, BOOTS, BOOTS_ST, bootShot, openTienda, closeTienda,
  shootUser: (p, dx, dy) => shoot(user, new THREE.Vector2(dx, dy), p, false),
  equipBoots: (k) => { if (!BOOTS_ST.owned.includes(k)) BOOTS_ST.owned.push(k); BOOTS_ST.equip = k; saveBoots(); refreshBootsVisual(); }, openMenu: () => openMenu(),
 setRival: (i) => { rivalSel = i; }, CHARS,
  HORIZONTAL, VERTICAL, CAMS,
  tryLandscape, updateOrient,
  setCamMode: (m) => setCamMode(m, true),
  setJoyDir,
  openPause: () => openPause(), resumeGame: () => resumeGame(), quitMatch: () => quitMatch(),
  // pruebas: simula con la física real (stepBall, con postes/larguero/red) un chut alto con carga c desde D m de la línea de gol
  simAlto: (c, D, dt = 1 / 120) => {
    const sv = { pos: ball.pos.clone(), vel: ball.vel.clone(), owner: ball.owner, le: ball.lineEvent, bs: ball.backspin };
    const lp = lobParams(c); ball.owner = null; ball.lineEvent = null; ball.backspin = 0; const fx0 = { ...ball.fx }; Object.assign(ball.fx, { curve: 0, lift: 0, dip: 0 });
    ball.pos.set(0, HL - D, BR + 0.02); ball.vel.set(0, lp.h, lp.vz);
    const prev = new THREE.Vector3(); let t = 0, zGoal = null, tGoal = null, tBounce = null, peak = 0;
    for (; t < 6 && !ball.lineEvent; t += dt) {
      prev.copy(ball.pos); stepBall(dt, prev); peak = Math.max(peak, ball.pos.z);
      if (zGoal === null && prev.y < HL && ball.pos.y >= HL) { const k = (HL - prev.y) / (ball.pos.y - prev.y); zGoal = +(prev.z + (ball.pos.z - prev.z) * k).toFixed(2); tGoal = +(t + dt * k).toFixed(2); }
      if (tBounce === null && ball.pos.z <= BR + 1e-6 && prev.z > BR) tBounce = +(t + dt).toFixed(2);
    }
    const ev = ball.lineEvent;
    const r = { c, D, v: +lp.v.toFixed(1), ang: +THREE.MathUtils.radToDeg(lp.ang).toFixed(1), result: ev ? ev.type : (zGoal === null ? 'no llega' : 'rechazado'), zLinea: zGoal, tLinea: tGoal, tBounce, peak: +peak.toFixed(2) };
    ball.pos.copy(sv.pos); ball.vel.copy(sv.vel); ball.owner = sv.owner; ball.lineEvent = sv.le; ball.backspin = sv.bs; Object.assign(ball.fx, fx0);
    return r;
  },
  giveBall: (who) => giveBall(who === 'gkA' ? gkA : who === 'gkB' ? gkB : who === 'rival' ? rival : user), AI,   // update 22 (pruebas IA)
  lobParams, predictFlight, shootLob: (p, dx, dy) => shootLob(user, new THREE.Vector2(dx, dy), p),
  get aim() { return aim; },
  get menuChars() { return menuChars; }, get PORTRAITS() { return PORTRAITS; },
  comp: { newTorneo, newLiga, compRecord, standings, simScore, simPens, roundRobin, compRng, compNextOpp, compUserAlive, openComp: (t, f) => openComp(t, f), compPlay: () => compPlay(), compAfterMatch: (a, b) => compAfterMatch(a, b), get COMP() { return COMP; }, KEY: COMP_KEY },
  swipeMap, swipeShotParams, SW, setSwipeShot: (on) => setSwipeShot(on), get swipe() { return swipe; }, get trail() { return trail; },
  relayout: () => onViewportChange(),
  setupMatch,
  AJ, QS, setQuality, applyQuality, setOutlinePx, TOON, applyControls, setShowFps, setInstantTap: (on) => setInstantTap(on), lastAction: null,
  openSettings: (from) => openAjustes(from), closeSettings: () => closeAjustes(),
  openEditor: () => openEditor(), closeEditor: (save) => closeEditor(save),
  get editor() { return editor; }, edSelect: (id) => edSelect(id), edView: (v) => edView(v),
  setCtrl: (id, v) => { const t = editor.on ? editor.draft : AJ.ctrl; t[id] = Object.assign(t[id] || { s: 1 }, v); applyControls(); },
  ctrlRect: (id) => { const r = CTRL[id].el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
});
Object.defineProperty(window.__game, 'menuSel', { get: () => sel });
Object.defineProperty(window.__game, 'gkA', { get: () => gkA });
Object.defineProperty(window.__game, 'gkB', { get: () => gkB });
Object.defineProperty(window.__game, 'rivalSel', { get: () => rivalSel });
Object.defineProperty(window.__game, 'portraits', { get: () => Object.keys(PORTRAITS).length });
Object.defineProperty(window.__game, 'camMode', { get: () => camMode });
Object.defineProperty(window.__game, 'inputBuf', { get: () => input.buf });
Object.defineProperty(window.__game, 'simplifierReady', { get: () => !!Simplifier });
Object.defineProperty(window.__game, 'vp', { get: () => lastVP });
(async function init() {
  const cargando = document.getElementById('cargando');
  applyQuality('init');
  try {
    cargando.textContent = 'Cargando personajes…';
    META = await (await fetch(`assets/anim_meta.json?${ASSET_V}`)).json();
    const gl = await Promise.all(CHARS.map((c) => load(c.file)));
    CHARS.forEach((c, i) => { GLB[c.key] = gl[i]; toStandard(gl[i].scene); });
    applyTextureQuality();
    buildMenuChars(); renderPortraits(); buildMenuUI();
    layout(); layoutMenu(); updateOrient();
    cargando.classList.add('oculto');
    openMenu();
    window.__game.menuReady = true;
    requestAnimationFrame(frame);
    campoReady = load('assets/campo.glb?' + ASSET_V).then((campo) => { setupField(campo); window.__game.ready = true; });
    await campoReady;
  } catch (err) {
    console.error(err);
    cargando.classList.remove('oculto');
    cargando.textContent = 'Error cargando: ' + err.message;
  }
})();

// update 25 (pruebas): getters vivos (Object.assign copia el valor del getter una sola vez)
Object.defineProperty(window.__game, 'BADGES', { get: () => BADGES, configurable: true });
Object.defineProperty(window.__game, 'sel', { get: () => sel, configurable: true });
// update 29 (pruebas): especiales
Object.assign(window.__game, { ESPECIALES, ESP, ESP_T, espUse: (who) => espUse(who === 'rival' ? rival : user), espCanUse: (who) => espCanUse(who === 'rival' ? rival : user),
  espCharge: (who, v = 1) => { const a = who === 'rival' ? rival : user; if (a) a.esp = v; }, setEspeciales: (on) => setEspeciales(on), espClear: () => espClear() });
