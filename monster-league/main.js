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
const GRAV = 13;            // gravedad del balón (m/s²), ajustada a la escala del juego (personajes ×1,3)
const AIR_DRAG = 0.15, ROLL_DRAG = 1.1, ROLL_DECEL = 0.9, BOUNCE_E = 0.55;
const GK_REACH = 2.0, GK_REACH_DIVE = 1.6;   // altura de alcance del portero (×ESCALA): de pie+salto / en estirada
const PR = 0.6 * ESCALA;                   // radio de colisión del jugador
const SPEED_USER = 7.6, SPEED_AI = 6.3, SPEED_GK = 5.6;
const DRIBBLE_T = 0.32, DRIBBLE_CD = 1.5, DRIBBLE_SPEED = 13.5;
const DASH_T = 0.26, DASH_CD_USER = 1.1, DASH_CD_AI = 2.0, DASH_SPEED = 16, DASH_MISS_STUN = 0.42;
const TURBO_MULT = 1.38, TURBO_DRAIN = 1 / 2.5, TURBO_REGEN = 1 / 4.2, TURBO_MIN = 0.1;
const g2t = (x, y, z = 0) => new THREE.Vector3(x, z, -y);   // juego -> three (Y-up)
// personajes jugables (glb con rig + animaciones) y parámetros de animación (anim_meta.json, exportado desde Blender)
const ASSET_V = 'v=13';   // cache busting de modelos y tarjetas
const CHARS = [
  { key: 'conazo', name: 'CONAZO', color: '#F2751A' },
  { key: 'calcetrol', name: 'CALCETROL', color: '#E5343A' },
  { key: 'buton', name: 'BUTÓN', color: '#F8B715' },
  { key: 'lobo', name: 'LOBO', color: '#3B4FA8' },
  { key: 'zorro', name: 'ZORRO', color: '#E2552D' },
  { key: 'gecko', name: 'GECKO', color: '#58A83A' },
  { key: 'rino', name: 'RINO', color: '#7C838B' },
].map((c) => ({ scale: 1, file: `assets/${c.key}_anim.glb?${ASSET_V}`, card: `assets/cards/${c.key}.png?${ASSET_V}`, ...c }));
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
  root.traverse((o) => { if (o.isMesh && !(o.material && o.material.isMeshBasicMaterial)) { o.castShadow = cast; o.receiveShadow = receive; } });
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
const simplifierReady = import('./vendor/addons/libs/meshopt_simplifier.module.js?v=13')
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
    this.yaw += d * Math.min(1, dt * (this === user ? 26 : 14));
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
const cargaAro = document.getElementById('carga'), cargaRegate = document.getElementById('cargaRegate'), cargaAlto = document.getElementById('cargaAlto');
const cargaEntrada = document.getElementById('cargaEntrada'), cargaTurbo = document.getElementById('cargaTurbo');
let joyId = null, joyCx = 0, joyCy = 0, joyHome = { x: 84, y: 0 }, joyScale = 1;
// Caché de geometría de los controles: se mide SOLO al recolocar (layout/resize/editor), nunca en cada toque ni en cada frame
const RC = { app: null, zona: null, btn: new Map() };
function cacheCtrlRects() {
  RC.app = app.getBoundingClientRect(); RC.zona = joyZona.getBoundingClientRect(); RC.btn.clear();
  for (const el of [btnChutar, btnRegate, btnAlto, btnEntrada, btnTurbo]) RC.btn.set(el, el.getBoundingClientRect());
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
    aimJoy.className = 'on ' + aim.kind;
  } else { aimJoy.className = ''; aimKnob.style.transform = ''; }
}
function aimUpdateFromPointer(x, y) {
  let dx = x - aim.cx, dy = y - aim.cy;
  const L = Math.hypot(dx, dy);
  if (L > aimDeadPx()) aim.dragged = true;
  const k = L > aim.R ? aim.R / L : 1;
  aim.dx = dx * k; aim.dy = dy * k;
  if (aimKnob) aimKnob.style.transform = `translate(${aim.dx}px,${aim.dy}px)`;
  aim.cancel = aim.dragged && L < aimDeadPx();
  if (L > 1) aim.dir.set(dx / L, -dy / L);        // pantalla arriba = hacia la portería rival (+y), cámara G mira a +y
  aim.power = THREE.MathUtils.clamp((Math.min(L, aim.R) - aimDeadPx()) / (aim.R - aimDeadPx()), 0, 1);
  if (aimJoy) aimJoy.classList.toggle('cancel', aim.cancel);
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
function quickLobAim() {   // toque rápido de CHUT ALTO: dirección del joystick de mover o portería rival; globo medio
  const md = moveDir();
  if (md) return { dir: md, power: 0.5 };
  const to = goalCenter(user.team).sub(user.pos); const dist = to.length();
  return { dir: to.normalize(), power: lobPowerForDist(Math.min(dist - 1.0, LOB_MIN_D + (LOB_MAX_D - LOB_MIN_D) * 0.5)) };
}
function quickLob() {
  if (S.mode !== 'play' || ball.owner !== user || user.kickPending) return false;
  const q = quickLobAim(); shootLob(user, q.dir, q.power); return true;
}
function aimedLob(dir, p) {
  if (S.mode !== 'play' || ball.owner !== user) return false;
  shootLob(user, dir.clone(), p); return true;
}
// ---- Acciones del jugador (update 13) ----
// Por defecto (como v10/v11): CHUTAR / REGATE / CHUT ALTO con mini-joystick estilo Brawl. Toque corto = acción rápida al SOLTAR
// (sin umbral de tiempo) hacia el joystick de mover; al salir de la zona muerta (~11 px) aparece al instante el joystick de
// apuntar con la flecha; volver al centro cancela. Mantener quieto también lo abre. CHUT ALTO: toque < 120 ms = globo medio,
// mantener sin arrastrar = carga potencia. Opción 'Disparo instantáneo al tocar': Chutar/Regate en el pointerdown, sin apuntar. Si la acción no es posible aún (sin balón, enfriamiento),
// se guarda 150 ms en un buffer y se ejecuta en cuanto se pueda.
const ALTO_TAP_MS = 120, INPUT_BUFFER_MS = 150;
function altoHoldPower() { return 0.15 + 0.85 * THREE.MathUtils.clamp((performance.now() - aim.t0 - ALTO_TAP_MS) / 900, 0, 1); }
function doAction(kind) {
  if (S.mode !== 'play' || !user || S.paused) return false;
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
  if (doAction(b.kind)) input.buf = null;
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
    else if (kind === 'alto') {
      if (!quick) aimedLob(aim.dir, aim.power);
      else if (performance.now() - aim.t0 < ALTO_TAP_MS) quickLob();                  // toque rápido: globo medio
      else { const q = quickLobAim(); aimedLob(q.dir, altoHoldPower()); }               // mantener sin arrastrar: potencia cargada
    }
    else { if (quick) tryDribble(user); else tryDribble(user, aim.dir); }
  } else if (aim.cancel) LOG('apuntado_cancelado', user, { kind });
  el.classList.remove('pulsado', 'apuntando');
  aim.id = null; aim.kind = null; aim.el = null; aim.active = false; aim.cancel = false; aim.dragged = false;
  showAimJoy(false);
}
function bindAim(el, kind) {
  const instIds = new Set();
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.pointerId === joyId) return;
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
    Object.assign(aim, { id: e.pointerId, kind, el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, t0: performance.now(), dragged: false, shown: false, dx: 0, dy: 0, R: aimRadius(el), power: 0, cancel: false, active: true });
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
for (const el of [btnChutar, btnRegate, btnAlto, btnEntrada, btnTurbo, joyZona]) el.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
bindAim(btnChutar, 'chutar');
bindAim(btnRegate, 'regate');
bindAim(btnAlto, 'alto');
bindHold(btnEntrada, (e) => { btnEntrada.classList.add('pulsado'); markAction('entrada', e); if (!doAction('entrada')) bufferAction('entrada'); }, () => btnEntrada.classList.remove('pulsado'));
bindHold(btnTurbo, (e) => { markAction('turbo', e); input.turboDown = true; btnTurbo.classList.add('pulsado'); turboKick(); }, () => { input.turboDown = false; btnTurbo.classList.remove('pulsado'); });

const keyMap = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
window.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) { input.keys[keyMap[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'Enter') { if (!e.repeat) { if (S.mode === 'menu') menuPlay(); else if (S.mode === 'end') startGame(); else if (e.code === 'Space') pressShoot(); } e.preventDefault(); }
  if (S.mode === 'menu' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !e.repeat) menuStep(e.code === 'ArrowLeft' ? -1 : 1);
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { input.turboDown = true; e.preventDefault(); }
  if (e.code === 'KeyQ' && !e.repeat) { quickLob(); e.preventDefault(); }
  if (e.code === 'Escape' && !e.repeat) { if (S.paused) resumeGame(); else openPause(); }
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
window.addEventListener('blur', () => { input.keys = {}; input.jx = input.jy = 0; input.turboDown = false; releaseShoot(true); aimEnd(null, true); });

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
  if (a === user) { const md = moveDir(); if (md) a.face.copy(md); }
  a.dashT = DASH_T; a.dashCd = a === user ? DASH_CD_USER : DASH_CD_AI;
  a.vel.copy(a.face).multiplyScalar(DASH_SPEED);   // impulso inmediato
  a.dashHit = false; a.dashEnded = false;
  a.tackleT = a.meta.Tackle.frames / 30 / TACKLE_RATE; a.play('Tackle', 0.05, true);
  sfx.dash(); LOG('entrada', a, {});
  return true;
}
function tryDribble(a, forceDir) {
  if (!a || ball.owner !== a || a.keeper) return false;
  if (a.dribbleCd > 0 || a.stun > 0 || a.dribbleT > 0 || a.dashT > 0) return false;
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
  a.dribbleT = DRIBBLE_T; a.dribbleCd = DRIBBLE_CD;
  a.vel.copy(dir).multiplyScalar(DRIBBLE_SPEED);   // impulso inmediato
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
  if (a.kickPending) return;
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
  const sp = hspeed !== undefined ? hspeed : 13 + 19 * power;
  ball.owner = null; ball.noCatch = a; ball.noCatchT = 0.35; ball.lastTouch = a;
  if (Math.hypot(ball.pos.x - a.pos.x, ball.pos.y - a.pos.y) < PR + BR * 0.5) ball.pos.set(a.pos.x + dir.x * (PR + BR + 0.15), a.pos.y + dir.y * (PR + BR + 0.15), BR + 0.05);
  ball.pos.z = Math.max(ball.pos.z, BR + 0.05);
  ball.vel.set(dir.x * sp, dir.y * sp, loft !== undefined ? loft : 0.8 + 3.2 * power * power);   // chut normal: raso / poca altura
  if (hspeed !== undefined) ball.pos.z = BR + 0.02;
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
    const acc = 1 - Math.exp(-(a === user ? 26 : 14) * dt);   // usuario: menos inercia (~40 ms) para que responda ya
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
// integración del vuelo (la usa también la predicción de trayectoria, para que coincida con el real)
function airStep(p, v, dt) {
  v.z -= GRAV * dt;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
  if (p.z > BR + 0.02) { const f = Math.exp(-AIR_DRAG * dt); v.x *= f; v.y *= f; }
}
// predicción del vuelo hasta el primer bote (misma integración que el balón real; sin colisiones)
const _pp = new THREE.Vector3(), _pv = new THREE.Vector3();
function predictFlight(pos, vel, out, maxT = 5, h = 1 / 120) {
  _pp.copy(pos); _pv.copy(vel); let t = 0, peak = pos.z;
  if (out) out.length = 0;
  while (t < maxT) {
    airStep(_pp, _pv, h); t += h; peak = Math.max(peak, _pp.z);
    if (out) out.push(_pp.x, _pp.y, _pp.z);
    if (_pp.z <= BR && _pv.z < 0) { _pp.z = BR; break; }
  }
  return { x: _pp.x, y: _pp.y, t, peak, dist: Math.hypot(_pp.x - pos.x, _pp.y - pos.y) };
}
// CHUT ALTO: la potencia (0-1) fija ángulo y alcance: poca = globo corto y bajo; mucha = más alto y más lejos
const LOB_MIN_D = 7, LOB_MAX_D = 30, LOB_MIN_ANG = 45, LOB_MAX_ANG = 60;
function lobParams(power, from) {
  const p = THREE.MathUtils.clamp(power, 0, 1);
  const D = LOB_MIN_D + (LOB_MAX_D - LOB_MIN_D) * p;
  const ang = THREE.MathUtils.degToRad(LOB_MIN_ANG + (LOB_MAX_ANG - LOB_MIN_ANG) * p);
  // resolver la velocidad para caer a D (con el rozamiento del aire): bisección sobre la predicción
  const start = new THREE.Vector3(0, 0, from ? from.z : BR + 0.02);
  let lo = 3, hi = 40;
  for (let i = 0; i < 18; i++) {
    const v = (lo + hi) / 2;
    const r = predictFlight(start, new THREE.Vector3(0, v * Math.cos(ang), v * Math.sin(ang)), null, 6, 1 / 60);
    if (r.dist < D) lo = v; else hi = v;
  }
  const v = (lo + hi) / 2;
  return { D, ang, h: v * Math.cos(ang), vz: v * Math.sin(ang) };
}
function lobPowerForDist(dist) { return THREE.MathUtils.clamp((dist - LOB_MIN_D) / (LOB_MAX_D - LOB_MIN_D), 0, 1); }
function shootLob(a, dir, power) {
  const lp = lobParams(power);
  shoot(a, dir, power, false, lp.vz, lp.h);
  LOG('chut_alto', a, { p: +power.toFixed(2), D: +lp.D.toFixed(1), ang: Math.round(THREE.MathUtils.radToDeg(lp.ang)) });
}
function stepBall(dt, prev) {
  const b = ball;
  airStep(b.pos, b.vel, dt);
  // suelo: bote con restitución y algo de fricción en el impacto; rodadura con rozamiento
  if (b.pos.z < BR) {
    b.pos.z = BR;
    if (b.vel.z < -1.2) { b.vel.z = -b.vel.z * BOUNCE_E; b.vel.x *= 0.88; b.vel.y *= 0.88; if (b.vel.z > 3) sfx.bounce && sfx.bounce(); }
    else b.vel.z = 0;
    if (b.vel.z === 0) {
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
    if (b.pos.z < GH + BR) { collideCircle2D(POST_X, gl, POST_R, 0.6); collideCircle2D(-POST_X, gl, POST_R, 0.6); }
    if (Math.abs(b.pos.x) < POST_X) {
      const dy = b.pos.y - gl, dz = b.pos.z - GH, L = Math.hypot(dy, dz), min = POST_R + BR;
      if (L < min && L > 1e-5) {
        const ny = dy / L, nz = dz / L; b.pos.y = gl + ny * min; b.pos.z = GH + nz * min;
        const vn = b.vel.y * ny + b.vel.z * nz; if (vn < 0) { b.vel.y -= 1.6 * vn * ny; b.vel.z -= 1.6 * vn * nz; sfx.kick(0.1); }
      }
    }
    const nearY = inY(b.pos.y) || inY(prev.y);
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
      if (wasIn && pIn && !nIn && Math.sign(b.pos.x) === sx) {           // desde dentro: la red amortigua
        b.pos.x = sx * (NET_X - BR); b.vel.x = -b.vel.x * 0.12; b.vel.y *= 0.6; b.vel.z *= 0.8;
      } else if (!wasIn && Math.abs(prev.x) >= NET_X + BR - 0.01 && Math.abs(b.pos.x) < NET_X + BR && Math.sign(b.pos.x) === sx) {   // desde fuera
        b.pos.x = sx * (NET_X + BR); b.vel.x = -b.vel.x * 0.3; b.vel.y *= 0.7;
      }
    }
    if (Math.abs(b.pos.x) < NET_X + 0.05) {
      // red trasera (desde dentro): frena en seco y cae
      if (b.pos.z < NET_Z && (b.pos.y - back) * s > -BR) { b.pos.y = back - s * BR; b.vel.y = -b.vel.y * 0.05; b.vel.x *= 0.5; b.vel.z *= 0.6; }
      // techo desde dentro
      if (prev.z <= NET_Z - BR + 0.01 && b.pos.z > NET_Z - BR) { b.pos.z = NET_Z - BR; b.vel.z = -Math.abs(b.vel.z) * 0.2; b.vel.x *= 0.8; b.vel.y *= 0.8; }
      // techo desde fuera (vaselina que cae encima): bota poco y rueda hacia atrás
      if (prev.z >= NET_Z + BR - 0.02 && b.pos.z < NET_Z + BR) {
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
const tmp2 = new THREE.Vector2();
function aiField(a, opp, dt) {
  const wish = new THREE.Vector2();
  const bp = new THREE.Vector2(ball.pos.x, ball.pos.y);
  const atkY = a.team === 0 ? HL : -HL, dirY = Math.sign(atkY);
  a.wantTurbo = false;
  if (ball.owner === a) {
    // conducir hacia la portería, esquivando al rival
    const gk = a.team === 0 ? gkB : gkA;
    if (!a.aimX || Math.random() < dt * 0.4) a.aimX = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4.5);   // campo v5 más ancho: usa más las bandas
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
    let pred = bp.clone().addScaledVector(new THREE.Vector2(ball.vel.x, ball.vel.y), 0.35);
    if (ball.pos.z > 1.2) { const l = predictFlight(ball.pos, ball.vel, null, 4, 1 / 60); pred = new THREE.Vector2(l.x, l.y); }   // balón alto: al punto de caída
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
  // el rival se acerca con el balón: el portero sale a tapar ángulo (y se expone a la vaselina)
  const h = ball.owner;
  if (h && h !== k && h.team !== k.team && !h.keeper) {
    const dGoal = Math.abs(s * HL - h.pos.y);
    const out = THREE.MathUtils.clamp((18 - dGoal) * 0.4, 0, 4);
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
  if (ball.owner === k) return;
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
  elA.textContent = '0'; elB.textContent = '0'; elReloj._t = null;
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
// Turbo: el impulso se nota desde el primer frame (velocidad a tope de sprint en la dirección del joystick)
function turboKick(w) {
  if (!user || S.mode !== 'play' || S.paused) return;
  const wish = w || moveDir(); if (!wish || wish.lengthSq() < 0.04) return;
  if (user.stun > 0 || user.dashT > 0 || user.dribbleT > 0 || user.diveT > 0) return;
  if (!(user.energy > TURBO_MIN)) return;
  user.sprinting = true; user._spr = true;
  const sp = SPEED_USER * (ball.owner === user ? 0.9 : 1) * TURBO_MULT;
  const d = wish.clone().normalize();
  if (user.vel.dot(d) < sp) user.vel.copy(d).multiplyScalar(sp);
}
function update(dt) {
  S.t += dt;
  if (S.mode === 'kickoff') { S.pauseT -= dt; if (S.pauseT <= 0) S.mode = 'play'; }
  if (S.mode === 'goal') { S.pauseT -= dt; if (S.pauseT <= 0) { if (S.time <= 0) endGame(); else kickoff(); } }
  if (S.mode === 'out' && S.time <= 0) endGame();
  const playing = S.mode === 'play';
  if (playing) {
    S.time -= dt; if (S.time <= 0) { S.time = 0; if (S.score[0] !== S.score[1] || true) { endGame(); } }
  }
  const rt = fmt(S.time); if (rt !== elReloj._t) { elReloj._t = rt; elReloj.textContent = rt; elReloj.classList.toggle('poco', S.time <= 15); }

  // --- usuario ---
  const wish = new THREE.Vector2(input.jx, input.jy);
  if (input.keys.u) wish.y += 1; if (input.keys.d) wish.y -= 1; if (input.keys.l) wish.x -= 1; if (input.keys.r) wish.x += 1;
  if (wish.length() > 1) wish.normalize();
  const canMove = playing;
  if (playing) runBuffer();
  if (user) updateEnergy(user, playing && input.turboDown, wish.lengthSq() > 0.04, dt);
  if (user && user.sprinting && !user._spr && wish.lengthSq() > 0.04) turboKick(wish);
  if (user) user._spr = user.sprinting;
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
      } else if (!ball.owner && d < PR + BR + 0.15 && ball.pos.z < 1.05 * ESCALA) {   // solo balones bajos (pecho para abajo)
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
    // gol: el balón entero cruza la línea entre postes y por debajo del larguero (lo detecta stepBall)
    const ev = ball.lineEvent;
    if (ev) {
      ball.lineEvent = null;
      if (ev.type === 'gol') goalScored(ev.s > 0 ? 0 : 1);
      else ballOut(ev);
    }
  } else ball.lineEvent = null;
  if (S.mode === 'out') { S.pauseT -= dt; if (S.pauseT <= 0) goalKick(); }
  if ((S.mode === 'goal' || S.mode === 'out') && !ball.owner) { const n = 4; for (let i = 0; i < n; i++) stepBall(dt / n, ball.pos.clone()); }

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
  ring(cargaAlto, aim.active && aim.kind === 'alto' && !aim.cancel ? (aim.dragged ? aim.power : (performance.now() - aim.t0 > ALTO_TAP_MS ? (altoHoldPower() - 0.15) / 0.85 : 0)) : 0);
  ring(cargaRegate, user ? (user.dribbleCd > 0 ? 1 - user.dribbleCd / DRIBBLE_CD : 1) : 1);
  ring(cargaEntrada, user ? (user.dashCd > 0 ? 1 - user.dashCd / DASH_CD_USER : 1) : 1);
  ring(cargaTurbo, user ? user.energy : 1);
  btnRegate.classList.toggle('cd', !!(user && user.dribbleCd > 0));
  btnEntrada.classList.toggle('cd', !!(user && user.dashCd > 0));
  btnTurbo.classList.toggle('pulsado', !!input.turboDown);
  btnTurbo.classList.toggle('activo', !!(user && user.sprinting));
  btnTurbo.classList.toggle('vacio', !!(user && user.energy <= TURBO_MIN && !user.sprinting));
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
  const r1 = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.05, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4f7b, transparent: true, opacity: 0.95, depthWrite: false }));
  const r2 = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  const cr = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.12).rotateX(-Math.PI / 2), r1.material);
  const cr2 = cr.clone(); cr2.rotation.y = Math.PI / 2;
  for (const m of [r1, r2, cr, cr2]) { m.renderOrder = 4; m.position.y = 0.05; lobLand.add(m); }
  flightMark = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
  flightMark.renderOrder = 3;
  for (const o of [lobArc, lobGround, lobLand, flightMark]) { o.visible = false; o.frustumCulled = false; scene.add(o); }
}
function updateLobPreview(on) {
  if (!lobArc) return;
  lobArc.visible = lobGround.visible = lobLand.visible = !!on;
  if (!on) return;
  if (!aim.dragged) { const q = quickLobAim(); aim.dir.copy(q.dir); aim.lobP = performance.now() - aim.t0 > ALTO_TAP_MS ? altoHoldPower() : q.power; } else aim.lobP = aim.power;
  const lp = lobParams(aim.lobP);
  const start = new THREE.Vector3(ball.pos.x + aim.dir.x * 0.4, ball.pos.y + aim.dir.y * 0.4, BR + 0.02);
  const land = predictFlight(start, new THREE.Vector3(aim.dir.x * lp.h, aim.dir.y * lp.h, lp.vz), _lobPts);
  const n = _lobPts.length / 3;
  for (let i = 0; i < LOB_DOTS; i++) {
    const k = Math.min(n - 1, Math.round((i + 0.5) / LOB_DOTS * (n - 1))) * 3;
    const x = _lobPts[k], y = _lobPts[k + 1], z = _lobPts[k + 2];
    _m4.makeTranslation(x, z, -y); lobArc.setMatrixAt(i, _m4);
    _m4.makeTranslation(x, 0.03, -y); lobGround.setMatrixAt(i, _m4);
  }
  lobArc.instanceMatrix.needsUpdate = true; lobGround.instanceMatrix.needsUpdate = true;
  lobLand.position.set(land.x, 0, -land.y);
  aim.lobLand = { x: +land.x.toFixed(2), y: +land.y.toFixed(2), peak: +land.peak.toFixed(2), dist: +land.dist.toFixed(2) };
}
function updateFlightMark() {
  if (!flightMark) return;
  const on = !ball.owner && ball.pos.z > 1.4 && S.mode !== 'menu';
  flightMark.visible = on;
  if (!on) return;
  const l = predictFlight(ball.pos, ball.vel, null, 4, 1 / 60);
  flightMark.position.set(l.x, 0.04, -l.y);
  flightMark.scale.setScalar(0.8 + Math.min(1.2, ball.pos.z * 0.08));
}
function updateAimLine() {
  if (!aimLine) return;
  const on = aim.active && aim.shown && !aim.cancel && user && ball.owner === user && S.mode === 'play';
  updateLobPreview(on && aim.kind === 'alto');
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
  u.mat.color.set(isShot ? (aim.dragged ? new THREE.Color().setHSL(0.14 - 0.12 * aim.power, 1, 0.55) : 0xffd23f) : 0xd77bff);
  const body = Math.max(0.3, len - start - 1.25);
  for (const m of [u.strip, u.shadow]) { m.scale.set(m === u.shadow ? w + 0.16 : w, 1, body); m.position.z = -start; }
  u.head.position.z = -(start + body); u.headSh.position.z = -(start + body) + 0.12;
  aimLine.position.copy(g2t(user.pos.x, user.pos.y, 0));
  aimLine.rotation.y = Math.atan2(-aim.dir.x, aim.dir.y);
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
  renderer.render(scene, camera);
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
  S.paused = false; pausaEl.classList.remove('visible'); resetInputs();
  if (ballMesh) { ball.owner = null; ball.vel.set(0, 0, 0); }
  LOG('salir_partido', null, {});
  openMenu();
}
marcadorEl.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); openPause(); });
document.getElementById('btnReanudar').addEventListener('click', resumeGame);
document.getElementById('btnSalir').addEventListener('click', quitMatch);
pausaEl.addEventListener('pointerdown', (e) => { if (e.target === pausaEl) { e.preventDefault(); resumeGame(); } });

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
};
const BTN_IDS = ['chutar', 'regate', 'turbo', 'entrada', 'alto'];
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
  if (editor.sel && editor.sel !== 'joy' && editor.sel !== 'turbo' && getComputedStyle(CTRL[editor.sel].el).visibility === 'hidden') edSelect(null);
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

Object.assign(window.__game, {
  paused: false,
  advance: (sec, step = 1 / 60, draw = true) => { for (let t = 0; t < sec - 1e-6; t += step) { if (S.mode !== 'menu' && S.mode !== 'end') update(step); if (draw) render(step); } },
  forceGoal: (team) => goalScored(team),
  selectChar: (i) => selectChar(i), menuPlay: () => menuPlay(), openMenu: () => openMenu(),
  get menuSel() { return sel; }, get rivalSel() { return rivalSel; }, setRival: (i) => { rivalSel = i; }, CHARS,
  HORIZONTAL, VERTICAL, CAMS,
  tryLandscape, updateOrient,
  setCamMode: (m) => setCamMode(m, true),
  setJoyDir,
  openPause: () => openPause(), resumeGame: () => resumeGame(), quitMatch: () => quitMatch(),
  lobParams, predictFlight, shootLob: (p, dx, dy) => shootLob(user, new THREE.Vector2(dx, dy), p),
  get aim() { return aim; },
  relayout: () => onViewportChange(),
  setupMatch,
  AJ, QS, setQuality, applyQuality, applyControls, setShowFps, setInstantTap: (on) => setInstantTap(on), lastAction: null,
  openSettings: (from) => openAjustes(from), closeSettings: () => closeAjustes(),
  openEditor: () => openEditor(), closeEditor: (save) => closeEditor(save),
  get editor() { return editor; }, edSelect: (id) => edSelect(id), edView: (v) => edView(v),
  setCtrl: (id, v) => { const t = editor.on ? editor.draft : AJ.ctrl; t[id] = Object.assign(t[id] || { s: 1 }, v); applyControls(); },
  ctrlRect: (id) => { const r = CTRL[id].el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
});
Object.defineProperty(window.__game, 'camMode', { get: () => camMode });
Object.defineProperty(window.__game, 'inputBuf', { get: () => input.buf });
Object.defineProperty(window.__game, 'simplifierReady', { get: () => !!Simplifier });
Object.defineProperty(window.__game, 'vp', { get: () => lastVP });
(async function init() {
  const cargando = document.getElementById('cargando');
  applyQuality('init');
  try {
    cargando.textContent = 'Cargando personajes…';
    META = await (await fetch('assets/anim_meta.json?v=13')).json();
    const gl = await Promise.all(CHARS.map((c) => load(c.file)));
    CHARS.forEach((c, i) => { GLB[c.key] = gl[i]; toStandard(gl[i].scene); });
    applyTextureQuality();
    buildMenuChars(); buildMenuUI();
    layout(); layoutMenu(); updateOrient();
    cargando.classList.add('oculto');
    openMenu();
    window.__game.menuReady = true;
    requestAnimationFrame(frame);
    campoReady = load('assets/campo.glb?v=13').then((campo) => { setupField(campo); window.__game.ready = true; });
    await campoReady;
  } catch (err) {
    console.error(err);
    cargando.classList.remove('oculto');
    cargando.textContent = 'Error cargando: ' + err.message;
  }
})();
