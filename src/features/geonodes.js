// Nós de geometria (Geometry Nodes): um grafo procedural que gera/transforma a malha de um objeto.
// A geometria original fica guardada (gnBase); o resultado do grafo substitui a exibida — não destrutivo.
// Nós: Entrada, Saída, Primitiva, Transformar, Ruído (Set Position), Subdividir, Distribuir pontos,
// Pontos em grade, Instanciar nos pontos, Juntar, Array, Espelhar, Suavizar, Extrudar casca.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EditMesh } from '../core/editmesh.js';
import { catmullClark, smooth as smoothEM, solidify } from '../core/modstack.js';
import { state, bus } from '../core/state.js';
import { history } from '../core/history.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';

// ---------- Utilidades de geometria ----------
const clean = (g) => { let x = g.index ? g.toNonIndexed() : g.clone(); for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k); if (!x.attributes.uv) x.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2)); if (!x.attributes.normal) x.computeVertexNormals(); return x; };
const empty = () => clean(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3)));
const join = (list) => { const gs = list.filter((g) => g && g.attributes?.position?.count).map(clean); return gs.length ? mergeGeometries(gs) : empty(); };
function rng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
function noise3(x, y, z, seed) { const h = (a, b, c) => { const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + seed * 4.1) * 43758.5453; return s - Math.floor(s); }; const i = [Math.floor(x), Math.floor(y), Math.floor(z)], f = [x - i[0], y - i[1], z - i[2]].map((t) => t * t * (3 - 2 * t)); let r = 0; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += (a ? f[0] : 1 - f[0]) * (b ? f[1] : 1 - f[1]) * (c ? f[2] : 1 - f[2]) * h(i[0] + a, i[1] + b, i[2] + c); return r * 2 - 1; }
const viaEM = (g, fn) => { const em = EditMesh.fromGeometry(g); em.smooth = true; return fn(em).toGeometry(); };
const PRIMS = { cubo: () => new THREE.BoxGeometry(1, 1, 1), esfera: () => new THREE.SphereGeometry(0.5, 24, 16), icoesfera: () => new THREE.IcosahedronGeometry(0.5, 1), cilindro: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 16), cone: () => new THREE.ConeGeometry(0.5, 1, 16), toro: () => new THREE.TorusGeometry(0.4, 0.15, 12, 32), grade: () => new THREE.PlaneGeometry(2, 2, 10, 10).rotateX(-Math.PI / 2), plano: () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) };

// ---------- Tipos de nó ----------
// ins/outs: [nome, tipo] — tipos: geo | pts.  params: [nome, padrão, (min,max,step) | opções]
export const NODE_TYPES = {
  input: { label: 'Geometria de entrada', color: '#4b8bd6', ins: [], outs: [['Geometria', 'geo']], params: [] },
  output: { label: 'Saída', color: '#4b8bd6', ins: [['Geometria', 'geo']], outs: [], params: [] },
  primitive: { label: 'Primitiva', color: '#3fae7a', ins: [], outs: [['Geometria', 'geo']], params: [['forma', 'cubo', Object.keys(PRIMS)], ['tamanho', 1, 0.01, 100, 0.01]],
    run: (i, p) => PRIMS[p.forma]().scale(p.tamanho, p.tamanho, p.tamanho) },
  transform: { label: 'Transformar', color: '#8a63d2', ins: [['Geometria', 'geo']], outs: [['Geometria', 'geo']], params: [['mover X', 0, -100, 100, 0.01], ['mover Y', 0, -100, 100, 0.01], ['mover Z', 0, -100, 100, 0.01], ['girar Y°', 0, -360, 360, 1], ['escala', 1, 0.001, 100, 0.01]],
    run: (i, p) => (i[0] || empty()).clone().scale(p.escala, p.escala, p.escala).rotateY(THREE.MathUtils.degToRad(p['girar Y°'])).translate(p['mover X'], p['mover Y'], p['mover Z']) },
  noise: { label: 'Ruído (deslocar)', color: '#8a63d2', ins: [['Geometria', 'geo']], outs: [['Geometria', 'geo']], params: [['força', 0.15, -5, 5, 0.01], ['escala', 2, 0.01, 50, 0.1], ['semente', 1, 0, 999, 1]],
    run: (i, p) => { const g = clean(i[0] || empty()); g.computeVertexNormals(); const pos = g.attributes.position, n = g.attributes.normal; for (let k = 0; k < pos.count; k++) { const d = noise3(pos.getX(k) * p.escala, pos.getY(k) * p.escala, pos.getZ(k) * p.escala, p.semente) * p.força; pos.setXYZ(k, pos.getX(k) + n.getX(k) * d, pos.getY(k) + n.getY(k) * d, pos.getZ(k) + n.getZ(k) * d); } g.computeVertexNormals(); return g; } },
  subdivide: { label: 'Subdividir (suave)', color: '#8a63d2', ins: [['Geometria', 'geo']], outs: [['Geometria', 'geo']], params: [['níveis', 1, 1, 3, 1]],
    run: (i, p) => viaEM(i[0] || empty(), (em) => { let r = em; for (let k = 0; k < p.níveis; k++) r = catmullClark(r); return r; }) },
  smooth: { label: 'Suavizar', color: '#8a63d2', ins: [['Geometria', 'geo']], outs: [['Geometria', 'geo']], params: [['fator', 0.5, 0, 1, 0.01], ['repetições', 3, 1, 50, 1]],
    run: (i, p) => viaEM(i[0] || empty(), (em) => smoothEM(em, p.fator, p.repetições)) },
  shell: { label: 'Dar espessura', color: '#8a63d2', ins: [['Geometria', 'geo']], outs: [['Geometria', 'geo']], params: [['espessura', 0.05, -2, 2, 0.005]],
    run: (i, p) => viaEM(i[0] || empty(), (em) => solidify(em, p.espessura)) },
  distribute: { label: 'Distribuir pontos nas faces', color: '#d68a3b', ins: [['Geometria', 'geo']], outs: [['Pontos', 'pts']], params: [['densidade', 20, 0.1, 2000, 0.5], ['semente', 3, 0, 999, 1]],
    run: (i, p) => { const g = clean(i[0] || empty()); const pos = g.attributes.position; const r = rng(p.semente + 1); const out = []; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
      for (let t = 0; t < pos.count; t += 3) { a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2); n.subVectors(b, a).cross(c.clone().sub(a)); const area = n.length() / 2; n.normalize();
        let count = area * p.densidade; while (count > 0 && out.length < 6000) { if (count < 1 && r() > count) break; let u = r(), v = r(); if (u + v > 1) { u = 1 - u; v = 1 - v; } out.push({ p: a.clone().addScaledVector(b.clone().sub(a), u).addScaledVector(c.clone().sub(a), v), n: n.clone() }); count -= 1; } }
      return out; } },
  gridpoints: { label: 'Pontos em grade', color: '#d68a3b', ins: [], outs: [['Pontos', 'pts']], params: [['colunas', 5, 1, 100, 1], ['linhas', 5, 1, 100, 1], ['espaço', 1, 0.01, 50, 0.01]],
    run: (i, p) => { const out = []; for (let x = 0; x < p.colunas; x++) for (let z = 0; z < p.linhas; z++) out.push({ p: new THREE.Vector3((x - (p.colunas - 1) / 2) * p.espaço, 0, (z - (p.linhas - 1) / 2) * p.espaço), n: new THREE.Vector3(0, 1, 0) }); return out; } },
  instance: { label: 'Instanciar nos pontos', color: '#d68a3b', ins: [['Pontos', 'pts'], ['Instância', 'geo']], outs: [['Geometria', 'geo']], params: [['escala', 0.2, 0.001, 50, 0.01], ['escala aleatória', 0.5, 0, 1, 0.01], ['girar aleatório', 1, 0, 1, 0.01], ['alinhar à normal', 1, 0, 1, 1], ['semente', 7, 0, 999, 1]],
    run: (i, p) => { const pts = i[0] || [], inst = clean(i[1] || PRIMS.cubo()); const r = rng(p.semente + 2); const up = new THREE.Vector3(0, 1, 0); const parts = []; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), s = new THREE.Vector3();
      for (const pt of pts.slice(0, 4000)) { const sc = p.escala * (1 - p['escala aleatória'] * r()); s.setScalar(sc); q.identity(); if (p['alinhar à normal']) q.setFromUnitVectors(up, pt.n); qy.setFromAxisAngle(up, r() * Math.PI * 2 * p['girar aleatório']); q.multiply(qy); parts.push(inst.clone().applyMatrix4(m.compose(pt.p, q, s))); }
      return join(parts); } },
  join: { label: 'Juntar geometria', color: '#3fae7a', ins: [['A', 'geo'], ['B', 'geo'], ['C', 'geo']], outs: [['Geometria', 'geo']], params: [], run: (i) => join(i) },
  array: { label: 'Array', color: '#3fae7a', ins: [['Geometria', 'geo']], outs: [['Geometria', 'geo']], params: [['cópias', 4, 1, 200, 1], ['desloc. X', 1.2, -50, 50, 0.01], ['desloc. Y', 0, -50, 50, 0.01], ['desloc. Z', 0, -50, 50, 0.01]],
    run: (i, p) => { const g = clean(i[0] || empty()); const parts = []; for (let k = 0; k < p.cópias; k++) parts.push(g.clone().translate(p['desloc. X'] * k, p['desloc. Y'] * k, p['desloc. Z'] * k)); return join(parts); } },
  mirror: { label: 'Espelhar', color: '#3fae7a', ins: [['Geometria', 'geo']], outs: [['Geometria', 'geo']], params: [['eixo', 'x', ['x', 'y', 'z']]],
    run: (i, p) => { const g = clean(i[0] || empty()); const m = g.clone(); const s = [1, 1, 1]; s['xyz'.indexOf(p.eixo)] = -1; m.scale(...s); const pos = m.attributes.position; for (let t = 0; t < pos.count; t += 3) for (const at of Object.values(m.attributes)) { for (let c = 0; c < at.itemSize; c++) { const x = at.array[t * at.itemSize + c]; at.array[t * at.itemSize + c] = at.array[(t + 2) * at.itemSize + c]; at.array[(t + 2) * at.itemSize + c] = x; } } m.computeVertexNormals(); return join([g, m]); } },
};

// ---------- Avaliação ----------
const defaults = (type) => Object.fromEntries(NODE_TYPES[type].params.map(([n, v]) => [n, v]));
export function evaluateGraph(graph, base) {
  const memo = new Map();
  const value = (nodeId, outIdx) => {
    const key = nodeId + ':' + outIdx; if (memo.has(key)) return memo.get(key);
    const node = graph.nodes.find((n) => n.id === nodeId); if (!node) return null; const T = NODE_TYPES[node.type];
    const ins = T.ins.map((_, k) => { const l = graph.links.find((x) => x.to[0] === nodeId && x.to[1] === k); return l ? value(l.from[0], l.from[1]) : null; });
    const r = node.type === 'input' ? base.clone() : T.run ? T.run(ins, { ...defaults(node.type), ...node.params }) : ins[0];
    memo.set(key, r); return r;
  };
  const out = graph.nodes.find((n) => n.type === 'output'); if (!out) return base;
  const l = graph.links.find((x) => x.to[0] === out.id); const g = l ? value(l.from[0], l.from[1]) : null;
  return g && g.attributes ? clean(g) : empty();
}

let nid = 0; const node = (type, x, y, params = {}) => ({ id: 'n' + (++nid).toString(36) + Date.now().toString(36).slice(-3), type, x, y, params });
export const PRESETS = {
  basic: () => { const a = node('input', 40, 120), b = node('output', 420, 120); return { nodes: [a, b], links: [{ from: [a.id, 0], to: [b.id, 0] }] }; },
  rocks: () => { const a = node('input', 20, 40), d = node('distribute', 220, 40, { densidade: 6 }), p = node('primitive', 20, 230, { forma: 'icoesfera' }), nz = node('noise', 220, 230, { força: 0.2, escala: 3 }), i = node('instance', 430, 120, { escala: 0.35 }), j = node('join', 640, 60), o = node('output', 840, 60);
    return { nodes: [a, d, p, nz, i, j, o], links: [{ from: [a.id, 0], to: [d.id, 0] }, { from: [p.id, 0], to: [nz.id, 0] }, { from: [d.id, 0], to: [i.id, 0] }, { from: [nz.id, 0], to: [i.id, 1] }, { from: [a.id, 0], to: [j.id, 0] }, { from: [i.id, 0], to: [j.id, 1] }, { from: [j.id, 0], to: [o.id, 0] }] }; },
  grass: () => { const a = node('input', 20, 40), d = node('distribute', 220, 40, { densidade: 120 }), p = node('primitive', 20, 230, { forma: 'cone' }), t = node('transform', 220, 230, { 'mover Y': 0.5, escala: 1 }), i = node('instance', 430, 120, { escala: 0.08, 'escala aleatória': 0.6 }), j = node('join', 640, 60), o = node('output', 840, 60);
    return { nodes: [a, d, p, t, i, j, o], links: [{ from: [a.id, 0], to: [d.id, 0] }, { from: [p.id, 0], to: [t.id, 0] }, { from: [d.id, 0], to: [i.id, 0] }, { from: [t.id, 0], to: [i.id, 1] }, { from: [a.id, 0], to: [j.id, 0] }, { from: [i.id, 0], to: [j.id, 1] }, { from: [j.id, 0], to: [o.id, 0] }] }; },
  cubegrid: () => { const g = node('gridpoints', 20, 60, { colunas: 6, linhas: 6, espaço: 0.6 }), p = node('primitive', 20, 240, { forma: 'cubo' }), i = node('instance', 260, 120, { escala: 0.4, 'escala aleatória': 0.7, 'girar aleatório': 0.2, 'alinhar à normal': 0 }), o = node('output', 480, 120);
    return { nodes: [g, p, i, o], links: [{ from: [g.id, 0], to: [i.id, 0] }, { from: [p.id, 0], to: [i.id, 1] }, { from: [i.id, 0], to: [o.id, 0] }] }; },
  organic: () => { const a = node('input', 20, 80), s = node('subdivide', 220, 80, { níveis: 2 }), n = node('noise', 420, 80, { força: 0.12, escala: 2.5 }), sm = node('smooth', 620, 80, { fator: 0.4, repetições: 2 }), o = node('output', 820, 80);
    return { nodes: [a, s, n, sm, o], links: [{ from: [a.id, 0], to: [s.id, 0] }, { from: [s.id, 0], to: [n.id, 0] }, { from: [n.id, 0], to: [sm.id, 0] }, { from: [sm.id, 0], to: [o.id, 0] }] }; },
};
export const PRESET_LABEL = { basic: 'Vazio', rocks: 'Espalhar pedras', grass: 'Grama', cubegrid: 'Grade de cubos', organic: 'Orgânico' };

// ---------- Ligação com objetos ----------
const baseGeo = (mesh) => { if (!mesh.__gnBase) { mesh.__gnBase = mesh.userData.gnBase ? new THREE.BufferGeometryLoader().parse(mesh.userData.gnBase) : mesh.geometry.clone(); mesh.userData.gnBase = mesh.__gnBase.toJSON(); } return mesh.__gnBase; };
export function applyGraph(mesh) {
  if (!mesh?.userData.geonodes) return;
  const g = evaluateGraph(mesh.userData.geonodes, baseGeo(mesh)); mesh.geometry.dispose(); mesh.geometry = g; delete mesh.__em; bus.emit('scene:changed');
}
export function addGeoNodes(mesh = state.selected, preset = 'basic') {
  if (!mesh?.isMesh || mesh.isSkinnedMesh) { toast('Selecione uma malha'); return null; }
  const before = mesh.userData.geonodes ? JSON.parse(JSON.stringify(mesh.userData.geonodes)) : null; const oldGeo = mesh.geometry;
  baseGeo(mesh); mesh.userData.geonodes = PRESETS[preset](); applyGraph(mesh);
  const after = JSON.parse(JSON.stringify(mesh.userData.geonodes));
  history.push({ label: 'Nós de geometria', undo: () => { if (before) { mesh.userData.geonodes = JSON.parse(JSON.stringify(before)); applyGraph(mesh); } else { delete mesh.userData.geonodes; mesh.geometry = oldGeo; } }, redo: () => { mesh.userData.geonodes = JSON.parse(JSON.stringify(after)); applyGraph(mesh); } });
  return { nodes: after.nodes.length, preset };
}
export function removeGeoNodes(mesh = state.selected) {
  if (!mesh?.userData.geonodes) return; const g = baseGeo(mesh).clone(); delete mesh.userData.geonodes; delete mesh.userData.gnBase; delete mesh.__gnBase; mesh.geometry = g; delete mesh.__em; bus.emit('scene:changed'); closeEditor();
}
export function rehydrateGeoNodes(root) { root.traverse((o) => { if (o.isMesh && o.userData.geonodes) applyGraph(o); }); }

// ---------- Editor visual de nós ----------
let ed = null;
export function closeEditor() { ed?.el.remove(); ed = null; }
export function openNodeEditor(mesh = state.selected) {
  if (!mesh?.isMesh) { toast('Selecione uma malha'); return; }
  if (!mesh.userData.geonodes) addGeoNodes(mesh, 'basic');
  closeEditor();
  const el = document.createElement('div'); el.className = 'gn-editor float'; document.querySelector('#app').appendChild(el);
  ed = { el, mesh, pan: { x: 0, y: 0 } };
  el.innerHTML = `<div class="gn-head">${icon('Workflow', 16)}<b>Nós de geometria · ${mesh.name}</b><span class="spacer"></span>
    <select class="field sm" id="gn-add"><option value="">+ Adicionar nó…</option>${Object.entries(NODE_TYPES).filter(([k]) => k !== 'input' && k !== 'output').map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('')}</select>
    <select class="field sm" id="gn-preset"><option value="">Modelos…</option>${Object.entries(PRESET_LABEL).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
    <button class="btn sm" id="gn-apply" title="Incorporar o resultado na malha">${icon('check', 14)} Aplicar</button><button class="btn sm" id="gn-remove">${icon('trash', 14)} Remover</button><button class="icon-btn" id="gn-close">${icon('close', 16)}</button></div>
    <div class="gn-canvas"><svg class="gn-wires"></svg><div class="gn-nodes"></div></div><div class="gn-hint">Arraste da bolinha de saída (direita) até uma entrada (esquerda) · clique num fio para apagá-lo · arraste o fundo para mover</div>`;
  el.querySelectorAll('input,select').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
  el.querySelector('#gn-close').onclick = closeEditor;
  el.querySelector('#gn-remove').onclick = () => removeGeoNodes(mesh);
  el.querySelector('#gn-apply').onclick = () => { const g = mesh.geometry.clone(); delete mesh.userData.geonodes; delete mesh.userData.gnBase; delete mesh.__gnBase; mesh.geometry = g; closeEditor(); toast('Resultado incorporado na malha'); };
  el.querySelector('#gn-add').onchange = (e) => { const t = e.target.value; if (!t) return; mesh.userData.geonodes.nodes.push(node(t, 260 - ed.pan.x, 160 - ed.pan.y)); e.target.value = ''; draw(); };
  el.querySelector('#gn-preset').onchange = (e) => { const p = e.target.value; if (!p) return; mesh.userData.geonodes = PRESETS[p](); e.target.value = ''; draw(); commit(); };
  const canvas = el.querySelector('.gn-canvas');
  canvas.onpointerdown = (e) => { if (e.target !== canvas && !e.target.classList.contains('gn-wires')) return; const sx = e.clientX - ed.pan.x, sy = e.clientY - ed.pan.y; canvas.setPointerCapture(e.pointerId); canvas.onpointermove = (ev) => { ed.pan.x = ev.clientX - sx; ed.pan.y = ev.clientY - sy; layout(); }; canvas.onpointerup = () => (canvas.onpointermove = null); };
  draw();
}
let commitTimer = 0;
function commit() { clearTimeout(commitTimer); commitTimer = setTimeout(() => { try { applyGraph(ed.mesh); } catch (err) { toast('Nós: ' + err.message, { kind: 'error' }); } }, 60); }
function draw() {
  const g = ed.mesh.userData.geonodes; const host = ed.el.querySelector('.gn-nodes');
  host.innerHTML = g.nodes.map((n) => { const T = NODE_TYPES[n.type]; const P = { ...defaults(n.type), ...n.params };
    return `<div class="gn-node" data-id="${n.id}" style="--nc:${T.color}"><div class="gn-title">${T.label}${n.type !== 'output' && n.type !== 'input' ? `<button class="gn-del" title="Apagar nó">×</button>` : ''}</div>
      ${T.outs.map(([name, ty], k) => `<div class="gn-sock out" data-out="${k}"><span>${name}</span><i class="${ty}"></i></div>`).join('')}
      ${T.params.map(([name, def, a, b, step]) => Array.isArray(a) ? `<label class="gn-param">${name}<select data-p="${name}">${a.map((o) => `<option ${P[name] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>` : `<label class="gn-param">${name}<input data-p="${name}" type="number" value="${P[name]}" min="${a}" max="${b}" step="${step}"></label>`).join('')}
      ${T.ins.map(([name, ty], k) => `<div class="gn-sock in" data-in="${k}"><i class="${ty}"></i><span>${name}</span></div>`).join('')}</div>`; }).join('');
  host.querySelectorAll('input,select').forEach((i) => { i.addEventListener('keydown', (e) => e.stopPropagation()); i.onchange = () => { const n = g.nodes.find((x) => x.id === i.closest('.gn-node').dataset.id); n.params[i.dataset.p] = i.tagName === 'SELECT' ? i.value : +i.value; commit(); }; });
  host.querySelectorAll('.gn-node').forEach((elN) => {
    const n = g.nodes.find((x) => x.id === elN.dataset.id);
    elN.querySelector('.gn-title').onpointerdown = (e) => { if (e.target.closest('.gn-del')) return; const sx = e.clientX - n.x, sy = e.clientY - n.y; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.onpointermove = (ev) => { n.x = ev.clientX - sx; n.y = ev.clientY - sy; layout(); }; e.currentTarget.onpointerup = (ev) => (ev.currentTarget.onpointermove = null); };
    elN.querySelector('.gn-del')?.addEventListener('click', () => { g.nodes = g.nodes.filter((x) => x !== n); g.links = g.links.filter((l) => l.from[0] !== n.id && l.to[0] !== n.id); draw(); commit(); });
    elN.querySelectorAll('.gn-sock.out i').forEach((dot) => dot.onpointerdown = (e) => startWire(e, n.id, +dot.parentElement.dataset.out));
  });
  layout();
}
function sockPos(id, kind, k) { const s = ed.el.querySelector(`.gn-node[data-id="${id}"] [data-${kind}="${k}"] i`); const c = ed.el.querySelector('.gn-canvas').getBoundingClientRect(); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top }; }
const curve = (a, b) => { const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; };
function layout(temp) {
  const g = ed.mesh.userData.geonodes;
  g.nodes.forEach((n) => { const e = ed.el.querySelector(`.gn-node[data-id="${n.id}"]`); if (e) e.style.transform = `translate(${n.x + ed.pan.x}px,${n.y + ed.pan.y}px)`; });
  const svg = ed.el.querySelector('.gn-wires');
  svg.innerHTML = g.links.map((l, i) => { const a = sockPos(l.from[0], 'out', l.from[1]), b = sockPos(l.to[0], 'in', l.to[1]); return a && b ? `<path data-l="${i}" d="${curve(a, b)}"/>` : ''; }).join('') + (temp ? `<path class="temp" d="${curve(temp.a, temp.b)}"/>` : '');
  svg.querySelectorAll('[data-l]').forEach((p) => (p.onclick = () => { g.links.splice(+p.dataset.l, 1); layout(); commit(); }));
}
function startWire(e, fromId, outIdx) {
  e.stopPropagation(); const a = sockPos(fromId, 'out', outIdx); const c = ed.el.querySelector('.gn-canvas').getBoundingClientRect();
  const mv = (ev) => layout({ a, b: { x: ev.clientX - c.left, y: ev.clientY - c.top } });
  const up = (ev) => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.gn-sock.in');
    if (target) { const g = ed.mesh.userData.geonodes; const toId = target.closest('.gn-node').dataset.id; const k = +target.dataset.in; if (toId !== fromId) { g.links = g.links.filter((l) => !(l.to[0] === toId && l.to[1] === k)); g.links.push({ from: [fromId, outIdx], to: [toId, k] }); commit(); } }
    layout();
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
