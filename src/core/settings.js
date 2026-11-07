// Configurações persistentes (chaves de API criptografadas no app desktop).
import { bus } from './state.js';

export const settings = {
  provider: 'demo', keys: {}, models: {}, baseURLs: {},
  engines: {},   // { unity: { dir, format, live } , ... }
  prefs: {
    cursors: 4, cursorSpeed: 1,
    exposure: 0.85, bloom: 0.12, uiScale: 1, accent: '#e2703f', reduceMotion: false,
    grid: true, shadows: 'soft', aiOpen: true,
  },
};

export async function loadSettings() {
  try {
    const s = window.argila?.settings ? await window.argila.settings.get() : JSON.parse(localStorage.getItem('argila:settings') || '{}');
    Object.assign(settings, s, { prefs: { ...settings.prefs, ...(s.prefs || {}) }, engines: { ...(s.engines || {}) } });
  } catch {}
  bus.emit('settings', settings);
  return settings;
}

let t;
export function saveSettings() {
  clearTimeout(t);
  t = setTimeout(() => {
    if (window.argila?.settings) window.argila.settings.set(JSON.parse(JSON.stringify(settings)));
    else localStorage.setItem('argila:settings', JSON.stringify(settings));
  }, 150);
  bus.emit('settings', settings);
}

// Aplica preferências visuais da interface (acento, escala, movimento reduzido).
export function applyUIPrefs() {
  const p = settings.prefs; const r = document.documentElement.style;
  r.setProperty('--accent', p.accent);
  r.setProperty('--accent-soft', p.accent + '24');
  document.body.style.zoom = p.uiScale;
  document.documentElement.classList.toggle('reduce-motion', !!p.reduceMotion);
}
