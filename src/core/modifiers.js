// Modificadores destrutivos (aplicados na geometria), com undo.
import * as THREE from 'three';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { EditMesh } from './editmesh.js';
import { decimate as decimateEM } from './modstack.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { history } from './history.js';
import { content, addToScene } from './objects.js';
import { bus } from './state.js';

const AX = { x: 0, y: 1, z: 2 };

function setGeometry(mesh, geo, label) {
  const old = mesh.geometry;
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  mesh.geometry = geo;
  history.push({ label, undo: () => { mesh.geometry = old; }, redo: () => { mesh.geometry = geo; } });
}

function deform(mesh, fn, label) {
  const geo = mesh.geometry.clone(); const p = geo.attributes.position; const v = new THREE.Vector3();
  geo.computeBoundingBox(); const bb = geo.boundingBox;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v, bb); p.setXYZ(i, v.x, v.y, v.z); }
  p.needsUpdate = true; setGeometry(mesh, geo, label);
}

export function applyModifier(mesh, type, o = {}) {
  if (!mesh?.isMesh) throw new Error('Modificadores só se aplicam a malhas');
  const axis = o.axis || 'x';
  switch (type) {
    case 'array': {
      const n = Math.max(1, Math.min(200, o.count ?? 3));
      const off = new THREE.Vector3(...(o.offset || [1.2, 0, 0]));
      const added = [];
      for (let i = 1; i < n; i++) {
        const c = mesh.clone(); c.material = mesh.material; c.name = `${mesh.name}.arr${i}`;
        c.userData = { ...mesh.userData, id: mesh.userData.id + '_a' + i };
        c.position.add(off.clone().multiplyScalar(i)); addToScene(c, false); added.push(c);
      }
      history.push({ label: 'Array', undo: () => added.forEach((c) => content.remove(c)), redo: () => added.forEach((c) => content.add(c)) });
      return { created: added.map((c) => c.name) };
    }
    case 'mirror': {
      const flat = (g) => (g.index ? g.toNonIndexed() : g.clone());
      const g1 = flat(mesh.geometry); const g2 = flat(mesh.geometry);
      const s = [1, 1, 1]; s[AX[axis]] = -1; g2.scale(...s);
      // Espelhar inverte o winding: troca o 1º e o 3º vértice de cada triângulo
      // para que as normais continuem apontando para fora.
      for (const attr of Object.values(g2.attributes)) {
        const n = attr.itemSize;
        for (let i = 0; i < attr.count; i += 3) for (let k = 0; k < n; k++) {
          const a = attr.array[i * n + k]; attr.array[i * n + k] = attr.array[(i + 2) * n + k]; attr.array[(i + 2) * n + k] = a;
        }
      }
      const t = [0, 0, 0]; t[AX[axis]] = (o.amount ?? 0); g2.translate(...t);
      const merged = BufferGeometryUtils.mergeGeometries([g1, g2]);
      setGeometry(mesh, merged, 'Espelhar'); return { ok: true };
    }
    case 'subdivide': {
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      const geo = new TessellateModifier(o.amount ?? 0.15, 6).modify(g);
      setGeometry(mesh, geo, 'Subdividir'); return { vertices: geo.attributes.position.count };
    }
    case 'decimate': { // síncrono (o SimplifyModifier do three r187 virou assíncrono)
      const geo = decimateEM(EditMesh.fromGeometry(mesh.geometry), 1 - Math.min(0.95, o.amount ?? 0.5)).toGeometry();
      setGeometry(mesh, geo, 'Decimar'); return { vertices: geo.attributes.position.count };
    }
    case 'twist': {
      const amt = (o.amount ?? 90) * Math.PI / 180;
      deform(mesh, (v, bb) => {
        const t = (v.y - bb.min.y) / ((bb.max.y - bb.min.y) || 1) * amt; const c = Math.cos(t), s = Math.sin(t);
        const x = v.x * c - v.z * s, z = v.x * s + v.z * c; v.x = x; v.z = z;
      }, 'Torcer'); return { ok: true };
    }
    case 'bend': {
      const amt = (o.amount ?? 45) * Math.PI / 180;
      deform(mesh, (v, bb) => {
        const h = (bb.max.y - bb.min.y) || 1; if (Math.abs(amt) < 1e-4) return;
        const r = h / amt; const th = (v.y - bb.min.y) / h * amt;
        const x = v.x; v.x = r - (r - x) * Math.cos(th); v.y = bb.min.y + (r - x) * Math.sin(th);
      }, 'Dobrar'); return { ok: true };
    }
    default: throw new Error('Modificador desconhecido: ' + type);
  }
}

export function shadeSmooth(mesh, smooth = true) {
  if (!mesh?.isMesh) return;
  if (smooth) { const g = BufferGeometryUtils.mergeVertices(mesh.geometry.clone().deleteAttribute('normal')); setGeometry(mesh, g, 'Suavizar'); }
  else { const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); setGeometry(mesh, g, 'Facetado'); mesh.material.flatShading = true; mesh.material.needsUpdate = true; }
  bus.emit('scene:changed');
}
