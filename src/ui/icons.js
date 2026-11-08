// Ícones: Lucide (ISC) — 2.300+ ícones consistentes. Nomes curtos do app → ícone Lucide.
import { icons as L } from 'lucide';

const ALIAS = {
  select: 'MousePointer2', move: 'Move', rotate: 'RotateCw', scale: 'Scaling', text: 'Type', cube: 'Box',
  light: 'Lightbulb', camera: 'Video', spark: 'Sparkles', wave: 'AudioWaveform', play: 'Play', pause: 'Pause',
  prev: 'SkipBack', next: 'SkipForward', key: 'Diamond', gear: 'Settings', send: 'ArrowUp', stop: 'Square',
  plus: 'Plus', eye: 'Eye', eyeoff: 'EyeOff', trash: 'Trash2', aperture: 'Aperture', plug: 'Plug', download: 'Download',
  upload: 'Upload', film: 'Film', layers: 'Layers', sliders: 'SlidersHorizontal', mesh: 'Grid3x3', chat: 'MessageSquare',
  scissors: 'Scissors', undo: 'Undo2', redo: 'Redo2', frame: 'Scan', globe: 'Globe', texture: 'Palette', modifier: 'Wand2',
  check: 'Check', home: 'House', brush: 'Brush', code: 'Code', bag: 'ShoppingBag', engine: 'Gamepad2', list: 'ListTree',
  extrude: 'ArrowUpFromLine', boolean: 'SquaresUnite', copy: 'Copy', search: 'Search', folder: 'FolderOpen', sun: 'Sun',
  face: 'Square', vertex: 'CircleDot', edge: 'Slash', magnet: 'Magnet', ruler: 'Ruler', crosshair: 'Crosshair',
  pivot: 'LocateFixed', axis: 'Axis3d', bone: 'Bone', physics: 'Atom', cloth: 'Shirt', uv: 'LayoutGrid', paint: 'Paintbrush',
  graph: 'ChartSpline', close: 'X', chevron: 'ChevronDown', chevronR: 'ChevronRight', menu: 'Menu', file: 'File', save: 'Save',
  image: 'Image', bevel: 'Squircle', loopcut: 'SeparatorHorizontal', inset: 'SquareDashed', merge: 'Merge', knife: 'Slice',
  proportional: 'CircleDashed', local: 'Compass', world: 'Earth', cursor3d: 'Target', measure: 'Ruler', snapGrid: 'Grid2x2',
  sparkle: 'WandSparkles', render: 'Clapperboard', material: 'Circle', object: 'Shapes', modifiers: 'Wrench', info: 'Info',
  lock: 'Lock', unlock: 'LockOpen', link: 'Link', align: 'AlignCenterHorizontal', distribute: 'AlignHorizontalDistributeCenter',
  parent: 'GitBranch', group: 'Group', ungroup: 'Ungroup', shade: 'Contrast', wire: 'Hexagon', solid: 'Circle', bot: 'Bot',
  keyboard: 'Keyboard', monitor: 'Monitor', zap: 'Zap', refresh: 'RefreshCw', external: 'ExternalLink', star: 'Star',
  cpu: 'Cpu', cloud: 'Cloud', terminal: 'Terminal', expand: 'Maximize2', collapse: 'Minimize2', pin: 'Pin', dot: 'Dot',
  grab: 'Hand', smooth: 'Waves', flatten: 'Minus', inflate: 'CirclePlus', dig: 'CircleMinus', loop: 'Repeat', bake: 'Flame',
  weight: 'Weight', pose: 'PersonStanding', curve: 'Spline', sphere: 'Globe2', cylinder: 'Cylinder', cone: 'Cone', torus: 'Donut',
  plane: 'RectangleHorizontal', capsule: 'Pill', ring: 'CircleDot', torusknot: 'Infinity', icosphere: 'Hexagon', pyramid: 'Pyramid',
  point: 'Lightbulb', spot: 'Flashlight', directional: 'Sun', area: 'PanelTop', hemisphere: 'CloudSun',
  fire: 'Flame', smoke: 'CloudFog', sparks: 'Sparkles', snow: 'Snowflake', magic: 'WandSparkles', rain: 'CloudRain', confetti: 'PartyPopper', dust: 'Wind',
};

const cache = new Map();
export function icon(name, size = 18, stroke = 1.75) {
  const k = name + size + stroke; if (cache.has(k)) return cache.get(k);
  const node = L[ALIAS[name] || name] || L.Circle;
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([a, v]) => `${a}="${v}"`).join(' ')}/>`).join('');
  const svg = `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  cache.set(k, svg); return svg;
}

// Logo do Argila: seixo de argila com marcas de dedo.
export const LOGO_PATHS = `<path d="M16.4 3.2c7 .2 12.3 5.2 12.1 12.3-.2 7.6-6.1 13.5-13.3 13.3C8 28.6 3.4 23.2 3.5 16.4 3.7 8.6 9.3 3 16.4 3.2z" fill="#e2703f"/><path d="M8.2 20.6c4.8-.6 9.8-5.2 13.2-11.8" stroke="#3a1608" stroke-width="2.4" stroke-linecap="round" opacity=".5"/><path d="M12.6 24.4c3.6-1.2 7.4-4.4 10.2-9.4" stroke="#3a1608" stroke-width="1.8" stroke-linecap="round" opacity=".3"/>`;
export const LOGO = (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" fill="none" aria-label="Argila">${LOGO_PATHS}</svg>`;
