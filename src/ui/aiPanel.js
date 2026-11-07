// Painel do assistente + Configurações (provedores, chaves, MCP, cursores, atualizações).
import { PROVIDERS, getProvider } from '../ai/providers.js';
import { listModels } from '../ai/client.js';
import { runAgent, stopAgent, resetConversation } from '../ai/agent.js';
import { bus } from '../core/state.js';
import { setCursorCount, cursorConfig } from './cursors.js';
import { VERB } from '../core/tools.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Configurações persistentes ----------
export const settings = { provider: 'demo', keys: {}, models: {}, baseURLs: {}, prefs: { cursors: 4, cursorSpeed: 1 } };
async function loadSettings() {
  try {
    const s = window.orbe?.settings ? await window.orbe.settings.get() : JSON.parse(localStorage.getItem('orbe:settings') || '{}');
    Object.assign(settings, s, { prefs: { ...settings.prefs, ...(s.prefs || {}) } });
  } catch {}
}
async function saveSettings() {
  if (window.orbe?.settings) await window.orbe.settings.set(settings);
  else localStorage.setItem('orbe:settings', JSON.stringify(settings)); // web: só para desenvolvimento
}
const cfg = () => ({
  provider: settings.provider, key: settings.keys[settings.provider] || '',
  model: settings.models[settings.provider] || getProvider(settings.provider).model,
  baseURL: settings.baseURLs[settings.provider] || '',
});

let busy = false;

export async function initAIPanel() {
  await loadSettings();
  setCursorCount(settings.prefs.cursors); cursorConfig.speed = settings.prefs.cursorSpeed;
  $('#ai-actions').innerHTML = `<button data-a="new" title="Nova conversa">${icon('plus', 15)}</button><button data-a="settings" title="Configurações de IA">${icon('gear', 15)}</button>`;
  $('#ai-actions').onclick = (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'settings') openSettings(); if (a === 'new') resetConversation(); };
  renderProviderBar(); renderEmpty(); renderCursorCtl();

  const input = $('#ai-input');
  input.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#ai-form').requestSubmit(); } };
  $('#ai-form').onsubmit = async (e) => {
    e.preventDefault();
    if (busy) { stopAgent(); return; }
    const text = input.value.trim(); if (!text) return;
    const p = getProvider(settings.provider);
    if (!p.keyOptional && !settings.keys[p.id]) { toast(`Adicione a chave de ${p.name}`, { action: { label: 'Configurar', run: openSettings } }); return; }
    input.value = ''; setBusy(true);
    try { await runAgent(cfg(), text); } finally { setBusy(false); }
  };
  setBusy(false);

  bus.on('ai:message', ({ role, content }) => addMsg(role, content));
  bus.on('ai:tools', (calls) => {
    const d = document.createElement('div'); d.className = 'toolrun';
    d.innerHTML = calls.map((c, i) => `<span style="--c:${['#ff6a3d', '#3dd6ff', '#b4ff3d', '#ff3dbe', '#ffd23d', '#8f7bff', '#3dffa8', '#ff9f3d'][i % cursorConfig.count % 8]}"><i></i>${esc(VERB[c.name] || c.name)}${c.args?.name ? ' · ' + esc(c.args.name) : c.args?.target ? ' · ' + esc(c.args.target) : ''}</span>`).join('');
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
    ${p.format === 'demo' ? 'Modo demo ativo — roda um roteiro offline para mostrar os cursores. Conecte um provedor (⚙) para pedidos livres.' : `Conectado a ${esc(p.name)}. Cada ação aparece com seu próprio cursor.`}
    <button data-s='Crie uma intro de motion com o texto "ORBE", partículas mágicas e um whoosh'>Intro de motion com texto 3D</button>
    <button data-s="Monte uma cena de produto: pedestal de mármore, uma esfera metálica, luz de recorte e câmera">Cena de produto</button>
    <button data-s="Crie 5 cubos em arco, cada um com uma cor e animação de quicar defasada">Cubos animados em arco</button></div>`;
  $('#ai-log').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { $('#ai-input').value = b.dataset.s; $('#ai-form').requestSubmit(); } };
}

function renderProviderBar() {
  const p = getProvider(settings.provider);
  $('#ai-provider').innerHTML = `
    <select class="field" id="prov-sel">${groupedOptions(settings.provider)}</select>
    <input class="field" id="model-in" value="${esc(cfg().model)}" placeholder="modelo" style="flex:1;min-width:0" list="model-list"><datalist id="model-list"></datalist>`;
  $('#prov-sel').onchange = (e) => { settings.provider = e.target.value; saveSettings(); renderProviderBar(); renderEmpty(); };
  const mi = $('#model-in');
  mi.onkeydown = (e) => e.stopPropagation();
  mi.onchange = () => { settings.models[settings.provider] = mi.value.trim(); saveSettings(); };
  mi.onfocus = async () => { // autocompletar com os modelos que o provedor expõe
    if (mi.dataset.loaded === p.id) return; mi.dataset.loaded = p.id;
    try { const ms = await listModels(cfg()); $('#model-list').innerHTML = ms.slice(0, 300).map((m) => `<option value="${esc(m)}">`).join(''); } catch {}
  };
}

function groupedOptions(sel) {
  const g = { 'Offline': PROVIDERS.filter((p) => p.format === 'demo'), 'Locais': PROVIDERS.filter((p) => p.local && p.format !== 'demo'), 'Nuvem': PROVIDERS.filter((p) => !p.local) };
  return Object.entries(g).map(([n, list]) => `<optgroup label="${n}">${list.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
}

function renderCursorCtl() {
  const el = $('#ai-cursors-ctl');
  el.innerHTML = `Cursores <button data-d="-1">−</button><b>${settings.prefs.cursors}</b><button data-d="1">+</button>`;
  el.onclick = (e) => {
    const d = +e.target.closest('[data-d]')?.dataset.d; if (!d) return;
    settings.prefs.cursors = Math.max(1, Math.min(8, settings.prefs.cursors + d)); setCursorCount(settings.prefs.cursors); saveSettings(); renderCursorCtl();
  };
}

// ---------- Modal de configurações ----------
export async function openSettings(section = 'ai') {
  const info = window.orbe?.app ? await window.orbe.app.info() : { version: 'web', mcpPort: 47821, mcpServerPath: '<pasta-do-orbe>/mcp/server.mjs' };
  let sel = settings.provider; let filter = '';
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal">
    <div class="modal-h"><span>Configurações</span><button class="icon-btn" data-x>✕</button></div>
    <div class="tabs" id="set-tabs">${[['ai', 'Provedores de IA'], ['mcp', 'MCP'], ['ux', 'Cursores'], ['upd', 'Atualizações']].map(([k, n]) => `<button class="tab ${k === section ? 'on' : ''}" data-k="${k}">${n}</button>`).join('')}</div>
    <div class="modal-b" id="set-body"></div>
    <div class="modal-f"><button class="btn" data-x>Fechar</button></div></div></div>`;
  const body = $('#set-body');
  const close = () => { root.innerHTML = ''; renderProviderBar(); renderEmpty(); };
  root.querySelectorAll('[data-x]').forEach((b) => (b.onclick = close));
  root.querySelector('.modal-bg').onclick = (e) => { if (e.target.classList.contains('modal-bg')) close(); };
  $('#set-tabs').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; root.querySelectorAll('#set-tabs .tab').forEach((t) => t.classList.toggle('on', t === b)); show(b.dataset.k); };

  const show = (k) => {
    if (k === 'ai') {
      const list = PROVIDERS.filter((p) => p.name.toLowerCase().includes(filter));
      const p = getProvider(sel);
      body.innerHTML = `
        <input class="field" id="pf" placeholder="Buscar entre ${PROVIDERS.length - 1} provedores…" value="${esc(filter)}" style="margin-bottom:8px">
        <div class="prov-grid">${list.map((x) => `<button class="prov ${x.local ? 'local' : ''} ${x.id === sel ? 'on' : ''}" data-p="${x.id}"><span>${esc(x.name)}</span><small>${x.format === 'demo' ? 'offline' : x.local ? 'local' : settings.keys[x.id] ? '●' : ''}</small></button>`).join('')}</div>
        <div class="sec-h"><span>${esc(p.name)}</span><span>${p.format === 'anthropic' ? 'API Anthropic' : p.format === 'demo' ? '' : 'compatível OpenAI'}</span></div>
        ${p.format === 'demo' ? '<div class="empty">Sem configuração necessária.</div>' : `
        <div class="row"><label>Chave API</label><input class="field" id="k" type="password" placeholder="${p.keyOptional ? 'opcional para servidores locais' : 'cole sua chave'}" value="${esc(settings.keys[p.id] || '')}"></div>
        <div class="row"><label>URL base</label><input class="field" id="u" value="${esc(settings.baseURLs[p.id] || p.baseURL)}"></div>
        <div class="row"><label>Modelo</label><input class="field" id="m" value="${esc(settings.models[p.id] || p.model)}"></div>
        <div style="display:flex;gap:6px;margin-top:8px"><button class="btn" id="test">Testar conexão</button><button class="btn primary" id="use">Usar este provedor</button><span id="tres" style="align-self:center;color:var(--text2)"></span></div>`}`;
      const pf = $('#pf'); pf.oninput = () => { filter = pf.value.toLowerCase(); show('ai'); const n = $('#pf'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
      body.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { sel = b.dataset.p; show('ai'); }));
      const persist = () => {
        if (!$('#k')) return;
        settings.keys[p.id] = $('#k').value.trim();
        const u = $('#u').value.trim(); if (u && u !== p.baseURL) settings.baseURLs[p.id] = u; else delete settings.baseURLs[p.id];
        settings.models[p.id] = $('#m').value.trim(); saveSettings();
      };
      body.querySelectorAll('#k,#u,#m').forEach((i) => { i.onchange = persist; i.onkeydown = (e) => e.stopPropagation(); });
      $('#use')?.addEventListener('click', () => { persist(); settings.provider = p.id; saveSettings(); toast(`Usando ${p.name}`); show('ai'); });
      $('#test')?.addEventListener('click', async () => {
        persist(); const r = $('#tres'); r.textContent = 'Testando…';
        try { const ms = await listModels({ provider: p.id, key: settings.keys[p.id], baseURL: settings.baseURLs[p.id] }); r.textContent = `OK · ${ms.length} modelos`; r.style.color = '#5bd17a'; }
        catch (e) { r.textContent = e.message.slice(0, 90); r.style.color = 'var(--accent)'; }
      });
    }
    if (k === 'mcp') {
      const path = info.mcpServerPath.replace(/\\/g, '/');
      body.innerHTML = `
        <p style="color:var(--text2);margin-bottom:10px;line-height:1.6">O Orbe expõe suas ferramentas (modelar, materiais, animação, VFX, SFX, vídeo, render) via <b>Model Context Protocol</b>.
        Qualquer cliente MCP — Claude Desktop, Claude Code, Cursor, Windsurf, etc. — pode controlar a cena, e cada ação aparece com um cursor de IA.</p>
        <div class="sec-h">Claude Desktop / Cursor (mcpServers)</div>
        <div class="code">${esc(JSON.stringify({ mcpServers: { orbe: { command: 'node', args: [path] } } }, null, 2))}</div>
        <div class="sec-h" style="margin-top:12px">Claude Code</div>
        <div class="code">claude mcp add orbe -- node "${esc(path)}"</div>
        <p style="color:var(--mute);margin-top:10px">Ponte local: ws://127.0.0.1:${info.mcpPort} (somente loopback). O app precisa estar aberto.</p>`;
    }
    if (k === 'ux') {
      body.innerHTML = `
        <div class="row"><label>Cursores IA</label><div class="slider"><input type="range" id="cc" min="1" max="8" step="1" value="${settings.prefs.cursors}"><output>${settings.prefs.cursors}</output></div></div>
        <div class="row"><label>Velocidade</label><div class="slider"><input type="range" id="cs" min="0.5" max="3" step="0.25" value="${settings.prefs.cursorSpeed}"><output>${settings.prefs.cursorSpeed}×</output></div></div>
        <p style="color:var(--mute);margin-top:8px;line-height:1.6">Ferramentas independentes que o modelo pede na mesma resposta rodam em paralelo, uma por cursor. Mais cursores = construção mais rápida.</p>`;
      $('#cc').oninput = (e) => { settings.prefs.cursors = +e.target.value; e.target.nextElementSibling.textContent = e.target.value; setCursorCount(settings.prefs.cursors); renderCursorCtl(); saveSettings(); };
      $('#cs').oninput = (e) => { settings.prefs.cursorSpeed = +e.target.value; cursorConfig.speed = +e.target.value; e.target.nextElementSibling.textContent = e.target.value + '×'; saveSettings(); };
    }
    if (k === 'upd') {
      body.innerHTML = `<div class="row"><label>Versão</label><span>${esc(info.version)}</span></div>
        <p style="color:var(--text2);line-height:1.6;margin:8px 0">Atualizações automáticas via GitHub Releases (electron-updater). O app verifica ao abrir e a cada 4 horas, baixa em segundo plano e oferece reiniciar.</p>
        <button class="btn" id="chk">Verificar agora</button> <span id="ures" style="color:var(--text2);margin-left:8px"></span>`;
      $('#chk').onclick = async () => { if (!window.orbe?.update) { $('#ures').textContent = 'Disponível apenas no app desktop.'; return; } $('#ures').textContent = 'Verificando…'; await window.orbe.update.check(); };
    }
  };
  show(section);
}
