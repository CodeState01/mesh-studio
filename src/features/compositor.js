// Compositor (como os nós de Composição do Blender, em forma de pilha): efeitos de pós-processamento
// aplicados ao viewport nos modos Material/Render e na imagem renderizada. Fica salvo no projeto (env.post).
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { composer, scene, camera, outlinePass, getRenderCamera, renderer } from '../core/viewport.js';
import { state, bus } from '../core/state.js';
import { icon } from '../ui/icons.js';

const shader = (uniforms, body) => ({ uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, ...uniforms }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }', fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv; ${Object.keys(uniforms).map((k) => `uniform ${typeof uniforms[k].value === 'number' ? 'float' : 'vec3'} ${k};`).join(' ')} void main(){ ${body} }` });

export const EFFECTS = {
  color: { label: 'Balanço de cor', icon: 'Palette', params: { lift: [0, -0.3, 0.3, 0.01], gamma: [1, 0.3, 2.5, 0.01], gain: [1, 0, 2.5, 0.01], saturation: [1, 0, 2, 0.01], contrast: [1, 0.5, 1.8, 0.01] },
    make: () => new ShaderPass(shader({ lift: { value: 0 }, gamma: { value: 1 }, gain: { value: 1 }, saturation: { value: 1 }, contrast: { value: 1 } }, `vec4 c = texture2D(tDiffuse, vUv); vec3 x = c.rgb * gain + lift; x = pow(max(x, 0.), vec3(1. / gamma)); x = (x - .5) * contrast + .5; float l = dot(x, vec3(.2126,.7152,.0722)); x = mix(vec3(l), x, saturation); gl_FragColor = vec4(x, c.a);`)) },
  vignette: { label: 'Vinheta', icon: 'Circle', params: { amount: [0.5, 0, 1.5, 0.01], softness: [0.6, 0.05, 1.5, 0.01] },
    make: () => new ShaderPass(shader({ amount: { value: 0.5 }, softness: { value: 0.6 } }, `vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(.5)) * 1.414; c.rgb *= 1. - amount * smoothstep(1. - softness, 1.2, d); gl_FragColor = c;`)) },
  chroma: { label: 'Aberração cromática', icon: 'Rainbow', params: { amount: [0.004, 0, 0.03, 0.0005] },
    make: () => new ShaderPass(shader({ amount: { value: 0.004 } }, `vec2 d = (vUv - .5) * amount; gl_FragColor = vec4(texture2D(tDiffuse, vUv + d).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d).b, 1.);`)) },
  grain: { label: 'Grão de filme', icon: 'Sparkles', params: { amount: [0.08, 0, 0.5, 0.005] },
    make: () => new ShaderPass(shader({ amount: { value: 0.08 } }, `vec4 c = texture2D(tDiffuse, vUv); float n = fract(sin(dot(vUv * (uTime + 1.), vec2(12.9898, 78.233))) * 43758.5453); c.rgb += (n - .5) * amount; gl_FragColor = c;`)) },
  lens: { label: 'Distorção de lente', icon: 'ScanEye', params: { amount: [0.12, -0.6, 0.6, 0.01] },
    make: () => new ShaderPass(shader({ amount: { value: 0.12 } }, `vec2 p = vUv - .5; float r2 = dot(p, p); vec2 q = p * (1. + amount * r2) + .5; gl_FragColor = (q.x < 0. || q.y < 0. || q.x > 1. || q.y > 1.) ? vec4(0., 0., 0., 1.) : texture2D(tDiffuse, q);`)) },
  sharpen: { label: 'Nitidez', icon: 'Diamond', params: { amount: [0.5, 0, 2, 0.01] },
    make: () => { const p = new ShaderPass(shader({ amount: { value: 0.5 }, texel: { value: new THREE.Vector3(1 / 1024, 1 / 1024, 0) } }, `vec3 t = texel; vec4 c = texture2D(tDiffuse, vUv); vec4 s = texture2D(tDiffuse, vUv + vec2(t.x, 0.)) + texture2D(tDiffuse, vUv - vec2(t.x, 0.)) + texture2D(tDiffuse, vUv + vec2(0., t.y)) + texture2D(tDiffuse, vUv - vec2(0., t.y)); gl_FragColor = vec4(c.rgb + (c.rgb * 4. - s.rgb) * amount, c.a);`)); p.__texel = true; return p; } },
  pixelate: { label: 'Pixelado', icon: 'Grid2x2', params: { size: [6, 1, 64, 1] },
    make: () => { const p = new ShaderPass(shader({ size: { value: 6 }, texel: { value: new THREE.Vector3(1 / 1024, 1 / 1024, 0) } }, `vec2 px = texel.xy * size; gl_FragColor = texture2D(tDiffuse, (floor(vUv / px) + .5) * px);`)); p.__texel = true; return p; } },
  dof: { label: 'Profundidade de campo', icon: 'Focus', params: { focus: [8, 0.1, 100, 0.1], aperture: [0.002, 0.0001, 0.02, 0.0001], maxblur: [0.01, 0, 0.03, 0.001] },
    make: () => new BokehPass(scene, camera, { focus: 8, aperture: 0.002, maxblur: 0.01 }) },
  ao: { label: 'Oclusão de ambiente', icon: 'Contrast', params: { radius: [0.4, 0.05, 3, 0.01], intensity: [1, 0, 3, 0.01] },
    make: () => { const p = new GTAOPass(scene, camera, 512, 512); p.output = GTAOPass.OUTPUT.Default; return p; } },
};
const ORDER = ['ao', 'dof', 'lens', 'chroma', 'color', 'sharpen', 'pixelate', 'vignette', 'grain'];
const passes = new Map();

export function postState() { return (state.env.post ||= {}); }
export function setEffect(id, patch) {
  const st = postState(); st[id] = { enabled: false, ...Object.fromEntries(Object.entries(EFFECTS[id].params).map(([k, v]) => [k, v[0]])), ...(st[id] || {}), ...patch };
  sync(); bus.emit('post', st); return st[id];
}
export function sync() {
  const st = postState(); const out = composer.passes.indexOf(outlinePass);
  for (const id of ORDER) {
    const s = st[id]; let p = passes.get(id);
    if (s?.enabled && !p) { p = EFFECTS[id].make(); passes.set(id, p); composer.insertPass(p, Math.max(1, composer.passes.indexOf(outlinePass))); }
    if (!p) continue;
    p.enabled = !!s?.enabled && (state.shading === 'material' || state.shading === 'render');
    if (!s) continue;
    if (id === 'dof') { p.uniforms.focus.value = s.focus; p.uniforms.aperture.value = s.aperture; p.uniforms.maxblur.value = s.maxblur; }
    else if (id === 'ao') { p.updateGtaoMaterial({ radius: s.radius }); p.blendIntensity = s.intensity; }
    else for (const k of Object.keys(EFFECTS[id].params)) if (p.uniforms[k]) p.uniforms[k].value = s[k];
  }
  // mantém a ordem estável: reinsere na sequência ORDER antes do contorno de seleção
  const ordered = ORDER.map((id) => passes.get(id)).filter(Boolean); ordered.forEach((p) => composer.removePass(p));
  const at = composer.passes.indexOf(outlinePass); ordered.forEach((p, i) => composer.insertPass(p, at + i)); void out;
  resizeTexel();
}
function resizeTexel() { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); passes.forEach((p) => { if (p.__texel) p.uniforms.texel.value.set(1 / s.x, 1 / s.y, 0); }); }
export function initCompositor() {
  bus.on('shading', sync); bus.on('env', () => { if (state.env.post) sync(); }); bus.on('camera:view', () => passes.forEach((p) => { if (p.camera) p.camera = getRenderCamera() || camera; if (p.uniforms?.cameraNear) {} }));
  window.addEventListener('resize', resizeTexel);
  let t = 0; import('../core/viewport.js').then(({ frameHooks }) => frameHooks.add((dt) => { t += dt; const g = passes.get('grain'); if (g) g.uniforms.uTime.value = t % 100; const cam = getRenderCamera() || camera; passes.forEach((p) => { if ('camera' in p && p.camera !== cam) p.camera = cam; }); }));
}

// Painel do compositor (modal leve)
export function openCompositor() {
  const root = document.querySelector('#modal-root'); const st = postState();
  const draw = () => {
    root.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(520px,94vw)"><div class="modal-h">${icon('SlidersHorizontal')} Compositor (pós-processamento)</div><div class="modal-b comp-list">
      <p class="muted" style="font-size:12px;margin:0 0 8px">Aparece nos modos Material e Render e entra nas imagens renderizadas.</p>
      ${ORDER.map((id) => { const E = EFFECTS[id]; const s = st[id] || {}; return `<div class="comp-fx ${s.enabled ? 'on' : ''}"><label class="comp-h"><input type="checkbox" data-en="${id}" ${s.enabled ? 'checked' : ''}>${icon(E.icon, 15)}<b>${E.label}</b></label>
        ${s.enabled ? Object.entries(E.params).map(([k, [def, mn, mx, step]]) => `<div class="comp-row"><span>${k}</span><input type="range" data-fx="${id}" data-k="${k}" min="${mn}" max="${mx}" step="${step}" value="${s[k] ?? def}"><output>${(+(s[k] ?? def)).toFixed(step < 0.01 ? 4 : 2)}</output></div>`).join('') : ''}</div>`; }).join('')}
      </div><div class="modal-f"><button class="btn primary" data-x>Concluir</button></div></div></div>`;
    root.querySelector('[data-x]').onclick = () => (root.innerHTML = '');
    root.querySelectorAll('[data-en]').forEach((c) => (c.onchange = () => { setEffect(c.dataset.en, { enabled: c.checked }); draw(); }));
    root.querySelectorAll('[data-fx]').forEach((r) => (r.oninput = () => { setEffect(r.dataset.fx, { [r.dataset.k]: +r.value }); r.nextElementSibling.textContent = (+r.value).toFixed(+r.step < 0.01 ? 4 : 2); }));
  };
  draw();
}
