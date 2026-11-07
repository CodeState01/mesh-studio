// Conjunto de ícones próprio (traço 1.5px, grade 20px) — consistente e leve.
const P = {
  select: 'M5 3.5v12l3.2-3 2.3 5 2-.9-2.3-5H15z',
  move: 'M10 2.5v15M2.5 10h15M10 2.5 7.8 4.7M10 2.5l2.2 2.2M10 17.5l-2.2-2.2M10 17.5l2.2-2.2M2.5 10l2.2-2.2M2.5 10l2.2 2.2M17.5 10l-2.2-2.2M17.5 10l-2.2 2.2',
  rotate: 'M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3h-3',
  scale: 'M3.5 16.5 16.5 3.5M11 3.5h5.5V9M3.5 11v5.5H9',
  text: 'M4 5V3.5h12V5M10 3.5v13M7.5 16.5h5',
  cube: 'M10 2.5 16.5 6v8L10 17.5 3.5 14V6zM3.5 6 10 9.5 16.5 6M10 9.5v8',
  light: 'M7 14.5h6M8 17h4M10 2.5a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z',
  camera: 'M3 6.5h9.5v7H3zM12.5 9l4.5-2.5v7L12.5 11',
  spark: 'M10 2.5v4M10 13.5v4M2.5 10h4M13.5 10h4M5 5l2.5 2.5M12.5 12.5 15 15M15 5l-2.5 2.5M7.5 12.5 5 15',
  wave: 'M2.5 10h2l1.5-4 2 9 2-12 2 11 1.5-6 1 2h3',
  play: 'M6 4v12l10-6z',
  pause: 'M6 4h2.5v12H6zM11.5 4H14v12h-2.5z',
  prev: 'M14.5 4.5v11L7 10zM5.5 4.5v11',
  next: 'M5.5 4.5v11L13 10zM14.5 4.5v11',
  key: 'M10 4 16 10l-6 6-6-6z',
  gear: 'M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4',
  send: 'M3 10h11M10 5l5 5-5 5',
  stop: 'M5.5 5.5h9v9h-9z',
  plus: 'M10 4v12M4 10h12',
  eye: 'M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5zM10 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  eyeoff: 'M3 3l14 14M8.2 5.3A7 7 0 0 1 10 5c4.8 0 7.5 5 7.5 5a12 12 0 0 1-2 2.6M5.4 6.6A12 12 0 0 0 2.5 10s2.7 5 7.5 5c1 0 2-.2 2.8-.6',
  trash: 'M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11',
  aperture: 'M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM10 2.5 13 9M17.2 8 10 10.5M14.5 16 9 11.5M5 15.5l2.5-6.5M2.8 8.5 9 8',
  plug: 'M7 2.5v4M13 2.5v4M5 6.5h10v3a5 5 0 0 1-10 0zM10 14.5v3',
  download: 'M10 3v10M6 9l4 4 4-4M4 16.5h12',
  upload: 'M10 13V3M6 7l4-4 4 4M4 16.5h12',
  film: 'M3.5 3.5h13v13h-13zM3.5 7h13M3.5 13h13M7 3.5V7M13 3.5V7M7 13v3.5M13 13v3.5',
  layers: 'M10 2.5 17.5 6.5 10 10.5 2.5 6.5zM2.5 10 10 14l7.5-4M2.5 13.5 10 17.5l7.5-4',
  sliders: 'M4 5.5h7M14 5.5h2M4 14.5h2M9 14.5h7M11 3.5v4M6 12.5v4',
  mesh: 'M3 3h14v14H3zM3 10h14M10 3v14M3 3l14 14',
  chat: 'M3.5 4h13v9h-7l-4 3v-3h-2z',
  scissors: 'M6 6.5a2 2 0 1 0 0-.1M6 13.5a2 2 0 1 0 0 .1M7.7 7.5 16 15M7.7 12.5 16 5',
  undo: 'M7 5 3.5 8.5 7 12M3.5 8.5H12a4.5 4.5 0 0 1 0 9H9',
  redo: 'M13 5l3.5 3.5L13 12M16.5 8.5H8a4.5 4.5 0 0 0 0 9h3',
  frame: 'M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4',
  globe: 'M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM2.5 10h15M10 2.5c2.2 2.3 2.2 12.7 0 15M10 2.5c-2.2 2.3-2.2 12.7 0 15',
  texture: 'M3.5 3.5h13v13h-13zM3.5 10h6.5v6.5M10 3.5v6.5h6.5',
  modifier: 'M10 2.5 12 7l5 .5-3.8 3.3 1.2 4.9L10 13l-4.4 2.7 1.2-4.9L3 7.5 8 7z',
  check: 'M4 10.5 8 14.5 16 5.5',
  home: 'M3 9.5 10 3.5l7 6V16.5H12.5v-4h-5v4H3z',
  brush: 'M13.5 3.5 16.5 6.5 9 14l-3-3zM6 11c-2 0-3 1.5-3 3.5 0 1-.5 2-1 2.5 3 .5 6-.5 6-3',
  code: 'M7 6 3 10l4 4M13 6l4 4-4 4M11 4.5 9 15.5',
  bag: 'M4 6.5h12l-1 10H5zM7.5 6.5V5a2.5 2.5 0 0 1 5 0v1.5',
  engine: 'M3.5 7.5h3l1.5-2h4l1.5 2h3v6h-3l-1.5 2h-4l-1.5-2h-3zM10 8.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  list: 'M7 5.5h9.5M7 10h9.5M7 14.5h9.5M3.5 5.5h.01M3.5 10h.01M3.5 14.5h.01',
  extrude: 'M4 13.5h12v3H4zM6 13.5V7h8v6.5M10 7V3M8 5l2-2 2 2',
  boolean: 'M8 4.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 5.5a5 5 0 1 1 0 10',
  copy: 'M7 7h9.5v9.5H7zM13 7V3.5H3.5V13H7',
  search: 'M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12.5 12.5l4 4',
  folder: 'M3 5.5h5l1.5 1.5h7.5v9H3z',
  sun: 'M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.3 4.3l1 1M14.7 14.7l1 1M4.3 15.7l1-1M14.7 5.3l1-1',
  face: 'M4 4h12v12H4z',
  vertex: 'M10 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3 3l5 5M17 3l-5 5M3 17l5-5M17 17l-5-5',
};

export const icon = (name, size = 18) =>
  `<svg class="i" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${P[name] || ''}"/></svg>`;

// Logo do Argila: um "seixo" de argila com sulcos de dedo — orgânico, feito à mão.
export const LOGO_PATHS = `
  <path d="M16.4 3.2c7 .2 12.3 5.2 12.1 12.3-.2 7.6-6.1 13.5-13.3 13.3C8 28.6 3.4 23.2 3.5 16.4 3.7 8.6 9.3 3 16.4 3.2z" fill="#e2703f"/>
  <path d="M8.2 20.6c4.8-.6 9.8-5.2 13.2-11.8" stroke="#3a1608" stroke-width="2.4" stroke-linecap="round" opacity=".5"/>
  <path d="M12.6 24.4c3.6-1.2 7.4-4.4 10.2-9.4" stroke="#3a1608" stroke-width="1.8" stroke-linecap="round" opacity=".3"/>`;
export const LOGO = (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" fill="none" aria-label="Argila">${LOGO_PATHS}</svg>`;
