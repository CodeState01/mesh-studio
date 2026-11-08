// Agente: conversa com o modelo, executa ferramentas em PARALELO,
// cada uma com seu próprio cursor animado na tela.
import { chat } from './client.js';
import { getProvider } from './providers.js';
import { TOOLS, runTool, anchorBefore, anchorAfter, VERB } from '../core/tools.js';
import { acquireCursor } from '../ui/cursors.js';
import { bus } from '../core/state.js';
import { demoPlan } from './demo.js';

const SYSTEM = `Você é o assistente de criação do Mesh, um app de modelagem 3D, animação, VFX/SFX e edição de vídeo.
Use as ferramentas para construir o que o usuário pede. Unidades em metros; Y é para cima; o chão é y=0.
Rotação em graus. Tempo em segundos. Prefira chamar VÁRIAS ferramentas independentes na mesma resposta
(elas rodam em paralelo). Dê nomes claros aos objetos e use esses nomes como "target" depois.
Para motion graphics: crie texto, aplique motion_preset e adicione SFX sincronizados.
Responda curto em português.`;

export const conversation = [];
let abort = false;
export const stopAgent = () => { abort = true; stopAccountAgent(); };

export async function execWithCursor(call) {
  const cur = await acquireCursor();
  try {
    await cur.moveTo(anchorBefore(call.name, call.args), VERB[call.name] || call.name);
    await cur.click();
    const result = await runTool(call.name, call.args);
    const after = anchorAfter(call.name, call.args, result);
    if (after) { await cur.moveTo(after); await cur.click(); }
    return { ok: true, result };
  } catch (e) {
    cur.label('erro'); return { ok: false, error: String(e.message || e) };
  } finally { cur.release(); }
}

// Executa um lote em paralelo — mas respeita dependências óbvias: chamadas que
// referenciam (target) um nome criado no mesmo lote esperam a criação terminar.
async function runBatch(calls) {
  const created = new Map();
  const promises = [];
  for (const c of calls) {
    const dep = c.args?.target && created.get(c.args.target);
    const p = (dep ? dep.then(() => {}) : Promise.resolve()).then(() => execWithCursor(c));
    if (c.args?.name) created.set(c.args.name, p);
    promises.push(p);
  }
  return Promise.all(promises);
}

export async function runAgent(cfg, userText) {
  abort = false;
  conversation.push({ role: 'user', content: userText });
  bus.emit('ai:message', { role: 'user', content: userText });
  const provider = getProvider(cfg.provider);

  if (provider.format === 'demo') {
    for (const batch of demoPlan(userText)) {
      if (abort) break;
      bus.emit('ai:tools', batch);
      await runBatch(batch);
    }
    bus.emit('ai:message', { role: 'assistant', content: 'Pronto — cena de demonstração criada. Conecte um provedor em Configurações para pedidos livres.' });
    return;
  }

  if (provider.format === 'account') return runAccountAgent(provider, cfg, userText);

  for (let step = 0; step < 16 && !abort; step++) {
    bus.emit('ai:thinking', true);
    let res;
    try { res = await chat(cfg, { system: SYSTEM, messages: conversation, tools: TOOLS }); }
    catch (e) { bus.emit('ai:thinking', false); bus.emit('ai:message', { role: 'error', content: e.message }); return; }
    bus.emit('ai:thinking', false);
    conversation.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls });
    if (res.text) bus.emit('ai:message', { role: 'assistant', content: res.text });
    if (!res.toolCalls.length) return;

    bus.emit('ai:tools', res.toolCalls);
    const results = await runBatch(res.toolCalls);
    res.toolCalls.forEach((c, i) => {
      const r = results[i];
      let content = r.ok ? JSON.stringify(r.result) : `ERRO: ${r.error}`;
      if (r.ok && r.result?.__image) content = 'Imagem renderizada (não anexada).';
      conversation.push({ role: 'tool', toolCallId: c.id, name: c.name, content: content.slice(0, 6000) });
    });
  }
}

export function resetConversation() { conversation.length = 0; bus.emit('ai:reset'); }

// ---------- Agente por CONTA (Gemini CLI / Claude Code com a conta do usuário) ----------
// O CLI oficial roda fora do app e chama as ferramentas do Mesh via MCP; essas chamadas chegam
// pela ponte e são executadas com cursor (main.js → execWithCursor). Aqui só exibimos o texto.
let current = null; // { runId, resolve, el }
let listening = false;
function ensureListener() {
  if (listening || !window.meshApp?.agents) return; listening = true;
  window.meshApp.agents.onEvent((ev) => {
    if (!current || (current.runId && ev.runId !== current.runId)) return;
    if (ev.type === 'text') {
      bus.emit('ai:thinking', false);
      if (ev.delta && current.last) { current.last.content += ev.text; bus.emit('ai:message:update', current.last); }
      else { current.last = { role: 'assistant', content: ev.text }; bus.emit('ai:message', current.last); }
    }
    // Só mostra ferramentas do Mesh (ignora as internas do CLI, ex.: busca de ferramentas)
    if (ev.type === 'tool' && VERB[ev.name]) { current.last = null; bus.emit('ai:tools', [{ name: ev.name, args: {} }]); }
    if (ev.type === 'done') {
      bus.emit('ai:thinking', false);
      if (ev.code && ev.error) bus.emit('ai:message', { role: 'error', content: ev.error });
      const r = current.resolve; current = null; r();
    }
  });
}

async function runAccountAgent(provider, cfg, userText) {
  if (!window.meshApp?.agents) { bus.emit('ai:message', { role: 'error', content: 'Contas só funcionam no app desktop.' }); return; }
  ensureListener();
  const st = (await window.meshApp.agents.status())[provider.cli];
  if (!st?.installed) { bus.emit('ai:message', { role: 'error', content: `${st?.name || provider.name} não está instalado. Em Ajustes › Contas há o comando de instalação.` }); return; }
  if (!st.loggedIn) { bus.emit('ai:message', { role: 'error', content: `Conecte sua conta ${st.name} em Ajustes › Contas.` }); return; }
  if (!st.runnable) { bus.emit('ai:message', { role: 'error', content: `${st.name}: login detectado, mas a execução como agente ainda não é suportada.` }); return; }
  // Os CLIs rodam uma tarefa por vez: enviamos um resumo curto da conversa + o pedido.
  const history = conversation.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content).slice(-6, -1)
    .map((m) => `${m.role === 'user' ? 'Usuário' : 'Você'}: ${m.content}`).join('\n');
  const prompt = `${SYSTEM}\nUse SOMENTE as ferramentas do servidor MCP "mesh" para alterar a cena.\n${history ? `\nConversa anterior:\n${history}\n` : ''}\nPedido: ${userText}`;
  bus.emit('ai:thinking', true);
  await new Promise(async (resolve) => {
    current = { runId: null, resolve, last: null };
    try { current.runId = await window.meshApp.agents.run({ id: provider.cli, prompt, model: cfg.model || undefined }); }
    catch (e) { bus.emit('ai:thinking', false); bus.emit('ai:message', { role: 'error', content: e.message }); current = null; resolve(); }
  });
}
export function stopAccountAgent() { if (current?.runId) window.meshApp.agents.stop(current.runId); }
