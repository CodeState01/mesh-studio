// Logos dos provedores de IA. Usa Simple Icons (CC0) quando a marca existe lá;
// senão, um selo com a inicial na cor da marca. Logos só identificam o serviço.
// Importações nomeadas: o bundler inclui SÓ estes logos (o pacote inteiro tem 3.000+ marcas).
import {
  siAnthropic, siGooglegemini, siMistralai, siHuggingface, siNvidia, siOllama, siCloudflare, siGithub, siPerplexity, siVercel,
  siDeepseek, siQwen, siBaidu, siTencenthy, siBytedance, siMinimax, siOpenrouter, siLmstudio, siVllm, siMoonshotai, siX, siScaleway, siOvh, siClaude,
} from 'simple-icons';

const SI = {
  anthropic: siAnthropic, gemini: siGooglegemini, mistral: siMistralai, huggingface: siHuggingface, nvidia: siNvidia,
  ollama: siOllama, cloudflare: siCloudflare, github: siGithub, perplexity: siPerplexity, vercel: siVercel,
  deepseek: siDeepseek, qwen: siQwen, qianfan: siBaidu, hunyuan: siTencenthy, volcengine: siBytedance,
  minimax: siMinimax, openrouter: siOpenrouter, lmstudio: siLmstudio, vllm: siVllm, moonshot: siMoonshotai,
  xai: siX, scaleway: siScaleway, ovh: siOvh,
  'acct-gemini': siGooglegemini, 'acct-claude': siClaude,
};
// Cores aproximadas das marcas sem ícone livre (só para o selo com inicial).
const TINT = {
  openai: '#10a37f', 'acct-chatgpt': '#10a37f', cohere: '#39594d', groq: '#f55036', cerebras: '#f15a29', sambanova: '#ee7624', together: '#0f6fff',
  fireworks: '#6720ff', deepinfra: '#2e6bf5', hyperbolic: '#6366f1', novita: '#22c55e', nebius: '#d4f72e', lambda: '#7c3aed',
  featherless: '#f59e0b', chutes: '#0ea5e9', friendli: '#3b82f6', kluster: '#14b8a6', parasail: '#0284c7', inferencenet: '#64748b',
  venice: '#c0392b', siliconflow: '#7c3aed', zhipu: '#3859ff', stepfun: '#0052d9', baichuan: '#ff6a00', yi: '#00b386',
  requesty: '#8b5cf6', portkey: '#111827', azure: '#0078d4', ai21: '#ec4899', reka: '#111111', upstage: '#805cfb', writer: '#3d3d3d',
  llamacpp: '#a16207', sglang: '#ef4444', localai: '#22c55e', jan: '#2563eb', koboldcpp: '#9333ea', textgen: '#f97316',
  tabby: '#eab308', gpt4all: '#0ea5e9', llamafile: '#65a30d', xinference: '#2563eb', tgi: '#ffcc4d', aphrodite: '#db2777',
  lemonade: '#facc15', msty: '#6366f1', litellm: '#16a34a', custom: '#6b7280', demo: '#b9f23c',
};

export function providerLogo(p, size = 22) {
  const si = SI[p.id];
  if (si) {
    const hex = '#' + si.hex; const dark = parseInt(si.hex, 16) < 0x333333;
    return `<span class="plogo" style="--pc:${dark ? '#e8e8e8' : hex};width:${size}px;height:${size}px"><svg viewBox="0 0 24 24" width="${size * 0.62}" height="${size * 0.62}" fill="currentColor"><path d="${si.path}"/></svg></span>`;
  }
  const c = TINT[p.id] || '#6b7280';
  const letter = p.id === 'demo' ? '◆' : (p.name.match(/[A-Za-z0-9]/)?.[0] || '?').toUpperCase();
  return `<span class="plogo mono" style="--pc:${c};width:${size}px;height:${size}px;font-size:${size * 0.48}px">${letter}</span>`;
}
