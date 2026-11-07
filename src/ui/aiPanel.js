// Painel do assistente de IA (as configurações ficam na página Configurações).
import { PROVIDERS, getProvider } from '../ai/providers.js';
import { listModels } from '../ai/client.js';
import { runAgent, stopAgent, resetConversation } from '../ai/agent.js';
import { bus } from '../core/state.js';
import { settings, saveSettings } from '../core/settings.js';
import { setCursorCount, cursorConfig } from './cursors.js';
import { VERB } from '../core/tools.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COLORS = ['#e2703f', '#3dd6ff', '#b4ff3d', '#ff3dbe', '#ffd23d', '#8f7bff', '#3dffa8', '#ff9f3d'];
export const openSettings = (section) => bus.emit('navigate', { page: 'settings', section });

const cfg = () => ({
  provider: settings.provider, key: settings.keys[settings.provider] || '',
  model: settings.models[settings.provider] || getProvider(settings.provider).model,
  baseURL: settings.baseURLs[settings.provider] || '',
});
let busy = false;

export function initAIPanel() {
  setCursorCount(settings.prefs.cursors); cursorConfig.speed = settings.prefs.cursorSpeed;
  $('#ai-actions').innerHTML = `<button data-a="new" title="Nova conversa">${icon('plus', 15)}</button><button data-a="settings" title="Configurar IA">${icon('gear', 15)}</button><button data-a="close" title="Fechar (Ctrl+.)">✕</button>`;
  $('#ai-actions').onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'settings') openSettings('ai'); if (a === 'new') resetConversation(); if (a === 'close') bus.emit('cmd', 'toggle-ai');
  };
  renderProviderBar(); renderEmpty(); renderCursorCtl();
  bus.on('settings', () => { renderProviderBar(); renderCursorCtl(); });

  const input = $('#ai-input');
  input.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#ai-form').requestSubmit(); } };
  $('#ai-form').onsubmit = async (e) => {
    e.preventDefault();
    if (busy) { stopAgent(); return; }
    const text = input.value.trim(); if (!text) return;
    const p = getProvider(settings.provider);
    if (!p.keyOptional && !settings.keys[p.id]) { toast(`Adicione a chave de ${p.name}`, { action: { label: 'Configurar', run: () => openSettings('ai') } }); return; }
    input.value = ''; setBusy(true);
    try { await runAgent(cfg(), text); } finally { setBusy(false); }
  };
  setBusy(false);

  bus.on('ai:message', ({ role, content }) => addMsg(role, content));
  bus.on('ai:tools', (calls) => {
    const d = document.createElement('div'); d.className = 'toolrun';
    d.innerHTML = calls.map((c, i) => `<span style="--c:${COLORS[i % cursorConfig.count % 8]}"><i></i>${esc(VERB[c.name] || c.name)}${c.args?.name ? ' · ' + esc(c.args.name) : c.args?.target ? ' · ' + esc(c.args.target) : ''}</span>`).join('');
    log().appendChild(d); scroll();
  });
  bus.on('ai:thinking', (on) => {
    $('.thinking')?.remove();
    if (on) { const t = document.createElement('div'); t.className = 'thinking'; t.innerHTML = '<i></i><i></i><i></i>'; log().appendChild(t); scroll(); }
  });
  bus.on('ai:reset', () => renderEmpty());
}

const log = () => { const l = $('#ai-log'); l.querySelector('.ai-empty')?.remove(); return l; };
const scroll = () => { const l = $('#ai-log'); l.scrollTo({ top: l.scrollHeight, behavior: 'smooth' }); };
function addMsg(role, content) { const d = document.createElement('div'); d.className = `msg ${role}`; d.textContent = content; log().appendChild(d); scroll(); }

function setBusy(b) {
  busy = b; const s = $('#ai-send');
  s.innerHTML = b ? `${icon('stop', 14)} Parar` : `Enviar ${icon('send', 14)}`;
  s.classList.toggle('primary', !b);
}

function renderEmpty() {
  const p = getProvider(settings.provider);
  $('#ai-log').innerHTML = `<div class="ai-empty"><b>O que vamos criar?</b>
    ${p.format === 'demo' ? 'Modo demo: roda um roteiro offline para mostrar os cursores. <a href="#" data-cfg>Conectar uma IA</a> para pedidos livres.' : `Conectado a ${esc(p.name)}. Cada ação aparece com seu próprio cursor.`}
    <button data-s='Crie uma intro de motion com o texto "ARGILA", partículas mágicas e um whoosh'>Intro de motion com texto 3D</button>
    <button data-s="Monte uma cena de produto: pedestal de mármore, uma esfera metálica, luz de recorte e câmera">Cena de produto</button>
    <button data-s="Crie 5 cubos em arco, cada um com uma cor e animação de quicar defasada">Cubos animados em arco</button></div>`;
  $('#ai-log').onclick = (e) => {
    if (e.target.closest('[data-cfg]')) { e.preventDefault(); openSettings('ai'); return; }
    const b = e.target.closest('[data-s]'); if (b) { $('#ai-input').value = b.dataset.s; $('#ai-form').requestSubmit(); }
  };
}

function renderProviderBar() {
  const p = getProvider(settings.provider);
  const g = { Offline: PROVIDERS.filter((x) => x.format === 'demo'), Locais: PROVIDERS.filter((x) => x.local && x.format !== 'demo'), Nuvem: PROVIDERS.filter((x) => !x.local) };
  $('#ai-provider').innerHTML = `<select class="field" id="prov-sel">${Object.entries(g).map(([n, list]) => `<optgroup label="${n}">${list.map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}${settings.keys[x.id] ? ' ✓' : ''}</option>`).join('')}</optgroup>`).join('')}</select>
    <input class="field" id="model-in" value="${esc(cfg().model)}" placeholder="modelo" list="model-list"><datalist id="model-list"></datalist>`;
  $('#prov-sel').onchange = (e) => { settings.provider = e.target.value; saveSettings(); renderEmpty(); };
  const mi = $('#model-in');
  mi.onkeydown = (e) => e.stopPropagation();
  mi.onchange = () => { settings.models[settings.provider] = mi.value.trim(); saveSettings(); };
  mi.onfocus = async () => {
    if (mi.dataset.loaded === p.id) return; mi.dataset.loaded = p.id;
    try { const ms = await listModels(cfg()); $('#model-list').innerHTML = ms.slice(0, 300).map((m) => `<option value="${esc(m)}">`).join(''); } catch {}
  };
}

function renderCursorCtl() {
  const el = $('#ai-cursors-ctl');
  el.innerHTML = `Cursores <button data-d="-1">−</button><b>${settings.prefs.cursors}</b><button data-d="1">+</button>`;
  el.onclick = (e) => {
    const d = +e.target.closest('[data-d]')?.dataset.d; if (!d) return;
    settings.prefs.cursors = Math.max(1, Math.min(8, settings.prefs.cursors + d)); setCursorCount(settings.prefs.cursors); saveSettings();
  };
}
