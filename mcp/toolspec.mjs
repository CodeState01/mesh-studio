// Fonte única da verdade para as ferramentas da cena.
// Usada pelo servidor MCP (mcp/server.mjs) E pelo agente interno (src/ai/agent.js).
// Para adicionar uma ferramenta: declare aqui + implemente em src/core/tools.js.

const vec3 = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const target = { type: 'string', description: 'Nome ou id do objeto' };

export const TOOLS = [
  {
    name: 'scene_info',
    description: 'Lista objetos da cena (id, nome, tipo, transformações), duração da timeline e clipes de vídeo.',
    input_schema: { type: 'object', properties: {} },
    ui: 'outliner',
  },
  {
    name: 'add_primitive',
    description: 'Adiciona uma malha primitiva à cena.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['cube', 'sphere', 'icosphere', 'cylinder', 'cone', 'torus', 'torusknot', 'plane', 'capsule', 'ring'] },
        name: { type: 'string' },
        position: vec3, rotation: { ...vec3, description: 'graus' }, scale: vec3,
        color: { type: 'string', description: 'hex, ex: #ff6a3d' },
      },
      required: ['type'],
    },
    ui: 'add',
  },
  {
    name: 'add_text',
    description: 'Cria texto 3D extrudado (bom para motion graphics/títulos).',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' }, name: { type: 'string' },
        size: { type: 'number' }, depth: { type: 'number' },
        position: vec3, rotation: vec3, color: { type: 'string' },
        emissive: { type: 'number', description: 'intensidade de brilho 0-5' },
      },
      required: ['text'],
    },
    ui: 'text',
  },
  {
    name: 'add_light',
    description: 'Adiciona uma luz.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['point', 'spot', 'directional', 'area', 'hemisphere'] },
        color: { type: 'string' }, intensity: { type: 'number' }, position: vec3, name: { type: 'string' },
      },
      required: ['type'],
    },
    ui: 'add',
  },
  {
    name: 'add_camera',
    description: 'Adiciona uma câmera e opcionalmente a torna ativa para render.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, position: vec3, look_at: vec3, fov: { type: 'number' }, active: { type: 'boolean' } },
    },
    ui: 'add',
  },
  {
    name: 'transform',
    description: 'Define posição/rotação(graus)/escala de um objeto.',
    input_schema: { type: 'object', properties: { target, position: vec3, rotation: vec3, scale: vec3 }, required: ['target'] },
    ui: 'viewport',
  },
  {
    name: 'set_material',
    description: 'Altera material PBR de um objeto. texture aceita procedurais.',
    input_schema: {
      type: 'object',
      properties: {
        target, color: { type: 'string' },
        metalness: { type: 'number' }, roughness: { type: 'number' },
        emissive: { type: 'string' }, emissive_intensity: { type: 'number' },
        opacity: { type: 'number' }, wireframe: { type: 'boolean' },
        texture: { type: 'string', enum: ['none', 'checker', 'grid', 'noise', 'marble', 'wood', 'bricks', 'brushed', 'uv', 'camo', 'tiles'] },
        texture_scale: { type: 'number' },
      },
      required: ['target'],
    },
    ui: 'material',
  },
  {
    name: 'add_modifier',
    description: 'Aplica modificador: array, mirror, subdivide, decimate, twist, bend.',
    input_schema: {
      type: 'object',
      properties: {
        target, type: { type: 'string', enum: ['array', 'mirror', 'subdivide', 'decimate', 'twist', 'bend'] },
        count: { type: 'number' }, offset: vec3, axis: { type: 'string', enum: ['x', 'y', 'z'] }, amount: { type: 'number' },
      },
      required: ['target', 'type'],
    },
    ui: 'modifiers',
  },
  {
    name: 'delete_object',
    description: 'Remove um objeto.',
    input_schema: { type: 'object', properties: { target }, required: ['target'] },
    ui: 'outliner',
  },
  {
    name: 'add_keyframe',
    description: 'Insere keyframe num tempo (segundos). Valores omitidos usam o estado atual.',
    input_schema: {
      type: 'object',
      properties: {
        target, time: { type: 'number' }, position: vec3, rotation: vec3, scale: vec3,
        opacity: { type: 'number' },
        ease: { type: 'string', enum: ['linear', 'easeIn', 'easeOut', 'easeInOut', 'back', 'elastic', 'bounce'] },
      },
      required: ['target', 'time'],
    },
    ui: 'timeline',
  },
  {
    name: 'motion_preset',
    description: 'Aplica animação pronta (motion design) a um objeto.',
    input_schema: {
      type: 'object',
      properties: {
        target, preset: { type: 'string', enum: ['pop_in', 'slide_up', 'slide_left', 'spin', 'bounce', 'float', 'pulse', 'drop', 'orbit', 'fade_out'] },
        start: { type: 'number' }, duration: { type: 'number' },
      },
      required: ['target', 'preset'],
    },
    ui: 'timeline',
  },
  {
    name: 'set_timeline',
    description: 'Configura duração (s), fps e tempo atual da timeline.',
    input_schema: { type: 'object', properties: { duration: { type: 'number' }, fps: { type: 'number' }, time: { type: 'number' }, play: { type: 'boolean' } } },
    ui: 'timeline',
  },
  {
    name: 'add_vfx',
    description: 'Adiciona sistema de partículas VFX.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['fire', 'smoke', 'sparks', 'snow', 'magic', 'rain', 'confetti', 'dust'] },
        position: vec3, color: { type: 'string' }, rate: { type: 'number' }, size: { type: 'number' }, name: { type: 'string' },
      },
      required: ['type'],
    },
    ui: 'vfx',
  },
  {
    name: 'add_sfx',
    description: 'Adiciona efeito sonoro sintetizado na trilha de áudio, no tempo indicado.',
    input_schema: {
      type: 'object',
      properties: {
        preset: { type: 'string', enum: ['whoosh', 'impact', 'click', 'rise', 'pop', 'beep', 'boom', 'shimmer', 'glitch'] },
        time: { type: 'number' }, volume: { type: 'number' },
      },
      required: ['preset'],
    },
    ui: 'audio',
  },
  {
    name: 'set_environment',
    description: 'Mundo: cor de fundo, névoa, bloom, exposição, céu.',
    input_schema: {
      type: 'object',
      properties: {
        background: { type: 'string' }, fog: { type: 'number', description: 'densidade 0-0.2' },
        bloom: { type: 'number', description: '0-3' }, exposure: { type: 'number' },
        sky: { type: 'string', enum: ['none', 'studio', 'sunset', 'night', 'overcast'] },
      },
    },
    ui: 'world',
  },
  {
    name: 'video_add_clip',
    description: 'Adiciona clipe ao editor de vídeo: scene (render 3D), title (texto 2D animado) ou color (sólido).',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['scene', 'title', 'color'] },
        track: { type: 'number' }, start: { type: 'number' }, duration: { type: 'number' },
        text: { type: 'string' }, color: { type: 'string' },
        transition: { type: 'string', enum: ['none', 'fade', 'slide', 'zoom'] },
      },
      required: ['kind'],
    },
    ui: 'video',
  },
  {
    name: 'screenshot',
    description: 'Renderiza o viewport e retorna imagem PNG (base64).',
    input_schema: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } } },
    ui: 'render',
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
