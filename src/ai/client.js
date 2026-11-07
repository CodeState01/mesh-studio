// Cliente unificado: normaliza OpenAI-compatível e Anthropic para um formato interno.
// Formato interno de mensagem: {role:'user'|'assistant'|'tool', content, toolCalls?, toolCallId?, name?}
import { getProvider } from './providers.js';

async function http(req) {
  if (window.argila?.ai) return window.argila.ai.fetch(req); // via processo principal (sem CORS)
  const res = await fetch(req.url, { method: req.method || 'POST', headers: req.headers, body: req.body ? JSON.stringify(req.body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

function errorOf(r) {
  return r.json?.error?.message || r.json?.message || r.text || `HTTP ${r.status}`;
}

export async function listModels(cfg) {
  const p = getProvider(cfg.provider);
  if (p.format === 'demo') return ['demo'];
  const base = (cfg.baseURL || p.baseURL).replace(/\/$/, '');
  const headers = p.format === 'anthropic'
    ? { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }
    : (cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {});
  const r = await http({ url: `${base}/models`, method: 'GET', headers });
  if (!r.ok) throw new Error(errorOf(r));
  return (r.json?.data || r.json?.models || []).map((m) => m.id || m.name).filter(Boolean).sort();
}

export async function chat(cfg, { system, messages, tools }) {
  const p = getProvider(cfg.provider);
  const base = (cfg.baseURL || p.baseURL).replace(/\/$/, '');
  const model = cfg.model || p.model;

  if (p.format === 'anthropic') {
    const body = {
      model, max_tokens: 4096, system,
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
      messages: toAnthropic(messages),
    };
    const r = await http({
      url: `${base}/messages`,
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
      body,
    });
    if (!r.ok) throw new Error(errorOf(r));
    const text = r.json.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const toolCalls = r.json.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input || {} }));
    return { text, toolCalls };
  }

  // OpenAI-compatível (cobre ~todos os demais, incluindo os locais)
  const body = {
    model,
    messages: [{ role: 'system', content: system }, ...toOpenAI(messages)],
    tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
    tool_choice: 'auto',
  };
  const headers = { 'content-type': 'application/json' };
  if (cfg.key) headers.Authorization = `Bearer ${cfg.key}`;
  if (p.id === 'openrouter') { headers['HTTP-Referer'] = 'https://argila.studio'; headers['X-Title'] = 'Argila Studio'; }
  const r = await http({ url: `${base}/chat/completions`, headers, body });
  if (!r.ok) throw new Error(errorOf(r));
  const msg = r.json.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map((c) => {
    let args = {}; try { args = JSON.parse(c.function.arguments || '{}'); } catch {}
    return { id: c.id, name: c.function.name, args };
  });
  return { text: msg.content || '', toolCalls };
}

function toOpenAI(msgs) {
  return msgs.map((m) => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant', content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

function toAnthropic(msgs) {
  const out = [];
  for (const m of msgs) {
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      const last = out[out.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') last.content.push(block);
      else out.push({ role: 'user', content: [block] });
    } else if (m.role === 'assistant') {
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls || []) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args });
      out.push({ role: 'assistant', content });
    } else out.push({ role: 'user', content: m.content });
  }
  return out;
}
