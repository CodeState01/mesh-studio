// Escultura: pincéis Inflar, Escavar, Puxar, Suavizar e Achatar sobre a malha selecionada.
// Usa BVH (three-mesh-bvh) para raycast rápido em malhas densas.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { state, bus } from './state.js';
import { renderer, camera, getRenderCamera, scene } from './viewport.js';
import { helpers } from './objects.js';
import { history } from './history.js';
import { toast } from '../ui/toast.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const sculpt = { brush: 'inflate', radius: 0.3, strength: 0.5 };
export const BRUSHES = [
  ['inflate', 'Inflar', 'Empurra a superfície para fora'],
  ['deflate', 'Escavar', 'Afunda a superfície'],
  ['grab', 'Puxar', 'Arrasta uma região'],
  ['smooth', 'Suavizar', 'Alisa irregularidades'],
  ['flatten', 'Achatar', 'Aplaina em um plano'],
  ['draw', 'Desenhar', 'Levanta a superfície na direção média (traço uniforme)'],
  ['crease', 'Vinco', 'Afunda e aperta, criando dobras e rugas'],
  ['pinch', 'Pinçar', 'Puxa os vértices para o centro do pincel (arestas vivas)'],
  ['clay', 'Argila', 'Acumula material em camadas planas, como argila'],
  ['layer', 'Camada', 'Levanta até uma altura fixa, sem acumular'],
  ['snake', 'Cobra', 'Arrasta e estica a superfície seguindo o mouse'],
];
export const BRUSH_ICON = { inflate: 'inflate', deflate: 'dig', grab: 'grab', smooth: 'smooth', flatten: 'flatten', draw: 'PenLine', crease: 'ChevronsDown', pinch: 'Shrink', clay: 'Layers2', layer: 'SquareStack', snake: 'Spline' };

let ring, target = null;
const ray = new THREE.Raycaster(); ray.firstHitOnly = true;

function hitAt(e) {
  if (!target) return null;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), getRenderCamera() || camera);
  return ray.intersectObject(target, false)[0] || null;
}

// Malhas leves viram malhas densas e "soldadas" (vértices compartilhados) para esculpir bem.
export function prepareForSculpt(mesh = state.selected) {
  if (!mesh?.isMesh) { toast('Selecione uma malha'); return; }
  const old = mesh.geometry;
  let g = old.index ? old.toNonIndexed() : old.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g.computeBoundingBox(); const size = g.boundingBox.getSize(new THREE.Vector3()).length();
  g = new TessellateModifier(size / 60, 10).modify(g);
  g = BufferGeometryUtils.mergeVertices(g, size * 1e-4); g.computeVertexNormals();
  mesh.geometry = g;
  history.push({ label: 'Preparar escultura', undo: () => { mesh.geometry = old; attach(mesh); }, redo: () => { mesh.geometry = g; attach(mesh); } });
  attach(mesh);
  toast(`Malha pronta: ${g.attributes.position.count.toLocaleString()} vértices`);
}

function attach(mesh) {
  if (target && target !== mesh) target.geometry.disposeBoundsTree?.();
  target = mesh?.isMesh && !mesh.userData.vfx ? mesh : null;
  if (target) target.geometry.computeBoundsTree();
}

export function initSculpt() {
  ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
  ring.renderOrder = 1000; ring.visible = false; helpers.add(ring);
  bus.on('workspace', (ws) => { if (ws === 'sculpt') attach(state.selected); else { target?.geometry.disposeBoundsTree?.(); target = null; ring.visible = false; } });
  bus.on('selection', (o) => { if (state.workspace === 'sculpt') attach(o); });

  const el = renderer.domElement;
  let stroke = null;
  el.addEventListener('pointermove', (e) => {
    if (state.workspace !== 'sculpt') return;
    const h = hitAt(e);
    ring.visible = !!h;
    if (h) {
      const n = h.face.normal.clone().transformDirection(target.matrixWorld);
      ring.position.copy(h.point).addScaledVector(n, 0.002);
      ring.lookAt(h.point.clone().add(n)); ring.scale.setScalar(sculpt.radius);
      ring.material.color.set(stroke ? '#b9f23c' : '#ffffff');
    }
    if (stroke) applyStroke(stroke, e, h);
  });
  el.addEventListener('pointerdown', (e) => {
    if (state.workspace !== 'sculpt' || e.button !== 0 || e.altKey) return;
    if (!target) { toast('Selecione uma malha para esculpir'); return; }
    const h = hitAt(e); if (!h) return;
    try { el.setPointerCapture(e.pointerId); } catch {}
    const pos = target.geometry.attributes.position;
    stroke = { before: pos.array.slice(), last: h.point.clone(), plane: new THREE.Plane().setFromNormalAndCoplanarPoint((getRenderCamera() || camera).getWorldDirection(new THREE.Vector3()).negate(), h.point) };
    if (sculpt.brush === 'grab') stroke.weights = weightsAround(target.worldToLocal(h.point.clone()));
    if (sculpt.brush === 'layer') stroke.base = pos.array.slice();
    applyStroke(stroke, e, h);
  });
  el.addEventListener('pointerup', () => {
    if (!stroke) return;
    const geo = target.geometry, b = stroke.before, a = geo.attributes.position.array.slice(); stroke = null;
    const set = (src) => { geo.attributes.position.array.set(src); geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); geo.boundsTree?.refit(); geo.computeBoundingSphere(); };
    history.push({ label: 'Pincelada', undo: () => set(b), redo: () => set(a) });
    geo.computeBoundingSphere();
  });
}

function localRadius() { const s = target.getWorldScale(new THREE.Vector3()); return sculpt.radius / ((s.x + s.y + s.z) / 3); }

function weightsAround(c) {
  const pos = target.geometry.attributes.position; const r = localRadius(); const w = []; const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { const d = v.fromBufferAttribute(pos, i).distanceTo(c); if (d < r) { const f = 1 - d / r; w.push([i, f * f * (3 - 2 * f)]); } }
  return w;
}

function applyStroke(st, e, hit) {
  const geo = target.geometry, pos = geo.attributes.position, nrm = geo.attributes.normal;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  if (sculpt.brush === 'snake' && hit) st.weights = weightsAround(target.worldToLocal(st.last.clone()));
  if (sculpt.brush === 'grab' || sculpt.brush === 'snake') {
    const r = (getRenderCamera() || camera); const rr = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rr.left) / rr.width) * 2 - 1, -((e.clientY - rr.top) / rr.height) * 2 + 1), r);
    const p = ray.ray.intersectPlane(st.plane, new THREE.Vector3()); if (!p) return;
    const d = target.worldToLocal(p.clone()).sub(target.worldToLocal(st.last.clone())); st.last.copy(p);
    for (const [i, w] of st.weights) pos.setXYZ(i, pos.getX(i) + d.x * w, pos.getY(i) + d.y * w, pos.getZ(i) + d.z * w);
  } else {
    if (!hit) return;
    const c = target.worldToLocal(hit.point.clone()); const r = localRadius();
    const k = sculpt.strength * r * 0.08;
    const affected = weightsAround(c); if (!affected.length) return;
    const centroid = new THREE.Vector3(), avgN = new THREE.Vector3();
    for (const [i] of affected) { centroid.add(v.fromBufferAttribute(pos, i)); avgN.add(n.fromBufferAttribute(nrm, i)); }
    centroid.divideScalar(affected.length); avgN.normalize();
    for (const [i, w] of affected) {
      v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nrm, i);
      switch (sculpt.brush) {
        case 'inflate': v.addScaledVector(n, k * w); break;
        case 'deflate': v.addScaledVector(n, -k * w); break;
        case 'smooth': v.lerp(centroid, Math.min(1, sculpt.strength * w * 0.5)); break;
        case 'flatten': v.addScaledVector(avgN, -v.clone().sub(centroid).dot(avgN) * Math.min(1, sculpt.strength * w * 0.6)); break;
        case 'draw': v.addScaledVector(avgN, k * w); break;
        case 'crease': v.addScaledVector(n, -k * w * 0.8).lerp(c, Math.min(0.5, sculpt.strength * w * 0.15)); break;
        case 'pinch': v.lerp(c.clone().addScaledVector(avgN, v.clone().sub(c).dot(avgN)), Math.min(0.5, sculpt.strength * w * 0.2)); break;
        case 'clay': { const plane = centroid.clone().addScaledVector(avgN, r * 0.08 * sculpt.strength); const d = v.clone().sub(plane).dot(avgN); if (d < 0) v.addScaledVector(avgN, -d * Math.min(1, w * 0.5)); break; }
        case 'layer': { const b = new THREE.Vector3(st.base[i * 3], st.base[i * 3 + 1], st.base[i * 3 + 2]); const h = v.clone().sub(b).dot(n); const lim = r * 0.12 * sculpt.strength; if (h < lim * w) v.addScaledVector(n, Math.min(k * w, lim * w - h)); break; }
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  pos.needsUpdate = true; geo.computeVertexNormals(); geo.boundsTree?.refit();
}
export { scene };
