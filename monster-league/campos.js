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
    this.T = T; this.L = { prop: [], flat: [], glow: [], liso: [] }; this.stack = [new T.Matrix4()];
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
  build(kind, filt) {
    const T = this.T, L = filt ? this.L[kind].filter(filt) : this.L[kind]; if (!L.length) return null;
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
  volcanExt(T, k, r);   // update 44: exterior nuevo (estatuas modeladas, rocas biseladas, agujas)
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
  hieloExt(T, k, r);   // update 44: exterior nuevo (gradas redondeadas, cristales facetados, pinos festoneados, muñecos detallados)
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
  setasExt(T, k, r);   // update 44: exterior nuevo (setas-árbol, troncos con raíces, matas, helechos)
}
// seta clásica: solo para las setitas de las porterías (borde del campo, sin cambios)
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

// =============== update 44: DECORADO EXTERIOR PULIDO (capa 'liso') ===============
// Geometría soldada con normales suaves (rocas biseladas, estatuas modeladas, setas-árbol, pinos, muñecos...) en una sola
// malla con sombreado toon de 3 tonos + contorno (como los personajes). Detalle según distancia a la cámara de juego y calidad Baja.
function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf), L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.6 + vnoise(x * 2.1 + 7, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3 + 3, z * 4.3) * 0.1;
// suelda vértices por posición (indexada) y recalcula normales suaves; quita triángulos degenerados
function soldar(T, g, tol = 1e4) {
  const P = g.attributes.position, map = new Map(), pos = [], vid = new Int32Array(P.count), src = g.index ? g.index.array : null, n = src ? src.length : P.count;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), key = Math.round(x * tol) + ',' + Math.round(y * tol) + ',' + Math.round(z * tol); let id = map.get(key); if (id === undefined) { id = pos.length / 3; map.set(key, id); pos.push(x, y, z); } vid[i] = id; }
  const I = []; for (let j = 0; j + 2 < n; j += 3) { const a = vid[src ? src[j] : j], b = vid[src ? src[j + 1] : j + 1], c = vid[src ? src[j + 2] : j + 2]; if (a !== b && b !== c && a !== c) I.push(a, b, c); }
  const o = new T.BufferGeometry(); o.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); o.setIndex(I); o.computeVertexNormals(); return o;
}
// deforma (fn(v) recibe Vector3 en coords three: y = arriba) y recalcula normales
function deformar(T, g, fn) { const P = g.attributes.position, v = new T.Vector3(); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); fn(v, i); P.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); g.computeBoundingBox(); return g; }
function facetas(T, g) { const o = g.index ? g.toNonIndexed() : g; o.deleteAttribute && o.deleteAttribute('uv'); o.computeVertexNormals(); return o; }
function unir(T, gs) {
  let nv = 0, ni = 0; for (const g of gs) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), I = new Uint32Array(ni); let vo = 0, io = 0;
  for (const g of gs) { P.set(g.attributes.position.array, vo * 3); N.set(g.attributes.normal.array, vo * 3); if (g.index) for (let i = 0; i < g.index.count; i++) I[io++] = g.index.getX(i) + vo; else for (let i = 0; i < g.attributes.position.count; i++) I[io++] = i + vo; vo += g.attributes.position.count; }
  const o = new T.BufferGeometry(); o.setAttribute('position', new T.BufferAttribute(P, 3)); o.setAttribute('normal', new T.BufferAttribute(N, 3)); o.setIndex(new T.BufferAttribute(I, 1)); return o;
}
function espejoX(T, g) { const o = g.clone(), P = o.attributes.position; for (let i = 0; i < P.count; i++) P.setX(i, -P.getX(i)); const I = o.index.array; for (let j = 0; j < I.length; j += 3) { const t = I[j + 1]; I[j + 1] = I[j + 2]; I[j + 2] = t; } o.computeVertexNormals(); return o; }
const torno = (T, pts, seg) => soldar(T, new T.LatheGeometry(pts.map((p) => new T.Vector2(p[0], p[1])), seg));
const bola = (T, w, h) => soldar(T, new T.SphereGeometry(1, w, h));
// tubo con radio variable por una curva (puntos en coords de JUEGO: x, y adelante, h arriba)
function tubo(T, pts, r0, r1, rad = 8, seg = 10, rf) {
  const c = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(p[0], p[2], -p[1]))), fr = c.computeFrenetFrames(seg, false), P = [], I = [];
  for (let i = 0; i <= seg; i++) { const t = i / seg, p = c.getPointAt(t), N = fr.normals[i], B = fr.binormals[i], R = rf ? rf(t) : r0 + (r1 - r0) * t; for (let j = 0; j < rad; j++) { const a = (j / rad) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a); P.push(p.x + R * (cs * N.x + sn * B.x), p.y + R * (cs * N.y + sn * B.y), p.z + R * (cs * N.z + sn * B.z)); } }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) { const a = i * rad + j, b = i * rad + ((j + 1) % rad), cc = (i + 1) * rad + j, d = (i + 1) * rad + ((j + 1) % rad); I.push(a, b, cc, b, d, cc); }
  // tapa de la base (punto central)
  const p0 = c.getPointAt(0), ci = P.length / 3; P.push(p0.x, p0.y, p0.z); for (let j = 0; j < rad; j++) I.push(ci, (j + 1) % rad, j);
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}
// caja redondeada (unidad, base en y=0)
function cajaR(T, rr, s = 3) {
  const g = new T.BoxGeometry(1, 1, 1, s, s, s), P = g.attributes.position, v = new T.Vector3(), q = new T.Vector3(), h = 0.5 - rr;
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); q.set(Math.max(-h, Math.min(h, v.x)), Math.max(-h, Math.min(h, v.y)), Math.max(-h, Math.min(h, v.z))); const d = v.clone().sub(q); if (d.lengthSq() > 1e-9) v.copy(q.add(d.normalize().multiplyScalar(rr))); P.setXYZ(i, v.x, v.y + 0.5, v.z); }
  return soldar(T, g);
}
// roca biselada: icosaedro subdividido + ruido + cortes planos (caras amplias con aristas redondeadas) + base plana
function rocaG(T, seed, det) {
  const g = soldar(T, new T.IcosahedronGeometry(1, det)), rr = rng(seed), cuts = [];
  for (let i = 0; i < 5; i++) { const a = rr() * 6.283, e = (rr() - 0.25) * 1.3; cuts.push([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), 0.5 + rr() * 0.28]); }
  const o = rr() * 50;
  return deformar(T, g, (v) => {
    const s = 1 + 0.17 * fbm(v.x * 1.5 + o, v.y * 1.5, v.z * 1.5); v.multiplyScalar(s);
    for (const c of cuts) { const d = v.x * c[0] + v.y * c[1] + v.z * c[2]; if (d > c[3]) { const k = (d - c[3]) * 0.82; v.x -= c[0] * k; v.y -= c[1] * k; v.z -= c[2] * k; } }
    if (v.y < -0.42) v.y = -0.42 + (v.y + 0.42) * 0.15;
  });
}
// aguja de roca volcánica (torno con ruido y punta curvada)
function agujaG(T, seed, det) {
  const rows = det ? 10 : 6, pts = []; for (let i = 0; i <= rows; i++) { const t = i / rows; pts.push([Math.max(0.02, Math.pow(1 - t, 0.85) * (1 + 0.1 * Math.sin(t * 8 + seed))), t]); } pts.push([0, 1.02]);
  const g = torno(T, pts, det ? 9 : 7), o = seed * 3.1;
  return deformar(T, g, (v) => { const a = Math.atan2(v.z, v.x), t = v.y, k = 1 + 0.22 * fbm(Math.cos(a) * 1.3 + o, t * 4, Math.sin(a) * 1.3); v.x *= k; v.z *= k; v.x += 0.35 * t * t; });
}
// ala de gárgola (murciélago): perfil festoneado extruido con bisel + varillas
function alaG(T) {
  const s = new T.Shape(); s.moveTo(0, -0.05); s.lineTo(0, 0.5); s.quadraticCurveTo(0.55, 1.15, 1.65, 1.45); s.lineTo(1.72, 1.32);
  s.quadraticCurveTo(1.38, 1.0, 1.4, 0.55); s.quadraticCurveTo(1.12, 0.48, 0.95, 0.12); s.quadraticCurveTo(0.62, 0.15, 0.4, -0.12); s.quadraticCurveTo(0.2, 0.02, 0, -0.05);
  const e = soldar(T, new T.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 1, curveSegments: 6 }).translate(0, 0, -0.025));
  deformar(T, e, (v) => { v.z += 0.18 * v.x * v.x * 0.4 - 0.05 * v.y; });
  const rib = (x, y) => tubo(T, [[0.02, 0.025, 0.48], [x * 0.5, -(0.18 * (x * 0.5) ** 2 * 0.4 - 0.05 * y * 0.5) + 0.0, y * 0.55 + 0.25], [x, -(0.18 * x * x * 0.4 - 0.05 * y), y]], 0.065, 0.02, 6, 8);
  return unir(T, [e, rib(1.66, 1.4), rib(1.4, 0.58), rib(0.96, 0.15), rib(0.42, -0.08)]);
}
// cono de seta (unidad: radio 1, alto 1; se escala [R, R·0.62, R] como antes): sombrero con borde enrollado
const SOMB = [[0, 0.13], [0.4, 0.09], [0.82, 0.03], [0.98, 0.0], [1.05, 0.06], [1.04, 0.17], [0.96, 0.38], [0.81, 0.62], [0.57, 0.85], [0.3, 0.97], [0, 1.0]];
function sombY(rho) { const top = SOMB.slice(5); for (let i = 0; i < top.length - 1; i++) { const [r0, y0] = top[i], [r1, y1] = top[i + 1]; if (rho <= r0 && rho >= r1) { const t = (r0 - rho) / ((r0 - r1) || 1); return [y0 + (y1 - y0) * t, (y1 - y0) / ((r1 - r0) || -1)]; } } return [1, 0]; }
function sombreroG(T, det, seed) { const g = torno(T, SOMB, det ? 20 : 12); return deformar(T, g, (v) => { const a = Math.atan2(v.z, v.x), rr = Math.hypot(v.x, v.z); if (rr > 0.9) v.y += 0.035 * Math.sin(a * 5 + seed); const k = 1 + 0.025 * Math.sin(a * 3 + seed * 2); v.x *= k; v.z *= k; }); }
function laminasG(T, det) { const n = det ? 32 : 16, g = torno(T, [[0.17, 0.12], [0.5, 0.07], [0.97, 0.012]], n); return deformar(T, g, (v) => { const a = Math.atan2(v.z, v.x), rr = Math.hypot(v.x, v.z); v.y -= 0.03 * Math.abs(Math.sin(a * n / 4)) * Math.min(1, (rr - 0.17) * 3); }); }
// pie de seta: base ensanchada (bulbo), cintura, falda (anillo)
const PIE = [[0, 0], [1.3, 0], [1.22, 0.05], [1.02, 0.14], [0.86, 0.32], [0.8, 0.6], [0.8, 0.86], [0.92, 0.98], [0.55, 1.0], [0, 1.0]];
function pieG(T, det, seed) { const g = torno(T, PIE, det ? 12 : 8); return deformar(T, g, (v) => { const a = Math.atan2(v.z, v.x), k = 1 + 0.06 * Math.sin(a * 4 + seed) * (1 - v.y) + 0.03 * Math.sin(v.y * 14 + a * 2); v.x *= k; v.z *= k; }); }
function faldaG(T, det) { return torno(T, [[0.78, 0.8], [0.78, 0.74], [0.98, 0.69], [1.2, 0.61], [1.22, 0.64], [1.02, 0.74], [0.78, 0.8]], det ? 12 : 8); }
// tronco gigante con raíces de contrafuerte y corteza
function troncoG(T, det, seed) {
  const ys = [0, 0.006, 0.014, 0.026, 0.042, 0.065, 0.1, 0.2, 0.4, 0.7, 1], rs = [1.9, 1.62, 1.38, 1.2, 1.08, 1.02, 1, 0.97, 0.93, 0.88, 0.84];
  const g = torno(T, ys.map((y, i) => [rs[i], y]).concat([[0, 1]]), det ? 28 : 14);
  return deformar(T, g, (v) => { const a = Math.atan2(v.z, v.x), y = v.y, bf = Math.max(0, 1 - y / 0.07), c = Math.max(0, Math.cos(a * 5 + seed)); const k = 1 + bf * c * c * c * 0.95 + 0.045 * Math.sin(a * 11 + y * 40 + seed) * (y < 0.999 ? 1 : 0); v.x *= k; v.z *= k; });
}
// pino nevado: troncos/escalones de ramas festoneados + nieve encima (dos geometrías, mismo origen; alto 1)
function pinoG(T, det, seed) {
  const seg = det ? 14 : 9, verde = [], nieve = [];
  for (let t = 0; t < 4; t++) {
    const R = 0.36 - t * 0.075, yb = 0.16 + t * 0.19, hT = 0.34 - t * 0.04;
    const fest = (v, amp) => { const a = Math.atan2(v.z, v.x), rr = Math.hypot(v.x, v.z); if (rr > R * 0.55) { const c = Math.cos(a * 9 + t + seed); const k = 1 + amp * c; v.x *= k; v.z *= k; v.y -= (rr / R) * 0.03 * (1 - c); } };
    verde.push(deformar(T, torno(T, [[0, yb + 0.12 * hT], [R * 0.96, yb - 0.02], [R, yb + 0.02], [R * 0.56, yb + 0.45 * hT], [R * 0.2, yb + 0.86 * hT], [0, yb + hT]], seg), (v) => fest(v, 0.09)));
    nieve.push(deformar(T, torno(T, [[0, yb + 0.25 * hT], [R * 0.86, yb + 0.07 * hT + 0.02], [R * 0.9, yb + 0.12 * hT + 0.025], [R * 0.55, yb + 0.5 * hT + 0.02], [R * 0.2, yb + 0.88 * hT + 0.015], [0, yb + hT + 0.02]], seg), (v) => fest(v, 0.12)));
  }
  const tronco = torno(T, [[0, 0], [0.05, 0], [0.04, 0.25], [0, 0.26]], det ? 8 : 6);
  return { verde: unir(T, verde), nieve: unir(T, nieve), tronco };
}
// cristal de hielo: prisma hexagonal biselado con punta (facetado nítido)
function cristalG(T) { return facetas(T, new T.LatheGeometry([[0, 0], [0.86, 0], [1, 0.05], [1, 0.66], [0.9, 0.73], [0.12, 0.98], [0, 1]].map((p) => new T.Vector2(p[0], p[1])), 6)); }
// mata (arbusto): bola con bultos
function mataG(T, seed) { const g = soldar(T, new T.IcosahedronGeometry(1, 2)); return deformar(T, g, (v) => { const k = 1 + 0.2 * fbm(v.x * 2.2 + seed, v.y * 2.2, v.z * 2.2); v.multiplyScalar(k); if (v.y < -0.3) v.y = -0.3; }); }

function LIB(k, T) {
  const c = (key, f) => k.geo(key, f);
  return {
    roca: (i, d) => c('roca' + i + d, () => rocaG(T, 101 + i * 37, d)),   // det 1 (42 v) cerca; 0 (12 v, se suaviza con normales) lejos
    aguja: (i, d) => c('aguja' + i + d, () => agujaG(T, 1 + i * 1.7, d)),
    bola: (d) => c('bola' + d, () => bola(T, d ? 14 : 10, d ? 10 : 7)),
    bolaLo: () => c('bolaLo', () => bola(T, 8, 6)),
    caja: () => c('cajaR', () => cajaR(T, 0.1, 3)),
    cajaB: () => c('cajaRb', () => cajaR(T, 0.22, 3)),
    ala: (e) => c('ala' + e, () => (e > 0 ? alaG(T) : espejoX(T, alaG(T)))),
    sombrero: (d, i) => c('somb' + d + i, () => sombreroG(T, d, i)),
    laminas: (d) => c('lam' + d, () => laminasG(T, d)),
    pie: (d, i) => c('pie' + d + i, () => pieG(T, d, i)),
    falda: (d) => c('falda' + d, () => faldaG(T, d)),
    tronco: (d, i) => c('tronco' + d + i, () => troncoG(T, d, i * 1.3)),
    pino: (d, i) => c('pino' + d + i, () => pinoG(T, d, i * 0.7)),
    cristal: () => c('cristalF', () => cristalG(T)),
    mata: (i) => c('mata' + i, () => mataG(T, i * 5.3)),
    cono: (d) => c('conoS' + d, () => torno(T, [[0, 0], [1, 0], [0.62, 0.45], [0.25, 0.85], [0, 1]], d ? 10 : 6)),
    cil: (d) => c('cilS' + d, () => torno(T, [[0, 0], [1, 0], [1, 1], [0, 1]], d ? 12 : 7)),
  };
}
// detalle: 1 = cerca de la cámara de juego, 0 = lejos o calidad Baja
const detalle = (k, x, y, sz = 1) => (k.baja || Math.abs(x) > 38 || y > 44 || y < -46 || sz < 0.6 ? 0 : 1);
// gárgola modelada (mismo concepto: pedestal + gárgola agazapada con alas, cuernos y ojos de brasa). Mira a +y local.
function gargolaN(T, k, L, x, y, ry, s) {
  const d = detalle(k, x, y), B = L.bola(d), Bl = L.bolaLo(), C = L.caja(), P0 = '#2e272a', ST = '#4a4246', ST2 = '#6d6468', h0 = 1.83;
  const g = (key, f) => k.geo('garg_' + key + d, f);
  k.at(x, y, 0, ry, s, () => {
    // pedestal con zócalo, fuste y cornisa (aristas redondeadas)
    k.add('liso', C, P0, 0, 0, 0, { s: [2.5, 0.32, 2.5], c2: '#3a3235' });
    k.add('liso', C, '#3a3235', 0, 0, 0.3, { s: [2.05, 1.12, 2.05], c2: '#463d41' });
    k.add('liso', L.cajaB(), '#4a4145', 0, 0, 1.4, { s: [2.6, 0.32, 2.6], c2: '#5a5054' });
    for (const [ex, ey] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add('liso', C, '#2a2427', ex * 0.95, ey * 0.95, 0.3, { s: [0.28, 1.12, 0.28] });
    // patas traseras (muslos) y garras
    for (const e of [-1, 1]) {
      k.add('liso', B, ST, e * 0.45, -0.2, h0 + 0.32, { s: [0.38, 0.34, 0.55], c2: ST2 });
      k.add('liso', B, ST, e * 0.5, 0.18, h0 + 0.1, { s: [0.2, 0.12, 0.3] });
      for (const q of [-1, 0, 1]) k.add('liso', g('garra', () => tubo(T, [[0, 0, 0.05], [0, 0.12, 0.04], [0, 0.2, -0.04]], 0.05, 0.008, 6, 5)), '#2a2326', e * 0.5 + q * 0.09, 0.36, h0, { ry: -q * 0.25 });
    }
    // torso inclinado hacia delante, pecho y cola
    k.add('liso', B, ST, 0, 0.02, h0 + 0.95, { s: [0.56, 0.78, 0.5], rx: -0.38, c2: ST2 });
    k.add('liso', B, '#564d51', 0, 0.3, h0 + 1.05, { s: [0.4, 0.5, 0.25], rx: -0.4 });
    k.add('liso', g('cola', () => tubo(T, [[0, -0.35, 0.35], [0, -0.85, 0.12], [0.55, -1.0, 0.05], [0.95, -0.6, 0.05], [1.0, -0.15, 0.1]], 0.12, 0.03, 7, 14)), ST, 0, 0, h0);
    k.add('liso', L.cono(d), '#2a2326', 1.0, -0.12, h0 + 0.1, { s: [0.13, 0.28, 0.06], rx: -1.45 });
    // brazos apoyados en las rodillas
    for (const e of [-1, 1]) {
      k.add('liso', g('brazo' + e, () => tubo(T, [[e * 0.5, 0.1, 1.42], [e * 0.66, 0.32, 0.95], [e * 0.42, 0.52, 0.5]], 0.17, 0.1, 8, 10)), ST, 0, 0, h0);
      k.add('liso', B, ST2, e * 0.42, 0.56, h0 + 0.45, { s: [0.15, 0.12, 0.18] });
      k.add('liso', B, ST, e * 0.62, 0.05, h0 + 1.45, { s: [0.24, 0.22, 0.24], c2: ST2 });   // hombros
    }
    // cabeza: cráneo, cejas, hocico con mandíbula y dientes, orejas, cuernos curvados
    const hz = h0 + 1.78;
    k.add('liso', B, ST, 0, 0.42, hz, { s: [0.36, 0.34, 0.36], c2: ST2 });
    k.add('liso', B, '#5d5458', 0, 0.68, hz + 0.06, { s: [0.32, 0.1, 0.12], rx: -0.2 });
    k.add('liso', B, ST, 0, 0.74, hz - 0.12, { s: [0.24, 0.17, 0.24], c2: ST2 });
    k.add('liso', B, '#3e3639', 0, 0.68, hz - 0.27, { s: [0.2, 0.08, 0.2] });
    if (d) for (const e of [-1, 1]) k.add('liso', L.cono(0), '#cfc6b8', e * 0.1, 0.88, hz - 0.29, { s: [0.035, 0.1, 0.035], rx: Math.PI });
    for (const e of [-1, 1]) {
      k.add('liso', g('oreja' + e, () => tubo(T, [[e * 0.28, 0.42, 0.08], [e * 0.48, 0.32, 0.18], [e * 0.6, 0.22, 0.2]], 0.07, 0.01, 6, 5)), ST, 0, 0, hz);
      k.add('liso', g('cuerno' + e, () => tubo(T, [[e * 0.16, 0.42, 0.24], [e * 0.36, 0.28, 0.48], [e * 0.44, 0.0, 0.66], [e * 0.38, -0.32, 0.72]], 0.09, 0.012, 7, 12)), '#2a2326', 0, 0, hz, { c2: '#4b4245' });
      k.add('glow', Bl, '#ff8a1e', e * 0.13, 0.75, hz + 0.0, { s: [0.075, 0.06, 0.05] });
    }
    // alas plegadas hacia atrás y arriba
    for (const e of [-1, 1]) k.add('liso', L.ala(e), '#3f373b', e * 0.36, -0.22, h0 + 1.38, { ry: -e * 0.25, rz: e * 0.42, c2: '#5a5155' });
  });
}

// =============== VOLCÁN: exterior ===============
function volcanExt(T, k, r) {
  const L = LIB(k, T), ROCK = ['#3b3337', '#443a3e', '#4d4245', '#55494c'], rock = () => ROCK[(r() * ROCK.length) | 0];
  const roca = (x, y, sz, sq = 0.7, base = -0.12) => { const d = detalle(k, x, y, sz), c = rock(); if (k.baja && sz < 0.9 && r() < 0.5) return; k.add('liso', L.roca((r() * 6) | 0, d), '#241e21', x, y, sz * sq * 0.42 + base * sz, { s: [sz, sz * sq, sz * (0.8 + r() * 0.4)], ry: r() * 6, c2: c }); };
  // ríos de lava a los lados y lago al fondo (mismas cintas), orillas de rocas biseladas
  const riv = (s) => { const pts = []; for (let y = -75; y <= 70; y += 3) pts.push([s * (34 + 3.2 * Math.sin(y / 9 + s)), y, 6 + 1.5 * Math.sin(y / 5)]); return pts; };
  for (const s of [-1, 1]) {
    const pts = riv(s); const rb = ribbon(T, pts, 6, 0.04);
    k.add('glow', rb, '#ffb12e', 0, 0, 0); k.L.glow[k.L.glow.length - 1].edge = rb.userData.edge;
    for (const p of pts) for (const e of [-1, 1]) if (r() < 0.7) roca(p[0] + e * (p[2] / 2 + 0.5 + r() * 0.8), p[1] + (r() - 0.5) * 2, 0.6 + r() * 1.3, 0.5 + r() * 0.35);
  }
  { const pts = []; for (let x = -38; x <= 38; x += 3) pts.push([x, 46 + 3 * Math.sin(x / 7), 9 + 2 * Math.sin(x / 4)]); const rb = ribbon(T, pts, 9, 0.04); k.add('glow', rb, '#ffb12e', 0, 0, 0); k.L.glow[k.L.glow.length - 1].edge = rb.userData.edge; }
  // banda entre la valla y el río: escombros, gárgolas y grietas
  for (const s of [-1, 1]) {
    for (let n = 0; n < 30; n++) roca(s * (24.4 + r() * 5.2), -40 + r() * 76, 0.35 + r() * 0.8, 0.55 + r() * 0.3);
    for (const y of [-14, 3, 20]) gargolaN(T, k, L, s * 28, y, faceTo(s * 28, y, 0, y), 1);
    for (let n = 0; n < 10; n++) { let x = s * (25 + r() * 4), y = -35 + r() * 68, a = r() * 6; const pts = [[x, y]]; for (let q = 0; q < 4; q++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * 1.4; y += Math.sin(a) * 1.4; pts.push([x, y]); } (pts.every((p) => Math.abs(p[0]) >= 23) ? k.add : nada).call(k, 'glow', ribbon(T, pts, 0.16, 0.02), '#e3540f', 0, 0, 0); }
  }
  // agujas de roca volcánica y peñascos más allá de los ríos
  const aguja = (x, y, h, rr) => { const d = detalle(k, x, y, rr); k.add('liso', L.aguja((r() * 4) | 0, d), '#221b1e', x, y, -0.3, { s: [rr, h, rr * (0.8 + r() * 0.4)], ry: r() * 6, c2: '#56474a' }); };
  for (const s of [-1, 1]) for (let n = 0; n < 30; n++) {
    const x = s * (41 + r() * 24), y = -60 + r() * 120, h = 6 + r() * 16, rr = 2 + r() * 3.5; aguja(x, y, h, rr);
    if (r() < 0.6) roca(x + (r() - 0.5) * 5, y + (r() - 0.5) * 5, 1.4 + r() * 2, 0.75);
  }
  // fondo rival: escombros, dos gárgolas grandes, agujas y el volcán
  for (let n = 0; n < 24; n++) roca(-26 + r() * 52, 31.2 + r() * 8.8, 0.5 + r() * 1.1, 0.6);
  for (const s of [-1, 1]) gargolaN(T, k, L, s * 13, 34, faceTo(s * 13, 34, 0, 0), 1.25);
  for (const s of [-1, 1]) for (let n = 0; n < 7; n++) aguja(s * (16 + r() * 18), 36 + r() * 6, 4 + r() * 7, 1.6 + r() * 2.2);
  {
    const ys = [0, 0.08, 0.2, 0.36, 0.55, 0.75, 0.9, 0.97, 1], pts = ys.map((t) => [7 + 27 * Math.pow(1 - t, 1.6), t * 30]); pts.push([6.4, 30.05], [0, 29.7]);
    const vg = k.geo('volc44', () => deformar(T, torno(T, pts, 30), (v) => { const a = Math.atan2(v.z, v.x), t = v.y / 30; if (t < 0.985) { const kk = 1 + 0.09 * fbm(Math.cos(a) * 2.5, t * 3, Math.sin(a) * 2.5) * (1 - t) + 0.05 * Math.sin(a * 9) * (1 - t); v.x *= kk; v.z *= kk; } }));
    k.add('liso', vg, '#201819', 0, 78, -0.5, { c2: '#55403d' });
  }
  k.add('glow', k.geo('crater', () => new T.CylinderGeometry(6.2, 6.6, 0.6, 11).translate(0, 0.3, 0)), '#ffb12e', 0, 78, 29.6);
}

// =============== HIELO: exterior ===============
function munyecoN(T, k, L, x, y, h, ry, s, r) {
  const d = detalle(k, x, y), B = L.bola(d), Bl = L.bolaLo(), BUF = ['#e8343a', '#2f6fe0', '#33b35a', '#ffb21e'][(r() * 4) | 0], NV = '#dfeaf7', NV2 = '#ffffff';
  const g = (key, f) => k.geo('mun_' + key + d, f), sombrero = r() < 0.5;
  k.at(x, y, h, ry, s, () => {
    k.add('liso', B, NV, 0, 0, 0.5, { s: [0.58, 0.52, 0.56], c2: NV2 });
    k.add('liso', B, NV, 0, 0, 1.24, { s: [0.43, 0.4, 0.42], c2: NV2 });
    k.add('liso', B, NV, 0, 0, 1.86, { s: [0.31, 0.3, 0.31], c2: NV2 });
    k.add('liso', g('bufanda', () => soldar(T, new T.TorusGeometry(0.33, 0.085, 8, d ? 22 : 12).rotateX(Math.PI / 2))), BUF, 0, 0, 1.58);
    k.add('liso', L.caja(), BUF, 0.14, 0.3, 1.18, { s: [0.13, 0.4, 0.06], rz: 0.15, rx: 0.2 });
    k.add('liso', g('zanah', () => tubo(T, [[0, 0, 0], [0, 0.18, -0.01], [0, 0.36, -0.05]], 0.055, 0.006, 7, 6)), '#ff8a1e', 0, 0.27, 1.88);
    for (const e of [-1, 1]) {
      k.add('liso', Bl, '#14161c', e * 0.11, 0.26, 1.98, { s: [0.045, 0.05, 0.03] });
      k.add('liso', g('brazo' + e, () => unir(T, [tubo(T, [[e * 0.36, 0, 1.38], [e * 0.62, 0.05, 1.55], [e * 0.86, 0.02, 1.85]], 0.035, 0.018, 5, 6), tubo(T, [[e * 0.7, 0.03, 1.65], [e * 0.78, 0.12, 1.66], [e * 0.86, 0.2, 1.62]], 0.02, 0.008, 5, 4)])), '#5a3d2a', 0, 0, 0);
    }
    if (d) for (let q = -2; q <= 2; q++) k.add('liso', Bl, '#14161c', q * 0.06, 0.29, 1.77 - 0.025 * (2 - Math.abs(q)), { s: 0.022 });
    for (const hb of [1.08, 1.27, 1.46]) k.add('liso', Bl, '#14161c', 0, Math.sqrt(Math.max(0, 0.42 * 0.42 - (hb - 1.24) ** 2)) * 0.96, hb, { s: [0.04, 0.04, 0.025] });
    if (sombrero) { k.add('liso', L.cil(d), '#1d2030', 0, 0, 2.08, { s: [0.3, 0.04, 0.3] }); k.add('liso', L.cil(d), '#1d2030', 0, 0, 2.1, { s: [0.2, 0.3, 0.2], c2: '#2a2f45' }); k.add('liso', L.cil(d), BUF, 0, 0, 2.13, { s: [0.205, 0.06, 0.205] }); }
    else { k.add('liso', L.cil(d), '#3f7fd6', 0, 0, 2.05, { s: [0.24, 0.2, 0.24], rz: 0.15, c2: '#6aa2ee' }); }
  });
}
function hieloExt(T, k, r) {
  const L = LIB(k, T), ICE = ['#7fc2ee', '#93cff3', '#6bb5e8', '#a6daf6'], ice = () => ICE[(r() * ICE.length) | 0];
  const cristales = (x, y, n, h) => { for (let i = 0; i < n; i++) { const a = r() * 6, dd = i ? 0.3 + r() * 0.7 : 0, hh = h * (i ? 0.45 + r() * 0.5 : 1), w = hh * (0.16 + r() * 0.06); k.add('liso', L.cristal(), r() < 0.5 ? '#3f97d8' : '#5fb3ea', x + Math.cos(a) * dd, y + Math.sin(a) * dd, -0.05, { s: [w, hh, w], ry: r() * 6, rx: (r() - 0.5) * 0.55, rz: (r() - 0.5) * 0.55, c2: '#e6f7ff' }); } };
  // gradas de glaciar (bloques redondeados) con nieve que cae por el borde y muñecos de nieve
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x0 = 27 + i * 3.3, hh = 0.9 + i * 1.3, segs = [];
    for (let y = -36; y < 42; y += 6) {
      const dh = (r() - 0.5) * 0.35, Lg = 6 - 0.2; segs.push([y + 3, hh + dh + 0.24]);
      k.add('liso', L.cajaB(), lerpC(T, ice(), '#4f8fc4', 0.35), s * (x0 + 1.65), y + 3, 0, { s: [3.3, hh + dh, Lg], c2: ice() });
      k.add('liso', L.cajaB(), r() < 0.6 ? '#e4eef9' : '#d2e4f5', s * (x0 + 1.65 + 0.3), y + 3, hh + dh - 0.06, { s: [2.85, 0.3, Lg - 0.2], c2: '#ffffff' });
      if (r() < 0.22) cristales(s * (x0 + 2.4), y + 1 + r() * 4, 3, 1.3 + r() * 1.4);
    }
    for (let n = 0; n < 4; n++) { const sg = segs[1 + ((r() * (segs.length - 2)) | 0)], y = sg[0] + (r() - 0.5) * 4, sc = 0.95 + r() * 0.45; munyecoN(T, k, L, s * (x0 + 1.5 + (r() - 0.5) * 0.8), y, sg[1] - 0.02, faceTo(s * x0, y, 0, y + (r() - 0.5) * 20), sc, r); }
  }
  // pinos nevados detrás de las gradas y al fondo
  const pino = (x, y, h) => { const d = detalle(k, x, y), i = (r() * 3) | 0, p = L.pino(d, i), ry = r() * 6, sc = [h * (0.9 + r() * 0.2), h, h * (0.9 + r() * 0.2)]; k.add('liso', p.tronco, '#4a3122', x, y, 0, { s: sc, ry }); k.add('liso', p.verde, '#1f4a3d', x, y, 0, { s: sc, ry, c2: '#3a7a5f' }); k.add('liso', p.nieve, '#dbe8f6', x, y, 0, { s: sc, ry, c2: '#ffffff' }); };
  for (const s of [-1, 1]) for (let n = 0; n < 22; n++) pino(s * (41.5 + r() * 24), -55 + r() * 115, 7 + r() * 8);
  for (let n = 0; n < 14; n++) pino(-45 + r() * 90, 44 + r() * 30, 8 + r() * 8);
  // cristales en las esquinas y castillo de hielo al fondo
  for (const [x, y] of [[-25, 31.5], [25, 31.5], [-25.5, -31], [25.5, -31]]) cristales(x, y, y < 0 ? 4 : 6, y < 0 ? 1.4 : 3.5);
  for (let n = 0; n < 12; n++) cristales(-24 + r() * 48, 32.5 + r() * 5, 3, 2 + r() * 3.5);
  for (let n = 0; n < 18; n++) { const x = (r() - 0.5) * 30, y = 52 + r() * 14, h = 8 + r() * 20, w = 1.2 + r() * 1.6; k.add('liso', L.cristal(), r() < 0.5 ? '#3f97d8' : '#6cbcf0', x, y, 0, { s: [w, h, w], ry: r() * 6, rx: (r() - 0.5) * 0.2, c2: '#eaf8ff' }); }
  // montículos de nieve (suaves)
  for (let n = 0; n < 40; n++) { const s = r() < 0.5 ? -1 : 1, x = s * (24 + r() * 40), y = -50 + r() * 110, R = 1 + r() * 2.5; if (Math.abs(x) < 26 && y > -31 && y < 31) continue; k.add('liso', L.bola(0), '#d8e6f5', x, y, -R * 0.25, { s: [R, R * 0.45, R * 1.2], ry: r() * 6, c2: '#ffffff' }); }
}

// =============== SETAS: exterior ===============
// seta-árbol: pie curvado con bulbo y falda, sombrero con borde enrollado, láminas debajo y lunares sobre la superficie
function setaN(T, k, L, x, y, h, R, cap, r) {
  const d = detalle(k, x, y, R * 0.5), H = R * (R > 4 ? 0.85 + r() * 0.35 : 1.1 + r() * 0.5), lean = (r() - 0.5) * 0.18, v = (r() * 3) | 0, top = H * 0.98;
  const capC = new k.T.Color(cap), dark = '#' + capC.clone().multiplyScalar(0.62).getHexString();
  k.at(x, y, h, r() * 6, 1, () => {
    k.add('liso', L.pie(d, v), '#d9c9a6', 0, 0, 0, { s: [R * 0.26, H, R * 0.26], rz: lean, c2: '#f7efdc' });
    k.add('liso', L.falda(d), '#efe4cc', 0, 0, 0, { s: [R * 0.26, H, R * 0.26], rz: lean });
    const ox = -Math.sin(lean) * top;   // el sombrero sigue la inclinación del pie
    k.add('liso', L.laminas(d), '#c9b48c', ox, 0, top, { s: [R, R * 0.62, R], rz: lean * 0.6 });
    k.add('liso', L.sombrero(d, v), dark, ox, 0, top, { s: [R, R * 0.62, R], rz: lean * 0.6, c2: cap });
    const nd = d ? 5 + ((r() * 3) | 0) : k.baja ? 2 : 3;
    for (let i = 0; i < nd; i++) {
      const rho = 0.18 + r() * 0.72, th = r() * 6.283, [yy, sl] = sombY(rho), tilt = Math.atan(sl * 0.62), dx = Math.cos(th) * rho * R, dz = Math.sin(th) * rho * R, sz = R * (0.1 + r() * 0.06);
      k.add('liso', L.bolaLo(), '#fffaf0', ox + dx, dz, top + yy * R * 0.62 - 0.01 * R, { s: [sz, sz * 0.32, sz], ry: -Math.atan2(-dz, dx), rz: tilt });
    }
  });
}
function setasExt(T, k, r) {
  const L = LIB(k, T), g = G(k, T), CAPS = ['#e2382d', '#2f7fe6', '#8b52dc', '#f2892b', '#e2382d', '#2f7fe6'], capR = () => CAPS[(r() * CAPS.length) | 0];
  const arbol = (x, y, R, Hh = 40) => { const d = detalle(k, x, y), i = (r() * 3) | 0; k.add('liso', L.tronco(d, i), '#3a2416', x, y, 0, { s: [R, Hh, R * 1.05], ry: r() * 6, c2: '#5e3d26' }); };
  for (const s of [-1, 1]) {
    for (let n = 0; n < 16; n++) setaN(T, k, L, s * (25 + r() * 6), -38 + r() * 76, 0, 0.9 + r() * 1.4, capR(), r);
    for (let n = 0; n < 12; n++) setaN(T, k, L, s * (33 + r() * 10), -45 + r() * 90, 0, 2.8 + r() * 2.8, capR(), r);
    for (let n = 0; n < 10; n++) setaN(T, k, L, s * (46 + r() * 20), -55 + r() * 115, 0, 5 + r() * 4, capR(), r);
    for (let n = 0; n < 8; n++) arbol(s * (55 + r() * 18), -50 + r() * 120, 2.2 + r() * 1.6);
  }
  for (let n = 0; n < 12; n++) setaN(T, k, L, -27 + r() * 54, 31.5 + r() * 6, 0, 1 + r() * 1.8, capR(), r);
  for (let n = 0; n < 8; n++) setaN(T, k, L, -30 + r() * 60, 40 + r() * 10, 0, 3 + r() * 3, capR(), r);
  for (let n = 0; n < 6; n++) arbol(-40 + r() * 80, 55 + r() * 20, 2.5 + r() * 1.5);
  // matas, helechos, rocas con musgo, flores y setitas que brillan
  const zona = () => { const s = r() < 0.5 ? -1 : 1; return r() < 0.8 ? [s * (23.8 + r() * 22), -40 + r() * 80] : [-26 + r() * 52, 31.2 + r() * 10]; };
  for (let n = 0; n < 60; n++) { const [x, y] = zona(), R = 0.4 + r() * 0.9; if (k.baja && n % 2) continue; k.add('liso', L.mata((r() * 4) | 0), r() < 0.5 ? '#24561f' : '#2f6e28', x, y, R * 0.28, { s: [R, R * 0.65, R], ry: r() * 6, c2: r() < 0.5 ? '#4f9a3a' : '#5fae44' }); }
  const fronda = k.geo('fronda', () => tubo(T, [[0, 0, 0], [0, 0.35, 0.55], [0, 0.85, 0.62], [0, 1.15, 0.35]], 0.07, 0.01, 4, 8, (t) => 0.09 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.006));
  for (let n = 0; n < 40; n++) { const [x, y] = zona(), sc = 0.8 + r() * 0.5, ry0 = r() * 6; if (k.baja && n % 2) continue; for (let q = 0; q < 5; q++) k.add('liso', fronda, '#2f7a2a', x, y, 0, { s: [sc * 1.6, sc, sc], ry: ry0 + q * 1.25, c2: '#5fb043' }); }
  for (let n = 0; n < 18; n++) { const [x, y] = zona(), R = 0.6 + r() * 0.9, d = detalle(k, x, y, R), i = (r() * 6) | 0; k.add('liso', L.roca(i, d), '#4e535c', x, y, R * 0.18, { s: [R, R * 0.7, R], ry: r() * 6, c2: '#7d828c' }); k.add('liso', L.mata((r() * 4) | 0), '#4c8a2c', x, y, R * 0.55, { s: [R * 0.75, R * 0.22, R * 0.75], c2: '#77b84a' }); }
  for (let n = 0; n < 60; n++) { const [x, y] = zona(); k.add('prop', g.cyl6, '#3d7f30', x, y, 0, { s: [0.03, 0.35, 0.03] }); k.add('liso', L.bolaLo(), ['#b36bff', '#6fa8ff', '#ff7ac8', '#ffe066'][(r() * 4) | 0], x, y, 0.38, { s: [0.14, 0.1, 0.14] }); }
  for (let n = 0; n < 34; n++) { const [x, y] = zona(); for (let q = 0; q < 3; q++) { const dx = (r() - 0.5) * 0.8, dy = (r() - 0.5) * 0.8, hh = 0.18 + r() * 0.25; k.add('prop', g.cyl6, '#e9e0c8', x + dx, y + dy, 0, { s: [0.035, hh, 0.035] }); k.add('glow', g.cap, r() < 0.5 ? '#72f2ff' : '#ff8ad8', x + dx, y + dy, hh, { s: [0.12, 0.08, 0.12] }); } }
}

// ---------- montaje ----------
export function buildDeco(T, key, o = {}) {
  const tema = TEMAS[key]; if (!tema || key === 'dbg') return null;
  const k = new Kit(T), r = rng({ volcan: 11, hielo: 23, setas: 37 }[key] || 1); k.baja = !!o.baja;
  if (key === 'volcan') volcan(T, k, r); else if (key === 'hielo') hielo(T, k, r); else if (key === 'setas') setas(T, k, r);
  const group = new T.Group(); group.name = 'Decorado_' + key; const upd = [];
  const pg = k.build('prop');
  if (pg) {
    const m = new T.Mesh(pg, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }));
    m.name = 'Deco_Props'; m.userData.deco = true; group.add(m);
    if (o.outlineMat && o.ensureSmoothN) { o.ensureSmoothN(pg); const ol = new T.Mesh(pg, o.outlineMat); ol.name = 'Deco_Contorno'; ol.userData.outline = true; group.add(ol); }
  }
  const lg = k.build('liso');   // update 44: props pulidos, sombreado toon de 3 tonos + contorno
  if (lg) {
    const gm = new T.DataTexture(new Uint8Array([105, 185, 255]), 3, 1, T.RedFormat); gm.minFilter = gm.magFilter = T.NearestFilter; gm.needsUpdate = true;
    const m = new T.Mesh(lg, new T.MeshToonMaterial({ vertexColors: true, gradientMap: gm }));
    m.name = 'Deco_Liso'; m.userData.deco = true; group.add(m);
    // contorno solo de lo que está cerca de la cámara de juego (lo lejano ocupa pocos píxeles): geometría aparte, mismas draw calls
    const cerca = (p) => { const e = p.m.elements, x = e[12], y = -e[14]; return Math.abs(x) < 40 && y > -46 && y < 44; };
    const og = o.baja ? null : k.build('liso', cerca);   // en Baja el contorno está apagado: ni se construye
    if (og && (o.outlineMatEst || o.outlineMat) && o.ensureSmoothN) { o.ensureSmoothN(og); const ol = new T.Mesh(og, o.outlineMatEst || o.outlineMat); ol.name = 'Deco_Liso_Contorno'; ol.userData.outline = true; group.add(ol); }
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
  return { group, key, update: (dt, cam) => { for (const f of upd) f(dt, cam); }, stats: { liso: lg ? lg.attributes.position.count : 0, props: pg ? pg.attributes.position.count : 0, flat: fg ? fg.attributes.position.count : 0, glow: gg ? gg.attributes.position.count : 0 } };
}
