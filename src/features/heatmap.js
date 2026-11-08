// Pontos de calor (heatmaps), como a "Mesh Analysis" e o Weight Paint do Blender:
//   curvatura · espessura · saliência (overhang p/ impressão 3D) · distorção de UV · arestas vivas ·
//   distância ao cursor 3D · pesos de osso (com pincel de pintura de pesos) · densidade de vértices.
// O mapa é desenhado trocando temporariamente o material por um de cores por vértice (funciona até em
// malhas com esqueleto). Também tem "Pesos por calor": pesos automáticos por difusão (bone heat).
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { state, bus } from '../core/state.js';
import { renderer, camera, getRenderCamera, getContainer, cursor3D } from '../core/viewport.js';
import { history } from '../core/history.js';
import { toast } from '../ui/toast.js';

export const HEAT_MODES = [
  ['curvature', 'Curvatura', 'Vermelho = convexo, azul = côncavo'],
  ['thickness', 'Espessura', 'Vermelho = parede fina'],
  ['overhang', 'Saliência (impressão 3D)', 'Vermelho = face voltada para baixo, precisa de suporte'],
  ['sharpness', 'Arestas vivas', 'Vermelho = ângulo agudo entre faces'],
  ['distortion', 'Distorção de UV', 'Vermelho = textura esticada'],
  ['distance', 'Distância ao cursor 3D', 'Vermelho = perto do cursor'],
  ['density', 'Densidade de vértices', 'Vermelho = região com mais detalhe'],
  ['weights', 'Pesos do osso', 'Vermelho = osso controla 100%'],
];
export const heat = { mode: null, target: null, bone: 0, paint: false, radius: 0.25, strength: 0.25, subtract: false, range: [0, 1] };

// Rampa "turbo" simplificada: azul → ciano → verde → amarelo → vermelho
const STOPS = [[0.19, 0.07, 0.23], [0.1, 0.45, 0.95], [0.1, 0.85, 0.75], [0.55, 0.95, 0.25], [0.98, 0.75, 0.15], [0.85, 0.15, 0.05]];
export function ramp(t, out = new THREE.Color()) {
  t = Math.min(1, Math.max(0, t)) * (STOPS.length - 1); const i = Math.min(STOPS.length - 2, Math.floor(t)); const f = t - i;
  const a = STOPS[i], b = STOPS[i + 1]; return out.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

// Vértices "soldados" (mesma posição = mesmo vértice) + vizinhança, para medidas que dependem da topologia.
function topology(geo) {
  const pos = geo.attributes.position; const map = new Map(); const weld = new Int32Array(pos.count); const P = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    if (!map.has(k)) { map.set(k, P.length); P.push(new THREE.Vector3().fromBufferAttribute(pos, i)); } weld[i] = map.get(k);
  }
  const idx = geo.index ? geo.index.array : null; const triCount = (idx ? idx.length : pos.count) / 3;
  const tri = (t, k) => (idx ? idx[t * 3 + k] : t * 3 + k);
  const nb = P.map(() => new Set()); const vn = P.map(() => new THREE.Vector3()); const vFaces = P.map(() => []); const fN = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const w = [0, 1, 2].map((k) => weld[tri(t, k)]);
    const n = a.subVectors(P[w[1]], P[w[0]]).cross(b.subVectors(P[w[2]], P[w[0]])).clone(); // área × 2 como peso
    fN.push(n.clone().normalize());
    for (let k = 0; k < 3; k++) { nb[w[k]].add(w[(k + 1) % 3]); nb[w[k]].add(w[(k + 2) % 3]); vn[w[k]].add(n); vFaces[w[k]].push(t); }
  }
  vn.forEach((n) => n.normalize());
  return { P, weld, nb: nb.map((s) => [...s]), vn, vFaces, fN, triCount, tri };
}

function computeScalar(mesh, mode) {
  const geo = mesh.geometry; const pos = geo.attributes.position; const T = topology(geo); const W = T.P.length;
  const val = new Float32Array(W);
  switch (mode) {
    case 'curvature': { // curvatura média ≈ deslocamento laplaciano projetado na normal
      for (let i = 0; i < W; i++) {
        const nbs = T.nb[i]; if (!nbs.length) continue; const c = new THREE.Vector3(); let len = 0;
        nbs.forEach((j) => { c.add(T.P[j]); len += T.P[j].distanceTo(T.P[i]); }); c.divideScalar(nbs.length); len /= nbs.length;
        val[i] = -c.sub(T.P[i]).dot(T.vn[i]) / (len * len || 1);
      }
      break;
    }
    case 'thickness': { // raio para dentro, contra a própria malha (BVH)
      const g = new THREE.BufferGeometry(); g.setAttribute('position', pos.clone()); if (geo.index) g.setIndex(geo.index.clone());
      const bvh = new MeshBVH(g); const ray = new THREE.Ray(); const size = new THREE.Box3().setFromBufferAttribute(pos).getSize(new THREE.Vector3()).length();
      for (let i = 0; i < W; i++) {
        ray.origin.copy(T.P[i]).addScaledVector(T.vn[i], -size * 1e-4); ray.direction.copy(T.vn[i]).negate();
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide); val[i] = hit ? hit.distance : size;
      }
      break;
    }
    case 'overhang': { // ângulo da normal (no mundo) com o "para baixo"
      const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      for (let i = 0; i < W; i++) { const n = T.vn[i].clone().applyMatrix3(nm).normalize(); val[i] = Math.max(0, -n.y); }
      break;
    }
    case 'sharpness': { // maior ângulo entre faces vizinhas no vértice
      for (let i = 0; i < W; i++) { let m = 0; const fs = T.vFaces[i]; for (let x = 0; x < fs.length; x++) for (let y = x + 1; y < fs.length; y++) m = Math.max(m, Math.acos(Math.min(1, Math.max(-1, T.fN[fs[x]].dot(T.fN[fs[y]]))))); val[i] = m; }
      break;
    }
    case 'distortion': { // razão área 3D / área UV de cada triângulo, relativa à média
      const uv = geo.attributes.uv; if (!uv) throw new Error('A malha não tem UV — use Desdobrar UV (U)');
      const ratio = []; let sum = 0; const a = new THREE.Vector3(), b = new THREE.Vector3();
      for (let t = 0; t < T.triCount; t++) {
        const [i0, i1, i2] = [0, 1, 2].map((k) => T.tri(t, k));
        const A3 = a.subVectors(T.P[T.weld[i1]], T.P[T.weld[i0]]).cross(b.subVectors(T.P[T.weld[i2]], T.P[T.weld[i0]])).length();
        const Auv = Math.abs((uv.getX(i1) - uv.getX(i0)) * (uv.getY(i2) - uv.getY(i0)) - (uv.getX(i2) - uv.getX(i0)) * (uv.getY(i1) - uv.getY(i0)));
        const r = Auv > 1e-12 ? A3 / Auv : 0; ratio.push(r); sum += r;
      }
      const mean = sum / (ratio.length || 1); const acc = new Float32Array(W), cnt = new Float32Array(W);
      ratio.forEach((r, t) => { const d = Math.abs(Math.log((r || 1e-6) / mean)); for (let k = 0; k < 3; k++) { const w = T.weld[T.tri(t, k)]; acc[w] += d; cnt[w]++; } });
      for (let i = 0; i < W; i++) val[i] = acc[i] / (cnt[i] || 1);
      break;
    }
    case 'distance': { const inv = mesh.matrixWorld.clone(); for (let i = 0; i < W; i++) val[i] = -T.P[i].clone().applyMatrix4(inv).distanceTo(cursor3D); break; }
    case 'density': { for (let i = 0; i < W; i++) { let l = 0; T.nb[i].forEach((j) => (l += T.P[j].distanceTo(T.P[i]))); val[i] = -(l / (T.nb[i].length || 1)); } break; }
    case 'weights': {
      if (!mesh.isSkinnedMesh) throw new Error('Pesos só existem em malhas com esqueleto (Rig › Auto-rig)');
      const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
      for (let v = 0; v < pos.count; v++) { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(v, k) === heat.bone) w += sw.getComponent(v, k); val[T.weld[v]] = w; }
      heat.range = [0, 1];
      return { T, val, fixed: true };
    }
  }
  return { T, val };
}

// Normaliza ignorando extremos (percentis 2–98) para o mapa não ficar "todo azul" por causa de 1 vértice.
function normalize(val) {
  const s = Array.from(val).sort((a, b) => a - b); const lo = s[Math.floor(s.length * 0.02)] ?? 0, hi = s[Math.floor(s.length * 0.98)] ?? 1;
  heat.range = [lo, hi]; const d = hi - lo || 1; return val.map((v) => (v - lo) / d);
}

function paintColors(mesh, T, n) {
  const geo = mesh.geometry; const count = geo.attributes.position.count; const col = new Float32Array(count * 3); const c = new THREE.Color();
  for (let v = 0; v < count; v++) { ramp(n[T.weld[v]], c); col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

let legend = null;
function showLegend() {
  legend ||= Object.assign(document.createElement('div'), { className: 'heat-legend' });
  if (!legend.isConnected) getContainer().appendChild(legend);
  const m = HEAT_MODES.find((x) => x[0] === heat.mode); const f = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));
  const lo = heat.mode === 'distance' || heat.mode === 'density' ? -heat.range[0] : heat.range[0], hi = heat.mode === 'distance' || heat.mode === 'density' ? -heat.range[1] : heat.range[1];
  legend.innerHTML = `<b>${m[1]}</b><div class="heat-bar"></div><div class="heat-lbl"><span>${f(lo)}</span><span>${f(hi)}</span></div><small>${m[2]}${heat.mode === 'weights' ? ` · osso ${heat.bone + 1}${heat.paint ? ' · pintando (Shift = subtrair)' : ''}` : ''}</small>`;
}

export function showHeat(mesh = state.selected, mode = 'curvature') {
  if (!mesh?.isMesh) { toast('Selecione uma malha para ver os pontos de calor'); return null; }
  if (heat.target && heat.target !== mesh) clearHeat();
  const { T, val, fixed } = computeScalar(mesh, mode);
  const n = fixed ? val : normalize(val);
  if (!mesh.__heatOrig) mesh.__heatOrig = mesh.material;
  paintColors(mesh, T, n);
  mesh.material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  heat.mode = mode; heat.target = mesh; heat.T = T; showLegend(); bus.emit('heat', heat);
  return { mode, min: heat.range[0], max: heat.range[1], vertices: T.P.length };
}

export function clearHeat() {
  const m = heat.target; if (m) { if (m.__heatOrig) { m.material.dispose(); m.material = m.__heatOrig; delete m.__heatOrig; } m.geometry.deleteAttribute('color'); }
  heat.mode = null; heat.target = null; heat.paint = false; legend?.remove(); bus.emit('heat', heat);
}
bus.on('selection', (o) => { if (heat.target && o !== heat.target && !o?.isBone) clearHeat(); });
bus.on('mode', (m) => { if (m === 'edit' && heat.target) clearHeat(); });

// ---------- Pincel de pesos (Weight Paint) ----------
const ray = new THREE.Raycaster();
function paintAt(e, record) {
  const sk = heat.target; const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), getRenderCamera() || camera);
  const hit = ray.intersectObject(sk, false)[0]; if (!hit) return;
  const geo = sk.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const v = new THREE.Vector3(); const radius = heat.radius;
  for (let i = 0; i < pos.count; i++) {
    sk.getVertexPosition(i, v); sk.localToWorld(v); const d = v.distanceTo(hit.point); if (d > radius) continue;
    const f = 1 - d / radius; const add = heat.strength * f * f * (3 - 2 * f) * (e.shiftKey || heat.subtract ? -1 : 1);
    let slot = -1, minK = 0; for (let k = 0; k < 4; k++) { if (si.getComponent(i, k) === heat.bone) slot = k; if (sw.getComponent(i, k) < sw.getComponent(i, minK)) minK = k; }
    if (slot < 0) { if (add <= 0) continue; slot = minK; si.setComponent(i, slot, heat.bone); sw.setComponent(i, slot, 0); }
    const w = Math.min(1, Math.max(0, sw.getComponent(i, slot) + add)); sw.setComponent(i, slot, w);
    let rest = 0; for (let k = 0; k < 4; k++) if (k !== slot) rest += sw.getComponent(i, k);
    for (let k = 0; k < 4; k++) if (k !== slot) sw.setComponent(i, k, rest > 0 ? (sw.getComponent(i, k) / rest) * (1 - w) : 0);
    if (rest <= 0 && w < 1) { const o = (slot + 1) % 4; sw.setComponent(i, o, 1 - w); } // mantém soma 1
  }
  si.needsUpdate = sw.needsUpdate = true; void record;
  const { T, val } = computeScalar(sk, 'weights'); paintColors(sk, T, val);
}
export function initHeat() {
  const el = renderer.domElement; let before = null;
  el.addEventListener('pointerdown', (e) => {
    if (!heat.paint || heat.mode !== 'weights' || e.button !== 0 || e.altKey) return;
    e.stopImmediatePropagation(); before = heat.target.geometry.attributes.skinWeight.array.slice();
    const idxBefore = heat.target.geometry.attributes.skinIndex.array.slice(); before = [before, idxBefore];
    try { el.setPointerCapture(e.pointerId); } catch {} paintAt(e);
  }, true);
  el.addEventListener('pointermove', (e) => { if (before) paintAt(e); });
  el.addEventListener('pointerup', () => {
    if (!before) return; const sk = heat.target; const g = sk.geometry; const [bw, bi] = before; const aw = g.attributes.skinWeight.array.slice(), ai = g.attributes.skinIndex.array.slice(); before = null;
    const set = (w, i) => { g.attributes.skinWeight.array.set(w); g.attributes.skinIndex.array.set(i); g.attributes.skinWeight.needsUpdate = g.attributes.skinIndex.needsUpdate = true; if (heat.target === sk) { const r = computeScalar(sk, 'weights'); paintColors(sk, r.T, r.val); } };
    history.push({ label: 'Pintar pesos', undo: () => set(bw, bi), redo: () => set(aw, ai) });
  });
}

// ---------- Pesos por calor (difusão), como o "Automatic Weights" do Blender ----------
// 1) cada vértice recebe calor de cada osso ∝ 1/d² ao segmento; 2) o calor se espalha pela superfície
// (equação do calor, passos de Laplaciano) — assim regiões ligadas pela malha ficam juntas, e não
// apenas próximas no espaço; 3) mantém os 4 ossos mais fortes e normaliza.
export function heatWeights(sk = state.selected, iterations = 25) {
  if (!sk?.isSkinnedMesh) { toast('Selecione uma malha com esqueleto'); return; }
  const geo = sk.geometry; const T = topology(geo); const bones = sk.skeleton.bones; const B = bones.length; const W = T.P.length;
  sk.updateMatrixWorld(true); const inv = sk.matrixWorld.clone().invert();
  const segs = bones.map((b) => {
    const a = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const child = b.children.find((c) => c.isBone); const e = child ? child.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv) : a.clone().add(new THREE.Vector3(0, b.userData.length || 0.3, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())));
    return new THREE.Line3(a, e);
  });
  let H = new Float32Array(W * B); const cp = new THREE.Vector3();
  for (let i = 0; i < W; i++) {
    let s = 0; for (let b = 0; b < B; b++) { const d = segs[b].closestPointToPoint(T.P[i], true, cp).distanceTo(T.P[i]); const h = 1 / Math.max(1e-4, d * d); H[i * B + b] = h; s += h; }
    for (let b = 0; b < B; b++) H[i * B + b] /= s;
  }
  for (let it = 0; it < iterations; it++) {
    const N = new Float32Array(W * B);
    for (let i = 0; i < W; i++) { const nbs = T.nb[i]; for (let b = 0; b < B; b++) { let avg = 0; nbs.forEach((j) => (avg += H[j * B + b])); N[i * B + b] = H[i * B + b] * 0.5 + (nbs.length ? (avg / nbs.length) * 0.5 : H[i * B + b] * 0.5); } }
    H = N;
  }
  const count = geo.attributes.position.count; const si = new Uint16Array(count * 4), sw = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    const i = T.weld[v]; const top = [...Array(B).keys()].sort((a, b) => H[i * B + b] - H[i * B + a]).slice(0, 4);
    const s = top.reduce((acc, b) => acc + H[i * B + b] ** 2, 0) || 1; // quadrado: transições mais definidas
    top.forEach((b, k) => { si[v * 4 + k] = b; sw[v * 4 + k] = H[i * B + b] ** 2 / s; });
  }
  const old = [geo.attributes.skinIndex, geo.attributes.skinWeight]; const now = [new THREE.Uint16BufferAttribute(si, 4), new THREE.Float32BufferAttribute(sw, 4)];
  const set = ([a, b]) => { geo.setAttribute('skinIndex', a); geo.setAttribute('skinWeight', b); if (heat.target === sk && heat.mode === 'weights') showHeat(sk, 'weights'); };
  set(now); history.push({ label: 'Pesos por calor', undo: () => set(old), redo: () => set(now) });
  toast(`Pesos por calor calculados (${B} ossos, ${W.toLocaleString()} vértices)`);
  return { bones: B, vertices: W };
}
