// Operações booleanas (CSG) entre duas malhas — união, subtração e interseção.
import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { history } from './history.js';
import { bus, select } from './state.js';

const OPS = { union: ADDITION, subtract: SUBTRACTION, intersect: INTERSECTION };

// Ambas as geometrias precisam dos mesmos atributos (position/normal/uv) em espaço de mundo.
function toBrush(mesh) {
  mesh.updateMatrixWorld(true);
  let g = mesh.geometry.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.applyMatrix4(mesh.matrixWorld);
  const b = new Brush(g); b.updateMatrixWorld(); return b;
}

export function booleanOp(a, b, op = 'subtract') {
  if (!a?.isMesh || !b?.isMesh) throw new Error('Booleana precisa de duas malhas');
  const ev = new Evaluator(); ev.attributes = ['position', 'normal', 'uv']; ev.useGroups = false;
  const res = ev.evaluate(toBrush(a), toBrush(b), OPS[op]);
  const g = res.geometry; g.applyMatrix4(a.matrixWorld.clone().invert()); g.computeVertexNormals();
  const oldGeo = a.geometry, parent = b.parent, bVisible = b.visible;
  a.geometry = g; parent.remove(b);
  history.push({
    label: 'Booleana',
    undo: () => { a.geometry = oldGeo; parent.add(b); b.visible = bVisible; bus.emit('scene:changed'); },
    redo: () => { a.geometry = g; parent.remove(b); bus.emit('scene:changed'); },
  });
  bus.emit('scene:changed'); select(a);
  return { triangles: g.attributes.position.count / 3 };
}
