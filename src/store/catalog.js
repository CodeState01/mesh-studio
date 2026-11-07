// Catálogo local da Loja: modelos procedurais originais, materiais prontos,
// texturas, VFX e SFX. Tudo gerado em código — sem downloads, sem licença de terceiros.
import * as THREE from 'three';
import { makeMaterial } from '../core/objects.js';
import { proceduralTexture, normalFromTexture, TEXTURES } from '../fx/textures.js';
import { VFX_TYPES } from '../fx/vfx.js';
import { SFX_PRESETS } from '../fx/audio.js';

const M = (color, o = {}) => Object.assign(makeMaterial(color), o);
function part(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale) {
  const m = new THREE.Mesh(geo, mat); m.position.fromArray(pos); m.rotation.set(...rot);
  if (scale) m.scale.fromArray(scale); m.castShadow = m.receiveShadow = true; return m;
}
const G = (...parts) => { const g = new THREE.Group(); parts.flat().forEach((p) => g.add(p)); return g; };
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s);
const lathe = (pts, s = 48) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), s);

// Pedra "orgânica": icosfera com ruído determinístico nos vértices.
function rockGeo(seed = 1, r = 0.6) {
  const g = new THREE.IcosahedronGeometry(r, 3); const p = g.attributes.position; const v = new THREE.Vector3();
  const h = (x) => { const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453; return s - Math.floor(s); };
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const k = v.toArray().map((n) => n.toFixed(3)).join();
    if (!map.has(k)) map.set(k, 0.75 + h(v.x * 3 + v.y * 5 + v.z * 7) * 0.4);
    v.multiplyScalar(map.get(k)); v.y *= 0.7; p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}

export const MODELS = [
  { id: 'chair', name: 'Cadeira', desc: 'Cadeira de madeira simples', tags: 'móvel interior', make: () => {
    const w = M('#a0673c', { roughness: 0.6 });
    return G(part(box(0.9, 0.08, 0.9), w, [0, 0.9, 0]), part(box(0.9, 0.9, 0.08), w, [0, 1.35, -0.41]),
      [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].map(([x, z]) => part(box(0.08, 0.9, 0.08), w, [x, 0.45, z])));
  } },
  { id: 'table', name: 'Mesa', desc: 'Mesa com tampo arredondado', tags: 'móvel interior', make: () => {
    const w = M('#c49a6c', { roughness: 0.5 });
    return G(part(cyl(1, 1, 0.08, 48), w, [0, 1.1, 0]), part(cyl(0.08, 0.12, 1.1), M('#2a2b30', { metalness: 0.8, roughness: 0.3 }), [0, 0.55, 0]), part(cyl(0.5, 0.55, 0.06, 32), M('#2a2b30', { metalness: 0.8, roughness: 0.3 }), [0, 0.03, 0]));
  } },
  { id: 'tree', name: 'Árvore', desc: 'Árvore low-poly estilizada', tags: 'natureza', make: () =>
    G(part(cyl(0.12, 0.18, 1.2, 8), M('#6b4a2f'), [0, 0.6, 0]), part(new THREE.IcosahedronGeometry(0.75, 1), M('#5c9a4a', { flatShading: true }), [0, 1.6, 0]), part(new THREE.IcosahedronGeometry(0.5, 1), M('#6fae55', { flatShading: true }), [0.35, 2.05, 0.1])) },
  { id: 'pine', name: 'Pinheiro', desc: 'Pinheiro em camadas', tags: 'natureza', make: () =>
    G(part(cyl(0.1, 0.14, 0.6, 8), M('#5d3f28'), [0, 0.3, 0]), [0, 1, 2].map((i) => part(new THREE.ConeGeometry(0.8 - i * 0.2, 0.9, 8), M('#2f6b45', { flatShading: true }), [0, 0.85 + i * 0.5, 0]))) },
  { id: 'rock', name: 'Pedra', desc: 'Rocha orgânica irregular', tags: 'natureza cenário', make: () => G(part(rockGeo(3), M('#8a8780', { flatShading: true, roughness: 0.95 }), [0, 0.35, 0])) },
  { id: 'house', name: 'Casinha', desc: 'Casa com telhado e porta', tags: 'arquitetura', make: () =>
    G(part(box(1.6, 1.1, 1.3), M('#e9e1d3'), [0, 0.55, 0]), part(new THREE.ConeGeometry(1.25, 0.8, 4), M('#b4533a', { flatShading: true }), [0, 1.5, 0], [0, Math.PI / 4, 0]),
      part(box(0.35, 0.6, 0.05), M('#6b4a2f'), [0, 0.3, 0.66]), part(box(0.3, 0.3, 0.05), M('#9fd2ff', { metalness: 0.2, roughness: 0.1 }), [0.5, 0.65, 0.66])) },
  { id: 'rocket', name: 'Foguete', desc: 'Foguete de brinquedo', tags: 'ficção veículo', make: () =>
    G(part(lathe([[0, 0], [0.32, 0.05], [0.36, 0.8], [0.3, 1.4], [0.12, 1.85], [0, 2]]), M('#eeeeee', { roughness: 0.3 }), [0, 0.3, 0]),
      [0, 1, 2].map((i) => part(box(0.05, 0.5, 0.35), M('#e2703f'), [Math.cos(i * 2.094) * 0.36, 0.5, Math.sin(i * 2.094) * 0.36], [0, -i * 2.094, 0])),
      part(new THREE.TorusGeometry(0.33, 0.04, 8, 32), M('#2a2b30', { metalness: 0.8 }), [0, 1.1, 0], [Math.PI / 2, 0, 0])) },
  { id: 'crystal', name: 'Cristal', desc: 'Aglomerado de cristais', tags: 'fantasia mineral', make: () =>
    G([[0, 0, 0, 1.1], [0.3, 0.2, -0.4, 0.7], [-0.3, -0.25, 0.3, 0.8], [0.15, 0.4, 0.3, 0.5]].map(([x, rz, rx, h]) =>
      part(new THREE.OctahedronGeometry(0.25, 0), M('#8fd3ff', { transmission: 0.6, roughness: 0.05, thickness: 0.5, flatShading: true }), [x, h * 0.45, 0], [rx, 0, rz], [1, h * 2.4, 1]))) },
  { id: 'lamp', name: 'Luminária', desc: 'Luminária de mesa articulada', tags: 'interior', make: () => {
    const k = M('#2a2b30', { metalness: 0.7, roughness: 0.35 });
    return G(part(cyl(0.35, 0.4, 0.08), k, [0, 0.04, 0]), part(cyl(0.03, 0.03, 0.9), k, [0.15, 0.48, 0], [0, 0, -0.35]), part(cyl(0.03, 0.03, 0.7), k, [0.2, 1.1, 0], [0, 0, 0.9]),
      part(new THREE.ConeGeometry(0.25, 0.35, 24, 1, true), M('#e2703f', { side: THREE.DoubleSide }), [-0.12, 1.15, 0], [0, 0, 2.2]), part(new THREE.SphereGeometry(0.08), M('#fff4d6', { emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 2 }), [-0.08, 1.1, 0]));
  } },
  { id: 'mug', name: 'Caneca', desc: 'Caneca de cerâmica com alça', tags: 'cozinha objeto', make: () =>
    G(part(lathe([[0, 0], [0.35, 0], [0.37, 0.05], [0.37, 0.8], [0.33, 0.8], [0.33, 0.06], [0, 0.06]]), M('#2d6a8f', { roughness: 0.25, side: THREE.DoubleSide })), part(new THREE.TorusGeometry(0.2, 0.05, 12, 24, Math.PI), M('#2d6a8f', { roughness: 0.25 }), [0.37, 0.4, 0], [0, 0, -Math.PI / 2])) },
  { id: 'plant', name: 'Vaso com planta', desc: 'Vaso de cerâmica e folhagem', tags: 'interior natureza', make: () =>
    G(part(lathe([[0, 0], [0.3, 0], [0.42, 0.6], [0.45, 0.62], [0, 0.62]]), M('#c8643c', { roughness: 0.8 })),
      Array.from({ length: 9 }, (_, i) => part(new THREE.SphereGeometry(0.22, 12, 8), M('#4f8f4a', { flatShading: true }), [Math.cos(i * 0.7) * 0.22 * (i % 3), 0.85 + (i % 4) * 0.15, Math.sin(i * 0.7) * 0.22 * (i % 3)], [0, 0, 0], [1, 1.6, 0.5]))) },
  { id: 'mushroom', name: 'Cogumelo', desc: 'Cogumelo de conto de fadas', tags: 'fantasia natureza', make: () =>
    G(part(cyl(0.12, 0.17, 0.6, 16), M('#f1e6d2'), [0, 0.3, 0]), part(new THREE.SphereGeometry(0.45, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M('#c8372d', { roughness: 0.4 }), [0, 0.55, 0]),
      [[0.2, 0.85, 0.2], [-0.25, 0.8, 0.05], [0.05, 0.9, -0.25]].map((p) => part(new THREE.SphereGeometry(0.06), M('#ffffff'), p))) },
  { id: 'car', name: 'Carrinho', desc: 'Carro low-poly', tags: 'veículo', make: () => {
    const wheels = [[-0.55, 0.4], [0.55, 0.4], [-0.55, -0.4], [0.55, -0.4]].map(([x, z]) => part(cyl(0.18, 0.18, 0.12, 20), M('#1c1d21'), [x, 0.18, z], [Math.PI / 2, 0, 0]));
    return G(part(box(1.6, 0.35, 0.8), M('#e2703f', { metalness: 0.4, roughness: 0.35 }), [0, 0.38, 0]), part(box(0.8, 0.3, 0.7), M('#9fd2ff', { metalness: 0.3, roughness: 0.1 }), [-0.1, 0.7, 0]), wheels);
  } },
  { id: 'cloud', name: 'Nuvem', desc: 'Nuvem fofa estilizada', tags: 'céu cenário', make: () =>
    G([[0, 0, 0, 0.5], [0.5, -0.05, 0, 0.38], [-0.5, -0.08, 0, 0.36], [0.2, 0.25, 0.1, 0.35]].map(([x, y, z, r]) => part(new THREE.SphereGeometry(r, 24, 16), M('#f5f7fb', { roughness: 0.9 }), [x, 1 + y, z]))) },
  { id: 'tower', name: 'Torre', desc: 'Torre de castelo com ameias', tags: 'arquitetura fantasia', make: () => {
    const s = M('#b9b4aa', { roughness: 0.9 });
    return G(part(cyl(0.5, 0.6, 2, 24), s, [0, 1, 0]), part(cyl(0.65, 0.65, 0.2, 24), s, [0, 2.1, 0]),
      Array.from({ length: 8 }, (_, i) => part(box(0.18, 0.2, 0.18), s, [Math.cos(i * 0.785) * 0.56, 2.3, Math.sin(i * 0.785) * 0.56])), part(new THREE.ConeGeometry(0.5, 0.8, 24), M('#3d5a8f'), [0, 2.75, 0]));
  } },
  { id: 'barrel', name: 'Barril', desc: 'Barril de madeira com aros', tags: 'objeto cenário', make: () =>
    G(part(lathe([[0, 0], [0.38, 0], [0.45, 0.45], [0.38, 0.9], [0, 0.9]]), M('#8a5a34', { roughness: 0.7 })), [0.12, 0.45, 0.78].map((y) => part(new THREE.TorusGeometry(y === 0.45 ? 0.455 : 0.405, 0.025, 8, 40), M('#3a3b40', { metalness: 0.8 }), [0, y, 0], [Math.PI / 2, 0, 0]))) },
  { id: 'trophy', name: 'Troféu', desc: 'Taça dourada de premiação', tags: 'objeto prêmio', make: () =>
    G(part(lathe([[0, 0], [0.4, 0], [0.4, 0.15], [0.12, 0.2], [0.08, 0.6], [0.15, 0.7], [0.4, 1.0], [0.42, 1.25], [0.38, 1.25], [0, 0.85]]), M('#d9a441', { metalness: 1, roughness: 0.2, side: THREE.DoubleSide }))) },
  { id: 'arch', name: 'Arco', desc: 'Arco de pedra para cenários', tags: 'arquitetura cenário', make: () => {
    const s = M('#a49c8d', { roughness: 0.95 });
    return G(part(box(0.4, 1.4, 0.4), s, [-0.8, 0.7, 0]), part(box(0.4, 1.4, 0.4), s, [0.8, 0.7, 0]), part(new THREE.TorusGeometry(0.8, 0.2, 8, 24, Math.PI), s, [0, 1.4, 0]));
  } },
];

export const MATERIALS = [
  { id: 'gold', name: 'Ouro', desc: 'Metal polido dourado', props: { color: '#d9a441', metalness: 1, roughness: 0.18 } },
  { id: 'chrome', name: 'Cromo', desc: 'Espelhado', props: { color: '#e8e8ea', metalness: 1, roughness: 0.04 } },
  { id: 'copper', name: 'Cobre', desc: 'Metal acobreado', props: { color: '#c46a3f', metalness: 1, roughness: 0.3 } },
  { id: 'glass', name: 'Vidro', desc: 'Transparente com refração', props: { color: '#ffffff', metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.6 } },
  { id: 'plastic', name: 'Plástico', desc: 'Brilhante e colorido', props: { color: '#2f7de1', metalness: 0, roughness: 0.25, clearcoat: 0.6 } },
  { id: 'rubber', name: 'Borracha', desc: 'Fosco e escuro', props: { color: '#202124', metalness: 0, roughness: 0.95 } },
  { id: 'neon', name: 'Neon', desc: 'Emite luz própria', props: { color: '#ff3dbe', emissive: '#ff3dbe', emissiveIntensity: 2.2, roughness: 0.4 } },
  { id: 'ceramic', name: 'Cerâmica', desc: 'Branco esmaltado', props: { color: '#f2efe9', metalness: 0, roughness: 0.12, clearcoat: 1 } },
  { id: 'clay', name: 'Argila', desc: 'Massinha de modelar', props: { color: '#c97b56', metalness: 0, roughness: 0.75 } },
  { id: 'carpaint', name: 'Pintura automotiva', desc: 'Metálico com verniz', props: { color: '#8f1d22', metalness: 0.6, roughness: 0.35, clearcoat: 1 } },
];

export function applyMaterialPreset(mesh, props) {
  mesh.traverse((o) => {
    if (!o.isMesh || !o.material?.color) return;
    const m = o.material.clone();
    for (const [k, v] of Object.entries(props)) {
      if (k === 'color' || k === 'emissive') m[k].set(v); else if (k in m) m[k] = v;
    }
    m.needsUpdate = true; o.material = m;
  });
}

export const materialSphere = (props) => {
  const m = makeMaterial();
  for (const [k, v] of Object.entries(props)) { if (k === 'color' || k === 'emissive') m[k].set(v); else m[k] = v; }
  return G(part(new THREE.SphereGeometry(0.6, 48, 32), m, [0, 0.6, 0]));
};

export const textureSphere = (name) => {
  const m = makeMaterial('#ffffff'); m.map = proceduralTexture(name, 2); m.normalMap = normalFromTexture(m.map, 2);
  return G(part(new THREE.SphereGeometry(0.6, 48, 32), m, [0, 0.6, 0]));
};

export const VFX_INFO = {
  fire: ['Fogo', 'Chamas subindo com brasas'], smoke: ['Fumaça', 'Nuvem densa e lenta'], sparks: ['Faíscas', 'Explosão de fagulhas com gravidade'],
  snow: ['Neve', 'Flocos caindo numa área'], magic: ['Magia', 'Espiral brilhante'], rain: ['Chuva', 'Gotas rápidas'],
  confetti: ['Confete', 'Celebração colorida'], dust: ['Poeira', 'Partículas flutuando no ar'],
};
export const SFX_INFO = {
  whoosh: ['Whoosh', 'Passagem rápida — ótimo para transições'], impact: ['Impacto', 'Batida grave'], click: ['Clique', 'Clique de interface'],
  rise: ['Subida', 'Tensão que cresce (riser)'], pop: ['Pop', 'Bolha / aparecer'], beep: ['Bipe', 'Sinal curto'],
  boom: ['Explosão', 'Estrondo com cauda longa'], shimmer: ['Brilho', 'Cintilar mágico'], glitch: ['Glitch', 'Ruído digital picotado'],
};
export const TEXTURE_INFO = {
  checker: 'Xadrez', grid: 'Grade', noise: 'Ruído', marble: 'Mármore', wood: 'Madeira', bricks: 'Tijolos',
  brushed: 'Metal escovado', uv: 'Teste de UV', camo: 'Camuflagem', tiles: 'Azulejos',
};
export { TEXTURES, VFX_TYPES, SFX_PRESETS };
