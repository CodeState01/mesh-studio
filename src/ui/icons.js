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

// Logo do Mesh: uma malha de quads levemente curvada (4×4 vértices), com uma face
// e um vértice selecionados — o gesto central de quem modela.
const R = [
  [[7, 9], [13, 7.6], [19, 7.6], [25, 9]],
  [[6, 14.6], [12.6, 13.6], [19.4, 13.6], [26, 14.6]],
  [[6, 20.2], [12.6, 19.6], [19.4, 19.6], [26, 20.2]],
  [[7, 25.6], [13, 26.2], [19, 26.2], [25, 25.6]],
];
const poly = (pts) => 'M' + pts.map((p) => p.join(' ')).join('L');
export const LOGO_PATHS =
  `<path d="${poly([R[1][1], R[1][2], R[2][2], R[2][1]])}Z" fill="#b9f23c" opacity=".3"/>` +
  `<path d="${[0, 1, 2, 3].map((i) => poly(R[i])).join('')}${[0, 1, 2, 3].map((j) => poly(R.map((r) => r[j]))).join('')}" stroke="#e8e8e3" stroke-width="1.4" stroke-linejoin="round" opacity=".85"/>` +
  R.flat().map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.35" fill="#e8e8e3"/>`).join('') +
  `<circle cx="19.4" cy="13.6" r="2.5" fill="#b9f23c"/>`;
export const LOGO = (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" fill="none" aria-label="Mesh">${LOGO_PATHS}</svg>`;
