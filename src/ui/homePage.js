// Página inicial: começar rápido, sem precisar conhecer a ferramenta.
import { bus } from '../core/state.js';
import { runCommand } from '../core/commands.js';
import { icon, LOGO } from './icons.js';

const START = [
  ['model', 'cube', 'Modelar', 'Formas, edição de faces, extrusão e booleanas'],
  ['sculpt', 'brush', 'Esculpir', 'Molde como argila com pincéis'],
  ['material', 'texture', 'Pintar materiais', 'Materiais PBR e texturas'],
  ['animate', 'key', 'Animar', 'Keyframes e motion prontos'],
  ['vfx', 'spark', 'Efeitos', 'Fogo, fumaça, faíscas, magia…'],
  ['video', 'film', 'Editar vídeo', 'Monte e exporte vídeos com áudio'],
];
const MORE = [
  ['store', 'bag', 'Loja', 'Modelos, texturas, VFX e SFX grátis'],
  ['code', 'code', 'Code Lab', 'Crie 3D com código e prévia ao vivo'],
  ['engines', 'engine', 'Engines', 'Envie para Unity, Unreal, Godot, Roblox, Blender'],
];

export function renderHome(el) {
  const go = (p) => `data-go="${p}"`;
  el.innerHTML = `<div class="page-wrap home">
    <section class="hero">${LOGO(56)}<div><h1>Bem-vindo ao Argila</h1><p>Crie em 3D do seu jeito — com as mãos ou pedindo para a IA.</p></div>
      <div class="hero-actions"><button class="btn primary" ${go('model')}>${icon('plus', 15)} Começar a criar</button><button class="btn" data-cmd="open">${icon('folder', 15)} Abrir projeto</button><button class="btn" data-cmd="restore">Recuperar autosave</button></div></section>
    <h2>O que você quer fazer?</h2>
    <div class="start-grid">${START.map(([p, ic, t, d], i) => `<button class="start" ${go(p)} style="animation-delay:${i * 40}ms"><span class="start-ic">${icon(ic, 22)}</span><b>${t}</b><small>${d}</small></button>`).join('')}</div>
    <div class="start-grid three">${MORE.map(([p, ic, t, d], i) => `<button class="start alt" ${go(p)} style="animation-delay:${(i + 6) * 40}ms"><span class="start-ic">${icon(ic, 22)}</span><b>${t}</b><small>${d}</small></button>`).join('')}</div>
    <section class="tips"><h2>Atalhos que valem ouro</h2><div class="tip-row">
      <span><kbd>Ctrl</kbd><kbd>K</kbd> buscar qualquer comando</span><span><kbd>Shift</kbd><kbd>A</kbd> adicionar objeto</span>
      <span><kbd>Tab</kbd> editar malha</span><span><kbd>E</kbd> extrudar face</span><span><kbd>Ctrl</kbd><kbd>Z</kbd> desfazer</span><span><kbd>Espaço</kbd> play</span></div></section>
  </div>`;
  el.onclick = (e) => {
    const g = e.target.closest('[data-go]'); if (g) bus.emit('navigate', { page: g.dataset.go });
    const c = e.target.closest('[data-cmd]'); if (c) runCommand(c.dataset.cmd);
  };
}
