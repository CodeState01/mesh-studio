// Página de Configurações: provedores/chaves de IA, aparência (brilho), viewport,
// cursores da IA, MCP, atualizações e sobre.
import { PROVIDERS, getProvider } from '../ai/providers.js';
import { listModels } from '../ai/client.js';
import { settings, saveSettings, applyUIPrefs } from '../core/settings.js';
import { applyEnvironment, setGridVisible, renderer } from '../core/viewport.js';
import { state, bus } from '../core/state.js';
import { setCursorCount, cursorConfig } from './cursors.js';
import { icon, LOGO } from './icons.js';
import { toast } from './toast.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SECTIONS = [
  ['ai', 'IA e provedores', 'chat'], ['look', 'Aparência', 'sun'], ['viewport', 'Viewport', 'cube'],
  ['cursors', 'Cursores da IA', 'select'], ['mcp', 'MCP', 'plug'], ['updates', 'Atualizações', 'download'], ['about', 'Sobre', 'home'],
];
let section = 'ai', sel = null, filter = '';

export function renderSettings(el, sec) {
  if (sec) section = sec;
  sel ||= settings.provider;
  el.innerHTML = `<div class="page-wrap settings"><header class="page-head"><div><h1>Configurações</h1><p>Tudo é salvo automaticamente. Suas chaves de API ficam criptografadas neste computador.</p></div></header>
    <div class="set-body"><nav class="set-nav" id="set-nav">${SECTIONS.map(([id, n, ic]) => `<button data-s="${id}" class="${id === section ? 'on' : ''}">${icon(ic, 16)}<span>${n}</span></button>`).join('')}</nav>
    <section class="set-content" id="set-content"></section></div></div>`;
  el.querySelector('#set-nav').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { section = b.dataset.s; renderSettings(el); } };
  const c = el.querySelector('#set-content');
  ({ ai: secAI, look: secLook, viewport: secViewport, cursors: secCursors, mcp: secMCP, updates: secUpdates, about: secAbout }[section])(c, el);
  c.querySelectorAll('input,select,textarea').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
}

const slider = (id, label, v, min, max, step, fmt = (x) => x) => `<div class="set-row"><div><b>${label}</b></div><div class="slider"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${fmt(v)}</output></div></div>`;
function bindSlider(c, id, fn, fmt = (x) => x) { const i = c.querySelector('#' + id); i.oninput = () => { fn(+i.value); i.nextElementSibling.textContent = fmt(+i.value); }; }

function secAI(c, page) {
  const list = PROVIDERS.filter((p) => p.name.toLowerCase().includes(filter));
  const p = getProvider(sel); const active = settings.provider === p.id;
  const configured = PROVIDERS.filter((x) => settings.keys[x.id]).length;
  c.innerHTML = `<h2>IA e provedores</h2><p class="muted">${PROVIDERS.length - 1} provedores: ${PROVIDERS.filter((x) => !x.local).length} na nuvem e ${PROVIDERS.filter((x) => x.local && x.format !== 'demo').length} locais (rodam no seu PC, sem chave). ${configured} com chave salva.</p>
    <label class="search wide">${icon('search', 16)}<input id="pf" placeholder="Buscar provedor…" value="${esc(filter)}"></label>
    <div class="prov-grid">${list.map((x) => `<button class="prov ${x.local ? 'local' : ''} ${x.id === sel ? 'on' : ''}" data-p="${x.id}"><span>${esc(x.name)}</span><small>${x.id === settings.provider ? '● em uso' : x.format === 'demo' ? 'offline' : x.local ? 'local' : settings.keys[x.id] ? 'chave ✓' : ''}</small></button>`).join('')}</div>
    <div class="set-card">
      <div class="set-card-h"><b>${esc(p.name)}</b><span class="muted">${p.format === 'anthropic' ? 'API Anthropic' : p.format === 'demo' ? 'sem configuração' : 'compatível com OpenAI'}</span></div>
      ${p.format === 'demo' ? '<p class="muted">Roda um roteiro offline para demonstrar os cursores da IA.</p>' : `
      <div class="set-row"><div><b>Chave de API</b><small>${p.keyOptional ? 'Opcional para servidores locais' : 'Obrigatória'}</small></div><input class="field" id="k" type="password" placeholder="cole sua chave aqui" value="${esc(settings.keys[p.id] || '')}"></div>
      <div class="set-row"><div><b>URL base</b><small>Mude se usa proxy ou servidor próprio</small></div><input class="field" id="u" value="${esc(settings.baseURLs[p.id] || p.baseURL)}"></div>
      <div class="set-row"><div><b>Modelo</b><small>Clique em Testar para listar os disponíveis</small></div><input class="field" id="m" list="mlist" value="${esc(settings.models[p.id] || p.model)}"><datalist id="mlist"></datalist></div>`}
      <div class="set-actions">${p.format !== 'demo' ? `<button class="btn" id="test">Testar conexão</button>` : ''}<button class="btn primary" id="use" ${active ? 'disabled' : ''}>${active ? 'Em uso' : 'Usar este provedor'}</button><span id="tres" class="muted"></span></div>
    </div>`;
  const pf = c.querySelector('#pf'); pf.oninput = () => { filter = pf.value.toLowerCase(); secAI(c, page); const n = c.querySelector('#pf'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  c.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { sel = b.dataset.p; secAI(c, page); }));
  const persist = () => {
    if (!c.querySelector('#k')) return;
    settings.keys[p.id] = c.querySelector('#k').value.trim();
    const u = c.querySelector('#u').value.trim(); if (u && u !== p.baseURL) settings.baseURLs[p.id] = u; else delete settings.baseURLs[p.id];
    settings.models[p.id] = c.querySelector('#m').value.trim(); saveSettings();
  };
  c.querySelectorAll('#k,#u,#m').forEach((i) => (i.onchange = persist));
  c.querySelector('#use').onclick = () => { persist(); settings.provider = p.id; saveSettings(); toast(`Usando ${p.name}`); secAI(c, page); };
  c.querySelector('#test')?.addEventListener('click', async () => {
    persist(); const r = c.querySelector('#tres'); r.textContent = 'Testando…'; r.style.color = '';
    try {
      const ms = await listModels({ provider: p.id, key: settings.keys[p.id], baseURL: settings.baseURLs[p.id] });
      c.querySelector('#mlist').innerHTML = ms.slice(0, 300).map((m) => `<option value="${esc(m)}">`).join('');
      r.textContent = `Conectado · ${ms.length} modelos`; r.style.color = '#5bd17a';
    } catch (e) { r.textContent = e.message.slice(0, 100); r.style.color = 'var(--accent)'; }
  });
}

function secLook(c) {
  const p = settings.prefs; const ACC = ['#e2703f', '#e5534b', '#d9a441', '#7bd389', '#3dd6ff', '#6f8cff', '#b98cff', '#ff6fb5'];
  c.innerHTML = `<h2>Aparência</h2>
    ${slider('exp', 'Brilho da cena (exposição)', p.exposure, 0.3, 1.6, 0.05, (v) => v.toFixed(2))}
    ${slider('bloom', 'Brilho/glow (bloom)', p.bloom, 0, 1.5, 0.01, (v) => v.toFixed(2))}
    ${slider('scale', 'Tamanho da interface', p.uiScale, 0.8, 1.3, 0.05, (v) => Math.round(v * 100) + '%')}
    <div class="set-row"><div><b>Cor de destaque</b></div><div class="swatches" id="acc">${ACC.map((a) => `<button style="--c:${a}" class="${a === p.accent ? 'on' : ''}" data-a="${a}"></button>`).join('')}</div></div>
    <div class="set-row"><div><b>Reduzir animações</b><small>Para máquinas mais lentas</small></div><label class="toggle"><input type="checkbox" id="rm" ${p.reduceMotion ? 'checked' : ''}><span></span></label></div>`;
  bindSlider(c, 'exp', (v) => { p.exposure = v; applyEnvironment({ exposure: v }); saveSettings(); }, (v) => v.toFixed(2));
  bindSlider(c, 'bloom', (v) => { p.bloom = v; applyEnvironment({ bloom: v }); saveSettings(); }, (v) => v.toFixed(2));
  bindSlider(c, 'scale', (v) => { p.uiScale = v; applyUIPrefs(); saveSettings(); }, (v) => Math.round(v * 100) + '%');
  c.querySelector('#acc').onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; p.accent = b.dataset.a; applyUIPrefs(); saveSettings(); secLook(c); };
  c.querySelector('#rm').onchange = (e) => { p.reduceMotion = e.target.checked; applyUIPrefs(); saveSettings(); };
}

function secViewport(c) {
  const p = settings.prefs;
  c.innerHTML = `<h2>Viewport</h2>
    <div class="set-row"><div><b>Grade do chão</b></div><label class="toggle"><input type="checkbox" id="grid" ${p.grid ? 'checked' : ''}><span></span></label></div>
    <div class="set-row"><div><b>Sombras</b></div><select class="field" id="sh">${[['soft', 'Suaves'], ['hard', 'Rápidas'], ['off', 'Desligadas']].map(([v, n]) => `<option value="${v}" ${p.shadows === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="set-row"><div><b>Assistente aberto ao iniciar</b></div><label class="toggle"><input type="checkbox" id="ai" ${p.aiOpen ? 'checked' : ''}><span></span></label></div>
    <p class="muted" style="margin-top:12px">Navegação: botão do meio orbita · Shift+meio move · roda dá zoom · Alt+esquerdo também orbita.</p>`;
  c.querySelector('#grid').onchange = (e) => { p.grid = e.target.checked; setGridVisible(p.grid); saveSettings(); };
  c.querySelector('#sh').onchange = (e) => { p.shadows = e.target.value; applyShadows(); saveSettings(); };
  c.querySelector('#ai').onchange = (e) => { p.aiOpen = e.target.checked; saveSettings(); };
}
export function applyShadows() {
  const s = settings.prefs.shadows; renderer.shadowMap.enabled = s !== 'off';
  renderer.shadowMap.type = s === 'hard' ? 0 /* Basic */ : 1 /* PCF (suave no r180+) */; renderer.shadowMap.needsUpdate = true;
}

function secCursors(c) {
  const p = settings.prefs;
  c.innerHTML = `<h2>Cursores da IA</h2><p class="muted">Quando a IA pede várias ações independentes ao mesmo tempo, cada uma ganha um cursor próprio que voa até onde a coisa acontece.</p>
    ${slider('cc', 'Quantidade de cursores', p.cursors, 1, 8, 1)}
    ${slider('cs', 'Velocidade', p.cursorSpeed, 0.5, 3, 0.25, (v) => v + '×')}`;
  bindSlider(c, 'cc', (v) => { p.cursors = v; setCursorCount(v); saveSettings(); });
  bindSlider(c, 'cs', (v) => { p.cursorSpeed = v; cursorConfig.speed = v; saveSettings(); }, (v) => v + '×');
}

async function secMCP(c) {
  const info = window.argila?.app ? await window.argila.app.info() : { mcpPort: 47821, mcpServerPath: '<pasta-do-argila>/mcp/server.mjs' };
  const path = info.mcpServerPath.replace(/\\/g, '/');
  c.innerHTML = `<h2>MCP — controle por outras IAs</h2>
    <p class="muted">O Argila expõe suas ferramentas via Model Context Protocol. Claude Desktop, Claude Code, Cursor, Windsurf e outros podem modelar, animar e renderizar aqui — cada ação aparece com um cursor.</p>
    <h3>Claude Desktop / Cursor</h3><div class="code">${esc(JSON.stringify({ mcpServers: { argila: { command: 'node', args: [path] } } }, null, 2))}</div>
    <h3>Claude Code</h3><div class="code">claude mcp add argila -- node "${esc(path)}"</div>
    <p class="muted">Ponte local em ws://127.0.0.1:${info.mcpPort} (somente este computador). O Argila precisa estar aberto.</p>`;
}

async function secUpdates(c) {
  const info = window.argila?.app ? await window.argila.app.info() : { version: 'web' };
  c.innerHTML = `<h2>Atualizações</h2>
    <div class="set-row"><div><b>Versão instalada</b></div><span class="mono">${esc(info.version)}</span></div>
    <p class="muted">O app verifica novas versões ao abrir e a cada 4 horas (GitHub Releases), baixa em segundo plano e avisa quando puder reiniciar.</p>
    <div class="set-actions"><button class="btn" id="chk">Verificar agora</button><span id="ures" class="muted"></span></div>`;
  c.querySelector('#chk').onclick = async () => { const r = c.querySelector('#ures'); if (!window.argila?.update) { r.textContent = 'Disponível apenas no app instalado.'; return; } r.textContent = 'Verificando…'; await window.argila.update.check(); };
}

function secAbout(c) {
  c.innerHTML = `<div class="about">${LOGO(72)}<h2>Argila Studio</h2><p class="muted">Modelagem, escultura, animação, VFX/SFX e vídeo com IA.<br>Código aberto sob licença MIT.</p>
    <p class="muted">Assets da Comunidade: Poly Haven (CC0). Fonte 3D: Helvetiker (licença inclusa).</p></div>`;
}
