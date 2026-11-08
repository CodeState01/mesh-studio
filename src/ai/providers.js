// Registro de provedores de IA. A maioria fala o dialeto OpenAI (/chat/completions),
// então adicionar um provedor novo = adicionar uma linha aqui.
// format: 'openai' | 'anthropic'   local: roda na máquina (sem chave)

const P = (id, name, baseURL, model, extra = {}) => ({ id, name, baseURL, model, format: 'openai', local: false, ...extra });
const L = (id, name, baseURL, model = '') => P(id, name, baseURL, model, { local: true, keyOptional: true });

export const PROVIDERS = [
  // ---- Suas contas (assinatura) — sem chave de API, via ferramentas oficiais + MCP do Mesh ----
  { id: 'acct-gemini', name: 'Gemini (sua conta Google)', format: 'account', cli: 'gemini', account: true, keyOptional: true, local: false, model: '' },
  { id: 'acct-claude', name: 'Claude (sua conta Pro/Max)', format: 'account', cli: 'claude', account: true, keyOptional: true, local: false, model: '' },
  { id: 'acct-chatgpt', name: 'ChatGPT (sua conta Plus/Pro)', format: 'account', cli: 'codex', account: true, keyOptional: true, local: false, model: '' },
  { id: 'acct-qwen', name: 'Qwen (sua conta Qwen, grátis)', format: 'account', cli: 'qwen', account: true, keyOptional: true, local: false, model: '' },
  { id: 'acct-copilot', name: 'GitHub Copilot (sua assinatura)', format: 'account', cli: 'copilot', account: true, keyOptional: true, local: false, model: '' },
  // ---- Nuvem: grandes laboratórios ----
  P('anthropic', 'Anthropic', 'https://api.anthropic.com/v1', 'claude-sonnet-5-5', { format: 'anthropic' }),
  P('openai', 'OpenAI', 'https://api.openai.com/v1', 'gpt-4.1'),
  P('gemini', 'Google Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-2.5-flash'),
  P('xai', 'xAI Grok', 'https://api.x.ai/v1', 'grok-3'),
  P('mistral', 'Mistral AI', 'https://api.mistral.ai/v1', 'mistral-large-latest'),
  P('deepseek', 'DeepSeek', 'https://api.deepseek.com/v1', 'deepseek-chat'),
  P('cohere', 'Cohere', 'https://api.cohere.ai/compatibility/v1', 'command-a-03-2025'),
  P('ai21', 'AI21 Labs', 'https://api.ai21.com/studio/v1', 'jamba-large'),
  P('perplexity', 'Perplexity', 'https://api.perplexity.ai', 'sonar-pro'),
  P('reka', 'Reka', 'https://api.reka.ai/v1', 'reka-core'),
  P('upstage', 'Upstage Solar', 'https://api.upstage.ai/v1', 'solar-pro'),
  P('writer', 'Writer Palmyra', 'https://api.writer.com/v1', 'palmyra-x5'),
  // ---- Nuvem: inferência rápida / hospedagem de modelos abertos ----
  P('groq', 'Groq', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'),
  P('cerebras', 'Cerebras', 'https://api.cerebras.ai/v1', 'llama-3.3-70b'),
  P('sambanova', 'SambaNova', 'https://api.sambanova.ai/v1', 'Meta-Llama-3.3-70B-Instruct'),
  P('together', 'Together AI', 'https://api.together.xyz/v1', 'meta-llama/Llama-3.3-70B-Instruct-Turbo'),
  P('fireworks', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1', 'accounts/fireworks/models/llama-v3p3-70b-instruct'),
  P('deepinfra', 'DeepInfra', 'https://api.deepinfra.com/v1/openai', 'meta-llama/Llama-3.3-70B-Instruct'),
  P('hyperbolic', 'Hyperbolic', 'https://api.hyperbolic.xyz/v1', 'meta-llama/Llama-3.3-70B-Instruct'),
  P('novita', 'Novita AI', 'https://api.novita.ai/v3/openai', 'meta-llama/llama-3.3-70b-instruct'),
  P('nebius', 'Nebius AI Studio', 'https://api.studio.nebius.com/v1', 'meta-llama/Llama-3.3-70B-Instruct'),
  P('lambda', 'Lambda', 'https://api.lambda.ai/v1', 'llama3.3-70b-instruct-fp8'),
  P('nvidia', 'NVIDIA NIM', 'https://integrate.api.nvidia.com/v1', 'meta/llama-3.3-70b-instruct'),
  P('huggingface', 'Hugging Face', 'https://router.huggingface.co/v1', 'meta-llama/Llama-3.3-70B-Instruct'),
  P('github', 'GitHub Models', 'https://models.inference.ai.azure.com', 'gpt-4o'),
  P('featherless', 'Featherless', 'https://api.featherless.ai/v1', 'meta-llama/Llama-3.3-70B-Instruct'),
  P('chutes', 'Chutes', 'https://llm.chutes.ai/v1', 'deepseek-ai/DeepSeek-V3'),
  P('friendli', 'FriendliAI', 'https://api.friendli.ai/serverless/v1', 'meta-llama-3.3-70b-instruct'),
  P('kluster', 'kluster.ai', 'https://api.kluster.ai/v1', 'klusterai/Meta-Llama-3.3-70B-Instruct-Turbo'),
  P('parasail', 'Parasail', 'https://api.parasail.io/v1', 'parasail-llama-33-70b-fp8'),
  P('inferencenet', 'Inference.net', 'https://api.inference.net/v1', 'meta-llama/llama-3.3-70b-instruct/fp-8'),
  P('scaleway', 'Scaleway', 'https://api.scaleway.ai/v1', 'llama-3.3-70b-instruct'),
  P('ovh', 'OVHcloud AI', 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', 'Meta-Llama-3_3-70B-Instruct'),
  P('venice', 'Venice AI', 'https://api.venice.ai/api/v1', 'llama-3.3-70b'),
  P('siliconflow', 'SiliconFlow', 'https://api.siliconflow.cn/v1', 'deepseek-ai/DeepSeek-V3'),
  // ---- Ásia ----
  P('moonshot', 'Moonshot Kimi', 'https://api.moonshot.ai/v1', 'kimi-k2-0711-preview'),
  P('zhipu', 'Zhipu GLM', 'https://open.bigmodel.cn/api/paas/v4', 'glm-4.5'),
  P('qwen', 'Alibaba Qwen', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', 'qwen-max'),
  P('minimax', 'MiniMax', 'https://api.minimax.io/v1', 'MiniMax-M1'),
  P('stepfun', 'StepFun', 'https://api.stepfun.com/v1', 'step-2-16k'),
  P('baichuan', 'Baichuan', 'https://api.baichuan-ai.com/v1', 'Baichuan4'),
  P('yi', '01.AI Yi', 'https://api.lingyiwanwu.com/v1', 'yi-lightning'),
  P('volcengine', 'Volcengine Ark', 'https://ark.cn-beijing.volces.com/api/v3', 'doubao-pro-32k'),
  P('qianfan', 'Baidu Qianfan', 'https://qianfan.baidubce.com/v2', 'ernie-4.0-8k'),
  P('hunyuan', 'Tencent Hunyuan', 'https://api.hunyuan.cloud.tencent.com/v1', 'hunyuan-turbo'),
  // ---- Gateways / roteadores ----
  P('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'anthropic/claude-sonnet-5.5'),
  P('vercel', 'Vercel AI Gateway', 'https://ai-gateway.vercel.sh/v1', 'openai/gpt-4.1'),
  P('requesty', 'Requesty', 'https://router.requesty.ai/v1', 'openai/gpt-4.1'),
  P('portkey', 'Portkey', 'https://api.portkey.ai/v1', 'gpt-4.1'),
  P('azure', 'Azure OpenAI (custom URL)', 'https://SEU-RECURSO.openai.azure.com/openai/v1', 'gpt-4.1'),
  P('cloudflare', 'Cloudflare Workers AI', 'https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
  // ---- Modelos locais (sem chave) ----
  L('ollama', 'Ollama', 'http://localhost:11434/v1', 'llama3.2'),
  L('lmstudio', 'LM Studio', 'http://localhost:1234/v1'),
  L('llamacpp', 'llama.cpp server', 'http://localhost:8080/v1'),
  L('vllm', 'vLLM', 'http://localhost:8000/v1'),
  L('sglang', 'SGLang', 'http://localhost:30000/v1'),
  L('localai', 'LocalAI', 'http://localhost:8080/v1'),
  L('jan', 'Jan', 'http://localhost:1337/v1'),
  L('koboldcpp', 'KoboldCpp', 'http://localhost:5001/v1'),
  L('textgen', 'text-generation-webui', 'http://localhost:5000/v1'),
  L('tabby', 'TabbyAPI', 'http://localhost:5000/v1'),
  L('gpt4all', 'GPT4All', 'http://localhost:4891/v1'),
  L('llamafile', 'llamafile', 'http://localhost:8080/v1'),
  L('xinference', 'Xinference', 'http://localhost:9997/v1'),
  L('tgi', 'HF TGI', 'http://localhost:8080/v1'),
  L('aphrodite', 'Aphrodite Engine', 'http://localhost:2242/v1'),
  L('lemonade', 'Lemonade Server', 'http://localhost:8000/api/v1'),
  L('msty', 'Msty', 'http://localhost:10000/v1'),
  L('litellm', 'LiteLLM Proxy', 'http://localhost:4000/v1'),
  L('custom', 'Personalizado (OpenAI-compatível)', 'http://localhost:8080/v1'),
  // ---- Offline: demonstração sem modelo ----
  { id: 'demo', name: 'Demo (offline, sem IA)', format: 'demo', local: true, keyOptional: true, baseURL: '', model: 'demo' },
];

// Página oficial onde o usuário entra NA PRÓPRIA CONTA e cria a chave. O Mesh abre essa página numa
// janela com sessão persistente; ao fechar, detecta a chave copiada. Login "de verdade" (OAuth) onde existe.
export const KEY_PAGES = {
  anthropic: 'https://console.anthropic.com/settings/keys', openai: 'https://platform.openai.com/api-keys', gemini: 'https://aistudio.google.com/apikey',
  xai: 'https://console.x.ai', mistral: 'https://console.mistral.ai/api-keys', deepseek: 'https://platform.deepseek.com/api_keys',
  cohere: 'https://dashboard.cohere.com/api-keys', ai21: 'https://studio.ai21.com/account/api-key', perplexity: 'https://www.perplexity.ai/account/api/keys',
  reka: 'https://platform.reka.ai/apikeys', upstage: 'https://console.upstage.ai/api-keys', writer: 'https://app.writer.com/aistudio',
  groq: 'https://console.groq.com/keys', cerebras: 'https://cloud.cerebras.ai/platform', sambanova: 'https://cloud.sambanova.ai/apis',
  together: 'https://api.together.ai/settings/api-keys', fireworks: 'https://fireworks.ai/account/api-keys', deepinfra: 'https://deepinfra.com/dash/api_keys',
  hyperbolic: 'https://app.hyperbolic.xyz/settings', novita: 'https://novita.ai/settings/key-management', nebius: 'https://studio.nebius.com/settings/api-keys',
  lambda: 'https://cloud.lambda.ai/api-keys', nvidia: 'https://build.nvidia.com/settings/api-keys', huggingface: 'https://huggingface.co/settings/tokens',
  github: 'https://github.com/settings/personal-access-tokens', featherless: 'https://featherless.ai/account/api-keys', chutes: 'https://chutes.ai/app/api',
  friendli: 'https://friendli.ai/suite/setting/tokens', kluster: 'https://platform.kluster.ai/apikeys', parasail: 'https://www.saas.parasail.io/keys',
  inferencenet: 'https://inference.net/dashboard/api-keys', scaleway: 'https://console.scaleway.com/iam/api-keys', ovh: 'https://endpoints.ai.cloud.ovh.net',
  venice: 'https://venice.ai/settings/api', siliconflow: 'https://cloud.siliconflow.cn/account/ak', moonshot: 'https://platform.moonshot.ai/console/api-keys',
  zhipu: 'https://open.bigmodel.cn/usercenter/apikeys', qwen: 'https://bailian.console.alibabacloud.com/?apiKey=1', minimax: 'https://www.minimax.io/platform/user-center/basic-information/interface-key',
  stepfun: 'https://platform.stepfun.com/interface-key', baichuan: 'https://platform.baichuan-ai.com/console/apikey', yi: 'https://platform.lingyiwanwu.com/apikeys',
  volcengine: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey', qianfan: 'https://console.bce.baidu.com/iam/#/iam/apikey/list', hunyuan: 'https://console.cloud.tencent.com/hunyuan/api-key',
  openrouter: 'https://openrouter.ai/settings/keys', vercel: 'https://vercel.com/dashboard/ai-gateway', requesty: 'https://app.requesty.ai/api-keys',
  portkey: 'https://app.portkey.ai/api-keys', azure: 'https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI', cloudflare: 'https://dash.cloudflare.com/profile/api-tokens',
};
// Como cada provedor faz login: 'cli' (assinatura via ferramenta oficial), 'oauth' (login no navegador que devolve a chave),
// 'ghcli' (reaproveita o login do GitHub CLI), 'console' (entra na conta e cria a chave), 'local' (detecta o servidor no PC).
export const authOf = (p) => (p.format === 'account' ? 'cli' : p.id === 'openrouter' ? 'oauth' : p.id === 'github' ? 'ghcli' : p.local ? 'local' : 'console');

export const getProvider = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
