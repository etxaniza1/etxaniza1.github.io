import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CAMPOS, CAMPO_NOM, TEMAS, buildDeco } from './campos.js?v=48';   // update 39

// ===================== CONSTANTES (metros, coords "Blender": x derecha, y hacia la portería rival) =====================
const P = new URLSearchParams(location.search);
const ESCALA = parseFloat(P.get('escala') || '1.3');      // escala de personajes (1 = 2,00 m; 1.3 se lee mejor en móvil)
const LAND_R = 1.9;   // update 31: radio del círculo de caída (m): solo se cabecea dentro
const DURACION = parseFloat(P.get('tiempo') || '120');   // segundos de partido
// Por defecto: apaisado 16:9, campo en vertical, cámara G. ?vertical=1 recupera el modo retrato antiguo.
const VERTICAL = (P.has('vertical') && P.get('vertical') !== '0')
  || (P.get('horizontal') === '0');
const HORIZONTAL = !VERTICAL;
const CAM_MODE = (P.get('camara') || (HORIZONTAL ? 'G' : 'A')).toUpperCase();
if (HORIZONTAL) document.body.classList.add('horizontal');
const HW = 19, HL = 24;                    // medio ancho / medio largo entre líneas (campo v5 38×48 m)
const WX = 21.2, WY = 28.0;
const SIDE_X = HW;                        // update 37: pared invisible de banda (centro del balón / límite de jugadores de campo)                // cara interior de las vallas (RUN_X 2.2 / RUN_Y 3.3)
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
const _g2tS = new THREE.Vector3(), g2tS = (x, y, z = 0) => _g2tS.set(x, z, -y);   // update 31: versión sin crear objeto (solo para .copy inmediato)
// personajes jugables (glb con rig + animaciones) y parámetros de animación (anim_meta.json, exportado desde Blender)
const ASSET_V = 'v=48';   // cache busting de modelos y tarjetas
// update 27: badges (retratos ilustrados) del selector. Añadir la clave aquí y el archivo assets/badges/<clave>.webp
// (recortado con rig/badge.py). Los personajes sin badge siguen con su tarjeta de siempre.
const BADGES = ['conazo', 'calcetrol', 'buton', 'lobo', 'zorro', 'gecko', 'rino', 'turtobola', 'conejo', 'carnero', 'pepi', 'mofeta', 'pantera', 'murcielago', 'ladri', 'tubi', 'ajolote', 'rubibot', 'frogetto', 'zora', 'tiburon', 'mushom', 'cacutu', 'kaledy', 'dante'];
const ALL_CHARS = [
  { key: 'conazo', name: 'CONAZO', color: '#F2751A', toon: true },   // update 36: modelo nuevo (Tripo) -> toon con outline
  { key: 'calcetrol', name: 'CALCETROL', color: '#E5343A', toon: true },   // update 22: nuevo modelo Tripo (mismo id/stats/carta)
  { key: 'buton', name: 'BUTÓN', color: '#F8B715', toon: true },   // update 36: modelo nuevo (Tripo) -> toon con outline
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
  { key: 'tubi', name: 'TUBI', color: '#D62839', toon: true },             // update 30: Tubi el desatascador (Tripo)
  { key: 'ajolote', name: 'AJOLOTE', color: '#E2559F', toon: true },        // update 34: Ajolote (Tripo por piezas)
  { key: 'rubibot', name: 'RUBIBOT', color: '#4C3D8F', toon: true },        // update 36: robot mariposa (Tripo)
  { key: 'frogetto', name: 'FROGETTO', color: '#2FA39A', toon: true },      // update 36: rana maga (Tripo)
  { key: 'zora', name: 'ZORA', color: '#2BD96B', toon: true },              // update 36: loba eléctrica (Tripo)
  { key: 'tiburon', name: 'TIBURÓN', color: '#6E9CC4', toon: true },        // update 36: tiburón (Tripo)
  { key: 'mushom', name: 'MUSHOM', color: '#8B3FD9', toon: true },          // update 37: seta misteriosa (Tripo)
  { key: 'cacutu', name: 'CACUTU', color: '#3F7D3A', toon: true },          // update 37 (t83u): cactus con bombín (Tripo)
  { key: 'kaledy', name: 'KALEDY', color: '#D4202A', toon: true },          // update 47 (t101u/t105u): KALEDY (Tripo, GLB de Aritz; equipación negra)
  { key: 'dante', name: 'DANTE', color: '#6CACE4', toon: true },            // update 47 (t104u/t105u): DANTE (Tripo, GLB de Aritz; equipación negra; badge inventado)
].map((c) => ({ scale: 1, file: `assets/${c.key}_anim.glb?${ASSET_V}`, card: `assets/cards/${c.key}.png?${ASSET_V}`,
  badge: BADGES.includes(c.key) ? `assets/badges/${c.key}.webp?${ASSET_V}` : null, ...c }));
// update 37: Butón y Turtobola son SOLO PORTEROS: fuera de la selección de campo (rueda, rejilla, liga, torneo, rivales IA)
const GK_ONLY = ['buton', 'turtobola'];
const CHARS = ALL_CHARS.filter((c) => !GK_ONLY.includes(c.key));      // jugadores de campo (lo que se elige)
const GK_CHARS = ALL_CHARS.filter((c) => GK_ONLY.includes(c.key));    // porteros
// update 32: badges a prueba de fallos: precarga al arrancar; si una imagen de badge falla se reintenta una vez
// (sin caché) y, si vuelve a fallar, se muestra la carta del personaje (nunca un hueco vacío)
const BADGE_ERR = [];
document.addEventListener('error', (e) => {
  const i = e.target; if (!i || i.tagName !== 'IMG') return;
  const m = /assets\/badges\/([a-z]+)\.webp/.exec(i.getAttribute('src') || ''); if (!m) return;
  BADGE_ERR.push(m[1]);
  if (!i.dataset.reint) { i.dataset.reint = '1'; i.src = `assets/badges/${m[1]}.webp?${ASSET_V}&r=${Date.now()}`; return; }
  const c = ALL_CHARS.find((x) => x.key === m[1]); if (c && c.card) i.src = c.card;
}, true);
const BADGE_PRE = ALL_CHARS.filter((c) => c.badge).map((c) => { const im = new Image(); im.decoding = 'async'; im.src = c.badge; return im; });
// ===================== STATS DE PERSONAJE (update 17) =====================
// Escala 1-100. ATAQUE: vel (velocidad), tir (potencia de tiro), pre (precisión/control), reg (regate).
// DEFENSA: ent (entrada/robo), fis (físico: aguantar entradas y choques), ref (reflejos: su portero).
// Todos suman 556 puntos (nadie es mejor en total); la MEDIA premia la especialidad (como en las cartas de fútbol).
const STATS = {   // update 31: rehechas. Más variedad: nadie es bueno en todo. cur = EFECTO (curva del balón al chutar/centrar, 0 recto - 100 mucha curva)
  conazo: { vel: 64, tir: 62, pre: 70, reg: 60, ent: 72, fis: 74, ref: 68, cur: 10, pos: 'MC', lema: 'Del montón: hace un poco de todo, nada brillante' },
  calcetrol: { vel: 88, tir: 58, pre: 76, reg: 95, ent: 62, fis: 52, ref: 84, cur: 35, pos: 'EXT', lema: 'Escurridizo: se estira y se escapa, pero chuta flojo' },
  buton: { vel: 52, tir: 90, pre: 68, reg: 48, ent: 84, fis: 90, ref: 76, cur: 0, pos: 'DFC', lema: 'Lento como un armario, pero su zambombazo lejano duele' },
  lobo: { vel: 92, tir: 74, pre: 72, reg: 84, ent: 93, fis: 76, ref: 60, cur: 15, pos: 'MCD', lema: 'Cazador: rápido y muerde en la presión' },
  zorro: { vel: 90, tir: 74, pre: 97, reg: 94, ent: 62, fis: 56, ref: 84, cur: 80, pos: 'MP', lema: 'Astuto: la pone donde quiere y con una rosca imposible' },
  gecko: { vel: 99, tir: 54, pre: 78, reg: 94, ent: 68, fis: 48, ref: 90, cur: 30, pos: 'EI', lema: 'Eléctrico: el más rápido, pero de lejos no hace daño' },
  turtobola: { vel: 42, tir: 78, pre: 64, reg: 46, ent: 80, fis: 93, ref: 92, cur: 0, pos: 'POR', lema: 'Blindado: lentísimo, pero bajo palos no pasa nada' },
  conejo: { vel: 82, tir: 60, pre: 96, reg: 88, ent: 58, fis: 50, ref: 97, cur: 45, pos: 'MCO', lema: 'Señal perfecta: lo capta todo antes que nadie' },
  carnero: { vel: 66, tir: 96, pre: 80, reg: 86, ent: 72, fis: 90, ref: 60, cur: 40, pos: 'SD', lema: 'Pincha el ritmo: aguanta, gira y suelta el bajo' },
  pepi: { vel: 95, tir: 66, pre: 64, reg: 94, ent: 76, fis: 46, ref: 84, cur: 20, pos: 'ED', lema: 'Avinagrado: rapidísimo y escurridizo, pero se cae solo' },
  mofeta: { vel: 54, tir: 68, pre: 60, reg: 50, ent: 93, fis: 94, ref: 82, cur: 5, pos: 'DFC', lema: 'Muro apestoso: nadie quiere acercarse' },
  rino: { vel: 50, tir: 99, pre: 62, reg: 54, ent: 84, fis: 94, ref: 76, cur: 25, pos: 'DC', lema: 'Ariete lento: el cañón lejano más fuerte de la liga' },
  pantera: { vel: 98, tir: 96, pre: 88, reg: 92, ent: 66, fis: 68, ref: 58, cur: 50, pos: 'DC', lema: 'Sombra letal: aparece de la nada y la clava (no defiende)' },
  murcielago: { vel: 98, tir: 62, pre: 76, reg: 97, ent: 76, fis: 44, ref: 90, cur: 35, pos: 'EI', lema: 'Cazador nocturno: vuela por la banda, pero es de papel' },
  ladri: { vel: 46, tir: 72, pre: 66, reg: 48, ent: 94, fis: 95, ref: 86, cur: 0, pos: 'DFC', lema: 'Muro de ladrillo: por aquí no pasa ni el aire' },
  tubi: { vel: 58, tir: 70, pre: 80, reg: 72, ent: 86, fis: 84, ref: 50, cur: 15, pos: 'MCD', lema: 'Ventosa: lo que toca, se queda pegado' },
  ajolote: { vel: 76, tir: 64, pre: 82, reg: 86, ent: 78, fis: 62, ref: 88, cur: 30, pos: 'CAR', lema: 'Regenerador: resbaladizo, incansable y siempre vuelve' },   // update 34
  // update 36: personajes nuevos (EFECTO 0-50, ninguno por debajo de Conazo)
  rubibot: { vel: 84, tir: 70, pre: 90, reg: 82, ent: 60, fis: 58, ref: 86, cur: 42, pos: 'MI', lema: 'Mariposa mecánica: vuela entre líneas y la pone con escuadra' },
  frogetto: { vel: 68, tir: 76, pre: 86, reg: 74, ent: 72, fis: 64, ref: 93, cur: 48, pos: 'LIB', lema: 'Mago del área: lee la jugada antes de que pase' },
  zora: { vel: 96, tir: 80, pre: 70, reg: 88, ent: 74, fis: 60, ref: 72, cur: 22, pos: 'LI', lema: 'Relámpago: arranca como un rayo y sube la banda sin parar' },
  tiburon: { vel: 72, tir: 86, pre: 64, reg: 58, ent: 91, fis: 92, ref: 64, cur: 8, pos: 'LD', lema: 'Huele la sangre: va a por el balón y no lo suelta' },
  mushom: { vel: 70, tir: 74, pre: 88, reg: 84, ent: 66, fis: 62, ref: 90, cur: 38, pos: 'MD', lema: 'Seta misteriosa: aparece entre esporas y te deja mareado' },   // update 37
  cacutu: { vel: 60, tir: 72, pre: 78, reg: 64, ent: 88, fis: 91, ref: 70, cur: 18, pos: 'PIV', lema: 'Pivote espinoso: planta la maceta en el centro y nadie se le acerca sin pincharse' },   // update 37 (t83u)
  kaledy: { vel: 90, tir: 99, pre: 84, reg: 88, ent: 50, fis: 82, ref: 64, cur: 44, pos: 'DC', lema: 'El cañonero: dispara desde cualquier sitio y remata de cabeza como nadie (no baja a defender)' },   // update 47 (t101u)
  dante: { vel: 91, tir: 90, pre: 96, reg: 99, ent: 44, fis: 42, ref: 80, cur: 50, pos: 'MP', lema: 'El mago: el mejor regate de la liga, el balón pegado al pie y una rosca de seda; pierde los choques' },   // update 47 (t104u)
};
const STAT_KEYS = ['vel', 'tir', 'pre', 'reg', 'ent', 'fis', 'ref'];
const STAT_NAMES = { vel: 'VELOCIDAD', tir: 'TIRO', pre: 'PRECISIÓN', reg: 'REGATE', ent: 'ENTRADA', fis: 'FÍSICO', ref: 'REFLEJOS', cur: 'EFECTO' };
for (const k in STATS) {
  const t = STATS[k], all = STAT_KEYS.map((x) => t[x]), top3 = [...all].sort((a, b) => b - a).slice(0, 3);
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  t.atq = Math.round(avg([t.vel, t.tir, t.pre, t.reg])); t.def = Math.round(avg([t.ent, t.fis, t.ref]));
  t.media = Math.round(0.55 * avg(top3) + 0.45 * avg(all));   // update 31: media = especialidad + conjunto (sin suma fija)
  t.rareza = t.media >= 84 ? 'oro' : t.media >= 78 ? 'plata' : 'bronce';
}
// update 31: rango más amplio (stats 40-99): 75 -> ×1, 97 -> ×(1+amp), 53 -> ×(1-amp), 42 -> ×(1-1,5·amp)
function statF(v, amp = 0.15) { return THREE.MathUtils.clamp(1 + amp * (v - 75) / 22, 1 - 1.5 * amp, 1 + 1.1 * amp); }
// ===================== CARTAS Y PROGRESIÓN (update 37) =====================
// STATS de arriba = la IDENTIDAD de cada personaje (su forma de jugar). Cada carta sube de nivel 0 a LV_MAX con MONEDAS:
// nivel 0 = BRONCE (media 56-60), LV_MAX = LEYENDA (media 90-96, más alta cuanto mejor es su identidad). La media sube regular por nivel.
// Perfil de crecimiento propio: sus puntos fuertes crecen antes y llegan más lejos; los flojos crecen tarde y poco (nadie se
// vuelve bueno en todo). EFECTO: crece hasta su valor de identidad y ahí se queda (Zorro sigue con el EFECTO máximo).
const LV_MAX = 30, LV_REF = 'ref';
const TIERS = [{ k: 'bronce', n: 'BRONCE', min: 0 }, { k: 'plata', n: 'PLATA', min: 65 }, { k: 'oro', n: 'ORO', min: 75 }, { k: 'diamante', n: 'DIAMANTE', min: 85 }, { k: 'leyenda', n: 'LEYENDA', min: 90 }];
const tierDe = (m) => { let i = 0; while (i + 1 < TIERS.length && m >= TIERS[i + 1].min) i++; return TIERS[i]; };
// porteros (solo Butón y Turtobola): stats propias de portero, mapeadas a lo que ya usa la IA del portero
const GK_STAT_KEYS = ['est', 'ref', 'col', 'sal', 'saq'];
const GK_STAT_NAMES = { est: 'ESTIRADA', ref: 'REFLEJOS', col: 'COLOCACIÓN', sal: 'SALTO', saq: 'SAQUE' };
const GK_STATS = {
  buton: { est: 76, ref: 82, col: 90, sal: 84, saq: 93, lema: 'Un armario bajo palos: siempre bien colocado y saca como un cañón' },
  turtobola: { est: 92, ref: 94, col: 80, sal: 70, saq: 64, lema: 'Caparazón blindado: reflejos imposibles, pero saca flojito' },
};
const isGK = (k) => GK_ONLY.includes(k);
const statKeysOf = (k) => isGK(k) ? GK_STAT_KEYS : STAT_KEYS;
const baseOf = (k) => isGK(k) ? GK_STATS[k] : STATS[k];
const avgA = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function mediaDe(vals) { const top3 = [...vals].sort((a, b) => b - a).slice(0, 3); return Math.round(0.55 * avgA(top3) + 0.45 * avgA(vals)); }
for (const k in GK_STATS) { const t = GK_STATS[k]; t.media = mediaDe(GK_STAT_KEYS.map((x) => t[x])); t.pos2 = 'POR'; }
const PROG_CURVE = {};   // key -> { min:{}, max:{}, e:{} }
function progCurve(k) {
  if (PROG_CURVE[k]) return PROG_CURVE[k];
  const ks = statKeysOf(k), b = baseOf(k), bm = mediaDe(ks.map((x) => b[x]));
  const order = [...ks].sort((x, y) => b[y] - b[x]), rank = {}; order.forEach((x, i) => { rank[x] = i; });
  const n = ks.length, w = {}, e = {};
  for (const x of ks) {
    const r = rank[x];
    w[x] = r < 3 ? 1 : r < n - 2 ? 0.62 : 0.34;          // cuánto puede crecer cada stat por encima de su identidad
    e[x] = r < 2 ? 0.7 : r < 4 ? 0.9 : r < n - 2 ? 1.15 : 1.5;   // forma de la curva: fuertes antes, flojas tarde
  }
  const tMin = THREE.MathUtils.clamp(57 + (bm - 70) * 0.15, 56, 60), tMax = THREE.MathUtils.clamp(90 + (bm - 70) * 0.3, 90, 96);
  const solve = (f, target) => { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(m) < target) lo = m; else hi = m; } return (lo + hi) / 2; };
  const mkMax = (q) => { const o = {}; for (const x of ks) o[x] = Math.min(99, Math.round(b[x] + (99 - b[x]) * q * w[x])); return o; };
  const mkMin = (q) => { const o = {}; for (const x of ks) o[x] = Math.max(30, Math.round(b[x] - (b[x] - 30) * q)); return o; };
  const max = mkMax(solve((q) => mediaDe(ks.map((x) => mkMax(q)[x])), tMax));
  const min = mkMin(solve((q) => -mediaDe(ks.map((x) => mkMin(q)[x])), -tMin));
  return (PROG_CURVE[k] = { ks, min, max, e, base: b });
}
// stats de un personaje a un nivel. Cada stat sigue su forma (u^e: fuertes antes, flojas tarde) y el "tiempo" u(L) se ajusta
// por personaje para que la MEDIA suba de forma regular (lineal) de bronce (nivel 0) a leyenda (nivel LV_MAX).
// lv = 'ref' -> su carta de identidad (STATS de siempre; solo para las pruebas de regresión antiguas)
function statsAtU(C, u) { const o = {}; for (const x of C.ks) o[x] = Math.round(C.min[x] + (C.max[x] - C.min[x]) * Math.pow(u, C.e[x])); return o; }
function progU(k, lv) {
  const C = progCurve(k); C.u = C.u || [];
  if (C.u[lv] !== undefined) return C.u[lv];
  const m0 = mediaDe(C.ks.map((x) => C.min[x])), m1 = mediaDe(C.ks.map((x) => C.max[x])), tgt = m0 + (m1 - m0) * lv / LV_MAX;
  const f = (u) => { const o = {}; for (const x of C.ks) o[x] = C.min[x] + (C.max[x] - C.min[x]) * Math.pow(u, C.e[x]); return mediaDe(C.ks.map((x) => o[x])); };
  let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(m) < tgt) lo = m; else hi = m; }
  return (C.u[lv] = lv <= 0 ? 0 : lv >= LV_MAX ? 1 : (lo + hi) / 2);
}
function statsAt(k, lv) {
  const C = progCurve(k), ref = lv === 'ref';
  if (!ref) lv = THREE.MathUtils.clamp(Math.round(+lv || 0), 0, LV_MAX);
  const o = ref ? Object.fromEntries(C.ks.map((x) => [x, C.base[x]])) : statsAtU(C, progU(k, lv));
  if (!isGK(k)) {
    const cb = C.base.cur || 0; o.cur = ref ? cb : Math.round(cb * (0.6 + 0.4 * lv / LV_MAX));   // EFECTO: crece hasta su identidad (Zorro, el máximo)
    o.atq = Math.round(avgA([o.vel, o.tir, o.pre, o.reg])); o.def = Math.round(avgA([o.ent, o.fis, o.ref]));
  }
  o.media = mediaDe(C.ks.map((x) => o[x])); const T = tierDe(o.media); o.rareza = T.k; o.tier = T.n;
  o.pos = isGK(k) ? 'POR' : C.base.pos; o.lema = C.base.lema; o.lv = ref ? '—' : lv;
  return o;
}
// coste en MONEDAS para pasar del nivel L al L+1 (curva suave: 20 -> ~550)
const lvCost = (L) => L >= LV_MAX ? Infinity : Math.round(20 * Math.pow(1.12, L) / 5) * 5;
// guardado: niveles + monedas. Clave nueva -> todos (también los jugadores de antes) empiezan en BRONCE (nivel 0)
const PROG_KEY = 'ml_cartas_v1', MON_BIENVENIDA = 100;
function progLoad() {
  let p = null; try { p = JSON.parse(localStorage.getItem(PROG_KEY) || 'null'); } catch (e) {}
  if (!p || typeof p !== 'object' || p.v !== 1) p = { v: 1, lv: {}, mon: MON_BIENVENIDA, ganadas: 0 };
  const lv = {}; for (const c of ALL_CHARS) lv[c.key] = THREE.MathUtils.clamp(Math.round(+(p.lv || {})[c.key] || 0), 0, LV_MAX);
  p.lv = lv; p.mon = Math.max(0, Math.round(+p.mon || 0)); p.ganadas = Math.max(0, Math.round(+p.ganadas || 0));
  return p;
}
let PROG = progLoad();
function progSave() { try { localStorage.setItem(PROG_KEY, JSON.stringify(PROG)); } catch (e) {} }
// update 47 (t102u «pon 20000 monedas gratis en las cuentas ya seguido»): regalo ÚNICO al cargar la v47 (no se repite al recargar)
const REGALO_KEY = 'ml_regalo_u47', REGALO_MON = 20000;
function regaloU47() {
  try { if (localStorage.getItem(REGALO_KEY)) return 0; localStorage.setItem(REGALO_KEY, String(Date.now())); } catch (e) { return 0; }   // sin localStorage no se regala (se repetiría)
  PROG.mon += REGALO_MON; progSave(); return REGALO_MON;
}
const REGALO_HOY = regaloU47();
function regaloBanner() {
  if (!REGALO_HOY || regaloBanner.hecho) return;
  if (S.mode !== 'menu') { setTimeout(regaloBanner, 1000); return; }   // si ya ha entrado a jugar, el banner espera a volver al menú (no tapa el marcador)
  regaloBanner.hecho = true;
  const b = document.createElement('div'); b.id = 'regaloBanner'; b.setAttribute('role', 'status');
  b.innerHTML = `${MONEDA_SVG}<div><b>+20.000 MONEDAS</b><small>DE REGALO</small></div>`;
  b.addEventListener('pointerdown', () => b.classList.remove('ver'));
  document.body.appendChild(b); void b.offsetWidth; b.classList.add('ver');
  setTimeout(() => b.classList.remove('ver'), 3400); setTimeout(() => b.remove(), 4000);
  const n = document.getElementById('lbMonedas'); if (n) { n.classList.remove('late'); void n.offsetWidth; n.classList.add('late'); }
}
// solo pruebas de regresión antiguas (?lvref=1): todos juegan con su carta de identidad ('ref' = STATS), como antes de la update 37
const LV_REF_MODE = /[?&]lvref=1/.test(location.search);
const progLv = (k) => LV_REF_MODE ? 'ref' : (PROG.lv[k] || 0);
function progMejorar(k) {
  const L = PROG.lv[k] || 0, c = lvCost(L);
  if (L >= LV_MAX || PROG.mon < c) return null;
  const antes = statsAt(k, L);
  PROG.mon -= c; PROG.lv[k] = L + 1; progSave();
  const desp = statsAt(k, L + 1);
  LOG('mejora', null, { k, lv: L + 1, coste: c, media: desp.media, tier: desp.tier });
  return { k, lv: L + 1, coste: c, antes, desp, subeTier: antes.rareza !== desp.rareza };
}
// MONEDAS por partido: victoria 40, empate 25, derrota 15, +5 por gol (hasta 5); título de liga 250, de torneo 300
const MON_PARTIDO = { v: 40, e: 25, d: 15, gol: 5, golMax: 5 }, MON_TITULO = { liga: 250, torneo: 300 };
function monedasPartido(gu, gr) {
  const m = (gu > gr ? MON_PARTIDO.v : gu === gr ? MON_PARTIDO.e : MON_PARTIDO.d) + MON_PARTIDO.gol * Math.min(MON_PARTIDO.golMax, Math.max(0, gu | 0));
  PROG.mon += m; PROG.ganadas += m; progSave(); LOG('monedas', null, { m, total: PROG.mon }); return m;
}
function monedasTitulo(tipo) { const m = MON_TITULO[tipo] || 0; if (m) { PROG.mon += m; PROG.ganadas += m; progSave(); } return m; }
// nivel de los rivales de la IA: parecido al tuyo según el modo (sin trampas: como mucho +2)
//  amistoso / 2 VS 2 / liga: tu nivel −1..+1 (fijo por rival) · torneo: cuartos −1, semis 0, final +1 · práctica: el tuyo
function rivalLv(base, rk) {
  if (LV_REF_MODE) return 'ref';
  const h = [...rk].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 3 - 1;
  let off = h;
  if (S.practice) off = 0;
  else if (S.comp && S.comp.type === 'torneo') off = S.comp.lvOff !== undefined ? S.comp.lvOff : (S.comp.ronda | 0) - 1;   // update 43
  return THREE.MathUtils.clamp(Math.round(base) + off, 0, Math.min(LV_MAX, Math.round(base) + 2));
}
// update 37: las stats en partido salen del NIVEL actual de la carta (a.lv; sin nivel -> identidad 'ref')
function actorStats(a) {
  const k = STATS[a.charKey] ? a.charKey : 'conazo', lv = a.lv ?? 'ref';
  if (isGK(k) && a.keeper) {   // portero de verdad: stats de portero -> IA del portero
    const g = statsAt(k, lv), t = Object.assign({}, STATS[k], { tir: g.saq, pre: g.saq, ref: g.ref, gk: g, media: g.media, rareza: g.rareza });
    return { t, vel: 1, tir: statF(g.saq, 0.12), reg: 1, ent: 1, fis: statF(90), ref: statF(g.ref), jitterDeg: (100 - g.saq) * 0.09, cur: 0, lejos: statF(g.saq, 0.10),
      est: statF(g.est), pos: statF(g.col, 0.2), sal: statF(g.sal, 0.08), saq: statF(g.saq, 0.2) };
  }
  const t = isGK(k) ? STATS[k] : Object.assign({}, STATS[k], statsAt(k, lv));
  return { t, vel: statF(t.vel), tir: statF(t.tir, 0.12), reg: statF(t.reg), ent: statF(t.ent), fis: statF(t.fis), ref: statF(t.ref), jitterDeg: (100 - t.pre) * 0.09, cur: (t.cur || 0) / 100, lejos: statF(t.tir, 0.10),
    est: statF(t.ref), pos: 1, sal: 1, saq: 1 };
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
camera.position.copy(g2tS(0, -58.101, 46.329));
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
// update 31 (rendimiento): lodErr = error máximo de la simplificación (relativo al tamaño del modelo; 0.002-0.003 = 3-5 mm, < 1 px en pantalla).
// olLod = malla del contorno (solo silueta), shLod = malla que proyecta la sombra (capa SHADOW_LAYER; el mapa de sombras es mucho más basto).
// Las TEXTURAS no cambian en ninguna calidad. Resolución máx.: Media 1.25x, Alta 1.75x, Ultra 2x; sombra Alta 1024 / Ultra 2048.
const QUALITY = {
  baja:  { label: 'Baja',  pr: () => Math.min(DPR(), 1),   prFloor: 0.75, shadow: 0,    soft: false, aniso: 1,  lod: 0.2,  lodErr: 0.012 },
  media: { label: 'Media', pr: () => Math.min(DPR(), 1.25), prFloor: 1,   shadow: 0,    soft: false, aniso: 4,  lod: 0.35, lodErr: 0.006, olLod: 0.22 },
  alta:  { label: 'Alta',  pr: () => Math.min(DPR(), 1.75), prFloor: 1,   shadow: 0,    soft: false, aniso: 16, lod: 0.55, lodErr: 0.003, olLod: 0.3, noCharShadow: true },   // update 35: Alta SIN sombra de personajes (ni proyectada ni mancha)
  ultra: { label: 'Ultra', pr: () => Math.min(DPR(), 2),   prFloor: 1,    shadow: 2048, soft: true,  aniso: 16, lod: 0.7,  lodErr: 0.002, olLod: 0.4, shLod: 0.16, shadowEvery: 1 },
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
  // update 30: cabezazos y porteros mejorados activados; salto automático y cambio de jugador apagados
  a.cabezazos = a.cabezazos !== false; a.porteros = a.porteros !== false; a.saltoAuto = !!a.saltoAuto; a.cambio = !!a.cambio;
  a.cabCirculo = a.cabCirculo !== false;
  a.trampaApunta = a.trampaApunta !== false;
  a.discos2v2 = a.discos2v2 !== false;
  // update 38: TURBO ya no regatea (fuera el modo TURBO+REGATE y el botón REGATE de deslizar). Los regates, solo con REGATES (patrón),
  // que pasa a estar siempre puesto. Migración de lo guardado (una vez): el que tenía REGATE colocado a mano y REGATES sin colocar
  // -> REGATES pasa al sitio de su REGATE (no queda hueco); se borran el ajuste turboRegate, la opción de ocultar REGATES y la
  // posición del botón REGATE.
  if ((a.ver38 || 0) < 1) {
    if (a.ctrl && typeof a.ctrl === 'object' && a.ctrl.regate) {
      const rg = a.ctrl.regate, pt = a.ctrl.patron;
      if (a.turboRegate === false && rg.x != null && (!pt || pt.x == null)) a.ctrl.patron = { x: rg.x, y: rg.y, s: (pt && pt.s) || rg.s || 1 };
      delete a.ctrl.regate;
    }
    a.migr38 = { turboRegate: a.turboRegate !== false, patron: a.patron !== false }; a.ver38 = 1;
  }
  delete a.turboRegate; delete a.patron; delete a.vistoTR32;
  a.tiroPase = a.tiroPase !== false;
  a.campo = ['estadio', 'volcan', 'hielo', 'setas', 'aleatorio'].includes(a.campo) ? a.campo : 'estadio';   // update 39: campo elegido
  a.largoStat = a.largoStat !== false; delete a.altoCaida; a.ocultaCaida = a.ocultaCaida === true;   // update 33: indicador del chut alto como en v31 (completo + diana) por defecto; el corto de v32 es opcional; el ajuste antiguo de v32 se descarta   // update 32: chut alto según TIR (SÍ)   // update 32: TIRO/PASE   // update 32: TURBO + REGATE en un botón   // update 31: 2 VS 2 con círculos sólidos azul (tu equipo) / rojo (rivales)   // update 31: BALÓN TRAMPA apuntado (NO = como antes: chut automático + señuelo)   // update 31: cabezazo solo dentro del círculo de caída
  a.musica = a.musica !== false;   // update 48: música del menú (SÍ por defecto)
  a.fusionTR = a.fusionTR === true;   // update 48: FUSIONAR REGATE Y TURBO (NO por defecto)
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
      const want = t.userData.skinHi ? skinAniso() : an;   // update 48: skins 2048 siempre con anisotrópico >= 8 (nítidas de lado)
      if (t.anisotropy !== want || t.minFilter !== THREE.LinearMipmapLinearFilter) {
        t.anisotropy = want; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
      }
      _texSeen.add(t);
    }
  });
}
const SHADOW_LAYER = 1;
const SHADOW_PROXY_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
function shadowFlags(root, cast, receive) {
  if (!root) return;
  const proxies = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.outline && !o.userData.shadowProxy && !(o.material && o.material.isMeshBasicMaterial && !(o.material.userData && o.material.userData.toon))) {
    o.castShadow = cast; o.receiveShadow = receive && !(o.material.userData && o.material.userData.toon);
    if (o.isSkinnedMesh && o.material && (o.material.userData?.toon || (Array.isArray(o.material) && o.material[0]?.userData?.toon))) { if (cast) proxies.push(o); o.layers.disable(SHADOW_LAYER); }
    else if (cast) o.layers.enable(SHADOW_LAYER); else o.layers.disable(SHADOW_LAYER);
  } });
  // update 31: personaje -> malla simplificada que solo existe para el mapa de sombras (capa SHADOW_LAYER; la cámara no la ve)
  for (const o of proxies) {
    if (o.userData.shadowMesh) continue;
    const sm = new THREE.SkinnedMesh(o.userData.srcGeom || o.geometry, SHADOW_PROXY_MAT);
    sm.bind(o.skeleton, o.bindMatrix); sm.bindMode = o.bindMode; sm.frustumCulled = false; sm.castShadow = true; sm.receiveShadow = false;
    sm.userData.shadowProxy = true; sm.userData.srcGeom = o.userData.srcGeom || o.geometry; sm.layers.set(SHADOW_LAYER);
    sm.position.copy(o.position); sm.quaternion.copy(o.quaternion); sm.scale.copy(o.scale);
    o.parent.add(sm); o.userData.shadowMesh = sm;
    const r = root.userData.actorRef; if (r) applyLOD(r);
  }
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
    c.layers.set(SHADOW_LAYER);   // update 31: solo proyectan sombra los objetos de la capa de sombras (personajes con malla ligera)
    renderer.shadowMap.needsUpdate = true;
  }
  if (changed) {
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) m.needsUpdate = true; });
  }
  // sombras "blob" bajo los personajes: más suaves si hay sombra real (siguen dando contacto con el suelo)
  let acts = []; try { acts = actors; } catch (_) {}
  for (const a of acts) { if (a.shadow) { a.shadow.material.opacity = on ? 0.16 : 0.3; a.shadow.visible = !q.noCharShadow; } applyLOD(a); }
  OUTLINE_MAT.visible = OUTLINE_MAT_EST.visible = AJ.quality !== 'baja';   // update 20: contorno caricatura apagado en Baja
  try { if (campoDeco) campoDeco.group.traverse((o) => { if (o.isPoints) o.visible = AJ.quality !== 'baja'; }); } catch (_) {}   // update 39: partículas del campo fuera en Baja
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
  const key = src.uuid + '|' + ratio + '|' + err;
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
    // update 31: contorno y sombra con su propio nivel (nunca más detalle que el cuerpo)
    const ratio = o.userData.shadowProxy ? (q.shLod || 0.15) : o.userData.outline ? Math.min(q.lod, q.olLod || q.lod) : q.lod;
    const err = o.userData.shadowProxy ? 0.03 : o.userData.outline ? Math.max(q.lodErr || 0.006, 0.005) : (q.lodErr || 0.006);
    const g = lodGeometry(src, ratio, err);
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
  camera.position.copy(g2tS(cfg.D, camFollowY, cfg.H));
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
    camera.position.copy(g2tS(0, camFollowY - cfg.D, cfg.H));
    camera.up.set(0, 1, 0);
    camera.lookAt(g2t(0, camFollowY + cfg.lookOff, 0));
  } else {
    camFollowY = 0;
    camera.position.copy(g2tS(0, -cfg.D, cfg.H));
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
// update 46: BRILLO opcional por máscara (skin SOMBRA del Gecko: ojos de color animado). Negro y apagado por defecto.
const GLOW_NEGRO = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); GLOW_NEGRO.needsUpdate = true;
function toonPatch(m) {
  m.toneMapped = false; m.userData.toon = true;
  const u = m.userData.toonU = { uToonShadow: { value: TOON.shadow }, uDye: { value: new THREE.Color(1, 1, 1) }, uDyeAmt: { value: 0 },
    uGlowMap: { value: GLOW_NEGRO }, uGlow: { value: new THREE.Color(0, 0, 0) }, uGlowAmt: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute vec3 oNormal;\nvarying vec3 vToonN;\nvoid main() {')
      .replace('#include <beginnormal_vertex>', SMOOTH_NORMAL_VS)
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n#ifdef USE_SKINNING\n\tvToonN = normalize( transformedNormal );\n#else\n\tvToonN = normalize( normalMatrix * oNormal );\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec3 vToonN;\nuniform float uToonShadow;\nuniform float uDyeAmt;\nuniform vec3 uDye;\nuniform sampler2D uGlowMap;\nuniform vec3 uGlow;\nuniform float uGlowAmt;\nvoid main() {')
      .replace('vec3 outgoingLight = reflectedLight.indirectDiffuse;', `vec3 outgoingLight = reflectedLight.indirectDiffuse;
	vec3 tn = normalize( vToonN );
	float nl = dot( tn, normalize( vec3( -0.45, 0.62, 0.64 ) ) );
	float fw = max( fwidth( nl ), 0.02 );
	float lit = smoothstep( 0.08 - fw, 0.08 + fw, nl );           // 2 tonos con borde nítido pero antialias
	float rim = smoothstep( 0.0, 0.35, tn.z );                    // los bordes que se curvan se oscurecen un poco (volumen)
	outgoingLight *= mix( uToonShadow, 1.0, lit ) * mix( 0.9, 1.0, rim );
	float lumT = dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) );
	outgoingLight = mix( outgoingLight, uDye * ( 0.3 + 1.1 * lumT ), uDyeAmt );
	#ifdef USE_MAP
	outgoingLight += uGlow * texture2D( uGlowMap, vMapUv ).r * uGlowAmt;
	#endif`);
  };
  m.customProgramCacheKey = () => 'mlToon46';
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
// update 44: contorno para mallas ESTÁTICAS (decorado exterior nuevo). En OUTLINE_MAT la rama sin skinning usa oNormal sin invertir y
// FLIP_SIDED la invertía -> el casco iba hacia dentro y no se veía. Aquí sale hacia fuera. (OUTLINE_MAT no se toca: personajes y vallas igual)
const OUTLINE_MAT_EST = new THREE.MeshBasicMaterial({ color: 0x101116, side: THREE.BackSide, toneMapped: false });
OUTLINE_MAT_EST.userData.outline = true;
OUTLINE_MAT_EST.onBeforeCompile = (sh) => {
  sh.uniforms.uOutline = TOON.outline;
  sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute vec3 oNormal;\nuniform vec4 uOutline;\nvoid main() {')
    .replace('#include <beginnormal_vertex>', SMOOTH_NORMAL_VS)
    .replace('#include <project_vertex>', `#include <project_vertex>
	vec3 onrm = normalize( normalMatrix * oNormal );
	vec2 cn = ( projectionMatrix * vec4( onrm, 0.0 ) ).xy; float cl = length( cn );
	float kd = clamp( uOutline.z / max( gl_Position.w, 0.01 ), uOutline.w, 1.0 );
	if ( cl > 1e-5 ) gl_Position.xy += cn / cl * uOutline.xy * kd * gl_Position.w;
	gl_Position.z += 0.0004 * gl_Position.w;`);
};
OUTLINE_MAT_EST.customProgramCacheKey = () => 'mlOutlineEst44';
// grosor del contorno en píxeles del destino (pantalla o render target de los retratos)
function setOutlinePx(w, h, px = TOON.px) { TOON.outline.value.set((2 * px) / Math.max(1, w), (2 * px) / Math.max(1, h), TOON.near, TOON.minK); }
const _dbs = new THREE.Vector2();
function syncOutline() { renderer.getDrawingBufferSize(_dbs); setOutlinePx(_dbs.x, _dbs.y, TOON.px * Math.max(1, renderer.getPixelRatio() * 0.85)); }
function applyToon(model, key) {
  const c = ALL_CHARS.find((x) => x.key === key); if (!c || !c.toon) return model;
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
const load = (u, onP) => new Promise((res, rej) => loader.load(u, res, onP, rej));   // update 40: onP = progreso (pantalla de carga)
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
  header: () => { beep(240, 0.09, 'triangle', 0.2, -110); beep(520, 0.05, 'sine', 0.05, 0); },   // update 30
};
// update 45: toque de interfaz (solo si el audio ya está activo: no crea el contexto)
function uiTap() { if (actx) beep(700, 0.05, 'triangle', 0.035, 220); }
document.addEventListener('pointerdown', (e) => { const b = e.target.closest && e.target.closest('#menu .lbBtn, #menu .lbModo, #menu .lbPerfil, #menu .lbCopas, #menu .lbCampo, #menu .lbMonedas, #menu .mEngranaje, #menu .mFlecha, #menu .lbModoCard');
  if (b) { uiTap(); b.classList.remove('lbPop'); void b.offsetWidth; b.classList.add('lbPop'); } }, { passive: true });

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
    this.charScale = (ALL_CHARS.find((c) => c.key === charKey) || {}).scale || 1;   // multiplicador por personaje (todos 1: alturas igualadas en el modelado)
    model.scale.setScalar(ESCALA * this.charScale);
    this.model = model; model.userData.actorRef = this;
    applyLOD(this);   // menos triángulos en partida según calidad (el menú usa el modelo completo)
    this.body.add(model);
    this.root.add(this.body);
    shadowFlags(model, true, false);
    this.shadow = blob(0.75 * ESCALA, renderer.shadowMap.enabled ? 0.16 : 0.3); this.shadow.position.y = 0.02; this.shadow.visible = !QUALITY[AJ.quality].noCharShadow; this.root.add(this.shadow);
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
    this.jumping = false; this.jumpZ = 0; this.jumpVz = 0; this.jumpQ = null; this.kJumpZ = 0; this.kJumpVz = 0; this.gkJumpT = 0; this.gkJumpQ = null;   // update 30
  }
  dispose() { this.mixer.stopAllAction(); scene.remove(this.root); }
  place(x, y) {
    this.pos.set(x, y); this.vel.set(0, 0); this.face.set(0, this.team === 0 ? 1 : -1);
    this.yaw = Math.atan2(this.face.x, -this.face.y);
    this.dashT = 0; this.stun = 0; this.kickT = 0; this.dribbleT = 0; this.dashCd = 0; this.dribbleCd = 0; this.pm = null; this.pmQ = null; this.patCd = 0;   // update 35
    this.dashHit = false; this.dashEnded = false; this.sprinting = false;
    this.kickPending = null; this.kickAnimT = 0; this.tackleT = 0; this.diveT = 0; this.celebrate = false;
    espReset(this); if (typeof espGhostVis === 'function') espGhostVis(this, false);
    this.jumping = false; this.jumpZ = 0; this.jumpVz = 0; this.jumpQ = null; this.headAssist = null; this.headPlan = null;   // update 30
    this.kJumpZ = 0; this.kJumpVz = 0; this.gkJumpT = 0; this.gkJumpQ = null; this.diveHigh = false; this.diveLiftMax = 0; this.claim = null;
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
    else if (this.jumping && !this.keeper && this.actions.Header) { want = 'Header'; ts = this.headTs || 1; }   // update 30: cabezazo
    else if (this.keeper && this.gkJumpT > 0 && this.diveT <= 0 && this.actions.GK_Jump) { want = 'GK_Jump'; ts = this.gkJumpTs || 1; }
    else if (this.keeper && this.diveT > 0) { want = this.diveClip; ts = DIVE_RATE; }
    else if (this.tackleT > 0) { want = 'Tackle'; ts = TACKLE_RATE; }
    else if (this.kickAnimT > 0) { want = 'Kick'; ts = KICK_RATE; }
    else if (this.stun > 0) want = this.keeper ? 'GK_Idle' : 'Idle';
    else if (this.pm) { [want, ts] = patAnim(this); if (this.pm.k !== this._pmK || this.pm.t < this._pmT) { this._pmK = this.pm.k; if (want === 'Kick') this.play('Kick', 0.06, true); } this._pmT = this.pm.t; }   // update 35
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
    const fade = want === 'Kick' || want === 'Tackle' || want === 'Header' || want === 'GK_Jump' || (want && want.startsWith('GK_Dive')) ? 0.06 : 0.16;
    this.play(want, fade);
    const a = this.actions[want];
    if (a) a.setEffectiveTimeScale(ts < 0 ? Math.max(ts, -3) : THREE.MathUtils.clamp(ts, 0.3, 3.2));   // update 35: negativo = hacia atrás (arrastre)
  }
  sync(dt, t) {
    const targetYaw = Math.atan2(this.face.x, -this.face.y);   // los modelos miran a +Z de three (hacia la cámara) por defecto
    let d = targetYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * (this === user ? 26 : 14));
    this.root.position.copy(g2tS(this.pos.x, this.pos.y));
    this.root.rotation.y = this.yaw;
    this.kickAnimT = Math.max(0, this.kickAnimT - dt);
    this.tackleT = Math.max(0, this.tackleT - dt);
    if (this.introT > 0) this.introT = this.vel.lengthSq() > 0.12 ? 0 : Math.max(0, this.introT - dt);
    this.chooseAnim();
    this.mixer.update(dt);
    // aturdido: tambaleo (encima de la animación)
    const stunWob = this.stun > 0 && this.tackleT <= 0 ? Math.sin(t * 40) * 0.12 : 0;
    if (this.pm) { const [tw, ln] = patBody(this); this.body.rotation.set(0, tw, stunWob + ln); }   // update 35: cadera / inclinación del truco
    else this.body.rotation.set(0, 0, stunWob);
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
let user, rival, gkA, gkB, mateA = null, mateB = null, actors = [];   // update 30: compañeros en 2 VS 2
const S = { paused: false, mode: 'menu', score: [0, 0], time: DURACION, pauseT: 0, kickoffTeam: 0, t: 0, goals: 0, saves: 0, shots: 0 };
const LOGS = []; const NAME = (a) => a === user ? 'usuario' : a === rival ? 'rival' : a === mateA ? 'companero' : a === mateB ? 'rival2' : a === gkA ? 'portero_azul' : 'portero_rojo';
function LOG(ev, a, extra) { LOGS.push({ t: +S.t.toFixed(2), ev, who: a ? NAME(a) : null, ...extra }); if (LOGS.length > 300) LOGS.shift(); if (MS) MS_log(ev, a, extra || {}); }
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
  for (const el of [btnChutar, btnRegate, btnAlto, btnEntrada, btnTurbo, btnEspecial, document.getElementById('btnPatron')]) if (el) RC.btn.set(el, el.getBoundingClientRect());
}
const appRect = () => RC.app || (RC.app = app.getBoundingClientRect());
const zonaRect = () => RC.zona || (RC.zona = joyZona.getBoundingClientRect());
const btnRect = (el) => { let r = RC.btn.get(el); if (!r || !r.width) { r = el.getBoundingClientRect(); if (r.width) RC.btn.set(el, r); } return r; };   // u32: un botón oculto al medir (p. ej. REGATE con TURBO+REGATE) se vuelve a medir
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
const SCROLL_SEL = '#lbNovCuerpo, .ajCaja, .tiCaja, #tiendaScroll, #tiendaTabs, .tiDetInfo, .coLado, .coCuadro, .coLiga, #coCuerpo, .scrollPanel';   // update 46: tienda nueva (tira horizontal + pestañas)
function inScroller(t) {
  const el = t && t.closest ? t.closest(SCROLL_SEL) : null;
  for (let e = el; e && e !== document.body; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) return true; }
  // update 42: CUALQUIER lista con scroll vertical de verdad (alineación, cartas, campos, mejoras, paneles del lobby...): antes solo las de
  // SCROLL_SEL -> en la ALINEACIÓN el dedo no bajaba. Fuera del partido (el HUD de juego no tiene listas con scroll).
  for (let e = t && t.nodeType === 1 ? t : t && t.parentElement; e && e !== document.body; e = e.parentElement)
    if (e.scrollHeight > e.clientHeight + 1) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY)) return true; }
  // update 46 (t98u): también listas con scroll HORIZONTAL (tira de la tienda, pestañas de ronda...): antes el dedo no movía la tienda
  for (let e = t && t.nodeType === 1 ? t : t && t.parentElement; e && e !== document.body; e = e.parentElement)
    if (e.scrollWidth > e.clientWidth + 1) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowX)) return true; }
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
      const d0 = aimDeadPx() / aim.R, sv = altoSensU(), f = (c) => ((d0 + Math.min(1, c * sv) * (1 - d0)) * 100).toFixed(1) + '%';   // update 46: zonas comprimidas con poca TIR
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
  if (aim.kind === 'alto') aim.power = Math.min(1, aim.power / altoSensU());   // update 46: con poca TIR la trompa se estira MÁS RÁPIDO (cuesta apuntar)
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
  shoot(user, dir, 0.72, true, undefined, undefined, tpOn()); LOG('tiro_rapido', user, { tp: tpOn() });
  return true;
}
function aimedShot(dir, p) {
  if (S.mode !== 'play' || ball.owner !== user) return false;
  shoot(user, dir.clone(), 0.35 + 0.65 * p, false, undefined, undefined, tpOn()); LOG('tiro_apuntado', user, { p: +p.toFixed(2), tp: tpOn() });
  return true;
}
function lobDir() {   // CHUT ALTO sin arrastrar: dirección del joystick de mover o portería rival
  const md = moveDir();
  return md || goalCenter(user.team).sub(user.pos).normalize();
}
// update 35: CHUT ALTO DE ESPALDAS. Si el cuerpo (yaw real del modelo) está a más de 135° de la dirección del chut alto/largo,
// la acción no sale: el botón tiembla en rojo un momento y el aro del mini-joystick se pone rojo mientras apuntas así.
const LOB_BACK_DEG = 135, LOB_BACK_COS = Math.cos(THREE.MathUtils.degToRad(LOB_BACK_DEG));
function lobDeEspaldas(a, dir) {
  if (!a || !dir) return false; const L = Math.hypot(dir.x, dir.y); if (L < 1e-6) return false;
  return (Math.sin(a.yaw) * dir.x - Math.cos(a.yaw) * dir.y) / L < LOB_BACK_COS;
}
function lobBloqueado(a, dir) {
  if (!lobDeEspaldas(a, dir)) return false;
  LOG('chut_alto_bloqueado', a, { ang: Math.round(THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp((Math.sin(a.yaw) * dir.x - Math.cos(a.yaw) * dir.y) / Math.hypot(dir.x, dir.y), -1, 1)))) });
  if (a === user && btnAlto) { btnAlto.classList.remove('deEspaldas'); void btnAlto.offsetWidth; btnAlto.classList.add('deEspaldas'); clearTimeout(lobBloqueado._t); lobBloqueado._t = setTimeout(() => btnAlto.classList.remove('deEspaldas'), 520); }
  try { navigator.vibrate && navigator.vibrate(18); } catch (_) {}
  return true;
}
function quickLob(c = 0) {   // toque = vaselina suave mínima (update 14: ya no hay 'globo medio' por toque rápido)
  if (S.mode !== 'play' || ball.owner !== user || user.kickPending) return false;
  const d = lobDir(); if (lobBloqueado(user, d)) return true;   // update 35: de espaldas -> no sale (se consume la pulsación)
  shootLob(user, d, c); return true;
}
function aimedLob(dir, p) {
  if (S.mode !== 'play' || ball.owner !== user) return false;
  if (lobBloqueado(user, dir)) return true;   // update 35
  shootLob(user, dir.clone(), p); return true;
}
// ---- Acciones del jugador (update 13) ----
// Por defecto (como v10/v11): CHUTAR / REGATE / CHUT ALTO con mini-joystick estilo Brawl. Toque corto = acción rápida al SOLTAR
// (sin umbral de tiempo) hacia el joystick de mover; al salir de la zona muerta (~11 px) aparece al instante el joystick de
// apuntar con la flecha; volver al centro cancela. Mantener quieto también lo abre. CHUT ALTO (update 14): la carga sube desde
// el toque (~1,1 s al 100 %, zona perfecta 45-60 %) y el mini-joystick solo da la dirección; un toque = vaselina suave. Opción 'Disparo instantáneo al tocar': Chutar/Regate en el pointerdown, sin apuntar. Si la acción no es posible aún (sin balón, enfriamiento),
// se guarda 150 ms en un buffer y se ejecuta en cuanto se pueda.
const INPUT_BUFFER_MS = 150;
function altoCharge(t0) { return THREE.MathUtils.clamp((performance.now() - t0 - 60) / 1000 / (ALTO_CHARGE_S * altoSensU()), 0, 1); }   // 60 ms de margen: un toque = vaselina mínima
function doAction(kind, b) {
  if (S.mode !== 'play' || !user || S.paused) return false;
  if (kind === 'swipe') return swipeShoot(b.m);
  if (kind === 'chutar') return quickShot();
  if (kind === 'regate') return ball.owner === user && !user.kickPending ? tryDribble(user) : false;
  if (kind === 'alto') return quickLob();
  if (kind === 'entrada') return tryDash(user);
  return false;
}
// update 44 (t95u): durante el SOMBRERITO (balón en el aire, aún sin control) los botones de ataque siguen a la vista y se pueden
// pulsar: la acción queda en espera durante todo el vuelo y sale en cuanto controlas el balón.
const hatVivo = () => !!(user && user.pm && user.pm.type === 'hat' && !ball.owner && S.mode === 'play');
function bufferAction(kind) { input.buf = { kind, until: performance.now() + (hatVivo() ? 2600 : INPUT_BUFFER_MS), hat: hatVivo() }; if (input.buf.hat) LOG('accion_en_espera_sombrerito', user, { kind }); }
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
  if (e && !cancelAll && !aim.cancel && !(aim.combo && quick)) markAction(kind, e);
  if (!cancelAll && !aim.cancel) {
    if (kind === 'chutar') { if (quick) quickShot(); else aimedShot(aim.dir, aim.power); }
    else if (kind === 'alto') aimedLob(quick ? lobDir() : aim.dir, quick ? 0 : aim.power);   // update 16: carga = distancia del mini-joystick al centro; toque = vaselina mínima
    else if (kind === 'entrada') { if (quick) { if (!tryDash(user)) bufferAction('entrada'); } else if (tryDash(user, aim.dir)) LOG('entrada_dir', user, { dir: [+aim.dir.x.toFixed(2), +aim.dir.y.toFixed(2)] }); }   // update 37
    else { if (quick) tryDribble(user); else tryDribble(user, aim.dir); }
  } else if (aim.cancel) LOG('apuntado_cancelado', user, { kind });
  el.classList.remove('pulsado', 'apuntando');
  aim.id = null; aim.kind = null; aim.el = null; aim.active = false; aim.cancel = false; aim.dragged = false; aim.onGoal = false; aim.combo = false;
  showAimJoy(false);
}
function bindAim(el, kind) {
  const instIds = new Set();
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.pointerId === joyId) return;
    if (kind === 'chutar' && acciones.classList.contains('aereo') && ball.owner !== user) { markAction('cabeza', e); el.classList.add('pulsado'); instIds.add(e.pointerId); userHeader('tiro'); return; }   // update 30: CABEZA
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
    if (kind === 'entrada') {   // update 37: ENTRADA con mini-joystick (sin balón). Con balón o fuera de juego: como antes (buffer)
      if (S.mode !== 'play' || !user || S.paused || ball.owner === user) { markAction('entrada', e); el.classList.add('pulsado'); instIds.add(e.pointerId); if (!doAction('entrada')) bufferAction('entrada'); return; }
    } else if (S.mode !== 'play' || !user || ball.owner !== user || user.kickPending) { bufferAction(kind); return; }   // aún sin balón: toque rápido en buffer
    const r = btnRect(el);
    Object.assign(aim, { id: e.pointerId, kind, el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, t0: performance.now(), dragged: false, shown: false, dx: 0, dy: 0, R: aimRadius(el), power: 0, cancel: false, active: true, rawAng: undefined, onGoal: false });
    const md = moveDir(); aim.dir.copy(md || (kind === 'entrada' ? user.face : kind !== 'regate' ? goalCenter(user.team).sub(user.pos).normalize() : user.face));
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
// update 38: el botón REGATE (mini-joystick de deslizar) ya no existe en el juego: se queda oculto y sin acción
bindAim(btnAlto, 'alto');
bindAim(btnEntrada, 'entrada');   // update 37: ENTRADA direccionable (arrastrar = dirección con flecha en el campo; toque = entrada automática de antes; al centro = cancelar)
bindHold(btnEspecial, (e) => { markAction('especial', e); btnEspecial.classList.add('pulsado'); if (S.mode === 'play' && !S.paused) { espUse(user); if (trampa && trampa.held) trampa.pid = e && e.pointerId; } }, () => btnEspecial.classList.remove('pulsado'));   // update 29 (+31 balón trampa apuntado)
// update 38: TURBO es un botón simple: mantener = esprintar. Deslizar no hace nada (fuera el regate por deslizamiento de la update 32).
function comboOn() { return false; }   // compat: el modo TURBO+REGATE ya no existe
bindHold(btnTurbo, (e) => {
  markAction('turbo', e); input.turboDown = true; btnTurbo.classList.add('pulsado'); turboKick();
}, () => { input.turboDown = false; btnTurbo.classList.remove('pulsado'); });
const TR = { pend: null, n: 0 };   // compat (tests antiguos): el regate por deslizamiento ya no suma

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
  if (m.kind !== 'raso' && lobBloqueado(user, dir)) return true;   // update 35: chut alto por deslizamiento de espaldas
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
  // update 35 (rendimiento): sin rastro no se toca el DOM. Antes leía app.clientWidth/clientHeight en CADA frame, lo que obliga al
  // navegador a recalcular estilos y layout a mitad de frame (cada vez que cambia un aro de carga / clase de botón al conducir).
  if (!trail.pts.length && !trail.drawn) return;
  const now = performance.now();
  if (!drawTrail.sz || drawTrail.vp !== lastVP) { drawTrail.sz = [app.clientWidth, app.clientHeight]; drawTrail.vp = lastVP; }
  const W = drawTrail.sz[0], H = drawTrail.sz[1], dpr = Math.min(2, window.devicePixelRatio || 1);
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
  if (e.code === 'Escape' && !e.repeat) { if (S.paused) resumeGame(); else if (!matchMedia('(pointer: coarse)').matches) openPause(); }   // update 42: Esc solo con teclado de escritorio (deliberado); en móvil nunca
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
  if (ball.owner !== user) { if (ball.owner === null && S.uAir) userHeader('tiro'); return; }   // update 30: ESPACIO en balón aéreo = cabezazo
  btnChutar.classList.add('pulsado');
  input.shootDown = true; input.charge = 0;
}
function releaseShoot(cancel) {
  btnChutar.classList.remove('pulsado');
  if (!input.shootDown) return;
  input.shootDown = false;
  if (!cancel && ball.owner === user && S.mode === 'play') shoot(user, user.face.clone(), 0.15 + 0.85 * input.charge, true, undefined, undefined, tpOn());
  input.charge = 0;
}

// ===================== MECÁNICAS =====================
function tryDash(a, forceDir) {
  if (!a || a.toadT > 0 || a.mareoT > 0 || a.dashCd > 0 || a.stun > 0 || a.dribbleT > 0 || a.dashT > 0 || a.freezeT > 0 || a.slipT > 0 || a.chargeT > 0) return false;
  if (ball.owner === a) return false;
  if (forceDir && forceDir.lengthSq() > 0.01) { a.face.copy(forceDir).normalize(); a.yaw = Math.atan2(a.face.x, -a.face.y); }   // update 37: entrada apuntada
  else if (a === user) { const md = moveDir(); if (md) a.face.copy(md); }
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
  if (a.dribbleCd > 0 || a.stun > 0 || a.dribbleT > 0 || a.dashT > 0 || a.freezeT > 0 || a.slipT > 0 || a.chargeT > 0 || a.pm) return false;
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
// ===================== update 35: REGATES POR PATRÓN (botón REGATES + cuadrícula 3×3) =====================
// Se dibuja desde el punto central (el que queda bajo el dedo) uniendo puntos, como el desbloqueo por patrón; al SOLTAR se lee el
// trazo y se ejecuta. Fichas: → rodar a la derecha (suela), ← rodar a la izquierda, ↓ rodar hacia atrás (arrastre + giro),
// ↑→ bicicleta y salida en diagonal a la derecha avanzando, ↑← igual a la izquierda. Se pueden encadenar hasta 3 (p. ej. → ← = croqueta
// ida y vuelta). Direcciones relativas a hacia dónde mira el jugador. Mientras dura el truco las entradas no le quitan el balón
// (salvo al principio del amago de la bicicleta: si el rival entra pronto y no pica, se la lleva).
const PAT = { roll: { dur: 0.40, lat: 1.75 }, back: { dur: 0.54 }, bici: { dur: 0.68, split: 0.44, ang: 0.72 }, cd: 1.1, max: 3, th: 26, buf: 0.7 };   // update 36: cd 1,5 -> 1,1; umbral de trazo 26 px; búfer 0,7 s
const PAT_NAMES = { R: 'RUEDA ►', L: '◄ RUEDA', B: 'ARRASTRE ▼', SR: 'BICICLETA ►', SL: '◄ BICICLETA', H: 'SOMBRERITO ▲', HB: '▼ SOMBRERITO ATRÁS' };
// update 43 (t93u): SOMBRERITOS. ↓ y luego ↑ = SOMBRERITO: levanta el balón por encima del defensor hacia delante y corre a por él.
// ↑ y luego ↓ = SOMBRERITO HACIA ATRÁS: taconazo en vaselina por encima de la cabeza hacia atrás, media vuelta y a por él.
// Mientras el balón va alto, ningún rival lo puede tocar (ni de cabeza): solo cuando baja a la altura del pie. El sombrerito cierra la cadena.
const HAT = { H: { lift: 0.16, apex: 3.7, dist: 6.0, run: 1.12 }, HB: { lift: 0.2, apex: 3.4, dist: 5.4, run: 1.3 }, safe: 0.6, max: 2.2 };   // update 44: cumbre mucho más alta (antes 2,6 / 2,4 m)
function patParse(dots) {   // dots: índices 0-8 (fila*3+col, fila 0 = arriba) -> fichas (se mantiene para compatibilidad)
  const dirs = [];
  for (let i = 1; i < dots.length; i++) {
    const r0 = Math.floor(dots[i - 1] / 3), c0 = dots[i - 1] % 3, r1 = Math.floor(dots[i] / 3), c1 = dots[i] % 3;
    const dy = Math.sign(r0 - r1), dx = Math.sign(c1 - c0);   // dy > 0 = arriba
    dirs.push((dy > 0 ? 'U' : dy < 0 ? 'D' : '') + (dx > 0 ? 'R' : dx < 0 ? 'L' : ''));
  }
  return patParseDirs(dirs);
}
// update 36: lectura por DIRECCIONES (8 sectores) en vez de tocar puntos. Un trazo diagonal ↗/↖ = bicicleta; ↑ y luego →/← también;
// las curvas (↑ ↗ →) cuentan como una sola bicicleta. ↓ (y ↘/↙) = arrastre. ↑ suelto no vale.
function patParseDirs(dirs0) {
  const d = dirs0.filter((x, i) => x && (i === 0 || x !== dirs0[i - 1])), out = [];
  for (let i = 0; i < d.length; i++) {
    const x = d[i], n = d[i + 1];
    if (x === 'U' && (n === 'D' || n === 'DL' || n === 'DR')) { out.push('HB'); break; }   // update 43: ↑↓ = sombrerito hacia atrás
    if (x[0] === 'D' && n === 'U') { out.push('H'); break; }                                 // update 43: ↓↑ = sombrerito
    if (x === 'U') {
      if (n === 'R' || n === 'UR' || n === 'L' || n === 'UL') { out.push(n.endsWith('R') ? 'SR' : 'SL'); i++; if (n.length === 2 && d[i + 1] === n.slice(1)) i++; }
      // 'U' suelto no es ningún truco
    } else if (x === 'UR' || x === 'UL') {
      out.push(x === 'UR' ? 'SR' : 'SL');
      if (n === x.slice(1) || n === 'U') { i++; if (n === 'U' && d[i + 1] === x.slice(1)) i++; }
    } else if (x === 'R' || x === 'L') out.push(x);
    else if (x[0] === 'D') { if (out[out.length - 1] !== 'B') out.push('B'); }
  }
  return out.slice(0, PAT.max);
}
function patDir(dx, dy) {   // dx, dy en px de pantalla (dy > 0 = abajo) -> 'U','UR','R',... (diagonal solo si está a ±20° de 45°)
  const a = Math.atan2(-dy, dx) * 180 / Math.PI;   // 0 = derecha, 90 = arriba
  const k = ((a % 360) + 360) % 360;
  const D = [[0, 'R'], [45, 'UR'], [90, 'U'], [135, 'UL'], [180, 'L'], [225, 'DL'], [270, 'D'], [315, 'DR'], [360, 'R']];
  let best = 'R', bd = 1e9;
  for (const [c, n] of D) { const dd = Math.abs(k - c) * (n.length === 2 ? 1.125 : 1); if (dd < bd) { bd = dd; best = n; } }   // diagonales algo más estrechas (±20°)
  return best;
}
function patCan(a) { return !!a && ball.owner === a && !a.keeper && !a.pm && !(a.patCd > 0) && a.stun <= 0 && a.dribbleT <= 0 && a.dashT <= 0 && a.freezeT <= 0 && a.slipT <= 0 && a.chargeT <= 0 && !a.kickPending && !a.jumping; }
function tryPattern(a, moves) {
  if (!moves || !moves.length || !patCan(a)) return false;
  a.pmQ = moves.slice(1); patStart(a, moves[0]);
  if (a === user) { input.shootDown = false; input.charge = 0; btnChutar.classList.remove('pulsado'); }
  LOG('patron', a, { m: moves.join('+') }); return true;
}
function patStart(a, k) {
  const f = a.face.clone().normalize(), r = new THREE.Vector2(f.y, -f.x);   // derecha del jugador (como ballOffset)
  const reg = a.sf.reg, q = 1 / THREE.MathUtils.clamp(0.75 + 0.25 * reg, 0.85, 1.15);   // más REGATE = algo más rápido
  const pm = { k, t: 0, f, r, side: 0, bit: false, reg };
  if (k === 'R' || k === 'L') Object.assign(pm, { type: 'roll', side: k === 'R' ? 1 : -1, dur: PAT.roll.dur * q, lat: PAT.roll.lat * Math.min(1.15, reg) });
  else if (k === 'B') Object.assign(pm, { type: 'back', dur: PAT.back.dur * q, turn: Math.random() < 0.5 ? 1 : -1 });
  else if (k === 'H' || k === 'HB') { const h = HAT[k]; Object.assign(pm, { type: 'hat', back: k === 'HB', lift: h.lift * q, dur: h.lift * q + HAT.max, fly: false, h, turn: Math.random() < 0.5 ? 1 : -1 }); }   // update 43
  else { const side = k === 'SR' ? 1 : -1; Object.assign(pm, { type: 'bici', side, feint: -side, dur: PAT.bici.dur * q, split: PAT.bici.split, sp: DRIBBLE_SPEED * reg * 0.86,
    exit: f.clone().multiplyScalar(Math.cos(PAT.bici.ang)).addScaledVector(r, side * Math.sin(PAT.bici.ang)).normalize() }); }
  a.pm = pm; a.vel.multiplyScalar(0.55);
  sfx.dribble();
}
function patEnd(a, cancel) {
  const pm = a.pm; a.pm = null;
  if (!cancel && a.pmQ && a.pmQ.length && ball.owner === a) { patStart(a, a.pmQ.shift()); return; }
  a.pmQ = null; a.patCd = PAT.cd / THREE.MathUtils.clamp(a.sf.reg, 0.8, 1.2); a.dribbleCd = Math.max(a.dribbleCd, 0.45);
  if (pm && pm.type === 'back' && !cancel) a.face.copy(pm.f).multiplyScalar(-1);
}
// ¿el truco ya ha 'enganchado'? (las entradas fallan). En la bicicleta, solo desde la mitad del amago.
function patImmune(o, a) {
  const pm = o && o.pm; if (!pm) return false;
  if (pm.type !== 'bici' || pm.t > pm.dur * pm.split * 0.45) return true;
  // amago de la bicicleta: quien entra hacia el lado del amago se lo ha tragado (falla); quien entra recto al balón, roba
  return !!(a && (a.face.x * pm.r.x + a.face.y * pm.r.y) * pm.feint > 0.2);
}
function patStep(a, dt) {   // movimiento del jugador durante el truco (lo llama moveActor)
  const pm = a.pm; pm.t += dt; const u = Math.min(1, pm.t / pm.dur);
  if (pm.type === 'hat') return hatStep(a, pm, dt);   // update 43
  if (ball.owner !== a) { patEnd(a, true); return false; }
  if (pm.type === 'roll') {   // suela: paso lateral rápido (campana) llevando el balón con la planta
    const v = pm.lat * Math.PI / (2 * pm.dur) * Math.sin(Math.PI * u);
    a.vel.copy(pm.r).multiplyScalar(pm.side * v).addScaledVector(pm.f, 1.1 + 1.6 * u); a.face.copy(pm.f);
  } else if (pm.type === 'back') {   // arrastre: recula con el balón bajo la suela y se gira 180° con él
    if (u < 0.5) { a.vel.copy(pm.f).multiplyScalar(-2.4 * Math.sin(Math.PI * u / 0.5) - 0.3); a.face.copy(pm.f); }
    else { const k = (u - 0.5) / 0.5, an = pm.turn * Math.PI * Math.min(1, k * 1.25); a.face.copy(pm.f).rotateAround(_v2zero, an); a.vel.copy(a.face).multiplyScalar(4.2 * k); }
  } else {   // bicicleta: amago (frena, la pierna pasa por encima) y arranque en diagonal hacia el otro lado
    const s = pm.dur * pm.split;
    if (pm.t < s) { a.vel.multiplyScalar(Math.exp(-7 * dt)).addScaledVector(pm.f, 0.8 * dt * 10); if (a.vel.length() > 2.2) a.vel.setLength(2.2); a.face.copy(pm.f); }
    else { const k = Math.min(1, (pm.t - s) / 0.08); a.face.copy(pm.exit); a.vel.copy(pm.exit).multiplyScalar(pm.sp * (0.6 + 0.4 * k)); }
  }
  if (pm.t >= pm.dur) patEnd(a, false);
  return true;
}
// update 43: sombrerito. Fase 1 (lift): frena y mete el pie bajo el balón. Fase 2 (vuelo): el balón sale en parábola alta
// (cumbre HAT.apex m, cae a HAT.dist m) y el jugador corre a por él solo (sin joystick) hasta que lo controla al bajar.
function hatLaunch(a, pm) {
  const d = pm.back ? pm.f.clone().multiplyScalar(-1) : pm.f.clone(), h = pm.h;
  const vz = Math.sqrt(2 * GRAV * (h.apex - BR)), tLow = (vz + Math.sqrt(Math.max(0, vz * vz - 2 * GRAV * (BALL_LOW - BR)))) / GRAV;
  const vh = h.dist / tLow * 1.05;   // +5 %: rozamiento del aire
  ball.owner = null; ball.pos.z = BR + 0.05;   // sale desde donde está (en el pie)
  ball.vel.set(d.x * vh, d.y * vh, vz); ball.backspin = 0; ball.w.set(0, 0, 0);
  Object.assign(ball.fx, { curve: 0, lift: 0, dip: 0 }); applyEffect(null);
  ball.noCatch = a; ball.noCatchT = 0.3; ball.lastTouch = a; ball.hatBy = a; ball.hatT = tLow + 0.05;   // todo el vuelo alto (hasta que baja a la altura del pie)
  pm.fly = true; pm.tf = 0; pm.vh = vh; pm.dir = d; pm.tLow = tLow; a.kickT = 0.3;
  // rodea al defensor (no lo atraviesa ni lo empuja): sale por el lado contrario al rival más cercano en la trayectoria
  const lat = new THREE.Vector2(d.y, -d.x); let best = null, bd = 1e9;
  for (const o of fieldPlayers()) { if (o.team === a.team) continue; const rx = o.pos.x - a.pos.x, ry = o.pos.y - a.pos.y, al = rx * d.x + ry * d.y, side = rx * lat.x + ry * lat.y;
    if (al > -0.3 && al < h.dist + 1 && Math.abs(side) < 1.8 && al < bd) { bd = al; best = side; } }
  ball.hatBeat = []; ball.hatBeatT = tLow + 0.45;   // los vendidos no la tocan hasta que bota y el regateador llega (primer toque suyo)
  for (const o of fieldPlayers()) if (o.team !== a.team && Math.hypot(o.pos.x - a.pos.x, o.pos.y - a.pos.y) < 3.5) {   // vendidos: miran arriba un momento
    ball.hatBeat.push(o);
    o.hatLag = THREE.MathUtils.clamp(0.5 + ((a.sf.t ? a.sf.t.reg : 70) - (o.sf.t ? o.sf.t.ent : 70)) / 200, 0.3, 0.7);
    if (o.dashT > 0) { o.dashT = 0; o.dashEnded = false; o.dashHit = true; o.stun = DASH_MISS_STUN * 1.6; o.vel.multiplyScalar(0.2); LOG('regate_falla_entrada', a, { vs: NAME(o), truco: pm.back ? 'HB' : 'H' }); }   // entró a por el balón y se lo han pasado por encima
  }
  pm.lat = lat; pm.amp = best === null ? 0 : 1.5 * (best > 0.05 ? -1 : best < -0.05 ? 1 : pm.turn);
  sfx.kick(0.35); if (a === user || !S.practice) showBanner(pm.back ? '¡SOMBRERITO DE TACÓN!' : '¡SOMBRERITO!', a.team === 0 ? 'bAzul' : 'bRojo', 800);
  LOG('sombrerito', a, { back: pm.back, vh: +vh.toFixed(1), vz: +vz.toFixed(1) });
}
function hatStep(a, pm, dt) {
  if (!pm.fly) {
    if (ball.owner !== a) { patEnd(a, true); return false; }
    a.vel.multiplyScalar(Math.exp(-9 * dt)); a.face.copy(pm.f);
    const carga = fieldPlayers().some((o) => o.team !== a.team && o.dashT > 0 && Math.hypot(o.pos.x - a.pos.x, o.pos.y - a.pos.y) < 2.4);   // entra un rival: se la levanta YA
    if (pm.t >= pm.lift || (carga && pm.t > 0.05)) hatLaunch(a, pm);
    return true;
  }
  pm.tf += dt;
  if (ball.owner === a) { patEnd(a, false); return true; }                       // ¡controlado!
  if (ball.owner || S.mode !== 'play' || pm.t >= pm.dur) { if (a === user && input.buf && input.buf.hat) input.buf = null; patEnd(a, true); return false; }   // se la quedó otro / fuera / tiempo (u44: se anula la acción en espera)
  // media vuelta (de tacón) y carrera hacia donde va a caer el balón
  const lead = Math.min(0.25, Math.max(0, 0.9 - pm.tf)), pr = Math.min(1, pm.tf / pm.tLow), off = pm.amp * Math.sin(Math.PI * pr);
  const tx = ball.pos.x + ball.vel.x * lead + pm.lat.x * off - a.pos.x, ty = ball.pos.y + ball.vel.y * lead + pm.lat.y * off - a.pos.y, L = Math.hypot(tx, ty);
  if (pm.back && pm.tf < 0.22) { const an = pm.turn * Math.PI * Math.min(1, pm.tf / 0.22); a.face.copy(pm.f).rotateAround(_v2zero, an); a.vel.multiplyScalar(Math.exp(-6 * dt)); return true; }
  const sp = Math.min(pm.vh * pm.h.run * (pm.amp ? 1.1 : 1), SPEED_USER * a.sf.vel * 1.3);
  const bs = Math.hypot(ball.vel.x, ball.vel.y), sp2 = pr >= 1 ? Math.max(sp, Math.min(bs * 1.25, SPEED_USER * a.sf.vel * 1.3)) : sp;   // ya abajo: lo alcanza aunque bote
  if (L > 0.05) { const want = _patW.set(tx / L, ty / L); a.face.lerp(want, 1 - Math.exp(-14 * dt)).normalize(); a.vel.lerp(want.multiplyScalar(L < 0.5 && pr < 1 ? sp * L / 0.5 : sp2), 1 - Math.exp(-10 * dt)); }
  return true;
}
const _v2zero = new THREE.Vector2(), _patW = new THREE.Vector2();
function patBallOffset(o, toeF, toeR) {   // balón respecto a la cara actual (fwd/right), calculado en ejes del inicio del truco
  const pm = o.pm, u = Math.min(1, pm.t / pm.dur), F = o.face, Rx = F.y, Ry = -F.x;
  const w = _patW;
  if (pm.type === 'hat') { const k = Math.min(1, pm.t / pm.lift); w.copy(pm.f).multiplyScalar(toeF * (1 - 0.35 * k)); return { fwd: w.x * F.x + w.y * F.y, right: w.x * Rx + w.y * Ry }; }   // update 43
  if (pm.type === 'roll') {
    const sm = u * u * (3 - 2 * u), lat = pm.side * (-0.06 + 0.42 * sm);
    w.copy(pm.f).multiplyScalar(toeF * 0.85).addScaledVector(pm.r, lat);
  } else if (pm.type === 'back') {
    if (u < 0.5) { const k = u / 0.5; w.copy(pm.f).multiplyScalar(THREE.MathUtils.lerp(toeF, -0.32, k * k * (3 - 2 * k))).addScaledVector(pm.r, toeR * (1 - k)); }
    else w.copy(pm.f).multiplyScalar(-0.32 - 0.25 * (u - 0.5) / 0.5);   // se queda detrás (= delante tras el giro)
  } else {
    const s = pm.split;
    if (u < s) w.copy(pm.f).multiplyScalar(toeF + 0.06).addScaledVector(pm.r, pm.feint * 0.05);
    else { const k = (u - s) / (1 - s); w.copy(pm.exit).multiplyScalar(toeF + 0.25 + 0.35 * Math.sin(Math.PI * Math.min(1, k * 1.4))); }
  }
  return { fwd: w.x * F.x + w.y * F.y, right: w.x * Rx + w.y * Ry };
}
function patAnim(a) {   // [clip, velocidad] durante el truco
  const pm = a.pm, u = Math.min(1, pm.t / pm.dur), M = a.meta;
  if (pm.type === 'roll') return ['Dribble', 1.5];
  if (pm.type === 'hat') return !pm.fly ? ['Kick', ((M.Kick.impact || 9) / 30) / pm.lift] : (a.vel.length() > RUN_MIN ? ['Run', a.vel.length() / ((M.Run.speed || 6) * ESCALA)] : ['Idle', 1]);   // update 43
  if (pm.type === 'back') return u < 0.5 ? ['Dribble', -1.15] : ['Dribble', 1.3];
  if (u < pm.split) return ['Kick', ((M.Kick.impact || 9) / 30) / (pm.dur * pm.split) * 0.92];
  return ['Dribble', Math.max(1, (pm.sp / ((M.Dribble.speed || 5) * ESCALA)))];
}
function patBody(a) {   // giro de cadera / inclinación encima de la animación (no cambia el modelo)
  const pm = a.pm; if (!pm) return [0, 0];
  const u = Math.min(1, pm.t / pm.dur);
  if (pm.type === 'roll') { const b = Math.sin(Math.PI * u); return [-pm.side * 0.42 * b, pm.side * 0.10 * b]; }
  if (pm.type === 'hat') return [0, 0];   // update 43
  if (pm.type === 'back') { const b = u < 0.5 ? Math.sin(Math.PI * u / 0.5) : 0; return [0, 0.0 * b]; }
  const s = pm.split;
  if (u < s) { const b = Math.sin(Math.PI * u / s); return [-pm.feint * 0.55 * b, pm.feint * 0.16 * b]; }
  const k = (u - s) / (1 - s); return [pm.side * 0.18 * Math.sin(Math.PI * k), -pm.side * 0.08 * Math.sin(Math.PI * k)];
}
// --- IA: el defensor reacciona al truco (pica con el amago, entra tarde...) ---
function aiVsPattern(a, opp, target, d) {
  const pm = opp.pm; if (!pm) return;
  if (pm.type === 'bici' && pm.t < pm.dur * pm.split) {
    target.addScaledVector(pm.r, pm.feint * 1.4);   // se va hacia el lado del amago
    if (!pm.bit && pm.t > pm.dur * pm.split * 0.22 && d < 3.4 && a.dashCd <= 0) {   // decide cuando el amago ya se ve
      pm.bit = true;   // decide UNA vez por amago si pica
      const p = THREE.MathUtils.clamp(0.42 + (opp.sf.t.reg - a.sf.t.ent) / 90, 0.15, 0.85);
      if (Math.random() < p) { a.face.copy(opp.pos.clone().addScaledVector(pm.r, pm.feint * 1.4).sub(a.pos).normalize()); tryDash(a); LOG('ia_pica_amago', a, { p: +p.toFixed(2) }); }
    }
  } else if (!pm.bit && d < 2.5 && a.dashCd <= 0) {
    pm.bit = true;
    if (Math.random() < 0.5) { a.face.copy(opp.pos.clone().sub(a.pos).normalize()); tryDash(a); LOG('ia_entra_truco', a, {}); }
  }
}
// --- UI: botón + cuadrícula ---
const btnPatron = document.getElementById('btnPatron'), patronGrid = document.getElementById('patronGrid'), cargaPatron = document.getElementById('cargaPatron');
const PG = { id: null, sx: 0, sy: 0, gx: 0, gy: 0, s: 50, dots: [], dirs: [], ax: 0, ay: 0, cell: 4, els: [], hideT: 0, buf: null };
if (patronGrid) {
  const box = patronGrid.querySelector('.pgPuntos'); for (let i = 0; i < 9; i++) { const d = document.createElement('i'); d.dataset.i = i; box.appendChild(d); PG.els.push(d); }
}
function patOn() { return true; }   // update 38: REGATES (patrón) siempre puesto
function applyPatronBtn() { document.body.classList.toggle('sinPatron', !patOn()); const b = document.getElementById('ajPatron'); if (b) { b.textContent = 'BOTÓN REGATES POR PATRÓN (3×3): ' + (patOn() ? 'SÍ' : 'NO'); b.classList.toggle('on', patOn()); } }
function pgDotXY(i) { return [PG.gx + ((i % 3) - 1) * PG.s, PG.gy + (Math.floor(i / 3) - 1) * PG.s]; }
function pgDraw(fx, fy) {
  const pts = PG.dots.map((i) => pgDotXY(i).join(',')).join(' ');
  const svg = patronGrid.querySelector('svg');
  svg.querySelector('.pgLinea').setAttribute('points', pts); svg.querySelector('.pgSombra').setAttribute('points', pts);
  const lv = svg.querySelector('.pgVivo'), last = PG.dots[PG.dots.length - 1];
  if (fx != null && last != null) { const [x, y] = pgDotXY(last); lv.setAttribute('x1', x); lv.setAttribute('y1', y); lv.setAttribute('x2', fx); lv.setAttribute('y2', fy); lv.style.display = ''; } else lv.style.display = 'none';
  PG.els.forEach((e, i) => e.classList.toggle('on', PG.dots.includes(i)));
}
function pgPreview() {   // update 36: nombre del truco en vivo mientras se desliza
  const nm = patronGrid.querySelector('.pgNombre'), mv = patParseDirs(PG.dirs);
  nm.textContent = mv.length ? mv.map((k) => PAT_NAMES[k]).join(' + ') : (PG.dirs.length ? '…' : '');
  nm.classList.toggle('vivo', !!PG.dirs.length);
}
function pgStart(e) {
  if (PG.id !== null || e.pointerId === joyId) return;
  if (S.mode !== 'play' || S.paused || !user || editor.on) return;
  e.preventDefault(); e.stopPropagation();
  PG.id = e.pointerId; try { btnPatron.setPointerCapture(e.pointerId); } catch (_) {}
  pgOpenAt(e.clientX, e.clientY);
}
function pgOpenAt(cx, cy) {   // update 48: abre la rejilla centrada en (cx, cy) (REGATES o TURBO fusionado)
  const ar = appRect(), W = ar.width, H = ar.height;
  PG.s = THREE.MathUtils.clamp(Math.min(W, H) * 0.17, 48, 82);   // update 36: rejilla más grande
  PG.sx = cx; PG.sy = cy; PG.ax = cx; PG.ay = cy; PG.dirs = []; PG.cell = 4;
  // update 36: la rejilla se centra donde pulsa el dedo (solo se desplaza lo justo para caber en pantalla)
  const m = PG.s * 1.5; PG.gx = THREE.MathUtils.clamp(cx - ar.left, m, Math.max(m, W - m)); PG.gy = THREE.MathUtils.clamp(cy - ar.top, m, Math.max(m, H - m));
  PG.dots = [4]; clearTimeout(PG.hideT);
  patronGrid.style.setProperty('--s', PG.s + 'px');
  patronGrid.className = 'on'; const nm = patronGrid.querySelector('.pgNombre'); nm.textContent = ''; nm.classList.remove('vivo');
  for (let i = 0; i < 9; i++) { const [x, y] = pgDotXY(i); PG.els[i].style.left = x + 'px'; PG.els[i].style.top = y + 'px'; }
  const fo = patronGrid.querySelector('.pgFondo'); if (fo) { fo.style.left = PG.gx + 'px'; fo.style.top = PG.gy + 'px'; }
  if (PG.id !== FU_PID) btnPatron.classList.add('pulsado'); pgDraw(PG.gx, PG.gy);
}
const PG_STEP = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1], UR: [-1, 1], UL: [-1, -1], DR: [1, 1], DL: [1, -1] };
function pgFeed(x, y) {   // un punto del dedo: cuando se aleja PAT.th px del ancla se lee la dirección dominante de ese tramo
  const dx = x - PG.ax, dy = y - PG.ay;
  if (Math.hypot(dx, dy) < PAT.th) return false;
  const dir = patDir(dx, dy); PG.ax = x; PG.ay = y;
  if (PG.dirs[PG.dirs.length - 1] === dir || PG.dirs.length >= 12) return false;
  PG.dirs.push(dir);
  const [dr, dc] = PG_STEP[dir], r = THREE.MathUtils.clamp(Math.floor(PG.cell / 3) + dr, 0, 2), c = THREE.MathUtils.clamp((PG.cell % 3) + dc, 0, 2), nc = r * 3 + c;
  if (nc === PG.cell) { PG.cell = 4; PG.dots.push(4); }   // se sale de la rejilla: vuelve al centro para seguir dibujando
  else { PG.cell = nc; PG.dots.push(nc); }
  return true;
}
function pgMove(e) {
  if (e.pointerId !== PG.id) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null, list = evs && evs.length ? evs : [e];
  let ch = false;
  for (const ev of list) ch = pgFeed(ev.clientX, ev.clientY) || ch;
  if (ch) pgPreview();
  const last = list[list.length - 1], ar = appRect(), [lx, ly] = pgDotXY(PG.cell);
  pgDraw(lx + (last.clientX - PG.ax) - 0 * ar.left, ly + (last.clientY - PG.ay));
}
function pgEnd(e, cancel) {
  if (PG.id === null || (e && e.pointerId !== PG.id)) return;
  PG.id = null; btnPatron.classList.remove('pulsado');
  if (e && !cancel && e.clientX != null) { if (pgFeed(e.clientX, e.clientY)) pgPreview(); }
  const moves = patParseDirs(PG.dirs);
  let ok = false, cola = false;
  if (!cancel && moves.length) {
    if (e) markAction('patron', e);
    ok = tryPattern(user, moves);
    // update 36: búfer: si se suelta durante el enfriamiento o el truco anterior, se ejecuta en cuanto se pueda (máx. PAT.buf s)
    if (!ok && user && ball.owner === user && (user.patCd > 0 || user.pm || user.dribbleT > 0 || user.dashT > 0 || user.kickPending)) { PG.buf = { moves, t: PAT.buf }; cola = true; }
  }
  pgDraw(null, null);
  const nm = patronGrid.querySelector('.pgNombre'); nm.classList.remove('vivo');
  nm.textContent = ok || cola ? moves.map((k) => PAT_NAMES[k]).join(' + ') : (cancel || !PG.dirs.length ? '' : moves.length ? 'ESPERA…' : 'NO VALE');
  patronGrid.className = 'on suelta ' + (ok ? 'ok' : cola ? 'ok cola' : !PG.dirs.length || cancel ? 'nada' : 'mal');
  if (!ok && !cola && !cancel && PG.dirs.length) LOG('patron_fallido', user, { dirs: PG.dirs.join(' '), m: moves.join('+') });
  if (cola) LOG('patron_cola', user, { m: moves.join('+') });
  PG.hideT = setTimeout(() => { patronGrid.className = ''; }, ok || cola ? 460 : 560);
}
// ===================== update 48 (t106u): FUSIONAR REGATE Y TURBO (ajuste, NO por defecto) =====================
// TURBO se convierte en un joystick mientras lo mantienes: sigues esprintando y, con balón, mover el pulgar dibuja los MISMOS regates
// que el botón REGATES (mismo lector de direcciones patParseDirs, misma rejilla y nombre en vivo, mismo enfriamiento y búfer):
//  → / ← rueda · ↓ arrastre · ↗ / ↖ (o ↑ y →/←) bicicleta · ↓↑ sombrerito · ↑↓ sombrerito atrás · → ← croqueta (encadenados).
// Se ejecuta SIN soltar el turbo: cuando el pulgar se para FU.dwell ms (o al momento si es un sombrerito, que cierra la cadena),
// o al soltar. Volver al centro no cuenta como regate (el último tramo que acaba en la zona muerta del centro se descarta), así
// "→ y vuelta" = RUEDA ►, pero "↓ y ↑ pasando el centro" = SOMBRERITO.
const FU_PID = 'fusion';
const FU = { id: null, ox: 0, oy: 0, ax: 0, ay: 0, x: 0, y: 0, on: false, tMove: 0, dead: 0, dwell: 130, dwellV: 230, n: 0 };
function fusionOn() { return !!AJ.fusionTR; }
function fuStart(x, y) {
  if (PG.id !== null) return false;   // el botón REGATES está en uso
  PG.id = FU_PID; pgOpenAt(FU.ax, FU.ay);   // rejilla centrada donde empieza el trazo
  FU.on = true; FU.tMove = performance.now(); btnTurbo.classList.add('fuRegate');
  return true;
}
function fuFeed(x, y) {
  FU.x = x; FU.y = y;
  if (!FU.on) {
    if (Math.hypot(x - FU.ax, y - FU.ay) < PAT.th || S.mode !== 'play' || S.paused || !user || ball.owner !== user) return;
    if (!fuStart(x, y)) return;
  }
  if (pgFeed(x, y)) { pgPreview(); FU.tMove = performance.now(); }
  else if (Math.hypot(x - PG.ax, y - PG.ay) > 6) FU.tMove = performance.now();
  // sombrerito al instante, pero solo cuando el pulgar ya ha CRUZADO el centro (si solo vuelve al centro es un arrastre / rueda)
  if (PG.dirs.length >= 2) { const mv = patParseDirs(PG.dirs), last = PG.dirs[PG.dirs.length - 1];
    if (mv.length && /^H/.test(mv[mv.length - 1]) && Math.hypot(x - FU.ox, y - FU.oy) >= FU.dead && patDir(x - FU.ox, y - FU.oy) === last) { fuCommit(false); return; } }
  const [lx, ly] = pgDotXY(PG.cell); pgDraw(lx + (x - PG.ax), ly + (y - PG.ay));
}
function fuCommit(cancel) {
  if (!FU.on) return;
  FU.on = false; btnTurbo.classList.remove('fuRegate');
  // el tramo final que vuelve a la zona muerta del centro no es un regate (es soltar el joystick)
  if (PG.dirs.length && Math.hypot(FU.x - FU.ox, FU.y - FU.oy) < FU.dead) PG.dirs.pop();
  pgEnd({ pointerId: FU_PID, clientX: null, clientY: null, timeStamp: performance.now() }, cancel);
  FU.ax = FU.x; FU.ay = FU.y; FU.n++;
}
function fuTick() {   // pulgar quieto -> se ejecuta el regate dibujado (sin soltar el turbo)
  if (!FU.on || FU.id === null) return;
  const idle = performance.now() - FU.tMove, last = PG.dirs[PG.dirs.length - 1];
  if (idle < (last === 'D' || last === 'U' ? FU.dwellV : FU.dwell)) return;   // ↓ / ↑ pueden seguir a sombrerito o bicicleta: espera algo más
  const inDead = Math.hypot(FU.x - FU.ox, FU.y - FU.oy) < FU.dead, d2 = inDead ? PG.dirs.slice(0, -1) : PG.dirs;
  if (!patParseDirs(d2).length) { if (inDead || idle > 700) fuCommit(true); return; }   // trazo a medias (p. ej. solo ↑): no hace nada raro
  fuCommit(false);
}
btnTurbo.addEventListener('pointerdown', (e) => {
  if (!fusionOn() || e.pointerId === joyId || FU.id !== null) return;
  FU.id = e.pointerId; FU.ox = FU.ax = FU.x = e.clientX; FU.oy = FU.ay = FU.y = e.clientY; FU.on = false; FU.dead = PAT.th * 0.9;
});
btnTurbo.addEventListener('pointermove', (e) => {
  if (e.pointerId !== FU.id) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  for (const ev of (evs && evs.length ? evs : [e])) { fuFeed(ev.clientX, ev.clientY); if (FU.id === null) break; }
});
const fuEnd = (e, cancel) => { if (e.pointerId !== FU.id) return; if (!cancel && e.clientX != null) fuFeed(e.clientX, e.clientY); fuCommit(!!cancel); FU.id = null; };
btnTurbo.addEventListener('pointerup', (e) => fuEnd(e, false));
btnTurbo.addEventListener('pointercancel', (e) => fuEnd(e, true));
btnTurbo.addEventListener('lostpointercapture', (e) => { if (e.pointerId === FU.id) fuEnd(e, false); });
function setFusion(on) {
  AJ.fusionTR = !!on; saveAjustes();
  const b = document.getElementById('ajFusion'); if (b) { b.textContent = 'FUSIONAR REGATE Y TURBO: ' + (AJ.fusionTR ? 'SÍ' : 'NO'); b.classList.toggle('on', AJ.fusionTR); }
  document.body.classList.toggle('fusionTR', AJ.fusionTR);
  if (!AJ.fusionTR && FU.on) fuCommit(true);
}
function pgBufUpdate(dt) {   // update 36: ejecuta el truco que quedó en el búfer
  fuTick();   // update 48: turbo fusionado (se ejecuta al parar el pulgar)
  if (!PG.buf) return;
  PG.buf.t -= dt;
  if (PG.buf.t <= 0 || !user || ball.owner !== user || S.mode !== 'play') { PG.buf = null; return; }
  if (patCan(user)) { const m = PG.buf.moves; PG.buf = null; tryPattern(user, m); }
}
if (btnPatron) {
  btnPatron.addEventListener('pointerdown', pgStart);
  btnPatron.addEventListener('pointermove', pgMove);
  btnPatron.addEventListener('pointerup', (e) => pgEnd(e, false));
  btnPatron.addEventListener('pointercancel', (e) => pgEnd(e, true));
  btnPatron.addEventListener('lostpointercapture', (e) => { if (e.pointerId === PG.id) pgEnd(e, false); });
  btnPatron.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  btnPatron.addEventListener('contextmenu', (e) => e.preventDefault());
}
function updateEnergy(a, want, moving, dt) {
  const can = want && moving && a.stun <= 0 && a.dashT <= 0 && a.dribbleT <= 0 && (a.sprinting ? a.energy > 0 : a.energy > TURBO_MIN);
  if (can) {
    a.sprinting = true;
    if (!(a.regenT > 0)) a.energy = Math.max(0, a.energy - TURBO_DRAIN * dt);   // update 34: REGENERACIÓN -> turbo infinito
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
// update 31: EFECTO. update 34: curva REAL en forma de C (un poco menos que media vuelta con el máximo).
// La curva es geométrica (curvatura constante por metro recorrido, en el aire y rodando): el balón sale abierto -sgn·θ/2 y gira
// θ en total hasta llegar al punto apuntado (cuerda L), así que acaba donde apuntas. θ = EF_THETA · EFECTO · k: Zorro (80) ~115°,
// 50 ~72°, 10 ~14°, 0 = recto. Después del punto apuntado sigue recto. Cualquier choque (palo, portero, jugador, valla) la anula.
const EF_THETA = 2.5, _efO = new THREE.Vector2();
// update 44: curva más bonita y legible = 'plátano' progresivo: curvatura κ(u) = κ̄·(EF_A + EF_B·u) (u = progreso 0..1): sale casi
// recta y se cierra cada vez más al final (antes C de curvatura constante). Sigue acabando EXACTAMENTE donde apuntas (ángulo de salida
// y longitud del arco calculados numéricamente). θ escala con EFECTO de forma más visible en valores medios: θ = EF_THETA·1,08·EFECTO^0,85.
const EF_A = 0.45, EF_B = 1.1;
function efShape(th) {   // integra la trayectoria unitaria: ángulo de la cuerda respecto a la salida y cuerda/arco
  let cx = 0, cy = 0; const N = 24;
  for (let i = 0; i < N; i++) { const u = (i + 0.5) / N, ph = th * (EF_A * u + EF_B * u * u / 2); cx += Math.cos(ph); cy += Math.sin(ph); }
  return { ang: Math.atan2(cy, cx), ratio: Math.hypot(cx, cy) / N };
}
function effectPlan(a, dir, sp, k = 1, toward = null, Lfix = null, o = null) {
  const c0 = (a.sf && a.sf.cur) || 0; if (c0 <= 0.001 || sp < 4) return null;
  o = o || a.pos;
  const g = toward || goalCenter(a.team);
  if (!toward && dir.y * Math.sign(g.y - o.y) <= 0.35) return null;   // update 34: solo los tiros hacia la portería hacen la C (pases y despejes laterales salen rectos)
  let L = Lfix;
  if (L == null) {
    if (toward) L = Math.hypot(toward.x - o.x, toward.y - o.y);
    else L = Math.abs((g.y - o.y) / dir.y);   // hasta la línea de gol en la dirección apuntada
  }
  L = THREE.MathUtils.clamp(L, 5, 36);
  const th = Math.min(2.3, EF_THETA * 1.08 * Math.pow(c0, 0.85) * k * THREE.MathUtils.clamp(L / 14, 0.55, 1));   // update 44
  if (th < 0.01) return null;
  // sentido del giro: el que hace que el balón llegue a la línea de gol menos 'tumbado' (más fácil de meter y de leer para el portero);
  // si da igual (tiro de frente), se cierra hacia el centro de la portería como en v31
  const gy = goalCenter(a.team).y, fy = Math.sign(gy - o.y) || 1, ang = Math.atan2(dir.y * fy, dir.x);   // ángulo de la cuerda respecto a la línea de gol (0-180°)
  const endA = (h) => (h <= 0 || h >= Math.PI) ? -1 : Math.min(h, Math.PI - h);
  const ePlus = endA(ang + th / 2), eMinus = endA(ang - th / 2);   // giro antihorario (+) / horario (-) en coordenadas 'hacia la portería'
  let sgn;
  if (toward || Math.abs(ePlus - eMinus) < 0.17) {
    const nx = -dir.y, ny = dir.x; sgn = Math.sign(nx * (g.x - o.x) + ny * (g.y - o.y)); if (!sgn) sgn = (o.x * Math.sign(gy || 1)) > 0 ? 1 : -1;
  } else sgn = (ePlus > eMinus ? 1 : -1) * fy;   // con fy < 0 (ataca hacia y-) el espejo invierte el sentido
  let th2 = th, sh = efShape(th2);   // update 44: arco progresivo
  // update 44: tiro a portería: que no llegue 'tumbado' a la línea (con la rosca máxima y la portería de frente acababa casi paralelo
  // a la línea de fondo y daba en la pared junto al palo). Llegada ≥ ~29° respecto a la línea; si no, se reduce el giro.
  if (!toward) { const sp2 = sgn * fy; for (let i = 0; i < 14 && endA(ang + sp2 * (th2 - sh.ang)) < 0.5 && th2 > 0.3; i++) { th2 *= 0.92; sh = efShape(th2); } }
  const S_ = L / sh.ratio;
  return { rot: -sgn * sh.ang, ef: sgn * th2 / S_, efS: S_, efS0: S_, th: th2, L, sgn };
}
function effectCurve(a, dir, L, sp, k = 1, toward = null) {   // compat (tests v31): aplica el plan a 'dir' y devuelve la curvatura con signo (1/m)
  const pl = effectPlan(a, dir, sp, k, toward, L); if (!pl) return 0;
  dir.rotateAround(new THREE.Vector2(), pl.rot); return pl.ef;
}
function applyEffect(pl) { ball.fx.ef = pl ? pl.ef : 0; ball.fx.efS = pl ? pl.efS : 0; ball.fx.efS0 = pl ? pl.efS0 || pl.efS : 0; ball.fx.efH = null; }
// update 32: TIRO/PASE (botón de chut normal): tiro / pase controlado, mucho más lento que el antiguo CHUTAR.
// Opción AJ.tiroPase (SÍ por defecto; NO = CHUTAR con la potencia de antes). CHUT ALTO y chut por deslizamiento no cambian.
function tpOn() { return AJ.tiroPase !== false; }
const TP_V0 = 11.6, TP_V1 = 9.15;   // update 33: +22 % sobre v32 (9.5 / 7.5). Toque rápido (0.72) ~ 18 m/s; apuntado al máximo ~ 21 m/s (v31: 27-32 m/s)
function shoot(a, dir, power, assist, loft, hspeed, soft) {
  if (a.trampaShot && a !== user) { const gy = goalCenter(a.team).y; dir = new THREE.Vector2(a.trampaShot.x - a.pos.x, gy - a.pos.y); a.trampaShot = null; LOG('trampa_tiro', a, {}); }   // update 31: tras el balón trampa, al otro palo
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
  if (a === user && t <= 0) { releaseShot(a, dir, power, assist, loft, hspeed, soft); return; }   // update 12: el balón sale en el mismo frame del toque
  a.kickPending = { dir, power, assist, loft, hspeed, t, soft };
}
function updateKick(a, dt) {
  const k = a.kickPending; if (!k) return;
  a.vel.multiplyScalar(Math.exp(-9 * dt));
  if (ball.owner !== a) { a.kickPending = null; return; }
  k.t -= dt;
  if (k.t <= 0) { a.kickPending = null; if (k.pass) { releasePass(a, k.tgt, k.lofted, k.m); return; } releaseShot(a, k.dir, k.power, k.assist, k.loft, k.hspeed, k.soft); }
}
const _wv = new THREE.Vector3(), _wa = new THREE.Vector3();
function releaseShot(a, dir, power, assist, loft, hspeed, soft) {
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
  let sp = hspeed !== undefined ? hspeed : soft ? (TP_V0 + TP_V1 * power) * Math.sqrt(a.sf.tir) : (13 + 19 * power) * (a.keeper ? 1 : a.sf.tir);   // TIRO: potencia (las vaselinas no cambian); update 32: TIRO/PASE controlado
  if (!a.keeper) {   // PRECISIÓN: pequeña dispersión aleatoria (menos con más precisión; la mitad en vaselinas)
    const j = THREE.MathUtils.degToRad(a.sf.jitterDeg * (hspeed !== undefined ? 0.5 : 1)) * (Math.random() * 2 - 1);
    if (j) dir.rotateAround(new THREE.Vector2(), j);
  }
  const lob = hspeed !== undefined, bfx = a === user ? bootShot(dir, lob) : null;
  if (bfx) { sp *= bfx.speed; if (loft !== undefined) loft *= bfx.speed; if (bfx.jitter) dir.rotateAround(new THREE.Vector2(), bfx.jitter); }
  Object.assign(ball.fx, { curve: bfx ? bfx.curve : 0, lift: bfx ? bfx.lift : 0, dip: bfx ? bfx.dip : 0 }); applyEffect(null);
  const tra = !!a.trallazoShot; a.trallazoShot = 0; if (tra) { sp *= 1.2; ball.fx.dip = Math.max(ball.fx.dip || 0, 0.9); LOG('esp_trallazo', a, { sp: +sp.toFixed(1) }); }   // update 47: TRALLAZO de Kaledy
  let efLift = 0, efPl = null;
  if (!a.keeper) {   // update 31: CHUT LEJANO (tiro) + EFECTO. update 34: curva en C (effectPlan): sale abierto y se cierra hasta donde apuntas
    const g = goalCenter(a.team), Lg = Math.hypot(g.x - a.pos.x, g.y - a.pos.y);
    if (Lg > 18 && hspeed === undefined && !soft) sp *= a.sf.lejos;
    efPl = effectPlan(a, dir, sp, lob ? 0.85 : soft ? 0.8 : 1, null, null, ball.pos);   // desde donde sale el balón (la curva acaba justo donde apuntas)
  }
  const dir0 = dir.clone(), o0 = new THREE.Vector2(ball.pos.x, ball.pos.y); if (efPl) dir.rotateAround(_efO, efPl.rot);
  ball.owner = null; ball.noCatch = a; ball.noCatchT = 0.35; ball.lastTouch = a;
  if (Math.hypot(ball.pos.x - a.pos.x, ball.pos.y - a.pos.y) < PR + BR * 0.5) {
    ball.pos.set(a.pos.x + dir.x * (PR + BR + 0.15), a.pos.y + dir.y * (PR + BR + 0.15), BR + 0.05);
    if (efPl) {   // el balón se ha recolocado: se recalcula la curva desde aquí hacia el MISMO punto apuntado
      const P = new THREE.Vector2(o0.x + dir0.x * efPl.L, o0.y + dir0.y * efPl.L), d2 = P.clone().sub(ball.pos).normalize();
      const p2 = effectPlan(a, d2, sp, lob ? 0.85 : soft ? 0.8 : 1, null, P.distanceTo(ball.pos), ball.pos); if (p2) { efPl = p2; dir.copy(d2).rotateAround(_efO, efPl.rot); }
    }
  }
  if (efPl) { applyEffect(efPl); efLift = lob ? 0 : 0.5 * a.sf.cur; LOG('efecto', a, { th: Math.round(THREE.MathUtils.radToDeg(efPl.th)), L: +efPl.L.toFixed(1), sgn: efPl.sgn }); }
  ball.pos.z = Math.max(ball.pos.z, BR + 0.05);
  ball.vel.set(dir.x * sp, dir.y * sp, loft !== undefined ? loft : soft ? 0.35 + 1.1 * power * power + efLift * 0.4 : 0.8 + 3.2 * power * power + efLift);   // chut normal: raso / poca altura (con EFECTO, algo más alto para que se vea la rosca)
  if (hspeed !== undefined) ball.pos.z = BR + 0.02;
  if (hspeed !== undefined && a.lobErr) {   // update 44: chut alto con poca TIR: desvío + potencia irregular + vuelo errático
    const er = a.lobErr, c = Math.cos(er.rot), s_ = Math.sin(er.rot), vx = ball.vel.x;
    ball.vel.x = (vx * c - ball.vel.y * s_) * er.pot; ball.vel.y = (vx * s_ + ball.vel.y * c) * er.pot; ball.vel.z *= 0.5 + 0.5 * er.pot;
    ball.fx.curve += er.curve; ball.fx.dip = Math.max(ball.fx.dip || 0, er.dip);
  }
  if (hspeed !== undefined) a.lobErr = null;
  // giro: chut raso = rueda hacia delante; chut alto = efecto de retroceso (más en la vaselina suave)
  ball.backspin = hspeed !== undefined ? THREE.MathUtils.clamp(1.1 - hspeed / 28, 0.1, 1) * (bfx ? bfx.backspin : 1) : 0;
  if ((bfx && bfx.dip) || tra) ball.backspin = 0;
  ball.w.set(0, 1, 0).cross(_wv.set(ball.vel.x, 0, -ball.vel.y)).multiplyScalar((ball.backspin > 0 ? -0.6 * ball.backspin : bfx && bfx.dip ? 0.05 : 0.7) / BR);
  if (ball.fx.curve) ball.w.y += ball.fx.curve * 60;   // giro vertical visible en la rosca
  if (ball.fx.ef) ball.w.y += ball.fx.ef * sp * 2.2;     // update 34: giro visible de la curva en C
  a.kickT = 0.35; a.face.copy(dir);
  if (a.espDecoy) { espSpawnDecoy(a, a.espDecoy); a.espDecoy = null; }   // update 29: BALÓN TRAMPA
  S.shots++; ball.kickN = (ball.kickN || 0) + 1; sfx.kick(power); LOG('tiro', a, { soft: !!soft, pos: [+a.pos.x.toFixed(1), +a.pos.y.toFixed(1)], vel: [+ball.vel.x.toFixed(1), +ball.vel.y.toFixed(1), +ball.vel.z.toFixed(1)] });
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
    if (el < 0.38) a.vel.copy(a.diveDir).multiplyScalar(GK44.diveV * (a.keeper ? a.sf.est * (a.shellT > 0 ? GK_SHELL_K : 1) : a.sf.ref) * (1 - el / 0.5)); else a.vel.multiplyScalar(Math.exp(-8 * dt));
  } else if (a.stun > 0) { a.stun -= dt; a.vel.multiplyScalar(Math.exp(-6 * dt)); if (a.pm) patEnd(a, true); }
  else if (a.pm && patStep(a, dt)) { /* update 35: truco del patrón */ }
  else if (a.dribbleT > 0) { a.dribbleT -= dt; a.vel.copy(a.face).multiplyScalar(a.dribSp); }
  else if (a.dashT > 0) {
    a.dashT -= dt; a.vel.copy(a.face).multiplyScalar(a.dashSp);
    if (a.dashT <= 0) a.dashEnded = true;
  } else {
    if (a.hatLag > 0) { a.hatLag -= dt; speed *= 0.18; }   // update 43: vendido por el sombrerito (mira el balón por encima)
    const target = wish.clone().multiplyScalar(speed);
    const acc = 1 - Math.exp(-(a === user ? 26 : 14) * a.sf.vel * dt);   // usuario: menos inercia (~40 ms) para que responda ya
    a.vel.lerp(target, acc);
    if (wish.lengthSq() > 0.01) a.face.copy(wish).normalize();
  }
  a.dashCd = Math.max(0, a.dashCd - dt);
  a.dribbleCd = Math.max(0, a.dribbleCd - dt);
  if (a.patCd > 0) a.patCd = Math.max(0, a.patCd - dt);
  a.kickT = Math.max(0, a.kickT - dt);
  if (a.mareoT > 0) {   // update 37: ESPORAS de Mushom -> se tambalea en zigzag y va más lento
    const ang = Math.sin(S.t * 6.5 + (a.team ? 1.3 : 0)) * 0.95, c = Math.cos(ang), sn = Math.sin(ang);
    a.pos.x += (a.vel.x * c - a.vel.y * sn) * dt * 0.72; a.pos.y += (a.vel.x * sn + a.vel.y * c) * dt * 0.72;
    if ((a._mareoP = (a._mareoP || 0) - dt) <= 0) { a._mareoP = 0.22; espPuffs(a.pos.x, a.pos.y, 1.9, 0xc77dff, 1, 0.5, 0.5, 0.25); }
  } else a.pos.addScaledVector(a.vel, dt);
  if (a.slipT > 0 || a.chargeT > 0) { const m0 = PR; if (Math.abs(a.pos.x) > SIDE_X - m0 - 0.05 || Math.abs(a.pos.y) > WY - m0 - 0.05) { a.chargeT = 0; if (a.slipV) a.slipV.multiplyScalar(-0.4); } }
  // límites: vallas y porterías
  const m = PR;
  a.pos.x = THREE.MathUtils.clamp(a.pos.x, -SIDE_X + m, SIDE_X - m);   // update 37: la banda es una pared (nadie sale del campo por los lados)
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
  if (fx && fx.ef && fx.efS > 0) {   // update 34: EFECTO en C -> gira la velocidad horizontal ef rad por metro recorrido (también rodando)
    const sh = Math.hypot(v.x, v.y), ds = Math.min(sh * dt, fx.efS);
    if (ds > 0) { const u = fx.efS0 > 0 && fx.efS <= fx.efS0 + 1e-6 ? 1 - (fx.efS - ds / 2) / fx.efS0 : 0.5, an = fx.ef * (EF_A + EF_B * u) * ds, c = Math.cos(an), s_ = Math.sin(an), vx = v.x; v.x = vx * c - v.y * s_; v.y = vx * s_ + v.y * c; fx.efS -= ds; }
    if (fx.efS <= 1e-4) { fx.ef = 0; fx.efS = 0; }
  }
  if (fx && p.z > BR + 0.02) {
    if (fx.curve) { const vx = v.x; v.x -= v.y * fx.curve * dt; v.y += vx * fx.curve * dt; fx.curve *= 1 - 0.35 * dt; }
    if (fx.lift) v.z += fx.lift * dt;
    if (fx.dip && v.z < 0) v.z -= GRAV * fx.dip * dt;
  }
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
}
// predicción del vuelo hasta el primer bote (misma integración que el balón real; sin colisiones)
const _pp = new THREE.Vector3(), _pv = new THREE.Vector3(), _pfx = { curve: 0, lift: 0, dip: 0, ef: 0, efS: 0, efS0: 0 };
function predictFlight(pos, vel, out, maxT = 5, h = 1 / 120, fx) {
  _pp.copy(pos); _pv.copy(vel); let t = 0, peak = pos.z;
  const pf = fx ? Object.assign(_pfx, { ef: 0, efS: 0, efS0: 0 }, fx) : null;
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
// update 46 (t98u: «la trompa direccional de tiro se extienda más rápido si se tiene menos stats de tiro dificultando puntería»):
// fracción del recorrido del mini-joystick (o del tiempo de carga con Q) que hace falta para la carga COMPLETA del chut alto.
// TIR 99 = 1 (todo el recorrido, lenta y controlable), 75 ~0,63, 60 = 0,4 (la trompa sale disparada con poco dedo), <60 hasta 0,32.
function altoSens(t) { return t >= 60 ? 0.4 + 0.6 * THREE.MathUtils.clamp((t - 60) / 39, 0, 1) : Math.max(0.32, 0.4 - (60 - t) * 0.004); }
function altoSensU() { return AJ.largoStat === false || !user ? 1 : altoSens(lobTir(user)); }
// update 32: el CHUT LARGO depende de la stat TIR de la carta (k 0-1, interpolación suave): k = 1 (TIR alto) = la 'trompa de elefante'
// de siempre (larga, potente); k = 0 (TIR bajo) = vaselina suave: salida alta y lenta que no llega lejos aunque cargues al máximo.
// update 37: NERF del chut alto/largo: TIR 99 rinde como antes TIR 70 (potencia, distancia y precisión) y escala proporcional hacia
// abajo (TIR equivalente = 30 + (TIR − 30)·40/69); con 30 o menos sigue siendo malo. El indicador usa esta misma función.
const LOB_NERF = (t) => t <= 30 ? t : 30 + (t - 30) * 40 / 69;
// update 44 (Aritz: «para que se chute fácilmente sea 99 y con 60 la trompa cueste»): la potencia/alcance sale de la TIR real
// (sin el nerf de la v37): 99 = 1 (la trompa entera), 90 ~0,79, 80 ~0,57, 70 ~0,35, 60 ~0,14 (vaselina corta), <=52 = 0.
const lobTir = (a) => a && a.sf && a.sf.t ? a.sf.t.tir : a && STATS[a.charKey] ? STATS[a.charKey].tir : 80;
function lobStatK(a) {
  const x = THREE.MathUtils.clamp((lobTir(a) - 52) / (99 - 52), 0, 1); return Math.pow(x, 1.1);
}
// update 44: ERROR del chut alto (0 con TIR 99 -> 1 con TIR 60): desvío de dirección, potencia irregular y vuelo errático (se va de lado / cae)
function lobErrK(a) { return Math.pow(THREE.MathUtils.clamp((99 - lobTir(a)) / 39, 0, 1), 1.2); }
const LOB_ERR = { deg: 12, pot: 0.22, curve: 0.32, dip: 0.3 };
function lobErrRoll(e) {
  const r = () => (Math.random() + Math.random()) - 1;   // triangular -1..1 (más casos cerca del centro)
  return { e, rot: THREE.MathUtils.degToRad(LOB_ERR.deg * e * r()), pot: 1 - LOB_ERR.pot * e * Math.random(), curve: LOB_ERR.curve * e * r(), dip: Math.random() < 0.5 ? LOB_ERR.dip * e * Math.random() : 0 };
}
const LOB_K_MAX = () => lobStatK({ sf: { t: { tir: 99 } } });   // update 37: tope (TIR 99 nerfeado = antes TIR 70)
function lobParams(c, k = 1) {
  c = THREE.MathUtils.clamp(c, 0, 1); k = THREE.MathUtils.clamp(k, 0, 1);
  // update 46 (t98u «el chut alto sigue muy chetado aún en 60»): tiro más FLOJO: TIR 99 al máximo ~30 m (antes 52), 75 ~16 m (antes 33), 60 ~8 m (antes 17)
  const vHi = 9 + 13.5 * c, vLo = 6.2 + 1.6 * c;
  const v = vLo + (vHi - vLo) * k;
  let s = Math.min(1, c / 0.55); s = s * s * (3 - 2 * s);
  const angHi = 62 - 42 * s + 1.5 * Math.max(0, c - 0.55) / 0.45, angLo = 58 - 8 * c;
  const ang = THREE.MathUtils.degToRad(angLo + (angHi - angLo) * k);
  return { c, k, v, ang, h: v * Math.cos(ang), vz: v * Math.sin(ang) };
}
function shootLob(a, dir, c) {
  const lp = lobParams(c, AJ.largoStat === false ? LOB_K_MAX() : lobStatK(a));
  const er = lobErrRoll(AJ.largoStat === false ? 0 : lobErrK(a)); a.lobErr = er;   // update 44: se aplica al soltar el balón (releaseShot)
  shoot(a, dir, 0.3 + 0.7 * lp.c, false, lp.vz, lp.h);
  LOG('chut_alto', a, { k: +lp.k.toFixed(2), c: +lp.c.toFixed(2), v: +lp.v.toFixed(1), ang: Math.round(THREE.MathUtils.radToDeg(lp.ang)), err: +er.e.toFixed(2), rot: +THREE.MathUtils.radToDeg(er.rot).toFixed(1), pot: +er.pot.toFixed(2), curve: +er.curve.toFixed(2), dip: +er.dip.toFixed(2) });
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
  if (b.fx) { b.fx.curve = 0; b.fx.ef = 0; b.fx.efS = 0; b.fx.efS0 = 0; }
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
  if (b.fx.ef) {   // update 34: curva en C -> se anula si alguien/algo ha desviado el balón desde el último paso
    const h = Math.atan2(b.vel.y, b.vel.x);
    if (b.owner || (b.fx.efH != null && Math.abs(Math.atan2(Math.sin(h - b.fx.efH), Math.cos(h - b.fx.efH))) > 0.12) || Math.hypot(b.vel.x, b.vel.y) < 0.5) { b.fx.ef = 0; b.fx.efS = 0; }
  }
  airStep(b.pos, b.vel, dt, b.fx);
  b.fx.efH = b.fx.ef ? Math.atan2(b.vel.y, b.vel.x) : null;
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
  // update 37: SIN saques de banda (Aritz). Las bandas son paredes invisibles: el balón rebota en la línea lateral y sigue en juego (a ras o por el aire)
  if (b.pos.x > SIDE_X) { b.pos.x = SIDE_X; if (b.vel.x > 0) { b.vel.x = -b.vel.x * e; if (b.vel.x < -3) b.wallHit = 1; } }
  if (b.pos.x < -SIDE_X) { b.pos.x = -SIDE_X; if (b.vel.x < 0) { b.vel.x = -b.vel.x * e; if (b.vel.x > 3) b.wallHit = 1; } }
  // porterías de caja
  for (const s of [1, -1]) {
    const gl = s * HL, back = s * (HL + GD);
    const inY = (y) => (s > 0 ? (y > gl && y < back) : (y < gl && y > back));
    // postes y larguero
    if (b.pos.z < GH + BR) { const sp0 = Math.hypot(b.vel.x, b.vel.y); if (collideCircle2D(POST_X, gl, POST_R, 0.62) | collideCircle2D(-POST_X, gl, POST_R, 0.62)) { b.vel.z *= 0.9; b.backspin = 0; if (sp0 > 6) b.postHit = 'palo'; } }
    if (Math.abs(b.pos.x) < POST_X) {
      const dy = b.pos.y - gl, dz = b.pos.z - GH, L = Math.hypot(dy, dz), min = POST_R + BR;
      if (L < min && L > 1e-5) {
        const ny = dy / L, nz = dz / L; b.pos.y = gl + ny * min; b.pos.z = GH + nz * min;
        const vn = b.vel.y * ny + b.vel.z * nz; if (vn < 0) { b.vel.y -= 1.62 * vn * ny; b.vel.z -= 1.62 * vn * nz; b.vel.x *= 0.9; b.backspin = 0; if (-vn > 3) sfx.kick(0.1); if (-vn > 4) b.postHit = 'larguero'; }
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
  if (o.pm) return patBallOffset(o, toeF, toeR);   // update 35
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
function aiField(a, opp, dt, rawFn = aiFieldRaw) {
  if (!a.aiS) { a.aiS = new THREE.Vector2(); a.aiOwner = ball.owner; a.reactT = 0; }
  if (ball.owner !== a.aiOwner) { a.aiOwner = ball.owner; a.reactT = AI.react[0] + Math.random() * (AI.react[1] - AI.react[0]); }
  a.reactT = Math.max(0, a.reactT - dt);
  const keeperHold = ball.owner && ball.owner.keeper;
  if (a.reactT > 0 && ball.owner !== a && !keeperHold) return a.aiS.clone();   // reacción (no con el portero: se aparta ya)
  const raw = rawFn(a, opp, dt);
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
    if (opp.pm) aiVsPattern(a, opp, target, d);   // update 35: reacciona al truco del patrón
    if (d > 5 && a.energy > 0.3) a.wantTurbo = true;
    a.pressT = d < 3 ? (a.pressT || 0) + dt : 0;
    if (d < 2.4 && a.dashCd <= 0 && (ball.ownT || 0) > 0.7 && a.pressT > 0.35 && Math.random() < dt * 1.9) { a.face.copy(opp.pos.clone().sub(a.pos).normalize()); tryDash(a); }
    return aiArrive(a, target, 1.0, 0.25);
  }
  // balón suelto: ir a por él con predicción
  a.pressT = 0;
  let pred = bp.clone().addScaledVector(new THREE.Vector2(ball.vel.x, ball.vel.y), 0.35);
  if (ball.pos.z > 1.2) { const l = predictFlight(ball.pos, ball.vel, null, 4, 1 / 60); pred = new THREE.Vector2(l.x, l.y); }
  pred.x = THREE.MathUtils.clamp(pred.x, -SIDE_X + 1, SIDE_X - 1); pred.y = THREE.MathUtils.clamp(pred.y, -WY + 1, WY - 1);
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
// update 44: PORTEROS MEJORES (Aritz: «haz que los porteros sean mejores»). Antes: reacción 0,15-0,30 s, ventana de estirada 0,5 s,
// hueco para estirarse 1,0, alcance 1,1 / 1,75, estirada 7,5 m/s, lectura de rosca 1,15−1,6·tt, blocaje 1,5−v/30. Siguen escalando con sus stats.
const GK44 = { r0: 0.06, r1: 0.08, diveWin: 0.6, diveGap: 0.8, reach: 1.2, reachDive: 1.85, diveV: 8.4, diveAct: 0.06, curveRead: 1.3, antic: 0.45, c0: 1.6, c1: 32 };   // diveAct: la estirada cuenta desde 0,06 s (antes 0,12: los tiros de cerca llegaban antes)
function aiKeeper(k, dt) {
  const s = k.team === 0 ? -1 : 1;           // portería propia: azul abajo (y-), rojo arriba (y+)
  const lineY = s * (HL - 0.9);
  if (ball.owner === k) {
    k.holdT = (k.holdT || 0) + dt;
    if (k.kickPending) return new THREE.Vector2(0, 0);
    k.face.set(0, -s);
    // update 22: saca cuando el rival se ha apartado (o como mucho a los 1,8 s) y nunca por la línea donde espera el rival
    const mate = gkMate(k), foe = gkFoe(k);   // update 30: en 2 VS 2, al compañero más libre
    const foeNear = foe && !S.practice && (foe.pos.distanceTo(k.pos) < AI.keeperGap - 0.4 || Math.abs(foe.pos.y - s * HL) < AI.boxDepth);
    if (k.holdT > (foeNear ? 1.8 : 0.9)) {
      const dir = mate.pos.clone().sub(k.pos); dir.x += (Math.random() - 0.5) * 2;
      if (dir.y * -s < 4) dir.set((Math.random() - 0.5) * 8, -s * 14);
      if (foe && !S.practice) {   // ¿el rival corta la línea del saque? -> a la banda contraria
        const u = dir.clone().normalize(), rel = foe.pos.clone().sub(k.pos), along = rel.dot(u), perp = Math.abs(rel.x * u.y - rel.y * u.x);
        if (along > 0 && along < dir.length() + 2 && perp < 2.5) dir.set(-Math.sign(foe.pos.x - k.pos.x || 1) * (8 + Math.random() * 4), -s * (13 + Math.random() * 4));
      }
      shoot(k, dir, (0.25 + Math.min(0.35, dir.length() / 60)) * THREE.MathUtils.clamp(k.sf.saq || 1, 0.75, 1.25), false, 5.5); k.holdT = -5;   // update 37: SAQUE
    }
    return new THREE.Vector2(0, 0);
  }
  k.holdT = 0;
  // update 29: BALÓN TRAMPA -> el portero sigue al señuelo mientras exista
  const B = k.decoy && k.decoy.alive ? k.decoy : ball, bOwner = B === ball ? ball.owner : null;
  let tx = B.pos.x * 0.55;
  const gc = B === ball && !bOwner && ball.fx.ef ? gkLeeCurva(B, lineY, s) : null;   // update 34: tiro con curva en C -> el portero la lee tarde (se puede engañar)
  const comingIn = (B.vel.y * s > 4 || (gc && gc.tt < 2)) && !bOwner;
  if (comingIn) {
    const tt = gc ? gc.tt : (lineY - B.pos.y) / B.vel.y;
    if (tt > 0 && tt < 2) tx = gc ? gc.x : B.pos.x + B.vel.x * tt;
  }
  k.react = (k.react || 0) - dt; if (k.shellT > 0) k.react = Math.min(k.react, 0);   // update 37: CAPARAZÓN -> reacción inmediata
  if (k.react > 0) tx = k.lastTx ?? tx; else { k.lastTx = tx; if (comingIn && !k.wasComing) { k.react = (GK44.r0 + Math.random() * GK44.r1) * (2 - k.sf.ref); if (k.fetidaT > 0 && B === ball) { k.react = 0.6 + Math.random() * 0.15; k.fetidaT = 0; LOG('fetida_reaccion_tarde', k, {}); } } }   // BOMBA FÉTIDA: reacciona tarde
  k.wasComing = comingIn;
  if (comingIn && k.diveT <= 0 && k.react <= 0 && !bOwner) {
    const tt = gc ? gc.tt : (lineY - B.pos.y) / B.vel.y;
    const bx = gc ? gc.x : B.pos.x + B.vel.x * tt;
    const bz = gc ? gc.z : gkBallZ(B, tt);
    if (tt > 0.05 && tt < GK44.diveWin && Math.abs(bx - k.pos.x) > GK44.diveGap * ESCALA && Math.abs(bx) < GW + 0.6) startDive(k, bx, bz);
    else if (gkPlus() && tt > 0.05 && tt < 0.55 && Math.abs(bx) < GW + 0.6 && Math.abs(bx - k.pos.x) < 1.6 * ESCALA && k.gkJumpT <= 0 && !k.gkJumpQ && bz > GK_REACH * ESCALA - 0.25 && bz < GH + 0.6 && Math.abs(k.pos.y - lineY) < 1.8) startGkJump(k, bz, tt);   // update 30: salta a por el balón alto
  }
  tx = THREE.MathUtils.clamp(tx, -GW + 0.6, GW - 0.6);
  // salir un poco si el balón está suelto y cerca
  let ty = lineY;
  const foeK = is2v2() ? nearestFoe(k, new THREE.Vector2(ball.pos.x, ball.pos.y)) : (k.team === 0 ? rival : user);   // jugador de campo contrario (2 VS 2: el más cercano al balón)
  const bsp = Math.hypot(ball.vel.x, ball.vel.y), dBallK = Math.hypot(ball.pos.x - k.pos.x, ball.pos.y - k.pos.y);
  const dBallF = foeK && !S.practice ? Math.hypot(ball.pos.x - foeK.pos.x, ball.pos.y - foeK.pos.y) : 99;
  // update 22: sale a por el balón suelto si está en su zona y llega claramente antes que el delantero (balones al hueco)
  const near = !ball.owner && ball.pos.z < 1.6 && ((Math.hypot(ball.pos.x, ball.pos.y - s * HL) < 8 && bsp < 6) ||
    (Math.abs(ball.pos.y - s * HL) < 12 && Math.abs(ball.pos.x) < GW + 5 && bsp < 9 && dBallK < dBallF * 0.75 * THREE.MathUtils.clamp(k.sf.pos || 1, 0.8, 1.2)));
  if (near) { tx = THREE.MathUtils.clamp(ball.pos.x, -GW, GW); ty = THREE.MathUtils.clamp(ball.pos.y, s > 0 ? HL - 6 : -HL + 0.9, s > 0 ? HL - 0.9 : -HL + 6); }
  else ty = lineY;
  // el rival se acerca con el balón: el portero sale a tapar ángulo (y se expone a la vaselina)
  const h = ball.owner;
  if (h && h !== k && h.team !== k.team && !h.keeper) {
    const dGoal = Math.abs(s * HL - h.pos.y);
    const out = THREE.MathUtils.clamp((18 - dGoal) * 0.4, 0, dGoal < 10 && Math.abs(h.pos.x) < GW + 2 ? 5 : 4) * THREE.MathUtils.clamp(k.sf.pos || 1, 0.75, 1.15);   // update 37: COLOCACIÓN   // 1 contra 1: sale más
    if (out > 0) { ty = lineY - s * out; tx = THREE.MathUtils.clamp(h.pos.x * 0.45, -GW + 0.6, GW - 0.6); }
    // update 44: ANTICIPACIÓN: si el rival arma el chut (o apunta), se adelanta un poco hacia donde mira su cuerpo
    if (h.kickPending || (h === user && aim.active && (aim.kind === 'chutar' || aim.kind === 'alto'))) {
      const fy = h.face.y * s; if (fy > 0.2) { const px = h.pos.x + h.face.x / h.face.y * (ty - h.pos.y); tx = THREE.MathUtils.clamp(tx + (THREE.MathUtils.clamp(px, -GW, GW) - tx) * GK44.antic * THREE.MathUtils.clamp(k.sf.pos || 1, 0.8, 1.2), -GW + 0.5, GW - 0.5); }
    }
    k.outY = ty;
  }
  // vaselina por encima: vuelve a la línea andando hacia atrás (más lento)
  const lobOver = !ball.owner && ball.lastTouch && ball.lastTouch.team !== k.team && ball.pos.z > 1.2 && ball.vel.y * s > 2;
  k.lobT = lobOver ? (k.lobT || 0) + dt : 0;
  k.backpedal = lobOver;
  const hc = gkHighClaim(k, s);   // update 30: sale a por el centro / balón alto en su área
  if (hc) { tx = hc.x; ty = THREE.MathUtils.clamp(hc.y, s > 0 ? HL - 6 : -HL + 0.7, s > 0 ? HL - 0.7 : -HL + 6); k.backpedal = false; }
  const wish = new THREE.Vector2(tx - k.pos.x, ty - k.pos.y);
  const L = wish.length(); if (L > 0.2) wish.multiplyScalar(Math.min(1, L / 1.2) / L * (k.backpedal ? (k.lobT < 0.35 ? 0 : 0.4) : 1)); else wish.set(0, 0);   // vaselina: tarda en reaccionar y recula despacio
  const f = k.face.clone(); const r = moveKeeperFace(k, s); return { wish, face: r };
}
// update 34: dónde y cuándo cruza la línea del portero un balón con curva en C (misma integración que el balón; suelo aproximado)
const _gq = new THREE.Vector3(), _gv = new THREE.Vector3(), _gfx = { curve: 0, lift: 0, dip: 0, ef: 0, efS: 0, efS0: 0 }, _gcr = { tt: 9, x: 0, z: 0 };
function gkCurveCross(lineY, s) {
  if (S.t === _gcr.st && lineY === _gcr.ly) return _gcr.tt < 9 ? _gcr : null;
  _gcr.st = S.t; _gcr.ly = lineY; _gcr.tt = 9;
  _gq.copy(ball.pos); _gv.copy(ball.vel); Object.assign(_gfx, ball.fx); const h = 1 / 60;
  for (let t = h; t < 2.2; t += h) {
    const py = _gq.y; airStep(_gq, _gv, h, _gfx);
    if (_gq.z < BR) { _gq.z = BR; _gv.z = Math.abs(_gv.z) > BOUNCE_MIN ? -_gv.z * BOUNCE_E : 0; }
    if ((py - lineY) * s < 0 && (_gq.y - lineY) * s >= 0) { _gcr.tt = t; _gcr.x = _gq.x; _gcr.z = _gq.z; return _gcr; }
  }
  return null;
}
// el portero no adivina la rosca desde el principio: al salir el balón se fía de la dirección (recta) y según se acerca va leyendo la curva
// (lectura completa en los últimos ~0,1 s). Así la curva en C le engaña a veces, pero si llega con tiempo reacciona y se estira.
const _gl = { tt: 9, x: 0, z: 0 };
function gkLeeCurva(B, lineY, s) {
  const gc = gkCurveCross(lineY, s); if (!gc) return null;
  const w = THREE.MathUtils.clamp(GK44.curveRead - gc.tt * 1.4, 0.15, 1), xl = B.pos.x + B.vel.x * gc.tt;   // update 44: lee la rosca antes
  _gl.tt = gc.tt; _gl.z = gc.z; _gl.x = xl + (gc.x - xl) * w; return _gl;
}
function startDive(k, bx, bz) {
  const side = Math.sign(bx - k.pos.x) || 1;
  k.diveHigh = gkPlus() && bz !== undefined && bz > 1.55 * ESCALA;   // update 30: estirada alta (sube el cuerpo)
  k.diveLiftMax = k.diveHigh ? THREE.MathUtils.clamp(bz - 1.35 * ESCALA, 0.25, 0.8) : 0;
  k.gkJumpQ = null;
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
  const diving = k.diveT > 0 && (k.diveDur - k.diveT) > GK44.diveAct && (k.diveDur - k.diveT) < 0.6;
  const kj = k.kJumpZ || 0, hd = diving && k.diveHigh ? (k.diveLiftMax || 0) : 0;   // update 30: salto / estirada alta
  const shK = k.shellT > 0 ? GK_SHELL_K : 1, reach = (diving ? GK44.reachDive : k.backpedal ? 0.85 : kj > 0.1 ? 1.3 : GK44.reach) * ESCALA * shK, d = Math.hypot(ball.pos.x - k.pos.x, ball.pos.y - k.pos.y);   // reculando llega peor
  const reachZ = (diving ? GK_REACH_DIVE : GK_REACH) * ESCALA * (k.sf.sal || 1) * shK + kj + hd * 1.15;     // por encima de esto (vaselina) no llega
  if (d > reach + BR || ball.pos.z - BR > reachZ) return;
  // solo dentro de su área grande aprox.
  const s = k.team === 0 ? -1 : 1;
  if (Math.abs(ball.pos.y - s * HL) > 8) return;
  if (ball.owner && ball.owner !== k) {
    if (Math.random() < 0.04) { giveBall(k); sfx.save(); }   // robo en carrera, poco probable por frame
    return;
  }
  const sp = Math.hypot(ball.vel.x, ball.vel.y);
  const pCatch = THREE.MathUtils.clamp(GK44.c0 - sp / GK44.c1, 0.25, 1) * (hd > 0.2 ? 0.45 : 1) * (kj > 0.2 ? 0.75 : 1);   // estirado / en el aire blocca peor
  const edge = Math.min(reachZ - (ball.pos.z - BR), reach + BR - d);   // update 30: en el límite de su alcance solo la roza
  if ((kj > 0.2 || hd > 0.2) && gkPlus() && (hd > 0.2 || Math.abs(ball.pos.x - k.pos.x) > 0.9) && edge < (hd > 0.2 ? 0.5 : 0.3) && Math.random() < (hd > 0.2 ? 0.65 : 0.45)) {
    ball.vel.x *= 0.8; ball.vel.y *= 0.8; ball.vel.z += 0.8; ball.noCatch = k; ball.noCatchT = 0.5; k.kickT = 0.3; sfx.save(); LOG('portero_roza', k, { edge: +edge.toFixed(2) }); return;
  }
  if ((kj > 0.2 || hd > 0.2) && gkPlus() && Math.random() >= pCatch) gkPalm(k, s);
  else if (Math.random() < pCatch) { giveBall(k); ball.pos.z = 1.1; if (sp > 8) { S.saves++; sfx.save(); rotParada(k); } }
  else {
    // despeje / parada a córner
    ball.vel.y = -s * Math.abs(ball.vel.y) * 0.45; ball.vel.x = (Math.random() - 0.5) * 14 + (ball.pos.x - k.pos.x) * 3; ball.vel.z = 4;
    ball.noCatch = k; ball.noCatchT = 0.4; S.saves++; sfx.save(); k.kickT = 0.35; LOG('despeje', k, {}); rotParada(k);
  }
}

// ===================== ESPECIALES (update 29) =====================
// Cada personaje tiene un ESPECIAL único que se carga con el tiempo (ESP_T s). Botón ESPECIAL (brilla cuando está listo),
// tecla R / F en teclado. El bot también los usa (espAI). Se pueden desactivar en AJUSTES (AJ.especiales, activados por defecto).
const ESP_T = 22;   // segundos para cargar el especial
const ESPECIALES = {
  turtobola: { name: 'CAPARAZÓN', desc: 'PORTERO: ante un tiro a puerta se blinda en su caparazón 1,6 s: llega más lejos y se lanza más rápido. Lo usa solo (IA del portero).', need: 'balon', col: '#3fd18b', gk: true },   // update 37: solo portero
  conazo: { name: 'ZONA CORTADA', desc: 'Planta una barrera de conos delante del rival: le corta el paso 3 s.', need: 'cerca', rango: 14, col: '#ff8a2a' },
  calcetrol: { name: 'PESTE A PIES', desc: 'Nube de olor a calcetín: el rival que la cruza va a cámara lenta.', col: '#b6d84a' },
  buton: { name: 'REFLEJOS', desc: 'PORTERO: cuando el rival chuta a su portería, reacciona al instante y llega un 30 % más lejos durante 1,2 s. Lo usa solo (IA del portero).', col: '#ffd23f', gk: true },   // update 37: solo portero · update 42: antes 'BOTÓN DE PAUSA' (congelaba al jugador con un icono II = 'pausa' inesperada)
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
  ajolote: { name: 'REGENERACIÓN', desc: 'Se regenera al instante: se quita cualquier efecto malo (congelado, lento, mareo, resbalón, ciego...), recarga el TURBO al 100 % y durante 4 s el turbo no se gasta y las entradas le resbalan (piel viscosa). Se puede usar aunque esté aturdido.', col: '#ff7ac8' },   // update 34
  rubibot: { name: 'PULSO EMP', desc: 'Descarga electromagnética: el rival cercano se queda sin TURBO ni ESPECIAL (a cero), no los recarga en 3 s y suelta el balón.', need: 'cerca', rango: 7.5, col: '#b59bff' },   // update 36
  frogetto: { name: 'HECHIZO SAPO', desc: 'Convierte al rival en un sapito 2,5 s: encoge, va lento, no puede hacer entradas ni coger el balón.', need: 'cerca', rango: 10, col: '#5dffb4' },   // update 36
  zora: { name: 'RAYO', desc: 'Se teletransporta 6,5 m como un rayo (con el balón si lo lleva) y aturde a quien esté en el camino.', col: '#3dff7a' },   // update 36
  tiburon: { name: 'REMOLINO', desc: 'Abre un remolino a los pies del rival: lo arrastra hacia el centro, lo frena y le hace perder el balón.', col: '#4fc3ff' },   // update 36
  mushom: { name: 'ESPORAS', desc: 'Estornudo de esporas: el rival cercano se marea 3 s (se tambalea en zigzag, va más lento y no puede hacer entradas) y, si lleva el balón, lo suelta.', need: 'cerca', rango: 8, col: '#c77dff' },   // update 37
  cacutu: { name: 'PINCHOS', desc: 'Se eriza 4 s y dispara un anillo de pinchos: pincha a los rivales de alrededor (aturdidos y sueltan el balón) y, mientras dure, quien le haga una entrada o se le pegue se pincha y rebota.', col: '#9be05a' },   // update 37 (t83u)
  kaledy: { name: 'TRALLAZO', desc: 'Con el balón: se planta y suelta un TRALLAZO de hoja seca a la escuadra: sale un 20 % más fuerte, cae de golpe y el portero rival reacciona tarde.', need: 'balon', col: '#ff3b3b' },   // update 47 (t101u)
  dante: { name: 'REGATE MÁGICO', desc: 'Con el balón: 3 s de regate mágico: corre un 30 % más, las entradas no le tocan (no pierde el balón) y deja mareados a los rivales que tenga cerca.', need: 'balon', col: '#6CACE4' },   // update 47 (t104u)
  tubi: { name: 'VENTOSA', desc: 'Dispara el desatascador: se pega al rival 1,5 s y, si lleva el balón, se lo trae. Luego nadie se lo quita en 3 s.', need: 'cerca', rango: 9, col: '#ff4f5e' },   // update 30
};
const ESP = { fx: [], obst: [], zonas: [], decoys: [], lengua: null, tex: {}, usos: [] };
const espOn = () => AJ.especiales !== false;
const espFoe = (a) => S.practice ? null : is2v2() ? espFoe2(a) : (a === user ? rival : a === rival ? user : null);   // update 30: 2 VS 2 -> el que lleva el balón o el más cercano
const espGkFoe = (a) => a.team === 0 ? gkB : gkA;
const espGkOwn = (a) => a.team === 0 ? gkA : gkB;
function espReset(a) { Object.assign(a, { stickT: 0, freezeT: 0, slowT: 0, invertT: 0, slipT: 0, ghostT: 0, flyT: 0, scaredT: 0, blindT: 0, chargeT: 0, downT: 0, slipCd: 0, regenT: 0, magiaT: 0, toadT: 0, empT: 0, mareoT: 0, spikeT: 0 }); if (a._toadS && a._toadS !== 1) { a._toadS = 1; if (a.model) a.model.scale.setScalar(ESCALA * (a.charScale || 1)); } }
// ---- texturas generadas (una vez) ----
function espTex(k) {
  if (ESP.tex[k]) return ESP.tex[k];
  const cv = document.createElement('canvas'), S2 = k === 'brick' ? 256 : 128; cv.width = cv.height = S2; const c = cv.getContext('2d');
  if (k === 'soft') { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }
  else if (k === 'puff') { for (let i = 0; i < 7; i++) { const x = 34 + Math.random() * 60, y = 34 + Math.random() * 60, r = 22 + Math.random() * 18; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.6, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); } }
  else if (k === 'charco') { const g = c.createRadialGradient(64, 64, 10, 64, 64, 62); g.addColorStop(0, 'rgba(230,250,140,.95)'); g.addColorStop(0.7, 'rgba(190,220,60,.85)'); g.addColorStop(0.92, 'rgba(120,150,30,.7)'); g.addColorStop(1, 'rgba(120,150,30,0)'); c.fillStyle = g; c.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = 50 + Math.sin(i * 2.7) * 8 + Math.cos(i * 1.3) * 5; c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } c.fill(); c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(48, 46, 14, 6, -0.5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(80, 76, 7, 3, -0.5, 0, Math.PI * 2); c.fill(); }
  else if (k === 'brick') { c.fillStyle = '#7a3a24'; c.fillRect(0, 0, 256, 256); const bh = 32, bw = 64; for (let r = 0; r < 8; r++) for (let i = -1; i < 5; i++) { const x = i * bw + (r % 2 ? bw / 2 : 0); const v = 150 + Math.floor(Math.random() * 50); c.fillStyle = `rgb(${v + 40},${Math.floor(v * 0.45)},${Math.floor(v * 0.3)})`; c.fillRect(x + 3, r * bh + 3, bw - 6, bh - 6); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x + 3, r * bh + 3, bw - 6, 5); } }
  else if (k === 'burbuja') { const g = c.createRadialGradient(56, 54, 4, 64, 64, 60); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(0.72, 'rgba(255,255,255,.22)'); g.addColorStop(0.9, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.ellipse(44, 40, 13, 8, -0.7, 0, Math.PI * 2); c.fill(); }   // update 34: burbuja (ajolote)
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
    s.position.copy(g2tS(x + ox, y + oy, z + oz)); const v = new THREE.Vector3(ox, rise + Math.random() * rise, -oy).multiplyScalar(0.8);
    const s0 = s.scale.x;
    espFx(s, life * (0.7 + Math.random() * 0.5), (k, o, dt) => { o.position.addScaledVector(v, dt); o.scale.setScalar(s0 * (1 + k * 0.8)); o.material.opacity = 0.85 * (1 - k); });
  }
}
function espShock(x, y, color, r1, life, z = 0.08, width = 0.35) {
  const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.copy(g2tS(x, y, z)); m.renderOrder = 4;
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
  tubi: () => { espTone(260, 0.12, { type: 'square', vol: 0.05, f2: 900 }); espTone(170, 0.4, { type: 'sine', vol: 0.12, f2: 420, vib: 18, vibF: 12, delay: 0.04 }); },
  ajolote: () => { [0, 0.07, 0.15, 0.22, 0.3].forEach((d, i) => espTone(380 + i * 140, 0.09, { type: 'sine', vol: 0.09, f2: 900 + i * 180, delay: d })); espNoise(0.5, { f: 900, f2: 2600, q: 2, vol: 0.06, delay: 0.05 }); espTone(660, 0.6, { type: 'triangle', vol: 0.05, f2: 1320, att: 0.2, delay: 0.3 }); },   // update 34: burbujas
  rubibot: () => { espTone(1800, 0.05, { type: 'square', vol: 0.05 }); espTone(120, 0.5, { type: 'sawtooth', vol: 0.09, f2: 40 }); espNoise(0.45, { f: 3000, f2: 400, q: 1.5, vol: 0.09 }); },   // update 36
  frogetto: () => { [0, 0.08, 0.16, 0.24].forEach((d, i) => espTone(900 + i * 260, 0.12, { type: 'sine', vol: 0.06, delay: d })); espTone(140, 0.22, { type: 'square', vol: 0.08, f2: 90, delay: 0.32, vib: 20, vibF: 30 }); },   // conjuro + ¡croac!
  zora: () => { espNoise(0.25, { f: 5000, f2: 800, q: 0.7, vol: 0.16 }); espTone(2400, 0.18, { type: 'sawtooth', vol: 0.05, f2: 300 }); espNoise(0.5, { f: 200, q: 0.8, vol: 0.12, type: 'lowpass', delay: 0.06 }); },
  tiburon: () => { espNoise(1.0, { f: 500, f2: 1600, q: 2.5, vol: 0.12 }); espTone(90, 0.8, { type: 'sine', vol: 0.12, f2: 60, vib: 6, vibF: 5 }); },
  dante: () => { espTone(880, 0.09, { type: 'triangle', vol: 0.08 }); espTone(1175, 0.09, { type: 'triangle', vol: 0.08, delay: 0.08 }); espTone(1568, 0.18, { type: 'triangle', vol: 0.08, delay: 0.16, vib: 6 }); espNoise(0.25, { f: 3000, f2: 6000, q: 0.7, vol: 0.05, delay: 0.05 }); },   // update 47: destello mágico
  kaledy: () => { espNoise(0.16, { f: 900, f2: 320, q: 1.2, vol: 0.12 }); espTone(470, 0.55, { type: 'sawtooth', vol: 0.05, f2: 900, vib: 9, vibF: 7, delay: 0.05 }); },   // update 47: trallazo
  cacutu: () => { espTone(1400, 0.06, { type: 'square', vol: 0.05, f2: 2600 }); setTimeout(() => espNoise(0.25, { f: 5200, f2: 2600, q: 2.5, vol: 0.12 }), 40); espTone(300, 0.25, { type: 'triangle', vol: 0.06, f2: 180 }); },   // update 37 (t83u): ¡TSHING! de pinchos
  pincho: () => espTone(1900, 0.05, { type: 'square', vol: 0.04, f2: 900 }),
  mushom: () => { espNoise(0.12, { f: 2400, f2: 5200, q: 1.2, vol: 0.12 }); setTimeout(() => espNoise(0.5, { f: 6000, f2: 1200, q: 0.8, vol: 0.16 }), 130); espTone(520, 0.35, { type: 'sine', vol: 0.05, f2: 260 }); },   // update 37: ¡a-a-ACHÍS! de esporas
  plop: () => { espNoise(0.08, { f: 600, vol: 0.2, type: 'lowpass' }); espTone(520, 0.14, { type: 'sine', vol: 0.15, f2: 150 }); },
  puf: () => espNoise(0.3, { f: 1500, f2: 300, vol: 0.1 }),
};
// ---- ¿se puede usar ahora? ----
function espReady(a) { return !!(a && !a.keeper && espOn() && ESPECIALES[a.charKey] && a.esp >= 1); }
function espCanUse(a) {
  if (!espReady(a) || S.mode !== 'play') return false;
  if (a.charKey !== 'ajolote' && (a.stun > 0 || a.freezeT > 0 || a.slipT > 0 || a.chargeT > 0)) return false;   // update 34: REGENERACIÓN se puede usar aturdido
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
  ESP.obst.length = ESP.zonas.length = ESP.fx.length = ESP.decoys.length = 0; ESP.lengua = null; espVentosaClear();
  for (const k of [gkA, gkB]) if (k) { k.decoy = null; k.fetidaT = 0; }
  if (typeof trampa !== 'undefined' && trampa) { trampa = null; if (trampaArrow) trampaArrow.visible = false; }
  for (const a of actors) { espReset(a); espGhostVis(a, false); }
  espVelo(0); espRuido(0);
}
// ---- efectos por personaje ----
const ESP_FN = {
  turtobola(a, foe) {
    // update 31: NO chuta solo. Usuario: apunta (arrastrar desde ESPECIAL, o tocar el campo / 2º toque) y lanza un balón FALSO; sigue con el suyo.
    // Bot: lanza el falso hacia un palo y sigue conduciendo; chuta al otro palo un instante después.
    if (AJ.trampaApunta !== false) {
      if (a === user && !window.__game.userBot) { trampaStart(a); return true; }
      const gk = espGkFoe(a), gy = goalCenter(a.team).y, sd = gk && Math.abs(gk.pos.x) > 0.3 ? Math.sign(gk.pos.x) : (a.pos.x > 0 ? -1 : 1);
      const tgt = { x: sd * (GW - 1.0) * (0.8 + Math.random() * 0.4), y: gy };   // falso al palo del portero (que se lance)...
      espSpawnDecoy(a, tgt); a.trampaShot = { at: S.t + 0.35 + Math.random() * 0.2, x: -sd * (GW - 1.2) };   // ...y el de verdad al otro
      return true;
    }
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
      g.position.copy(g2tS(p.x, p.y)); g.scale.setScalar(0.01);
      espAddObst({ kind: 'cono', x: p.x, y: p.y, r: 0.9, t: 3.0, life: 3.0, blocks: foe.team, mesh: g, delay: i * 0.07 });
    });
    // cinta entre conos
    const tape = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.04), new THREE.MeshBasicMaterial({ map: espTex('cono') }));
    tape.position.copy(g2tS(c.x, c.y, 1.3)); tape.rotation.y = Math.atan2(side.y, side.x) * 1; tape.rotation.y = -Math.atan2(side.y, side.x);
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
    g.position.copy(g2tS(p.x, p.y));
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
    for (let i = 0; i < 8; i++) { const s = espSprite(espTex('txt:♪:#ff6ee0'), 0xffffff, 1.1); const an = i / 8 * Math.PI * 2; const v = new THREE.Vector3(Math.cos(an) * 6, 2.5, Math.sin(an) * 6); s.position.copy(g2tS(a.pos.x, a.pos.y, 1.6)); espFx(s, 0.9, (k, o, dt) => { o.position.addScaledVector(v, dt); o.material.opacity = 1 - k; }); }
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
    p.x = THREE.MathUtils.clamp(p.x, -SIDE_X + 2, SIDE_X - 2); p.y = THREE.MathUtils.clamp(p.y, -WY + 2, WY - 2);
    const m = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40), new THREE.MeshBasicMaterial({ map: espTex('charco'), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(g2tS(p.x, p.y, 0.05)); m.renderOrder = 3; m.scale.setScalar(0.01);
    espAddZona({ kind: 'charco', x: p.x, y: p.y, r: 2.3, t: 7, life: 7, team: a.team, mesh: m });
    for (let i = 0; i < 10; i++) { const s = espSprite(espTex('soft'), 0xd8ef4a, 0.5); const v = new THREE.Vector3((Math.random() - 0.5) * 6, 5 + Math.random() * 3, (Math.random() - 0.5) * 6); s.position.copy(g2tS(p.x, p.y, 0.3)); espFx(s, 0.7, (k, o, dt) => { v.y -= 14 * dt; o.position.addScaledVector(v, dt); o.material.opacity = 1 - k; }); }
    return true;
  },
  mofeta(a) {   // nube fétida en la portería rival: su portero reacciona tarde al siguiente tiro
    const gk = espGkFoe(a); if (!gk) return false;
    gk.fetidaT = 9;
    const gy = goalCenter(a.team).y, s = Math.sign(gy);
    const g = new THREE.Group();
    for (let i = 0; i < 12; i++) { const sp = espSprite(espTex('puff'), i % 3 ? 0x9a3fd6 : 0x6fbf3a, 2.6 + Math.random() * 1.4, 0.7); sp.position.set((Math.random() - 0.5) * 2 * GW, 0.8 + Math.random() * 2.6, s * (1 + Math.random() * 3.5)); sp.userData.ph = Math.random() * 6; g.add(sp); }
    g.position.copy(g2tS(0, gy));
    espAddZona({ kind: 'fetida', x: 0, y: gy - s * 2, r: 0, t: 9, life: 9, team: a.team, mesh: g, gk });
    // bomba que vuela hasta la portería
    const b = espSprite(espTex('soft'), 0xb04cff, 1.2, 1, true); const p0 = g2t(a.pos.x, a.pos.y, 1.5), p1 = g2t(0, gy, 1.5);
    espFx(b, 0.45, (k, o) => { o.position.lerpVectors(p0, p1, k); o.position.y += Math.sin(Math.PI * k) * 5; });
    espIcon(gk, 'ZzZ', '#c58bff', 3, 1.5);
    return true;
  },
  pantera(a) { a.ghostT = 2.0; espGhostVis(a, true); return true; },
  dante(a) {   // update 47 (t104u): REGATE MÁGICO -> 3 s de regate mágico (×1,3, entradas no le tocan) y marea 1,2 s a los rivales de campo a menos de 3,5 m
    if (ball.owner !== a) return false;
    a.magiaT = 3.0; let n = 0;
    for (const f of foesOf(a)) if (f.pos.distanceTo(a.pos) < 3.5) { f.mareoT = Math.max(f.mareoT || 0, 1.2); f.dashT = 0; f.kickPending = null; f.sprinting = false; n++; espIcon(f, '?', '#6CACE4', 1.0, 1.1); }
    espIcon(a, '¡REGATE MÁGICO!', '#6CACE4', 1.3, 1.4); espShock(a.pos.x, a.pos.y, 0x6cace4, 3.5, 0.5, 0.1, 0.3); setTimeout(() => espShock(a.pos.x, a.pos.y, 0xffffff, 2.6, 0.4, 0.12, 0.22), 120);
    LOG('regate_magico', a, { n }); return true;
  },
  kaledy(a) {   // update 47 (t101u): TRALLAZO -> trallazo de hoja seca al palo contrario del portero (×1,2 de velocidad, cae de golpe) y el portero rival reacciona tarde
    if (ball.owner !== a) return false;
    const gk = espGkFoe(a), gy = goalCenter(a.team).y;
    const sd = gk && Math.abs(gk.pos.x) > 0.3 ? -Math.sign(gk.pos.x) : (Math.random() < 0.5 ? -1 : 1);
    a.trallazoShot = 1;
    shoot(a, new THREE.Vector2(sd * (GW - 1.0) - a.pos.x, gy - a.pos.y), 1, a === user);
    if (ball.owner === a && !a.kickPending) { a.trallazoShot = 0; return false; }   // no ha podido chutar (congelado, resbalando…)
    if (gk) gk.fetidaT = Math.max(gk.fetidaT || 0, 1.4);
    espIcon(a, '¡TRALLAZO!', '#ff3b3b', 1.3, 1.5); espShock(a.pos.x, a.pos.y, 0xff3b3b, 3.2, 0.5, 0.1, 0.3);
    return true;
  },
  ajolote(a) {   // update 34: REGENERACIÓN -> limpia estados malos, turbo lleno y 4 s de turbo infinito + piel viscosa (las entradas resbalan)
    const malos = ['stun', 'freezeT', 'slowT', 'invertT', 'slipT', 'scaredT', 'blindT', 'downT'].filter((k) => a[k] > 0);
    for (const k of ['stun', 'freezeT', 'slowT', 'invertT', 'slipT', 'scaredT', 'blindT', 'downT']) a[k] = 0;
    a.slipCd = 1.5; a.energy = 1; a.regenT = 4.0;
    if (a === user) { espVelo(0); espRuido(0); }
    espShock(a.pos.x, a.pos.y, 0x8fe6ff, 4.2, 0.6, 0.1, 0.3); setTimeout(() => espShock(a.pos.x, a.pos.y, 0xff7ac8, 3.4, 0.5, 0.12, 0.25), 140);
    for (let i = 0; i < 14; i++) { const s = espSprite(espTex('burbuja'), i % 3 ? 0xbff4ff : 0xffb3e0, 0.35 + Math.random() * 0.45, 0.95); const an = i / 14 * Math.PI * 2, r = 0.6 + Math.random() * 0.8; const v = new THREE.Vector3(Math.cos(an) * 1.2, 2.2 + Math.random() * 2.2, Math.sin(an) * 1.2); s.position.copy(g2tS(a.pos.x + Math.cos(an) * r, a.pos.y - Math.sin(an) * r, 0.4 + Math.random() * 1.2)); espFx(s, 1.0 + Math.random() * 0.4, (k, o, dt) => { o.position.addScaledVector(v, dt); o.position.x += Math.sin(k * 12 + an) * 0.01; o.material.opacity = 0.95 * (1 - k * k); }); }
    espIcon(a, '+', '#ff7ac8', 1.2, 1.6);
    LOG('regeneracion', a, { quita: malos });
    return true;
  },
  murcielago(a, foe) {
    a.flyT = 2.2;
    if (foe === user) espVelo(1.7); else if (foe) foe.blindT = 1.7;
    for (let i = 0; i < 7; i++) { const s = espSprite(espTex('bat'), 0xffffff, 1.3); const an = Math.random() * Math.PI * 2; const v = new THREE.Vector3(Math.cos(an) * 7, 3 + Math.random() * 3, Math.sin(an) * 7); s.position.copy(g2tS(a.pos.x, a.pos.y, 2)); espFx(s, 1.1, (k, o, dt) => { o.position.addScaledVector(v, dt); o.material.opacity = 1 - k * k; }); }
    if (foe) espIcon(foe, '•_•', '#ff4d6d', 1.7, 1.4);
    return true;
  },
  tubi(a, foe) {   // update 30: VENTOSA -> el desatascador vuela hasta la cabeza del rival y se queda pegado
    if (!foe) return false;
    espVentosaClear();
    const g = new THREE.Group();
    const cupM = new THREE.MeshLambertMaterial({ color: 0xd62839, side: THREE.DoubleSide });
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cupM); cup.rotation.x = -Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 8, 24), new THREE.MeshLambertMaterial({ color: 0xa81a2a }));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.0, 10), new THREE.MeshLambertMaterial({ color: 0xc8955a })); stick.rotation.x = Math.PI / 2; stick.position.z = -0.85;
    const ol = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x14193a, side: THREE.BackSide })); ol.rotation.x = -Math.PI / 2;
    g.add(ol); g.add(cup); g.add(rim); g.add(stick); scene.add(g);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), new THREE.MeshBasicMaterial({ color: 0xff8a95 }));
    band.geometry.translate(0, 0.5, 0); band.geometry.rotateX(Math.PI / 2); scene.add(band);
    ESP.ventosa = { a, foe, t: 0, g, band, hit: false, pull: false };
    return true;
  },
  // ---- update 36 ----
  rubibot(a, foe) {   // PULSO EMP: turbo y especial del rival a cero, 3 s sin recargar, suelta el balón
    if (!foe) return false;
    foe.esp = 0; foe.energy = 0; foe.empT = 3.0; foe.stun = Math.max(foe.stun, 0.45); foe.dashT = 0; foe.kickPending = null; foe.sprinting = false;
    if (ball.owner === foe) { const d = foe.pos.clone().sub(a.pos).normalize(); ball.owner = null; ball.vel.set(d.x * 3, d.y * 3, 3.2); ball.noCatch = foe; ball.noCatchT = 0.6; }
    for (let i = 0; i < 3; i++) setTimeout(() => espShock(a.pos.x, a.pos.y, i === 1 ? 0xff7ad9 : 0x9b7bff, 8, 0.5, 0.15 + i * 0.4, 0.12), i * 110);
    espPuffs(foe.pos.x, foe.pos.y, 1.2, 0xb59bff, 8, 1.2, 1.4, 0.5);
    espIcon(foe, 'EMP', '#b59bff', 1.6, 1.5);
    if (foe === user) espRuido(0.4);
    LOG('emp', a, {}); return true;
  },
  frogetto(a, foe) {   // HECHIZO SAPO
    if (!foe) return false;
    foe.toadT = 2.5; foe.dashT = 0; foe.kickPending = null; foe.dribbleT = 0; foe.pm = null; foe.pmQ = null;
    if (ball.owner === foe) { ball.owner = null; ball.vel.set(foe.face.x * 2.5, foe.face.y * 2.5, 2.4); }
    ball.noCatch = foe; ball.noCatchT = 2.5;
    espPuffs(foe.pos.x, foe.pos.y, 1.0, 0x8a5cff, 12, 1.6, 1.6, 0.7); espPuffs(foe.pos.x, foe.pos.y, 1.4, 0x5dffb4, 6, 1.2, 1.2, 0.6);
    const s = espSprite(espTex('soft'), 0x5dffb4, 0.9, 1, true), p0 = g2t(a.pos.x, a.pos.y, 1.8), p1 = g2t(foe.pos.x, foe.pos.y, 1.2);
    espFx(s, 0.3, (k, o) => { o.position.lerpVectors(p0, p1, k); o.position.y += Math.sin(Math.PI * k) * 2; });
    espIcon(foe, 'CROAC', '#5dffb4', 2.5, 1.5);
    LOG('sapo', a, {}); return true;
  },
  zora(a, foe) {   // RAYO: teletransporte 6,5 m (con balón) y aturde a quien esté en el camino
    const md = a === user ? moveDir() : null;
    let dir = md ? md.clone() : a.face.clone();
    if (a !== user) { dir = goalCenter(a.team).sub(a.pos); if (foe && ball.owner !== a) dir = (ball.owner === foe ? foe.pos : new THREE.Vector2(ball.pos.x, ball.pos.y)).clone().sub(a.pos); }
    if (dir.lengthSq() < 1e-6) dir.set(0, a.team === 0 ? 1 : -1);
    dir.normalize();
    const p0 = a.pos.clone(), p1 = a.pos.clone().addScaledVector(dir, 6.5);
    p1.x = THREE.MathUtils.clamp(p1.x, -HW + 0.8, HW - 0.8); p1.y = THREE.MathUtils.clamp(p1.y, -HL + 2.5, HL - 2.5);   // dentro del campo (nunca dentro de la portería)
    const seg = p1.clone().sub(p0), L2 = Math.max(1e-6, seg.lengthSq());
    a.pos.copy(p1); a.vel.copy(dir).multiplyScalar(5); a.face.copy(dir); a.dashT = 0; a.dribbleT = 0;
    if (a.root) a.root.position.copy(g2tS(a.pos.x, a.pos.y, 0));
    if (foe) {
      const t = THREE.MathUtils.clamp(foe.pos.clone().sub(p0).dot(seg) / L2, 0, 1), dd = foe.pos.distanceTo(p0.clone().addScaledVector(seg, t));
      if (dd < 1.5) { foe.stun = Math.max(foe.stun, 0.9); foe.kickPending = null; foe.dashT = 0; if (ball.owner === foe) giveBall(a); espIcon(foe, 'ZAS', '#3dff7a', 1.1, 1.4); LOG('rayo_golpe', a, {}); }
    }
    const n = 9;
    for (let i = 0; i <= n; i++) { const k = i / n, j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 1.1; espPuffs(p0.x + seg.x * k - dir.y * j, p0.y + seg.y * k + dir.x * j, 1.0 + Math.random() * 0.6, i % 2 ? 0xeaffd0 : 0x3dff7a, 2, 0.6, 0.9, 0.35, 0.15); }
    espShock(p0.x, p0.y, 0x3dff7a, 2.6, 0.4); espShock(p1.x, p1.y, 0xeaffd0, 3.2, 0.45);
    LOG('rayo', a, { L: +Math.sqrt(L2).toFixed(2) }); return true;
  },
  cacutu(a) {   // update 37 (t83u): PINCHOS -> anillo de pinchos (pincha a los de alrededor) y 4 s erizado
    a.spikeT = CACTUS_T; a._spikeFx = 0;
    const foes = fieldPlayers().filter((o) => o && o.team !== a.team);
    let n = 0; for (const o of foes) if (o.pos.distanceTo(a.pos) < CACTUS_R) { espPinch(a, o, false); n++; }
    espSpikeRing(a, CACTUS_R, 18, 0.32);
    espShock(a.pos.x, a.pos.y, 0x9be05a, CACTUS_R, 0.4); espPuffs(a.pos.x, a.pos.y, 0.4, 0xd8c79a, 8, 1.4, 1.0, 0.5, 0.3);
    LOG('pinchos', a, { n }); return true;
  },
  mushom(a, foe) {   // update 37: ESPORAS -> el rival se marea 3 s (zigzag, lento, sin entradas) y suelta el balón
    if (!foe) return false;
    foe.mareoT = 3.0; foe.dashT = 0; foe.kickPending = null; foe.dribbleT = 0; foe.pm = null; foe.pmQ = null; foe.sprinting = false;
    if (ball.owner === foe) { const an = Math.atan2(foe.face.y, foe.face.x) + (Math.random() < 0.5 ? 1.4 : -1.4); ball.owner = null; ball.vel.set(Math.cos(an) * 3.2, Math.sin(an) * 3.2, 1.8); ball.noCatch = foe; ball.noCatchT = 0.9; }
    const s0 = espSprite(espTex('soft'), 0xc77dff, 1.0, 0.9, true), p0 = g2t(a.pos.x, a.pos.y, 1.6), p1 = g2t(foe.pos.x, foe.pos.y, 1.5);
    espFx(s0, 0.35, (k, o) => { o.position.lerpVectors(p0, p1, k); o.scale.setScalar(1 + 2.2 * k); o.material.opacity = 0.9 * (1 - k * 0.6); });
    espPuffs(foe.pos.x, foe.pos.y, 1.5, 0xc77dff, 14, 1.8, 1.4, 0.8); espPuffs(a.pos.x, a.pos.y, 1.6, 0xf2e6ff, 6, 1.0, 1.0, 0.5);
    espIcon(foe, '@_@', '#c77dff', 3.0, 1.6);
    LOG('esporas', a, {}); return true;
  },
  tiburon(a, foe) {   // REMOLINO a los pies del rival (o delante si está lejos)
    let p = foe && foe.pos.distanceTo(a.pos) < 15 ? foe.pos.clone() : a.pos.clone().addScaledVector(a.face, 4);
    p.x = THREE.MathUtils.clamp(p.x, -SIDE_X + 2, SIDE_X - 2); p.y = THREE.MathUtils.clamp(p.y, -WY + 2, WY - 2);
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.55 + i * 0.75, 0.85 + i * 0.75, 40, 1, i * 0.6, Math.PI * 1.45), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x4fc3ff : 0xd8f4ff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 3; g.add(m);
    }
    g.position.copy(g2tS(p.x, p.y, 0.06)); g.scale.setScalar(0.01);
    espAddZona({ kind: 'remolino', x: p.x, y: p.y, r: 3.4, t: 3.0, life: 3.0, team: a.team, mesh: g });
    espPuffs(p.x, p.y, 0.3, 0xbfeaff, 10, 1.4, 1.2, 0.6);
    LOG('remolino', a, {}); return true;
  },
  ladri(a) {   // muro delante de su portería, 5 s
    const s = a.team === 0 ? -1 : 1, y = s * (HL - 3.2), W2 = GW + 1.2;
    const geo = new THREE.BoxGeometry(W2 * 2, 2.4, 0.7); const tx = espTex('brick').clone(); tx.needsUpdate = true; tx.repeat.set(W2 * 2 / 2.6, 1.2);
    const m = new THREE.Mesh(geo, [new THREE.MeshLambertMaterial({ color: 0x8a3e24 }), new THREE.MeshLambertMaterial({ color: 0x8a3e24 }), new THREE.MeshLambertMaterial({ color: 0xa04a2a }), new THREE.MeshLambertMaterial({ color: 0x5a2616 }), new THREE.MeshLambertMaterial({ map: tx }), new THREE.MeshLambertMaterial({ map: tx })]);
    const ol = new THREE.Mesh(new THREE.BoxGeometry(W2 * 2 + 0.12, 2.52, 0.82), new THREE.MeshBasicMaterial({ color: 0x14193a, side: THREE.BackSide })); m.add(ol);
    m.position.copy(g2tS(0, y, -1.3)); shadowFlags(m, true, true);
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
    if (o.userData.shadowProxy) return;
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
  if (a.toadT > 0) m *= 0.62;   // update 36: sapito
  if (a.slowT > 0) m *= 0.45;
  if (a.ghostT > 0) m *= 1.55;
  if (a.magiaT > 0) m *= 1.3;   // update 47: REGATE MÁGICO (Dante)
  if (a.flyT > 0) m *= 1.15;
  return m;
}
// IA: dirección errática (interferencia) / ciega (vuelo nocturno)
function espAiWish(a, wish, dt) {
  if (a.invertT > 0) { a._errA = (a._errA || 0) + dt * (4 + Math.sin(S.t * 7) * 3); return new THREE.Vector2(Math.cos(a._errA), Math.sin(a._errA * 1.3)).normalize(); }
  if (a.blindT > 0) { return wish.clone().rotateAround(new THREE.Vector2(), Math.sin(S.t * 3) * 1.4).multiplyScalar(0.55); }
  return wish;
}
// ---- update 37 (t83u): PINCHOS de Cacutu ----
const CACTUS_T = 4.0, CACTUS_R = 3.2, CACTUS_TOQUE = 1.7, CACTUS_STUN = 1.1;
let _spikeGeo = null, _spikeMat = null;
function espSpikeMesh() {   // pincho: cono fino verde claro con punta amarilla (toon, sin luces)
  if (!_spikeGeo) { _spikeGeo = new THREE.ConeGeometry(0.11, 0.75, 6); _spikeGeo.rotateX(Math.PI / 2); _spikeMat = new THREE.MeshBasicMaterial({ color: 0xd9f78a, transparent: true, opacity: 1, depthWrite: false }); _spikeMat.userData.keep = true; }
  const m = new THREE.Mesh(_spikeGeo, _spikeMat.clone()); m.renderOrder = 5; return m;
}
function espSpikeRing(a, r, n, life) {   // anillo de pinchos que sale disparado alrededor
  const z = 1.1 * ESCALA, p0 = g2t(a.pos.x, a.pos.y, z), off = Math.random() * Math.PI;
  for (let i = 0; i < n; i++) {
    const an = off + i / n * Math.PI * 2, dx = Math.cos(an), dy = Math.sin(an), m = espSpikeMesh();
    m.position.copy(p0);
    m.lookAt(new THREE.Vector3(p0.x + dx, z, p0.z - dy));
    espFx(m, life, (k, o) => { const d = 0.5 + (r - 0.5) * (1 - Math.pow(1 - k, 2)); o.position.set(p0.x + dx * d, z - 0.5 * k * k, p0.z - dy * d); o.material.opacity = k > 0.7 ? (1 - k) / 0.3 : 1; });
  }
}
function espPinch(a, o, entrada) {   // 'a' (Cacutu) pincha a 'o': aturdido, rebota hacia atrás y suelta el balón
  if (!o || o.keeper || (o._pinchAt != null && S.t - o._pinchAt < 0.9)) return false;
  o._pinchAt = S.t;
  const dx = o.pos.x - a.pos.x, dy = o.pos.y - a.pos.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  o.stun = Math.max(o.stun || 0, entrada ? CACTUS_STUN * 1.25 : CACTUS_STUN); o.dashT = 0; o.kickPending = null; o.dribbleT = 0; o.pm = null; o.pmQ = null; o.sprinting = false;
  if (o.vel) o.vel.set(ux * 7, uy * 7);
  o.pos.x = THREE.MathUtils.clamp(o.pos.x + ux * 0.6, -SIDE_X + PR, SIDE_X - PR); o.pos.y += uy * 0.6;
  if (ball.owner === o) {
    if (a.pos.distanceTo(o.pos) < 2.4 && !a.stun) giveBall(a);
    else { ball.owner = null; ball.vel.set(ux * 4, uy * 4, 1.5); ball.noCatch = o; ball.noCatchT = 0.9; }
  }
  espIcon(o, '¡AY!', '#9be05a', 1.1, 1.4); espPuffs(o.pos.x, o.pos.y, 1.3, 0xd9f78a, 5, 0.9, 0.7, 0.4, 0.4, true);
  (espSfx.pincho || (() => {}))();
  LOG('pinchazo', a, { vs: NAME(o), entrada: !!entrada }); return true;
}
function espSpikeTick(a, dt, playing) {   // mientras está erizado: aura de pinchos y pincha a quien se le pega
  if ((a._spikeFx = (a._spikeFx || 0) - dt) <= 0) { a._spikeFx = 0.45; espSpikeRing(a, 1.25, 10, 0.22); espShock(a.pos.x, a.pos.y, 0x9be05a, 1.5, 0.3); }
  if (!playing || S.mode !== 'play') return;
  for (const o of fieldPlayers()) if (o && o.team !== a.team && !(o.stun > 0) && o.pos.distanceTo(a.pos) < CACTUS_TOQUE) espPinch(a, o, false);
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
    case 'ajolote': want = a.stun > 0.25 || a.freezeT > 0.25 || a.slowT > 0.3 || a.invertT > 0.3 || a.blindT > 0.3 || a.slipT > 0.3 || (myBall && d < 5 && a.energy < 0.35) || (oppBall && d < 9 && a.energy < 0.25); break;   // update 34
    case 'rubibot': want = d < 7 && (oppBall || (opp && opp.esp > 0.7 && d < 5)); break;   // update 36
    case 'frogetto': want = (oppBall && d < 9.5) || (opp && opp.esp > 0.9 && d < 6); break;
    case 'zora': want = (myBall && d < 5.5 && dG > 9 && dG < 48) || (oppBall && d > 3 && d < 6.5); break;
    case 'tiburon': want = oppBall && d < 11; break;
    case 'mushom': want = opp && d < 7.5 && (oppBall || (myBall && d < 3.5)); break;   // update 37
    case 'cacutu': want = opp && ((oppBall && d < 3.0) || (myBall && d < 3.2) || (opp.dashT > 0 && d < 4.5) || (!ball.owner && bD < 3 && d < 3)); break;   // update 37 (t83u)
    case 'tubi': want = (oppBall && d > 1.5 && d < 8.5) || (myBall && d < 3 && dG < 24); break;
    case 'kaledy': want = myBall && dG > 7 && dG < 26; break;   // update 47
    case 'dante': want = myBall && d < 4.5 && dG < 34; break;   // update 47: con el rival encima
  }
  if (want && Math.random() < 0.7) espUse(a, true);
}
// ---- update 37: ESPECIAL DE PORTERO (Butón / Turtobola: siempre los usa la IA del portero, también el tuyo) ----
// BUTÓN · REFLEJOS (update 42; antes BOTÓN DE PAUSA, que congelaba al que entraba a tirar): tiro rival -> reacción inmediata y alcance ×1,3 1,2 s.
// TURTOBOLA · CAPARAZÓN: tiro rival hacia su portería -> se blinda 1,6 s (alcance ×1,3, estirada ×1,3, reacción inmediata).
const GK_SHELL_T = 1.6, GK_SHELL_K = 1.3, GK_REFLEJO_T = 1.2;
// update 44: en PRÁCTICA no hay porteros (ocultos y aparcados fuera): su especial NUNCA salta si el portero no está en el campo.
const gkEnCampo = (k) => !!k && !S.practice && k.root && k.root.visible && actors.includes(k) && Math.abs(k.pos.y) < HL + 6;
function gkEspUpdate(dt, playing) {
  for (const k of [gkA, gkB]) {
    if (!k || !isGK(k.charKey)) continue;
    if (!gkEnCampo(k)) { k.shellT = 0; continue; }
    if (k.shellT > 0) k.shellT = Math.max(0, k.shellT - dt);
    if (!playing || !espOn() || S.mode !== 'play') continue;
    if (k.esp < 1) { k.esp = Math.min(1, k.esp + dt / ESP_T); continue; }
    k._espAiT = (k._espAiT || 0) - dt; if (k._espAiT > 0) continue; k._espAiT = 0.15;
    const s = k.team === 0 ? -1 : 1, goalY = s * HL;
    {   // update 42: Butón y Turtobola se activan con un tiro rival a su portería (Butón ya no congela a nadie)
      const lt = ball.lastTouch;
      if (!ball.owner && lt && lt.team !== k.team && ball.vel.y * s > 6 && Math.abs(goalY - ball.pos.y) < 24 && Math.abs(ball.pos.x) < GW + 8) gkEspFire(k, null);
    }
  }
}
function gkEspFire(k, foe) {
  if (!gkEnCampo(k)) return false;   // update 44
  const e = ESPECIALES[k.charKey]; k.esp = 0; k.espUsedT = S.t;
  if (k.charKey === 'buton') {   // update 42: REFLEJOS: reacción inmediata y más alcance 1,2 s, con un destello amarillo (sin congelar, sin icono II)
    k.shellT = GK_REFLEJO_T; k.react = 0;
    for (let i = 0; i < 2; i++) setTimeout(() => espShock(k.pos.x, k.pos.y, '#ffd23f', 3.2, 0.35, 0.05, 0.1), i * 160);
    espPuffs(k.pos.x, k.pos.y, 0.6, 0xfff1a0, 8, 2.2, 1.1, 0.6, 0.3);
  } else {
    k.shellT = GK_SHELL_T; k.react = 0;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25 * ESCALA, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3fd18b, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.25 * ESCALA, 0.07, 8, 40), new THREE.MeshBasicMaterial({ color: 0x14193a })); rim.rotation.x = Math.PI / 2; dome.add(rim);
    espFx(dome, GK_SHELL_T, (q, o) => { o.material.opacity = 0.32 * (q < 0.08 ? q / 0.08 : q > 0.85 ? (1 - q) / 0.15 : 1); o.scale.setScalar(1 + 0.04 * Math.sin(q * 30)); }, k.root);
    espPuffs(k.pos.x, k.pos.y, 0.6, 0x9ff0c8, 8, 2.2, 1.1, 0.6, 0.3);
  }
  (espSfx[k.charKey] || espSfx.listo)();
  showBanner('¡' + e.name + '!', k.team === 0 ? 'bAzul esp' : 'bRojo esp', 1000);
  espShock(k.pos.x, k.pos.y, e.col, 2.6, 0.45);
  ESP.usos.push({ t: +S.t.toFixed(2), who: NAME(k), k: k.charKey, gk: true });
  LOG('especial_portero', k, { k: k.charKey });
  return true;
}
// ---- actualización (cada paso de simulación) ----
function espUpdate(dt, playing) {
  gkEspUpdate(dt, playing);   // update 37
  const fld = fieldPlayers();   // update 30: 2 VS 2
  for (const a of fld) {
    if (!a) continue;
    if (playing && espOn() && a.esp < 1 && !(a.empT > 0)) { a.esp = Math.min(1, a.esp + dt / ESP_T); if (a.esp >= 1 && a === user) espSfx.listo(); }
    for (const k of ['stickT', 'slowT', 'invertT', 'ghostT', 'flyT', 'scaredT', 'blindT', 'downT', 'slipCd', 'regenT', 'toadT', 'empT', 'mareoT', 'spikeT', 'magiaT']) if (a[k] > 0) a[k] = Math.max(0, a[k] - dt);
    if (a.spikeT > 0) espSpikeTick(a, dt, playing);   // update 37 (t83u): PINCHOS de Cacutu
    if (a.empT > 0) { a.energy = 0; a.sprinting = false; if ((a._empT = (a._empT || 0) - dt) <= 0) { a._empT = 0.12; espPuffs(a.pos.x + (Math.random() - 0.5), a.pos.y + (Math.random() - 0.5), 0.6 + Math.random() * 1.4, Math.random() < 0.5 ? 0xb59bff : 0xffffff, 1, 0.3, 0.8, 0.25, 0.1); } }   // update 36: PULSO EMP
    { const tgt = a.toadT > 0 ? 0.55 : 1; if (a.model && (a._toadS || 1) !== tgt) { a._toadS = THREE.MathUtils.clamp((a._toadS || 1) + Math.sign(tgt - (a._toadS || 1)) * dt * 4, 0.55, 1); a.model.scale.setScalar(ESCALA * (a.charScale || 1) * a._toadS); } }   // update 36: HECHIZO SAPO
    if (a.regenT > 0 && (a._bubT = (a._bubT || 0) - dt) <= 0) { a._bubT = 0.09; const s = espSprite(espTex('burbuja'), Math.random() < 0.3 ? 0xffb3e0 : 0xbff4ff, 0.25 + Math.random() * 0.3, 0.9); const ox = (Math.random() - 0.5) * 1.2, oy = (Math.random() - 0.5) * 1.2; s.position.copy(g2tS(a.pos.x + ox, a.pos.y + oy, 0.3 + Math.random() * 1.4)); espFx(s, 0.8, (k, o, dt) => { o.position.y += 2.2 * dt; o.material.opacity = 0.9 * (1 - k); }); }   // update 34: burbujas mientras se regenera
    if (a._ghostOn && a.ghostT <= 0) espGhostVis(a, false);
    if (a.magiaT > 0 && (a._magT = (a._magT || 0) - dt) <= 0) { a._magT = 0.06; espPuffs(a.pos.x, a.pos.y, 0.4, Math.random() < 0.5 ? 0x6cace4 : 0xffffff, 1, 0.45, 0.9, 0.4, 0.2, true); }   // update 47: estela celeste
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
      if (z.kind === 'remolino' && inside) {   // update 36: REMOLINO -> arrastra al centro, frena y le quita el balón cerca del centro
        const dx = z.x - a.pos.x, dy = z.y - a.pos.y, L = Math.hypot(dx, dy);
        if (L > 0.05) { const pull = 3.6 * dt * Math.min(1, L * 0.8); a.pos.x += dx / L * pull; a.pos.y += dy / L * pull; }
        a.slowT = Math.max(a.slowT, 0.25);
        if (ball.owner === a && L < 1.9 && !z.robado) { z.robado = true; const an = Math.random() * Math.PI * 2; ball.owner = null; ball.vel.set(Math.cos(an) * 5, Math.sin(an) * 5, 2.5); ball.noCatch = a; ball.noCatchT = 0.8; a.kickPending = null; espIcon(a, '@', '#4fc3ff', 1.0, 1.5); LOG('remolino_roba', a, {}); }
      }
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
    if (z.kind === 'remolino') { z.mesh.rotation.y += dt * 5.5; z.mesh.scale.setScalar(Math.max(0.01, (1 - Math.pow(1 - ini, 3)) * (0.6 + 0.4 * fin))); z.mesh.children.forEach((m, i) => { m.material.opacity = 0.8 * fin; m.rotation.z += dt * (1.5 + i); });
      if (!ball.owner) { const dx = z.x - ball.pos.x, dy = z.y - ball.pos.y, L = Math.hypot(dx, dy); if (L < z.r && L > 0.3 && ball.pos.z < 1) { ball.vel.x += dx / L * 9 * dt; ball.vel.y += dy / L * 9 * dt; } } }
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
    L.g.position.copy(g2tS(mouth.x, mouth.y, mouth.z));
    L.g.lookAt(g2t(bp.x, bp.y, bp.z)); L.tongue.scale.set(1, 1, Math.max(0.05, reach)); L.tip.position.set(0, 0, Math.max(0.05, reach));
    if (L.t > 0.42 || ball.owner) { scene.remove(L.g); espDispose(L.g); ESP.lengua = null; if (!ball.owner && S.mode === 'play') { giveBall(a); ball.noCatch = null; } LOG('lengua', a, {}); }
  }
  espVentosa(dt);   // update 30: VENTOSA
  // señuelos (balón trampa)
  for (let i = ESP.decoys.length - 1; i >= 0; i--) {
    const d = ESP.decoys[i]; d.t += dt; d.alive = d.t < d.life;
    d.vel.z -= GRAV * dt; d.pos.addScaledVector(d.vel, dt); if (d.pos.z < BR) { d.pos.z = BR; d.vel.z = Math.abs(d.vel.z) * 0.5; d.vel.x *= 0.98; d.vel.y *= 0.98; }
    d.mesh.position.copy(g2tS(d.pos.x, d.pos.y, d.pos.z)); d.mesh.rotation.x += dt * 12;
    const lineCross = Math.abs(d.pos.y) > HL - 0.3;
    if (!d.alive || lineCross) {
      espPuffs(d.pos.x, d.pos.y, d.pos.z, 0xffffff, 10, 1.2, 1.3, 0.6); espSfx.puf();
      const t = espSprite(espTex('txt:PUF:#ffffff'), 0xffffff, 2); t.position.copy(g2tS(d.pos.x, d.pos.y, d.pos.z + 1.2)); espFx(t, 0.8, (k, o) => { o.material.opacity = 1 - k; o.position.y += 0.02; });
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
  const L = Math.hypot(tgt.x - a.pos.x, tgt.y - a.pos.y), dir = new THREE.Vector2(tgt.x - a.pos.x, tgt.y - a.pos.y).normalize(), sp = THREE.MathUtils.clamp(8 + L * 0.9, 12, 21);
  // update 31: los rivales de campo cercanos también pican y van a por el falso un momento
  for (const f of fieldPlayers()) if (f.team !== a.team && f !== user && Math.hypot(f.pos.x - a.pos.x, f.pos.y - a.pos.y) < 16) f.decoyChase = { until: S.t + 0.7 + Math.random() * 0.5 };
  const d = { mesh, pos: new THREE.Vector3(a.pos.x + dir.x * (PR + BR + 0.15) - dir.y * 0.4, a.pos.y + dir.y * (PR + BR + 0.15) + dir.x * 0.4, BR + 0.05), vel: new THREE.Vector3(dir.x * sp, dir.y * sp, 2.2), t: 0, life: 1.6, alive: true, gk };
  ESP.decoys.push(d); if (gk) { gk.decoy = d; gk.react = 0; gk.wasComing = false; }
  for (const f of fieldPlayers()) if (f.decoyChase && !f.decoyChase.d) f.decoyChase.d = d;
  LOG('señuelo', a, { x: +tgt.x.toFixed(1), y: +tgt.y.toFixed(1), conBalon: ball.owner === a });
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
  const v = Math.round(289 * (1 - Math.max(0, Math.min(1, user.esp || 0))));   // update 35: entero (menos repintados del aro)
  if (cargaEspecial._v !== v) { cargaEspecial._v = v; cargaEspecial.style.strokeDashoffset = v; }
  const full = user.esp >= 1, can = full && espCanUse(user);
  btnEspecial.classList.toggle('lleno', full); btnEspecial.classList.toggle('usable', can);
  const pa = Math.round((user.esp || 0) * 100) + '%', pb = Math.round(((rival && rival.esp) || 0) * 100) + '%';
  if (espMiniA && espMiniA._w !== pa) { espMiniA._w = pa; espMiniA.style.transform = 'scaleX(' + (parseInt(pa, 10) / 100) + ')';   /* u33: sin layout */ espMiniA.parentNode.classList.toggle('lleno', user.esp >= 1); }
  if (espMiniB && rival && espMiniB._w !== pb) { espMiniB._w = pb; espMiniB.style.transform = 'scaleX(' + (parseInt(pb, 10) / 100) + ')';   /* u33: sin layout */ espMiniB.parentNode.classList.toggle('lleno', rival.esp >= 1); }
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
// update 32: RÓTULOS estilo Brawl Stars: letras que caen con rebote y escalonadas, contorno grueso, degradado con brillo,
// sombra, rayos detrás, colores del equipo, salida animada y confeti en los goles. Misma API que antes (+ subtítulo opcional).
const ROT_KIND = (t) => /GO+L/.test(t) ? 'kGol' : /PROPIA/.test(t) ? 'kPropia' : /FUERA|ENCIMA/.test(t) ? 'kFuera' : /PALO|LARGUERO/.test(t) ? 'kPalo'
  : /PARADA|PARAD[ÓO]N/.test(t) ? 'kParada' : /^FINAL/.test(t) ? 'kFinal' : /YA!/.test(t) ? 'kYa' : 'kInfo';
const ROT_LOG = [];
// update 33: rótulos ligeros — nodos creados UNA vez y reutilizados; animación solo transform/opacity; reinicio alternando .p1 (sin forzar reflow)
banner.innerHTML = '<div class="rtB"></div><div class="rt"><span class="rtI"></span></div><div class="rtSub"></div>'; banner.className = 'r33';
const bnI = banner.querySelector('.rtI'), bnSub = banner.querySelector('.rtSub');
// update 44 (Aritz t95u: «quita el mensajito de fuera, gol y así, son molestos»): los avisos de EVENTO del partido (GOL, FUERA,
// POR ENCIMA, EN PROPIA, PARADA) ya NO sacan cartel de texto. Se registran (ROT_LOG / LOGS) y el gol mantiene confeti + sonido + marcador.
function avisoEvento(txt, cls = '', sub = '') {
  ROT_LOG.push({ t: S.t, txt, kind: 'oculto', cls, sub, oculto: true }); if (ROT_LOG.length > 30) ROT_LOG.shift();
  LOG('aviso_oculto', null, { txt });
}
function showBanner(txt, cls = '', ms = 1400, sub = '') {
  clearTimeout(showBanner.t); clearTimeout(showBanner.t2);
  if (!txt) { banner.className = 'r33'; return; }
  const kind = cls.includes('esp') ? 'kEsp' : ROT_KIND(txt);
  if (bnI.textContent !== txt) { bnI.textContent = txt; bnI.dataset.t = txt; }
  if (bnSub.textContent !== sub) bnSub.textContent = sub || '';
  showBanner.p = !showBanner.p;
  banner.className = 'r33 on ' + kind + ' ' + cls + (txt.length > 11 ? ' largo' : '') + (showBanner.p ? ' p1' : '');
  ROT_LOG.push({ t: S.t, txt, kind, cls, sub }); if (ROT_LOG.length > 30) ROT_LOG.shift();
  if (kind === 'kGol') confeti(cls.includes('bRojo') ? 1 : cls.includes('bAzul') ? 0 : -1);
  if (ms) showBanner.t = setTimeout(() => { banner.classList.add('off'); showBanner.t2 = setTimeout(() => { banner.className = 'r33'; }, 320); }, ms);
}
// confeti de gol: 30 piezas en 3 capas creadas una vez; solo 3 animaciones (transform/opacity de cada capa); colores del equipo por variables
const confetiEl = document.createElement('div'); confetiEl.id = 'confeti'; confetiEl.setAttribute('aria-hidden', 'true');
(document.getElementById('app') || document.body).appendChild(confetiEl);
{ let h = ''; for (let L = 0; L < 3; L++) { h += '<s>'; for (let k = 0; k < 10; k++) { const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 230; h += `<b style="left:${(Math.cos(a) * r).toFixed(0)}px;top:${(Math.sin(a) * r * 0.6 - 30).toFixed(0)}px;transform:rotate(${(Math.random() * 360).toFixed(0)}deg)"></b>`; } h += '</s>'; } confetiEl.innerHTML = h; }   // u33: 3 capas estáticas de 10 piezas; solo se animan las 3 capas
const CONF_COL = [['#2f7dff', '#8fd0ff', '#ffffff', '#ffd23f'], ['#ff3434', '#ffb0a6', '#ffffff', '#ffd23f'], ['#ffd23f', '#ffffff', '#5dff8a', '#ff6ee0']];
function confeti(team) {
  const c = CONF_COL[team === 0 ? 0 : team === 1 ? 1 : 2]; for (let i = 0; i < 4; i++) confetiEl.style.setProperty('--c' + i, c[i]);
  confeti.p = !confeti.p; confetiEl.className = 'on' + (confeti.p ? ' p1' : '');
  clearTimeout(confeti.t); confeti.t = setTimeout(() => { confetiEl.className = ''; }, 2000);
}
function kickoff(first) {
  for (const a of actors) a.celebrate = false;
  espClear();
  if (S.practice) { practiceBall(true); return; }
  if (first) { S.vsT = 1.5; showVsCards(true); }   // update 17: cartas enfrentadas 1,5 s antes del saque
  user.place(0, -3.2); rival.place(0, 3.2);
  if (is2v2()) { user.place(-3, -3.2); mateA.place(5, -9); rival.place(3, 3.2); mateB.place(-5, 9); }   // update 30
  gkA.place(0, -HL + 0.9); gkB.place(0, HL - 0.9);
  if (first) for (const a of fieldPlayers()) a.introT = a.actions.Intro ? a.actions.Intro.getClip().duration - 0.15 : 0;   // update 21
  ball.pos.set(0, 0, BR); ball.vel.set(0, 0, 0); ball.owner = null; ball.noCatch = null;
  input.shootDown = false; input.charge = 0;
  S.mode = 'kickoff'; S.pauseT = 1.1 + (first ? 1.5 : 0); if (!first) showBanner('¡YA!', '', 900);
}
// update 35 (rendimiento): los materiales de lo que está oculto (línea de apuntado, arco del CHUT ALTO, marca de caída, efectos de
// especiales...) se compilaban la primera vez que aparecían, en mitad de la acción (tirón de 100-300 ms en móvil). Aquí se hacen
// visibles un instante solo para compilar (sin dibujar) y se vuelven a ocultar. Con KHR_parallel_shader_compile no bloquea.
function precompileFx() {
  if (precompileFx.done === matchKeys + '|' + AJ.quality + '|' + renderer.shadowMap.enabled) return;
  if (!precompileFx.warm) {   // variantes de material que usan los efectos de especiales (se crean al usarlos): mismo programa -> ya compilado
    const g = new THREE.Group(), tx = espTex('soft'), geo = new THREE.PlaneGeometry(0.01, 0.01);
    const mats = [new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }), new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false }), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide }), new THREE.MeshLambertMaterial({ color: 0xffffff }), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })];
    for (const m of mats) { const o = m.isSpriteMaterial ? new THREE.Sprite(m) : new THREE.Mesh(geo, m); o.position.set(0, -50, 0); o.visible = false; o.frustumCulled = false; g.add(o); }
    g.visible = false; scene.add(g); precompileFx.warm = g;
  }
  const hid = []; scene.traverse((o) => { if (!o.visible) { hid.push(o); o.visible = true; } });
  try {   // sin KHR_parallel_shader_compile, compileAsync avisa por consola y no aporta nada: compilación normal (antes del saque)
    const par = renderer.extensions && renderer.extensions.has('KHR_parallel_shader_compile');
    if (par && renderer.compileAsync) renderer.compileAsync(scene, camera).catch(() => {}); else renderer.compile(scene, camera);
  } catch (_) {}
  // update 48: los retratos ya no se pintan todos al arrancar (antes subían de paso las texturas de todos a la GPU): se suben aquí,
  // antes del saque, para que la primera vez no tironee justo en el saque (initTexture solo sube las que aún no están)
  try { if (renderer.initTexture) { const vistas = new Set(); scene.traverse((o) => { if (!o.isMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m) for (const k of ['map', 'normalMap', 'emissiveMap']) { const t = m[k]; if (t && t.isTexture && !vistas.has(t)) { vistas.add(t); renderer.initTexture(t); } } }); } } catch (_) {}
  for (const o of hid) o.visible = false;
  precompileFx.done = matchKeys + '|' + AJ.quality + '|' + renderer.shadowMap.enabled; precompileFx.n = hid.length;
}
function startGame() {
  if (!user) return;
  campoAplicar();   // update 39: campo elegido (o aleatorio) para todos los modos
  tryLandscape();
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  actx?.resume?.();
  S.score = [0, 0]; S.time = DURACION; S.goals = 0; S.saves = 0; S.shots = 0; MS_reset(); msHide();
  // update 38: fuera el aviso 'DESLIZA Y SUELTA = REGATE' (TURBO ya no regatea)
  if (user) user.energy = 1; if (rival) rival.energy = 1;
  for (const a of [user, rival, mateA, mateB]) if (a) { a.esp = 0; a.energy = 1; } ESP.usos.length = 0; espSetBtnLabel(); S.passes = 0;
  elA.textContent = '0'; elB.textContent = '0'; elReloj._t = null;
  applyPracticeHud();
  document.body.classList.toggle('m2v2', is2v2());   // update 30
  applyTeamDiscs();   // update 31
  applyBoots(user.model, bootEquip());
  for (const k of [gkA, gkB]) if (k && SKINS[k.charKey]) applySkin(k.model, k.charKey, k === gkA ? skinOf(k.charKey) : null);   // update 46: TU portero lleva su skin (Turtobola); el rival, el original
  if (SKINS[user.charKey]) applySkin(user.model, user.charKey, skinOf(user.charKey));   // update 42: tu skin (solo tu jugador: un rival con el mismo personaje va con el original)
  pantalla.classList.remove('visible'); menuEl.classList.remove('visible'); hudSet(true);
  precompileFx();   // update 35: shaders de indicadores / efectos compilados ANTES de la primera acción (antes: tirón al primer chut alto, apuntado...)
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

// ===================== update 42: SKINS (reskins de color) =====================
// Texturas recoloreadas POR ZONAS (skins_src/gen_skins.py: máscaras suaves por tono/saturación/brillo; blancos y negros intactos)
// sobre el MISMO modelo: solo cambia el map del material toon. Se compran con monedas en la TIENDA y se equipan por personaje.
const SKINS = {
  tiburon: [{ k: 'lava', name: 'MAKO DE LAVA', precio: 300, pal: ['#c4452b', '#f5e2b8', '#ffd21f'] }, { k: 'abisal', name: 'SOMBRA ABISAL', precio: 450, pal: ['#3a3157', '#c9cbe0', '#ff3cf2'] }],
  mushom: [{ k: 'amanita', name: 'AMANITA', precio: 300, pal: ['#c8222b', '#f7e9c8', '#ff7a1f'] }, { k: 'helada', name: 'ESPORA HELADA', precio: 450, pal: ['#1d6f8a', '#c4f3fa', '#3ff2e0'] }],
  zora: [{ k: 'tormenta', name: 'TORMENTA AZUL', precio: 300, pal: ['#3b4048', '#2d9bff', '#bfe6ff'] }, { k: 'fuego', name: 'LOBA DE FUEGO', precio: 450, pal: ['#4a3a33', '#ff7a1f', '#ffd0a0'] }],
  // update 43 (t93u): mismo sistema (recolor por zonas de la textura, modelo intacto)
  pantera: [{ k: 'oro', name: 'GARRA DE ORO', precio: 300, pal: ['#141414', '#ffc41f', '#fff0b0'] }, { k: 'carmesi', name: 'PANTERA CARMESÍ', precio: 450, pal: ['#2a1418', '#ff2b45', '#ffc0c8'] }],
  carnero: [{ k: 'algodon', name: 'ALGODÓN DE AZÚCAR', precio: 300, pal: ['#fbd3e6', '#3a3a3a', '#3fe6ff'] }, { k: 'galaxia', name: 'DJ GALAXIA', precio: 450, pal: ['#a88be0', '#25283f', '#ff4fd8'] }],
  frogetto: [{ k: 'esmeralda', name: 'MAGO ESMERALDA', precio: 300, pal: ['#14663f', '#e0b034', '#9dff3f'] }, { k: 'fuego', name: 'BRUJO DE FUEGO', precio: 450, pal: ['#7a1420', '#ff8a24', '#ffe14a'] }],
  pepi: [{ k: 'guindilla', name: 'GUINDILLA', precio: 300, pal: ['#c8241e', '#7a1410', '#1a1a1a'] }, { k: 'oro', name: 'PEPINILLO DE ORO', precio: 450, pal: ['#e0b028', '#8a6410', '#1a1a1a'] }],
  // update 46 (t99u): Licky Gecko NUEVO (skins_src/gen_gecko_u46.py, por zonas 3D) · Bat Vampire · Conazo · Turtobola (portero)
  gecko: [{ k: 'sombra', name: 'SOMBRA ARCOÍRIS', precio: 600, pal: ['#0c0c12', '#ff3df0', '#3dfbff'], fx: 'ojos' },
    { k: 'cebra', name: 'CEBRA MONOCROMO', precio: 450, pal: ['#f2f2f2', '#141414', '#8a8a8a'] },
    { k: 'galaxia', name: 'GECKO GALAXIA', precio: 300, pal: ['#2a1660', '#ff4fd8', '#5ff4ff'] }],
  murcielago: [{ k: 'carmesi', name: 'CONDE CARMESÍ', precio: 300, pal: ['#5a1020', '#ffc63d', '#1a1014'] }, { k: 'espectral', name: 'MURCIÉLAGO ESPECTRAL', precio: 450, pal: ['#1f6a72', '#7dff5a', '#0c1a1c'] }],
  conazo: [{ k: 'helado', name: 'CONO HELADO', precio: 300, pal: ['#6fd3f2', '#ffffff', '#2a3440'] }, { k: 'oro', name: 'CONAZO DE ORO', precio: 450, pal: ['#f2b51f', '#1a1a1a', '#fff0b0'] }],
  turtobola: [{ k: 'lava', name: 'TORTUGA DE LAVA', precio: 300, pal: ['#c4301c', '#ffd23f', '#1a1a1a'] }, { k: 'glaciar', name: 'TORTUGA GLACIAR', precio: 450, pal: ['#5aa8e0', '#eaf8ff', '#1a2430'] }],
};
const SKIN_KEY = 'ml_skins_v1';
const GK_PROB = {};   // update 46: modelos de probador de los porteros (ver probModel)
function skinsLoad() {
  let b = null; try { b = JSON.parse(localStorage.getItem(SKIN_KEY) || 'null'); } catch (_) {}
  b = b && typeof b === 'object' ? b : {};
  const ok = (id) => { const [c, k] = String(id).split(':'); return !!(SKINS[c] && SKINS[c].some((x) => x.k === k)); };
  b.owned = Array.isArray(b.owned) ? b.owned.filter(ok) : [];
  const eq = {}; for (const [c, k] of Object.entries(b.equip || {})) if (ok(c + ':' + k) && b.owned.includes(c + ':' + k)) eq[c] = k; b.equip = eq;
  return b;
}
let SKINS_ST = skinsLoad();
function skinsSave() { try { localStorage.setItem(SKIN_KEY, JSON.stringify(SKINS_ST)); } catch (_) {} }
const skinOf = (c) => SKINS_ST.equip[c] || null;
const SKIN_TEX = {};
// update 46: materiales con brillo animado (ojos de la skin SOMBRA): el color recorre el arcoíris con pulso suave
const GLOW_MATS = new Set();
function glowTick(t) {
  if (!GLOW_MATS.size) return;
  const c = _glowC.setHSL((t * 0.22) % 1, 1, 0.55), amt = 0.85 + 0.35 * Math.sin(t * 3.1);
  for (const m of GLOW_MATS) { m.userData.toonU.uGlow.value.copy(c); m.userData.toonU.uGlowAmt.value = amt; }
}
const _glowC = new THREE.Color();
// update 48 (t106u): texturas de skins NÍTIDAS: 2048 WebP SIN PÉRDIDAS generadas desde la fuente 2048/4096 (skins_src/gen_*_u48.py)
function skinTex(c, k, ext = 'webp') {
  const id = c + '_' + k; if (SKIN_TEX[id]) return SKIN_TEX[id];
  return (SKIN_TEX[id] = new Promise((res) => {
    new THREE.TextureLoader().load(`assets/skins/${id}.${ext}?${ASSET_V}`, (t) => { t.userData.skinHi = true; t.userData.skinId = id; SKIN_TEX_R[id] = t; res(t); }, undefined, () => { console.warn('skin sin textura', id); res(null); });
  }));
}
// update 48: anisotrópico de las skins (2048 px sin pérdida): mínimo 8 aunque la calidad sea Media/Baja (coste mínimo, mucho más nítidas en ángulo)
function skinAniso() { const q = QUALITY[AJ.quality], maxA = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1; return Math.max(1, Math.min(maxA, Math.max(q.aniso, 8))); }
// update 48: libera de la GPU las texturas de skin que ya no lleva ningún modelo (pruebas de la tienda/taquilla); 2048² = ~22 MB cada una
const SKIN_TEX_R = {}; let skinGCtm = 0;
function skinGC() {
  skinGCtm = 0; const used = new Set();
  const mark = (root) => root && root.traverse((o) => { if (!o.isMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (!m) continue; if (m.map) used.add(m.map); const g = m.userData.toonU && m.userData.toonU.uGlowMap.value; if (g) used.add(g); } });
  mark(scene); mark(menuScene); for (const g of Object.values(GK_PROB)) mark(g.root);
  if (skinPrev) return;   // la tienda está probando una skin: nada que liberar ahora
  let n = 0; for (const [id, t] of Object.entries(SKIN_TEX_R)) if (!used.has(t)) { t.dispose(); delete SKIN_TEX_R[id]; delete SKIN_TEX[id]; n++; }
  if (n) LOG('skinGC', null, { n });
  return n;
}
function skinGCLuego() { clearTimeout(skinGCtm); skinGCtm = setTimeout(skinGC, 2500); }
// pone (o quita, k = null) la skin en un modelo de ese personaje; devuelve una promesa (la textura se carga una vez y se comparte)
function applySkin(model, c, k) {
  if (!model || !SKINS[c]) return Promise.resolve(false);
  const mats = []; model.traverse((o) => { if (o.isMesh && !o.userData.outline) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && m.map !== undefined) mats.push(m); });
  for (const m of mats) if (!m.userData.mapOrig) m.userData.mapOrig = m.map;
  model.userData.skin = k || null;
  const fx = k && (SKINS[c].find((x) => x.k === k) || {}).fx;
  for (const m of mats) if (m.userData.toonU) { m.userData.toonU.uGlowAmt.value = 0; m.userData.toonU.uGlowMap.value = GLOW_NEGRO; GLOW_MATS.delete(m); }   // update 46
  if (!k) { for (const m of mats) if (m.userData.mapOrig) m.map = m.userData.mapOrig; return Promise.resolve(true); }
  if (fx) skinTex(c, k + '_fx').then((g) => { if (!g || model.userData.skin !== k) return; g.flipY = false; g.colorSpace = THREE.NoColorSpace; g.needsUpdate = true;
    for (const m of mats) if (m.userData.toonU) { m.userData.toonU.uGlowMap.value = g; m.userData.toonU.uGlowAmt.value = 1; GLOW_MATS.add(m); } });
  return skinTex(c, k).then((t) => {
    if (!t || model.userData.skin !== k) return false;
    for (const m of mats) { const o = m.userData.mapOrig; if (!o) continue;
      if (!t.userData.cfg) { t.flipY = o.flipY; t.colorSpace = o.colorSpace; t.wrapS = o.wrapS; t.wrapT = o.wrapT; t.anisotropy = Math.max(o.anisotropy || 1, skinAniso()); t.minFilter = o.minFilter; t.magFilter = o.magFilter; t.needsUpdate = true; t.userData.cfg = true; }
      m.map = t; }
    return true;
  });
}
// menú (muñecos + retratos de las cartas = selector, colección, VS de la intro); el preview de la tienda usa prev = { c, k }
function refreshSkinsVisual(prev) {
  const ps = CHARS.map((c, i) => { const m = menuChars[i]; if (!m || !SKINS[c.key]) return null; const k = prev && prev.c === c.key ? prev.k : skinOf(c.key); return m.model.userData.skin === (k || null) ? null : applySkin(m.model, c.key, k); }).filter(Boolean);
  if (user && SKINS[user.charKey] && !prev) ps.push(applySkin(user.model, user.charKey, skinOf(user.charKey)));
  if (prev && SKINS[prev.c] && !CHARS.some((x) => x.key === prev.c)) probModel(prev.c);   // update 46: el probador del portero existe ANTES de pintar la skin
  for (const [c, m] of Object.entries(GK_PROB)) { const k = prev && prev.c === c ? prev.k : skinOf(c); if (m.model.userData.skin !== (k || null)) ps.push(applySkin(m.model, c, k)); }   // update 46: porteros
  if (!prev && gkA && SKINS[gkA.charKey]) ps.push(applySkin(gkA.model, gkA.charKey, skinOf(gkA.charKey)));
  return Promise.all(ps).then((r) => {
    if (prev) return r.length;
    const firma = CHARS.map((c, i) => (menuChars[i] && menuChars[i].model.userData.skin) || '').join();   // retratos hechos con estas skins
    if (firma !== refreshSkinsVisual.firma) { refreshSkinsVisual.firma = firma; renderPortraits(); if (S.mode === 'menu') { showBigCard(); if (typeof lbRender === 'function') lbRender(); } }
    return r.length; });
}
refreshSkinsVisual.firma = CHARS.map(() => '').join();   // los retratos de inicio son con las texturas originales
// ===================== update 45: TIENDA estilo Brawl Stars =====================
// Pantalla completa: pestañas a la izquierda y UNA tira horizontal de tarjetas grandes con todas las secciones
// (OFERTAS DESTACADAS · SKINS · PERSONAJES · BOTAS · MONEDAS). Tocar una pestaña desliza hasta su sección.
// Todo es real: la OFERTA DEL DÍA rota a medianoche (hora local) y su -20 % se cobra de verdad (skinPrecio);
// las monedas no se compran (la sección MONEDAS explica cómo se ganan).
const OFERTA_DTO = 0.2;
let OFERTA_FIJA;   // pruebas: undefined = automática · false = ninguna · { c, k } = fijada
const SKIN_LISTA = Object.entries(SKINS).flatMap(([c, l]) => l.map((x) => ({ c, ...x })));
const diaLocal = (t = Date.now()) => { const d = new Date(t); return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(2026, 0, 1).getTime()) / 864e5); };
function ofertasDia() {   // [oferta con descuento, destacada a precio normal]
  if (OFERTA_FIJA === false) return { dto: null, dest: null };
  const n = SKIN_LISTA.length, d = diaLocal(), a = SKIN_LISTA[(d * 5 + 3) % n], b = SKIN_LISTA[(d * 5 + 10) % n];
  const dto = OFERTA_FIJA ? SKIN_LISTA.find((x) => x.c === OFERTA_FIJA.c && x.k === OFERTA_FIJA.k) || null : a;
  return { dto, dest: b && dto && b.c === dto.c && b.k === dto.k ? SKIN_LISTA[(d * 5 + 11) % n] : b };
}
function skinPrecio(c, k) {
  const sk = (SKINS[c] || []).find((x) => x.k === k); if (!sk) return 0;
  const o = ofertasDia().dto; return o && o.c === c && o.k === k ? Math.round(sk.precio * (1 - OFERTA_DTO) / 5) * 5 : sk.precio;
}
function msMedianoche() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime(); }
function fmtFalta(ms) { const m = Math.max(0, Math.floor(ms / 60000)), h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; }
function skinComprar(c, k) {
  const sk = (SKINS[c] || []).find((x) => x.k === k); if (!sk) return { ok: false, motivo: 'no existe' };
  const id = c + ':' + k, precio = skinPrecio(c, k);
  if (!SKINS_ST.owned.includes(id)) {
    if (PROG.mon < precio) return { ok: false, motivo: 'monedas', faltan: precio - PROG.mon };
    PROG.mon -= precio; progSave(); SKINS_ST.owned.push(id); LOG('skin_compra', null, { c, k, precio, mon: PROG.mon, oferta: precio !== sk.precio });
  }
  SKINS_ST.equip[c] = k; skinsSave(); return { ok: true, mon: PROG.mon, precio };
}
function skinEquipar(c, k) { if (k && !SKINS_ST.owned.includes(c + ':' + k)) return false; if (k) SKINS_ST.equip[c] = k; else delete SKINS_ST.equip[c]; skinsSave(); return true; }
const tiendaEl = document.getElementById('tienda'), tiendaLista = document.getElementById('tiendaLista');
const hex6 = (n, d) => n === null || n === undefined ? d : '#' + n.toString(16).padStart(6, '0');
const skArte = (c, k) => `assets/skinsart/${c}_${k || 'orig'}.webp?${ASSET_V}`;
const TI_SECS = [
  { k: 'dest', n: 'OFERTAS<br>DESTACADAS', ico: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9z" fill="#ffd23f" stroke="#14193a" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6.2l1.6 3.3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>' },
  { k: 'skins', n: 'SKINS', ico: '<svg viewBox="0 0 24 24"><path d="M8 3 3.5 6l1.8 4 2-1V21h9.4V9l2 1 1.8-4L16 3c-.6 1.6-2 2.6-4 2.6S8.6 4.6 8 3z" fill="#ff5ac8" stroke="#14193a" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 13h6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>' },
  { k: 'pers', n: 'PERSONAJES', ico: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="13" height="18" rx="2.5" fill="#3fd0ff" stroke="#14193a" stroke-width="1.6"/><path d="M15 10.5l3.5-3.5 2.5 2.5-3.5 3.5" fill="#5dff8a" stroke="#14193a" stroke-width="1.4"/><circle cx="10.5" cy="10" r="3" fill="#fff" stroke="#14193a" stroke-width="1.4"/><path d="M6.5 18c.5-2.4 2-3.4 4-3.4s3.5 1 4 3.4" fill="#fff" stroke="#14193a" stroke-width="1.4"/></svg>' },
  { k: 'botas', n: 'BOTAS', ico: '<svg viewBox="0 0 24 24"><path d="M5 4h6v7.5l7.8 2.8c1.6.6 2.4 1.7 2.4 3.2V20H3.5z" fill="#ffb21e" stroke="#14193a" stroke-width="1.6" stroke-linejoin="round"/><path d="M3.5 17h17.7" stroke="#14193a" stroke-width="1.6"/><path d="M11 13.5l1.2-1.3M13.6 14.5l1.2-1.3" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>' },
  { k: 'mon', n: 'MONEDAS', ico: '<svg viewBox="0 0 24 24"><circle cx="9" cy="14" r="6.5" fill="#e0a21b" stroke="#14193a" stroke-width="1.6"/><circle cx="15" cy="10" r="6.5" fill="#ffd23f" stroke="#14193a" stroke-width="1.6"/><path d="M15 6.8v6.4M12.6 8.6c.4-1 1.4-1.4 2.4-1.4s2.4.6 2.4 1.7c0 2.2-4.8 1.2-4.8 3.4 0 1 1 1.7 2.4 1.7s2.2-.5 2.6-1.4" fill="none" stroke="#a86a00" stroke-width="1.4" stroke-linecap="round"/></svg>' },
];
const TI_VISTO_KEY = 'ml_tienda_dia_v1';
const tiOfertaNueva = () => { try { return localStorage.getItem(TI_VISTO_KEY) !== String(diaLocal()); } catch (_) { return false; } };
const tiBotasGratis = () => Object.keys(BOOTS).some((k) => !BOOTS_ST.owned.includes(k));
function tiendaAvisos() {   // cintas del botón TIENDA del lobby: solo si es verdad
  const b = document.getElementById('btnMenuTienda'); if (!b) return;
  let r = b.querySelector('.lbCinta'); const t = tiOfertaNueva() && ofertasDia().dto ? 'NUEVO' : tiBotasGratis() ? 'GRATIS' : '';
  if (!t) { r && r.remove(); return; }
  if (!r) { r = document.createElement('i'); r.className = 'lbCinta'; b.appendChild(r); }
  r.textContent = t; r.classList.toggle('verde', t === 'GRATIS');
}
function renderTiendaTabs() {
  const el = document.getElementById('tiendaTabs'); if (!el) return;
  const cinta = { dest: tiOfertaNueva() && ofertasDia().dto ? 'NUEVO' : '', botas: tiBotasGratis() ? 'GRATIS' : '' };
  const act = el.querySelector('.tiTab.act')?.dataset.sec || 'dest';
  el.innerHTML = TI_SECS.map((s) => `<button class="tiTab${s.k === act ? ' act' : ''}" data-sec="${s.k}"><span class="tiTabIco">${s.ico}</span><b>${s.n}</b>${cinta[s.k] ? `<i class="tiCinta${s.k === 'botas' ? ' verde' : ''}">${cinta[s.k]}</i>` : ''}</button>`).join('');
}
function tiendaIr(sec, suave = true) {
  const sc = document.getElementById('tiendaScroll'), s = sc && sc.querySelector(`.tiSec[data-sec="${sec}"]`); if (!s) return;
  const x1 = Math.min(Math.max(0, s.offsetLeft - 6), sc.scrollWidth - sc.clientWidth), x0 = sc.scrollLeft, T = suave ? 420 : 0, t0 = performance.now();
  tiendaIr.bloq = t0 + T + 150;   // durante el deslizamiento la pestaña no parpadea
  cancelAnimationFrame(tiendaIr.raf); sc.style.scrollSnapType = 'none';   // animación propia (el smooth del navegador se paraba con el snap)
  const paso = (now) => { const k = T ? Math.min(1, (now - t0) / T) : 1, e = 1 - Math.pow(1 - k, 3); sc.scrollLeft = x0 + (x1 - x0) * e;
    if (k < 1) { tiendaIr.bloq = performance.now() + 150; tiendaIr.raf = requestAnimationFrame(paso); } else { tiendaIr.bloq = performance.now() + 250; tiendaTabAct(sec); } };   // el snap vuelve al siguiente toque (si volviera ya, re-encajaba hacia atrás al final de la tira)
  if (T) tiendaIr.raf = requestAnimationFrame(paso); else paso(t0);
  tiendaTabAct(sec);
}
function tiendaTabAct(sec) { for (const t of document.querySelectorAll('#tiendaTabs .tiTab')) t.classList.toggle('act', t.dataset.sec === sec); }
document.getElementById('tiendaTabs')?.addEventListener('click', (e) => { const t = e.target.closest('.tiTab'); if (!t) return; uiTap(); tiendaIr(t.dataset.sec); });
document.getElementById('tiendaScroll')?.addEventListener('scroll', (e) => {   // pestaña activa = sección que ocupa el borde izquierdo
  if (performance.now() < (tiendaIr.bloq || 0)) return;
  const sc = e.currentTarget, x = sc.scrollLeft + sc.clientWidth * 0.3; let cur = 'dest';
  for (const s of sc.querySelectorAll('.tiSec')) if (s.offsetLeft <= x) cur = s.dataset.sec;
  if (sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 4) cur = 'mon';
  tiendaTabAct(cur);
}, { passive: true });
// rueda del ratón (PC) -> desplazamiento horizontal
document.getElementById('tiendaScroll')?.addEventListener('pointerdown', (e) => { e.currentTarget.style.scrollSnapType = ''; }, { passive: true });
document.getElementById('tiendaScroll')?.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
function renderTiendaDest() {
  const el = document.getElementById('tiendaDest'); if (!el) return;
  const { dto, dest } = ofertasDia(), falta = fmtFalta(msMedianoche()), h = [];
  const skCard = (o, big) => {
    const ch = ALL_CHARS.find((x) => x.key === o.c), own = SKINS_ST.owned.includes(o.c + ':' + o.k), eq = skinOf(o.c) === o.k, p = skinPrecio(o.c, o.k), sale = p !== o.precio;
    const btn = eq ? 'EQUIPADA' : own ? 'EQUIPAR' : `${MONEDA_SVG}${p}`;
    return `<div class="tiCard tiOferta${big ? ' grande' : ''}" data-c="${o.c}" data-k="${o.k}" style="--g1:${o.pal[0]};--g2:${o.pal[1]};--g3:${o.pal[2]}">
      <span class="tiChip"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4.5l3 1.8M9.5 2.5h5"/></svg>${falta}</span>
      <div class="tiCardRib">${sale ? 'OFERTA DEL DÍA' : 'DESTACADA'}</div>
      <div class="tiArteZona"><img class="tiArte" src="${skArte(o.c, o.k)}" alt="" draggable="false"><img class="tiBadge" src="${cBadgeImg(o.c)}" alt=""></div>
      <div class="tiCardNom"><b>${o.name}</b><small>ASPECTO · ${ch ? ch.name : ''}</small></div>
      ${sale && !own ? `<span class="tiDto">-${Math.round(OFERTA_DTO * 100)}%</span><s class="tiAntes">${o.precio}</s>` : ''}
      <button class="tiPrecio tiOfBtn${eq ? ' eq' : own ? ' own' : ''}${!own && PROG.mon < p ? ' falta' : ''}"${eq || (!own && PROG.mon < p) ? ' disabled' : ''}>${btn}</button></div>`;
  };
  if (dto) h.push(skCard(dto, true));
  if (dest) h.push(skCard(dest, false));
  // mejora recomendada: tu personaje elegido (real: cuesta lo mismo que en MEJORAR)
  const ck = CHARS[sel] ? CHARS[sel].key : CHARS[0].key; h.push(persCard(ck, 'TU PERSONAJE'));
  if (tiBotasGratis()) { const k = Object.keys(BOOTS).find((x) => !BOOTS_ST.owned.includes(x)), b = BOOTS[k];
    h.push(`<div class="tiCard tiBotaDest" data-k="${k}" style="--g1:${hex6(b.c1, '#2a3b8f')};--g2:${hex6(b.c2, '#14193a')}"><div class="tiCardRib">REGALO</div>
      <div class="tiArteZona"><div class="botaIco grande" style="--c1:${hex6(b.c1, '#1a1d2b')};--c2:${hex6(b.c2, '#2e3036')}"><i></i><b></b><u></u></div></div>
      <div class="tiCardNom"><b>BOTAS ${b.name}</b><small>EQUIPAMIENTO</small></div><span class="tiGratis">GRATIS</span>
      <button class="tiPrecio verde tiIrBotas">VER BOTAS</button></div>`); }
  el.innerHTML = h.join('');
}
function persCard(k, rib) {
  const ch = ALL_CHARS.find((x) => x.key === k); if (!ch) return '';
  const L = PROG.lv[k] || 0, max = L >= LV_MAX, cost = lvCost(L), t = statsAt(k, L), falta = !max && PROG.mon < cost;
  return `<div class="tiCard tiPers r-${t.rareza}" data-c="${k}" style="--g1:${ch.color || '#3fa9ff'}">${rib ? `<div class="tiCardRib">${rib}</div>` : ''}
    <div class="tiArteZona"><img class="tiArte retrato" src="${portrait(k) || ch.badge || ch.card}" alt="" draggable="false"><span class="tiNivel">NV ${L}</span><span class="tiMedia">${t.media}<small>${t.tier}</small></span></div>
    <div class="tiCardNom"><b>${ch.name}</b><small>${isGK(k) ? 'PORTERO · ' : ''}MEJORA DE CARTA</small></div>
    <button class="tiPrecio tiMejBtn${max ? ' eq' : ''}${falta ? ' falta' : ''}"${max || falta ? ' disabled' : ''}>${max ? 'NIVEL MÁX' : `${MONEDA_SVG}${cost}`}</button></div>`;
}
function renderTiendaPers() { const el = document.getElementById('tiendaPers'); if (el) el.innerHTML = mejLista().map((k) => persCard(k)).join(''); }
function renderTiendaRecursos() {
  const el = document.getElementById('tiendaRecursos'); if (!el) return;
  const R = [['VICTORIA', '+' + MON_PARTIDO.v, 'POR PARTIDO'], ['EMPATE', '+' + MON_PARTIDO.e, 'POR PARTIDO'], ['DERROTA', '+' + MON_PARTIDO.d, 'TAMBIÉN SUMA'],
    ['CADA GOL', '+' + MON_PARTIDO.gol, `HASTA ${MON_PARTIDO.golMax} POR PARTIDO`], ['TÍTULO DE LIGA', '+' + MON_TITULO.liga, 'AL GANAR LA LIGA'], ['TÍTULO DE TORNEO', '+' + MON_TITULO.torneo, 'AL GANAR EL TORNEO']];
  el.innerHTML = R.map(([n, v, s], i) => `<div class="tiCard tiRec${i >= 4 ? ' oro' : ''}"><div class="tiArteZona"><div class="tiMonGrande">${MONEDA_SVG}${i >= 4 ? MONEDA_SVG + MONEDA_SVG : ''}</div><span class="tiRecV">${v}</span></div>
    <div class="tiCardNom"><b>${n}</b><small>${s}</small></div><button class="tiPrecio azul tiAJugar">¡A JUGAR!</button></div>`).join('');
}
function renderTienda() {   // BOTAS: tarjetas con el mismo .bota + button de siempre
  tiendaLista.innerHTML = '';
  for (const [k, b] of Object.entries(BOOTS)) {
    const own = BOOTS_ST.owned.includes(k), eq = BOOTS_ST.equip === k;
    const d = document.createElement('div'); d.className = 'bota tiCard' + (eq ? ' equipada' : ''); d.dataset.k = k;
    const c1 = hex6(b.c1, '#1a1d2b'), c2 = hex6(b.c2, '#2e3036');
    d.style.cssText = `--g1:${hex6(b.c1, '#3a4a8f')};--g2:${hex6(b.c2, '#1b2560')}`;
    d.innerHTML = `${!own ? '<span class="tiGratis">GRATIS</span>' : eq ? '<span class="tiEqTag">EQUIPADAS</span>' : ''}<div class="tiArteZona"><div class="botaIco grande" style="--c1:${c1};--c2:${c2}"><i></i><b></b><u></u></div></div><div class="botaTxt tiCardNom"><div class="botaNom">${b.name}</div><div class="botaDesc">${b.desc}</div></div>` +
      `<button class="botaBtn tiPrecio ${eq ? 'eq' : own ? 'own' : ''}">${eq ? 'EQUIPADAS' : own ? 'EQUIPAR' : 'OBTENER · GRATIS'}</button>`;
    d.querySelector('button').addEventListener('click', () => {
      if (!BOOTS_ST.owned.includes(k)) { BOOTS_ST.owned.push(k); sfx.steal && actx && sfx.steal(); }
      else BOOTS_ST.equip = k;
      saveBoots(); refreshBootsVisual(); renderTienda(); renderTiendaDest(); renderTiendaTabs(); tiendaAvisos(); LOG('tienda', null, { k, equip: BOOTS_ST.equip });
    });
    tiendaLista.appendChild(d);
  }
}
let skinPrev = null;   // { c, k } que se está probando
function renderTiendaSkins() {
  const el = document.getElementById('tiendaSkins'); if (!el) return;
  const mon = document.getElementById('tiendaMon'); if (mon) mon.innerHTML = `${MONEDA_SVG}<b>${PROG.mon}</b>`;
  el.innerHTML = Object.entries(SKINS).map(([c, lista]) => {
    const ch = ALL_CHARS.find((x) => x.key === c); if (!ch) return '';
    const eq = skinOf(c), ops = [{ k: null, name: 'ORIGINAL', precio: 0, pal: [ch.color, '#2a3b8f', '#ffffff'] }, ...lista];
    return `<div class="skPj" data-c="${c}"><div class="skPjNom"><img src="${cBadgeImg(c)}" alt="">${ch.name}</div><div class="skOps">` + ops.map((o) => {
      const own = !o.k || SKINS_ST.owned.includes(c + ':' + o.k), es = (eq || null) === (o.k || null), pv = skinPrev && skinPrev.c === c && (skinPrev.k || null) === (o.k || null);
      const p = o.k ? skinPrecio(c, o.k) : 0, falta = !own && PROG.mon < p, sale = o.k && p !== o.precio;
      const btn = es ? 'EQUIPADA' : own ? 'EQUIPAR' : `${MONEDA_SVG}${p}`;
      return `<div class="skOp tiCard${es ? ' eq' : ''}${pv ? ' pv' : ''}" data-c="${c}" data-k="${o.k || ''}" style="--g1:${o.pal[0]};--g2:${o.pal[1]};--g3:${o.pal[2]}">` +
        `${sale && !own ? `<span class="tiDto">-${Math.round(OFERTA_DTO * 100)}%</span>` : ''}${es ? '<span class="tiEqTag">EQUIPADA</span>' : ''}` +
        `<button class="skVer" aria-label="Probar ${o.name}"><span class="tiArteZona"><img class="tiArte" src="${skArte(c, o.k)}" alt="" draggable="false" loading="lazy"></span>` +
        `<span class="tiCardNom"><b>${o.name}</b><small>${o.k ? 'ASPECTO' : 'ASPECTO BASE'}</small></span><span class="skPal">${o.pal.map((x) => `<i style="background:${x}"></i>`).join('')}</span></button>` +
        `${sale && !own ? `<s class="tiAntes">${o.precio}</s>` : ''}<button class="skBtn tiPrecio${es ? ' eq' : own ? ' own' : ''}${falta ? ' falta' : ''}"${es || falta ? ' disabled' : ''}>${btn}</button></div>`;
    }).join('') + '</div></div>';
  }).join('');
}
function renderTiendaTodo() { renderTiendaSkins(); renderTiendaDest(); renderTiendaPers(); renderTienda(); renderTiendaRecursos(); renderTiendaTabs(); tiendaAvisos(); }
function tiendaSkinVer(c, k) {   // prueba la skin en el PROBADOR (ficha) sin cambiar tu personaje elegido
  skinPrev = { c, k: k || null }; renderTiendaSkins();
  const pv = skinPrev;
  return refreshSkinsVisual(skinPrev).then(() => { if (skinPrev !== pv) return; probadorPinta(c, k); });
}
function probadorPinta(c, k) {
  const el = document.getElementById('tiendaProbador'); if (!el) return;
  const i = CHARS.findIndex((x) => x.key === c), url = renderProbador(i >= 0 ? i : c);   // update 46: porteros con su propio modelo
  const sk = (SKINS[c] || []).find((x) => x.k === k), ch = ALL_CHARS.find((x) => x.key === c);
  el.innerHTML = url ? `<img src="${url}" alt=""><div class="tpNom">${ch ? ch.name : ''}<small>${sk ? sk.name : 'ORIGINAL'}</small></div>` : '';
  el.dataset.c = c; el.dataset.k = k || '';
  tiendaDetInfo();
}
function tiendaDetInfo() {   // ficha: nombre, tipo, paleta y botón de compra / equipar (mismo precio que la tarjeta)
  const el = document.getElementById('tiendaDetInfo'), pr = document.getElementById('tiendaProbador'); if (!el || !pr) return;
  const c = pr.dataset.c, k = pr.dataset.k || null, ch = ALL_CHARS.find((x) => x.key === c); if (!ch) return;
  const sk = (SKINS[c] || []).find((x) => x.k === k), own = !k || SKINS_ST.owned.includes(c + ':' + k), es = (skinOf(c) || null) === k;
  const p = k ? skinPrecio(c, k) : 0, falta = !own && PROG.mon < p, pal = sk ? sk.pal : [ch.color, '#2a3b8f', '#ffffff'];
  document.querySelector('#tiendaDet .tiDetCaja')?.style.setProperty('--g1', pal[0]); document.querySelector('#tiendaDet .tiDetCaja')?.style.setProperty('--g2', pal[1]);
  el.innerHTML = `<small class="tiDetTipo">${k ? 'ASPECTO' : 'ASPECTO BASE'}</small><b class="tiDetNom">${sk ? sk.name : 'ORIGINAL'}</b><span class="tiDetPj"><img src="${cBadgeImg(c)}" alt="">${ch.name}</span>` +
    `<span class="skPal">${pal.map((x) => `<i style="background:${x}"></i>`).join('')}</span>${sk && p !== sk.precio && !own ? `<span class="tiDetOferta">OFERTA DEL DÍA -${Math.round(OFERTA_DTO * 100)}% · <s>${sk.precio}</s></span>` : ''}` +
    `<button class="tiPrecio tiDetBtn${es ? ' eq' : own ? ' own' : ''}${falta ? ' falta' : ''}" data-c="${c}" data-k="${k || ''}"${es || falta ? ' disabled' : ''}>${es ? 'EQUIPADA' : own ? 'EQUIPAR' : `COMPRAR ${MONEDA_SVG}${p}`}</button>`;
}
function tiendaDetAbrir(on) { const d = document.getElementById('tiendaDet'); if (!d) return; d.classList.toggle('visible', !!on); d.setAttribute('aria-hidden', on ? 'false' : 'true'); }
function tiendaSkinAccion(c, k) {   // comprar (si no es tuya) y equipar
  const own = !k || SKINS_ST.owned.includes(c + ':' + k);
  if (own) skinEquipar(c, k); else { const r = skinComprar(c, k); if (!r.ok) { sfx.miss && actx && sfx.miss(); return false; } sfx.steal && actx && sfx.steal(); tiendaCompraFx(c, k); }
  skinPrev = null; tiendaSkinVer(c, k); skinPrev = null; refreshSkinsVisual().then(() => { renderTiendaSkins(); tiendaDetInfo(); });
  renderTiendaSkins(); renderTiendaDest(); renderTiendaPers(); tiendaDetInfo(); lbMonedasRender && lbMonedasRender();
  LOG('tienda_skin', null, { c, k, equip: skinOf(c) });
  return true;
}
function tiendaCompraFx(c, k) {   // destello sobre la tarjeta comprada
  for (const e of document.querySelectorAll(`#tienda .tiCard[data-c="${c}"][data-k="${k || ''}"], #tiendaDet .tiDetCaja`)) { e.classList.remove('comprada'); void e.offsetWidth; e.classList.add('comprada'); }
}
tiendaEl.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('#tiendaDetX') || t.id === 'tiendaDet') { uiTap(); tiendaDetAbrir(false); return; }
  const db = t.closest('.tiDetBtn'); if (db) { tiendaSkinAccion(db.dataset.c, db.dataset.k || null); return; }
  const op = t.closest('.skOp');
  if (op) { const c = op.dataset.c, k = op.dataset.k || null;
    if (t.closest('.skBtn')) { tiendaSkinAccion(c, k); return; }
    uiTap(); tiendaSkinVer(c, k); tiendaDetAbrir(true); return; }
  const of = t.closest('.tiOferta');
  if (of) { const c = of.dataset.c, k = of.dataset.k;
    if (t.closest('.tiOfBtn')) { tiendaSkinAccion(c, k); return; }
    uiTap(); tiendaSkinVer(c, k); tiendaDetAbrir(true); return; }
  const pc = t.closest('.tiPers');
  if (pc && t.closest('.tiMejBtn')) { const r = progMejorar(pc.dataset.c); if (!r) { sfx.miss && actx && sfx.miss(); return; }
    sfx.dribble && actx && sfx.dribble(); renderTiendaTodo(); lbRender && lbRender(); lbMonedasRender && lbMonedasRender();
    const n = document.querySelector(`#tienda .tiPers[data-c="${r.k}"]`); n && n.classList.add('comprada'); return; }
  if (t.closest('.tiIrBotas') || t.closest('.tiBotaDest')) { uiTap(); tiendaIr('botas'); return; }
  if (t.closest('.tiAJugar')) { uiTap(); closeTienda(); return; }
});
function openTienda() { if (S.mode !== 'menu') return; skinPrev = null; tiendaDetAbrir(false); renderTiendaTodo(); tiendaEl.classList.add('visible'); tiendaIr('dest', false);
  try { localStorage.setItem(TI_VISTO_KEY, String(diaLocal())); } catch (_) {}
  // update 48: el probador (oculto hasta tocar una skin) se prepara DESPUÉS de la animación de entrada, en un rato libre (antes tironeaba al abrir)
  const c0 = SKINS[CHARS[sel].key] ? CHARS[sel].key : 'tiburon'; clearTimeout(openTienda.pv);
  openTienda.pv = setTimeout(function pv() {   // solo pinta la imagen del probador (no rehace la lista: un toque justo entonces no se pierde) y nunca mientras tocas
    if (!tiendaEl.classList.contains('visible') || skinPrev) return;
    if (performance.now() - PORT_INPUT < 1500) { openTienda.pv = setTimeout(pv, 400); return; }
    const go = () => { if (tiendaEl.classList.contains('visible') && !skinPrev && performance.now() - PORT_INPUT >= 1500) probadorPinta(c0, skinOf(c0)); };
    window.requestIdleCallback ? requestIdleCallback(go, { timeout: 500 }) : go(); }, 450);
  clearInterval(openTienda.tm); openTienda.tm = setInterval(() => { if (!tiendaEl.classList.contains('visible')) return clearInterval(openTienda.tm); const f = fmtFalta(msMedianoche()); for (const c of document.querySelectorAll('#tienda .tiChip')) c.lastChild.textContent = f; }, 20000); }
function closeTienda() { tiendaEl.classList.remove('visible'); tiendaDetAbrir(false); renderTiendaTabs(); tiendaAvisos(); if (skinPrev) { skinPrev = null; refreshSkinsVisual(); } skinGCLuego(); }   // update 42: fuera la prueba de skin
// ===================== update 48 (t106u): TAQUILLA =====================
// Elegir el aspecto EQUIPADO de cada personaje entre los que ya tienes (+ ORIGINAL). Usa el muñeco 3D del lobby (misma escena y
// renderer: sin contexto WebGL extra), con la cámara desplazada al hueco central; arrastrar = girar, deslizar rápido = otro personaje.
// Los porteros (Turtobola) usan su modelo de probador (pose GK_Idle). Tocar una tarjeta = se equipa al momento; los retratos y
// el resto del lobby se rehacen UNA vez al salir.
const TAQ = { open: false, c: null, dirty: false };
const taqEl = document.getElementById('taquilla');
const TAQ_RAREZA = { 300: ['ESPECIAL', '#5fd0ff'], 450: ['ÉPICA', '#d49bff'], 600: ['LEGENDARIA', '#ffd23f'] };
const taqChars = () => Object.keys(SKINS).filter((c) => ALL_CHARS.some((x) => x.key === c));
const taqOwned = (c) => (SKINS[c] || []).filter((x) => SKINS_ST.owned.includes(c + ':' + x.k));
function taqModel(c) { const i = CHARS.findIndex((x) => x.key === c); return i >= 0 ? menuChars[i] : probModel(c); }
function taqOpen(c) {
  if (S.mode !== 'menu' || !taqEl) return false;
  lbCerrar(true); if (tiendaEl.classList.contains('visible')) closeTienda();
  const cur = CHARS[sel] && CHARS[sel].key, lista = taqChars();
  TAQ.open = true; TAQ.dirty = false; TAQ.c = lista.includes(c) ? c : lista.includes(cur) ? cur : lista[0];
  menuEl.classList.add('taq'); taqEl.classList.add('visible'); taqEl.setAttribute('aria-hidden', 'false');
  taqRenderPjs(); taqShow(TAQ.c, true); taqLayout();
  requestAnimationFrame(() => { const b = taqEl.querySelector('.tqPj.sel'); if (b) b.scrollIntoView({ block: 'center' }); });
  sfx.dribble && actx && sfx.dribble(); LOG('taquilla', null, { c: TAQ.c });
  return true;
}
function taqClose() {
  if (!TAQ.open) return;
  TAQ.open = false; menuEl.classList.remove('taq'); taqEl.classList.remove('visible'); taqEl.setAttribute('aria-hidden', 'true');
  for (const g of Object.values(GK_PROB)) g.root.visible = false;
  menuChars.forEach((m, k) => { m.root.visible = k === sel; });
  menuCam.clearViewOffset(); menuCam.updateProjectionMatrix(); userYaw = 0; popT = 0;
  if (TAQ.dirty) { TAQ.dirty = false; refreshSkinsVisual(); }
  lbRender(); uiTap(); skinGCLuego();
}
function taqShow(c, pop) {
  TAQ.c = c; const m = taqModel(c);
  menuChars.forEach((x) => { x.root.visible = x === m; }); for (const g of Object.values(GK_PROB)) g.root.visible = g === m;
  if (m) {
    if ((m.model.userData.skin || null) !== skinOf(c)) applySkin(m.model, c, skinOf(c));
    if (pop) { popT = 0; userYaw = 0; const a = m.actions; if (a && a.Celebrate && a.Idle) { a.Celebrate.reset().setEffectiveWeight(1).play(); a.Idle.crossFadeTo(a.Celebrate, 0.12, false); } }
  }
  for (const b of taqEl.querySelectorAll('.tqPj')) b.classList.toggle('sel', b.dataset.c === c);
  taqRenderSkins();
}
function taqEquip(c, k) {
  if ((skinOf(c) || null) === (k || null)) return true;
  if (!skinEquipar(c, k)) return false;
  TAQ.dirty = true; const m = taqModel(c);
  if (m) { applySkin(m.model, c, k); popT = 0.55; userYaw += 0.9; }
  sfx.steal && actx && sfx.steal();
  taqRenderPjs(); taqRenderSkins();
  const card = taqEl.querySelector(`.tqSk[data-k="${k || ''}"]`); if (card) card.classList.add('pon');
  LOG('taquilla_equipar', null, { c, k: k || null });
  return true;
}
function taqStep(d) { const l = taqChars(), i = l.indexOf(TAQ.c); taqShow(l[(i + d + l.length) % l.length], true); const b = taqEl.querySelector('.tqPj.sel'); if (b) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
function taqRenderPjs() {
  const el = document.getElementById('taqPjs'); if (!el) return;
  el.innerHTML = taqChars().map((c) => { const ch = ALL_CHARS.find((x) => x.key === c), n = taqOwned(c).length, t = SKINS[c].length;
    return `<button class="tqPj${c === TAQ.c ? ' sel' : ''}" data-c="${c}" style="--c:${ch.color}"><img src="${cBadgeImg(c)}" alt="" draggable="false"><span>${ch.name}</span><em>${n}/${t}</em></button>`; }).join('');
  const tot = taqChars().reduce((a, c) => a + SKINS[c].length, 0), own = taqChars().reduce((a, c) => a + taqOwned(c).length, 0);
  const cu = document.getElementById('taqCuenta'); if (cu) cu.innerHTML = `ASPECTOS <b>${own}/${tot}</b>`;
}
function taqRenderSkins() {
  const el = document.getElementById('taqSkins'), c = TAQ.c; if (!el || !c) return;
  const ch = ALL_CHARS.find((x) => x.key === c), eq = skinOf(c) || null, own = taqOwned(c), faltan = SKINS[c].length - own.length;
  const ops = [{ k: null, name: 'ORIGINAL', pal: [ch.color, '#2a3b8f', '#ffffff'] }, ...own];
  el.innerHTML = ops.map((o) => { const es = (o.k || null) === eq, r = o.k ? (TAQ_RAREZA[o.precio] || ['ESPECIAL', '#5fd0ff']) : ['ASPECTO BASE', '#cfe3ff'];
    return `<button class="tqSk${es ? ' eq' : ''}" data-c="${c}" data-k="${o.k || ''}" style="--g1:${o.pal[0]};--g2:${o.pal[1]};--rc:${r[1]}" aria-pressed="${es}">` +
      `<img class="tqArte" src="${skArte(c, o.k)}" alt="" draggable="false"><b>${o.name}</b><small>${r[0]}</small><span class="tqUsar">${es ? 'EQUIPADA' : 'USAR'}</span></button>`; }).join('') +
    (faltan > 0 ? `<button class="tqSk tqMas" data-c="${c}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 9.5h13l-1.2 10.3a1.6 1.6 0 0 1-1.6 1.4H8.3a1.6 1.6 0 0 1-1.6-1.4z"/><path d="M9 9.5V7.6a3 3 0 0 1 6 0v1.9" fill="none"/></svg>` +
      `<b>${faltan} ${faltan === 1 ? 'ASPECTO' : 'ASPECTOS'} MÁS</b><small>EN LA TIENDA</small><span class="tqUsar">VER</span></button>` : '');
  const sk = SKINS[c].find((x) => x.k === eq);
  const nom = document.getElementById('taqSkNom'), pj = document.getElementById('taqPjNom');
  if (nom) { nom.textContent = sk ? sk.name : 'ORIGINAL'; nom.parentElement.style.setProperty('--pc', sk ? sk.pal[0] : ch.color); }
  if (pj) pj.textContent = ch.name;
}
// la cámara del lobby se desplaza (setViewOffset) para centrar el muñeco en el hueco entre la lista y las tarjetas, un poco más grande
function taqLayout() {
  if (!TAQ.open) return;
  const W = renderer.domElement.clientWidth || innerWidth, H = renderer.domElement.clientHeight || innerHeight;
  const L = document.getElementById('taqPjs').getBoundingClientRect(), R = document.getElementById('taqSkins').getBoundingClientRect();
  const l = Math.max(0, L.right), r = Math.min(W, R.left > l ? R.left : W);
  menuEl.style.setProperty('--tqL', (l / W * 100).toFixed(2) + '%'); menuEl.style.setProperty('--tqR', ((W - r) / W * 100).toFixed(2) + '%');
  taqEl.style.setProperty('--tqL', (l / W * 100).toFixed(2) + '%'); taqEl.style.setProperty('--tqR', ((W - r) / W * 100).toFixed(2) + '%');
  const z = 1.12, tx = (l + r) / 2, ty = H * 0.54;
  menuCam.setViewOffset(W, H, W / 2 - tx / z, H * 0.47 - ty / z, W / z, H / z); menuCam.updateProjectionMatrix();
}
for (const t of [window, window.visualViewport]) t && t.addEventListener('resize', () => requestAnimationFrame(taqLayout));
taqEl && taqEl.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('#taqVolver')) { taqClose(); return; }
  const pj = t.closest('.tqPj'); if (pj) { uiTap(); taqShow(pj.dataset.c, true); return; }
  const mas = t.closest('.tqMas'); if (mas) { const c = mas.dataset.c, k = (SKINS[c].find((x) => !SKINS_ST.owned.includes(c + ':' + x.k)) || {}).k;
    taqClose(); openTienda(); tiendaIr('skins', false); if (k) tiendaSkinVer(c, k); return; }
  const sk = t.closest('.tqSk'); if (sk) taqEquip(sk.dataset.c, sk.dataset.k || null);
});
document.getElementById('lbBtnTaq')?.addEventListener('click', () => { uiTap(); taqOpen(); });
document.getElementById('btnMenuTienda').addEventListener('click', openTienda);
document.getElementById('tiendaCerrar').addEventListener('click', () => { uiTap(); closeTienda(); });
tiendaAvisos();

// ===================== MODO PRÁCTICA (update 15) =====================
// Solo tu personaje y el balón en el campo completo, porterías vacías, sin tiempo. Marcador = goles / chuts.
// Tras gol o fuera el balón reaparece al instante delante del jugador.
function practiceBall(resetPos) {
  if (resetPos) { user.place(0, -6); user.vel.set(0, 0); user.face.set(0, 1); }
  Object.assign(user, { kickPending: null, stun: 0, celebrate: false });
  const f = user.face.lengthSq() > 0.01 ? user.face.clone().normalize() : new THREE.Vector2(0, 1);
  const bx = THREE.MathUtils.clamp(user.pos.x + f.x * 1.6, -SIDE_X + 1, SIDE_X - 1), by = THREE.MathUtils.clamp(user.pos.y + f.y * 1.6, -HL + 1.5, HL - 1.5);
  ball.pos.set(bx, by, BR); ball.vel.set(0, 0, 0); ball.w.set(0, 0, 0); ball.owner = null; ball.noCatch = null; ball.noCatchT = 0; ball.lineEvent = null; ball.backspin = 0;
  input.shootDown = false; input.charge = 0;
  S.mode = 'play';
}
// ---- update 32: marcador con badges, nombres apilados en 2 VS 2, animación del gol ----
function marcadorSet() {
  const pr = !!S.practice, m2 = !pr && matchKeys[2] && matchKeys[3];
  const C = (k) => ALL_CHARS.find((c) => c.key === k) || {};
  const bad = (k) => { const c = C(k); return c.key ? `<img src="${c.badge || c.card}" alt="${c.name || ""}" title="${c.name || ""}" draggable="false" style="--c:${c.color || '#fff'}">` : ''; };
  const side = (cls, ks) => { const eq = document.querySelector('#marcador .' + cls); if (!eq) return;
    eq.querySelector('.mBad').innerHTML = pr ? '' : ks.map(bad).join('');
    eq.querySelector('.mBad').classList.toggle('dos', ks.length > 1);
    eq.querySelector('.nom').innerHTML = pr ? (cls === 'azul' ? 'GOLES' : 'CHUTS') : ks.map((k) => `<b>${C(k).name || ''}</b>`).join(''); };
  side('azul', m2 ? [matchKeys[0], matchKeys[2]] : [matchKeys[0]]);
  side('rojo', m2 ? [matchKeys[1], matchKeys[3]] : [matchKeys[1]]);
  const mk = document.getElementById('marcador'); mk.classList.toggle('m2', !!m2); mk.classList.toggle('m32', true);
}
function marcGol(team) {
  const el = team === 0 ? elA : elB, eq = el.parentNode;
  for (const x of [el, eq]) { x.classList.remove('mPop'); void x.offsetWidth; x.classList.add('mPop'); }
  clearTimeout(marcGol['t' + team]); marcGol['t' + team] = setTimeout(() => { el.classList.remove('mPop'); eq.classList.remove('mPop'); }, 1300);
}
function applyPracticeHud() {
  const pr = !!S.practice;
  document.body.classList.toggle('practica', pr);
  for (const a of [rival, gkA, gkB, mateA, mateB]) if (a) { a.root.visible = !pr; if (pr) { a.place(0, 900); a.vel.set(0, 0); } }
  if (user) actors = pr ? [user] : [user, rival, gkA, gkB, mateA, mateB].filter(Boolean);
  const nm = (k) => ALL_CHARS.find((c) => c.key === k).name, m2 = !pr && matchKeys[2] && matchKeys[3];   // update 30: 2 VS 2 -> parejas
  document.querySelector('#marcador .azul .nom').textContent = pr ? 'GOLES' : m2 ? nm(matchKeys[0]) + ' + ' + nm(matchKeys[2]) : nm(matchKeys[0]);
  document.querySelector('#marcador .rojo .nom').textContent = pr ? 'CHUTS' : m2 ? nm(matchKeys[1]) + ' + ' + nm(matchKeys[3]) : nm(matchKeys[1]);
  if (pr) { elReloj.textContent = 'PRÁCTICA'; elReloj._t = 'P'; elReloj.classList.remove('poco'); }
  else { elReloj._t = fmt(S.time); elReloj.textContent = elReloj._t; }
  marcadorSet();
}
function practiceLine(ev) {
  if (ev.type === 'gol' && ev.s > 0) { S.score[0]++; S.goals++; avisoEvento('¡GOL!', 'bAzul'); confeti(0); sfx.goal(); }
  else avisoEvento(ev.type === 'gol' ? '¡EN PROPIA!' : (ev.type === 'fuera' && ev.z > GH - 0.3 ? '¡POR ENCIMA!' : '¡FUERA!'), '');   // update 44: sin cartel
  LOG(ev.type === 'gol' ? 'practica_gol' : 'practica_fuera', user, { s: ev.s });
  if (aim.active) aimEnd(null, true);
  if (ev.type === 'gol') { S.mode = 'goal'; S.pauseT = 1.8; ball.owner = null; user.kickPending = null; return; }   // se ve el balón en la red
  practiceBall(false);
}
// ===================== update 32: ESTADÍSTICAS DEL PARTIDO =====================
var MS = null;
const MS_KEYS = [['gol', 'Goles'], ['tiros', 'Tiros'], ['puerta', 'Tiros a puerta'], ['pos', 'Posesión'], ['pases', 'Pases'], ['regates', 'Regates'], ['robos', 'Robos / entradas'], ['paradas', 'Paradas'], ['esp', 'Especiales'], ['cab', 'Cabezazos']];
function MS_reset() {
  const T = () => ({ gol: 0, tiros: 0, puerta: 0, pos: 0, pases: 0, regates: 0, robos: 0, paradas: 0, esp: 0, cab: 0 });
  MS = { t: [T(), T()], pl: new Map(), pend: null, lastPass: null };
}
function MS_p(a) { if (!a || a.keeper) return null; let p = MS.pl.get(a); if (!p) { p = { a, gol: 0, tiros: 0, puerta: 0, pases: 0, regates: 0, robos: 0, cab: 0, esp: 0 }; MS.pl.set(a, p); } return p; }
function MS_add(a, k, n = 1) { if (!MS || !a || (a.team !== 0 && a.team !== 1)) return; MS.t[a.team][k] += n; const p = MS_p(a); if (p && k in p) p[k] += n; }
function MS_aGol(a, vel, pos) {   // ¿el balón va hacia la portería rival?
  const gy = goalCenter(a.team).y, vy = vel[1]; if (Math.abs(gy - pos[1]) > 34 || !vy || Math.sign(vy) !== Math.sign(gy - pos[1])) return false;
  const t = (gy - pos[1]) / vy; return Math.abs(pos[0] + vel[0] * t) < GW + 3;
}
function MS_onTarget() { const pd = MS.pend; if (!pd) return; MS.t[pd.team].puerta++; const p = MS_p(pd.a); if (p) p.puerta++; MS.pend = null; }
function MS_log(ev, a, x) {
  if (S.practice || !(S.mode === 'play' || S.mode === 'goal' || S.mode === 'kickoff')) return;
  if (MS.pend && S.t - MS.pend.t > 4) MS.pend = null;
  if (ev === 'tiro') {
    if (!a || a.keeper) return;
    if (x.vel && x.pos && MS_aGol(a, x.vel, x.pos)) { MS_add(a, 'tiros'); MS.pend = { team: a.team, a, t: S.t }; }
    else { MS_add(a, 'pases'); MS.lastPass = { team: a.team, t: S.t }; }   // TIRO/PASE suave hacia un compañero = pase
  } else if (ev === 'cabezazo') {
    MS_add(a, 'cab'); if (x.kind === 'tiro') { MS_add(a, 'tiros'); MS.pend = { team: a.team, a, t: S.t }; }
  } else if (ev === 'regate' || ev === 'patron' || ev === 'especial_esquiva') { if (ev !== 'especial_esquiva') MS_add(a, 'regates'); }   // update 35: los trucos del patrón cuentan como regates
  else if (ev === 'especial') { if (x.ok !== false) MS_add(a, 'esp'); }
  else if (ev === 'posesion') {
    const prev = ball.owner;
    if (a && a.keeper) { if (MS.pend && MS.pend.team !== a.team) { MS_onTarget(); MS_add(a, 'paradas'); } return; }
    if (prev && prev !== a && prev.team !== a.team && !prev.keeper) MS_add(a, 'robos');
    else if (!prev && MS.lastPass && MS.lastPass.team !== a.team && S.t - MS.lastPass.t < 3) MS_add(a, 'robos');   // intercepción de un pase
    if (a) MS.pend = null; MS.lastPass = null;
  } else if (ev === 'despeje' || ev === 'parada_palmeo' || ev === 'parada_larguero' || ev === 'portero_roza') {
    if (a && a.keeper && MS.pend && MS.pend.team !== a.team) { MS_onTarget(); MS_add(a, 'paradas'); }
  } else if (ev === 'fuera') MS.pend = null;
}
function MS_pass(a) { if (!MS || S.practice || !a || a.keeper) return; MS_add(a, 'pases'); MS.lastPass = { team: a.team, t: S.t }; }
function MS_goal(team) {
  if (!MS || S.practice) return; MS.t[team].gol++;
  const lt = ball.lastTouch;
  if (MS.pend && MS.pend.team === team) MS_onTarget(); else if (lt && lt.team === team && !lt.keeper) { MS.t[team].puerta++; const p = MS_p(lt); if (p) p.puerta++; }
  if (lt && lt.team === team && !lt.keeper) { const p = MS_p(lt); if (p) p.gol++; }
  MS.pend = null;
}
function MS_tick(dt) { if (!MS || S.practice) return; const o = ball.owner || ball.lastTouch; if (o && (o.team === 0 || o.team === 1)) MS.t[o.team].pos += dt; }
function MS_ev(k, a) { /* parada/palo: ya se cuentan por LOG */ }
function MS_get() {
  if (!MS) MS_reset();
  const [A, B] = MS.t.map((t) => ({ ...t })), pt = A.pos + B.pos;
  A.posP = pt > 0 ? Math.round(A.pos / pt * 100) : 50; B.posP = 100 - A.posP;
  for (const [t, s] of [[A, 0], [B, 1]]) { t.gol = S.score[s]; t.puerta = Math.max(t.puerta, t.gol); t.tiros = Math.max(t.tiros, t.puerta); }
  // MVP: solo jugadores de campo; desempate a favor del ganador
  const win = S.score[0] > S.score[1] ? 0 : S.score[1] > S.score[0] ? 1 : -1;
  let best = null, bv = -1;
  for (const a of [user, rival, mateA, mateB].filter(Boolean)) {
    const p = MS.pl.get(a) || { gol: 0, tiros: 0, puerta: 0, pases: 0, regates: 0, robos: 0, cab: 0, esp: 0 };
    const v = p.gol * 5 + p.puerta * 1.5 + p.tiros * 0.5 + p.pases * 0.4 + p.regates * 0.5 + p.robos * 1 + p.cab * 0.5 + p.esp * 0.5 + (a.team === win ? 0.6 : 0);
    if (v > bv) { bv = v; best = { key: a.charKey, team: a.team, gol: p.gol, tiros: p.tiros, robos: p.robos, pases: p.pases, v: +v.toFixed(1) }; }
  }
  return { A, B, mvp: best, score: S.score.slice() };
}
// ---- pantalla de estadísticas ----
const msEl = document.createElement('div'); msEl.id = 'msPanel'; msEl.setAttribute('role', 'dialog');
(document.getElementById('app') || document.body).appendChild(msEl);
msEl.addEventListener('pointerdown', (e) => e.stopPropagation());
let msGhost = 0; document.addEventListener('click', (e) => { if (performance.now() - msGhost < 450) { e.stopPropagation(); e.preventDefault(); } }, true);   // sin clic fantasma debajo al cerrar
function msHide() { msEl.classList.remove('visible'); clearTimeout(msShow.t); }
function msShow() {
  const R = MS_get(), C = (k) => ALL_CHARS.find((c) => c.key === k) || {};
  const m2 = matchKeys[2] && matchKeys[3], kA = m2 ? [matchKeys[0], matchKeys[2]] : [matchKeys[0]], kB = m2 ? [matchKeys[1], matchKeys[3]] : [matchKeys[1]];
  const bad = (ks) => ks.map((k) => `<img src="${C(k).badge || C(k).card}" alt="">`).join('');
  const nm = (ks) => ks.map((k) => C(k).name).join(' + ');
  const [a, b] = R.score;
  const rows = MS_KEYS.map(([k, lab]) => {
    const va = k === 'pos' ? R.A.posP : R.A[k], vb = k === 'pos' ? R.B.posP : R.B[k], tot = va + vb, pa = tot ? va / tot * 100 : 50;
    const fa = k === 'pos' ? va + '%' : va, fb = k === 'pos' ? vb + '%' : vb;
    return `<div class="msRow" data-k="${k}"><b class="msA${va > vb ? ' gana' : ''}">${fa}</b><div class="msMid"><span>${lab}</span><i><u style="width:${pa.toFixed(1)}%"></u></i></div><b class="msB${vb > va ? ' gana' : ''}">${fb}</b></div>`;
  }).join('');
  const mv = R.mvp, mc = mv ? C(mv.key) : null;
  msEl.innerHTML = `<div class="msCard">
    <div class="msHead"><div class="msEq azul"><span class="msBad">${bad(kA)}</span><span class="msNom">${nm(kA)}</span></div>
      <div class="msScore"><small>FINAL</small><div><span class="sa">${a}</span><em>-</em><span class="sb">${b}</span></div></div>
      <div class="msEq rojo"><span class="msNom">${nm(kB)}</span><span class="msBad">${bad(kB)}</span></div></div>
    <div class="msGrid">${rows}</div>
    <div class="msPie">${mv ? `<div class="msMvp ${mv.team === 0 ? 'azul' : 'rojo'}"><img src="${mc.badge || mc.card}" alt=""><div><small>MVP</small><b>${mc.name}</b><span>${mv.gol} gol${mv.gol === 1 ? '' : 'es'} · ${mv.tiros} tiros · ${mv.robos} robos</span></div></div>` : ''}
      <button id="msCont" class="msBtn">CONTINUAR</button></div></div>`;
  const bc = msEl.querySelector('#msCont'); let bd = false;   // toque fiable en móvil: pointerdown+pointerup sobre el botón (y click para teclado/ratón)
  bc.addEventListener('pointerdown', () => { bd = true; }); bc.addEventListener('pointerup', (e) => { if (bd) { e.stopPropagation(); msHide(); msGhost = performance.now(); } bd = false; }); bc.addEventListener('click', (e) => { e.stopPropagation(); msHide(); });
  msEl.classList.add('visible');
  LOG('estadisticas', null, { a: R.A, b: R.B, mvp: mv && mv.key });
}
function rotParada(k) {   // update 32
  MS_ev('parada', k);
  if (S.practice || S.mode !== 'play' || S.t - (S.paradaT || -9) < 1.2) return; S.paradaT = S.t;
  avisoEvento('¡PARADA!', k.team === 0 ? 'bAzul' : 'bRojo');   // update 44: sin cartel
}
function goalScored(team) {
  if (S.practice) { practiceLine({ type: 'gol', s: team === 0 ? 1 : -1 }); return; }
  S.score[team]++; S.goals++; MS_goal(team); LOG('gol', null, { team });
  elA.textContent = S.score[0]; elB.textContent = S.score[1]; marcGol(team);
  const lt = ball.lastTouch, propia = lt && !lt.keeper && lt.team !== team, gn = lt ? (ALL_CHARS.find((c) => c.key === lt.charKey) || {}).name : '';
  avisoEvento('¡GOOOL!', team === 0 ? 'bAzul' : 'bRojo', gn ? (propia ? 'EN PROPIA · ' + gn : gn) : ''); confeti(team); sfx.goal();   // update 44: sin cartel (confeti + sonido + marcador)
  S.mode = 'goal'; S.pauseT = 2.6; ball.owner = null;   // update 16: tiempo para ver el balón en la red
  for (const a of actors) { a.celebrate = a.team === team; a.kickPending = null; a.diveT = 0; a.tackleT = 0; a.kickAnimT = 0; }
}
// update 35: balón CONDUCIDO que sale entero del campo -> mismo evento que un balón suelto (fondo: gol entre palos o saque de puerta; banda: saque de banda)
function carriedLine(o) {
  const b = ball, p = prevBall;
  for (const s of [1, -1]) {
    // update 37: entre palos el jugador no puede meterse en la portería (choca con la red) -> basta con que el balón conducido
    // pase la línea con el centro (antes nunca llegaba a HL + BR y no había gol conduciendo)
    const yl = Math.abs(b.pos.x) < GW - BR ? s * (HL + 0.05) : s * (HL + BR);
    if ((b.pos.y - yl) * s >= 0) {
      const t = (p.y - yl) * s < 0 ? (yl - p.y) / ((b.pos.y - p.y) || 1e-6) : 0, xc = p.x + (b.pos.x - p.x) * t;
      b.lineEvent = Math.abs(xc) < GW ? { type: 'gol', s } : { type: 'fuera', s, z: BR, carried: true }; LOG('fuera_conduciendo', o, { s, x: +xc.toFixed(1) }); return;
    }
  }
}
// balón fuera por la línea de fondo (incl. por encima del larguero): saque de puerta del portero de ese lado
// update 35: por la banda -> saque de banda para el equipo que NO la tocó el último
function ballOut(ev) {   // update 37: solo línea de fondo (las bandas son paredes)
  S.mode = 'out'; S.pauseT = 1.3; S.outSide = ev.s; S.outKind = 'fondo';
  LOG('fuera', ball.lastTouch, { s: ev.s, k: S.outKind, carried: !!ev.carried, z: +(ev.z || 0).toFixed(2) });
  avisoEvento(ev.z > GH - 0.3 ? '¡POR ENCIMA!' : '¡FUERA!', '');   // update 44: sin cartel
  if (ball.owner) { ball.owner = null; ball.vel.set(0, 0, 0); }   // conducido: el balón se queda donde salió
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
  const cp = S.practice ? null : copasPartido(modoActual(), a, b);   // update 35: copas por modo
  const mon = S.practice ? 0 : monedasPartido(a, b);   // update 37: MONEDAS
  if (mon) { resultado.innerHTML += `<div class="rMonedas">${MONEDA_SVG}<b>+${mon}</b><span>MONEDAS · ${PROG.mon}</span></div>`; lbMonPend += mon; }
  if (cp) resultado.innerHTML += `<div class="rCopas ${cp.d >= 0 ? 'mas' : 'menos'}">${TRO_SVG}<b>${cp.d >= 0 ? '+' : ''}${cp.d}</b><span>${MODOS.find((m) => m.k === cp.modo).nom} · ${cp.copas}</span></div>`;
  if (S.comp) {   // update 24: partido de torneo / liga -> se guarda y se vuelve al cuadro / tabla
    showBanner(`FINAL ${a} - ${b}`, a > b ? 'bAzul' : a < b ? 'bRojo' : '', 1700);
    clearTimeout(endGame.t); endGame.t = setTimeout(() => { if (S.mode === 'end' && S.comp) { compAfterMatch(a, b); msShow(); } }, 1800);
    return;
  }
  document.getElementById('btnJugar').textContent = 'JUGAR OTRA VEZ';
  pantalla.classList.add('visible');
  clearTimeout(msShow.t); msShow.t = setTimeout(() => { if (S.mode === 'end') msShow(); }, 700);   // update 32
}
function fmt(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }

// ===================== BUCLE =====================
const prevBall = new THREE.Vector3(), _ownTgt = new THREE.Vector3(), _stepPrev = new THREE.Vector3();
// Turbo: el impulso se nota desde el primer frame (velocidad a tope de sprint en la dirección del joystick)
function turboKick(w) {
  if (!user || S.mode !== 'play' || S.paused) return;
  const wish = w || moveDir(); if (!wish || wish.lengthSq() < 0.04) return;
  if (user.stun > 0 || user.dashT > 0 || user.dribbleT > 0 || user.diveT > 0 || user.pm) return;
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
  u30UserWish(wish, playing, dt);   // update 30: cabezazo (salto en el aire, colocación bajo el balón)
  moveActor(user, canMove ? wish : new THREE.Vector2(), userSp, dt);
  if (user) stepJump(user, dt);
  if (input.shootDown) {
    if (ball.owner !== user) { input.shootDown = false; input.charge = 0; btnChutar.classList.remove('pulsado'); }
    else input.charge = Math.min(1, input.charge + dt / 0.85);
  }
  // --- rival IA ---
  if (!S.practice) {
  for (const a of fieldPlayers()) if (a !== user) botStep(a, playing, dt);   // update 30: rival (y en 2 VS 2 compañero y segundo rival)
  // --- porteros ---
  for (const k of [gkA, gkB]) {
    const r = playing ? aiKeeper(k, dt) : null;
    if (r && r.wish) { moveActor(k, r.wish, SPEED_GK * k.sf.ref * (k.fetidaT > 0 ? 0.6 : 1), dt); if (ball.owner !== k && k.diveT <= 0) k.face.copy(r.face); }
    else moveActor(k, new THREE.Vector2(), SPEED_GK, dt);
    stepGkJump(k, dt);   // update 30
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
  ball.noCatchT = Math.max(0, ball.noCatchT - dt); ball.hatT = Math.max(0, (ball.hatT || 0) - dt); ball.hatBeatT = ball.owner ? 0 : Math.max(0, (ball.hatBeatT || 0) - dt); ball.ownT = (ball.ownT || 0) + dt;
  if (ball.owner) {
    const o = ball.owner;
    if (o.keeper) {
      ball.pos.set(o.pos.x + o.face.x * 0.7 * ESCALA, o.pos.y + o.face.y * 0.7 * ESCALA, 1.1 * ESCALA + (o.kJumpZ || 0));   // update 30: en el aire, el balón sube con él
      ball.vel.set(0, 0, 0);
    } else {
      const off = ballOffset(o);
      const rx = o.face.y, ry = -o.face.x;   // derecha del jugador
      const tgt = _ownTgt.set(o.pos.x + o.face.x * off.fwd + rx * off.right, o.pos.y + o.face.y * off.fwd + ry * off.right, BR);   // update 35: sin new por frame
      ball.vel.set((tgt.x - ball.pos.x) / dt * 0.5, (tgt.y - ball.pos.y) / dt * 0.5, 0);
      ball.pos.lerp(tgt, Math.min(1, dt * (o.kickPending ? 16 : 20)));
      ball.pos.z = BR;
      ball.pos.x = THREE.MathUtils.clamp(ball.pos.x, -SIDE_X, SIDE_X); ball.pos.y = THREE.MathUtils.clamp(ball.pos.y, -WY + BR, WY - BR);   // update 37: pared de banda
      if (S.mode === 'play' && !ball.lineEvent) carriedLine(o);   // update 35: conducir el balón fuera del campo = fuera (antes se podía seguir fuera)
    }
    if (o.stun > 0) ball.owner = null;
  } else if (S.mode !== 'kickoff') {
    // subpasos para que los tiros rápidos no atraviesen postes
    const n = Math.ceil(Math.hypot(ball.vel.x, ball.vel.y, ball.vel.z) * dt / 0.15) || 1;
    for (let i = 0; i < Math.min(n, 8); i++) { const p = _stepPrev.copy(ball.pos); stepBall(dt / Math.min(n, 8), p); }   // update 35: sin clone por subpaso
    if (ball.postHit) {   // update 32: ¡PALO! / ¡LARGUERO!
      if (S.mode === 'play' && !ball.lineEvent && S.t - (S.paloT || -9) > 1) { S.paloT = S.t; LOG('palo', ball.lastTouch, { k: ball.postHit }); MS_ev('palo', ball.lastTouch); }   // update 34: sin rótulo ¡PALO! / ¡LARGUERO! (se sigue contando para las estadísticas)
      ball.postHit = null;
    }
  }
  if (playing) MS_tick(dt);   // update 32
  if (playing) {
    // contacto con jugadores de campo
    for (const a of fieldPlayers()) {
      if (ball.owner === a || a.stun > 0) continue;
      if (ball.noCatch === a && ball.noCatchT > 0) continue;
      if (ball.hatT > 0 && ball.hatBy !== a && !ball.owner) continue;
      if (ball.hatBeatT > 0 && !ball.owner && ball.hatBeat && ball.hatBeat.includes(a)) continue;                  // update 43: el defensor superado no corta el bote                                  // update 43: sombrerito subiendo: nadie lo toca
      if (a.pm && a.pm.type === 'hat' && a.pm.fly && ball.pos.z >= BALL_LOW && !ball.owner) continue;   // ni tu propio jugador lo cabecea al perseguirlo
      if (ESP.ventosa && ESP.ventosa.pull) continue;   // update 30: el balón va pegado hacia Tubi
      if (u30HeadContact(a)) continue;                 // update 30: cabezazo
      const d = Math.hypot(ball.pos.x - a.pos.x, ball.pos.y - a.pos.y);
      if (ball.owner && !ball.owner.keeper) {
        // robo: solo con entrada (dash) contra el poseedor
        const o = ball.owner; if (o.team === a.team) continue;   // update 30: al compañero no se le roba
        const dd = a.pos.distanceTo(o.pos);
        if ((a.dashT > 0 || a.dashEnded) && dd < (PR * 2 + 0.5) * a.sf.ent && ball.ownT > 0.55) {
          // FÍSICO vs ENTRADA: probabilidad (0-40 %) de aguantar la entrada sin perder el balón
          const keep = THREE.MathUtils.clamp(0.1 + (o.sf.t.fis - a.sf.t.ent) * 0.015, 0, 0.4);
          if (o.stickT > 0) {   // update 30: VENTOSA -> el balón está pegado
            a.dashT = 0; a.dashEnded = false; a.dashHit = true; a.stun = DASH_MISS_STUN;
            sfx.miss(); showBanner('¡PEGADO!', o.team === 0 ? 'bAzul' : 'bRojo', 700); LOG('ventosa_aguanta', o, { vs: NAME(a) });
          } else if (o.spikeT > 0) {   // update 37 (t83u): PINCHOS -> el que entra se pincha y rebota
            a.dashT = 0; a.dashEnded = false; a.dashHit = true; espPinch(o, a, true);
            showBanner('¡PINCHO!', o.team === 0 ? 'bAzul' : 'bRojo', 700); LOG('pinchos_entrada', o, { vs: NAME(a) });
          } else if (o.ghostT > 0 || o.flyT > 0 || o.regenT > 0 || o.magiaT > 0) {   // update 47: REGATE MÁGICO -> no le toca
              // update 29: SPRINT SOMBRA / VUELO NOCTURNO: la entrada no le toca; update 34: REGENERACIÓN (piel viscosa)
            a.dashT = 0; a.dashEnded = false; a.dashHit = true; a.stun = DASH_MISS_STUN;
            sfx.miss(); showBanner(o.flyT > 0 ? '¡POR ENCIMA!' : o.regenT > 0 ? '¡RESBALA!' : o.magiaT > 0 ? '¡REGATE!' : '¡SOMBRA!', o.team === 0 ? 'bAzul' : 'bRojo', 700); LOG('especial_esquiva', o, { vs: NAME(a) });
          } else if (o.dribbleT <= 0 && !patImmune(o, a) && Math.random() < keep) {
            a.dashT = 0; a.dashEnded = false; a.dashHit = true; a.stun = DASH_MISS_STUN;
            showBanner('¡AGUANTA!', o.team === 0 ? 'bAzul' : 'bRojo', 700); LOG('aguanta_entrada', o, { vs: NAME(a), p: +keep.toFixed(2) });
          } else if (o.dribbleT > 0 || patImmune(o, a)) {
            a.dashT = 0; a.dashEnded = false; a.dashHit = true; a.stun = DASH_MISS_STUN * (o.pm ? 1.6 : 1);   // update 35: truco bien hecho -> el defensor se queda vendido más tiempo
            sfx.miss(); showBanner('¡REGATE!', o.team === 0 ? 'bAzul' : 'bRojo', 700); LOG('regate_falla_entrada', o, { vs: NAME(a), truco: o.pm ? o.pm.k : null });
          } else {
            a.dashHit = true; a.dashT = 0; a.dashEnded = false; a.tackleT = Math.min(a.tackleT, 0.22);
            giveBall(a); sfx.steal(); showBanner('¡ROBO!', a.team === 0 ? 'bAzul' : 'bRojo', 700);
          }
        }
      } else if (!ball.owner && d < PR + BR + 0.15 && ball.pos.z < 1.05 * ESCALA && (a.jumpZ || 0) < 0.35) {   // solo balones bajos (pecho para abajo)
        const sp = Math.hypot(ball.vel.x, ball.vel.y);
        if (sp < 24 || a.dashT > 0) { giveBall(a); if (a.dashT > 0) a.tackleT = Math.min(a.tackleT, 0.22); a.dashT = 0; a.dashHit = true; a.dashEnded = false; }
        else { collideCircle2D(a.pos.x, a.pos.y, PR, 0.4); ball.lastTouch = a; }
      }
    }
    for (const a of fieldPlayers()) {
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
    if ((aim.kind === 'entrada' ? ball.owner === user : ball.owner !== user) || S.mode !== 'play') aimEnd(null, true);
    else if (!aim.shown && performance.now() - aim.t0 > AIM_SHOW_MS) { showAimJoy(true); aim.el.classList.add('apuntando'); }
  }
  if (PG.id !== null && (ball.owner !== user || S.mode !== 'play')) pgEnd(null, true);   // update 35: sin balón el patrón se cancela
  pgBufUpdate(dt);   // update 36
  // --- UI botones ---
  const hasBall = ball.owner === user || hatVivo();   // update 44: en el sombrerito siguen los botones de ataque
  if (!editor.on) {
    acciones.classList.toggle('con-balon', !!hasBall);
    acciones.classList.toggle('sin-balon', !hasBall);
  }
  const ring = (el, fill) => { if (!el) return; const v = Math.round(289 * (1 - Math.max(0, Math.min(1, fill)))); if (el._v !== v) { el._v = v; el.style.strokeDashoffset = v; } };   // update 35: pasos de 1/289 (antes 0,1: repintaba el SVG casi cada frame)
  ring(cargaAro, input.shootDown ? input.charge : (aim.active && aim.kind === 'chutar' && aim.dragged && !aim.cancel ? aim.power : 0));
  const altoC = aim.active && aim.kind === 'alto' && !aim.cancel ? (aim.dragged ? aim.power : 0) : -1;
  const qC = input.qT0 && hasBall ? altoCharge(input.qT0) : -1;   // teclado Q: carga por tiempo (solo teclado)
  ring(cargaAlto, Math.max(0, altoC, qC));
  updateChargeBar(qC);
  ring(cargaRegate, user ? (user.dribbleCd > 0 ? 1 - user.dribbleCd / DRIBBLE_CD : 1) : 1);
  ring(cargaEntrada, user ? (user.dashCd > 0 ? 1 - user.dashCd / DASH_CD_USER : 1) : 1);
  ring(cargaTurbo, user ? user.energy : 1);
  btnRegate.classList.toggle('cd', !!(user && user.dribbleCd > 0));
  if (btnPatron) { ring(cargaPatron, user ? (user.patCd > 0 ? 1 - user.patCd / (PAT.cd / THREE.MathUtils.clamp(user.sf.reg, 0.8, 1.2)) : 1) : 1); btnPatron.classList.toggle('cd', !!(user && (user.patCd > 0 || user.pm))); }   // update 35
  btnEntrada.classList.toggle('cd', !!(user && user.dashCd > 0));
  btnTurbo.classList.toggle('pulsado', !!input.turboDown);
  btnTurbo.classList.toggle('activo', !!(user && user.sprinting));
  btnTurbo.classList.toggle('vacio', !!(user && user.energy <= TURBO_MIN && !user.sprinting));
  espUI();
  u30UI();   // update 30
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
  flightMark = new THREE.Mesh(new THREE.RingGeometry(LAND_R - 0.22, LAND_R, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
  flightMark.renderOrder = 3;
  for (const o of [lobArc, lobGround, lobLand, flightMark]) { o.visible = false; o.frustumCulled = false; scene.add(o); }
  makeEfTrail();   // update 44
}
// update 44: ESTELA del tiro con EFECTO: puntos que se encogen detrás del balón mientras dura la curva (se ve la rosca en vuelo)
const EF_TRAIL_N = 26; let efTrail = null; const efTr = { pts: [], last: 0, hold: 0 };
function makeEfTrail() {   // update 44: estela del tiro con EFECTO (no depende de haber apuntado un CHUT ALTO antes)
  if (efTrail) return;
  efTrail = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.8, depthWrite: false }), EF_TRAIL_N);
  efTrail.visible = false; efTrail.frustumCulled = false; efTrail.renderOrder = 3; scene.add(efTrail);
}
function updateEfTrail() {
  if (!efTrail) { if (ball.owner || !(ball.fx && ball.fx.ef)) return; makeEfTrail(); }
  const now = performance.now(), act = !ball.owner && ball.fx && ball.fx.ef && ball.fx.efS > 0 && S.mode !== 'menu';
  if (act) efTr.hold = now + 380;
  if (act || (now < efTr.hold && !ball.owner)) { if (now - efTr.last > 28) { efTr.last = now; efTr.pts.push(ball.pos.x, ball.pos.y, ball.pos.z); if (efTr.pts.length > EF_TRAIL_N * 3) efTr.pts.splice(0, 3); } }
  else if (efTr.pts.length) efTr.pts.splice(0, 6);
  const n = efTr.pts.length / 3; efTrail.visible = n > 1; if (n < 2) return;
  for (let i = 0; i < n; i++) { const sc = 0.25 + 0.75 * (i + 1) / n; _m4.makeScale(sc, sc, sc).setPosition(efTr.pts[i * 3], efTr.pts[i * 3 + 2], -efTr.pts[i * 3 + 1]); efTrail.setMatrixAt(i, _m4); }
  efTrail.count = n; efTrail.instanceMatrix.needsUpdate = true;
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
const _efDir = new THREE.Vector2(), _efFx = { curve: 0, lift: 0, dip: 0, ef: 0, efS: 0, efS0: 0 };
function efFx(bf, pl) { _efFx.curve = bf ? bf.curve || 0 : 0; _efFx.lift = bf ? bf.lift || 0 : 0; _efFx.dip = bf ? bf.dip || 0 : 0; _efFx.ef = pl ? pl.ef : 0; _efFx.efS = pl ? pl.efS : 0; _efFx.efS0 = pl ? pl.efS0 || pl.efS : 0; return _efFx; }
function updateShotPreview() {   // update 15: con botas de efecto, el chut con mini-joystick enseña su trayectoria (curva / caída)
  lobArc.count = lobGround.count = LOB_DOTS;
  const bf = bootShot(aim.dir, false, true), pw = 0.35 + 0.65 * aim.power, sp = (tpOn() ? (TP_V0 + TP_V1 * pw) * Math.sqrt(user.sf.tir) : 13 + 19 * pw) * bf.speed;
  const pl = effectPlan(user, aim.dir, sp, tpOn() ? 0.8 : 1, null, null, ball.pos), d0 = _efDir.copy(aim.dir); if (pl) d0.rotateAround(_efO, pl.rot);   // update 34: el indicador enseña la curva en C
  const start = new THREE.Vector3(ball.pos.x + d0.x * 0.4, ball.pos.y + d0.y * 0.4, BR + 0.05);
  predictFlight(start, new THREE.Vector3(d0.x * sp, d0.y * sp, tpOn() ? 0.35 + 1.1 * pw * pw + (pl ? 0.2 * user.sf.cur : 0) : 0.8 + 3.2 * pw * pw + (pl ? 0.5 * user.sf.cur : 0)), _lobPts, 1.6, 1 / 120, efFx(bf, pl));
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
  lobArc.visible = lobGround.visible = !!(on || shotPrev); lobLand.visible = !!on && AJ.ocultaCaida !== true;   // update 33: diana de caída visible (como v31) salvo opción
  if (shotPrev && !on) { updateShotPreview(); return; }
  if (!on) return;
  if (!aim.dragged) aim.dir.copy(lobDir());
  aim.lobP = aim.dragged && !aim.cancel ? aim.power : 0;
  const lp = lobParams(aim.lobP, AJ.largoStat === false ? LOB_K_MAX() : lobStatK(user));
  const start = new THREE.Vector3(ball.pos.x + aim.dir.x * 0.4, ball.pos.y + aim.dir.y * 0.4, BR + 0.02);
  const bf = bootShot(aim.dir, true, true);
  const pl = effectPlan(user, aim.dir, lp.h * bf.speed, 0.85, null, null, ball.pos), d0 = _efDir.copy(aim.dir); if (pl) d0.rotateAround(_efO, pl.rot);   // update 34: curva en C también en el CHUT ALTO (trayectoria y diana reales)
  const land = predictFlight(start, new THREE.Vector3(d0.x * lp.h * bf.speed, d0.y * lp.h * bf.speed, lp.vz * bf.speed), _lobPts, 5, 1 / 120, efFx(bf, pl));
  let n = _lobPts.length / 3;
  if (AJ.ocultaCaida === true) {   // update 32 (opcional desde v33): indicador corto = solo la salida (~30 % del vuelo, máx. 6 m): da la dirección, NO dónde cae
    let m = Math.max(2, Math.round(n * 0.4));
    for (let i = 1; i < m; i++) if (Math.hypot(_lobPts[i * 3] - start.x, _lobPts[i * 3 + 1] - start.y) > 6) { m = i; break; }
    n = m;
  }
  aim.lobDots = n; lobArc.count = lobGround.count = AJ.ocultaCaida === true ? 9 : LOB_DOTS;   // corto: pocos puntos
  for (let i = 0; i < LOB_DOTS; i++) {
    const k = Math.min(n - 1, Math.round((i + 0.5) / LOB_DOTS * (n - 1))) * 3;
    const x = _lobPts[k], y = _lobPts[k + 1], z = _lobPts[k + 2];
    _m4.makeTranslation(x, z, -y); lobArc.setMatrixAt(i, _m4);
    _m4.makeTranslation(x, 0.03, -y); lobGround.setMatrixAt(i, _m4);
  }
  lobArc.instanceMatrix.needsUpdate = true; lobGround.instanceMatrix.needsUpdate = true;
  lobLand.position.set(land.x, 0, -land.y);
  lobLand.scale.setScalar(1 + 1.3 * (AJ.largoStat === false ? 0 : lobErrK(user)));   // update 44: diana más grande = chut alto impreciso (TIR baja)
  lobLand.children[0].material.color.setHex(0xffffff);   // update 22: diana de caída siempre blanca (sin pista verde/roja)
  aim.lobLand = { c: +aim.lobP.toFixed(2), x: +land.x.toFixed(2), y: +land.y.toFixed(2), peak: +land.peak.toFixed(2), dist: +land.dist.toFixed(2) };
  const perf = aim.lobP >= ALTO_PERFECT[0] && aim.lobP <= ALTO_PERFECT[1];
  void perf; lobArc.material.color.setHex(0xffffff);   // update 22: arco siempre blanco (sin pista de la zona perfecta)
}
function updateFlightMark() {
  if (!flightMark) return;
  const on = !ball.owner && (ball.pos.z > 1.4 || (ball.pos.z > BALL_LOW * 0.8 && landPt())) && S.mode !== 'menu';
  flightMark.visible = on;
  if (!on) return;
  const l = landPt() || predictFlight(ball.pos, ball.vel, null, 4, 1 / 60, ball.fx);
  flightMark.position.set(l.x, 0.04, -l.y);
  flightMark.scale.setScalar(1);   // update 31: radio fijo = zona real donde se puede cabecear
}
function updateAimLine() {
  updateEfTrail();   // update 44: la estela va aparte (no depende de la línea de apuntado)
  if (!aimLine) return;
  const on = aim.active && aim.shown && !aim.cancel && user && (aim.kind === 'entrada' ? ball.owner !== user : ball.owner === user) && S.mode === 'play';
  updateLobPreview(on && aim.kind === 'alto', on && aim.kind === 'chutar' && aim.dragged && (bootEquip() !== 'clasicas' || (user.sf.cur || 0) >= 0.12));   // update 44: con EFECTO se ve la curva al apuntar
  updateFlightMark();
  if (aimJoy) { const be = !!on && aim.kind === 'alto' && lobDeEspaldas(user, aim.dragged ? aim.dir : lobDir()); if (aimJoy._be !== be) { aimJoy._be = be; aimJoy.classList.toggle('deEspaldas', be); } }   // update 35
  aimLine.visible = !!on && aim.kind !== 'alto';
  if (!aimLine.visible) return;
  if (!aim.dragged) {      // mantenido sin arrastrar: enseña la dirección del toque rápido
    const md = moveDir();
    aim.dir.copy(md || (aim.kind === 'chutar' ? goalCenter(user.team).sub(user.pos).normalize() : aim.kind === 'entrada' ? user.face : aim.dir));
  }
  const isShot = aim.kind === 'chutar', isTk = aim.kind === 'entrada';
  const len = isShot ? (aim.dragged ? 5 + 15 * aim.power : 11) : isTk ? DASH_SPEED * (user.sf ? user.sf.ent : 1) * DASH_T + 1.6 : DRIBBLE_SPEED * DRIBBLE_T + 1.2;
  const u = aimLine.userData, start = 0.9 * ESCALA, w = isShot ? 0.42 : 0.5;
  u.mat.color.set(isShot ? (aim.dragged ? (aim.onGoal ? 0x5dff8a : new THREE.Color().setHSL(0.14 - 0.12 * aim.power, 1, 0.55)) : 0xffd23f) : isTk ? 0x4ec0ff : 0xd77bff);
  const body = Math.max(0.3, len - start - 1.25);
  for (const m of [u.strip, u.shadow]) { m.scale.set(m === u.shadow ? w + 0.16 : w, 1, body); m.position.z = -start; }
  u.head.position.z = -(start + body); u.headSh.position.z = -(start + body) + 0.12;
  aimLine.position.copy(g2tS(user.pos.x, user.pos.y, 0));
  aimLine.rotation.y = Math.atan2(-aim.dir.x, aim.dir.y);
}
function render(dt) {
  updateNet(dt);
  if (S.mode === 'menu') { renderMenu(dt); return; }
  if (campoDeco && campoDeco.update) campoDeco.update(dt, camera);   // update 39: partículas del campo (brasas, nieve, luciérnagas)
  for (const a of actors) a.sync(dt, S.t);
  espRender(dt);   // update 29: efectos de especiales (después de sync: tumbado / vuelo / resbalón)
  u30Render(dt);   // update 30: salto / estirada alta
  ballMesh.position.copy(g2tS(ball.pos.x, ball.pos.y, ball.pos.z));
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
    aimArrow.visible = true; aimArrow.position.copy(g2tS(user.pos.x, user.pos.y, 0.05));
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
  glowTick(now / 1000);   // update 46: ojos de color animado (skin SOMBRA)
  requestAnimationFrame(frame);
  if (HORIZONTAL && (++frame.n % 30) === 0 && vpKey() !== lastVP) onViewportChange();   // tamaño cambiado sin evento
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (window.__game.paused) return;   // solo para pruebas automáticas (avance manual con __game.advance)
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { window.__game.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; qualityTick(window.__game.fps); updateFpsMeter(); }
  if (S.paused) { if (ballMesh) render(0); return; }   // menú de pausa abierto: juego congelado
  if (S.mode !== 'menu' && S.mode !== 'end') update(dt); else { for (const a of actors) a.vel.multiplyScalar(0.8); }
  if (S.mode === 'menu' || ballMesh) render(dt);
}

// ===================== MENÚ DEL PARTIDO (update 42: mantener pulsado el marcador; antes: tocarlo = pausa) =====================
const pausaEl = document.getElementById('pausa'), marcadorEl = document.getElementById('marcador');
function resetInputs() {
  input.keys = {}; input.turboDown = false; releaseShoot(true);
  if (typeof pgEnd === 'function') pgEnd(null, true);   // update 35
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
  msHide();
  S.vsT = 0; showVsCards(false);
  S.paused = false; pausaEl.classList.remove('visible'); resetInputs();
  if (S.practice) { S.practice = false; applyPracticeHud(); }
  if (ballMesh) { ball.owner = null; ball.vel.set(0, 0, 0); espClear(); }
  LOG('salir_partido', null, {});
  const sc = S.comp; S.comp = null;
  openMenu();
  if (sc) openComp(sc.type);   // update 24: de vuelta al cuadro / tabla (el partido queda pendiente)
}
// update 42: ya NO hay botón de pausa ni pausa al tocar el marcador (un toque sin querer arriba a la izquierda abría "PAUSA" en mitad
// del partido). Salida discreta y deliberada: MANTENER PULSADO el marcador 0,8 s abre el menú del partido (seguir / salir / ajustes).
// Si la pestaña se oculta, requestAnimationFrame se detiene y el partido se congela en silencio (dt máx. 0,05 s al volver): sin cartel.
const MARC_HOLD = 800; let marcHold = null;
// update 44: en PRÁCTICA no se podía salir (Aritz tocaba el marcador como antes de la v42 y no pasaba nada; y en móvil real el gesto largo
// podía morir por un pointercancel del navegador). Ahora: en PRÁCTICA basta un TOQUE (no hay reloj, una pausa sin querer no cuesta nada);
// en partido sigue siendo MANTENER 0,8 s, pero robusto (captura del puntero, preventDefault, el pointercancel ya no lo anula) y un toque
// corto enseña la pista «MANTÉN PULSADO PARA EL MENÚ».
const marcPistaEl = document.createElement('div'); marcPistaEl.id = 'marcPista'; marcPistaEl.textContent = 'MANTÉN PULSADO PARA EL MENÚ'; document.body.appendChild(marcPistaEl);
let marcPistaT = 0;
function marcPista() {
  const b = marcadorEl.getBoundingClientRect(); marcPistaEl.style.left = Math.round(b.left) + 'px'; marcPistaEl.style.top = Math.round(b.bottom + 6) + 'px';
  marcPistaEl.classList.add('visible'); clearTimeout(marcPistaT); marcPistaT = setTimeout(() => marcPistaEl.classList.remove('visible'), 1600); LOG('marcador_pista', null, {});
}
const marcSoltar = () => { if (marcHold) { clearTimeout(marcHold.t); marcHold = null; } marcadorEl.classList.remove('manteniendo'); };
const marcPuede = () => ['play', 'kickoff', 'goal', 'out'].includes(S.mode) && !S.paused;
marcadorEl.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); if (e.cancelable) e.preventDefault(); marcSoltar(); if (!marcPuede()) return;
  try { marcadorEl.setPointerCapture(e.pointerId); } catch (er) {}
  marcadorEl.classList.add('manteniendo');
  marcHold = { id: e.pointerId, t0: performance.now(), t: setTimeout(() => { marcHold = null; marcadorEl.classList.remove('manteniendo'); marcPistaEl.classList.remove('visible'); openPause(); }, MARC_HOLD) };
});
marcadorEl.addEventListener('pointerup', (e) => {
  const h = marcHold; if (!h || h.id !== e.pointerId) return;
  marcSoltar(); if (!marcPuede()) return;
  if (S.practice) { openPause(); LOG('pausa_toque_practica', null, {}); } else marcPista();
});
marcadorEl.addEventListener('pointerleave', (e) => { if (marcHold && !marcadorEl.hasPointerCapture(e.pointerId) && e.pointerType === 'mouse') marcSoltar(); });   // dedo: con captura no se suelta por salirse un poco
marcadorEl.addEventListener('contextmenu', (e) => e.preventDefault());
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
{ // update 35: fondo del lobby con degradado (azul intenso arriba, violeta abajo)
  const cv = document.createElement('canvas'); cv.width = 2; cv.height = 256; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#173aa8'); gr.addColorStop(0.42, '#2f6ff0'); gr.addColorStop(0.7, '#3b63e6'); gr.addColorStop(1, '#5a33c4');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; menuScene.background = tx;
}
// update 46 (t98u "Vuelve al fondo de antes"): fondo del lobby de la v44 (degradado azul-violeta + rayos + pedestal);
// se quitan el estadio pintado, el aro neón y el foco de la v45.
const menuCam = new THREE.PerspectiveCamera(30, 9 / 16, 0.1, 100);
menuScene.add(new THREE.HemisphereLight(0xffffff, 0x5d6f9c, 1.3));
const mSun = new THREE.DirectionalLight(0xffffff, 2.0); mSun.position.set(-2.5, 4, 5); menuScene.add(mSun);
const burst = new THREE.Group();
{ // rayos de fondo planos, estilo pantalla de selección
  const N = 20, R = 40;
  for (let i = 0; i < N; i += 2) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); sh.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); sh.closePath();
    burst.add(new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.075, depthWrite: false })));
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
  refreshSkinsVisual();   // update 42: skins equipadas (retratos de nuevo cuando cargan las texturas)
}
// ===================== CARTAS (update 17) =====================
// Retratos: render offscreen de los modelos 3D reales del menú (con las botas equipadas) a una imagen por personaje.
const PORTRAITS = {};
// update 48 (optimización): los 23 retratos ya NO se pintan todos al arrancar (eran ~60% del tiempo hasta ver el menú: un
// readPixels + PNG por personaje). Se marcan "pendientes" y se pintan (mismo render, misma calidad) a ratos libres en el menú,
// o al momento si una carta los necesita (portrait(key)). Si cambian skins/botas se vuelven a marcar y la carta visible se
// repinta al pedirla.
const PORT_DIRTY = new Set(); let PORT_R = null, portTm = 0;
function portraitRes() {
  if (PORT_R) return PORT_R;
  const W = 600, H = 660;   // update 48: 2x (antes 300x330, se veía borroso en móviles DPR 2-3); mismo encuadre, contorno x2
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
  const ps = new THREE.Scene();
  ps.add(new THREE.HemisphereLight(0xffffff, 0x3a4566, 2.4));
  const dl = new THREE.DirectionalLight(0xffffff, 2.0); dl.position.set(2.5, 4, 5); ps.add(dl);
  const cam = new THREE.PerspectiveCamera(26, W / H, 0.05, 100);
  const buf = new Uint8Array(W * H * 4), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d'), img = cx.createImageData(W, H);
  return (PORT_R = { W, H, rt, ps, cam, buf, cv, cx, img });
}
function portraitNow(key, asinc) {   // asinc: PNG codificado fuera del hilo (toBlob) -> blob: URL (no ocupa el heap JS)
  const i = CHARS.findIndex((c) => c.key === key), m = menuChars[i]; PORT_DIRTY.delete(key); if (!m) return;
  try {
    const { W, H, rt, ps, cam, buf, cv, cx, img } = portraitRes();
    const prevRT = renderer.getRenderTarget(), pc = new THREE.Color(); renderer.getClearColor(pc); const pa = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    const parent = m.root.parent, vis = m.root.visible, sc = m.root.scale.x, ry = m.root.rotation.y;
    // misma pose que el retrato de siempre (inicio del Idle) aunque el muñeco ya se esté moviendo en el menú
    const run = m.mixer._actions.filter((a) => a.isRunning()), tKeep = m.mixer.time, rePose = run.length === 1 && run[0] === m.actions.Idle && tKeep > 0.001;
    if (rePose) m.mixer.setTime(0);
    ps.add(m.root); m.root.visible = true; m.root.scale.setScalar(1); m.root.rotation.y = -0.38;
    m.mixer.update(0.0001); m.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.model, true), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const h = size.y * 0.8, cy = box.max.y - h / 2 + size.y * 0.03;      // de las rodillas a la cabeza
    const dist = h / 2 / Math.tan(THREE.MathUtils.degToRad(13)) + size.z / 2;
    cam.position.set(ctr.x, cy + h * 0.08, ctr.z + dist); cam.lookAt(ctr.x, cy, ctr.z);
    setOutlinePx(W, H, 3.2); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(ps, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    cx.putImageData(img, 0, 0);
    if (asinc && cv.toBlob) {
      const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; c2.getContext('2d').drawImage(cv, 0, 0);
      c2.toBlob((b) => { if (!b || PORT_DIRTY.has(key)) return; const old = PORTRAITS[key]; PORTRAITS[key] = URL.createObjectURL(b); if (old && old.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(old), 4000); }, 'image/png');
      if (!PORTRAITS[key]) PORTRAITS[key] = '';   // (cuenta como pedido; la URL llega en unos ms)
    } else { const old = PORTRAITS[key]; PORTRAITS[key] = cv.toDataURL('image/png'); if (old && old.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(old), 4000); }
    parent.add(m.root); m.root.visible = vis; m.root.scale.setScalar(sc); m.root.rotation.y = ry;
    if (rePose) m.mixer.setTime(tKeep);
    renderer.setRenderTarget(prevRT); renderer.setClearColor(pc, pa); syncOutline();
  } catch (e) { console.info('retratos: se usan las imágenes', e); }
  if (!PORT_DIRTY.size && PORT_R) { PORT_R.rt.dispose(); PORT_R = null; }
}
function portrait(key) { if (PORT_DIRTY.has(key) || (PORTRAITS[key] === undefined && CHARS.some((c) => c.key === key))) portraitNow(key); return PORTRAITS[key] || undefined; }
function portraitPump() {   // de uno en uno, en ratos libres y solo fuera del partido
  portTm = 0; if (!PORT_DIRTY.size) return;
  if (S.mode === 'menu' && !document.hidden && !drag && performance.now() > portraitPump.desde && performance.now() - PORT_INPUT > 1500 && RUEDA.target === null && !RUEDA.drag) { const sk = CHARS[sel] && PORT_DIRTY.has(CHARS[sel].key) ? CHARS[sel].key : PORT_DIRTY.values().next().value; portraitNow(sk, true); }
  if (PORT_DIRTY.size) portTm = (window.requestIdleCallback ? requestIdleCallback(() => setTimeout(portraitPump, 40), { timeout: 400 }) : setTimeout(portraitPump, 90)) || 1;
}
portraitPump.desde = 0;
// update 48: nunca se pinta un retrato mientras el jugador toca la pantalla (ni 1,5 s después) o la rueda se mueve: cero tirones al usar el menú
let PORT_INPUT = 0;
for (const t of ['pointerdown', 'pointermove', 'touchstart', 'keydown', 'wheel']) window.addEventListener(t, () => { PORT_INPUT = performance.now(); }, { capture: true, passive: true });
function renderPortraits() {
  if (!window.__game || !window.__game.menuReady) portraitPump.desde = performance.now() + 1500;   // al arrancar: deja respirar al menú 1,5 s
  for (const c of CHARS) PORT_DIRTY.add(c.key);
  if (!portTm) portTm = setTimeout(portraitPump, 60);
}
// update 42: probador de la tienda: render del muñeco del menú (con su skin) a una imagen, como los retratos pero de cuerpo entero
// update 46: PORTEROS (Turtobola) en el probador/arte de la tienda: modelo propio en pose de reposo (no están en la rueda del menú)
function probModel(c) {
  if (GK_PROB[c]) return GK_PROB[c];
  if (!GLB[c] || CHARS.some((x) => x.key === c)) return null;
  const model = applyToon(matte(SkeletonUtils.clone(GLB[c].scene)), c); model.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
  const root = new THREE.Group(); root.add(model); root.visible = false; menuScene.add(root);
  const mixer = new THREE.AnimationMixer(model), clip = GLB[c].animations.find((a) => a.name === 'GK_Idle') || GLB[c].animations.find((a) => a.name === 'Idle');
  if (clip) { mixer.clipAction(clip).play(); mixer.update(0.4); }
  applySkin(model, c, skinOf(c));
  return (GK_PROB[c] = { root, model, mixer });
}
function renderProbador(i, W0 = 260, H0 = 320, k = 2) {   // update 48: k = resolución (2x: nítido en móviles DPR 2-3; mismo encuadre y contorno)
  const W = Math.round(W0 * k), H = Math.round(H0 * k);
  const m = typeof i === 'string' ? probModel(i) : menuChars[i]; if (!m) return null;
  try {
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const ps = new THREE.Scene(); ps.add(new THREE.HemisphereLight(0xffffff, 0x3a4566, 2.4));
    const dl = new THREE.DirectionalLight(0xffffff, 2.0); dl.position.set(2.5, 4, 5); ps.add(dl);
    const cam = new THREE.PerspectiveCamera(26, W / H, 0.05, 100);
    const prevRT = renderer.getRenderTarget(), pc = new THREE.Color(); renderer.getClearColor(pc); const pa = renderer.getClearAlpha();
    const parent = m.root.parent, vis = m.root.visible, sc = m.root.scale.x, ry = m.root.rotation.y;
    ps.add(m.root); m.root.visible = true; m.root.scale.setScalar(1); m.root.rotation.y = -0.45; m.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.model, true), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const h = size.y * 1.08, dist = h / 2 / Math.tan(THREE.MathUtils.degToRad(13)) + size.z / 2;
    cam.position.set(ctr.x, ctr.y + h * 0.05, ctr.z + dist); cam.lookAt(ctr.x, ctr.y, ctr.z);
    renderer.setClearColor(0x000000, 0); setOutlinePx(W, H, 1.8 * k); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(ps, cam);
    const buf = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    parent.add(m.root); m.root.visible = vis; m.root.scale.setScalar(sc); m.root.rotation.y = ry;
    renderer.setRenderTarget(prevRT); renderer.setClearColor(pc, pa); rt.dispose(); syncOutline();
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'), img = cx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    cx.putImageData(img, 0, 0); return cv.toDataURL('image/png');
  } catch (e) { console.info('probador', e); return null; }
}
const GUANTE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 21.5v-6.2L4.5 12a1.5 1.5 0 0 1 2.3-1.9L8.2 11.6V5.2a1.35 1.35 0 0 1 2.7 0v4.6V3.8a1.35 1.35 0 0 1 2.7 0v6V4.6a1.35 1.35 0 0 1 2.7 0v5.8V6.8a1.35 1.35 0 0 1 2.7 0v8.4c0 3.6-2.4 6.3-5.6 6.3z"/><path class="ln" d="M8 17.6h9.4"/></svg>';
function cardHTML(key, lv) {   // update 37: carta del NIVEL actual (categoría BRONCE…LEYENDA con su marco) y cartas de PORTERO
  const c = ALL_CHARS.find((x) => x.key === key), t = statsAt(key, lv ?? progLv(key)), gk = isGK(key);
  const bar = (k, nm, cls) => `<div class="cs ${cls}"><span>${nm.slice(0, 3)}</span><i><b style="width:${t[k]}%"></b></i><em>${t[k]}</em></div>`;
  const bars = gk ? GK_STAT_KEYS.map((k) => bar(k, GK_STAT_NAMES[k], 'gk')).join('')
    : STAT_KEYS.map((k, i) => bar(k, STAT_NAMES[k], i < 4 ? 'at' : 'de')).join('') + `<div class="cs ef"><span>EFE</span><i><b style="width:${t.cur || 0}%"></b></i><em>${t.cur || 0}</em></div>`;   // update 31: EFECTO
  const e = ESPECIALES[key];
  return `<div class="mlCard ${t.rareza}${gk ? ' portero' : ''}" data-k="${key}" data-lv="${t.lv}" style="--c:${c.color}">` +
    `<div class="mlMarco"></div><div class="mlFoto"><img src="${portrait(key) || c.card}" alt="" draggable="false"></div>` +
    `<div class="mlTop"><div class="mlMedia">${t.media}</div><div class="mlPos">${t.pos}</div></div><div class="mlRar">${t.tier}</div><div class="mlNv">NV ${t.lv}</div>` +
    `<div class="mlNom">${c.name}</div>` + (e ? `<div class="mlEsp" style="--ec:${e.col}">★ ${e.name}</div>` : '') +
    (gk ? `<div class="mlAD gkAD"><div class="mlG">${GUANTE_SVG}<span>PORTERO</span></div></div>` : `<div class="mlAD"><div class="mlA"><small>ATQ</small>${t.atq}</div><div class="mlD"><small>DEF</small>${t.def}</div></div>`) +
    `<div class="mlStats${gk ? ' gk' : ''}">${bars}</div><div class="mlBrillo"></div></div>`;
}
function playCardIn(el) { el.classList.remove('entra'); void el.offsetWidth; el.classList.add('entra'); }
const mCartaGrande = document.getElementById('mCartaGrande');
function showBigCard() { if (!mCartaGrande) return; mCartaGrande.innerHTML = cardHTML(CHARS[sel].key); playCardIn(mCartaGrande.firstChild); }
// colección navegable
const colEl = document.getElementById('coleccion'), colLista = document.getElementById('colLista');
let colIdx = 0;
const COL_KEYS = () => [...CHARS.map((c) => c.key), ...GK_ONLY];   // update 37: la colección incluye a los porteros
function openColeccion() {
  if (S.mode !== 'menu') return;
  colLista.innerHTML = COL_KEYS().map((k) => `<div class="colItem">${cardHTML(k)}<div class="colLema">${baseOf(k).lema}</div>${espHTML(k, 'colEsp')}</div>`).join('');
  [...colLista.children].forEach((d, i) => d.addEventListener('click', () => { if (i === colIdx) colElegir(); else colGo(i); }));
  colEl.classList.add('visible'); colGo(sel);
}
function colGo(i) {
  const ks = COL_KEYS(), n = ks.length;
  colIdx = (i + n) % n;
  [...colLista.children].forEach((d, k) => { let o = k - colIdx; if (o > n / 2) o -= n; if (o < -n / 2) o += n; d.classList.toggle('act', o === 0); d.classList.toggle('lejos', Math.abs(o) > 2); d.style.setProperty('--o', o); });
  playCardIn(colLista.children[colIdx].firstChild);
  const k = ks[colIdx];
  document.getElementById('colElegir').textContent = (isGK(k) ? 'PORTERO: ' : 'ELEGIR ') + cName(k);
}
function colElegir() { const k = COL_KEYS()[colIdx]; if (isGK(k)) alinSet({ gk: k }); else selectChar(colIdx); closeColeccion(); }
function closeColeccion() { colEl.classList.remove('visible'); }
document.getElementById('btnMenuCartas').addEventListener('click', openColeccion);
document.getElementById('colPrev').addEventListener('click', () => colGo(colIdx - 1));
document.getElementById('colNext').addEventListener('click', () => colGo(colIdx + 1));
document.getElementById('colElegir').addEventListener('click', () => colElegir());
document.getElementById('colMejorar').addEventListener('click', () => { const k = COL_KEYS()[colIdx]; closeColeccion(); abrirMejora(k); });
document.getElementById('colCerrar').addEventListener('click', closeColeccion);
// enfrentamiento al empezar el partido: tu carta vs la del rival
const vsEl = document.getElementById('vsCartas');
function showVsCards(on) {
  if (!vsEl) return;
  if (on) {
    const vb = (k) => `<img class="vsBadge" src="${cBadgeImg(k)}" alt="">`;   // update 30: badge del personaje sobre su carta
    if (matchKeys[2] && matchKeys[3]) vsEl.innerHTML = `<div class="vsPar izq"><div class="vsC izq">${vb(matchKeys[0])}${cardHTML(matchKeys[0], user && user.lv)}</div><div class="vsC izq">${vb(matchKeys[2])}${cardHTML(matchKeys[2], mateA && mateA.lv)}</div></div><div class="vsTxt">VS</div><div class="vsPar der"><div class="vsC der">${vb(matchKeys[1])}${cardHTML(matchKeys[1], rival && rival.lv)}</div><div class="vsC der">${vb(matchKeys[3])}${cardHTML(matchKeys[3], mateB && mateB.lv)}</div></div>`;
    else vsEl.innerHTML = `<div class="vsC izq">${vb(matchKeys[0])}${cardHTML(matchKeys[0], user && user.lv)}</div><div class="vsTxt">VS</div><div class="vsC der">${vb(matchKeys[1])}${cardHTML(matchKeys[1], rival && rival.lv)}</div>`;
    vsEl.classList.toggle('dos', !!(matchKeys[2] && matchKeys[3]));
    vsEl.classList.add('visible'); vsEl.querySelectorAll('.mlCard').forEach(playCardIn);
  } else vsEl.classList.remove('visible');
}
const mNombre = document.getElementById('mNombre'), mVs = document.getElementById('mVs'), mCartas = document.getElementById('mCartas');
function buildMenuUI() {
  mCartas.classList.toggle('muchas', CHARS.length > 8);   // update 22: 11 personajes -> rejilla de 6 columnas (2 filas)
  mCartas.classList.toggle('muchisimas', CHARS.length > 12);   // update 29: 15 personajes -> 8 columnas
  mCartas.classList.toggle('nueveCol', CHARS.length > 16);   // update 34: 17 personajes -> 9 columnas (2 filas, sin una carta suelta en una 3ª fila)
  mCartas.classList.toggle('onceCol', CHARS.length > 20);   // update 36: 21 personajes -> 11 columnas (2 filas: 11 + 10)
  mCartas.classList.toggle('diezCol', CHARS.length > 18 && CHARS.length <= 20);   // update 37: 20 de campo (sin porteros) -> 10 + 10
  CHARS.forEach((c, i) => {
    const d = document.createElement('div'); d.className = 'carta'; d.style.setProperty('--c', c.color);
    if (c.badge) d.classList.add('conBadge');
    d.innerHTML = `<div class="cartaFoto"><img src="${c.badge || c.card}" alt="" draggable="false"></div><div class="cartaNom">${c.name}</div><em class="cartaMed"></em>`;   // update 37: media + categoría
    d.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (i !== sel) selectChar(i); });
    mCartas.appendChild(d);
  });
  document.getElementById('mPrev').addEventListener('pointerdown', (e) => { e.preventDefault(); menuStep(-1); });
  document.getElementById('mNext').addEventListener('pointerdown', (e) => { e.preventDefault(); menuStep(1); });
  document.getElementById('btnMenuJugar').addEventListener('click', () => lobbyPlay());   // update 35: JUGAR lanza el modo elegido
  const st = document.getElementById('menuStage');
  st.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, x0: e.clientX, t: performance.now() }; try { st.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
  st.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; userYaw += (e.clientX - drag.x) * 0.012; drag.x = e.clientX; });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dtm = performance.now() - drag.t;
    if (TAQ.open) { if (Math.abs(dx) > 70 && (dtm < 300 || Math.abs(dx) / dtm > 0.2)) { userYaw -= dx * 0.012; taqStep(dx < 0 ? 1 : -1); } drag = null; return; }   // update 48: taquilla
    if (Math.abs(dx) > 70 && dtm < 300) { userYaw -= dx * 0.012; menuStep(dx < 0 ? 1 : -1); }   // deslizar rápido = cambiar
    else if (Math.abs(dx) < 8 && dtm < 400 && e.type === 'pointerup') lbAbrir('lbPers');   // update 35: tocar el muñeco = abrir la selección
    drag = null;
  };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  lbBuild();
}
function pickRival() {
  const others = CHARS.map((_, i) => i).filter((i) => i !== sel);
  rivalSel = others[Math.floor(Math.random() * others.length)];
}
function selectChar(i, celebrate = true, fromWheel = false) {
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
  if (!fromWheel && RUEDA.items.length) lbRuedaIr(sel);
  lbRender();
}
function menuStep(d) { if (S.mode === 'menu' && !TAQ.open) selectChar(sel + d); }
// ===================== LOBBY (update 35): perfil, copas por modo, rueda de personajes, JUGAR + modo =====================
const TRO_SVG = '<svg class="icoCopa" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v5a5 5 0 0 1-10 0zM10.5 13h3v3h-3zM8 16h8l1 4H7z"/><path class="asa" d="M7 5H4c0 3 1.5 4.5 3.5 4.8M17 5h3c0 3-1.5 4.5-3.5 4.8"/></svg>';
const MODOS = [
  { k: '1v1', nom: '1 VS 1', sub: 'PARTIDO RÁPIDO', col: '#3fa9ff', copas: true, ico: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.2l3.6 2.6-1.4 4.2H9.8L8.4 9.8z"/></svg>' },
  { k: '2v2', nom: '2 VS 2', sub: 'CON COMPAÑERO', col: '#ff8a2a', copas: true, ico: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3.2"/><circle cx="16" cy="8" r="3.2"/><path d="M2.5 19c.5-3.6 2.7-5.5 5.5-5.5s5 1.9 5.5 5.5M10.5 19c.5-3.6 2.7-5.5 5.5-5.5s5 1.9 5.5 5.5"/></svg>' },
  { k: 'liga', nom: 'LIGA', sub: 'TODOS CONTRA TODOS', col: '#a46bff', copas: true, ico: '<svg viewBox="0 0 24 24"><path d="M5 6h14M5 12h14M5 18h14"/></svg>' },
  { k: 'torneo', nom: 'TORNEO', sub: 'ELIMINATORIAS', col: '#ff5a7a', copas: true, ico: '<svg viewBox="0 0 24 24"><path d="M7 3h10v5a5 5 0 0 1-10 0zM7 5H4c0 3 1.5 4.5 3.5 4.8M17 5h3c0 3-1.5 4.5-3.5 4.8M10.5 13h3v3h-3zM8 16h8l1 4H7z"/></svg>' },
  { k: 'practica', nom: 'PRÁCTICA', sub: 'ENTRENAMIENTO', col: '#38c172', copas: false, ico: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" /></svg>' },
];
const MODO_COPAS = ['1v1', '2v2', 'liga', 'torneo'];
const RANGOS = [{ n: 'BRONCE', c: '#d98a4e', min: 0 }, { n: 'PLATA', c: '#cfd9ea', min: 150 }, { n: 'ORO', c: '#ffd23f', min: 400 }, { n: 'DIAMANTE', c: '#7cf2ff', min: 800 }, { n: 'LEYENDA', c: '#ff86dc', min: 1500 }];
const PERF_KEY = 'ml_perfil_v1';
function perfLoad() {
  let p = null; try { p = JSON.parse(localStorage.getItem(PERF_KEY) || 'null'); } catch (e) {}
  if (!p || typeof p !== 'object') p = {};
  const num = (v) => Math.max(0, Math.round(+v || 0));
  p.nombre = typeof p.nombre === 'string' && p.nombre.trim() ? nombreLimpio(p.nombre) : 'JUGADOR';
  const c = p.copas || {}, mx = p.max || {}; p.copas = {}; p.max = {};
  for (const k of MODO_COPAS) { p.copas[k] = num(c[k]); p.max[k] = Math.max(p.copas[k], num(mx[k])); }
  for (const k of ['xp', 'pj', 'pg', 'pe', 'pp', 'goles', 'titulos']) p[k] = num(p[k]);
  if (!MODOS.some((m) => m.k === p.modo)) p.modo = '1v1';
  p.visto = typeof p.visto === 'string' ? p.visto : '';
  return p;
}
function nombreLimpio(s) { return String(s).replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 14) || 'JUGADOR'; }
let PERF = perfLoad();
function perfSave() { try { localStorage.setItem(PERF_KEY, JSON.stringify(PERF)); } catch (e) {} }
const copasTotal = () => MODO_COPAS.reduce((s, k) => s + PERF.copas[k], 0);
function rangoDe(t) { let i = 0; while (i + 1 < RANGOS.length && t >= RANGOS[i + 1].min) i++; return { i, r: RANGOS[i], sig: RANGOS[i + 1] || null }; }
// nivel por experiencia: del nivel n al n+1 hacen falta 80 + 20n XP
function nivelDe(xp) { let n = 1, need = 100; while (xp >= need && n < 99) { xp -= need; n++; need = 80 + 20 * n; } return { n, xp, need }; }
// copas al acabar un partido: cuantas más tienes en ese modo, menos sube una victoria y más baja una derrota
function copasDelta(prev, gu, gr) {
  const tier = Math.floor(prev / 100);
  if (gu > gr) return Math.max(4, 10 - tier) + (gu - gr >= 3 ? 2 : 0);
  if (gu === gr) return 1;
  return -Math.min(prev, Math.min(10, 3 + tier) - (gr - gu === 1 ? 1 : 0));
}
function copasPartido(modo, gu, gr) {
  if (!MODO_COPAS.includes(modo)) return null;
  const prev = PERF.copas[modo], d = copasDelta(prev, gu, gr);
  PERF.copas[modo] = Math.max(0, prev + d); PERF.max[modo] = Math.max(PERF.max[modo], PERF.copas[modo]);
  PERF.pj++; if (gu > gr) PERF.pg++; else if (gu === gr) PERF.pe++; else PERF.pp++;
  PERF.goles += Math.max(0, gu | 0);
  PERF.xp += 10 + (gu > gr ? 10 : gu === gr ? 4 : 0) + 2 * Math.min(5, Math.max(0, gu | 0));
  perfSave(); lbPend.push(d); LOG('copas', null, { modo, d, total: PERF.copas[modo] });
  return { modo, d, copas: PERF.copas[modo] };
}
function copasTitulo(modo) {   // ganar la liga / el torneo
  if (!MODO_COPAS.includes(modo)) return 0;
  const d = 20; PERF.copas[modo] += d; PERF.max[modo] = Math.max(PERF.max[modo], PERF.copas[modo]);
  PERF.titulos++; PERF.xp += 40; perfSave(); lbPend.push(d); lbMonPend += monedasTitulo(modo);   // update 37: + monedas por título
  return d;
}
function modoActual() { return S.comp ? S.comp.type : (typeof is2v2 === 'function' && is2v2() ? '2v2' : '1v1'); }
const lbPend = [];   // cambios de copas pendientes de enseñar al volver al lobby
let lbMonPend = 0;   // update 37: monedas ganadas pendientes de animar en el lobby
const $id = (i) => document.getElementById(i);
const lbEls = {};
function lbBuild() {
  for (const i of ['lbAvatarImg', 'lbNivel', 'lbNombre', 'lbXpBar', 'lbXpTxt', 'lbCopasN', 'lbCopasBarI', 'lbRango', 'lbModoIco', 'lbModoNom', 'lbModoCopas', 'lbCopasTot', 'lbModo', 'lbRueda', 'lbRuedaItems', 'lbBtnNov']) lbEls[i] = $id(i);
  // tarjetas de modo (los botones de siempre: btnMenu2v2 / btnMenuLiga / btnMenuTorneo / btnMenuPractica)
  for (const b of menuEl.querySelectorAll('.lbModoCard')) {
    const m = MODOS.find((x) => x.k === b.dataset.modo); b.style.setProperty('--c', m.col);
    b.innerHTML = `<span class="lbMcIco">${m.ico}</span><span class="lbMcTxt"><b>${m.nom}</b><small>${m.sub}</small></span>` + (m.copas ? `<span class="lbMcCopas">${TRO_SVG}<b data-copas="${m.k}">0</b></span>` : '<span class="lbMcCopas sin">—</span>');
    b.addEventListener('click', () => { setModo(m.k); lbCerrar(); });
  }
  lbEls.lbModo.addEventListener('click', () => lbAbrir('lbModos'));
  $id('lbBtnPers').addEventListener('click', () => lbAbrir('lbPers'));
  $id('lbPersOk').addEventListener('click', () => lbCerrar());
  lbEls.lbCopasTot.addEventListener('click', () => lbAbrir('lbCopasPanel'));
  $id('lbBtnCopas').addEventListener('click', () => lbAbrir('lbCopasPanel'));
  lbEls.lbBtnNov.addEventListener('click', () => { PERF.visto = ASSET_V; perfSave(); lbAbrir('lbNovPanel'); });
  $id('lbPerfil').addEventListener('click', () => lbAbrir('lbPerfPanel'));
  for (const b of menuEl.querySelectorAll('.lbCerrar')) b.addEventListener('click', () => lbCerrar());
  for (const p of menuEl.querySelectorAll('.lbPanel')) p.addEventListener('pointerdown', (e) => { if (e.target === p) { e.preventDefault(); lbCerrar(); } });
  $id('lbNovCuerpo').innerHTML = NOVEDADES.map((n) => `<div class="lbNov" style="--c:${n.c}"><b>${n.t}</b><span>${n.d}</span></div>`).join('');
  lbBuild37();   // update 37
  lbRuedaBuild();
  lbListo = true;
  lbRender();
}
const NOVEDADES = [
  { t: 'TAQUILLA Y MÚSICA', d: 'Nuevo botón TAQUILLA en el menú: elige el aspecto de cada personaje entre los que tienes, viéndolo en 3D. Música nueva en el menú (se apaga en AJUSTES). Skins del gecko y de DJ Carnero mucho más nítidas, y en AJUSTES puedes FUSIONAR REGATE Y TURBO: mantén TURBO y mueve el pulgar para regatear sin soltarlo.', c: '#ff5fa2' },   // update 48
  { t: 'NUEVO: DANTE', d: 'Llega DANTE, mediapunta con el mejor REGATE de la liga, mucho EFECTO y precisión. Su ESPECIAL «REGATE MÁGICO»: con el balón, 3 s de regate mágico: más rápido, las entradas no le tocan y los rivales cercanos se quedan mareados. Ya juega en LIGA y TORNEO.', c: '#6cace4' },   // update 47 (t104u)
  { t: 'NUEVO: KALEDY', d: 'Llega KALEDY, delantero centro con el mejor TIRO de la liga. Su ESPECIAL «TRALLAZO»: con el balón suelta un trallazo de hoja seca a la escuadra y el portero reacciona tarde. Ya juega en LIGA y TORNEO.', c: '#d4202a' },   // update 47
  { t: '¡20.000 MONEDAS DE REGALO!', d: 'Te hemos regalado 20.000 monedas para la TIENDA: skins, personajes y mejoras de cartas. ¡Gástalas!', c: '#ffb700' },   // update 47
  { t: 'GECKO SIN GELATINA', d: 'Licky Gecko ya no se deforma al moverse: cuerpo y cabeza firmes en todas las animaciones; solo se mueven la cola, los brazos y las piernas.', c: '#2bd96b' },   // update 47
  { t: 'NUEVO LICKY GECKO', d: 'Licky Gecko estrena modelo y 3 skins en la TIENDA: SOMBRA ARCOÍRIS (negro con ojos que cambian de color), CEBRA MONOCROMO y GECKO GALAXIA. Y skins nuevas para BAT VAMPIRE, CONAZO y TURTOBOLA (tu portero la lleva puesta).', c: '#2bd96b' },   // update 46
  { t: 'CHUT ALTO MÁS FLOJO', d: 'El chut alto llega menos lejos (sobre todo con poco TIRO) y, con poco TIRO, la trompa de apuntar se estira mucho más rápido. La TIENDA ya se desliza con el dedo y vuelve el fondo de siempre.', c: '#4fd1ff' },   // update 46
  { t: 'TIENDA NUEVA', d: 'Por secciones: OFERTA DEL DÍA (-20 %, cambia a medianoche), SKINS con su ficha y probador, MEJORA de PERSONAJES, BOTAS gratis y cómo ganar MONEDAS.', c: '#ff5ac8' },   // update 45
  { t: 'CAMPOS NUEVOS', d: 'Juega en el VOLCÁN, en el HIELO o en el BOSQUE DE SETAS (o en el estadio de siempre). Elige el CAMPO arriba en el menú, o ALEATORIO.', c: '#ff8a1e' },   // update 39
  { t: 'TURBO Y REGATES', d: 'TURBO ya no regatea: mantén para esprintar. Los regates, con el botón REGATES (dibuja el patrón), siempre a mano.', c: '#19c9b0' },   // update 38
  { t: 'CARTAS CON NIVEL', d: 'Todas empiezan en BRONCE. Gana MONEDAS jugando y MEJORA tus cartas: PLATA, ORO, DIAMANTE y LEYENDA. Cada personaje crece a su manera.', c: '#ffd23f' },
  { t: 'PORTEROS DE VERDAD', d: 'BUTÓN y TURTOBOLA son solo porteros, con stats de portero y su especial bajo palos.', c: '#38c172' },
  { t: 'ALINEACIÓN', d: 'Elige tu portero y, en 2 VS 2, tu DÚO. Se guarda para tus partidos.', c: '#2fb6ff' },
  { t: 'MUSHOM', d: 'Nuevo personaje: ESPORAS que marean al rival y le hacen soltar el balón.', c: '#c77dff' },
  { t: 'CACUTU', d: 'Nuevo personaje: el cactus del bombín. PINCHOS: se eriza y quien se le acerca o le entra se pincha.', c: '#9be05a' },
  { t: 'SIN SAQUES DE BANDA', d: 'Las bandas son paredes: el balón rebota y el juego sigue.', c: '#5ea0ff' },
  { t: 'ENTRADA CON DIRECCIÓN', d: 'Arrastra desde ENTRADA para elegir hacia dónde: flecha en el campo y sale al soltar. Toque rápido = entrada automática.', c: '#4ec0ff' },
  { t: 'CHUT ALTO MÁS JUSTO', d: 'El chut alto/largo es más flojo: con TIR 99 rinde como antes con 70.', c: '#ff8a2a' },
  { t: 'FROGETTO', d: 'Sombrero retocado por detrás: banda morada continua y sin estrellas mal pintadas.', c: '#2fa39a' },
];
function lbAbrir(id) {
  lbCerrar(true);
  const p = $id(id); if (!p) return;
  if (id === 'lbCopasPanel') lbCopasHTML(); else if (id === 'lbPerfPanel') lbPerfHTML(); else if (id === 'lbPers') showBigCard(); else if (id === 'lbMejora') mejoraHTML(true); else if (id === 'lbAlin') alinHTML();   // update 37
  p.classList.add('visible'); menuEl.classList.add('conPanel'); updateOrient();   // update 42
  sfx.dribble && actx && sfx.dribble();
}
function lbCerrar(silent) {
  const inp = $id('lbNombreIn'); if (inp && menuEl.querySelector('#lbPerfPanel.visible')) { PERF.nombre = nombreLimpio(inp.value); perfSave(); }
  for (const p of menuEl.querySelectorAll('.lbPanel.visible')) p.classList.remove('visible');
  menuEl.classList.remove('conPanel'); if (!silent) lbRender(); updateOrient();
}
function setModo(k) {
  if (!MODOS.some((m) => m.k === k)) return;
  PERF.modo = k; perfSave(); lbRender();
  const b = lbEls.lbModo; if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
}
function lbRender() {
  if (!lbEls.lbNombre) return;
  const c = CHARS[sel];
  lbEls.lbAvatarImg.src = c.badge || c.card; menuEl.style.setProperty('--selc', c.color);
  { const tc = document.getElementById('lbTaqCnt'); if (tc) tc.textContent = SKINS[c.key] ? `${taqOwned(c.key).length}/${SKINS[c.key].length}` : ''; }   // update 48: aspectos tuyos de este personaje
  lbEls.lbNombre.textContent = PERF.nombre;
  const nv = nivelDe(PERF.xp); lbEls.lbNivel.textContent = nv.n; lbEls.lbXpBar.style.width = (nv.xp / nv.need * 100).toFixed(1) + '%'; lbEls.lbXpTxt.textContent = `${nv.xp}/${nv.need}`;
  const tot = copasTotal(), rg = rangoDe(tot);
  lbEls.lbCopasN.textContent = tot; lbEls.lbRango.textContent = rg.r.n; lbEls.lbCopasTot.style.setProperty('--rc', rg.r.c);
  lbEls.lbCopasBarI.style.width = (rg.sig ? (tot - rg.r.min) / (rg.sig.min - rg.r.min) * 100 : 100).toFixed(1) + '%';
  const m = MODOS.find((x) => x.k === PERF.modo);
  lbEls.lbModoIco.innerHTML = m.ico; lbEls.lbModo.style.setProperty('--c', m.col); lbEls.lbModoNom.textContent = m.nom;
  lbEls.lbModoCopas.textContent = m.copas ? PERF.copas[m.k] : '—'; lbEls.lbModo.classList.toggle('sinCopas', !m.copas);
  for (const b of menuEl.querySelectorAll('[data-copas]')) b.textContent = PERF.copas[b.dataset.copas];
  for (const b of menuEl.querySelectorAll('.lbModoCard')) b.classList.toggle('sel', b.dataset.modo === PERF.modo);
  lbEls.lbBtnNov.classList.toggle('nuevo', PERF.visto !== ASSET_V);
  mVs.style.visibility = PERF.modo === '1v1' ? '' : 'hidden';
  lbMonedasRender();   // update 37
  mCartas.querySelectorAll('.carta').forEach((d, i) => { const t = statsAt(CHARS[i].key, progLv(CHARS[i].key)), e = d.querySelector('.cartaMed'); if (e) { e.textContent = t.media; e.className = 'cartaMed t-' + t.rareza; } });
}
function lbMostrarPend() {   // "+8" que sube desde el contador de copas al volver de un partido
  if (!lbPend.length) return;
  const d = lbPend.reduce((s, x) => s + x, 0); lbPend.length = 0;
  const t = document.createElement('div'); t.className = 'lbDelta ' + (d >= 0 ? 'mas' : 'menos'); t.innerHTML = `${TRO_SVG}${d >= 0 ? '+' : ''}${d}`;
  lbEls.lbCopasTot.appendChild(t); setTimeout(() => t.remove(), 2200);
  lbEls.lbCopasTot.classList.remove('late'); void lbEls.lbCopasTot.offsetWidth; lbEls.lbCopasTot.classList.add('late');
}
function lbCopasHTML() {
  const tot = copasTotal(), rg = rangoDe(tot);
  const filas = MODOS.filter((m) => m.copas).map((m) => `<div class="lbCpFila" style="--c:${m.col}"><span class="lbMcIco">${m.ico}</span><b>${m.nom}</b><span class="lbCpN">${TRO_SVG}${PERF.copas[m.k]}</span><small>MÁX ${PERF.max[m.k]}</small></div>`).join('');
  const esc = RANGOS.map((r, i) => `<span class="lbRg${i === rg.i ? ' yo' : i < rg.i ? ' ok' : ''}" style="--rc:${r.c}"><b>${r.n}</b><small>${r.min}</small></span>`).join('');
  $id('lbCopasCuerpo').innerHTML = `<div class="lbCpTot" style="--rc:${rg.r.c}">${TRO_SVG}<b>${tot}</b><span>${rg.r.n}</span></div><div class="lbCpLista">${filas}</div><div class="lbRangos">${esc}</div><div class="lbCpNota">Ganar suma copas en ese modo; perder resta. Ganar una liga o un torneo: +20.</div>`;
}
function lbPerfHTML() {
  const nv = nivelDe(PERF.xp), c = CHARS[sel];
  $id('lbPerfCuerpo').innerHTML = `<div class="lbPfTop"><span class="lbAvatar grande" style="--selc:${c.color}"><img src="${c.badge || c.card}" alt=""></span><label class="lbPfNom"><small>NOMBRE</small><input id="lbNombreIn" maxlength="14" value="${PERF.nombre}" autocomplete="off" spellcheck="false"></label><span class="lbNivel grande"><b>${nv.n}</b></span></div>` +
    `<div class="lbPfStats"><span><b>${PERF.pj}</b>PARTIDOS</span><span><b>${PERF.pg}</b>VICTORIAS</span><span><b>${PERF.pe}</b>EMPATES</span><span><b>${PERF.pp}</b>DERROTAS</span><span><b>${PERF.goles}</b>GOLES</span><span><b>${PERF.titulos}</b>TÍTULOS</span></div>`;
  const inp = $id('lbNombreIn');
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
  inp.addEventListener('change', () => { PERF.nombre = nombreLimpio(inp.value); inp.value = PERF.nombre; perfSave(); lbRender(); });
}
// ===================== update 37: MONEDAS · MEJORAR CARTA · ALINEACIÓN =====================
const MONEDA_SVG = '<svg class="icoMoneda" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.6"/><circle class="in" cx="12" cy="12" r="6.6"/><path class="st" d="M12 7.6l1.35 2.75 3.03.44-2.19 2.13.52 3.02L12 14.52l-2.71 1.42.52-3.02-2.19-2.13 3.03-.44z"/></svg>';
let mejK = null;   // personaje que se está mejorando
const mejLista = () => [...CHARS.map((c) => c.key), ...GK_ONLY];
function abrirMejora(k) { mejK = k || CHARS[sel].key; lbAbrir('lbMejora'); }
function mejoraHTML(anim) {
  const k = mejK, L = PROG.lv[k] || 0, cur = statsAt(k, L), max = L >= LV_MAX, nxt = max ? cur : statsAt(k, L + 1), cost = lvCost(L), gk = isGK(k);
  const ks = statKeysOf(k), names = gk ? GK_STAT_NAMES : STAT_NAMES;
  const filas = [...ks, ...(gk ? [] : ['cur'])].map((x) => {
    const d = (nxt[x] || 0) - (cur[x] || 0);
    return `<div class="mjFila${d > 0 ? ' sube' : ''}"><span>${names[x]}</span><i><b style="width:${cur[x]}%"></b>${d > 0 ? `<u style="left:${cur[x]}%;width:${d}%"></u>` : ''}</i><em>${cur[x]}</em><strong>${d > 0 ? '+' + d : ''}</strong></div>`;
  }).join('');
  // barra de categorías por MEDIA (55-99) con las marcas de cada una
  const pc = (m) => THREE.MathUtils.clamp((m - 55) / 44 * 100, 0, 100).toFixed(1);
  const marcas = TIERS.map((t, i) => `<span class="mjT t-${t.k}${cur.rareza === t.k ? ' yo' : ''}" style="left:${pc(i ? t.min : 55)}%"><b>${t.n}</b></span>`).join('');
  const leg = statsAt(k, LV_MAX);
  $id('lbMejCarta').innerHTML = cardHTML(k, L); if (anim) playCardIn($id('lbMejCarta').firstChild);
  $id('lbMejInfo').innerHTML =
    `<div class="mjCab"><span class="mjNv">NV <b>${L}</b><small>/${LV_MAX}</small></span><span class="mjTier t-${cur.rareza}">${cur.tier}</span><span class="mjMed">MEDIA <b>${cur.media}</b>${max ? '' : ` → <b class="${nxt.media > cur.media ? 'up' : ''}">${nxt.media}</b>`}</span></div>` +
    `<div class="mjBarra"><i style="width:${pc(cur.media)}%"></i>${max ? '' : `<u style="left:${pc(cur.media)}%;width:${(pc(nxt.media) - pc(cur.media)).toFixed(1)}%"></u>`}<em style="left:${pc(leg.media)}%" title="LEYENDA"></em>${marcas}</div>` +
    (nxt.rareza !== cur.rareza ? `<div class="mjSubeTier t-${nxt.rareza}">¡CON ESTA MEJORA PASA A ${nxt.tier}!</div>` : '') +
    `<div class="mjLista">${filas}</div>` +
    `<div class="mjPie"><span class="mjSaldo">${MONEDA_SVG}<b>${PROG.mon}</b></span><span class="mjTope">LEYENDA: MEDIA ${leg.media}</span></div>`;
  const b = $id('lbMejBtn');
  b.disabled = max || PROG.mon < cost;
  b.innerHTML = max ? 'NIVEL MÁXIMO' : `MEJORAR <span class="mjCoste">${MONEDA_SVG}${cost}</span>`;
  b.classList.toggle('falta', !max && PROG.mon < cost);
  $id('lbMejNom').textContent = cName(k) + (gk ? ' · PORTERO' : '');
}
function mejorarAhora() {
  const r = progMejorar(mejK); if (!r) { sfx.miss && sfx.miss(); return null; }
  mejoraHTML(true); lbRender();
  const c = $id('lbMejCarta'); c.classList.remove('sube', 'subeTier'); void c.offsetWidth; c.classList.add(r.subeTier ? 'subeTier' : 'sube');
  if (r.subeTier) { const t = document.createElement('div'); t.className = 'mjFlash t-' + r.desp.rareza; t.textContent = '¡' + r.desp.tier + '!'; c.appendChild(t); setTimeout(() => t.remove(), 1800); }
  sfx.dribble && actx && sfx.dribble();
  return r;
}
function mejPaso(d) { const l = mejLista(); mejK = l[(l.indexOf(mejK) + d + l.length) % l.length]; mejoraHTML(true); }
// update 42: aviso corto en el menú (p. ej. ALINEACIÓN GUARDADA)
function toastMenu(txt) {
  let t = $id('menuToast'); if (!t) { t = document.createElement('div'); t.id = 'menuToast'; t.setAttribute('role', 'status'); menuEl.appendChild(t); }
  t.textContent = txt; t.classList.remove('ver'); void t.offsetWidth; t.classList.add('ver'); clearTimeout(toastMenu.t); toastMenu.t = setTimeout(() => t.classList.remove('ver'), 1600);
}
// ---- ALINEACIÓN ----
let alinTab = '1v1', ALIN_D = null;   // update 42: borrador de la alineación: se guarda con GUARDAR, VOLVER lo descarta
const alinCur = () => ALIN_D || ALIN;
function alinSlot(k, rol, cls) { return `<div class="alSlot ${cls}" data-rol="${rol}"><small>${rol}</small><div class="alCarta">${cardHTML(k)}</div></div>`; }
function alinHTML() {
  const me = CHARS[sel].key, dos = alinTab === '2v2', ALIN = alinCur();
  if (dos && (!ALIN.duo || ALIN.duo === me)) { ALIN.duo = CHARS.find((c) => c.key !== me).key; if (!ALIN_D) alinSave(); }
  for (const b of menuEl.querySelectorAll('.alTab')) b.classList.toggle('sel', b.dataset.al === alinTab);
  $id('lbAlinCampo').className = 'alCampo ' + (dos ? 'dos' : 'uno');
  $id('lbAlinCampo').innerHTML = '<div class="alLineas"><i class="area"></i><i class="medio"></i><i class="circ"></i></div>' +
    (dos ? alinSlot(ALIN.duo, 'DÚO', 'duo') : '') + alinSlot(me, 'TÚ', 'tu') + alinSlot(ALIN.gk, 'PORTERO', 'por');
  const gks = GK_ONLY.map((k) => `<button class="alOp gk${ALIN.gk === k ? ' sel' : ''}" data-gk="${k}" style="--c:${cCol(k)}"><img src="${cImg(k)}" alt="" draggable="false"><span>${cName(k)}</span><em class="t-${statsAt(k, progLv(k)).rareza}">${statsAt(k, progLv(k)).media}</em></button>`).join('');
  const duos = CHARS.filter((c) => c.key !== me).map((c) => { const t = statsAt(c.key, progLv(c.key)); return `<button class="alOp${ALIN.duo === c.key ? ' sel' : ''}" data-duo="${c.key}" style="--c:${c.color}"><img src="${cImg(c.key)}" alt="" draggable="false"><span>${c.name}</span><em class="t-${t.rareza}">${t.media}</em></button>`; }).join('');
  $id('lbAlinElige').innerHTML = `<div class="alGrupo"><div class="alTit">PORTERO <small>BUTÓN O TURTOBOLA</small></div><div class="alOps gks">${gks}</div></div>` +
    (dos ? `<div class="alGrupo"><div class="alTit">DÚO <small>TU COMPAÑERO IA EN 2 VS 2</small></div><div class="alOps duos">${duos}</div></div>` : '');
}
function alinSet(o) {
  if (o.gk && GK_ONLY.includes(o.gk)) ALIN.gk = o.gk;
  if (o.duo && CHARS.some((c) => c.key === o.duo)) { ALIN.duo = o.duo; M2.mate = o.duo; }
  alinSave(); if (ALIN_D) ALIN_D = { ...ALIN }; if (menuEl.querySelector('#lbAlin.visible')) alinHTML();
  LOG('alineacion', null, { gk: ALIN.gk, duo: ALIN.duo });
  return { ...ALIN };
}
function lbMonedasRender() {
  const n = $id('lbMonN'); if (n) n.textContent = PROG.mon;
  const ok = CHARS[sel] && PROG.mon >= lvCost(PROG.lv[CHARS[sel].key] || 0);
  const b = $id('lbMonedas'); if (b) b.classList.toggle('puede', !!ok);
}
function lbMonedasPend() {
  if (!lbMonPend) return;
  const d = lbMonPend; lbMonPend = 0;
  const b = $id('lbMonedas'); if (!b) return;
  const t = document.createElement('div'); t.className = 'lbDelta mas mon'; t.innerHTML = `${MONEDA_SVG}+${d}`;
  b.appendChild(t); setTimeout(() => t.remove(), 2200);
  b.classList.remove('late'); void b.offsetWidth; b.classList.add('late');
}
// update 39: selector de CAMPO (estadio, volcán, hielo, setas, aleatorio). Se guarda en los ajustes (localStorage) y vale para todos los modos.
const CAMPO_OPS = ['estadio', 'volcan', 'hielo', 'setas', 'aleatorio'];
function campoUI() {
  const c = AJ.campo || 'estadio', n = $id('lbCampoNom'), b = $id('lbCampo');
  if (n) n.textContent = CAMPO_NOM[c]; if (b) b.dataset.c = c;
  for (const t of document.querySelectorAll('.lbCampoOp')) { const on = t.dataset.c === c; t.classList.toggle('sel', on); t.setAttribute('aria-pressed', on ? 'true' : 'false'); }
}
function setCampo(c) { if (!CAMPO_OPS.includes(c)) return false; AJ.campo = c; saveAjustes(); campoUI(); return true; }
function campoBuildUI() {
  const L = $id('lbCampoLista'); if (!L) return;
  L.innerHTML = CAMPO_OPS.map((c) => `<button class="lbCampoOp" data-c="${c}" aria-label="${CAMPO_NOM[c]}"><span class="lbCampoVista"><b class="dec"></b><i class="mini"></i>${c === 'aleatorio' ? '<em>?</em>' : ''}</span><span class="lbCampoN">${CAMPO_NOM[c]}</span></button>`).join('');
  for (const t of L.querySelectorAll('.lbCampoOp')) t.addEventListener('click', () => { setCampo(t.dataset.c); sfx.dribble && actx && sfx.dribble(); setTimeout(() => lbCerrar(), 160); });
  $id('lbCampo').addEventListener('click', () => lbAbrir('lbCampoPanel'));
  campoUI();
}
function lbBuild37() {
  campoBuildUI();   // update 39
  $id('lbMonedas').addEventListener('click', () => abrirMejora());
  $id('lbBtnAlin').addEventListener('click', () => { alinTab = PERF.modo === '2v2' ? '2v2' : '1v1'; ALIN_D = { ...ALIN }; lbAbrir('lbAlin'); });
  $id('lbAlinGuardar').addEventListener('click', () => { if (ALIN_D) alinSet(ALIN_D); ALIN_D = null; lbCerrar(); toastMenu('ALINEACIÓN GUARDADA'); });   // update 42
  $id('lbAlinVolver').addEventListener('click', () => { ALIN_D = null; lbCerrar(); });
  $id('lbPersMejorar').addEventListener('click', () => abrirMejora(CHARS[sel].key));
  $id('lbMejBtn').addEventListener('click', () => mejorarAhora());
  $id('lbMejPrev').addEventListener('click', () => mejPaso(-1));
  $id('lbMejNext').addEventListener('click', () => mejPaso(1));
  for (const b of menuEl.querySelectorAll('.alTab')) b.addEventListener('click', () => { alinTab = b.dataset.al; alinHTML(); });
  $id('lbAlinElige').addEventListener('click', (e) => {
    const o = e.target.closest('.alOp'); if (!o) return;
    const D = ALIN_D || (ALIN_D = { ...ALIN });   // update 42: al borrador (GUARDAR lo graba)
    if (o.dataset.gk && GK_ONLY.includes(o.dataset.gk)) D.gk = o.dataset.gk; else if (o.dataset.duo && CHARS.some((c) => c.key === o.dataset.duo)) D.duo = o.dataset.duo;
    alinHTML(); sfx.dribble && actx && sfx.dribble();
  });
  $id('lbAlinCampo').addEventListener('click', (e) => { const s = e.target.closest('.alSlot'); if (!s) return; const A = alinCur(), k = s.dataset.rol === 'PORTERO' ? A.gk : s.dataset.rol === 'DÚO' ? A.duo : CHARS[sel].key; abrirMejora(k); });
}
function lobbyPlay() {
  if (S.mode !== 'menu') return;
  const m = PERF.modo; LOG('jugar_lobby', null, { modo: m });
  if (m === '2v2') open2v2(); else if (m === 'liga' || m === 'torneo') openComp(m); else menuPlay(m === 'practica');
}
// ---- rueda de badges bajo el personaje: deslizar cambia de personaje, tocar uno lo elige ----
const RUEDA = { pos: 0, target: null, sp: 60, items: [], drag: null };
function lbRuedaBuild() {
  const box = lbEls.lbRuedaItems; if (!box) return;
  CHARS.forEach((c, i) => {
    const b = document.createElement('div'); b.className = 'lbRIt'; b.style.setProperty('--c', c.color); b.dataset.i = i;
    b.innerHTML = `<img src="${c.badge || c.card}" alt="${c.name}" draggable="false">`;
    box.appendChild(b); RUEDA.items.push(b);
  });
  RUEDA.pos = sel; lbRuedaMedir();
  const el = lbEls.lbRueda;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {}
    RUEDA.drag = { id: e.pointerId, x0: e.clientX, p0: RUEDA.pos, t0: performance.now(), lx: e.clientX, lt: performance.now(), v: 0, moved: false, it: e.target.closest('.lbRIt') };
    RUEDA.target = null;
  });
  el.addEventListener('pointermove', (e) => {
    const d = RUEDA.drag; if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0; if (Math.abs(dx) > 7) d.moved = true;
    if (!d.moved) return;
    const now = performance.now(), dt = Math.max(1, now - d.lt);
    d.v = 0.7 * d.v + 0.3 * ((e.clientX - d.lx) / dt); d.lx = e.clientX; d.lt = now;
    RUEDA.pos = d.p0 - dx / RUEDA.sp;
    const i = lbMod(Math.round(RUEDA.pos)); if (i !== sel) selectChar(i, false, true);
    lbRuedaLayout();
  });
  const fin = (e) => {
    const d = RUEDA.drag; if (!d || e.pointerId !== d.id) return; RUEDA.drag = null;
    if (!d.moved) {   // toque: badge lateral = elegirlo; el del centro = abrir la selección completa
      const i = d.it ? +d.it.dataset.i : -1;
      if (i < 0) return;
      if (i === sel) lbAbrir('lbPers'); else { selectChar(i); }
      return;
    }
    if (performance.now() - d.lt > 90) d.v = 0;   // dedo parado antes de soltar = sin inercia
    const fl = Math.max(-2.5, Math.min(2.5, -d.v * 260 / RUEDA.sp));   // inercia del gesto
    const t = Math.round(RUEDA.pos + fl * 0.5); RUEDA.target = t;
    selectChar(lbMod(t), true, true);
  };
  el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin);
}
const lbMod = (i) => ((i % CHARS.length) + CHARS.length) % CHARS.length;
function lbRuedaMedir() { const it = RUEDA.items[0]; if (it && it.offsetWidth) RUEDA.sp = it.offsetWidth * 1.08; lbRuedaLayout(); }
function lbRuedaIr(i) {   // lleva la rueda al personaje i por el camino corto
  const n = CHARS.length; let d = lbMod(i - Math.round(RUEDA.pos)); if (d > n / 2) d -= n;
  RUEDA.target = Math.round(RUEDA.pos) + d;
}
function lbRuedaLayout() {
  const n = CHARS.length, sp = RUEDA.sp;
  for (let i = 0; i < n; i++) {
    let o = i - RUEDA.pos; o = ((o % n) + n) % n; if (o > n / 2) o -= n;
    const ao = Math.abs(o), it = RUEDA.items[i];
    const s = ao < 1 ? 1.32 - 0.5 * ao : Math.max(0.5, 0.82 - (ao - 1) * 0.1);
    const x = Math.sign(o) * (ao < 1 ? ao * sp * 1.18 : sp * 1.18 + (ao - 1) * sp * 0.88);
    const y = Math.min(ao, 4) ** 2 * sp * 0.055;
    const a = ao > 3.4 ? Math.max(0, 1 - (ao - 3.4) / 0.6) : 1;
    it.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
    it.style.opacity = a.toFixed(2); it.style.zIndex = 50 - Math.round(ao * 10);
    it.style.visibility = a <= 0 ? 'hidden' : '';
    it.classList.toggle('sel', ao < 0.5);
  }
}
function lbRuedaStep(dt) {
  if (RUEDA.drag || RUEDA.target === null) return;
  const k = 1 - Math.exp(-13 * dt); RUEDA.pos += (RUEDA.target - RUEDA.pos) * k;
  if (Math.abs(RUEDA.target - RUEDA.pos) < 0.002) { RUEDA.pos = RUEDA.target; RUEDA.target = null; }
  lbRuedaLayout();
}
function openMenu() {
  S.mode = 'menu';
  pantalla.classList.remove('visible'); menuEl.classList.add('visible'); hudSet(false);
  showBanner('', '', 0);
  lbCerrar(true);
  selectChar(sel, false);
  lbRuedaMedir(); lbMostrarPend(); lbMonedasPend();
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
// ---------- ALINEACIÓN (update 37): tu portero (Butón / Turtobola) y tu DÚO de 2 VS 2 (compañero IA) ----------
const ALIN_KEY = 'ml_alineacion_v1';
function alinLoad() {
  let p = null; try { p = JSON.parse(localStorage.getItem(ALIN_KEY) || 'null'); } catch (e) {}
  if (!p || typeof p !== 'object') p = {};
  if (!GK_ONLY.includes(p.gk)) p.gk = 'buton';
  if (!CHARS.some((c) => c.key === p.duo)) p.duo = null;
  return { gk: p.gk, duo: p.duo };
}
let ALIN = alinLoad();
function alinSave() { try { localStorage.setItem(ALIN_KEY, JSON.stringify(ALIN)); } catch (e) {} }
const rivalGK = (rk) => GK_ONLY[[...String(rk)].reduce((s, ch) => s + ch.charCodeAt(0), 0) % GK_ONLY.length];   // el portero del rival (fijo por rival)
let matchSig = '';
function setupMatch(uk, rk, mk = null, r2k = null) {   // update 30: mk / r2k = compañero y segundo rival (2 VS 2)
  // update 37: porteros = Butón / Turtobola (el tuyo, de la ALINEACIÓN) y cada jugador con el nivel de su carta
  const gu = ALIN.gk, gr = rivalGK(rk);
  const lvU = progLv(uk), base = mk ? (lvU + progLv(mk)) / 2 : lvU;
  const LV = { user: lvU, mateA: mk ? progLv(mk) : 0, gkA: progLv(gu), rival: rivalLv(base, rk), mateB: r2k ? rivalLv(base, r2k) : 0, gkB: rivalLv(progLv(gu), gr) };
  const sig = [uk, rk, mk, r2k, gu, gr, ...Object.values(LV)].join('|');
  if (matchKeys && matchKeys[0] === uk && matchKeys[1] === rk && (matchKeys[2] || null) === mk && (matchKeys[3] || null) === r2k && matchSig === sig) return;
  matchSig = sig;
  for (const a of new Set([...actors, user, rival, gkA, gkB, mateA, mateB])) if (a) a.dispose();
  user = new Actor(uk, 0, false, 0x3d8bff);
  rival = new Actor(rk, 1, false, 0xff4040);
  gkA = new Actor(gu, 0, true, 0x9cc4ff);
  gkB = new Actor(gr, 1, true, 0xffa0a0);
  mateA = mk ? new Actor(mk, 0, false, 0x8fbcff) : null;
  mateB = r2k ? new Actor(r2k, 1, false, 0xff9a9a) : null;
  for (const [n, a] of Object.entries({ user, rival, gkA, gkB, mateA, mateB })) if (a) { a.lv = LV[n]; a.sf = actorStats(a); }
  actors = [user, rival, gkA, gkB, mateA, mateB].filter(Boolean);
  LOG('niveles', null, { ...LV, gu, gr });
  const tri = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 3), new THREE.MeshBasicMaterial({ color: 0x3d8bff }));
  tri.rotation.x = Math.PI; tri.position.y = 2.75 * ESCALA; user.root.add(tri); user.marker = tri;
  user.place(0, -3.2); rival.place(0, 3.2); gkA.place(0, -HL + 0.9); gkB.place(0, HL - 0.9);
  document.querySelector('#marcador .azul .nom').textContent = ALL_CHARS.find((c) => c.key === uk).name;
  document.querySelector('#marcador .rojo .nom').textContent = ALL_CHARS.find((c) => c.key === rk).name;
  matchKeys = [uk, rk, mk, r2k];
  if (mk && r2k) { mateA.place(5, -9); mateB.place(-5, 9); document.querySelector('#marcador .azul .nom').textContent = ALL_CHARS.find((c) => c.key === uk).name + ' + ' + ALL_CHARS.find((c) => c.key === mk).name; document.querySelector('#marcador .rojo .nom').textContent = ALL_CHARS.find((c) => c.key === rk).name + ' + ' + ALL_CHARS.find((c) => c.key === r2k).name; }
  marcadorSet();   // update 32
}
// ===================== TORNEO Y LIGA (update 24) =====================
// TORNEO: eliminatoria de 8 (cuartos, semis, final). LIGA: 8 equipos a una vuelta (7 jornadas, 4 partidos por jornada).
// update 43 (t92u): liga y torneo con TODOS los jugadores de campo (21; Butón y Turtobola solo porteros).
//  LIGA: 21 a una vuelta = 21 jornadas (cada equipo descansa una; si descansas tú, esa jornada se simula sola).
//  TORNEO: cuadro de 32 con RONDA PREVIA (5 partidos, 11 pasan directos) → octavos → cuartos → semis → final.
// Tus partidos se juegan; los demás se simulan con la MEDIA/ATQ/DEF de las cartas y algo de azar (Poisson).
// Empate en eliminatoria = tanda de penaltis simulada (TIRO del lanzador contra REFLEJOS del rival). Progreso en localStorage.
const COMP_KEY = 'ml_competicion_v1', COMP_N = 8, COMP_FMT = 43;   // update 43: COMP_N ya no limita (se usan todos)
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
function compTeams(user, r) { return shuffled([user, ...CHARS.map((c) => c.key).filter((k) => k !== user)], r); }   // update 43: los 21
// calendario de liga: método del círculo (cada equipo juega una vez contra todos)
// update 43: con número impar se añade un hueco (null): quien cae contra él DESCANSA esa jornada ({ a, b: null, bye: true })
function roundRobin(teams) {
  const t = [...teams]; if (t.length % 2) t.push(null);
  const n = t.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const ms = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (a === null || b === null) { ms.push({ a: a === null ? b : a, b: null, bye: true, played: true }); continue; }
      ms.push(r % 2 === 0 ? { a, b } : { a: b, b: a });
    }
    rounds.push(ms);
    t.splice(1, 0, t.pop());
  }
  return rounds;
}
function newTorneo(user, seed = (Date.now() & 0x7fffffff)) {
  const r = compRng(seed), teams = compTeams(user, r);
  // update 43: cuadro de potencia de 2 (32 para 21): P/2 cruces; (n − P/2) son partidos de verdad, repartidos por el cuadro; el resto pasa directo
  const n = teams.length, P = 2 ** Math.ceil(Math.log2(Math.max(2, n))), pares = P / 2, reales = n - pares;
  const esReal = new Set(); for (let i = 0; i < reales; i++) esReal.add(Math.floor((i + 0.5) * pares / reales));
  const r0 = []; let j = 0;
  for (let i = 0; i < pares; i++) {
    if (esReal.has(i)) { r0.push({ a: teams[j], b: teams[j + 1] }); j += 2; }
    else { r0.push({ a: teams[j], b: null, bye: true, played: true, w: teams[j] }); j++; }
  }
  const rounds = [r0]; for (let k = pares; k > 1; k >>= 1) rounds.push([]);
  const c = { type: 'torneo', fmt: COMP_FMT, user, seed, step: 1, teams, rounds, round: 0, done: false, champion: null, last: null };
  if (!r0.some((m) => !m.played && (m.a === user || m.b === user))) { compAdvanceKO(c, compR(c)); c.last = { round: 0, user: null, directo: true }; }   // pasas directo: la previa se juega sola
  return c;
}
function newLiga(user, seed = (Date.now() & 0x7fffffff)) {
  const r = compRng(seed), teams = compTeams(user, r);
  const c = { type: 'liga', fmt: COMP_FMT, user, seed, step: 1, teams, fixtures: roundRobin(teams), jornada: 0, done: false, champion: null, last: null };
  const d = ligaDescanso(c, compR(c)); if (d.length) c.last = { jornada: d[0], descanso: d };
  return c;
}
// update 43: si en la jornada actual DESCANSAS, se simula entera y se pasa a la siguiente (devuelve las jornadas saltadas)
function ligaSimJornada(c, r) {
  for (const m of c.fixtures[c.jornada]) { if (m.played) continue; const s = simScore(m.a, m.b, r); m.ga = s[0]; m.gb = s[1]; m.played = true; }
}
function ligaDescanso(c, r) {
  const out = [];
  while (c.jornada < c.fixtures.length && c.fixtures[c.jornada].some((m) => m.bye && m.a === c.user)) {
    ligaSimJornada(c, r); out.push(c.jornada); c.jornada++;
  }
  if (c.jornada >= c.fixtures.length && !c.done) { c.done = true; c.champion = standings(c)[0].k; }
  return out;
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
    else { const d = ligaDescanso(c, r); if (d.length) c.last.descanso = d; }   // update 43
  }
  return c;
}
function compAdvanceKO(c, r) {
  // ronda terminada -> siguiente ronda con los ganadores (si te eliminan se simula hasta la final)
  while (!c.done) {
    const ms = c.rounds[c.round];
    if (ms.some((m) => !m.played)) {
      if (ms.some((m) => !m.played && (m.a === c.user || m.b === c.user))) return;   // update 43: pasar directo no cuenta como partido pendiente
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
  const m = ms.find((x) => !x.played && !x.bye && (x.a === c.user || x.b === c.user));
  return m ? (m.a === c.user ? m.b : m.a) : null;
}
// clasificación: 3 puntos victoria, 1 empate. Desempate: PTS, DG, GF, nombre
function standings(c) {
  const T = {}; for (const k of c.teams) T[k] = { k, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
  for (const j of c.fixtures) for (const m of j) {
    if (!m.played || m.bye) continue;
    const A = T[m.a], B = T[m.b];
    A.pj++; B.pj++; A.gf += m.ga; A.gc += m.gb; B.gf += m.gb; B.gc += m.ga;
    if (m.ga > m.gb) { A.g++; B.p++; A.pts += 3; } else if (m.ga < m.gb) { B.g++; A.p++; B.pts += 3; } else { A.e++; B.e++; A.pts++; B.pts++; }
  }
  const nm = (k) => (ALL_CHARS.find((x) => x.key === k) || { name: k }).name;
  return Object.values(T).map((t) => (t.dg = t.gf - t.gc, t)).sort((x, y) => y.pts - x.pts || y.dg - x.dg || y.gf - x.gf || nm(x.k).localeCompare(nm(y.k)));
}
function compLoad() {
  try { const c = JSON.parse(localStorage.getItem(COMP_KEY) || 'null'); return c && typeof c === 'object' ? c : {}; } catch (_) { return {}; }
}
function compSave(all) { try { localStorage.setItem(COMP_KEY, JSON.stringify(all)); } catch (_) {} }
function compValid(c) { return c && c.fmt === COMP_FMT && c.teams && c.teams.every((k) => STATS[k] && CHARS.some((x) => x.key === k)); }   // update 43: formato nuevo (todos los personajes)
// ---- interfaz ----
const compEl = document.getElementById('comp'), coCuerpo = document.getElementById('coCuerpo'), coTit = document.getElementById('coTit');
const coJugar = document.getElementById('coJugar'), coNuevo = document.getElementById('coNuevo');
let COMP = null;      // competición abierta en pantalla
const RONDAS = ['CUARTOS', 'SEMIFINALES', 'FINAL'];
// update 43: nombre de cada ronda por el nº de cruces (sirve para cualquier tamaño de cuadro)
const KO_NOM = { 16: 'RONDA PREVIA', 8: 'OCTAVOS', 4: 'CUARTOS', 2: 'SEMIFINALES', 1: 'FINAL' };
const KO_CORTO = { 16: 'PREVIA', 8: 'OCTAVOS', 4: 'CUARTOS', 2: 'SEMIS', 1: 'FINAL' };
const koNom = (c, r) => KO_NOM[c.rounds[0].length >> r] || ('RONDA ' + (r + 1));
const koCorto = (c, r) => KO_CORTO[c.rounds[0].length >> r] || ('R' + (r + 1));
let coKoR = null;   // ronda que se está viendo en el cuadro (null = la actual)
const cName = (k) => (ALL_CHARS.find((x) => x.key === k) || { name: k }).name;
const cCol = (k) => (ALL_CHARS.find((x) => x.key === k) || { color: '#888' }).color;
const cImg = (k) => { const c = ALL_CHARS.find((x) => x.key === k); return c ? (c.badge || c.card) : ''; };   // update 30: badge del personaje
const cHasBadge = (k) => { const c = ALL_CHARS.find((x) => x.key === k); return !!(c && c.badge); };
function teamChip(k, c, extra = '') {
  return `<div class="coEq${k === c.user ? ' tu' : ''}${extra}" style="--c:${cCol(k)}"><i${cHasBadge(k) ? ' class="bdg"' : ''}><img src="${cImg(k)}" alt="" draggable="false"></i><span>${cName(k)}</span></div>`;
}
function koMatchHTML(m, c, ri) {
  if (!m) return `<div class="coPar vacio"><div class="coFila"><div class="coEq"><i></i><span>¿?</span></div><b>-</b></div><div class="coFila"><div class="coEq"><i></i><span>¿?</span></div><b>-</b></div></div>`;
  const row = (k, g, p) => `<div class="coFila${m.played && m.w === k ? ' gana' : m.played ? ' pierde' : ''}">${teamChip(k, c)}<b>${m.played ? g : '-'}${m.played && m.pa !== undefined ? `<small>(${p})</small>` : ''}</b></div>`;
  const yours = m.a === c.user || m.b === c.user;
  return `<div class="coPar${yours ? ' tuyo' : ''}${m.played ? '' : ' pend'}">${row(m.a, m.ga, m.pa)}${row(m.b, m.gb, m.pb)}${m.played && m.pa !== undefined ? '<em>PENALTIS</em>' : ''}</div>`;
}
function torneoHTML(c) {
  // update 43: cuadro de 21 → pestañas por ronda (PREVIA · OCTAVOS · CUARTOS · SEMIS · FINAL · CAMPEÓN) y tarjetas en rejilla que bajan con el dedo
  const R = c.rounds.length, ver = coKoR === null ? (c.done ? R : c.round) : Math.min(coKoR, R);
  const userEn = (r) => (c.rounds[r] || []).find((m) => m.a === c.user || m.b === c.user);
  let tabs = '';
  for (let r = 0; r <= R; r++) {
    let est = '', ico = '';
    if (r < R) {
      const m = userEn(r);
      if (r < c.round || c.done) est = 'hecha'; else if (r === c.round) est = 'act'; else est = 'fut';
      if (m && m.played) ico = m.bye ? '<i class="kd">»</i>' : m.w === c.user ? '<i class="kg">✓</i>' : '<i class="kp">✗</i>';
    } else est = c.done ? 'act hecha' : 'fut';
    tabs += `<button class="koTab ${est}${r === ver ? ' ver' : ''}" data-kor="${r}">${r < R ? koCorto(c, r) : 'CAMPEÓN'}${ico}</button>`;
  }
  let h = `<div class="coKO"><div class="koTabs" role="tablist">${tabs}</div><div class="koCuerpo">`;
  if (ver >= R) {
    const ch = c.done ? c.champion : null;
    h += `<div class="koCampeon"><div class="coTrofeo${ch ? ' lleno' : ''}">${trophySVG()}${ch ? teamChip(ch, c, ' campeon') : '<div class="coEq"><i></i><span>¿?</span></div>'}</div></div>`;
  } else {
    const ms = c.rounds[ver] || [], n = c.rounds[0].length >> ver;
    const reales = ms.filter((m) => !m.bye), directos = ms.filter((m) => m.bye);
    const tuyo = (m) => m.a === c.user || m.b === c.user;
    reales.sort((x, y) => tuyo(y) - tuyo(x));
    h += `<div class="koInfo">${koNom(c, ver)} · ${ms.length ? reales.length + (reales.length === 1 ? ' PARTIDO' : ' PARTIDOS') : n + (n === 1 ? ' PARTIDO' : ' PARTIDOS')}${directos.length ? ` · ${directos.length} PASAN DIRECTO` : ''}</div><div class="koGrid">`;
    if (ms.length) for (const m of reales) h += koMatchHTML(m, c, ver);
    else for (let i = 0; i < n; i++) h += koMatchHTML(null, c, ver);
    h += '</div>';
    if (directos.length) h += `<div class="coSub">PASAN DIRECTO A ${koCorto(c, ver + 1)}</div><div class="koDirectos">${directos.map((m) => teamChip(m.a, c, ' directo')).join('')}</div>`;
  }
  return h + '</div></div>';
}
function ligaHTML(c) {
  // update 43: 21 equipos → tabla con cabecera fija que baja con el dedo (se centra en tu fila), y jornada con TU partido primero + quién descansa
  const st = standings(c), J = c.fixtures.length;
  let h = '<div class="coLiga"><div class="coTabla"><table><thead><tr><th>#</th><th class="eq">EQUIPO</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th class="gx">GF</th><th class="gx">GC</th><th>DG</th><th class="pts">PTS</th></tr></thead><tbody>';
  st.forEach((t, i) => {
    h += `<tr class="${t.k === c.user ? 'tu' : ''}${i === 0 && t.pj ? ' lider' : ''}${i < 3 && t.pj ? ' podio p' + (i + 1) : ''}"><td class="pos">${i + 1}</td><td class="eq">${teamChip(t.k, c)}</td><td>${t.pj}</td><td>${t.g}</td><td>${t.e}</td><td>${t.p}</td><td class="gx">${t.gf}</td><td class="gx">${t.gc}</td><td>${t.dg > 0 ? '+' : ''}${t.dg}</td><td class="pts">${t.pts}</td></tr>`;
  });
  h += '</tbody></table></div><div class="coLado">';
  const jorHTML = (j, prox) => {
    const tuyo = (m) => m.a === c.user || m.b === c.user;
    const ms = c.fixtures[j].filter((m) => !m.bye).sort((x, y) => tuyo(y) - tuyo(x)), bye = c.fixtures[j].find((m) => m.bye);
    let o = `<div class="coRes${prox ? ' prox' : ''}">`;
    for (const m of ms) o += `<div class="coResF${tuyo(m) ? ' tuyo' : ''}">${teamChip(m.a, c)}<b>${prox ? 'vs' : `${m.ga} - ${m.gb}`}</b>${teamChip(m.b, c, ' der')}</div>`;
    if (bye) o += `<div class="coDescansa${bye.a === c.user ? ' tuyo' : ''}"><small>DESCANSA</small>${teamChip(bye.a, c)}</div>`;
    return o + '</div>';
  };
  const L = c.last;
  if (L && L.jornada !== null && L.jornada !== undefined) {
    const js = [L.jornada, ...(L.descanso || []).filter((x) => x !== L.jornada)];
    for (const j of js) h += `<div class="coSub">RESULTADOS · JORNADA ${j + 1}${c.fixtures[j].some((m) => m.bye && m.a === c.user) ? ' · DESCANSASTE' : ''}</div>` + jorHTML(j, false);
  }
  if (!c.done) h += `<div class="coSub">JORNADA ${c.jornada + 1} DE ${J}</div>` + jorHTML(c.jornada, true);
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
  else if (!won) { const ri = c.rounds.findIndex((rs) => rs.some((m) => (m.a === c.user || m.b === c.user) && m.w !== c.user)); extra = `<div class="coFinTxt">Has caído en ${ri >= 0 ? koNom(c, ri).toLowerCase().replace('final', 'la final') : 'el torneo'}</div>`; }
  else { const nv = c.rounds.reduce((s, rs) => s + rs.filter((m) => !m.bye && (m.a === c.user || m.b === c.user)).length, 0); extra = `<div class="coFinTxt">${nv} victorias seguidas entre ${c.teams.length} bestias: ¡imbatible!</div>`; }   // update 43
  return `<div class="coFin${won ? ' gana' : ''}"><div class="coRayos"></div>${won ? '<div class="coConfeti">' + Array.from({ length: 26 }, (_, i) => `<i style="--i:${i}"></i>`).join('') + '</div>' : ''}` +
    `<div class="coFinCopa">${trophySVG()}</div><div class="coFinFoto${cHasBadge(c.champion) ? ' bdg' : ''}" style="--c:${cCol(c.champion)}"><img src="${cHasBadge(c.champion) ? cImg(c.champion) : (portrait(c.champion) || cImg(c.champion))}" alt=""></div>` +
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
    coTit.innerHTML = `TORNEO MONSTER <small>${c.done ? 'TERMINADO' : koNom(c, c.round)}</small>`;
    coCuerpo.innerHTML = torneoHTML(c);
  } else {
    coTit.innerHTML = `LIGA MONSTER <small>${c.done ? 'TERMINADA' : 'JORNADA ' + (c.jornada + 1) + '/' + c.fixtures.length}</small>`;
    coCuerpo.innerHTML = ligaHTML(c);
    const tb = coCuerpo.querySelector('.coTabla'), tu = tb && tb.querySelector('tr.tu');   // update 43: tu fila a la vista
    if (tu) requestAnimationFrame(() => { tb.scrollTop = Math.max(0, tu.offsetTop - tb.clientHeight / 2 + tu.offsetHeight / 2); });
  }
  if (opp) { coJugar.innerHTML = `JUGAR <small>vs <img class="coBtnBdg" src="${cImg(opp)}" alt="">${cName(opp)}</small>`; coJugar.dataset.act = 'jugar'; }
  else if (c.done) { coJugar.textContent = c.type === 'torneo' ? 'VER CAMPEÓN' : 'VER CAMPEÓN'; coJugar.dataset.act = 'fin'; }
  coNuevo.style.display = c.done || (c.type === 'torneo' && !compUserAlive(c)) ? '' : 'none';
  coNuevo.textContent = c.type === 'torneo' ? 'NUEVO TORNEO' : 'NUEVA LIGA';
}
function openComp(type, fresh) {
  if (S.mode !== 'menu' && S.mode !== 'end') return;
  const all = compLoad(), uk = CHARS[sel].key;
  let c = all[type];
  if (fresh || !compValid(c) || c.done) c = type === 'torneo' ? newTorneo(uk) : newLiga(uk);
  coKoR = null;
  all[type] = c; compSave(all); COMP = c;
  menuEl.classList.remove('visible'); pantalla.classList.remove('visible');
  renderComp(c.done ? 'fin' : null);
  compEl.querySelectorAll('.coPar, .coTabla tr, .coResF').forEach((el, i) => el.style.setProperty('--d', i));
}
function closeComp() { compEl.className = ''; COMP = null; openMenu(); }
async function compPlay() {
  const c = COMP, opp = c && compNextOpp(c); if (!opp) return;
  if (!window.__game.ready) { coJugar.textContent = 'CARGANDO…'; await campoReady; }
  const quedan = c.type === 'torneo' ? c.rounds.length - 1 - (c.round | 0) : 0;   // update 43: final +1, semis 0, antes −1
  S.practice = false; S.comp = { type: c.type, opp, ronda: c.type === 'torneo' ? (c.round | 0) : 0, lvOff: quedan === 0 ? 1 : quedan === 1 ? 0 : -1 };   // update 37: ronda -> nivel del rival
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
  compRecord(c, gu, gr);
  if (c.done && c.champion === c.user && !c.copaTitulo) { c.copaTitulo = true; copasTitulo(sc.type); }   // update 35
  all[sc.type] = c; compSave(all); COMP = c;
  hudSet(false); coKoR = null;
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
coCuerpo.addEventListener('click', (e) => {   // update 43: pestañas de ronda del torneo
  const t = e.target.closest('[data-kor]'); if (!t || !COMP || COMP.type !== 'torneo') return;
  coKoR = +t.dataset.kor; coCuerpo.innerHTML = torneoHTML(COMP);
  const v = coCuerpo.querySelector('.koTab.ver'); if (v) v.scrollIntoView({ block: 'nearest', inline: 'center' });
});
const LB_CAM = { visH: 4.5, camY: 1.0, lookY: 0.55 };
let lbListo = false;
function layoutMenu() {
  const W = app.clientWidth, H = app.clientHeight;
  if (!W || !H) return;
  menuCam.aspect = W / H;
  if (HORIZONTAL) {
    // el personaje se ve en la mitad izquierda; encuadre un poco más cercano
    // update 35: lobby -> personaje grande en el centro, entre la barra de perfil y la rueda de badges
    const visH = LB_CAM.visH;
    const dist = visH / 2 / Math.tan(THREE.MathUtils.degToRad(menuCam.fov / 2));
    menuCam.position.set(0, LB_CAM.camY, dist);
    menuCam.lookAt(0, LB_CAM.lookY, 0);
  } else {
    // el personaje ocupa la franja central (entre el título y las cartas)
    const visH = 6.7 * Math.max(1, (9 / 16) / (W / H) * 0.82);
    const dist = visH / 2 / Math.tan(THREE.MathUtils.degToRad(menuCam.fov / 2));
    menuCam.position.set(0, 1.25, dist);
    menuCam.lookAt(0, 0.12, 0);
  }
  menuCam.updateProjectionMatrix();
  if (lbListo) lbRuedaMedir();
}
function renderMenu(dt) {
  const m = (TAQ.open && taqModel(TAQ.c)) || menuChars[sel]; if (!m) return;   // update 48: taquilla
  menuT += dt; burst.rotation.z += dt * 0.07; lbRuedaStep(dt);
  popT = Math.min(1, popT + dt * 3.2);
  const k = popT, back = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;   // easeOutBack
  m.root.scale.setScalar(0.35 + 0.65 * back);
  if (!drag) userYaw *= Math.exp(-0.8 * dt);
  m.root.rotation.y = Math.sin(menuT * 0.7) * 0.5 + userYaw;
  m.mixer.update(dt);
  if (tiendaEl.classList.contains('visible') && !TAQ.open) return;   // update 48: la tienda (opaca) tapa el 3D: no se pinta
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
  // update 42: la ALINEACIÓN también se ve en vertical (es una lista: se maqueta para móvil); el resto sigue pidiendo girar
  const alV = !!document.querySelector('#menu.visible #lbAlin.visible');
  const show = HORIZONTAL && isPortraitScreen() && !alV;
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
// ===================== update 39: CAMPOS TEMÁTICOS (estadio, volcán, hielo, bosque de setas) =====================
// Solo cambia el ASPECTO: el mismo campo.glb (césped, líneas, muros, porterías, red) recoloreado + decorado exterior de campos.js.
// Geometría jugable, colisiones (constantes HW/HL/WX/WY/SIDE_X/GW/POST_X/GH/GD), red y cámara: idénticas.
let campoGLTF = null, campoActual = null, campoDeco = null;
const CROP_X = 22.8, CROP_Y = 30.5, CROP_H = 6.5;   // caja de lo jugable/visible del borde (vallas, porterías, banderines)
function campoElegido() { const c = AJ.campo; return c === 'aleatorio' ? CAMPOS[(Math.random() * CAMPOS.length) | 0] : (CAMPOS.includes(c) ? c : 'estadio'); }
function buildCampo(key) {
  if (!campoGLTF) return;
  if (!CAMPOS.includes(key) && !TEMAS[key]) key = 'estadio';
  if (campoRoot) {   // fuera el campo anterior (y su red deformable)
    scene.remove(campoRoot);
    campoRoot.traverse((o) => { if (o.isMesh || o.isPoints) { if (o.name === 'Campo_Fusionado' || o.userData.deco) o.geometry.dispose(); } });
    if (NET_FX.mesh) { scene.remove(NET_FX.mesh); NET_FX.mesh.geometry.dispose(); }
    Object.assign(NET_FX, { mesh: null, base: null, imps: [] }); NET_MESHES.length = 0;
  }
  const T = TEMAS[key] || null;
  const root = campoGLTF.scene.clone(true);
  const mats = new Map();
  root.traverse((o) => { if (!o.isMesh) return; const one = (m) => { let c = mats.get(m); if (!c) { c = m.clone(); mats.set(m, c); } return c; }; o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); });
  if (T) {
    const quitar = []; root.traverse((o) => { if (o !== root && T.hide.test(o.name)) quitar.push(o); else if (T.hideMat && o.isMesh && !Array.isArray(o.material) && T.hideMat.test(o.material.name)) quitar.push(o); }); for (const o of quitar) o.removeFromParent();   // update 40: también fuera los parches de desgaste (césped liso)
    for (const m of mats.values()) {
      const c = T.colors[m.name]; if (c) m.color.set(c);
    }
    if (T.crop) {   // nodos mezclados (vallas + porterías + piezas del estadio): se queda solo lo que está junto al campo
      root.updateMatrixWorld(true); const v = new THREE.Vector3(), lst = [];
      root.traverse((o) => { if (o.isMesh) { for (let p = o; p && p !== root; p = p.parent) if (T.crop.test(p.name)) { lst.push(o); break; } } });
      for (const o of lst) {
        const g = o.geometry.clone(), P = g.attributes.position, ok = new Uint8Array(P.count);
        for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); ok[i] = Math.abs(v.x) <= CROP_X && Math.abs(v.z) <= CROP_Y && v.y <= CROP_H ? 1 : 0; }
        const src = g.index ? g.index.array : null, n = src ? src.length : P.count, out = [];
        for (let t = 0; t < n; t += 3) { const a = src ? src[t] : t, b = src ? src[t + 1] : t + 1, c = src ? src[t + 2] : t + 2; if (ok[a] && ok[b] && ok[c]) out.push(a, b, c); }
        // los postes (material 'white', dentro de la caja de las porterías) pasan a su propio material 'post' (color propio en cada tema)
        if (o.material.name === 'white' && T.colors.post) {
          const post = [], rest = [], inGoal = (i) => { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); return Math.abs(v.x) < 5.9 && Math.abs(v.z) > 23.3 && Math.abs(v.z) < 27.4; };
          for (let t = 0; t < out.length; t += 3) (inGoal(out[t]) && inGoal(out[t + 1]) && inGoal(out[t + 2]) ? post : rest).push(out[t], out[t + 1], out[t + 2]);
          out.length = 0; out.push(...rest);
          if (post.length) { const pg = g.clone(); pg.setIndex(post); const pm = o.material.clone(); pm.name = 'post'; pm.color.set(T.colors.post); const pmesh = new THREE.Mesh(pg, pm); pmesh.name = 'Postes'; pmesh.matrix.copy(o.matrix); pmesh.matrix.decompose(pmesh.position, pmesh.quaternion, pmesh.scale); o.parent.add(pmesh); }
        }
        g.setIndex(out); o.geometry = g;
      }
    }
    // update 41: capas del suelo SEPARADAS en altura (sin cambiar el orden). En campo.glb 'ground' y 'path' están a la MISMA altura
    // (-0.043: z-fighting puro) y grassRun/pavingDark/track/paving a 3–12 mm; el estadio lo tapa con el cuenco y las gradas,
    // los temas no -> parpadeaba al moverse la cámara. Solo suelos planos (fuera de las líneas y del césped jugable, que no se tocan).
    if (T.suelos) {
      window.__game.campoSuelos = {}; root.updateMatrixWorld(true); const bb = new THREE.Box3(), ws = new THREE.Vector3();
      root.traverse((o) => { if (!o.isMesh || Array.isArray(o.material)) return; const hy = T.suelos[o.material.name]; if (hy === undefined) return;
        bb.setFromObject(o); if (bb.max.y - bb.min.y > 0.002) return;   // solo superficies planas
        o.parent.getWorldScale(ws); o.position.y += (hy - bb.max.y) / (ws.y || 1); o.updateMatrix(); o.userData.sueloY = hy; window.__game.campoSuelos[o.material.name] = hy; });
      root.updateMatrixWorld(true);
    }
    if (T.glow) root.traverse((o) => { if (o.isMesh && !Array.isArray(o.material) && T.glow[o.material.name]) o.material = new THREE.MeshBasicMaterial({ color: T.glow[o.material.name], name: o.material.name }); });   // líneas que brillan (lava)
  }
  campoRoot = matte(root);
  shadowFlags(campoRoot, false, true);
  window.__game.campoMerged = mergeStatic(campoRoot);
  window.__game.campoSuelos = T && T.suelos ? window.__game.campoSuelos : {};
  { let tes = 0; campoRoot.traverse((o) => { if (o.isMesh && o.name === 'Campo_Fusionado') tes += teselarSuelo(o); }); window.__game.campoTeselado = tes; }   // update 41 (los 4 campos: en el estadio también saltaba el césped)
  setupNet();
  campoDeco = T ? buildDeco(THREE, key, { mergeStatic, ensureSmoothN, outlineMat: OUTLINE_MAT, outlineMatEst: OUTLINE_MAT_EST, baja: AJ.quality === 'baja' }) : null;
  if (campoDeco) campoRoot.add(campoDeco.group);
  scene.add(campoRoot);
  scene.background = new THREE.Color(T ? T.bg : '#a8d8f5');
  if (camApron) camApron.material.color.set(T ? T.apron : 0xc4684e);
  campoActual = key; window.__game.campoActual = key;
  if (camClipPlane) applyCamClip(camCfg().layout === 'side');
  try { applyQuality('campo'); } catch (_) {}
}
// update 41: los suelos de campo.glb son triángulos ENORMES (exterior 410 m, caminos 121 m, pavimento 84 m, césped 39–70 m) que
// pasan por detrás de la cámara. Al recortarse contra el plano cercano su profundidad interpolada pierde precisión y una capa
// de debajo "salta" por encima de la de arriba según se mueve la cámara (en el estadio lo tapan el cuenco y las gradas).
// Se cortan los triángulos PLANOS (|h| < 0.2, normal hacia arriba) por una rejilla fija de 3 m (±72 m): cada arista compartida
// se corta en los mismos puntos por los dos lados -> sin grietas (T-junctions) y con el mismo aspecto.
function teselarSuelo(mesh, paso = 3, lim = 72) {
  const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, I = g.index; if (!I || !N) return 0;
  const lines = []; for (let v = -lim; v <= lim + 1e-6; v += paso) lines.push(+v.toFixed(4));
  const cells = (a, b) => { const out = []; let lo = -Infinity; for (const L of lines) { if (L > a && lo < b) out.push([lo, L]); lo = L; } if (lo < b) out.push([lo, Infinity]); return out.filter(([x0, x1]) => x1 > a && x0 < b); };
  const nP = [], nN = [], nC = [], nI = [], keep = []; let nv = 0, cortados = 0;
  const vtx = (i) => [P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i), C ? C.getX(i) : 1, C ? C.getY(i) : 1, C ? C.getZ(i) : 1];
  const lerp = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  const clip = (poly, ax, val, keepGreater) => { const out = []; for (let k = 0; k < poly.length; k++) { const A = poly[k], B = poly[(k + 1) % poly.length]; const ia = keepGreater ? A[ax] >= val : A[ax] <= val, ib = keepGreater ? B[ax] >= val : B[ax] <= val;
    if (ia) out.push(A); if (ia !== ib) { const t = (val - A[ax]) / (B[ax] - A[ax]); const q = lerp(A, B, t); q[ax] = val; out.push(q); } } return out; };
  for (let t = 0; t < I.count; t += 3) {
    const ids = [I.getX(t), I.getX(t + 1), I.getX(t + 2)], v = ids.map(vtx);
    const plano = v.every((q) => Math.abs(q[1]) < 0.2 && q[4] > 0.95);
    const L = Math.max(...[[0, 1], [1, 2], [2, 0]].map(([a, b]) => Math.hypot(v[a][0] - v[b][0], v[a][2] - v[b][2])));
    if (!plano || L <= paso) { keep.push(...ids); continue; }
    cortados++;
    const xs = v.map((q) => q[0]), zs = v.map((q) => q[2]);
    for (const [x0, x1] of cells(Math.min(...xs), Math.max(...xs))) for (const [z0, z1] of cells(Math.min(...zs), Math.max(...zs))) {
      let poly = v; if (x0 > -Infinity) poly = clip(poly, 0, x0, true); if (poly.length && x1 < Infinity) poly = clip(poly, 0, x1, false);
      if (poly.length && z0 > -Infinity) poly = clip(poly, 2, z0, true); if (poly.length && z1 < Infinity) poly = clip(poly, 2, z1, false);
      if (poly.length < 3) continue;
      const base = nv; for (const q of poly) { nP.push(q[0], q[1], q[2]); nN.push(q[3], q[4], q[5]); nC.push(q[6], q[7], q[8]); nv++; }
      for (let k = 1; k < poly.length - 1; k++) nI.push(base, base + k, base + k + 1);
    }
  }
  if (!cortados) return 0;
  const n0 = P.count, pos = new Float32Array((n0 + nv) * 3), nor = new Float32Array((n0 + nv) * 3), col = new Float32Array((n0 + nv) * 3);
  for (let i = 0; i < n0; i++) { pos.set([P.getX(i), P.getY(i), P.getZ(i)], i * 3); nor.set([N.getX(i), N.getY(i), N.getZ(i)], i * 3); if (C) col.set([C.getX(i), C.getY(i), C.getZ(i)], i * 3); else col.fill(1, i * 3, i * 3 + 3); }
  pos.set(nP, n0 * 3); nor.set(nN, n0 * 3); col.set(nC, n0 * 3);
  const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.BufferAttribute(pos, 3)); ng.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (C) ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const idx = keep.concat(nI.map((i) => i + n0)); ng.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  for (const k of Object.keys(g.attributes)) if (!ng.attributes[k]) console.warn('teselarSuelo: atributo sin copiar', k);
  ng.computeBoundingSphere(); ng.computeBoundingBox(); g.dispose(); mesh.geometry = ng; return cortados;
}
function campoAplicar() { const k = campoElegido(); if (k !== campoActual) buildCampo(k); }
function setupField(campo) {
  campoGLTF = campo;
  buildCampo(campoElegido());
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
  if (TEMAS[campoActual]) camApron.material.color.set(TEMAS[campoActual].apron);   // update 39
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
  turbo: { el: btnTurbo, name: 'Turbo' },
  entrada: { el: btnEntrada, name: 'Entrada' },
  alto: { el: btnAlto, name: 'Chut alto' },
  especial: { el: btnEspecial, name: 'Especial' },
  pase: { el: document.getElementById('btnPase'), name: 'Pase (2 VS 2)' },   // update 30
  patron: { el: document.getElementById('btnPatron'), name: 'Regates (patrón)' },   // update 35
};
const BTN_IDS = ['chutar', 'turbo', 'entrada', 'alto', 'especial', 'pase', 'patron'];   // update 38: sin 'regate'
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
function chutLbl() { return AJ.swipeShot ? 'DESLIZA' : tpOn() ? 'TIRO/PASE' : 'CHUTAR'; }
const ICO_CHUTAR = btnChutar.querySelector('.icono') ? btnChutar.querySelector('.icono').outerHTML : '';
const ICO_TP = '<svg class="icono icoGrande icoTP" viewBox="0 0 24 24" aria-hidden="true"><circle cx="7.2" cy="15.8" r="5" fill="#fff" stroke="currentColor" stroke-width="1.6"/><path d="M7.2 11.6l2.3 1.7-.9 2.7H5.8l-.9-2.7z" fill="currentColor"/><path d="M13 9.6h5.2M14.2 6.6h4.6M13 12.6h3.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M18.4 3.8l3.4 3.1-3.4 3.1z" fill="currentColor"/></svg>';
function applyTiroPase() {   // update 32: botón TIRO/PASE (nuevo nombre, icono y color); NO = CHUTAR clásico
  const on = tpOn() && !AJ.swipeShot;
  btnChutar.classList.toggle('tiroPase', on);
  const ic = btnChutar.querySelector('.icono'); const want = on ? ICO_TP : ICO_CHUTAR;
  if (ic && want && ic.outerHTML !== want) ic.outerHTML = want;
  const t = btnChutar.querySelector('.btnTxt'); if (t && !btnChutar.classList.contains('cabeza')) t.textContent = chutLbl();
  btnChutar.setAttribute('aria-label', on ? 'Tiro / pase' : 'Chutar');
  if (CTRL.chutar) CTRL.chutar.name = on ? 'Tiro / Pase' : 'Chutar';
}
function applyComboTR() {   // update 38: TURBO simple y sin botón REGATE. 'sinRegate' = disposición en la que REGATES ocupa el sitio del antiguo REGATE
  document.body.classList.remove('comboTR'); document.body.classList.add('sinRegate');
  const t = btnTurbo.querySelector('.btnTxt'); if (t) t.innerHTML = 'TURBO';
  btnTurbo.classList.remove('combo'); btnTurbo.setAttribute('aria-label', 'Turbo (mantén para esprintar)');
  if (CTRL.turbo) CTRL.turbo.name = 'Turbo';
  try { cacheCtrlRects(); } catch (_) {}
}
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
  if (editor.sel && editor.sel !== 'joy' && editor.sel !== 'turbo' && editor.sel !== 'especial' && editor.sel !== 'pase' && getComputedStyle(CTRL[editor.sel].el).visibility === 'hidden') edSelect(null);
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
// update 36: la barra del editor (GUARDAR, RESTABLECER, CANCELAR…) manda aunque otro elemento quede encima (antes la zona del joystick,
// con z-index 34 al editar, tapaba GUARDAR en horizontal y no dejaba pulsarlo)
function edBarHit(e) {
  const bar = document.querySelector('.edBarra'); if (!bar) return null;
  const r = bar.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
  return document.elementsFromPoint(e.clientX, e.clientY).find((el) => bar.contains(el)) || bar;
}
window.addEventListener('pointerdown', (e) => {
  if (!editor.on) return;
  if (e.target.closest && e.target.closest('.edBarra')) return;
  const bh = edBarHit(e);
  if (bh) { e.preventDefault(); e.stopPropagation(); editor.barPress = bh.closest('button'); return; }
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
  if (editor.barPress) {   // update 36: botón de la barra pulsado a través de otro elemento -> click al soltar encima
    const b = editor.barPress; editor.barPress = null;
    if (e.type === 'pointerup' && !(e.target.closest && e.target.closest('.edBarra'))) { const r = b.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { e.stopPropagation(); b.click(); return; } }
  }
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
  applyTiroPase();
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
// update 30: cabezazos, salto automático, porteros mejorados y cambio de jugador (2 VS 2)
const AJ30 = [['ajCabezazos', 'cabezazos', 'CABEZAZOS (SALTAR A BALONES ALTOS)'], ['ajSaltoAuto', 'saltoAuto', 'SALTO AUTOMÁTICO A BALONES ALTOS'],
  ['ajPorteros', 'porteros', 'PORTEROS: SALTO Y ESTIRADA ALTA'], ['ajCabCirculo', 'cabCirculo', 'CABEZAZO SOLO DENTRO DEL CÍRCULO DE CAÍDA'], ['ajTrampa', 'trampaApunta', 'BALÓN TRAMPA: APUNTAS Y SIGUES CON TU BALÓN'], ['ajDiscos', 'discos2v2', '2 VS 2: CÍRCULOS AZUL (TU EQUIPO) / ROJO (RIVALES)'], ['ajCambio', 'cambio', '2 VS 2: PASE SIN BALÓN = CAMBIAR DE JUGADOR'], ['ajTiroPase', 'tiroPase', 'BOTÓN TIRO/PASE (CHUT SUAVE Y CONTROLADO)'], ['ajLargoStat', 'largoStat', 'CHUT ALTO SEGÚN LA STAT TIR'], ['ajOcultaCaida', 'ocultaCaida', 'CHUT ALTO: INDICADOR CORTO (OCULTA DÓNDE CAE)']];
function setAj30(id, k, txt, on) { AJ[k] = !!on; saveAjustes(); if (k === 'tiroPase') applyTiroPase(); if (k === 'discos2v2' && typeof applyTeamDiscs === 'function' && user) applyTeamDiscs(); const b = document.getElementById(id); if (b) { b.textContent = txt + ': ' + (AJ[k] ? 'SÍ' : 'NO'); b.classList.toggle('on', AJ[k]); } }
for (const [id, k, txt] of AJ30) { const b = document.getElementById(id); if (b) b.addEventListener('click', () => setAj30(id, k, txt, !AJ[k])); setAj30(id, k, txt, AJ[k]); }
applyComboTR();   // update 38: TURBO simple, sin botón REGATE (antes lo llamaba el ajuste turboRegate)
document.getElementById('ajEspeciales').addEventListener('click', () => setEspeciales(!espOn()));
{ const b = document.getElementById('ajPatron'); if (b) b.addEventListener('click', () => { AJ.patron = !patOn(); saveAjustes(); applyPatronBtn(); try { cacheCtrlRects(); } catch (_) {} }); applyPatronBtn(); }   // update 35
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
  lbFondo: () => '', pedLuz: () => false, uiTap,
  ofertaFijar: (v) => { OFERTA_FIJA = v; if (tiendaEl.classList.contains('visible')) renderTiendaTodo(); tiendaAvisos(); }, ofertasDia, skinPrecio, OFERTA_DTO, tiendaIr, tiendaAvisos, tiendaDetAbrir, diaLocal,
  SKINS, probModel, glowN: () => GLOW_MATS.size, skinsSt: () => SKINS_ST, skinsReload: () => { SKINS_ST = skinsLoad(); return refreshSkinsVisual(); }, skinComprar, skinEquipar, skinOf, refreshSkinsVisual, applySkin, tiendaSkinVer, renderProbador, prog: () => PROG, retratos: () => { for (const k of [...PORT_DIRTY]) portraitNow(k); return PORTRAITS; },   // (tests: pinta ya lo pendiente)
 
  // pruebas: simula con la física real (stepBall, con postes/larguero/red) un chut alto con carga c desde D m de la línea de gol
  simAlto: (c, D, dt = 1 / 120) => {
    const sv = { pos: ball.pos.clone(), vel: ball.vel.clone(), owner: ball.owner, le: ball.lineEvent, bs: ball.backspin };
    const lp = lobParams(c); ball.owner = null; ball.lineEvent = null; ball.backspin = 0; const fx0 = { ...ball.fx }; Object.assign(ball.fx, { curve: 0, lift: 0, dip: 0, ef: 0, efS: 0, efS0: 0 });
    ball.pos.set(0, HL - D, BR + 0.02); ball.vel.set(0, lp.h, lp.vz);
    const prev = new THREE.Vector3(); let t = 0, zGoal = null, tGoal = null, tBounce = null, peak = 0;
    for (; t < 6 && !ball.lineEvent; t += dt) {
      prev.copy(ball.pos); stepBall(dt, prev); peak = Math.max(peak, ball.pos.z);
      if (zGoal === null && prev.y < HL && ball.pos.y >= HL) { const k = (HL - prev.y) / (ball.pos.y - prev.y); zGoal = +(prev.z + (ball.pos.z - prev.z) * k).toFixed(2); tGoal = +(t + dt * k).toFixed(2); }
      if (tBounce === null && ball.pos.z <= BR + 1e-6 && prev.z > BR) tBounce = +(t + dt).toFixed(2);
    }
    const ev = ball.lineEvent;
    const r = { c, D, v: +lp.v.toFixed(1), ang: +THREE.MathUtils.radToDeg(lp.ang).toFixed(1), result: ev ? ev.type : (zGoal === null ? 'no llega' : 'rechazado'), zLinea: zGoal, tLinea: tGoal, tBounce, peak: +peak.toFixed(2) };
    ball.pos.copy(sv.pos); ball.vel.copy(sv.vel); ball.owner = sv.owner; ball.lineEvent = sv.le; ball.backspin = sv.bs; Object.assign(ball.fx, fx0); ball.postHit = null;
    return r;
  },
  giveBall: (who) => giveBall(who === 'gkA' ? gkA : who === 'gkB' ? gkB : who === 'rival' ? rival : who === 'mateA' ? mateA : who === 'mateB' ? mateB : user), AI,   // update 22 (pruebas IA)
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
Object.defineProperty(window.__game, 'menuChars', { get: () => menuChars });   // update 42 (pruebas de skins)
// ===================== UPDATE 30: 2 VS 2, PASES, SALTO / CABEZAZO Y PORTEROS =====================
// 2 VS 2: tú + un compañero bot contra 2 bots, cada equipo con su portero. Botón PASE (toque = raso, mantener = elevado / centro).
// Cabezazos: los balones aéreos (por encima del pecho) se pueden rematar saltando antes de que caigan (botón CHUTAR -> CABEZA,
// contextual). Porteros: saltan a por balones altos, estiradas altas y palmean a córner / por encima del larguero.
const V2 = THREE.Vector2;
const HEAD_H = 1.55 * ESCALA;          // altura de la cabeza (de pie), ~2 m
const BALL_LOW = 1.05 * ESCALA;        // por debajo de esto el balón se controla con el pie / pecho (como siempre)
const JUMP_V0 = 4.7;                   // salto máximo ~1 m
const PASE_HOLD_MS = 280;              // mantener PASE más de esto = pase elevado / centro
const headersOn = () => AJ.cabezazos !== false;
const gkPlus = () => AJ.porteros !== false;
const is2v2 = () => !S.practice && !!mateA && !!mateB;
const _fp = { k: null, l: [] };
function fieldPlayers() {   // update 31: misma lista mientras no cambien los jugadores (antes: un array nuevo en cada llamada, ~20 por frame)
  const p = !!S.practice;
  if (_fp.k && _fp.k[0] === p && _fp.k[1] === user && _fp.k[2] === mateA && _fp.k[3] === rival && _fp.k[4] === mateB) return _fp.l;
  _fp.k = [p, user, mateA, rival, mateB]; _fp.l = p ? (user ? [user] : []) : [user, mateA, rival, mateB].filter(Boolean); return _fp.l;
}
function foesOf(a) { return fieldPlayers().filter((x) => x.team !== a.team); }
function mateOf(a) { if (!is2v2()) return null; return fieldPlayers().find((x) => x !== a && x.team === a.team) || null; }
function nearestFoe(a, p) { p = p || a.pos; let b = null, bd = 1e9; for (const f of foesOf(a)) { const d = Math.hypot(f.pos.x - p.x, f.pos.y - p.y); if (d < bd) { bd = d; b = f; } } return b; }
function openness(p, team) { let m = 99; for (const f of fieldPlayers()) if (f.team !== team) m = Math.min(m, Math.hypot(f.pos.x - p.x, f.pos.y - p.y)); return m; }
function segDist(p, a, b) { const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1); return p.distanceTo(a.clone().addScaledVector(ab, t)); }
function laneClear(from, to, team, margin = 1.8) { for (const f of fieldPlayers()) if (f.team !== team && segDist(f.pos, from, to) < margin) return false; return true; }
function timeTo(x, p) { return Math.hypot(x.pos.x - p.x, x.pos.y - p.y) / (SPEED_AI * x.sf.vel) + (x.stun > 0 ? x.stun : 0) + (x.freezeT > 0 ? x.freezeT : 0); }
function espFoe2(a) { const fs = foesOf(a); return fs.find((f) => ball.owner === f) || nearestFoe(a); }
function gkMate(k) {
  const pl = fieldPlayers().filter((x) => x.team === k.team);
  if (pl.length < 2) return pl[0] || (k.team === 0 ? user : rival);
  return pl.reduce((b, x) => (openness(x.pos, k.team) > openness(b.pos, k.team) + 1 ? x : b));
}
function gkFoe(k) { return is2v2() ? nearestFoe(k) : (k.team === 0 ? rival : user); }
function ballLanding() {
  if (ball.pos.z > 1.2) { const l = predictFlight(ball.pos, ball.vel, null, 4, 1 / 60); return new V2(l.x, l.y); }
  return new V2(ball.pos.x + ball.vel.x * 0.35, ball.pos.y + ball.vel.y * 0.35);
}

// ---------- PASES ----------
function passTarget(a, m, lofted) {
  const d0 = a.pos.distanceTo(m.pos), sp = lofted ? 15 : THREE.MathUtils.clamp(9 + d0 * 0.55, 11, 22), t = d0 / sp;
  const p = m.pos.clone().addScaledVector(m.vel, Math.min(1.1, t) * 0.9);   // donde estará (adelantado a su carrera)
  if (lofted && m !== user) p.y += Math.sign(goalCenter(a.team).y) * 2;
  p.x = THREE.MathUtils.clamp(p.x, -SIDE_X + 1.2, SIDE_X - 1.2); p.y = THREE.MathUtils.clamp(p.y, -WY + 1.2, WY - 1.2);
  return p;
}
function passBall(a, m, lofted = false, at = null) {
  if (!a || !m || ball.owner !== a || a.kickPending || a.freezeT > 0 || a.slipT > 0 || a.stun > 0) return false;
  const tgt = at || passTarget(a, m, lofted);
  const dir = tgt.clone().sub(a.pos); if (dir.lengthSq() < 0.25) return false; dir.normalize();
  a.face.copy(dir);
  const impact = a.meta.Kick.impact / 30 / KICK_RATE;
  a.kickAnimT = a.meta.Kick.frames / 30 / KICK_RATE * 0.8 - (a === user ? impact : 0);
  a.play('Kick', a === user ? 0.03 : 0.06, true);
  if (a === user) { const k = a.actions.Kick; if (k) k.time = impact * KICK_RATE; releasePass(a, tgt, lofted, m); }
  else a.kickPending = { pass: true, tgt, lofted, m, t: impact * 0.75 };
  return true;
}
function releasePass(a, tgt, lofted, m) {
  MS_pass(a);   // update 32
  const d = new V2(tgt.x - a.pos.x, tgt.y - a.pos.y), L = Math.max(1, d.length()); d.normalize();
  const j = THREE.MathUtils.degToRad(a.sf.jitterDeg * 0.45) * (Math.random() * 2 - 1); if (j) d.rotateAround(new V2(), j);   // PRECISIÓN
  ball.owner = null; ball.noCatch = a; ball.noCatchT = 0.3; ball.lastTouch = a; ball.backspin = 0; Object.assign(ball.fx, { curve: 0, lift: 0, dip: 0, ef: 0, efS: 0, efS0: 0 });
  const off = PR + BR + 0.15;
  ball.pos.set(a.pos.x + d.x * off, a.pos.y + d.y * off, BR + 0.05);
  if (lofted) {   // elevado: si el receptor está en el área rival llega a la altura de la cabeza (centro para rematar)
    const inBox = m && Math.abs(goalCenter(a.team).y - tgt.y) < 13 && Math.abs(tgt.x) < 10;
    const zt = inBox ? HEAD_H + 0.2 : 0.8, T = THREE.MathUtils.clamp(L / 14, 0.7, 1.5), D = Math.max(1, L - off);
    const vz = (zt - ball.pos.z + 0.5 * GRAV * T * T) / T, vh = D / T * 1.06;   // +6 %: rozamiento del aire
    { const pl = effectPlan(a, d, vh, 0.5, m ? m.pos : tgt, D); if (pl) d.rotateAround(new V2(), pl.rot); applyEffect(pl); const vk = pl ? pl.efS / D : 1; ball.vel.set(d.x * vh * vk, d.y * vh * vk, vz); }   // update 31: EFECTO en el centro; update 34: curva en C (el arco es algo más largo que la cuerda)
    ball.w.set(0, 1, 0).cross(_wv.set(ball.vel.x, 0, -ball.vel.y)).multiplyScalar(-0.25 / BR);
  } else {
    const sp = THREE.MathUtils.clamp(9 + L * 0.55, 11, 22);
    ball.vel.set(d.x * sp, d.y * sp, 0.4);
    ball.w.set(0, 1, 0).cross(_wv.set(ball.vel.x, 0, -ball.vel.y)).multiplyScalar(0.7 / BR);
  }
  a.kickT = 0.3; a.holdT = 0; S.passes = (S.passes || 0) + 1; ball.kickN = (ball.kickN || 0) + 1;
  if (m) m.passInT = S.t;
  sfx.kick(lofted ? 0.45 : 0.25); LOG(lofted ? 'pase_elevado' : 'pase', a, { to: m ? NAME(m) : null, d: +L.toFixed(1) });
}
// decisión de pase del bot (con criterio: ni chupón ni marioneta)
function passDecision(a, m) {
  if (m.stun > 0 || m.freezeT > 0 || m.jumping || m.slipT > 0) return null;
  const atkY = goalCenter(a.team).y;
  const dA = Math.hypot(a.pos.x, atkY - a.pos.y), dM = Math.hypot(m.pos.x, atkY - m.pos.y);
  const L = a.pos.distanceTo(m.pos); if (L < 4 || L > 30) return null;
  const tgt = passTarget(a, m, false), clear = laneClear(a.pos, tgt, a.team, 1.7);
  const foe = nearestFoe(a), press = foe ? foe.pos.distanceTo(a.pos) : 99, openM = openness(m.pos, a.team);
  const asked = m === user && input.askT > S.t;
  const goodShotA = dA < 15 && Math.abs(a.pos.x) < 4 + Math.abs(atkY - a.pos.y) * 0.9;
  let sc = clear ? 1 : -2;
  sc += (dA - dM) * 0.17;                                   // el compañero está mejor colocado (más cerca de portería)
  sc += press < 2.8 ? 1.1 : 0;                              // me aprietan
  sc += openM > 5 ? 0.8 : openM < 2.5 ? -1.3 : 0;           // compañero libre / marcado
  sc += Math.min(1.4, (a.holdT || 0) * 0.35);               // no ser chupón
  if (goodShotA) sc -= 1.8;                                 // con tiro claro, chuta
  if (asked) sc += 1.5;                                     // el humano la pide
  if (m === user) sc += 0.3;
  sc += (Math.random() - 0.5) * 0.6;
  if (sc < 1.6) return null;
  const mInBox = Math.abs(atkY - m.pos.y) < 13 && Math.abs(m.pos.x) < 9;
  if (!clear) return L > 7 ? 'alto' : null;                 // línea tapada: por arriba
  if (mInBox && Math.abs(a.pos.x) > 9 && L > 8 && Math.random() < 0.5) return 'alto';   // centro desde la banda
  return 'raso';
}
// ---------- IA 2 VS 2 ----------
function teamPresser(a, owner) {   // quién de los dos sale a presionar (con histéresis); el otro cubre
  const m = mateOf(a); if (!m) return a;
  const key = 'press' + a.team; let p = S[key];
  const d = (x) => x.pos.distanceTo(owner.pos) + (x.stun > 0 || x.freezeT > 0 ? 6 : 0);
  if (p !== a && p !== m) p = d(a) <= d(m) ? a : m;
  else { const o = p === a ? m : a; if (d(o) + 2.5 < d(p)) p = o; }
  S[key] = p; return p;
}
function chaserOf(team) {   // balón suelto: va el que llega antes (histéresis)
  const pl = fieldPlayers().filter((x) => x.team === team); if (pl.length < 2) return pl[0];
  const bp = ballLanding(), key = 'chase' + team; let c = S[key];
  if (!pl.includes(c)) c = timeTo(pl[0], bp) <= timeTo(pl[1], bp) ? pl[0] : pl[1];
  else { const o = pl[0] === c ? pl[1] : pl[0]; if (timeTo(o, bp) + 0.35 < timeTo(c, bp)) c = o; }
  S[key] = c; return c;
}
function supportSpot(a, carrier, dt) {   // desmarque: hueco libre, con línea de pase limpia y hacia delante
  a.supT = (a.supT || 0) - dt;
  if (a.supT > 0 && a.supP) return a.supP;
  a.supT = 0.5;
  const atkY = goalCenter(a.team).y, dirY = Math.sign(atkY), cx = carrier.pos.x, cy = carrier.pos.y;
  let best = null, bs = -1e9;
  for (const ox of [-12, -8, -4, 4, 8, 12]) for (const oy of [-3, 2, 6, 10, 14]) {
    const p = new V2(THREE.MathUtils.clamp(cx * 0.35 + ox, -HW + 2, HW - 2), THREE.MathUtils.clamp(cy + dirY * oy, -HL + 3, HL - 3));
    const dc = p.distanceTo(carrier.pos); if (dc < 6 || dc > 24) continue;
    const open = Math.min(8, openness(p, a.team)), lane = laneClear(carrier.pos, p, a.team, 2.2) ? 1 : 0;
    const prog = (p.y - cy) * dirY, dGoal = Math.hypot(p.x, atkY - p.y), travel = a.pos.distanceTo(p);
    let s = open + lane * 4 + prog * 0.3 - Math.max(0, dGoal - 12) * 0.12 - travel * 0.2;
    if (Math.abs(atkY - p.y) < 2.5) s -= 4;                      // no pegarse a la línea de fondo
    if (a.supP && p.distanceTo(a.supP) < 3) s += 1.2;             // estabilidad
    if (s > bs) { bs = s; best = p; }
  }
  a.supP = best || new V2(-Math.sign(cx || 1) * 8, cy + dirY * 6);
  return a.supP;
}
function coverSpot(a, threat) {   // cobertura: marca al otro atacante por el lado de nuestra portería, cerrando la línea de pase
  const ownY = -goalCenter(a.team).y, g = new V2(0, ownY);
  const other = foesOf(a).find((f) => f !== threat) || threat;
  if (!other) return new V2(0, ownY * 0.6);
  const t = other.pos.clone().add(g.clone().sub(other.pos).normalize().multiplyScalar(2.4));
  if (threat && threat !== other) t.lerp(threat.pos.clone().lerp(other.pos, 0.55), 0.3);
  t.x = THREE.MathUtils.clamp(t.x, -HW + 1.5, HW - 1.5); t.y = THREE.MathUtils.clamp(t.y, -HL + 2.5, HL - 2.5);
  return t;
}
function askForBall(a, carrier) {   // el bot pide el balón al humano cuando está solo y mejor colocado
  if (carrier !== user || (a.askCd || 0) > S.t) return;
  const atkY = goalCenter(a.team).y;
  if (openness(a.pos, a.team) > 5 && laneClear(user.pos, a.pos, a.team, 2) && Math.abs(atkY - a.pos.y) + 3 < Math.abs(atkY - user.pos.y) && a.pos.distanceTo(user.pos) > 6) {
    a.askCd = S.t + 4.5; S.mateAsk = S.t + 1.6;
    espIcon(a, '¡AQUÍ!', '#7fd3ff', 1.4, 1.2); LOG('bot_pide', a, {});
  }
}
function sideSign(a) { const m = mateOf(a); if (!m) return a.pos.x > 0 ? 1 : -1; return a.pos.x >= m.pos.x ? 1 : -1; }
function ai2Raw(a, opp, dt) {
  const m = mateOf(a), own = ball.owner, atkY = goalCenter(a.team).y, dirY = Math.sign(atkY), ownY = -atkY;
  const ownGk = a.team === 0 ? gkA : gkB, oppGk = a.team === 0 ? gkB : gkA;
  const foeN = nearestFoe(a) || opp;
  if (own === a) {
    if (m && !a.kickPending) {
      a.passEval = (a.passEval || 0) - dt;
      if (a.passEval <= 0) {
        a.passEval = 0.2;
        const pd = passDecision(a, m);
        if (pd) { a.wantTurbo = false; if (passBall(a, m, pd === 'alto')) return new V2(); }
      }
    }
    return aiFieldRaw(a, foeN, dt);
  }
  a.passEval = 0.3;   // al recibir, controla un instante antes de decidir
  if (own === ownGk) { a.wantTurbo = false; return aiArrive(a, new V2(sideSign(a) * 8, ownY + dirY * (13 + (sideSign(a) > 0 ? 0 : 6))), 2.0, 0.6); }
  if (own === oppGk) {
    if (m && m.pos.distanceTo(oppGk.pos) < a.pos.distanceTo(oppGk.pos)) { a.wantTurbo = false; return aiArrive(a, new V2(sideSign(a) * 8, atkY - dirY * (AI.boxDepth + 5)), 2.0, 0.6); }
    return aiFieldRaw(a, foeN, dt);
  }
  if (!own) {
    if (chaserOf(a.team) === a) return aiFieldRaw(a, foeN, dt);   // va a por el balón (con predicción)
    const bp = ballLanding(), fs = foesOf(a);
    const tm = m ? timeTo(m, bp) : 99, tf = fs.length ? Math.min(...fs.map((f) => timeTo(f, bp))) : 99;
    a.wantTurbo = false;
    if (m && tm < tf) return aiArrive(a, supportSpot(a, m, dt), 1.6, 0.5);
    return aiArrive(a, coverSpot(a, nearestFoe(a, bp)), 1.4, 0.4);
  }
  if (own.team === a.team) {   // compañero con balón: desmarque y, si toca, pedirla
    const sp = supportSpot(a, own, dt);
    a.wantTurbo = a.pos.distanceTo(sp) > 6 && a.energy > 0.4;
    askForBall(a, own);
    return aiArrive(a, sp, 1.6, 0.5);
  }
  // rival con balón: uno presiona (lógica 1v1: contención + entrada) y el otro cubre
  if (teamPresser(a, own) === a) return aiFieldRaw(a, own, dt);
  const cs = coverSpot(a, own);
  a.wantTurbo = a.pos.distanceTo(cs) > 5 && a.energy > 0.35;
  return aiArrive(a, cs, 1.3, 0.35);
}
const AI_FAR_DT = 1 / 20, AI_STAT = { full: 0, skip: 0 };   // update 31: IA de bots lejos del balón a 20 Hz en 2 VS 2
function botStep(a, playing, dt) {
  const opp = espFoe(a) || nearestFoe(a);
  let w = new V2();
  if (playing && a.freezeT <= 0 && a.slipT <= 0) {
    if (is2v2()) {
      a.aiAcc = (a.aiAcc || 0) + dt;
      const far = ball.owner !== a && Math.hypot(ball.pos.x - a.pos.x, ball.pos.y - a.pos.y) > 7 && !a.decoyChase;
      if (!far || !a.aiW || a.aiAcc >= AI_FAR_DT) { w = aiField(a, opp, a.aiAcc, ai2Raw); a.aiW = (a.aiW || new V2()).copy(w); a.aiAcc = 0; AI_STAT.full++; }
      else { w.copy(a.aiW); AI_STAT.skip++; }
    } else w = aiField(a, opp, dt);
    const hp = headersOn() ? botHeaderPlan(a) : null;
    if (hp) { w = aiArrive(a, new V2(hp.x - (hp.vx || 0) * 0.05, hp.y - (hp.vy || 0) * 0.05), 0.8, 0.15); a.wantTurbo = hp.run > 2.5 && a.energy > 0.3; }
    w = espAiWish(a, w, dt);
    w = trampaBot(a, w);   // update 31: balón trampa (perseguir el falso / chut al otro palo)
  }
  if (a.jumping) w.multiplyScalar(0.45);
  if (playing) espAI(a, opp, dt);
  updateEnergy(a, playing && !!a.wantTurbo, w.lengthSq() > 0.04, dt);
  const sp = SPEED_AI * a.sf.vel * (ball.owner === a ? 0.88 : 1) * (a.sprinting ? TURBO_MULT : 1) * espSpeedMul(a);
  moveActor(a, w, sp, dt);
  stepJump(a, dt);
}

// ---------- update 31: BALÓN TRAMPA apuntado ----------
let trampa = null, trampaArrow = null;
const _trc = new THREE.Raycaster(), _trv = new THREE.Vector2(), _trPl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _trh = new THREE.Vector3();
function trampaDefault(a) { const gk = espGkFoe(a), gy = goalCenter(a.team).y, sd = gk && Math.abs(gk.pos.x) > 0.3 ? Math.sign(gk.pos.x) : 1; return { x: sd * (GW - 1.0), y: gy }; }
function screenToField(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect(); _trv.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  _trc.setFromCamera(_trv, camera); if (!_trc.ray.intersectPlane(_trPl, _trh)) return null; return { x: _trh.x, y: -_trh.z };
}
function trampaStart(a) {
  trampa = { a, t0: S.t, tgt: trampaDefault(a), held: true, x0: null, y0: null, drag: false };
  if (!trampaArrow) {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0x3fd18b, transparent: true, opacity: 0.85, depthWrite: false });
    const body = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5), m); body.name = 'cuerpo';
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.1, 3).rotateX(-Math.PI / 2).translate(0, 0, -0.55), m); head.scale.y = 0.05; head.name = 'punta';
    g.add(body, head); g.renderOrder = 4; scene.add(g); trampaArrow = g;
  }
  trampaArrow.visible = true; showBanner('APUNTA EL BALÓN FALSO', 'bAzul', 900); LOG('trampa_apunta', a, {});
}
function trampaFire(tgt) {
  if (!trampa) return; const a = trampa.a; trampa = null; if (trampaArrow) trampaArrow.visible = false;
  espSpawnDecoy(a, tgt || trampaDefault(a)); espSfx.turtobola();
}
function trampaUpdate() {
  if (!trampa) return;
  const a = trampa.a;
  if (S.mode !== 'play' || !a) { trampa = null; if (trampaArrow) trampaArrow.visible = false; return; }
  if (S.t - trampa.t0 > 3.5) { trampaFire(trampa.tgt); return; }   // sin decidir: sale hacia el palo del portero
  const dx = trampa.tgt.x - a.pos.x, dy = trampa.tgt.y - a.pos.y, L = Math.max(1.5, Math.min(14, Math.hypot(dx, dy)));
  trampaArrow.position.copy(g2tS(a.pos.x, a.pos.y, 0.06)); trampaArrow.rotation.y = Math.atan2(-dx, dy);
  trampaArrow.getObjectByName('cuerpo').scale.z = L - 1; trampaArrow.getObjectByName('punta').position.z = -(L - 1);
}
function trampaPointer(e, phase) {   // devuelve true si el evento es del balón trampa
  if (!trampa) return false;
  if (phase === 'move' && trampa.held && e.pointerId === trampa.pid) {
    if (trampa.x0 === null) { trampa.x0 = e.clientX; trampa.y0 = e.clientY; }
    if (Math.hypot(e.clientX - trampa.x0, e.clientY - trampa.y0) > 24) { trampa.drag = true; const p = screenToField(e.clientX, e.clientY); if (p) trampa.tgt = p; }
    return true;
  }
  if (phase === 'up' && trampa.held && e.pointerId === trampa.pid) { trampa.held = false; if (trampa.drag) trampaFire(trampa.tgt); return true; }
  if (phase === 'down' && !trampa.held) {
    if (e.target === btnEspecial || btnEspecial.contains(e.target)) { trampaFire(trampa.tgt); return true; }   // 2º toque en ESPECIAL
    if (e.target === renderer.domElement) { const p = screenToField(e.clientX, e.clientY); trampaFire(p || trampa.tgt); return true; }   // toque en el campo
  }
  return false;
}
window.addEventListener('pointermove', (e) => trampaPointer(e, 'move'));
window.addEventListener('pointerup', (e) => trampaPointer(e, 'up'));
window.addEventListener('pointerdown', (e) => { if (trampaPointer(e, 'down')) { e.stopPropagation(); } }, true);
function trampaBot(a, w) {
  if (a.decoyChase) {
    const c = a.decoyChase, d = c.d;
    if (S.t > c.until || !d || !d.alive) a.decoyChase = null;
    else return aiArrive(a, new V2(d.pos.x, d.pos.y), 0.5, 0.1);   // pica: va a por el balón falso
  }
  if (a.trampaShot && S.t >= a.trampaShot.at) {
    const t = a.trampaShot; a.trampaShot = null;
    if (ball.owner === a && S.mode === 'play') { const gy = goalCenter(a.team).y; a.trampaShot = t; shoot(a, new THREE.Vector2(t.x - a.pos.x, gy - a.pos.y), 0.9, false); }
  }
  return w;
}

// ---------- SALTO Y CABEZAZO ----------
const _ap = new THREE.Vector3(), _av = new THREE.Vector3(), _afx = { curve: 0, lift: 0, dip: 0, ef: 0, efS: 0, efS0: 0 };
// update 31: círculo de caída (la marca blanca del suelo). Solo se puede cabecear estando DENTRO (usuario y bots)
const _lp = { x: 0, y: 0, k: -1, t: -1 }, _lq = new THREE.Vector3(), _lv = new THREE.Vector3(), _lfx = { curve: 0, lift: 0, dip: 0, ef: 0, efS: 0, efS0: 0 };
function landPt() {
  if (ball.owner || ball.pos.z <= BR + 0.05) return null;
  const key = ball.kickN || 0;
  if (_lp.t !== S.t || _lp.k !== key) {
    // punto donde el balón BAJA a altura de remate (cabeza + medio salto); si nunca pasa por ahí, donde toca el césped
    _lq.copy(ball.pos); _lv.copy(ball.vel); Object.assign(_lfx, ball.fx); const zh = HEAD_H + 0.45; let found = false;
    for (let t = 0; t < 4; t += 1 / 60) {
      airStep(_lq, _lv, 1 / 60, _lfx);
      if (_lv.z < 0 && _lq.z <= zh) { found = true; break; }
      if (_lq.z <= BR + 0.02) break;
    }
    if (found || _lq.z <= BR + 0.02) { _lp.x = _lq.x; _lp.y = _lq.y; } else { const l = predictFlight(ball.pos, ball.vel, null, 4, 1 / 60, ball.fx); _lp.x = l.x; _lp.y = l.y; }
    _lp.t = S.t; _lp.k = key;
  }
  return _lp;
}
function inLandCircle(a, x, y) {
  if (AJ.cabCirculo === false) return true;
  const l = landPt(); if (!l) return false;
  return Math.hypot((x === undefined ? a.pos.x : x) - l.x, (y === undefined ? a.pos.y : y) - l.y) <= LAND_R;
}
function aerialPlan(a, maxT = 1.0) {
  if (!a || ball.owner || S.mode !== 'play' || a.keeper) return null;
  if (ball.pos.z < BALL_LOW * 0.8 && ball.vel.z < 2) return null;
  _ap.copy(ball.pos); _av.copy(ball.vel); Object.assign(_afx, ball.fx);
  const h = 1 / 60, reach = PR + BR + 0.35, sp = (a === user ? SPEED_USER : SPEED_AI) * a.sf.vel * 0.8;
  for (let t = h; t <= maxT; t += h) {
    airStep(_ap, _av, h, _afx);
    if (_ap.z <= BR + 0.05) return null;                       // bota antes: no es de cabeza
    const need = _ap.z - HEAD_H;
    if (_ap.z > BALL_LOW + 0.05 && need < 0.95 && _av.z < 3) {
      const run = Math.hypot(_ap.x - a.pos.x, _ap.y - a.pos.y);
      if (run < reach + sp * Math.max(0, t - 0.08) && inLandCircle(a, _ap.x, _ap.y)) return { t, x: _ap.x, y: _ap.y, z: _ap.z, vx: _av.x, vy: _av.y, jump: THREE.MathUtils.clamp(need + 0.08, 0.15, 0.95), run };
    }
  }
  return null;
}
function jumpV0(h) { return Math.min(JUMP_V0, Math.sqrt(2 * GRAV * Math.max(0.15, h)) + 0.2); }
function canJump(a) { return !a.keeper && !a.jumping && a.stun <= 0 && a.freezeT <= 0 && a.slipT <= 0 && a.chargeT <= 0 && a.dashT <= 0 && a.dribbleT <= 0 && a.downT <= 0 && ball.owner !== a && !a.kickPending; }
function startJump(a, plan, intent) {
  if (!canJump(a)) return false;
  const v0 = jumpV0(plan ? plan.jump : 0.6);
  a.jumpIn = inLandCircle(a); a.jumping = true; a.jumpZ = 0.001; a.jumpVz = v0; a.headDone = false; a.headIntent = intent || 'auto'; a.jumpQ = null;
  const apexT = v0 / GRAV, imp = ((a.meta.Header && a.meta.Header.impact) || 13) / 30;
  a.headTs = THREE.MathUtils.clamp(imp / apexT, 0.7, 2.4);
  a.play('Header', 0.05, true);
  const _l = landPt(); LOG('salto', a, { intent: a.headIntent, h: +(v0 * v0 / 2 / GRAV).toFixed(2), dentro: a.jumpIn, dLand: _l ? +Math.hypot(a.pos.x - _l.x, a.pos.y - _l.y).toFixed(2) : -1 });
  return true;
}
function queueJump(a, plan, intent) {   // salta en el momento justo para que el punto más alto coincida con el balón
  const apexT = jumpV0(plan.jump) / GRAV;
  if (plan.t <= apexT + 0.05) return inLandCircle(a) ? startJump(a, plan, intent) : false;
  a.jumpQ = { at: S.t + plan.t - apexT, intent, plan }; a.headAssist = plan;
  return true;
}
function stepJump(a, dt) {
  if (a.jumpQ && S.t >= a.jumpQ.at) {
    const q = a.jumpQ; a.jumpQ = null; a.headAssist = null;
    if (!ball.owner && inLandCircle(a)) startJump(a, aerialPlan(a, 0.7) || q.plan, q.intent);
    else LOG('cabeza_fuera_circulo', a, {});
  }
  if (a.jumpQ && ball.owner) { a.jumpQ = null; a.headAssist = null; }
  if (!a.jumping) return;
  a.jumpVz -= GRAV * dt; a.jumpZ += a.jumpVz * dt;
  if (a.jumpZ <= 0) { a.jumpZ = 0; a.jumping = false; a.jumpVz = 0; a.vel.multiplyScalar(0.6); }
}
// contacto de cabeza (en el bucle de contacto con el balón)
function u30HeadContact(a) {
  if (!headersOn() || ball.owner || !a.jumping || a.headDone) return false;
  if (!a.jumpIn) return false;   // update 31: saltó fuera del círculo de caída
  if (ball.pos.z <= BALL_LOW) return false;
  const d = Math.hypot(ball.pos.x - a.pos.x, ball.pos.y - a.pos.y), hz = HEAD_H + a.jumpZ;
  if (d > PR + BR + 0.4 || Math.abs(ball.pos.z - hz) > 0.75) return false;
  doHeader(a, a.headIntent);
  return true;
}
function botHeaderKind(a, m, dGoal) {
  const atkY = goalCenter(a.team).y, ownD = Math.abs(-atkY - a.pos.y);
  if (dGoal < 17 && Math.abs(a.pos.x) < 4 + Math.abs(atkY - a.pos.y) * 0.9) return 'tiro';
  if (ownD < 14) return 'despeje';
  if (m && openness(m.pos, a.team) > 4 && laneClear(a.pos, m.pos, a.team, 2)) return 'pase';
  return 'despeje';
}
function doHeader(a, intent) {
  a.headDone = true;
  const atk = goalCenter(a.team), dGoal = Math.hypot(atk.x - a.pos.x, atk.y - a.pos.y), dirY = Math.sign(atk.y);
  const inSp = Math.hypot(ball.vel.x, ball.vel.y, ball.vel.z), m = mateOf(a);
  let kind = intent;
  if (kind === 'auto') kind = a === user ? (dGoal < 24 ? 'tiro' : (m ? 'pase' : 'despeje')) : botHeaderKind(a, m, dGoal);
  if (kind === 'pase' && !m) kind = 'despeje';
  const z0 = Math.max(BALL_LOW + 0.1, HEAD_H + a.jumpZ + 0.1);
  let dir, sp, vz;
  if (kind === 'tiro') {
    const md = a === user ? moveDir() : null, gk = a.team === 0 ? gkB : gkA;
    const tx = (gk && gk.pos.x > 0 ? -1 : 1) * (GW - 1.1) + (a === user ? 0 : (Math.random() - 0.5) * (1.5 + (100 - a.sf.t.pre) / 12));
    dir = md && md.y * dirY > 0.2 ? md.clone() : new V2(tx - a.pos.x, atk.y - a.pos.y);
    dir.normalize();
    if (a === user && AJ.aimAssist !== false && dir.y * dirY > 0.3) {   // asistencia: entre los postes
      const t = (atk.y - a.pos.y) / dir.y, xh = a.pos.x + dir.x * t;
      if (Math.abs(xh) < 10) dir.set(THREE.MathUtils.clamp(xh, -GW + 0.8, GW - 0.8) - a.pos.x, atk.y - a.pos.y).normalize();
    }
    const j = THREE.MathUtils.degToRad(a.sf.jitterDeg * 1.2) * (Math.random() * 2 - 1); if (j) dir.rotateAround(new V2(), j);
    sp = THREE.MathUtils.clamp(11 + inSp * 0.35, 12, 21) * a.sf.tir;
    const T = Math.max(0.25, dGoal / sp), zt = dGoal < 10 ? 0.7 : 1.4 + Math.random() * 1.2;   // cerca: hacia abajo (bote difícil)
    vz = THREE.MathUtils.clamp((zt - z0 + 0.5 * GRAV * T * T) / T, -7, 7);
    S.shots++;
  } else if (kind === 'pase') {
    const tgt = passTarget(a, m, false); dir = tgt.clone().sub(a.pos); const L = dir.length(); dir.normalize();
    const T = THREE.MathUtils.clamp(L / 13, 0.5, 1.3); sp = L / T; vz = (0.9 - z0 + 0.5 * GRAV * T * T) / T;   // cae a sus pies
  } else {   // despeje: hacia delante, alto y lejos del centro de nuestra área
    dir = new V2(a.pos.x * 0.4 + (Math.random() - 0.5) * 8, dirY * 12).normalize(); sp = 13 + Math.random() * 3; vz = 6;
  }
  ball.owner = null; ball.lastTouch = a; ball.noCatch = a; ball.noCatchT = 0.35; ball.backspin = 0; Object.assign(ball.fx, { curve: 0, lift: 0, dip: 0, ef: 0, efS: 0, efS0: 0 });
  ball.pos.set(a.pos.x + dir.x * PR * 0.6, a.pos.y + dir.y * PR * 0.6, z0);
  ball.vel.set(dir.x * sp, dir.y * sp, vz);
  ball.w.set(0, 1, 0).cross(_wv.set(ball.vel.x, 0, -ball.vel.y)).multiplyScalar(0.3 / BR);
  a.face.copy(dir); a.kickT = 0.3; ball.kickN = (ball.kickN || 0) + 1;
  espPuffs(ball.pos.x, ball.pos.y, ball.pos.z, 0xffffff, 4, 0.5, 0.7, 0.3, 0.2);
  sfx.header();
  if (kind === 'tiro') showBanner('¡CABEZAZO!', a.team === 0 ? 'bAzul' : 'bRojo', 700);
  LOG('cabezazo', a, { kind, z: +ball.pos.z.toFixed(2), d: +dGoal.toFixed(1) });
}
function botHeaderPlan(a) {   // el bot ve venir un balón aéreo: va al punto y salta a tiempo (solo el mejor colocado de su equipo)
  if (ball.owner || a.jumping) return a.jumping ? null : (a.headPlan = null);
  if (a.jumpQ) return a.headPlan;
  if ((a.headPlanT || 0) > S.t) return a.headPlan;
  a.headPlanT = S.t + 0.1; a.headPlan = null;
  if (ball.pos.z < 1.0 && ball.vel.z < 2) return null;
  const p = aerialPlan(a, 1.0); if (!p) return null;
  // sin rivales cerca y lejos de la portería rival: mejor dejarla caer y controlarla con el pie
  const fN = nearestFoe(a, p), dF = fN ? Math.hypot(fN.pos.x - p.x, fN.pos.y - p.y) : 99, dAtk = Math.abs(goalCenter(a.team).y - p.y);
  if (dF > 5 && dAtk > 18) return null;
  for (const x of fieldPlayers()) {
    if (x === a || x.team !== a.team) continue;
    if (x.jumping || x.jumpQ) return null;
    if (Math.hypot(x.pos.x - p.x, x.pos.y - p.y) + 0.6 < p.run) return null;
  }
  const key = (ball.lastTouch ? NAME(ball.lastTouch) : '') + '|' + (ball.kickN || 0);
  if (a.headKey !== key) { a.headKey = key; a.headWill = Math.random() < 0.85; }   // a veces calcula mal y no salta
  if (!a.headWill) return null;
  a.headPlan = p;
  if (p.t < 0.9 && inLandCircle(a)) queueJump(a, p, 'auto');
  return p;
}
function userHeader(intent) {
  if (!user || S.mode !== 'play' || S.paused || ball.owner || !headersOn()) return false;
  if (user.jumping) { if (!user.headDone) user.headIntent = intent; return true; }
  const plan = aerialPlan(user, 1.2); if (!plan) return false;
  if (!inLandCircle(user)) { LOG('cabeza_fuera_circulo', user, {}); return false; }
  return queueJump(user, plan, intent);
}
function u30UserWish(wish, playing, dt = 1 / 60) {
  if (!user) return;
  if (window.__game.userBot && playing && user.freezeT <= 0 && user.slipT <= 0) { const hp = headersOn() ? botHeaderPlan(user) : null; wish.copy(hp ? aiArrive(user, new V2(hp.x, hp.y), 0.8, 0.15) : aiField(user, espFoe(user) || nearestFoe(user), dt, is2v2() ? ai2Raw : aiFieldRaw)); if (user.jumping) wish.multiplyScalar(0.45); return; }   // solo pruebas: el usuario juega como bot
  S.uAir = playing && headersOn() && !ball.owner ? aerialPlan(user, 1.1) : null;
  if (playing && AJ.saltoAuto && S.uAir && S.uAir.t < 0.65 && !user.jumping && !user.jumpQ) userHeader('auto');   // SALTO AUTOMÁTICO (ajuste)
  if (user.jumping) { wish.multiplyScalar(0.45); return; }   // en el aire: poco control
  const hp = user.headAssist;
  if (playing && hp && user.jumpQ && wish.lengthSq() < 0.04) wish.copy(aiArrive(user, new V2(hp.x, hp.y), 0.8, 0.15));   // te coloca bajo el balón
}

// ---------- PORTEROS (salto, estirada alta, palmeo, salida a por centros) ----------
function gkBallZ(B, tt) { return Math.max(BR, B.pos.z + B.vel.z * tt - 0.5 * GRAV * tt * tt); }
function startGkJump(k, bz, tt) {
  if (k.gkJumpT > 0 || k.diveT > 0 || k.gkJumpQ || ball.owner === k) return false;
  const h = THREE.MathUtils.clamp(bz - GK_REACH * ESCALA + 0.3, 0.3, 0.95);
  const apexT = Math.sqrt(2 * GRAV * h) / GRAV;
  if (tt !== undefined && tt > apexT + 0.05) { k.gkJumpQ = { at: S.t + tt - apexT, h }; return true; }
  gkJumpNow(k, h); return true;
}
function gkJumpNow(k, h) {
  const v0 = Math.sqrt(2 * GRAV * h);
  k.kJumpVz = v0; k.kJumpZ = 0.001; k.gkJumpT = 2 * v0 / GRAV + 0.3;
  const reach = ((k.meta.GK_Jump && (k.meta.GK_Jump.reach || k.meta.GK_Jump.impact)) || 13) / 30;
  k.gkJumpTs = THREE.MathUtils.clamp(reach / (v0 / GRAV), 0.6, 2.4);
  k.play('GK_Jump', 0.05, true); LOG('portero_salta', k, { h: +h.toFixed(2) });
}
function stepGkJump(k, dt) {
  if (k.gkJumpQ && S.t >= k.gkJumpQ.at) { const q = k.gkJumpQ; k.gkJumpQ = null; if (ball.owner !== k && k.diveT <= 0) gkJumpNow(k, q.h); }
  if (k.gkJumpT > 0) {
    k.gkJumpT -= dt; k.kJumpVz -= GRAV * dt; k.kJumpZ = Math.max(0, k.kJumpZ + k.kJumpVz * dt);
    if (k.gkJumpT <= 0) { k.gkJumpT = 0; k.kJumpZ = 0; k.kJumpVz = 0; }
  }
}
function gkHighClaim(k, s) {   // centro / balón alto que cae en su área: sale a cazarlo si llega antes que los delanteros
  if (!gkPlus() || ball.owner || k.diveT > 0 || ball.pos.z < 1.3 || ball.vel.y * s < 0.5 || (k.react || 0) > 0) { k.claim = null; return null; }
  if ((k.claimT || 0) > S.t) return k.claim;
  k.claimT = S.t + 0.12;
  _ap.copy(ball.pos); _av.copy(ball.vel);
  const h = 1 / 60, top = GK_REACH * ESCALA + 0.6;
  let res = null;
  for (let t = h; t < 1.6; t += h) {
    _av.z -= GRAV * h; _ap.addScaledVector(_av, h);
    if (_ap.z < BR) break;
    if (Math.abs(_ap.y - s * HL) > 5.5 || Math.abs(_ap.x) > GW + 2.5) continue;
    if (_av.z < 0 && _ap.z < top && _ap.z > 1.2) {
      const p = new V2(_ap.x, _ap.y), run = p.distanceTo(k.pos);
      const foe = nearestFoe(k, p), df = foe ? foe.pos.distanceTo(p) : 99;
      if (run / (SPEED_GK * k.sf.ref) < t + 0.15 && run < df + 1.2) res = { x: p.x, y: p.y, z: _ap.z, t };
      break;
    }
  }
  if (res && !k.claim) LOG('portero_sale_alto', k, { t: +res.t.toFixed(2) });
  k.claim = res;
  if (res && res.z > GK_REACH * ESCALA - 0.35 && k.gkJumpT <= 0 && !k.gkJumpQ) startGkJump(k, res.z, res.t);
  return res;
}
function gkPalm(k, s) {   // no la blocca: la palmea a la esquina o por encima del larguero
  const sx = Math.sign(ball.pos.x - k.pos.x || ball.pos.x || 1);
  if (ball.pos.z > GH - 1.0) { ball.vel.set(ball.vel.x * 0.4 + sx * 1.5, s * 3.4, 5.5 + Math.random()); LOG('parada_larguero', k, {}); }
  else { ball.vel.set(sx * (8 + Math.random() * 5), -s * (2.5 + Math.random() * 3), 3 + Math.random() * 2); LOG('parada_palmeo', k, {}); }
  ball.noCatch = k; ball.noCatchT = 0.45; ball.lastTouch = k; S.saves++; sfx.save(); k.kickT = 0.35; rotParada(k);
  espPuffs(ball.pos.x, ball.pos.y, ball.pos.z, 0xffffff, 4, 0.4, 0.6, 0.3, 0.1);
}

// ---------- VENTOSA (Tubi) ----------
function espVentosaClear() { const V = ESP.ventosa; if (!V) return; for (const o of [V.g, V.band]) { scene.remove(o); espDispose(o); } ESP.ventosa = null; }
function espVentosa(dt) {
  const V = ESP.ventosa; if (!V) return;
  V.t += dt; const a = V.a, f = V.foe;
  const from = g2t(a.pos.x + a.face.x * 0.55, a.pos.y + a.face.y * 0.55, 1.15 * ESCALA);
  let cupP;
  if (!V.hit) {
    const k = Math.min(1, V.t / 0.26), to = g2t(f.pos.x, f.pos.y, 2.1 * ESCALA);
    cupP = from.clone().lerp(to, k); cupP.y += Math.sin(Math.PI * k) * 0.9;
    V.g.position.copy(cupP); V.g.lookAt(to);
    if (k >= 1) {
      V.hit = true; V.t = 0;
      f.freezeT = Math.max(f.freezeT, 1.5); f.vel.set(0, 0); f.kickPending = null; f.dashT = 0; f.dribbleT = 0; f.jumpQ = null;
      if (ball.owner === f) { ball.owner = null; ball.noCatch = f; ball.noCatchT = 1; V.pull = true; }
      espSfx.plop(); espIcon(f, 'PLOP', '#ff6f7d', 1.3, 1.3); espPuffs(f.pos.x, f.pos.y, 2.6, 0xffffff, 6, 0.8, 0.8, 0.5, 0.3);
      LOG('ventosa_pega', a, { vs: NAME(f), balon: !!V.pull });
    }
  } else {
    cupP = g2t(f.pos.x, f.pos.y, 2.05 * ESCALA + 0.05 * Math.sin(V.t * 30) * Math.max(0, 1 - V.t * 2));
    V.g.position.copy(cupP); V.g.lookAt(g2t(f.pos.x, f.pos.y, 0));
    const sq = 1 + 0.18 * Math.sin(V.t * 26) * Math.max(0, 1 - V.t * 2.5); V.g.scale.set(sq, sq, 2 - sq);
    if (V.pull) {   // el balón vuela pegado hasta Tubi
      const tgt = new THREE.Vector3(a.pos.x + a.face.x * 0.9, a.pos.y + a.face.y * 0.9, BR);
      ball.pos.lerp(tgt, Math.min(1, dt * 9)); ball.pos.z = Math.max(BR, ball.pos.z); ball.vel.set(0, 0, 0);
      if (ball.pos.distanceTo(tgt) < 0.45 || V.t > 0.55) {
        V.pull = false;
        if (!ball.owner && S.mode === 'play') { giveBall(a); ball.noCatch = null; a.stickT = 3; espIcon(a, '¡PEGADO!', '#ff6f7d', 1.3, 1.3); LOG('ventosa_trae', a, {}); }
      }
    }
    if (V.t > 1.5 || f.freezeT <= 0) { espPuffs(f.pos.x, f.pos.y, 2.6, 0xff9aa5, 6, 0.6, 0.7, 0.4, 0.4); espSfx.puf(); espVentosaClear(); return; }
  }
  // goma elástica entre Tubi y la ventosa (solo durante el vuelo y el tirón)
  const show = !V.hit || V.t < 0.35 || V.pull;
  V.band.visible = show;
  if (show) { const L = from.distanceTo(cupP); V.band.position.copy(from); V.band.lookAt(cupP); V.band.scale.set(1 + (V.hit ? 0.6 : 0), 1 + (V.hit ? 0.6 : 0), Math.max(0.05, L)); }
}

// ---------- CAMBIO DE JUGADOR (ajuste opcional) ----------
function swapControl() {
  if (!is2v2() || !mateA || S.mode !== 'play') return false;
  const o = user; user = mateA; mateA = o;
  const tri = o.marker; if (tri) { o.root.remove(tri); user.root.add(tri); user.marker = tri; o.marker = null; }
  user.ring.material.color.setHex(0x3d8bff); mateA.ring.material.color.setHex(0x8fbcff); applyTeamDiscs();
  for (const x of [user, mateA]) { x.aiS = null; x.jumpQ = null; x.headAssist = null; x.supP = null; }
  releaseShoot(true); aimEnd(null, true);
  espSetBtnLabel(); sfx.dribble(); LOG('cambio_jugador', user, {});
  return true;
}
// ---------- BOTÓN PASE ----------
const btnPase = document.getElementById('btnPase'), cargaPase = document.getElementById('cargaPase');
function userPass(lofted) {
  const m = mateOf(user); if (!m || ball.owner !== user) return false;
  const md = moveDir(); let tgt = null;
  if (md) {   // con el joystick apuntando lejos del compañero: pase al espacio en esa dirección
    const to = m.pos.clone().sub(user.pos), L = to.length();
    if (to.normalize().dot(md) < 0.55) tgt = user.pos.clone().addScaledVector(md, THREE.MathUtils.clamp(L, 8, 18));
  }
  return passBall(user, m, lofted, tgt);
}
function paseDown(e) {
  if (e) markAction('pase', e);
  if (btnPase) btnPase.classList.add('pulsado');
  input.paseT0 = 0;
  if (S.mode !== 'play' || S.paused || !user) return;
  if (!ball.owner && headersOn() && (S.uAir || user.jumping)) { userHeader('pase'); return; }   // balón aéreo: pase de cabeza
  if (ball.owner === user) { input.paseT0 = performance.now(); return; }
  if (is2v2() && ball.owner === mateA) { input.askT = S.t + 1.6; espIcon(user, '¡PÁSALA!', '#7fd3ff', 1.2, 1.2); LOG('pide_balon', user, {}); return; }
  if (is2v2() && AJ.cambio) swapControl();
}
function paseUp() {
  if (btnPase) btnPase.classList.remove('pulsado');
  const t0 = input.paseT0; input.paseT0 = 0;
  if (!t0 || S.mode !== 'play' || ball.owner !== user) return;
  userPass(performance.now() - t0 >= PASE_HOLD_MS);
}
if (btnPase) {
  bindHold(btnPase, (e) => paseDown(e), () => paseUp());
  btnPase.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
}
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyC') { paseDown(); e.preventDefault(); }
  if (e.code === 'KeyX' && S.mode === 'play') { userHeader('auto'); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => { if (e.code === 'KeyC') paseUp(); });
// ---------- UI por frame ----------
let possRing = null;
function u30UI() {
  trampaUpdate();
  if (editor.on) return;
  const air = !!user && S.mode === 'play' && ball.owner !== user && !hatVivo() && headersOn() && !!((S.uAir && inLandCircle(user)) || user.jumping || user.jumpQ);
  if (acciones._air !== air) {
    acciones._air = air; acciones.classList.toggle('aereo', air); btnChutar.classList.toggle('cabeza', air);
    const t = btnChutar.querySelector('.btnTxt'); if (t) t.textContent = air ? 'CABEZA' : chutLbl();
  }
  if (btnPase && is2v2()) {
    const has = ball.owner === user, mateHas = ball.owner === mateA;
    const lbl = air ? 'PASE' : has ? (input.paseT0 && performance.now() - input.paseT0 >= PASE_HOLD_MS ? 'ELEVADO' : 'PASE') : mateHas ? 'PÍDELA' : AJ.cambio ? 'CAMBIO' : 'PASE';
    const t = btnPase._txt || (btnPase._txt = btnPase.querySelector('.btnTxt')); if (t && t._l !== lbl) { t._l = lbl; t.textContent = lbl; }
    btnPase.classList.toggle('apagado', !has && !mateHas && !air && !AJ.cambio);
    btnPase.classList.toggle('sugerido', has && (S.mateAsk || 0) > S.t);
    const f = input.paseT0 && has ? Math.min(1, (performance.now() - input.paseT0) / PASE_HOLD_MS) : 0;
    if (cargaPase) { const v = Math.round(289 * (1 - f)); if (cargaPase._v !== v) { cargaPase._v = v; cargaPase.style.strokeDashoffset = v; } }
  }
  // quién lleva el balón (2 VS 2): aro amarillo bajo el poseedor
  if (!possRing) { possRing = ring(0xffd23f, 1.25 * ESCALA); possRing.position.y = 0.035; possRing.visible = false; scene.add(possRing); }
  const o = ball.owner, show = is2v2() && o && !o.keeper;
  possRing.visible = !!show && !discosOn();   // update 31: con círculos de equipo el poseedor late (sin aro amarillo)
  teamDiscPulse(show ? o : null);
  if (show) { possRing.position.x = o.root.position.x; possRing.position.z = o.root.position.z; possRing.scale.setScalar(1 + 0.06 * Math.sin(S.t * 8)); }
}
// ---------- update 31: círculos sólidos de equipo en 2 VS 2 ----------
const DISC_AZUL = 0x2f7dff, DISC_ROJO = 0xff3434;
let discGeo = null, userDot = null;
function discosOn() { return is2v2() && AJ.discos2v2 !== false; }
function applyTeamDiscs() {
  const on = discosOn();
  if (!discGeo) discGeo = new THREE.CircleGeometry(0.95 * ESCALA, 40).rotateX(-Math.PI / 2);
  for (const a of [user, rival, gkA, gkB, mateA, mateB]) {
    if (!a) continue;
    if (!a.disc) { a.disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })); a.disc.position.y = 0.028; a.disc.renderOrder = 2; a.root.add(a.disc); }
    a.disc.material.color.setHex(a.team === 0 ? DISC_AZUL : DISC_ROJO); a.disc.scale.setScalar(a.keeper ? 0.85 : 1);
    a.disc.visible = on; a.ring.visible = !on;
  }
  // tú: mismo azul, con un borde blanco fino para distinguirte de tu compañero (además del triángulo)
  if (!userDot) { userDot = new THREE.Mesh(new THREE.RingGeometry(0.95 * ESCALA * 0.86, 0.95 * ESCALA, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })); userDot.position.y = 0.031; userDot.renderOrder = 3; }
  if (userDot.parent) userDot.parent.remove(userDot);
  if (on && user) user.root.add(userDot);
}
function teamDiscPulse(o) {
  if (!discosOn()) return;
  for (const a of [user, mateA, rival, mateB]) if (a && a.disc) { const k = a === o ? 1.08 + 0.05 * Math.sin(S.t * 8) : (a.keeper ? 0.85 : 1); a.disc.scale.setScalar(k); a.disc.material.opacity = a === o ? 0.92 : 0.8; }
}
function u30Render() {
  for (const a of actors) {
    if (a.keeper) {
      let y = a.kJumpZ || 0;
      if (a.diveT > 0 && a.diveHigh) { const el = a.diveDur - a.diveT; y += a.diveLiftMax * Math.sin(Math.PI * THREE.MathUtils.clamp(el / 0.8, 0, 1)); }
      a.body.position.y = y;
    } else if (a.jumpZ > 0) a.body.position.y += a.jumpZ;
  }
}

// ---------- MENÚ 2 VS 2 ----------
const M2 = { mate: null, r1: null, r2: null };
const m2El = document.getElementById('m2v2');
const cBadgeImg = (k) => { const c = ALL_CHARS.find((x) => x.key === k); return c ? (c.badge || c.card) : ''; };
function m2Rivals(force) {
  const me = CHARS[sel].key, used = new Set([me, M2.mate]);
  const pool = CHARS.map((c) => c.key).filter((k) => !used.has(k));
  if (force || !M2.r1 || used.has(M2.r1)) { const pref = CHARS[rivalSel] && !used.has(CHARS[rivalSel].key) ? CHARS[rivalSel].key : null; M2.r1 = pref || pool[Math.floor(Math.random() * pool.length)]; }
  const pool2 = pool.filter((k) => k !== M2.r1);
  if (force || !M2.r2 || used.has(M2.r2) || M2.r2 === M2.r1) M2.r2 = pool2[Math.floor(Math.random() * pool2.length)];
}
function m2Pareja(a, b, cls) { return `<div class="m2Par ${cls}">${[a, b].map((k) => `<div class="m2Mini" style="--c:${cCol(k)}"><img src="${cBadgeImg(k)}" alt=""><span>${cName(k)}</span></div>`).join('<b>+</b>')}</div>`; }
function render2v2() {
  const me = CHARS[sel].key;
  document.getElementById('m2Lista').innerHTML = CHARS.filter((c) => c.key !== me).map((c) =>
    `<div class="m2It${c.key === M2.mate ? ' sel' : ''}" data-k="${c.key}" style="--c:${c.color}"><img src="${cBadgeImg(c.key)}" alt="" draggable="false"><span>${c.name}</span></div>`).join('');
  document.getElementById('m2Eq').innerHTML = m2Pareja(me, M2.mate, 'tu') + '<div class="m2Vs">VS</div>' + m2Pareja(M2.r1, M2.r2, 'riv');
}
function open2v2() {
  if (S.mode !== 'menu' || !m2El) return;
  const me = CHARS[sel].key;
  if (ALIN.duo && ALIN.duo !== me) M2.mate = ALIN.duo;   // update 37: el DÚO de tu ALINEACIÓN
  if (!M2.mate || M2.mate === me) { const pool = CHARS.map((c) => c.key).filter((k) => k !== me); M2.mate = pool[Math.floor(Math.random() * pool.length)]; }
  m2Rivals(true); render2v2(); m2El.classList.add('visible');
}
function close2v2() { if (m2El) m2El.classList.remove('visible'); }
async function play2v2() {
  if (S.mode !== 'menu') return;
  close2v2(); S.practice = false; S.comp = null;
  tryLandscape();
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  await campoReady;
  setupMatch(CHARS[sel].key, M2.r1, M2.mate, M2.r2);
  document.getElementById('btnJugar').textContent = 'JUGAR OTRA VEZ';
  startGame();
}
if (m2El) {
  document.getElementById('m2Lista').addEventListener('click', (e) => { const it = e.target.closest('.m2It'); if (!it) return; M2.mate = it.dataset.k; ALIN.duo = M2.mate; alinSave(); m2Rivals(false); render2v2(); sfx.dribble && actx && sfx.dribble(); });
  document.getElementById('m2Azar').addEventListener('click', () => { const me = CHARS[sel].key, pool = CHARS.map((c) => c.key).filter((k) => k !== me); M2.mate = pool[Math.floor(Math.random() * pool.length)]; m2Rivals(true); render2v2(); });
  document.getElementById('m2Volver').addEventListener('click', close2v2);
  document.getElementById('m2Jugar').addEventListener('click', () => play2v2());
}
// ---------- API de pruebas ----------
Object.assign(window.__game, {
  // update 35: lobby
  perfReload: () => { PERF = perfLoad(); lbRender(); return PERF; }, copasPartido, copasDelta, nivelDe, rangoDe, setModo, lobbyPlay, lbAbrir, lbCerrar, MODOS,
  setup2v2: async (uk, mk, rk, r2k) => { await campoReady; S.practice = false; S.comp = null; setupMatch(uk, rk, mk, r2k); startGame(); },
  is2v2: () => is2v2(), fieldPlayers: () => fieldPlayers(), AI_STAT, mateOf: (a) => mateOf(a),
  pass: (lofted) => userPass(!!lofted), pressPase: () => paseDown(), releasePase: () => paseUp(),
  header: (intent) => userHeader(intent || 'tiro'), aerialPlan: (a) => aerialPlan(a || user, 1.2),
  swap: () => swapControl(), passBall: (a, m, lofted) => passBall(a, m, lofted), startJump, doHeader,
  gkJump: (k, bz, tt) => startGkJump(k, bz, tt), startDive: (k, bx, bz) => startDive(k, bx, bz),
  open2v2, close2v2, play2v2, M2, ai2Raw,
});
Object.assign(window.__game, { cardHTML, shoot, THREE, effectCurve, applyTeamDiscs, discosOn, trampaFire: (x, y) => trampaFire(x === undefined ? null : { x, y }), screenToField, trampaPointer, landPt: () => { const l = landPt(); return l && { x: l.x, y: l.y }; }, inLandCircle: (a) => inLandCircle(a || user), LAND_R });   // update 31
Object.assign(window.__game, { avisoEvento, hatVivo, MS_get, msShow, msHide, get MS() { return MS; }, marcadorSet, marcGol, CTRL, TR, applyComboTR, applyTiroPase, showBanner, ROT_LOG, confeti, lobStatK: (k) => lobStatK({ charKey: k }), tpOn });   // update 32
Object.defineProperties(window.__game, { perf: { get: () => PERF, configurable: true }, rueda: { get: () => ({ pos: RUEDA.pos, target: RUEDA.target, sp: RUEDA.sp, n: RUEDA.items.length }), configurable: true } });   // update 35 (getters de verdad: Object.assign los congela)
Object.defineProperty(window.__game, 'campoDeco', { get: () => campoDeco, configurable: true });   // update 39
Object.defineProperty(window.__game, 'campoRoot', { get: () => campoRoot, configurable: true });   // update 40: para el escaneo del terreno de juego
Object.assign(window.__game, { buildCampo, setCampo, campoAplicar, CAMPO_OPS, CROP: { CROP_X, CROP_Y, CROP_H }, GEO: { HW, HL, WX, WY, SIDE_X, GW, POST_X, POST_R, GH, GD, NET_X, NET_Z, BR }, CAMS, CAMPOS, TEMAS, NOVEDADES, comboOn, patParse, patParseDirs, patDir, tryPattern: (m, who) => tryPattern(who || user, m), patImmune, PAT, get PG() { return PG; }, lobDeEspaldas, LOB_BACK_DEG, precompileFx, SIDE_X, QUALITY });   // update 35
Object.assign(window.__game, { tryDash, espPinch, CACTUS_T, ALL_CHARS, GK_CHARS, GK_ONLY, GK_STATS, GK_STAT_KEYS, statsAt, progCurve, lvCost, LV_MAX, LV_REF, TIERS, tierDe, progMejorar, monedasPartido, monedasTitulo, MON_PARTIDO, MON_TITULO,
  rivalLv, rivalGK, alinSet, abrirMejora, mejorarAhora, gkEspFire, gkEnCampo, LOB_NERF, LOB_K_MAX, GK44, lobErrK, lobErrRoll, LOB_ERR, actorStats, progLv, isGK, LV_REF_MODE, COL_KEYS, openColeccion, colGo,
  progReload: () => { PROG = progLoad(); lbRender(); return PROG; }, alinReload: () => { ALIN = alinLoad(); return ALIN; },
  setLv: (k, lv) => { PROG.lv[k] = lv; progSave(); lbRender(); }, setMon: (m) => { PROG.mon = m; progSave(); lbRender(); } });   // update 37
// ===================== update 48 (t106u): MÚSICA DEL MENÚ =====================
// «Blitz Stadium» (musiccreator.ai). Opus 96k (.ogg) o MP3 128k si el navegador no tiene Opus (iOS antiguo). No se descarga hasta el
// primer toque (política de autoplay + arranque más rápido). Va por WebAudio (GainNode) para poder hacer fundidos también en iOS
// (allí audio.volume es de solo lectura). Suena SOLO en el menú; al empezar el partido se funde y se pausa; vuelve al volver al menú.
const MUS = { el: null, g: null, gesto: false, playing: false, vol: 0.32, src: '', tp: 0, err: null };
function musSrc() { const a = document.createElement('audio'); return a.canPlayType('audio/ogg; codecs="opus"') ? 'assets/audio/menu_musica.ogg?v=48' : 'assets/audio/menu_musica.mp3?v=48'; }
function musInit() {
  if (MUS.el) return;
  const el = MUS.el = new Audio(); el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous'; MUS.src = el.src = musSrc();
  el.addEventListener('error', () => { MUS.err = 'error'; });
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  try { const s = actx.createMediaElementSource(el); MUS.g = actx.createGain(); MUS.g.gain.value = 0; s.connect(MUS.g); MUS.g.connect(actx.destination); } catch (e) { MUS.g = null; el.volume = 0; }
}
function musFade(to, t) {
  if (MUS.g && actx) { const g = MUS.g.gain, n = actx.currentTime; g.cancelScheduledValues(n); g.setValueAtTime(g.value, n); g.linearRampToValueAtTime(to, n + t); }
  else if (MUS.el) MUS.el.volume = to;
}
function musVol() { return MUS.g ? MUS.g.gain.value : MUS.el ? MUS.el.volume : 0; }
function musTick() {
  const want = MUS.gesto && AJ.musica && S.mode === 'menu' && !document.hidden;
  if (want && !MUS.playing) {
    musInit(); actx?.resume?.(); MUS.playing = true; clearTimeout(MUS.tp);
    const p = MUS.el.play(); if (p && p.catch) p.catch(() => { MUS.playing = false; });
    musFade(MUS.vol, 0.9);
  } else if (!want && MUS.playing) {
    MUS.playing = false; musFade(0, 0.6); clearTimeout(MUS.tp); MUS.tp = setTimeout(() => { if (!MUS.playing && MUS.el) MUS.el.pause(); }, 700);
  }
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, () => { if (!MUS.gesto) { MUS.gesto = true; setTimeout(musTick, 0); } }, { capture: true, passive: true });
setInterval(musTick, 300); document.addEventListener('visibilitychange', musTick);
function setMusica(on) {
  AJ.musica = !!on; saveAjustes();
  const b = document.getElementById('ajMusica'); if (b) { b.textContent = 'MÚSICA DEL MENÚ: ' + (AJ.musica ? 'SÍ' : 'NO'); b.classList.toggle('on', AJ.musica); }
  musTick();
}
document.getElementById('ajMusica')?.addEventListener('click', () => setMusica(!AJ.musica));
setMusica(AJ.musica);
Object.assign(window.__game, { musica: () => ({ on: AJ.musica, gesto: MUS.gesto, playing: MUS.playing, paused: MUS.el ? MUS.el.paused : null, t: MUS.el ? +MUS.el.currentTime.toFixed(2) : 0, vol: +musVol().toFixed(3), src: MUS.src, err: MUS.err, loop: MUS.el ? MUS.el.loop : null }), setMusica });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && TAQ.open) taqClose(); });
document.getElementById('ajFusion')?.addEventListener('click', () => setFusion(!AJ.fusionTR)); setFusion(AJ.fusionTR);
Object.assign(window.__game, { skinGC, skinTexN: () => Object.keys(SKIN_TEX_R).length, skinTexAniso: () => Object.values(SKIN_TEX_R).map((t) => t.anisotropy), portraitsPend: () => PORT_DIRTY.size, setFusion, fusion: () => ({ on: fusionOn(), id: FU.id, activo: FU.on, n: FU.n, dirs: PG.dirs.slice(), pg: PG.id, dwell: FU.dwell, dead: FU.dead, turbo: !!input.turboDown }), taqOpen, taqClose, taqEquip, taqStep, taqShow, taq: () => ({ open: TAQ.open, c: TAQ.c, dirty: TAQ.dirty, skin: TAQ.c ? skinOf(TAQ.c) : null,
  shown: (() => { const m = TAQ.c && taqModel(TAQ.c); return m ? { visible: m.root.visible, skin: m.model.userData.skin || null } : null; })(),
  others: menuChars.filter((m) => m.root.visible).length + Object.values(GK_PROB).filter((g) => g.root.visible).length, view: menuCam.view ? { ...menuCam.view } : null }) });
Object.assign(window.__game, { regalo: () => ({ hoy: REGALO_HOY, key: REGALO_KEY, mon: REGALO_MON }), HL, lobStatKTir: (t) => lobStatK({ sf: { t: { tir: t } } }), altoSens, altoSensU });
Object.defineProperties(window.__game, { META: { get: () => META, configurable: true }, PROG: { get: () => PROG, configurable: true }, ALIN: { get: () => ALIN, configurable: true }, matchSig: { get: () => matchSig, configurable: true } });
Object.assign(window.__game, { effectPlan, EF_THETA, EF_A, EF_B, efShape, gkCurveCross: (lineY, s) => { const r = gkCurveCross(lineY, s); return r && { tt: r.tt, x: r.x, z: r.z }; } });   // update 34
Object.defineProperty(window.__game, 'efTrail', { get: () => efTrail, configurable: true });   // update 44 (getter vivo: Object.assign lo congelaba)
Object.defineProperty(window.__game, 'trampa', { get: () => trampa && { t0: trampa.t0, tgt: trampa.tgt, held: trampa.held, pid: trampa.pid }, configurable: true });
Object.defineProperties(window.__game, {
  mateA: { get: () => mateA, configurable: true }, mateB: { get: () => mateB, configurable: true },
});
Object.defineProperty(window.__game, 'rivalSel', { get: () => rivalSel });
Object.defineProperty(window.__game, 'portraits', { get: () => Object.values(PORTRAITS).filter(Boolean).length });
Object.defineProperty(window.__game, 'camMode', { get: () => camMode });
Object.defineProperty(window.__game, 'inputBuf', { get: () => input.buf });
Object.defineProperty(window.__game, 'simplifierReady', { get: () => !!Simplifier });
Object.defineProperty(window.__game, 'vp', { get: () => lastVP });
(async function init() {
  const cargando = document.getElementById('cargando');
  applyQuality('init');
  const BOOT = window.__boot || null;   // update 40: pantalla de carga BEAST STRIKERS (index.html)
  try {
    cargando.textContent = 'Cargando personajes…';
    if (BOOT) BOOT.set(0.06);
    META = await (await fetch(`assets/anim_meta.json?${ASSET_V}`)).json();
    if (BOOT) BOOT.set(0.08);
    const fr = ALL_CHARS.map(() => 0), bootUpd = () => { if (BOOT) BOOT.set(0.08 + 0.84 * fr.reduce((a, b) => a + b, 0) / fr.length); };
    const gl = await Promise.all(ALL_CHARS.map((c, i) => load(c.file, (e) => { if (e && e.lengthComputable && e.total) { fr[i] = Math.min(0.99, e.loaded / e.total); bootUpd(); } }).then((g) => { fr[i] = 1; bootUpd(); return g; })));
    if (BOOT && BOOT.css) await BOOT.css;   // style.css llega en segundo plano: se espera antes de maquetar el menú
    ALL_CHARS.forEach((c, i) => { GLB[c.key] = gl[i]; toStandard(gl[i].scene); });
    applyTextureQuality();
    buildMenuChars(); renderPortraits(); buildMenuUI();
    layout(); layoutMenu(); updateOrient();
    cargando.classList.add('oculto');
    openMenu();
    window.__game.menuReady = true;
    setTimeout(regaloBanner, 1100);   // update 47: después del fundido de la pantalla de carga
    requestAnimationFrame(frame);
    if (BOOT) { BOOT.set(0.96); requestAnimationFrame(() => requestAnimationFrame(() => BOOT.done())); }   // fundido cuando el menú ya está pintado
    campoReady = load('assets/campo.glb?' + ASSET_V).then((campo) => { setupField(campo); window.__game.ready = true; });
    await campoReady;
  } catch (err) {
    console.error(err);
    cargando.classList.remove('oculto');
    cargando.textContent = 'Error cargando: ' + err.message;
    if (BOOT) BOOT.fail('Error cargando: ' + err.message);
  }
})();

// update 25 (pruebas): getters vivos (Object.assign copia el valor del getter una sola vez)
Object.defineProperty(window.__game, 'BADGES', { get: () => BADGES, configurable: true });
Object.defineProperty(window.__game, 'BADGE_ERR', { get: () => BADGE_ERR, configurable: true });   // update 32
Object.defineProperty(window.__game, 'sel', { get: () => sel, configurable: true });
// update 29 (pruebas): especiales
Object.assign(window.__game, { espSpeedMul, ESPECIALES, ESP, ESP_T, espUse: (who) => espUse(who === 'rival' ? rival : user), espCanUse: (who) => espCanUse(who === 'rival' ? rival : user),
  espCharge: (who, v = 1) => { const a = who === 'rival' ? rival : user; if (a) a.esp = v; }, setEspeciales: (on) => setEspeciales(on), espClear: () => espClear() });
