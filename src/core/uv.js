// UV: desdobrar (caixa, planar, esférico, cilíndrico, inteligente) e pintura de textura no modelo.
import * as THREE from 'three';
import { EditMesh } from './editmesh.js';
import { state, bus } from './state.js';
import { renderer, camera, getRenderCamera } from './viewport.js';
import { edit } from './editmode.js';
import { history } from './history.js';
import { toast } from '../ui/toast.js';

export const UNWRAPS = [['smart', 'Inteligente (ilhas)'], ['box', 'Caixa'], ['planar', 'Planar'], ['sphere', 'Esférico'], ['cylinder', 'Cilíndrico']];

function emOf(mesh) {
  if (edit.mesh === mesh) return edit.em;
  if (!mesh.__em) { mesh.__em = EditMesh.fromGeometry(mesh.geometry); mesh.__em.smooth = mesh.userData.smooth ?? false; }
  return mesh.__em;
}

export function unwrap(mesh, method = 'smart', margin = 0.02) {
  if (!mesh?.isMesh) { toast('Selecione uma malha'); return; }
  const em = emOf(mesh); const before = em.uvs.map((f) => f.map((u) => u.slice()));
  const bb = new THREE.Box3(); em.verts.forEach((v) => bb.expandByPoint(v));
  const size = bb.getSize(new THREE.Vector3()); const c = bb.getCenter(new THREE.Vector3()); const S = Math.max(size.x, size.y, size.z) || 1;

  if (method === 'smart') smartUnwrap(em, margin);
  else em.faces.forEach((f, fi) => {
    const n = em.faceNormal(fi);
    em.uvs[fi] = f.map((vi) => {
      const p = em.verts[vi].clone().sub(c);
      if (method === 'planar') return [p.x / S + 0.5, p.y / S + 0.5];
      if (method === 'sphere') { const d = p.clone().normalize(); return [0.5 + Math.atan2(d.z, d.x) / (2 * Math.PI), 0.5 + Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) / Math.PI]; }
      if (method === 'cylinder') return [0.5 + Math.atan2(p.z, p.x) / (2 * Math.PI), p.y / S + 0.5];
      // caixa: projeta no eixo dominante e coloca cada lado numa célula de um atlas 3×2
      const ax = Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z) ? 0 : Math.abs(n.y) > Math.abs(n.z) ? 1 : 2;
      const cell = ax * 2 + ((ax === 0 ? n.x : ax === 1 ? n.y : n.z) < 0 ? 1 : 0);
      const [u, v] = ax === 0 ? [p.z, p.y] : ax === 1 ? [p.x, p.z] : [p.x, p.y];
      return [(cell % 3) / 3 + (u / S + 0.5) / 3 * (1 - margin * 3) + margin, Math.floor(cell / 3) / 2 + (v / S + 0.5) / 2 * (1 - margin * 2) + margin];
    });
  });
  const after = em.uvs.map((f) => f.map((u) => u.slice()));
  const apply = (uvs) => { em.uvs = uvs.map((f) => f.map((u) => u.slice())); mesh.geometry.dispose(); mesh.geometry = em.toGeometry(); bus.emit('uv:changed', mesh); };
  apply(after);
  history.push({ label: 'Desdobrar UV', undo: () => apply(before), redo: () => apply(after) });
  toast(`UV desdobrado: ${UNWRAPS.find((u) => u[0] === method)[1]}`);
}

// Cada face vira uma ilha no próprio plano; ilhas empacotadas em prateleiras (sem sobreposição).
function smartUnwrap(em, margin) {
  const islands = em.faces.map((f, fi) => {
    const n = em.faceNormal(fi); const o = em.verts[f[0]];
    const u = em.verts[f[1]].clone().sub(o).normalize(); const w = n.clone().cross(u).normalize();
    const pts = f.map((vi) => { const p = em.verts[vi].clone().sub(o); return [p.dot(u), p.dot(w)]; });
    const minX = Math.min(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1]));
    const loc = pts.map(([x, y]) => [x - minX, y - minY]);
    return { fi, loc, w: Math.max(...loc.map((p) => p[0])), h: Math.max(...loc.map((p) => p[1])) };
  });
  const area = islands.reduce((s, i) => s + (i.w + margin) * (i.h + margin), 0); const side = Math.sqrt(area) * 1.15;
  islands.sort((a, b) => b.h - a.h);
  let x = 0, y = 0, rowH = 0, maxX = 0;
  for (const is of islands) {
    if (x + is.w > side && x > 0) { x = 0; y += rowH + margin; rowH = 0; }
    is.x = x; is.y = y; x += is.w + margin; rowH = Math.max(rowH, is.h); maxX = Math.max(maxX, x);
  }
  const scale = 1 / Math.max(maxX, y + rowH, 1e-6);
  for (const is of islands) em.uvs[is.fi] = is.loc.map(([px, py]) => [(is.x + px) * scale, (is.y + py) * scale]);
}

// ---------- Pintura de textura ----------
export const paint = { color: '#b9f23c', size: 24, opacity: 1, hardness: 0.6, tool: 'brush', resolution: 1024 };
let target = null, ctx = null, tex = null, stroke = null;

export function preparePaint(mesh = state.selected) {
  if (!mesh?.isMesh) { toast('Selecione uma malha para pintar'); return null; }
  const em = emOf(mesh);
  if (!mesh.userData.uvSmart) { unwrap(mesh, 'smart'); mesh.userData.uvSmart = true; }
  const m = mesh.material;
  if (!m.map || !m.map.userData?.paintCanvas) {
    const cv = document.createElement('canvas'); cv.width = cv.height = paint.resolution; const g = cv.getContext('2d');
    g.fillStyle = '#' + m.color.getHexString(); g.fillRect(0, 0, cv.width, cv.height);
    if (m.map?.image) try { g.drawImage(m.map.image, 0, 0, cv.width, cv.height); } catch {}
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.userData.paintCanvas = cv; t.flipY = true;
    m.map = t; m.color.set('#ffffff'); m.needsUpdate = true;
  }
  void em; target = mesh; tex = m.map; ctx = tex.userData.paintCanvas.getContext('2d');
  return target;
}

function dab(uv) {
  const cv = ctx.canvas; const x = uv.x * cv.width, y = (1 - uv.y) * cv.height; const r = paint.size;
  const g = ctx.createRadialGradient(x, y, r * paint.hardness, x, y, r);
  const col = paint.tool === 'eraser' ? '#ffffff' : paint.color;
  const rgb = new THREE.Color(col); const rgba = (a) => `rgba(${rgb.r * 255 | 0},${rgb.g * 255 | 0},${rgb.b * 255 | 0},${a})`;
  g.addColorStop(0, rgba(paint.opacity)); g.addColorStop(1, rgba(0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); tex.needsUpdate = true;
}

export function initPaint() {
  const el = renderer.domElement; const ray = new THREE.Raycaster();
  const hit = (e) => {
    if (!target) return null; const r = el.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), getRenderCamera() || camera);
    return ray.intersectObject(target, false)[0];
  };
  el.addEventListener('pointerdown', (e) => {
    if (state.workspace !== 'paint' || e.button !== 0 || e.altKey) return;
    if (!target || target !== state.selected) preparePaint(); if (!target) return;
    const h = hit(e); if (!h?.uv) return;
    stroke = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (paint.tool === 'fill') { ctx.fillStyle = paint.color; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); tex.needsUpdate = true; }
    else dab(h.uv);
  });
  el.addEventListener('pointermove', (e) => { if (!stroke || paint.tool === 'fill') return; const h = hit(e); if (h?.uv) dab(h.uv); });
  window.addEventListener('pointerup', () => {
    if (!stroke) return; const before = stroke; const after = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height); const c = ctx, t = tex; stroke = null;
    history.push({ label: 'Pincelada de tinta', undo: () => { c.putImageData(before, 0, 0); t.needsUpdate = true; }, redo: () => { c.putImageData(after, 0, 0); t.needsUpdate = true; } });
  });
  bus.on('workspace', (ws) => { if (ws === 'paint' && state.selected?.isMesh) preparePaint(); });
}

export function exportPaintTexture() {
  if (!ctx) { toast('Nada pintado ainda'); return; }
  const a = document.createElement('a'); a.href = ctx.canvas.toDataURL('image/png'); a.download = 'textura-pintada.png'; a.click();
}
export const paintCanvas = () => ctx?.canvas || null;
