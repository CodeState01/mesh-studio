// Loja: modelos, materiais, texturas, VFX, SFX (locais e grátis) + Comunidade Poly Haven (CC0).
// Cada item mostra uma miniatura real do que ele é ou faz.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MODELS, MATERIALS, TEXTURES, VFX_TYPES, SFX_PRESETS, VFX_INFO, SFX_INFO, TEXTURE_INFO, applyMaterialPreset, materialSphere, textureSphere } from './catalog.js';
import { thumb } from './thumbs.js';
import { content, addToScene } from '../core/objects.js';
import { state, bus, nextId } from '../core/state.js';
import { history } from '../core/history.js';
import { scene } from '../core/viewport.js';
import { applyTexture } from '../fx/textures.js';
import { createVFX } from '../fx/vfx.js';
import { playSFX } from '../fx/audio.js';
import { addSFX } from '../anim/timeline.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';

const CATS = [
  ['all', 'Tudo', 'layers'], ['models', 'Modelos', 'cube'], ['materials', 'Materiais', 'sun'], ['textures', 'Texturas', 'texture'],
  ['vfx', 'VFX', 'spark'], ['sfx', 'SFX', 'wave'], ['ph-models', 'Comunidade · Modelos', 'globe'], ['ph-textures', 'Comunidade · Texturas', 'globe'], ['ph-hdris', 'Comunidade · Céus HDRI', 'globe'],
];
let cat = 'all', query = '';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function addWithUndo(obj, label) {
  addToScene(obj);
  history.push({ label, undo: () => { content.remove(obj); bus.emit('scene:changed'); }, redo: () => { content.add(obj); bus.emit('scene:changed'); } });
  toast(`${obj.name} adicionado à cena`);
}
const needMesh = () => { const o = state.selected; if (!o || (!o.isMesh && !o.isGroup)) { toast('Selecione um objeto na cena primeiro'); return null; } return o; };

// ---------- Itens locais ----------
function localItems() {
  const items = [];
  for (const m of MODELS) items.push({ cat: 'models', key: 'm:' + m.id, name: m.name, desc: m.desc, tags: m.tags, type: 'Modelo', action: 'Adicionar',
    thumb: () => thumb('m:' + m.id, 'object', m.make), run: () => { const g = m.make(); g.name = m.name; g.userData = { id: nextId('mesh'), kind: 'import' }; addWithUndo(g, 'Loja: ' + m.name); } });
  for (const m of MATERIALS) items.push({ cat: 'materials', key: 'mat:' + m.id, name: m.name, desc: m.desc, type: 'Material', action: 'Aplicar',
    thumb: () => thumb('mat:' + m.id, 'object', () => materialSphere(m.props)), run: () => { const o = needMesh(); if (o) { applyMaterialPreset(o, m.props); bus.emit('material:changed', o); toast(`${m.name} aplicado`); } } });
  for (const t of TEXTURES.filter((t) => t !== 'none')) items.push({ cat: 'textures', key: 't:' + t, name: TEXTURE_INFO[t], desc: 'Textura procedural com relevo', type: 'Textura', action: 'Aplicar',
    thumb: () => thumb('t:' + t, 'object', () => textureSphere(t)), run: () => { const o = needMesh(); if (o) { o.traverse((x) => x.isMesh && applyTexture(x, t, 2)); toast(`Textura ${TEXTURE_INFO[t]} aplicada`); } } });
  for (const v of VFX_TYPES) items.push({ cat: 'vfx', key: 'v:' + v, name: VFX_INFO[v][0], desc: VFX_INFO[v][1], type: 'VFX', action: 'Adicionar',
    thumb: () => thumb('v:' + v, 'vfx', () => createVFX(v, { offline: true })), run: () => addWithUndo(createVFX(v, { position: [0, 0, 0] }), 'VFX') });
  for (const s of SFX_PRESETS) items.push({ cat: 'sfx', key: 's:' + s, name: SFX_INFO[s][0], desc: SFX_INFO[s][1], type: 'SFX', action: 'Usar', listen: () => playSFX(s),
    thumb: () => thumb('s:' + s, 'sfx', () => s), run: () => { addSFX(s, state.time); playSFX(s); toast(`SFX ${SFX_INFO[s][0]} em ${state.time.toFixed(2)}s`); } });
  return items;
}

// ---------- Poly Haven (CC0, gratuito) ----------
const ph = { models: null, textures: null, hdris: null };
async function phList(type) {
  if (ph[type]) return ph[type];
  const r = await fetch(`https://api.polyhaven.com/assets?t=${type}`); const j = await r.json();
  ph[type] = Object.entries(j).map(([id, a]) => ({ id, ...a })).sort((a, b) => (b.download_count || 0) - (a.download_count || 0));
  return ph[type];
}
async function phFiles(id) { return (await fetch(`https://api.polyhaven.com/files/${id}`)).json(); }

async function phImportModel(a) {
  toast(`Baixando ${a.name}…`);
  const f = await phFiles(a.id); const url = f.gltf?.['1k']?.gltf?.url || f.gltf?.['2k']?.gltf?.url;
  if (!url) throw new Error('Modelo sem glTF disponível');
  const obj = (await new GLTFLoader().loadAsync(url)).scene;
  const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3()).length();
  if (size > 6 || size < 0.3) obj.scale.multiplyScalar(2.5 / size);
  const b2 = new THREE.Box3().setFromObject(obj); obj.position.y -= b2.min.y;
  obj.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  obj.name = a.name; obj.userData = { id: nextId('ph'), kind: 'import', source: 'Poly Haven (CC0)' };
  addWithUndo(obj, 'Poly Haven');
}
async function phApplyTexture(a) {
  const o = needMesh(); if (!o) return;
  toast(`Baixando ${a.name}…`);
  const f = await phFiles(a.id); const L = new THREE.TextureLoader();
  const get = (k) => f[k]?.['1k']?.jpg?.url || f[k]?.['1k']?.png?.url;
  const [map, nor, rough] = await Promise.all([get('Diffuse'), get('nor_gl'), get('Rough')].map((u) => (u ? L.loadAsync(u) : null)));
  for (const t of [map, nor, rough]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); }
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  o.traverse((m) => { if (!m.isMesh) return; const mat = m.material.clone(); mat.map = map; mat.normalMap = nor; mat.roughnessMap = rough; mat.color.set('#ffffff'); mat.needsUpdate = true; m.material = mat; m.userData.texture = { name: a.name, scale: 2 }; });
  toast(`${a.name} aplicada`);
}
async function phApplyHDRI(a) {
  toast(`Baixando céu ${a.name}…`);
  const f = await phFiles(a.id); const url = f.hdri?.['1k']?.hdr?.url; if (!url) throw new Error('HDRI indisponível');
  const tex = await new HDRLoader().loadAsync(url); tex.mapping = THREE.EquirectangularReflectionMapping;
  const prev = { bg: scene.background, env: scene.environment };
  scene.background = tex; scene.environment = tex;
  history.push({ label: 'Céu HDRI', undo: () => { scene.background = prev.bg; scene.environment = prev.env; }, redo: () => { scene.background = tex; scene.environment = tex; } });
  toast(`Céu ${a.name} aplicado`);
}

async function communityItems(kind) {
  const list = await phList(kind);
  return list.slice(0, 400).map((a) => ({
    cat: 'ph-' + kind, key: 'ph:' + a.id, name: a.name, desc: (a.categories || []).slice(0, 3).join(' · '), tags: (a.tags || []).join(' '),
    type: kind === 'models' ? 'Modelo CC0' : kind === 'textures' ? 'Textura CC0' : 'HDRI CC0',
    action: kind === 'models' ? 'Baixar' : 'Aplicar', img: a.thumbnail_url || `https://cdn.polyhaven.com/asset_img/thumbs/${a.id}.png?width=256&height=256`,
    run: () => (kind === 'models' ? phImportModel(a) : kind === 'textures' ? phApplyTexture(a) : phApplyHDRI(a)),
  }));
}

// ---------- Interface ----------
export function renderStore(el) {
  el.innerHTML = `<div class="page-wrap store">
    <header class="page-head"><div><h1>Loja</h1><p>Modelos, materiais, texturas, efeitos e sons — todos gratuitos. A aba Comunidade traz centenas de assets CC0 do Poly Haven.</p></div>
      <label class="search">${icon('search', 16)}<input id="st-q" placeholder="Buscar na loja…" value="${esc(query)}"></label></header>
    <div class="store-body"><nav class="store-cats" id="st-cats">${CATS.map(([id, n, ic]) => `<button data-c="${id}" class="${id === cat ? 'on' : ''}">${icon(ic, 16)}<span>${n}</span></button>`).join('')}</nav>
    <div class="store-grid" id="st-grid"></div></div></div>`;
  const q = el.querySelector('#st-q'); q.onkeydown = (e) => e.stopPropagation();
  q.oninput = () => { query = q.value.toLowerCase(); draw(el); };
  el.querySelector('#st-cats').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; el.querySelectorAll('#st-cats button').forEach((x) => x.classList.toggle('on', x === b)); draw(el); };
  draw(el);
}

let drawSeq = 0;
async function draw(el) {
  const grid = el.querySelector('#st-grid'); const seq = ++drawSeq;
  let items;
  if (cat.startsWith('ph-')) {
    grid.innerHTML = `<div class="empty">Carregando a biblioteca do Poly Haven…</div>`;
    try { items = await communityItems(cat.slice(3)); } catch { grid.innerHTML = `<div class="empty">Sem conexão com o Poly Haven. Verifique a internet.</div>`; return; }
  } else items = localItems().filter((i) => cat === 'all' || i.cat === cat);
  if (seq !== drawSeq) return;
  if (query) items = items.filter((i) => `${i.name} ${i.desc} ${i.tags || ''} ${i.type}`.toLowerCase().includes(query));
  if (!items.length) { grid.innerHTML = `<div class="empty">Nada encontrado para “${esc(query)}”.</div>`; return; }
  grid.innerHTML = items.map((i, n) => `<article class="card" data-k="${n}" style="animation-delay:${Math.min(n, 24) * 18}ms">
      <div class="card-img ${i.img ? '' : 'loading'}">${i.img ? `<img loading="lazy" src="${i.img}" alt="">` : ''}<span class="tag">${i.type}</span>
        ${i.listen ? `<button class="listen" data-l="${n}" title="Ouvir">${icon('play', 16)}</button>` : ''}</div>
      <div class="card-b"><b>${esc(i.name)}</b><span>${esc(i.desc || '')}</span></div>
      <div class="card-f"><span class="free">Grátis</span><button class="btn sm primary" data-r="${n}">${i.action}</button></div></article>`).join('');
  grid.onclick = async (e) => {
    const l = e.target.closest('[data-l]'); if (l) { items[+l.dataset.l].listen(); return; }
    const r = e.target.closest('[data-r]'); if (!r) return;
    r.disabled = true; try { await items[+r.dataset.r].run(); } catch (err) { toast(err.message, { kind: 'error' }); } r.disabled = false;
  };
  // Miniaturas locais: só renderiza o que aparece na tela.
  const io = new IntersectionObserver((ents) => ents.forEach(async (en) => {
    if (!en.isIntersecting) return; io.unobserve(en.target);
    const it = items[+en.target.dataset.k]; if (!it.thumb) return;
    const url = await it.thumb(); const box = en.target.querySelector('.card-img');
    if (url && box) { box.insertAdjacentHTML('afterbegin', `<img src="${url}" alt="">`); box.classList.remove('loading'); }
  }), { root: grid });
  grid.querySelectorAll('.card').forEach((c) => io.observe(c));
}
