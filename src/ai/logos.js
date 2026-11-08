// Logos dos provedores de IA, em 3 camadas (todas só identificam o serviço):
//   1. LobeHub Icons (MIT) — coleção dedicada a marcas de IA (OpenAI, Groq, Cohere, Together…)
//   2. Simple Icons (CC0) — marcas gerais (Scaleway, OVH…)
//   3. Avatar oficial da organização no GitHub (src/assets/logos) — ferramentas locais sem SVG público
// Sem nenhum dos três: selo com a inicial na cor da marca.
import { siScaleway, siOvh, siOllama, siGithubcopilot } from 'simple-icons';

// Importação explícita (não o pacote inteiro): o bundle leva só estes ~70 SVGs.
const LOBE = import.meta.glob([
  '/node_modules/@lobehub/icons-static-svg/icons/{openai,anthropic,xai,groq,ai21,reka,nebius,lambda,chutes,friendli,parasail,inference,moonshot,vercel,ollama,lmstudio,github,githubcopilot,grok,codex}.svg',
  '/node_modules/@lobehub/icons-static-svg/icons/{claude,gemini,mistral,deepseek,cohere,perplexity,upstage,cerebras,sambanova,together,fireworks,deepinfra,hyperbolic,novita,featherless,kluster,venice,siliconcloud,zhipu,qwen,minimax,stepfun,baichuan,yi,volcengine,wenxin,hunyuan,openrouter,azure,cloudflare,vllm,xinference,huggingface,nvidia,geminicli}-color.svg',
], { query: '?raw', import: 'default', eager: true });
const lobe = (name) => LOBE[`/node_modules/@lobehub/icons-static-svg/icons/${name}-color.svg`] || LOBE[`/node_modules/@lobehub/icons-static-svg/icons/${name}.svg`];
const PNG = import.meta.glob('../assets/logos/*.{png,jpg}', { query: '?url', import: 'default', eager: true });
const png = (id) => PNG[`../assets/logos/${id}.png`] || PNG[`../assets/logos/${id}.jpg`];

// id do provedor → nome do ícone na LobeHub
const LOBE_ID = {
  openai: 'openai', anthropic: 'anthropic', gemini: 'gemini', xai: 'xai', mistral: 'mistral', deepseek: 'deepseek', cohere: 'cohere',
  ai21: 'ai21', perplexity: 'perplexity', reka: 'reka', upstage: 'upstage', groq: 'groq', cerebras: 'cerebras', sambanova: 'sambanova',
  together: 'together', fireworks: 'fireworks', deepinfra: 'deepinfra', hyperbolic: 'hyperbolic', novita: 'novita', nebius: 'nebius',
  lambda: 'lambda', nvidia: 'nvidia', huggingface: 'huggingface', github: 'github', featherless: 'featherless', chutes: 'chutes',
  friendli: 'friendli', kluster: 'kluster', parasail: 'parasail', inferencenet: 'inference', venice: 'venice', siliconflow: 'siliconcloud',
  moonshot: 'moonshot', zhipu: 'zhipu', qwen: 'qwen', minimax: 'minimax', stepfun: 'stepfun', baichuan: 'baichuan', yi: 'yi',
  volcengine: 'volcengine', qianfan: 'wenxin', hunyuan: 'hunyuan', openrouter: 'openrouter', vercel: 'vercel', azure: 'azure',
  cloudflare: 'cloudflare', ollama: 'ollama', lmstudio: 'lmstudio', vllm: 'vllm', xinference: 'xinference',
  'acct-gemini': 'geminicli', 'acct-claude': 'claude', 'acct-chatgpt': 'codex', 'acct-qwen': 'qwen', 'acct-copilot': 'githubcopilot',
};
const SI = { scaleway: siScaleway, ovh: siOvh, ollama: siOllama, 'acct-copilot': siGithubcopilot };

// Cores das marcas (para o fundo do selo e para ícones monocromáticos)
const TINT = {
  openai: '#e8e8e8', 'acct-chatgpt': '#e8e8e8', anthropic: '#d97757', xai: '#e8e8e8', groq: '#f55036', ai21: '#ec4899', reka: '#e8e8e8',
  nebius: '#d4f72e', lambda: '#a78bfa', chutes: '#0ea5e9', friendli: '#3b82f6', parasail: '#38bdf8', inferencenet: '#94a3b8',
  moonshot: '#e8e8e8', vercel: '#e8e8e8', ollama: '#e8e8e8', lmstudio: '#6366f1', github: '#e8e8e8', 'acct-copilot': '#e8e8e8',
  writer: '#3d3d3d', requesty: '#2563eb', portkey: '#e11d48', localai: '#22c55e', koboldcpp: '#9333ea', textgen: '#f97316',
  gpt4all: '#0ea5e9', litellm: '#16a34a', msty: '#6366f1', custom: '#6b7280', demo: '#b9f23c',
};

export function providerLogo(p, size = 22) {
  const box = (inner, c = TINT[p.id] || '#9aa0aa', cls = '') => `<span class="plogo ${cls}" style="--pc:${c};width:${size}px;height:${size}px">${inner}</span>`;
  const svg = LOBE_ID[p.id] && lobe(LOBE_ID[p.id]);
  if (svg) return box(svg.replace(/<title>.*?<\/title>/, '').replace(/height="1em"/, `height="${size * 0.64}"`).replace(/width="1em"/, `width="${size * 0.64}"`));
  const si = SI[p.id];
  if (si) { const dark = parseInt(si.hex, 16) < 0x333333; return box(`<svg viewBox="0 0 24 24" width="${size * 0.62}" height="${size * 0.62}" fill="currentColor"><path d="${si.path}"/></svg>`, dark ? '#e8e8e8' : '#' + si.hex); }
  const img = png(p.id);
  if (img) return box(`<img src="${img}" alt="" width="${size}" height="${size}" style="border-radius:7px;display:block">`, '#ffffff', 'img');
  const letter = p.id === 'demo' ? '◆' : (p.name.match(/[A-Za-z0-9]/)?.[0] || '?').toUpperCase();
  return `<span class="plogo mono" style="--pc:${TINT[p.id] || '#6b7280'};width:${size}px;height:${size}px;font-size:${size * 0.48}px">${letter}</span>`;
}
