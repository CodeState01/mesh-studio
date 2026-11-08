// Simulações (como MantaFlow/Bullet no Blender):
//   • Líquido — partículas com relaxação de dupla densidade (Clavet et al.), colide com o domínio e com objetos
//   • Fumaça e fogo — fluido em grade 3D (advecção semi-lagrangiana + projeção), renderizado por raymarching
//   • Corpo mole — massa-mola nas arestas + pressão interna (preserva volume), quica no chão
//   • Cabelo/pelo — fios presos à superfície com integração de Verlet e restrições de comprimento
//   • Oceano — ondas de Gerstner animadas
// Liga/desliga tudo junto com "Simular efeitos"; a timeline tocando também move o oceano.
import * as THREE from 'three';
import { state, bus, select, nextId } from '../core/state.js';
import { content } from '../core/objects.js';
import { frameHooks } from '../core/viewport.js';
import { history } from '../core/history.js';
import { toast } from '../ui/toast.js';

export const sims = { running: false, t: 0 };
const runtime = new Map(); // obj.uuid → estado vivo da simulação (não é salvo)
const add = (obj, label) => { content.add(obj); bus.emit('scene:changed'); select(obj); history.push({ label, undo: () => { content.remove(obj); bus.emit('scene:changed'); }, redo: () => { content.add(obj); bus.emit('scene:changed'); } }); return obj; };
const domainBox = (size, color) => { const b = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 })); b.userData = { proxy: true, editHelper: true }; return b; };

// ============ Líquido ============
export function createFluid(opts = {}) {
  const g = new THREE.Group(); g.name = opts.name || 'Líquido';
  g.userData = { id: nextId('fluid'), kind: 'sim', sim: { type: 'fluid', count: opts.count ?? 1200, size: opts.size ?? [2, 2, 2], color: opts.color || '#2f8cff', viscosity: 0.04 } };
  if (opts.position) g.position.fromArray(opts.position); else g.position.y = 1;
  buildFluid(g); return g;
}
function buildFluid(g) {
  const s = g.userData.sim; [...g.children].forEach((c) => g.remove(c));
  const h = Math.cbrt((s.size[0] * s.size[1] * s.size[2] * 0.35) / s.count) * 1.6;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(h * 0.42, 8, 6), new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 0.08, clearcoat: 1, metalness: 0 }), s.count);
  mesh.userData = { editHelper: true, noPick: false }; mesh.castShadow = true; g.add(mesh, domainBox(s.size, '#3dd6ff'));
  const P = new Float32Array(s.count * 3); const r = () => Math.random();
  for (let i = 0; i < s.count; i++) { P[i * 3] = (r() - 0.5) * s.size[0] * 0.5 - s.size[0] * 0.2; P[i * 3 + 1] = r() * s.size[1] * 0.6; P[i * 3 + 2] = (r() - 0.5) * s.size[2] * 0.5; }
  // coordenadas relativas ao centro inferior do domínio
  runtime.set(g.uuid, { P, V: new Float32Array(s.count * 3), prev: new Float32Array(s.count * 3), h, mesh, P0: P.slice() }); drawFluid(g);
}
function drawFluid(g) { const R = runtime.get(g.uuid); const s = g.userData.sim; const m = new THREE.Matrix4(); for (let i = 0; i < s.count; i++) { m.makeTranslation(R.P[i * 3], R.P[i * 3 + 1] - s.size[1] / 2, R.P[i * 3 + 2]); R.mesh.setMatrixAt(i, m); } R.mesh.instanceMatrix.needsUpdate = true; R.mesh.computeBoundingSphere(); }
function stepFluid(g, dt) {
  const R = runtime.get(g.uuid); const s = g.userData.sim; const { P, V, prev, h } = R; const n = s.count; dt = Math.min(dt, 1 / 60);
  const k = 0.004, kN = 0.01, rho0 = 6, sigma = s.viscosity;
  const gl = new THREE.Vector3(0, -9.8, 0).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()).invert());
  for (let i = 0; i < n * 3; i += 3) { V[i] += gl.x * dt; V[i + 1] += gl.y * dt; V[i + 2] += gl.z * dt; }
  // grade espacial para achar vizinhos
  const cell = new Map(); const key = (x, y, z) => ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791));
  for (let i = 0; i < n; i++) { const kk = key(Math.floor(P[i * 3] / h), Math.floor(P[i * 3 + 1] / h), Math.floor(P[i * 3 + 2] / h)); (cell.get(kk) || cell.set(kk, []).get(kk)).push(i); }
  const nbOf = (i) => { const cx = Math.floor(P[i * 3] / h), cy = Math.floor(P[i * 3 + 1] / h), cz = Math.floor(P[i * 3 + 2] / h); const out = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const l = cell.get(key(cx + a, cy + b, cz + c)); if (l) for (const j of l) if (j > i) out.push(j); } return out; };
  const NB = []; for (let i = 0; i < n; i++) NB.push(nbOf(i));
  // viscosidade (impulsos entre pares que se aproximam)
  for (let i = 0; i < n; i++) for (const j of NB[i]) { const dx = P[j * 3] - P[i * 3], dy = P[j * 3 + 1] - P[i * 3 + 1], dz = P[j * 3 + 2] - P[i * 3 + 2]; const r = Math.hypot(dx, dy, dz); const q = r / h; if (q >= 1 || r < 1e-6) continue; const ux = dx / r, uy = dy / r, uz = dz / r; const u = (V[i * 3] - V[j * 3]) * ux + (V[i * 3 + 1] - V[j * 3 + 1]) * uy + (V[i * 3 + 2] - V[j * 3 + 2]) * uz; if (u > 0) { const I = dt * (1 - q) * sigma * u * 0.5; V[i * 3] -= I * ux; V[i * 3 + 1] -= I * uy; V[i * 3 + 2] -= I * uz; V[j * 3] += I * ux; V[j * 3 + 1] += I * uy; V[j * 3 + 2] += I * uz; } }
  for (let i = 0; i < n * 3; i++) { prev[i] = P[i]; P[i] += V[i] * dt; }
  // relaxação de dupla densidade
  const rho = new Float32Array(n), rhoN = new Float32Array(n);
  for (let i = 0; i < n; i++) for (const j of NB[i]) { const r = Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]); const q = r / h; if (q < 1) { const a = (1 - q) ** 2, b = (1 - q) ** 3; rho[i] += a; rho[j] += a; rhoN[i] += b; rhoN[j] += b; } }
  for (let i = 0; i < n; i++) {
    const Pr = k * (rho[i] - rho0), PN = kN * rhoN[i];
    for (const j of NB[i]) { const dx = P[j * 3] - P[i * 3], dy = P[j * 3 + 1] - P[i * 3 + 1], dz = P[j * 3 + 2] - P[i * 3 + 2]; const r = Math.hypot(dx, dy, dz); const q = r / h; if (q >= 1 || r < 1e-6) continue; const D = (Pr * (1 - q) + PN * (1 - q) ** 2) * 0.5 / r * h; P[j * 3] += D * dx; P[j * 3 + 1] += D * dy; P[j * 3 + 2] += D * dz; P[i * 3] -= D * dx; P[i * 3 + 1] -= D * dy; P[i * 3 + 2] -= D * dz; }
  }
  // colisão: paredes do domínio + objetos da cena (esferas envolventes)
  const hx = s.size[0] / 2, hz = s.size[2] / 2, hy = s.size[1]; const pad = h * 0.3;
  const obstacles = []; g.updateMatrixWorld(); const inv = g.matrixWorld.clone().invert();
  content.children.forEach((o) => { if (o === g || !o.visible || !o.isMesh || o.userData.sim) return; o.geometry.computeBoundingSphere(); const bs = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld).applyMatrix4(inv); bs.center.y += s.size[1] / 2; obstacles.push(bs); });
  for (let i = 0; i < n; i++) {
    let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    x = Math.min(hx - pad, Math.max(-hx + pad, x)); y = Math.min(hy - pad, Math.max(pad, y)); z = Math.min(hz - pad, Math.max(-hz + pad, z));
    for (const b of obstacles) { const dx = x - b.center.x, dy = y - b.center.y, dz = z - b.center.z; const d = Math.hypot(dx, dy, dz); if (d < b.radius + pad && d > 1e-6) { const f = (b.radius + pad) / d; x = b.center.x + dx * f; y = b.center.y + dy * f; z = b.center.z + dz * f; } }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
  }
  for (let i = 0; i < n * 3; i++) V[i] = (P[i] - prev[i]) / dt;
  drawFluid(g);
}

// ============ Fumaça / fogo (grade 3D + raymarching) ============
const GN = 32;
const VOL_VS = `varying vec3 vPos; varying vec3 vEye; void main(){ vPos = position; vEye = (inverse(modelMatrix) * vec4(cameraPosition,1.)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`;
const VOL_FS = `precision highp sampler3D; uniform sampler3D uVol; uniform float uFire; uniform vec3 uSmoke; uniform float uDensity; varying vec3 vPos; varying vec3 vEye;
vec2 hitBox(vec3 o, vec3 d){ vec3 t0=(vec3(-.5)-o)/d, t1=(vec3(.5)-o)/d; vec3 mn=min(t0,t1), mx=max(t0,t1); return vec2(max(max(mn.x,mn.y),mn.z), min(min(mx.x,mx.y),mx.z)); }
void main(){ vec3 d = normalize(vPos - vEye); vec2 t = hitBox(vEye, d); t.x = max(t.x, 0.); if (t.x > t.y) discard;
  float st = (t.y - t.x) / 64.; vec3 p = vEye + d * (t.x + st * .5); vec4 acc = vec4(0.);
  for (int i = 0; i < 64; i++) { vec2 s = texture(uVol, p + .5).rg; float a = clamp(s.r * uDensity * st * 12., 0., 1.);
    vec3 fire = mix(vec3(1., .25, .02), vec3(1., .9, .5), clamp(s.g * 1.4 - .2, 0., 1.)) * s.g * 4. * uFire;
    vec3 c = uSmoke * (1. - s.g * uFire) + fire; acc.rgb += (1. - acc.a) * a * c; acc.a += (1. - acc.a) * a; if (acc.a > .97) break; p += d * st; }
  gl_FragColor = acc; }`;
export function createGas(type = 'smoke', opts = {}) {
  const fire = type === 'fire';
  const g = new THREE.Group(); g.name = opts.name || (fire ? 'Fogo (volume)' : 'Fumaça (volume)');
  g.userData = { id: nextId('gas'), kind: 'sim', sim: { type: 'gas', fire, size: opts.size ?? 2, density: opts.density ?? 1.2, buoyancy: 1.6, color: opts.color || (fire ? '#2a2a2a' : '#c9ccd2') } };
  if (opts.position) g.position.fromArray(opts.position); else g.position.y = 1;
  buildGas(g); return g;
}
function buildGas(g) {
  const s = g.userData.sim; [...g.children].forEach((c) => g.remove(c));
  const N3 = GN ** 3; const tex = new THREE.Data3DTexture(new Uint8Array(N3 * 2), GN, GN, GN); tex.format = THREE.RGFormat; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.unpackAlignment = 1; tex.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3 === undefined ? null : undefined, vertexShader: VOL_VS, fragmentShader: VOL_FS, transparent: true, depthWrite: false, side: THREE.FrontSide, uniforms: { uVol: { value: tex }, uFire: { value: s.fire ? 1 : 0 }, uSmoke: { value: new THREE.Color(s.color) }, uDensity: { value: s.density } } });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); box.scale.setScalar(s.size); box.userData = { editHelper: true }; box.castShadow = false; box.renderOrder = 10;
  g.add(box, domainBox([s.size, s.size, s.size], s.fire ? '#ff7a45' : '#9aa0aa'));
  const f = () => new Float32Array(N3); runtime.set(g.uuid, { d: f(), T: f(), u: f(), v: f(), w: f(), tex, mat });
}
const I3 = (x, y, z) => x + GN * (y + GN * z);
function sample(F, x, y, z) { x = Math.min(GN - 1.001, Math.max(0, x)); y = Math.min(GN - 1.001, Math.max(0, y)); z = Math.min(GN - 1.001, Math.max(0, z)); const i = x | 0, j = y | 0, k = z | 0, a = x - i, b = y - j, c = z - k;
  const l = (ii, jj, kk) => F[I3(ii, jj, kk)]; return (((l(i, j, k) * (1 - a) + l(i + 1, j, k) * a) * (1 - b) + (l(i, j + 1, k) * (1 - a) + l(i + 1, j + 1, k) * a) * b) * (1 - c)) + (((l(i, j, k + 1) * (1 - a) + l(i + 1, j, k + 1) * a) * (1 - b) + (l(i, j + 1, k + 1) * (1 - a) + l(i + 1, j + 1, k + 1) * a) * b) * c); }
function advect(F, u, v, w, dt) { const out = new Float32Array(F.length); for (let z = 1; z < GN - 1; z++) for (let y = 1; y < GN - 1; y++) for (let x = 1; x < GN - 1; x++) { const i = I3(x, y, z); out[i] = sample(F, x - u[i] * dt, y - v[i] * dt, z - w[i] * dt); } return out; }
function stepGas(g, dt) {
  const R = runtime.get(g.uuid); const s = g.userData.sim; dt = Math.min(dt, 1 / 30) * 30; // dt em "células por quadro"
  const c = GN / 2; const r = GN * 0.09;
  for (let z = 0; z < GN; z++) for (let y = 1; y < 4; y++) for (let x = 0; x < GN; x++) { const d = Math.hypot(x - c, z - c); if (d < r) { const i = I3(x, y, z); R.d[i] = Math.min(1, R.d[i] + 0.35 * dt); R.T[i] = Math.min(1, R.T[i] + 0.5 * dt); R.v[i] += 0.3 * dt; R.u[i] += (Math.random() - 0.5) * 0.4; R.w[i] += (Math.random() - 0.5) * 0.4; } }
  for (let i = 0; i < R.v.length; i++) R.v[i] += (s.buoyancy * R.T[i] - 0.15 * R.d[i]) * 0.08 * dt;
  const u = advect(R.u, R.u, R.v, R.w, dt), v = advect(R.v, R.u, R.v, R.w, dt), w = advect(R.w, R.u, R.v, R.w, dt); R.u = u; R.v = v; R.w = w;
  // projeção: torna o campo de velocidade sem divergência (Jacobi)
  const div = new Float32Array(GN ** 3), p = new Float32Array(GN ** 3);
  for (let z = 1; z < GN - 1; z++) for (let y = 1; y < GN - 1; y++) for (let x = 1; x < GN - 1; x++) div[I3(x, y, z)] = -0.5 * (R.u[I3(x + 1, y, z)] - R.u[I3(x - 1, y, z)] + R.v[I3(x, y + 1, z)] - R.v[I3(x, y - 1, z)] + R.w[I3(x, y, z + 1)] - R.w[I3(x, y, z - 1)]);
  for (let it = 0; it < 14; it++) for (let z = 1; z < GN - 1; z++) for (let y = 1; y < GN - 1; y++) for (let x = 1; x < GN - 1; x++) p[I3(x, y, z)] = (div[I3(x, y, z)] + p[I3(x - 1, y, z)] + p[I3(x + 1, y, z)] + p[I3(x, y - 1, z)] + p[I3(x, y + 1, z)] + p[I3(x, y, z - 1)] + p[I3(x, y, z + 1)]) / 6;
  for (let z = 1; z < GN - 1; z++) for (let y = 1; y < GN - 1; y++) for (let x = 1; x < GN - 1; x++) { const i = I3(x, y, z); R.u[i] -= 0.5 * (p[I3(x + 1, y, z)] - p[I3(x - 1, y, z)]); R.v[i] -= 0.5 * (p[I3(x, y + 1, z)] - p[I3(x, y - 1, z)]); R.w[i] -= 0.5 * (p[I3(x, y, z + 1)] - p[I3(x, y, z - 1)]); }
  R.d = advect(R.d, R.u, R.v, R.w, dt); R.T = advect(R.T, R.u, R.v, R.w, dt);
  const data = R.tex.image.data; const fade = s.fire ? 0.985 : 0.995, cool = s.fire ? 0.94 : 0.97;
  for (let i = 0; i < R.d.length; i++) { R.d[i] *= fade; R.T[i] *= cool; data[i * 2] = Math.min(255, R.d[i] * 255); data[i * 2 + 1] = Math.min(255, R.T[i] * 255); }
  R.tex.needsUpdate = true; R.mat.uniforms.uDensity.value = s.density;
}

// ============ Corpo mole ============
export function makeSoftBody(mesh = state.selected, opts = {}) {
  if (!mesh?.isMesh || mesh.isSkinnedMesh || mesh.userData.sim) { toast('Selecione uma malha comum'); return null; }
  mesh.userData.sim = { type: 'soft', stiffness: opts.stiffness ?? 0.6, pressure: opts.pressure ?? 1, bounce: 0.3 }; buildSoft(mesh); bus.emit('scene:changed');
  toast('Corpo mole pronto — use “Simular efeitos” (Shift+Alt+Space)'); return { target: mesh.name };
}
function buildSoft(mesh) {
  const geo = mesh.geometry; const pos = geo.attributes.position; const map = new Map(); const weld = new Int32Array(pos.count); const X = [];
  for (let i = 0; i < pos.count; i++) { const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`; if (!map.has(k)) { map.set(k, X.length / 3); X.push(pos.getX(i), pos.getY(i), pos.getZ(i)); } weld[i] = map.get(k); }
  const idx = geo.index ? geo.index.array : null; const tri = []; const triCount = (idx ? idx.length : pos.count) / 3; const edges = new Map();
  for (let t = 0; t < triCount; t++) { const v = [0, 1, 2].map((k) => weld[idx ? idx[t * 3 + k] : t * 3 + k]); tri.push(v); for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3]; const e = a < b ? a + '_' + b : b + '_' + a; if (!edges.has(e)) edges.set(e, [a, b]); } }
  mesh.updateMatrixWorld(); const W = new Float32Array(X.length); const v3 = new THREE.Vector3();
  for (let i = 0; i < X.length; i += 3) { v3.set(X[i], X[i + 1], X[i + 2]).applyMatrix4(mesh.matrixWorld); W[i] = v3.x; W[i + 1] = v3.y; W[i + 2] = v3.z; }
  const springs = [...edges.values()].map(([a, b]) => [a, b, Math.hypot(W[a * 3] - W[b * 3], W[a * 3 + 1] - W[b * 3 + 1], W[a * 3 + 2] - W[b * 3 + 2])]);
  runtime.set(mesh.uuid, { W, prev: W.slice(), W0: W.slice(), springs, tri, weld, vol0: volume(W, tri), orig: pos.array.slice(), matrix: mesh.matrixWorld.clone() });
}
function volume(W, tri) { let V = 0; for (const [a, b, c] of tri) { V += (W[a * 3] * (W[b * 3 + 1] * W[c * 3 + 2] - W[b * 3 + 2] * W[c * 3 + 1]) - W[a * 3 + 1] * (W[b * 3] * W[c * 3 + 2] - W[b * 3 + 2] * W[c * 3]) + W[a * 3 + 2] * (W[b * 3] * W[c * 3 + 1] - W[b * 3 + 1] * W[c * 3])) / 6; } return V; }
function stepSoft(mesh, dt) {
  const R = runtime.get(mesh.uuid); const s = mesh.userData.sim; const { W, prev } = R; dt = Math.min(dt, 1 / 60); const n = W.length / 3;
  for (let i = 0; i < n; i++) { const x = W[i * 3], y = W[i * 3 + 1], z = W[i * 3 + 2]; W[i * 3] += (x - prev[i * 3]) * 0.995; W[i * 3 + 1] += (y - prev[i * 3 + 1]) * 0.995 - 9.8 * dt * dt; W[i * 3 + 2] += (z - prev[i * 3 + 2]) * 0.995; prev[i * 3] = x; prev[i * 3 + 1] = y; prev[i * 3 + 2] = z; }
  for (let it = 0; it < 8; it++) {
    for (const [a, b, L] of R.springs) { const dx = W[b * 3] - W[a * 3], dy = W[b * 3 + 1] - W[a * 3 + 1], dz = W[b * 3 + 2] - W[a * 3 + 2]; const d = Math.hypot(dx, dy, dz) || 1e-6; const f = ((d - L) / d) * 0.5 * s.stiffness; W[a * 3] += dx * f; W[a * 3 + 1] += dy * f; W[a * 3 + 2] += dz * f; W[b * 3] -= dx * f; W[b * 3 + 1] -= dy * f; W[b * 3 + 2] -= dz * f; }
    // pressão: empurra os vértices ao longo da normal até recuperar o volume inicial
    const V = volume(W, R.tri); const k = ((R.vol0 * s.pressure - V) / (R.vol0 || 1)) * 0.02; const N = new Float32Array(W.length);
    for (const [a, b, c] of R.tri) { const ux = W[b * 3] - W[a * 3], uy = W[b * 3 + 1] - W[a * 3 + 1], uz = W[b * 3 + 2] - W[a * 3 + 2], vx = W[c * 3] - W[a * 3], vy = W[c * 3 + 1] - W[a * 3 + 1], vz = W[c * 3 + 2] - W[a * 3 + 2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const p of [a, b, c]) { N[p * 3] += nx; N[p * 3 + 1] += ny; N[p * 3 + 2] += nz; } }
    for (let i = 0; i < n; i++) { const L = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; W[i * 3] += (N[i * 3] / L) * k; W[i * 3 + 1] += (N[i * 3 + 1] / L) * k; W[i * 3 + 2] += (N[i * 3 + 2] / L) * k; }
    for (let i = 0; i < n; i++) if (W[i * 3 + 1] < 0) { W[i * 3 + 1] = 0; prev[i * 3 + 1] = W[i * 3 + 1] + (W[i * 3 + 1] - prev[i * 3 + 1]) * s.bounce; prev[i * 3] = W[i * 3] - (W[i * 3] - prev[i * 3]) * 0.6; prev[i * 3 + 2] = W[i * 3 + 2] - (W[i * 3 + 2] - prev[i * 3 + 2]) * 0.6; }
  }
  const inv = mesh.matrixWorld.clone().invert(); const pos = mesh.geometry.attributes.position; const v3 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { const w = R.weld[i]; v3.set(W[w * 3], W[w * 3 + 1], W[w * 3 + 2]).applyMatrix4(inv); pos.setXYZ(i, v3.x, v3.y, v3.z); }
  pos.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
}

// ============ Cabelo / pelo ============
export function addHair(mesh = state.selected, opts = {}) {
  if (!mesh?.isMesh || mesh.userData.sim) { toast('Selecione uma malha'); return null; }
  mesh.userData.hair = { count: opts.count ?? 1500, length: opts.length ?? 0.35, segments: 6, color: opts.color || '#6b4a2b', stiffness: opts.stiffness ?? 0.35, seed: Math.floor(Math.random() * 999) };
  buildHair(mesh); bus.emit('scene:changed'); return { target: mesh.name, strands: mesh.userData.hair.count };
}
function buildHair(mesh) {
  const H = mesh.userData.hair; mesh.children.filter((c) => c.userData.hairLines).forEach((c) => mesh.remove(c));
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry; const pos = g.attributes.position; const tris = pos.count / 3; const areas = []; let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < tris; t++) { a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2); total += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2; areas.push(total); }
  let s = H.seed + 1; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const roots = [], normals = [];
  for (let i = 0; i < H.count; i++) { const x = rnd() * total; let lo = 0, hi = areas.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (areas[m] < x) lo = m + 1; else hi = m; } a.fromBufferAttribute(pos, lo * 3); b.fromBufferAttribute(pos, lo * 3 + 1); c.fromBufferAttribute(pos, lo * 3 + 2); let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; } roots.push(a.clone().addScaledVector(b.clone().sub(a), u).addScaledVector(c.clone().sub(a), v)); normals.push(b.clone().sub(a).cross(c.clone().sub(a)).normalize()); }
  const S = H.segments; const linePos = new Float32Array(H.count * S * 2 * 3); const colors = new Float32Array(linePos.length); const base = new THREE.Color(H.color);
  for (let i = 0; i < H.count; i++) for (let k = 0; k < S; k++) { const t0 = k / S, t1 = (k + 1) / S; for (const [j, tt] of [[0, t0], [1, t1]]) { const o = ((i * S + k) * 2 + j) * 3; const col = base.clone().multiplyScalar(0.55 + tt * 0.6); colors[o] = col.r; colors[o + 1] = col.g; colors[o + 2] = col.b; } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(linePos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true })); lines.userData = { hairLines: true, editHelper: true }; lines.frustumCulled = false; mesh.add(lines);
  // estado: pontos de cada fio em coordenadas do MUNDO
  mesh.updateMatrixWorld(); const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld); const seg = H.length / S;
  const P = new Float32Array(H.count * (S + 1) * 3);
  for (let i = 0; i < H.count; i++) { const r = roots[i].clone().applyMatrix4(mesh.matrixWorld); const n = normals[i].clone().applyMatrix3(nm).normalize(); for (let k = 0; k <= S; k++) { const p = r.clone().addScaledVector(n, seg * k); p.y -= (k / S) ** 2 * seg * (1 - H.stiffness) * 1.5; P.set([p.x, p.y, p.z], (i * (S + 1) + k) * 3); } }
  runtime.set(mesh.uuid + ':hair', { roots, normals, P, prev: P.slice(), lines, seg }); drawHair(mesh);
}
function drawHair(mesh) { const R = runtime.get(mesh.uuid + ':hair'); const H = mesh.userData.hair; const S = H.segments; const inv = mesh.matrixWorld.clone().invert(); const arr = R.lines.geometry.attributes.position.array; const v = new THREE.Vector3();
  for (let i = 0; i < H.count; i++) for (let k = 0; k < S; k++) for (let j = 0; j < 2; j++) { const q = (i * (S + 1) + k + j) * 3; v.set(R.P[q], R.P[q + 1], R.P[q + 2]).applyMatrix4(inv); arr.set([v.x, v.y, v.z], ((i * S + k) * 2 + j) * 3); }
  R.lines.geometry.attributes.position.needsUpdate = true; }
function stepHair(mesh, dt) {
  const R = runtime.get(mesh.uuid + ':hair'); if (!R) return; const H = mesh.userData.hair; const S = H.segments; dt = Math.min(dt, 1 / 60); mesh.updateMatrixWorld();
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld); mesh.geometry.computeBoundingSphere(); const bs = mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
  const { P, prev } = R;
  for (let i = 0; i < H.count; i++) {
    const r = R.roots[i].clone().applyMatrix4(mesh.matrixWorld); const n = R.normals[i].clone().applyMatrix3(nm).normalize(); const o0 = i * (S + 1) * 3;
    P[o0] = r.x; P[o0 + 1] = r.y; P[o0 + 2] = r.z;
    for (let k = 1; k <= S; k++) { const o = o0 + k * 3; for (let c = 0; c < 3; c++) { const x = P[o + c]; P[o + c] += (x - prev[o + c]) * 0.96 + (c === 1 ? -9.8 * dt * dt : 0); prev[o + c] = x; } }
    for (let it = 0; it < 3; it++) for (let k = 1; k <= S; k++) {
      const a = o0 + (k - 1) * 3, b = o0 + k * 3; const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2]; const d = Math.hypot(dx, dy, dz) || 1e-6; const f = R.seg / d;
      P[b] = P[a] + dx * f; P[b + 1] = P[a + 1] + dy * f; P[b + 2] = P[a + 2] + dz * f;
      // rigidez: puxa em direção à normal da raiz
      const t = H.stiffness * (1 - k / (S + 1)) * 0.5; P[b] += (P[a] + n.x * R.seg - P[b]) * t; P[b + 1] += (P[a + 1] + n.y * R.seg - P[b + 1]) * t; P[b + 2] += (P[a + 2] + n.z * R.seg - P[b + 2]) * t;
      const ex = P[b] - bs.center.x, ey = P[b + 1] - bs.center.y, ez = P[b + 2] - bs.center.z; const ed = Math.hypot(ex, ey, ez); if (ed < bs.radius * 0.98) { const g = (bs.radius * 0.98) / ed; P[b] = bs.center.x + ex * g; P[b + 1] = bs.center.y + ey * g; P[b + 2] = bs.center.z + ez * g; }
    }
  }
  drawHair(mesh);
}

// ============ Oceano ============
export function createOcean(opts = {}) {
  const size = opts.size ?? 30, res = 128; const geo = new THREE.PlaneGeometry(size, size, res, res).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: opts.color || '#0e4a6e', roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 }));
  m.name = opts.name || 'Oceano'; m.receiveShadow = true;
  m.userData = { id: nextId('ocean'), kind: 'sim', sim: { type: 'ocean', height: opts.height ?? 0.35, choppy: 0.7, speed: 1, size } };
  runtime.set(m.uuid, { base: geo.attributes.position.array.slice() }); return m;
}
const WAVES = [[1, 0, 0.32, 9], [0.7, 0.7, 0.22, 5.5], [-0.4, 0.9, 0.14, 3.1], [0.2, -1, 0.08, 1.7]];
function stepOcean(m, t) {
  let R = runtime.get(m.uuid); if (!R) { R = { base: m.geometry.attributes.position.array.slice() }; runtime.set(m.uuid, R); }
  const s = m.userData.sim; const pos = m.geometry.attributes.position; const B = R.base;
  for (let i = 0; i < pos.count; i++) {
    let x = B[i * 3], z = B[i * 3 + 2], y = 0, dx = 0, dz = 0;
    for (const [wx, wz, amp, len] of WAVES) { const k = (Math.PI * 2) / len; const c = Math.sqrt(9.8 / k) * s.speed; const L = Math.hypot(wx, wz); const f = k * ((wx / L) * x + (wz / L) * z - c * t); const A = amp * s.height; y += A * Math.sin(f); dx += (wx / L) * A * s.choppy * Math.cos(f); dz += (wz / L) * A * s.choppy * Math.cos(f); }
    pos.setXYZ(i, x - dx, y, z - dz);
  }
  pos.needsUpdate = true; m.geometry.computeVertexNormals();
}

// ============ Loop, criação e reidratação ============
export function rehydrateSims(root = content) {
  root.traverse((o) => { const s = o.userData.sim; if (s?.type === 'fluid') buildFluid(o); else if (s?.type === 'gas') buildGas(o); else if (s?.type === 'soft' && o.isMesh) buildSoft(o); else if (s?.type === 'ocean') runtime.delete(o.uuid); if (o.userData.hair && o.isMesh) buildHair(o); });
}
export function resetSims() {
  sims.running = false;
  content.traverse((o) => { const s = o.userData.sim; if (s?.type === 'soft') { const R = runtime.get(o.uuid); if (R) { o.geometry.attributes.position.array.set(R.orig); o.geometry.attributes.position.needsUpdate = true; o.geometry.computeVertexNormals(); buildSoft(o); } } else if (s?.type === 'fluid') buildFluid(o); else if (s?.type === 'gas') buildGas(o); if (o.userData.hair) buildHair(o); });
  bus.emit('sims', sims); toast('Simulações reiniciadas');
}
export function toggleSims(on = !sims.running) {
  sims.running = on;
  if (on) content.traverse((o) => { if (o.userData.sim?.type === 'soft' && !runtime.get(o.uuid)) buildSoft(o); });
  bus.emit('sims', sims); toast(on ? 'Simulando: líquido, fumaça, corpo mole e cabelo' : 'Simulação pausada');
}
let clock = 0;
export function initSims() {
  frameHooks.add((dt) => {
    clock += dt; const tOcean = state.playing ? state.time : clock;
    content.traverse((o) => {
      const s = o.userData.sim;
      if (s?.type === 'ocean') stepOcean(o, tOcean);
      if (!sims.running) return;
      if (s?.type === 'fluid' && runtime.get(o.uuid)) stepFluid(o, dt);
      else if (s?.type === 'gas' && runtime.get(o.uuid)) stepGas(o, dt);
      else if (s?.type === 'soft' && runtime.get(o.uuid)) stepSoft(o, dt);
      if (o.userData.hair && o.isMesh) stepHair(o, dt);
    });
  });
}
export function addSimulation(type, opts = {}) {
  const make = { fluid: () => createFluid(opts), smoke: () => createGas('smoke', opts), fire: () => createGas('fire', opts), ocean: () => createOcean(opts) }[type];
  if (make) { const o = add(make(), 'Simulação'); if (type !== 'ocean' && !sims.running) toggleSims(true); return { name: o.name, type }; }
  if (type === 'softbody') return makeSoftBody(opts.target, opts);
  if (type === 'hair') return addHair(opts.target, opts);
  throw new Error('Tipo de simulação desconhecido: ' + type);
}
