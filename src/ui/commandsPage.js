// Página "Comandos": TODOS os comandos do app, agrupados, com atalho e botão para executar.
import { commands, runCommand } from '../core/commands.js';
import { icon } from './icons.js';

const GROUP_ICON = { Arquivo: 'folder', Editar: 'undo', Adicionar: 'plus', Luz: 'light', VFX: 'spark', Ferramentas: 'move', Modelagem: 'extrude', Escultura: 'brush',
  Exibir: 'eye', Animação: 'key', Vídeo: 'film', Render: 'aperture', Ir: 'home', Ajuda: 'chat' };
let q = '';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kbd = (k) => k.split('+').map((x) => `<kbd>${x.replace('Numpad', 'Num ')}</kbd>`).join('');

export function renderCommands(el) {
  const all = [...commands.values()].filter((c) => c.group);
  el.innerHTML = `<div class="page-wrap"><header class="page-head"><div><h1>Comandos</h1><p>${all.length} comandos. Clique para executar — ou use o atalho. Dica: <kbd>Ctrl</kbd><kbd>K</kbd> abre a busca rápida de qualquer lugar.</p></div>
    <label class="search">${icon('search', 16)}<input id="cq" placeholder="Buscar comando…" value="${esc(q)}"></label></header><div id="cmd-list" class="cmd-groups"></div></div>`;
  const draw = () => {
    const list = all.filter((c) => `${c.label} ${c.group} ${c.keys || ''}`.toLowerCase().includes(q));
    const groups = {}; list.forEach((c) => (groups[c.group] ||= []).push(c));
    el.querySelector('#cmd-list').innerHTML = Object.entries(groups).map(([g, cs]) => `<section class="cmd-group"><h3>${icon(GROUP_ICON[g] || 'list', 15)} ${g} <span>${cs.length}</span></h3>
      ${cs.map((c) => `<button class="cmd-row" data-id="${c.id}"><span>${esc(c.label)}</span>${c.desc ? `<small>${esc(c.desc)}</small>` : ''}<span class="keys">${c.keys ? kbd(c.keys) : ''}</span></button>`).join('')}</section>`).join('')
      || `<div class="empty">Nenhum comando para “${esc(q)}”.</div>`;
  };
  const i = el.querySelector('#cq'); i.onkeydown = (e) => e.stopPropagation(); i.oninput = () => { q = i.value.toLowerCase(); draw(); };
  el.querySelector('#cmd-list').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) runCommand(b.dataset.id); };
  draw();
}
