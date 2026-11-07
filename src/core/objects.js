// Fábrica de objetos da cena (malhas, texto, luzes, câmeras) + busca por nome/id.
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { nextId, bus } from './state.js';

RectAreaLightUniformsLib.init();
const font = new FontLoader().parse(fontJson);
const DEG = Math.PI / 180;

export const content = new THREE.Group();      // tudo que o usuário cria vive aqui
content.name = '__content__';
export const helpers = new THREE.Group();      // helpers de editor (não exportados)
helpers.name = '__helpers__';

const GEOS = {
  cube: () => new THREE.BoxGeometry(1, 1, 1, 2, 2, 2),
  sphere: () => new THREE.SphereGeometry(0.6, 48, 24),
  icosphere: () => new THREE.IcosahedronGeometry(0.6, 3),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1.2, 48),
  cone: () => new THREE.ConeGeometry(0.55, 1.2, 48),
  torus: () => new THREE.TorusGeometry(0.5, 0.18, 24, 64),
  torusknot: () => new THREE.TorusKnotGeometry(0.45, 0.15, 160, 24),
  plane: () => new THREE.PlaneGeometry(2, 2, 8, 8).rotateX(-Math.PI / 2),
  capsule: () => new THREE.CapsuleGeometry(0.35, 0.7, 12, 32),
  ring: () => new THREE.RingGeometry(0.3, 0.6, 64).rotateX(-Math.PI / 2),
};
export const PRIMITIVES = Object.keys(GEOS);

const NAMES = {
  cube: 'Cubo', sphere: 'Esfera', icosphere: 'Icoesfera', cylinder: 'Cilindro', cone: 'Cone',
  torus: 'Toro', torusknot: 'Nó', plane: 'Plano', capsule: 'Cápsula', ring: 'Anel',
};

export function makeMaterial(color = '#c9ccd3') {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0.0, side: THREE.FrontSide });
}

function uniqueName(base) {
  const names = new Set(); content.traverse((o) => names.add(o.name));
  if (!names.has(base)) return base;
  let i = 1; while (names.has(`${base}.${String(i).padStart(3, '0')}`)) i++;
  return `${base}.${String(i).padStart(3, '0')}`;
}

function finish(obj, { name, position, rotation, scale } = {}, kind) {
  obj.name = uniqueName(name || obj.name || 'Objeto');
  obj.userData.id = nextId(kind);
  obj.userData.kind = kind;
  if (position) obj.position.fromArray(position);
  if (rotation) obj.rotation.set(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG);
  if (scale) obj.scale.fromArray(scale);
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

export function createPrimitive(type = 'cube', opts = {}) {
  const geo = (GEOS[type] || GEOS.cube)();
  const mesh = new THREE.Mesh(geo, makeMaterial(opts.color));
  mesh.userData.primitive = type;
  if (type === 'cube' && !opts.position) mesh.position.y = 0.5;
  return finish(mesh, { name: NAMES[type], ...opts }, 'mesh');
}

export function createText(text = 'Orbe', opts = {}) {
  const size = opts.size ?? 0.5;
  const tg = new TextGeometry(text, {
    font, size, depth: opts.depth ?? size * 0.25, curveSegments: 8,
    bevelEnabled: true, bevelThickness: size * 0.03, bevelSize: size * 0.02, bevelSegments: 3,
  });
  tg.center();
  // Converte para BufferGeometry simples → serializa sem depender da fonte.
  const geo = new THREE.BufferGeometry().copy(tg); tg.dispose();
  const mat = makeMaterial(opts.color || '#f2f2f0');
  if (opts.emissive) { mat.emissive.set(opts.color || '#ffffff'); mat.emissiveIntensity = opts.emissive; }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.text = { value: text, size, depth: opts.depth };
  if (!opts.position) mesh.position.y = size;
  return finish(mesh, { name: 'Texto', ...opts }, 'text');
}

// Luzes e câmeras recebem um "proxy" visível para seleção no viewport.
function proxy(color, geo) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.85 }));
  m.userData.proxy = true; m.castShadow = false; m.receiveShadow = false;
  return m;
}

export function createLight(type = 'point', opts = {}) {
  const color = opts.color || '#ffffff';
  let light;
  switch (type) {
    case 'spot': light = new THREE.SpotLight(color, opts.intensity ?? 40, 0, Math.PI / 6, 0.4); break;
    case 'directional': light = new THREE.DirectionalLight(color, opts.intensity ?? 2.5); break;
    case 'area': light = new THREE.RectAreaLight(color, opts.intensity ?? 6, 2, 2); break;
    case 'hemisphere': light = new THREE.HemisphereLight(color, '#2a2c33', opts.intensity ?? 1); break;
    default: light = new THREE.PointLight(color, opts.intensity ?? 30, 0, 2);
  }
  if (light.castShadow !== undefined && type !== 'hemisphere' && type !== 'area') {
    light.castShadow = true; light.shadow.mapSize.set(1024, 1024); light.shadow.bias = -0.0005;
  }
  light.userData.lightType = type;
  light.add(proxy('#ffd27a', new THREE.IcosahedronGeometry(0.12, 1)));
  if (!opts.position) light.position.set(3, 4, 2);
  if (type === 'spot' || type === 'directional' || type === 'area') {
    light.lookAt?.(0, 0, 0);
    if (light.target) { light.target.position.set(0, 0, 0); }
  }
  return finish(light, { name: { point: 'Luz', spot: 'Spot', directional: 'Sol', area: 'Luz de Área', hemisphere: 'Hemisfério' }[type], ...opts }, 'light');
}

export function createCamera(opts = {}) {
  const cam = new THREE.PerspectiveCamera(opts.fov ?? 40, 16 / 9, 0.05, 500);
  const body = proxy('#9fb4ff', new THREE.ConeGeometry(0.18, 0.3, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4));
  body.position.z = 0.15; cam.add(body);
  cam.position.fromArray(opts.position || [6, 4, 6]);
  cam.lookAt(new THREE.Vector3().fromArray(opts.look_at || [0, 0.5, 0]));
  const o = finish(cam, { name: 'Câmera', ...opts, position: undefined, rotation: undefined }, 'camera');
  return o;
}

export function addToScene(obj, select = true) {
  content.add(obj);
  bus.emit('scene:changed');
  if (select) bus.emit('request:select', obj);
  return obj;
}

export function findTarget(t) {
  if (!t) return null;
  if (typeof t === 'object') return t;
  let found = null;
  content.traverse((o) => { if (!found && (o.userData.id === t || o.name === t)) found = o; });
  if (!found) { // tolerante: case-insensitive / prefixo
    const low = String(t).toLowerCase();
    content.traverse((o) => { if (!found && o.name.toLowerCase().startsWith(low)) found = o; });
  }
  return found;
}

export function topLevel(obj) {
  let o = obj;
  while (o && o.parent && o.parent !== content) o = o.parent;
  return o && o.parent === content ? o : null;
}

export function describe(o) {
  const r = (v) => +v.toFixed(3);
  return {
    id: o.userData.id, name: o.name, kind: o.userData.kind || o.type,
    position: o.position.toArray().map(r),
    rotation: [o.rotation.x, o.rotation.y, o.rotation.z].map((v) => r(v / DEG)),
    scale: o.scale.toArray().map(r),
  };
}
export { DEG };
