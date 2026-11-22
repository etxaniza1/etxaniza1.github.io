// update 39: campos temáticos (VOLCÁN, HIELO, BOSQUE DE SETAS).
// update 40: el terreno de juego (dentro de las vallas) es LISO en todos: sin losas, grietas, placas ni manchas; solo el césped de campo.glb recoloreado + líneas.
// SOLO ASPECTO: colores de campo.glb (suelo, líneas, vallas, porterías, red) + decorado exterior low-poly.
// Nada jugable cambia: el campo, las vallas, las porterías y la red son los mismos del estadio (la física va por constantes en main.js).
// Rendimiento móvil: todo el decorado se FUSIONA en 3 mallas (props con contorno toon, planos, brillos) + cielo + partículas.
export const CAMPOS = ['estadio', 'volcan', 'hielo', 'setas'];
export const CAMPO_NOM = { estadio: 'ESTADIO', volcan: 'VOLCÁN', hielo: 'HIELO', setas: 'BOSQUE DE SETAS', aleatorio: 'ALEATORIO' };
// gradas, rótulos, marcador, banquillos, árboles, cuenco de hormigón, barandillas: fuera (los sustituye el decorado del tema)
const HIDE = /^(Grada_|Texto_|Publicidad_|Marcador|Banquillos_|PortaBalones_|Arboles|Bordillo|Muros|Porteria_Propia_Marco)/;
const CROP = /^Banderines/;   // vallas + porterías + banderines (y restos de gradas que se recortan)
const GRASS = (a, b, run, wear) => ({ grassA: a, grassB: b, grassRun: run, grassWear: wear });
const LISO = /^grassWear$/;   // update 40: parches de desgaste del césped fuera en los temas (se leían como manchas/relieve)
const nada = () => {};   // update 40: pieza anulada (dentro del campo)
// update 41: alturas de las capas del suelo en los temas: mismo orden que campo.glb pero separadas 2,5 cm (antes ground y path
// coincidían a -0.043 y el resto iba a 3–12 mm): sin z-fighting ni con la poca precisión de profundidad de los móviles.
const SUELOS = { grassRun: -0.02, pavingDark: -0.045, track: -0.07, paving: -0.095, path: -0.12, ground: -0.145 };
export const TEMAS = {
  dbg: { hide: HIDE, crop: CROP, bg: '#000000', apron: '#000000', colors: { blue: '#0000ff', red: '#ff0000', white: '#00ff00', paving: '#ff88cc', pavingDark: '#8800ff', track: '#884400', ground: '#556600', path: '#ffffff', net: '#888888' } },
  volcan: {
    hide: HIDE, crop: CROP, hideMat: LISO, suelos: SUELOS, bg: '#3a1410', apron: '#2a2224', sky: ['#120606', '#5a1a0e', '#c2471b'],
    colors: { ...GRASS('#3b3336', '#353033', '#2e292b', '#443a3a'), blue: '#2c2528', red: '#3d3336', white: '#4a4043', post: '#e7d3b3', net: '#e9dccb',
      paving: '#352d30', pavingDark: '#2a2326', track: '#4a2216', ground: '#231c1e', path: '#2d2427' },
    glow: { line: '#ff8a1e' },
  },
  hielo: {
    hide: HIDE, crop: CROP, hideMat: LISO, suelos: SUELOS, bg: '#1b2c5a', apron: '#dfeaf5', sky: ['#081233', '#1f3a7a', '#5d86c9'],
    colors: { ...GRASS('#d5e1ed', '#cad8e6', '#cfdcea', '#c2d1e1'), line: '#2f6fe0', blue: '#4f9fe0', red: '#86c8f2', white: '#f4f9ff', post: '#ffffff', net: '#ffffff',
      paving: '#e2ecf6', pavingDark: '#cbdcee', track: '#9fc6e8', ground: '#eef4fa', path: '#d6e4f2' },
  },
  setas: {
    hide: HIDE, crop: CROP, hideMat: LISO, suelos: SUELOS, bg: '#2c1d55', apron: '#2b4d22', sky: ['#120a2c', '#3b2470', '#8a5bc0'],
    colors: { ...GRASS('#4f8f2e', '#467f29', '#3f7425', '#5a9a38'), line: '#f3f0d8', blue: '#5c3a22', red: '#6e4a2c', white: '#8a6640', post: '#7a5232', net: '#f4efe0',
      paving: '#3b6a2b', pavingDark: '#325c24', track: '#5b4630', ground: '#284a20', path: '#4a3b28' },
  },
};

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Kit: acumula piezas (geometría + transformación + color) y las fusiona en una malla por tipo.
class Kit {
  constructor(T) {
    this.T = T; this.L = { prop: [], flat: [], glow: [] }; this.stack = [new T.Matrix4()];
    this._m = new T.Matrix4(); this._q = new T.Quaternion(); this._e = new T.Euler(); this._p = new T.Vector3(); this._s = new T.Vector3(); this.G = {};
  }
  // coords de juego: x derecha, y hacia la portería rival, h altura. ry = giro (0 = mira a +y)
  mat(x, y, h, ry = 0, s = 1, rx = 0, rz = 0) {
    const T = this.T, sv = Array.isArray(s) ? s : [s, s, s];
    this._e.set(rx, ry, rz, 'YXZ'); this._q.setFromEuler(this._e);
    return new T.Matrix4().compose(this._p.set(x, h, -y), this._q, this._s.set(sv[0], sv[1], sv[2]));
  }
  at(x, y, h, ry, s, fn) { this.stack.push(this.top().clone().multiply(this.mat(x, y, h, ry, s))); fn(); this.stack.pop(); }
  top() { return this.stack[this.stack.length - 1]; }
  add(kind, geo, c, x, y, h, o = {}) {
    const m = this.top().clone().multiply(this.mat(x, y, h, o.ry || 0, o.s == null ? 1 : o.s, o.rx || 0, o.rz || 0));
    this.L[kind].push({ geo, m, c: new this.T.Color(c), c2: o.c2 ? new this.T.Color(o.c2) : null });
  }
  geo(k, f) { return this.G[k] || (this.G[k] = f()); }
  build(kind) {
    const T = this.T, L = this.L[kind]; if (!L.length) return null;
    let nv = 0, ni = 0;
    for (const p of L) { nv += p.geo.attributes.position.count; ni += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), I = new Uint32Array(ni);
    const v = new T.Vector3(), nm = new T.Matrix3(); let vo = 0, io = 0;
    for (const p of L) {
      const g = p.geo, pa = g.attributes.position, na = g.attributes.normal; nm.getNormalMatrix(p.m);
      if (!g.boundingBox) g.computeBoundingBox(); const y0 = g.boundingBox.min.y, dy = (g.boundingBox.max.y - y0) || 1;
      for (let i = 0; i < pa.count; i++) {
        const ly = pa.getY(i);
        v.fromBufferAttribute(pa, i).applyMatrix4(p.m); P[(vo + i) * 3] = v.x; P[(vo + i) * 3 + 1] = v.y; P[(vo + i) * 3 + 2] = v.z;
        v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N[(vo + i) * 3] = v.x; N[(vo + i) * 3 + 1] = v.y; N[(vo + i) * 3 + 2] = v.z;
        let r = p.c.r, gg = p.c.g, b = p.c.b;
        if (p.c2) { const t = (ly - y0) / dy; r += (p.c2.r - r) * t; gg += (p.c2.g - gg) * t; b += (p.c2.b - b) * t; }
        C[(vo + i) * 3] = r; C[(vo + i) * 3 + 1] = gg; C[(vo + i) * 3 + 2] = b;
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) I[io++] = g.index.getX(i) + vo;
      else for (let i = 0; i < pa.count; i++) I[io++] = i + vo;
      vo += pa.count;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(P, 3)); geo.setAttribute('normal', new T.BufferAttribute(N, 3)); geo.setAttribute('color', new T.BufferAttribute(C, 3));
    geo.setIndex(new T.BufferAttribute(I, 1)); geo.computeBoundingSphere(); geo.computeBoundingBox();
    return geo;
  }
}
// geometrías base (compartidas)
function G(k, T) {
  return {
    box: k.geo('box', () => new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
    ico: k.geo('ico', () => new T.IcosahedronGeometry(1, 0)),
    dode: k.geo('dode', () => new T.DodecahedronGeometry(1, 0)),
    sph: k.geo('sph', () => new T.SphereGeometry(1, 9, 6)),
    sphLo: k.geo('sphLo', () => new T.SphereGeometry(1, 6, 4)),
    cone5: k.geo('cone5', () => new T.ConeGeometry(1, 1, 5).translate(0, 0.5, 0)),
    cone6: k.geo('cone6', () => new T.ConeGeometry(1, 1, 6).translate(0, 0.5, 0)),
    cone7: k.geo('cone7', () => new T.ConeGeometry(1, 1, 7).translate(0, 0.5, 0)),
    cone4: k.geo('cone4', () => new T.ConeGeometry(1, 1, 4).translate(0, 0.5, 0)),
    cone3: k.geo('cone3', () => new T.ConeGeometry(1, 1, 3).translate(0, 0.5, 0)),
    cyl6: k.geo('cyl6', () => new T.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0)),
    cyl8: k.geo('cyl8', () => new T.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0)),
    stem: k.geo('stem', () => new T.CylinderGeometry(0.78, 1, 1, 8).translate(0, 0.5, 0)),
    cap: k.geo('cap', () => new T.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2)),
    gill: k.geo('gill', () => new T.CylinderGeometry(0.96, 0.3, 0.16, 12).translate(0, 0.08, 0)),
    crys: k.geo('crys', () => { const a = new T.CylinderGeometry(1, 0.85, 0.72, 6).translate(0, 0.36, 0), b = new T.CylinderGeometry(0, 1, 0.28, 6).translate(0, 0.86, 0); return mergeTwo(T, a, b); }),
    torus: k.geo('torus', () => new T.TorusGeometry(1, 0.28, 4, 9).rotateX(Math.PI / 2)),
    disk: k.geo('disk', () => new T.CircleGeometry(1, 10).rotateX(-Math.PI / 2)),
    hex: k.geo('hex', () => new T.CircleGeometry(1, 6).rotateX(-Math.PI / 2)),
  };
}
function mergeTwo(T, a, b) {
  const A = a.toNonIndexed(), B = b.toNonIndexed(), g = new T.BufferGeometry();
  for (const k of ['position', 'normal']) { const x = A.attributes[k].array, y = B.attributes[k].array, z = new Float32Array(x.length + y.length); z.set(x); z.set(y, x.length); g.setAttribute(k, new T.BufferAttribute(z, 3)); }
  return g;
}
// polígono irregular plano (manchas, placas de hielo, losas)
function blobGeo(T, R, n, irr, rnd) { const s = new T.Shape(); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, r = R * (1 - irr + irr * 2 * rnd()); if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } s.closePath(); return new T.ShapeGeometry(s).rotateX(-Math.PI / 2); }
// cinta plana por una polilínea (coords de juego), ancho w, a altura h; colores borde/centro
function ribbon(T, pts, w, h) {
  const P = [], N = [], I = [], E = [];   // E: 1 = borde, 0 = centro (para degradado de lava)
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, ww = (pts[i][2] || w) / 2;
    for (const [f, e] of [[-1, 1], [-0.45, 0], [0.45, 0], [1, 1]]) { P.push(pts[i][0] + nx * ww * f, h, -(pts[i][1] + ny * ww * f)); N.push(0, 1, 0); E.push(e); }
    if (i) { const o = (i - 1) * 4; for (let k = 0; k < 3; k++) I.push(o + k, o + 4 + k, o + k + 1, o + k + 1, o + 4 + k, o + 5 + k); }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); g.setIndex(I); g.userData.edge = E; return g;
}
function skyDome(T, cols) {
  const g = new T.SphereGeometry(420, 24, 12), P = g.attributes.position, C = new Float32Array(P.count * 3), top = new T.Color(cols[0]), mid = new T.Color(cols[1]), hor = new T.Color(cols[2]), c = new T.Color();
  for (let i = 0; i < P.count; i++) { const t = Math.max(0, P.getY(i) / 420); if (t < 0.25) c.copy(hor).lerp(mid, t / 0.25); else c.copy(mid).lerp(top, Math.min(1, (t - 0.25) / 0.6)); C.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new T.BufferAttribute(C, 3));
  const m = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, depthWrite: false, fog: false }));
  m.renderOrder = -10; m.frustumCulled = false; m.userData.deco = true; m.name = 'Cielo'; return m;
}
function dotTex(T) { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; }
// partículas: brasas (suben), nieve (cae), luciérnagas (flotan). Se recolocan alrededor de la cámara.
function particles(T, kind, n, color, size, rnd) {
  const P = new Float32Array(n * 3), V = new Float32Array(n * 3);
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(P, 3).setUsage(T.DynamicDrawUsage));
  const m = new T.PointsMaterial({ color, size, map: dotTex(T), transparent: true, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true, fog: false });
  const pts = new T.Points(g, m); pts.frustumCulled = false; pts.userData.deco = true; pts.name = 'Particulas_' + kind; pts.renderOrder = 5;
  const spawn = (i, cy, first) => {
    let x, y, h;
    if (kind === 'brasas') { const side = rnd() < 0.5 ? -1 : 1; x = side * (28 + rnd() * 14); y = cy - 15 + rnd() * 75; if (rnd() < 0.3) { x = -30 + rnd() * 60; y = 34 + rnd() * 18; } h = first ? rnd() * 14 : 0.2; V.set([(rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6, 1.4 + rnd() * 2.2], i * 3); }
    else if (kind === 'nieve') { x = -48 + rnd() * 96; y = cy - 12 + rnd() * 75; h = first ? rnd() * 22 : 22; V.set([0.5 + rnd() * 0.5, (rnd() - 0.5) * 0.4, -(1.2 + rnd() * 1.1)], i * 3); }
    else { const side = rnd() < 0.5 ? -1 : 1; x = side * (23.5 + rnd() * 22); y = cy - 12 + rnd() * 72; if (rnd() < 0.25) { x = -26 + rnd() * 52; y = 31 + rnd() * 14; } h = 0.6 + rnd() * 5; V.set([(rnd() - 0.5), (rnd() - 0.5), (rnd() - 0.5) * 0.4], i * 3); }
    P[i * 3] = x; P[i * 3 + 1] = h; P[i * 3 + 2] = -y;
  };
  for (let i = 0; i < n; i++) spawn(i, 0, true);
  let t = 0;
  pts.userData.update = (dt, cam) => {
    t += dt; const cy = cam ? -cam.position.z + 20 : 0;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      if (kind === 'luciernagas') { V[j] += Math.sin(t * 1.3 + i) * dt * 0.8; V[j + 1] += Math.cos(t * 1.1 + i * 1.7) * dt * 0.8; V[j] *= 0.985; V[j + 1] *= 0.985; V[j + 2] = Math.sin(t * 2 + i) * 0.35; }
      P[j] += V[j] * dt; P[j + 1] += V[j + 2] * dt; P[j + 2] -= V[j + 1] * dt;
      const gy = -P[j + 2];
      if ((kind === 'brasas' && P[j + 1] > 16) || (kind === 'nieve' && P[j + 1] < 0) || gy < cy - 30 || gy > cy + 70 || (kind === 'luciernagas' && (P[j + 1] < 0.3 || P[j + 1] > 7))) spawn(i, cy, false);
    }
    m.opacity = kind === 'luciernagas' ? 0.75 + 0.25 * Math.sin(t * 3) : 0.95;
    g.attributes.position.needsUpdate = true;
  };
  return pts;
}

// ---------- utilidades de colocación ----------
const faceTo = (x, y, tx, ty) => Math.atan2(-(tx - x), ty - y);
const lerpC = (T, a, b, t) => '#' + new T.Color(a).lerp(new T.Color(b), t).getHexString();
// valla: x de los muros de banda y y del fondo (vallas de campo.glb: |x| 21.2–22.6, |y| hasta 30.4)
const WALL_X = 22.25, WALL_Y = 29.35;

// =============== VOLCÁN ===============
function volcan(T, k, r) {
  const g = G(k, T);
  const ROCK = ['#2b2427', '#332b2e', '#3c3336', '#463c3e'];
  const rock = () => ROCK[(r() * ROCK.length) | 0];
  // grietas de lava en el suelo del campo — update 40: FUERA (campo liso). Se siguen consumiendo los mismos números aleatorios para que el decorado exterior quede idéntico a v39. (finas y tenues: no se confunden con las líneas)
  for (let n = 0; n < 22; n++) {
    let x = -18 + r() * 36, y = -26 + r() * 52, a = r() * Math.PI * 2; const pts = [[x, y]];
    for (let s = 0; s < 4 + ((r() * 4) | 0); s++) { a += (r() - 0.5) * 1.4; const l = 0.8 + r() * 1.6; x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push([x, y]); }
    if (pts.every((p) => Math.abs(p[0]) < 20.8 && Math.abs(p[1]) < 27.6)) nada('glow', ribbon(T, pts, 0.07, 0.011), '#5c2410', 0, 0, 0);
  }
  // losas de basalto — update 40: FUERA (campo liso). Se siguen consumiendo los mismos números aleatorios para que el decorado exterior quede idéntico a v39. (manchas algo más oscuras/claras)
  for (let n = 0; n < 70; n++) { const x = -20 + r() * 40, y = -27 + r() * 54; nada('flat', blobGeo(T, 1.3 + r() * 1.6, 6, 0.3, r), r() < 0.5 ? '#302a2d' : '#3e3638', x, y, 0.005, { ry: r() * 6 }); }
  // almenas de roca sobre las vallas (bandas y fondo rival; el fondo propio NO se sube: taparía tu red)
  for (const s of [-1, 1]) for (let y = -27.5; y <= 27.5; y += 2.05) { const hh = 0.8 + r() * 0.5; k.add('prop', g.box, rock(), s * WALL_X, y, 0.95, { s: [0.95, hh, 1.45], ry: (r() - 0.5) * 0.08 }); }
  for (let x = -20.5; x <= 20.6; x += 2.05) { const hh = 0.8 + r() * 0.5; k.add('prop', g.box, rock(), x, WALL_Y, 0.95, { s: [1.45, hh, 0.95] }); }
  // porterías: remates de roca con cuernos en las esquinas superiores (fuera del hueco de la portería)
  for (const gy of [-24, 24]) for (const s of [-1, 1]) {
    k.add('prop', g.dode, '#4a4043', s * 5.28, gy, 4.32, { s: 0.42 });
    k.add('prop', g.cone4, '#2a2326', s * 5.5, gy, 4.5, { s: [0.12, 0.55, 0.12], rz: s * 0.5 });
  }
  // ríos de lava a los lados y lago al fondo
  const riv = (s) => { const pts = []; for (let y = -75; y <= 70; y += 3) pts.push([s * (34 + 3.2 * Math.sin(y / 9 + s)), y, 6 + 1.5 * Math.sin(y / 5)]); return pts; };
  for (const s of [-1, 1]) {
    const pts = riv(s); const rb = ribbon(T, pts, 6, 0.04);
    k.add('glow', rb, '#ffb12e', 0, 0, 0); k.L.glow[k.L.glow.length - 1].edge = rb.userData.edge;
    for (const p of pts) for (const e of [-1, 1]) if (r() < 0.85) { const sz = 0.6 + r() * 1.3; k.add('prop', g.ico, rock(), p[0] + e * (p[2] / 2 + 0.4 + r() * 0.8), p[1] + (r() - 0.5) * 2, sz * 0.35, { s: [sz, sz * (0.55 + r() * 0.4), sz], ry: r() * 6 }); }
  }
  { const pts = []; for (let x = -38; x <= 38; x += 3) pts.push([x, 46 + 3 * Math.sin(x / 7), 9 + 2 * Math.sin(x / 4)]); const rb = ribbon(T, pts, 9, 0.04); k.add('glow', rb, '#ffb12e', 0, 0, 0); k.L.glow[k.L.glow.length - 1].edge = rb.userData.edge; }
  // banda entre la valla y el río: escombros bajos + gárgolas
  for (const s of [-1, 1]) {
    for (let n = 0; n < 34; n++) { const x = s * (24.2 + r() * 5.5), y = -40 + r() * 76, sz = 0.35 + r() * 0.8; k.add('prop', g.ico, rock(), x, y, sz * 0.3, { s: [sz, sz * 0.7, sz], ry: r() * 6 }); }
    for (const y of [-14, 3, 20]) gargola(T, k, g, s * 28, y, faceTo(s * 28, y, 0, y), 1);
    // grietas de lava en el suelo exterior
    for (let n = 0; n < 10; n++) { let x = s * (25 + r() * 4), y = -35 + r() * 68, a = r() * 6; const pts = [[x, y]]; for (let q = 0; q < 4; q++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * 1.4; y += Math.sin(a) * 1.4; pts.push([x, y]); } (pts.every((p) => Math.abs(p[0]) >= 23) ? k.add : nada).call(k, 'glow', ribbon(T, pts, 0.16, 0.02), '#e3540f', 0, 0, 0); }   // update 40: ninguna grieta entra por dentro de las vallas
  }
  // agujas y peñascos de roca volcánica más allá de los ríos
  for (const s of [-1, 1]) for (let n = 0; n < 30; n++) {
    const x = s * (41 + r() * 24), y = -60 + r() * 120, h = 6 + r() * 16, rr = 2 + r() * 3.5;
    k.add('prop', r() < 0.5 ? g.cone5 : g.cone6, '#262022', x, y, -0.2, { s: [rr, h, rr * (0.8 + r() * 0.4)], ry: r() * 6, c2: '#4b3d3d' });
    if (r() < 0.6) { const b = 1.4 + r() * 2; k.add('prop', g.dode, rock(), x + (r() - 0.5) * 5, y + (r() - 0.5) * 5, b * 0.4, { s: [b, b * 0.8, b], ry: r() * 6 }); }
  }
  // fondo rival: escombros, dos gárgolas grandes y el volcán
  for (let n = 0; n < 26; n++) { const x = -26 + r() * 52, y = 31 + r() * 9, sz = 0.5 + r() * 1.1; k.add('prop', g.ico, rock(), x, y, sz * 0.3, { s: [sz, sz * 0.7, sz], ry: r() * 6 }); }
  for (const s of [-1, 1]) gargola(T, k, g, s * 13, 34, faceTo(s * 13, 34, 0, 0), 1.25);
  for (const s of [-1, 1]) for (let n = 0; n < 7; n++) { const x = s * (16 + r() * 18), y = 36 + r() * 6, h = 4 + r() * 7, rr = 1.6 + r() * 2.2; k.add('prop', g.cone5, '#262022', x, y, -0.2, { s: [rr, h, rr], ry: r() * 6, c2: '#4b3d3d' }); }
  k.add('prop', k.geo('volc', () => new T.CylinderGeometry(7, 34, 30, 11, 3).translate(0, 15, 0)), '#241c1e', 0, 78, -0.5, { c2: '#4a3634' });
  k.add('glow', k.geo('crater', () => new T.CylinderGeometry(6.2, 6.6, 0.6, 11).translate(0, 0.3, 0)), '#ffb12e', 0, 78, 29.6);
  // (sin coladas en la ladera: con la cámara del juego solo se ve la falda del volcán y quedaban como barras)
}
// cinta sobre la ladera del volcán (h según el radio: cono de 30 m)
function ribbonSlope(T, pts, H) {
  const P = [], N = [], I = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y, w] = pts[i], dx = x - 0, dy = y - 78, rr = Math.hypot(dx, dy) || 1, nx = -dy / rr, ny = dx / rr, h = H * (1 - (rr - 7) / 27) + 0.15 - 0.5;
    P.push(x - nx * w / 2, h, -(y - ny * w / 2), x + nx * w / 2, h, -(y + ny * w / 2)); N.push(0, 1, 0, 0, 1, 0);
    if (i) { const o = (i - 1) * 2; I.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); g.setIndex(I); return g;
}
function gargola(T, k, g, x, y, ry, s) {
  k.at(x, y, 0, ry, s, () => {
    k.add('prop', g.box, '#3b3235', 0, 0, 0, { s: [2.2, 1.45, 2.2] });
    k.add('prop', g.box, '#4c4245', 0, 0, 1.45, { s: [2.5, 0.25, 2.5] });
    k.add('prop', g.sph, '#5c5357', 0, -0.1, 2.55, { s: [0.85, 1.05, 0.8] });
    for (const e of [-1, 1]) { k.add('prop', g.box, '#4f4649', e * 0.45, 0.45, 1.7, { s: [0.4, 0.55, 0.6] }); k.add('prop', g.cone3, '#463d41', e * 0.95, -0.35, 2.3, { s: [0.9, 2.3, 0.16], rz: -e * 0.75, ry: e * 0.25 }); }
    k.add('prop', g.dode, '#655c60', 0, 0.35, 3.75, { s: [0.6, 0.55, 0.62] });
    k.add('prop', g.box, '#574e52', 0, 0.85, 3.55, { s: [0.5, 0.32, 0.45] });
    for (const e of [-1, 1]) { k.add('prop', g.cone4, '#292225', e * 0.32, 0.2, 4.1, { s: [0.13, 0.7, 0.13], rz: -e * 0.55, rx: -0.35 }); k.add('glow', g.sphLo, '#ff8a1e', e * 0.22, 0.86, 3.86, { s: 0.09 }); }
  });
}

// =============== HIELO ===============
function hielo(T, k, r) {
  const g = G(k, T);
  const ICE = ['#7fc2ee', '#93cff3', '#6bb5e8', '#a6daf6'], ice = () => ICE[(r() * ICE.length) | 0];
  // placas de hielo en el campo — update 40: FUERA (campo liso). Se siguen consumiendo los mismos números aleatorios para que el decorado exterior quede idéntico a v39. (solo visuales: debajo de las líneas)
  for (const [x, y, R] of [[-10, 9.5, 3.0], [10.5, 11, 2.7], [-10.5, -9.5, 2.8], [10, -10.5, 3.1], [-15.5, 1, 1.5], [15.5, -1.5, 1.4]]) {
    const ry = r() * 6;
    nada('flat', blobGeo(T, R * 1.06, 18, 0.12, r), '#9cc8e8', x, y, 0.005, { ry });
    nada('flat', blobGeo(T, R, 18, 0.1, r), '#b5d9f1', x, y, 0.007, { ry });
    for (let q = 0; q < 4; q++) { let px = x + (r() - 0.5) * R, py = y + (r() - 0.5) * R, a = r() * 6; const pts = [[px, py]]; for (let s = 0; s < 3; s++) { a += (r() - 0.5) * 1.5; px += Math.cos(a) * R * 0.3; py += Math.sin(a) * R * 0.3; pts.push([px, py]); } if (pts.every((p) => Math.hypot(p[0] - x, p[1] - y) < R * 0.85)) nada('flat', ribbon(T, pts, 0.07, 0.009), '#e8f6ff', 0, 0, 0); }
  }
  // bloques de hielo sobre las vallas (bandas y fondo rival)
  const blk = (x, y, along) => { const hh = 0.75 + r() * 0.6, L = 1.35 + r() * 0.35; k.add('prop', g.box, ice(), x, y, 0.95, { s: along ? [0.95, hh, L] : [L, hh, 0.95], ry: (r() - 0.5) * 0.1 }); k.add('prop', g.box, '#f6fbff', x, y, 0.95 + hh, { s: along ? [1.02, 0.14, L * 0.9] : [L * 0.9, 0.14, 1.02] }); };
  for (const s of [-1, 1]) for (let y = -27.5; y <= 27.5; y += 1.85) blk(s * WALL_X, y, true);
  for (let x = -20.5; x <= 20.6; x += 1.85) blk(x, WALL_Y, false);
  // porterías: nieve encima y cristales fuera de los postes
  for (const gy of [-24, 24]) {
    k.add('prop', g.box, '#ffffff', 0, gy, 4.22, { s: [10.9, 0.26, 0.5] });
    for (const s of [-1, 1]) { k.add('prop', g.sph, '#ffffff', s * 5.28, gy, 4.3, { s: [0.42, 0.26, 0.42] }); for (const hh of [1.4, 2.9]) k.add('prop', g.torus, '#bfe8ff', s * 5.28, gy, hh, { s: [0.34, 0.5, 0.34] }); }   // escarcha en los postes (nada en el suelo del campo)
  }
  // gradas de glaciar con muñecos de nieve
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x0 = 27 + i * 3.3, hh = 0.9 + i * 1.3;
    const segs = [];
    for (let y = -36; y < 42; y += 6) { const dh = (r() - 0.5) * 0.35, L = 6 - 0.2; segs.push([y + 3, hh + dh + 0.22]); k.add('prop', g.box, ice(), s * (x0 + 1.65), y + 3, 0, { s: [3.3, hh + dh, L] }); k.add('prop', g.box, r() < 0.6 ? '#eef6fd' : '#dcecf9', s * (x0 + 1.65 + 0.35), y + 3, hh + dh, { s: [2.7, 0.22, L - 0.3] }); if (r() < 0.22) cristales(T, k, g, s * (x0 + 2.4), y + 1 + r() * 4, 3, 1.3 + r() * 1.4, r); }
    for (let n = 0; n < 4; n++) { const sg = segs[1 + ((r() * (segs.length - 2)) | 0)], y = sg[0] + (r() - 0.5) * 4, sc = 0.95 + r() * 0.45; munyeco(T, k, g, s * (x0 + 1.5 + (r() - 0.5) * 0.8), y, sg[1] - 0.02, faceTo(s * x0, y, 0, y + (r() - 0.5) * 20), sc, r); }   // apoyado sobre su bloque (nada flotando)
  }
  // pinos nevados detrás de las gradas y al fondo
  const pino = (x, y, h) => { k.add('prop', g.cyl6, '#5a3d2a', x, y, 0, { s: [0.35, h * 0.22, 0.35] }); for (let t = 0; t < 3; t++) { const w = h * (0.34 - t * 0.08), y0 = h * (0.16 + t * 0.22); k.add('prop', g.cone7, '#2c5e4c', x, y, y0, { s: [w, h * 0.36, w], ry: t }); k.add('prop', g.cone7, '#f3f8ff', x, y, y0 + h * 0.17, { s: [w * 0.72, h * 0.2, w * 0.72], ry: t + 0.3 }); } };
  for (const s of [-1, 1]) for (let n = 0; n < 22; n++) pino(s * (41.5 + r() * 24), -55 + r() * 115, 7 + r() * 8);
  for (let n = 0; n < 14; n++) pino(-45 + r() * 90, 44 + r() * 30, 8 + r() * 8);
  // cristales en las esquinas y castillo de hielo al fondo
  for (const [x, y] of [[-25, 31.5], [25, 31.5], [-25.5, -31], [25.5, -31]]) cristales(T, k, g, x, y, y < 0 ? 4 : 6, y < 0 ? 1.4 : 3.5, r);
  for (let n = 0; n < 12; n++) cristales(T, k, g, -24 + r() * 48, 32.5 + r() * 5, 3, 2 + r() * 3.5, r);
  for (let n = 0; n < 18; n++) { const x = (r() - 0.5) * 30, y = 52 + r() * 14, h = 8 + r() * 20, w = 1.2 + r() * 1.6; k.add('prop', g.crys, r() < 0.5 ? '#86d2ff' : '#bdeaff', x, y, 0, { s: [w, h, w], ry: r() * 6, rx: (r() - 0.5) * 0.2 }); }
  // montículos de nieve
  for (let n = 0; n < 40; n++) { const s = r() < 0.5 ? -1 : 1, x = s * (24 + r() * 40), y = -50 + r() * 110, R = 1 + r() * 2.5; if (Math.abs(x) < 26 && y > -31 && y < 31) continue; k.add('prop', g.sphLo, '#f6fbff', x, y, -R * 0.25, { s: [R, R * 0.45, R * 1.2], ry: r() * 6 }); }
}
function cristales(T, k, g, x, y, n, h, r) {
  for (let i = 0; i < n; i++) { const a = r() * 6, d = i ? 0.3 + r() * 0.7 : 0, hh = h * (i ? 0.45 + r() * 0.5 : 1), w = hh * (0.16 + r() * 0.06); k.add('prop', g.crys, r() < 0.5 ? '#7ccdfb' : '#b8e9ff', x + Math.cos(a) * d, y + Math.sin(a) * d, -0.05, { s: [w, hh, w], ry: r() * 6, rx: (r() - 0.5) * 0.55, rz: (r() - 0.5) * 0.55 }); }
}
function munyeco(T, k, g, x, y, h, ry, s, r) {
  const BUF = ['#e8343a', '#2f6fe0', '#33b35a', '#ffb21e'][(r() * 4) | 0];
  k.at(x, y, h, ry, s, () => {
    k.add('prop', g.sph, '#ffffff', 0, 0, 0.5, { s: 0.55 });
    k.add('prop', g.sph, '#ffffff', 0, 0, 1.25, { s: 0.42 });
    k.add('prop', g.sph, '#ffffff', 0, 0, 1.85, { s: 0.3 });
    k.add('prop', g.torus, BUF, 0, 0, 1.58, { s: [0.32, 0.4, 0.32] });
    k.add('prop', g.cone5, '#ff8a1e', 0, 0.27, 1.86, { s: [0.06, 0.32, 0.06], rx: Math.PI / 2 });
    for (const e of [-1, 1]) { k.add('prop', g.sphLo, '#14161c', e * 0.1, 0.25, 1.95, { s: 0.045 }); k.add('prop', g.cyl6, '#5a3d2a', e * 0.38, 0, 1.3, { s: [0.035, 0.55, 0.035], rz: -e * 1.0 }); }
    if (r() < 0.5) { k.add('prop', g.cyl8, '#1d2030', 0, 0, 2.08, { s: [0.3, 0.05, 0.3] }); k.add('prop', g.cyl8, '#1d2030', 0, 0, 2.1, { s: [0.2, 0.3, 0.2] }); }
  });
}

// =============== BOSQUE DE SETAS ===============
function setas(T, k, r) {
  const g = G(k, T);
  const CAPS = ['#e2382d', '#2f7fe6', '#8b52dc', '#f2892b', '#e2382d', '#2f7fe6'];
  // musgo: manchas más claras/oscuras en el campo — update 40: FUERA (campo liso). Se siguen consumiendo los mismos números aleatorios para que el decorado exterior quede idéntico a v39.
  for (let n = 0; n < 40; n++) { const x = -20 + r() * 40, y = -27 + r() * 54; nada('flat', blobGeo(T, 0.8 + r() * 1.4, 12, 0.25, r), r() < 0.5 ? '#4a872b' : '#539335', x, y, 0.005, { ry: r() * 6 }); }
  // troncos con musgo sobre las vallas (bandas y fondo rival)
  const logC = '#6b4528', moss = ['#5f9a35', '#6fae3d', '#4f8a2b'];
  for (const s of [-1, 1]) {
    k.add('prop', k.geo('logY', () => new T.CylinderGeometry(0.42, 0.42, 1, 8).rotateX(Math.PI / 2)), logC, s * WALL_X, 0, 1.32, { s: [1, 1, 57], ry: 0 });
    for (let y = -27; y <= 27; y += 6.8) { k.add('prop', g.cyl8, '#5a3920', s * WALL_X, y, 0, { s: [0.55, 1.85, 0.55] }); k.add('prop', g.cyl8, '#c9a77a', s * WALL_X, y, 1.85, { s: [0.5, 0.02, 0.5] }); }
    for (let y = -27; y <= 27; y += 1.6 + r() * 1.6) k.add('prop', g.sphLo, moss[(r() * 3) | 0], s * WALL_X, y, 1.66, { s: [0.5 + r() * 0.2, 0.22, 0.7 + r() * 0.8], ry: r() * 0.4 });
  }
  k.add('prop', k.geo('logX', () => new T.CylinderGeometry(0.42, 0.42, 1, 8).rotateZ(Math.PI / 2)), logC, 0, WALL_Y, 1.32, { s: [43, 1, 1] });
  for (let x = -20.4; x <= 20.6; x += 6.8) k.add('prop', g.cyl8, '#5a3920', x, WALL_Y, 0, { s: [0.55, 1.85, 0.55] });
  for (let x = -21; x <= 21; x += 1.6 + r() * 1.6) k.add('prop', g.sphLo, moss[(r() * 3) | 0], x, WALL_Y, 1.66, { s: [0.7 + r() * 0.8, 0.22, 0.5 + r() * 0.2] });
  // porterías de madera: musgo encima, setitas en las esquinas y hiedra enrollada en los postes
  for (const gy of [-24, 24]) {
    k.add('prop', g.box, '#5f9a35', 0, gy, 4.18, { s: [10.4, 0.2, 0.55] });
    for (const s of [-1, 1]) {
      seta(T, k, g, s * 5.15, gy, 4.25, 0.42, '#e2382d', r, true);
      for (const hh of [0.7, 1.9, 3.1]) k.add('prop', g.torus, moss[(r() * 3) | 0], s * 5.28, gy, hh, { s: [0.36, 0.7, 0.36], ry: r() });   // hiedra/musgo enrollado en los postes (nada en el suelo del campo)
    }
  }
  // setas gigantes: cerca de la valla pequeñas, más lejos enormes
  for (const s of [-1, 1]) {
    for (let n = 0; n < 16; n++) { const x = s * (25 + r() * 6), y = -38 + r() * 76; seta(T, k, g, x, y, 0, 0.9 + r() * 1.4, CAPS[(r() * CAPS.length) | 0], r); }
    for (let n = 0; n < 12; n++) { const x = s * (33 + r() * 10), y = -45 + r() * 90; seta(T, k, g, x, y, 0, 2.8 + r() * 2.8, CAPS[(r() * CAPS.length) | 0], r); }
    for (let n = 0; n < 10; n++) { const x = s * (46 + r() * 20), y = -55 + r() * 115; seta(T, k, g, x, y, 0, 5 + r() * 4, CAPS[(r() * CAPS.length) | 0], r); }
    // árboles enormes del bosque (troncos)
    for (let n = 0; n < 8; n++) { const x = s * (55 + r() * 18), y = -50 + r() * 120, R = 2.2 + r() * 1.6; k.add('prop', g.cyl8, '#4a2f1f', x, y, 0, { s: [R, 40, R * 1.05], ry: r() }); for (let q = 0; q < 4; q++) { const a = q * 1.57 + r() * 0.5; k.add('prop', g.cone4, '#3f281a', x + Math.cos(a) * R, y + Math.sin(a) * R, 0, { s: [R * 0.5, R * 1.6, R * 0.5], rz: -Math.cos(a) * 0.5, rx: Math.sin(a) * 0.5 }); } }
  }
  for (let n = 0; n < 12; n++) { const x = -27 + r() * 54, y = 31.5 + r() * 6; seta(T, k, g, x, y, 0, 1 + r() * 1.8, CAPS[(r() * CAPS.length) | 0], r); }
  for (let n = 0; n < 8; n++) { const x = -30 + r() * 60, y = 40 + r() * 10; seta(T, k, g, x, y, 0, 3 + r() * 3, CAPS[(r() * CAPS.length) | 0], r); }
  for (let n = 0; n < 6; n++) { const x = -40 + r() * 80, y = 55 + r() * 20, R = 2.5 + r() * 1.5; k.add('prop', g.cyl8, '#4a2f1f', x, y, 0, { s: [R, 40, R] }); }
  // helechos, matas, rocas con musgo, flores y setitas que brillan
  const zona = () => { const s = r() < 0.5 ? -1 : 1; return r() < 0.8 ? [s * (23.6 + r() * 22), -40 + r() * 80] : [-26 + r() * 52, 30.8 + r() * 10]; };
  for (let n = 0; n < 70; n++) { const [x, y] = zona(), R = 0.4 + r() * 0.9; k.add('prop', g.ico, r() < 0.5 ? '#2f6a2a' : '#3d8a32', x, y, R * 0.25, { s: [R, R * 0.6, R], ry: r() * 6 }); }
  for (let n = 0; n < 40; n++) { const [x, y] = zona(); for (let q = 0; q < 5; q++) k.add('prop', g.cone3, '#3f8f35', x, y, 0, { s: [0.12, 0.9 + r() * 0.5, 0.05], ry: q * 1.25, rx: 0.6 }); }
  for (let n = 0; n < 18; n++) { const [x, y] = zona(), R = 0.6 + r() * 0.9; k.add('prop', g.dode, '#6b6f78', x, y, R * 0.3, { s: [R, R * 0.7, R], ry: r() * 6 }); k.add('prop', g.sphLo, '#5f9a35', x, y, R * 0.75, { s: [R * 0.8, R * 0.25, R * 0.8] }); }
  for (let n = 0; n < 60; n++) { const [x, y] = zona(); k.add('prop', g.cyl6, '#3d7f30', x, y, 0, { s: [0.03, 0.35, 0.03] }); k.add('prop', g.ico, ['#b36bff', '#6fa8ff', '#ff7ac8', '#ffe066'][(r() * 4) | 0], x, y, 0.38, { s: 0.14 }); }
  for (let n = 0; n < 34; n++) { const [x, y] = zona(); for (let q = 0; q < 3; q++) { const dx = (r() - 0.5) * 0.8, dy = (r() - 0.5) * 0.8, hh = 0.18 + r() * 0.25; k.add('prop', g.cyl6, '#e9e0c8', x + dx, y + dy, 0, { s: [0.035, hh, 0.035] }); k.add('glow', g.cap, r() < 0.5 ? '#72f2ff' : '#ff8ad8', x + dx, y + dy, hh, { s: [0.12, 0.08, 0.12] }); } }
}
function seta(T, k, g, x, y, h, R, cap, r, mini) {
  const H = R * (mini ? 1.4 : (R > 4 ? 0.85 + r() * 0.35 : 1.1 + r() * 0.5)), lean = mini ? 0 : (r() - 0.5) * 0.18;
  k.at(x, y, h, r() * 6, 1, () => {
    k.add('prop', g.stem, '#efe2c4', 0, 0, 0, { s: [R * 0.26, H, R * 0.26], rz: lean, c2: '#f7efdc' });
    k.add('prop', g.gill, '#d6c39c', Math.sin(-lean) * H * 0, 0, H * 0.98, { s: [R, 1, R] });
    k.add('prop', g.cap, cap, 0, 0, H * 0.98, { s: [R, R * 0.62, R] });
    const nd = mini ? 3 : 5 + ((r() * 4) | 0);
    for (let i = 0; i < nd; i++) { const ph = 0.35 + r() * 0.85, th = r() * 6.283, dx = Math.sin(ph) * Math.cos(th), dz = Math.sin(ph) * Math.sin(th), dy = Math.cos(ph); k.add('prop', g.sphLo, '#ffffff', dx * R * 1.0, dz * R * 1.0, H * 0.98 + dy * R * 0.62, { s: [R * 0.13, R * 0.07, R * 0.13] }); }
  });
}

// ---------- montaje ----------
export function buildDeco(T, key, o = {}) {
  const tema = TEMAS[key]; if (!tema || key === 'dbg') return null;
  const k = new Kit(T), r = rng({ volcan: 11, hielo: 23, setas: 37 }[key] || 1);
  if (key === 'volcan') volcan(T, k, r); else if (key === 'hielo') hielo(T, k, r); else if (key === 'setas') setas(T, k, r);
  const group = new T.Group(); group.name = 'Decorado_' + key; const upd = [];
  const pg = k.build('prop');
  if (pg) {
    const m = new T.Mesh(pg, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }));
    m.name = 'Deco_Props'; m.userData.deco = true; group.add(m);
    if (o.outlineMat && o.ensureSmoothN) { o.ensureSmoothN(pg); const ol = new T.Mesh(pg, o.outlineMat); ol.name = 'Deco_Contorno'; ol.userData.outline = true; group.add(ol); }
  }
  const fg = k.build('flat');
  if (fg) { const m = new T.Mesh(fg, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); m.name = 'Deco_Suelo'; m.userData.deco = true; m.receiveShadow = true; group.add(m); }
  // brillos (lava, ojos, setitas): sin luz. La lava lleva degradado borde rojo -> centro amarillo
  for (const p of k.L.glow) if (p.edge) { p.c2 = null; }
  const gg = k.build('glow');
  if (gg) {
    // degradado de lava por vértice (cintas con borde)
    let vo = 0; const C = gg.attributes.color, edge = new T.Color('#e8480c');
    for (const p of k.L.glow) { const n = p.geo.attributes.position.count; if (p.edge) for (let i = 0; i < n; i++) if (p.edge[i]) C.setXYZ(vo + i, edge.r, edge.g, edge.b); vo += n; }
    const mat = new T.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new T.Mesh(gg, mat); m.name = 'Deco_Brillo'; m.userData.deco = true; group.add(m);
    if (key === 'volcan') { let t = 0; upd.push((dt) => { t += dt; const b = 0.9 + 0.1 * Math.sin(t * 2.2); mat.color.setRGB(b, b, b); }); }
  }
  if (tema.sky) group.add(skyDome(T, tema.sky));
  {
    const pk = { volcan: ['brasas', 110, '#ff8a2a', 0.32], hielo: ['nieve', 170, '#ffffff', 0.26], setas: ['luciernagas', 90, '#fff27a', 0.36] }[key];
    if (pk) { const pts = particles(T, pk[0], pk[1], pk[2], pk[3], r); pts.visible = !o.baja; group.add(pts); upd.push((dt, cam) => { if (pts.visible) pts.userData.update(dt, cam); }); }
  }
  for (const m of group.children) if (m.isMesh) { m.castShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); }
  return { group, key, update: (dt, cam) => { for (const f of upd) f(dt, cam); }, stats: { props: pg ? pg.attributes.position.count : 0, flat: fg ? fg.attributes.position.count : 0, glow: gg ? gg.attributes.position.count : 0 } };
}
