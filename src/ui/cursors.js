// Cursores da IA: um "pool" de ponteiros que voam até onde cada ação acontece.
// Várias ferramentas rodam em paralelo → vários cursores ao mesmo tempo.
const COLORS = ['#ff6a3d', '#3dd6ff', '#b4ff3d', '#ff3dbe', '#ffd23d', '#8f7bff', '#3dffa8', '#ff9f3d'];
const ARROW = (c) => `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2.5 L3 17.5 L7.4 13.4 L10.3 19.6 L13 18.4 L10.2 12.4 L16.3 12.2 Z" fill="${c}" stroke="#0e0f11" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

let layer; const pool = []; const waiters = [];
export const cursorConfig = { count: 4, speed: 1 };

export function initCursors(n = 4) {
  layer = document.createElement('div'); layer.className = 'ai-cursor-layer'; document.body.appendChild(layer);
  setCursorCount(n);
}

export function setCursorCount(n) {
  cursorConfig.count = n;
  while (pool.length < n) {
    const i = pool.length; const color = COLORS[i % COLORS.length];
    const node = document.createElement('div'); node.className = 'ai-cursor';
    node.innerHTML = `${ARROW(color)}<span class="ai-cursor-tag" style="--c:${color}"><em>IA ${i + 1}</em><b></b></span>`;
    layer.appendChild(node);
    pool.push({ i, color, node, busy: false, x: innerWidth - 80, y: innerHeight - 60 - i * 26, visible: false });
  }
}

class Handle {
  constructor(c) { this.c = c; }
  label(text) { this.c.node.querySelector('b').textContent = text; }
  async moveTo(pt, text) {
    if (!pt) return; const c = this.c; if (text) this.label(text);
    if (!c.visible) { c.visible = true; c.node.classList.add('on'); }
    const x0 = c.x, y0 = c.y, x1 = pt.x, y1 = pt.y;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const dur = Math.min(650, 220 + dist * 0.35) / cursorConfig.speed;
    // Curva de Bézier com desvio perpendicular → trajetória natural, não robótica.
    const bend = (c.i % 2 ? 1 : -1) * Math.min(120, dist * 0.18);
    const mx = (x0 + x1) / 2 - ((y1 - y0) / (dist || 1)) * bend, my = (y0 + y1) / 2 + ((x1 - x0) / (dist || 1)) * bend;
    const t0 = performance.now();
    await new Promise((res) => {
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur); const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const u = 1 - e;
        c.x = u * u * x0 + 2 * u * e * mx + e * e * x1; c.y = u * u * y0 + 2 * u * e * my + e * e * y1;
        c.node.style.transform = `translate3d(${c.x}px, ${c.y}px, 0)`;
        k < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    });
  }
  async click() {
    const r = document.createElement('i'); r.className = 'ai-ripple'; r.style.cssText = `left:${this.c.x}px;top:${this.c.y}px;--c:${this.c.color}`;
    layer.appendChild(r); setTimeout(() => r.remove(), 600);
    this.c.node.classList.add('press'); await new Promise((s) => setTimeout(s, 110 / cursorConfig.speed)); this.c.node.classList.remove('press');
  }
  release() {
    const c = this.c; c.busy = false;
    clearTimeout(c.hideT); c.hideT = setTimeout(() => { if (!c.busy) { c.visible = false; c.node.classList.remove('on'); } }, 2200);
    const w = waiters.shift(); if (w) w();
  }
}

export async function acquireCursor() {
  for (;;) {
    const c = pool.slice(0, cursorConfig.count).find((x) => !x.busy);
    if (c) { c.busy = true; clearTimeout(c.hideT); return new Handle(c); }
    await new Promise((r) => waiters.push(r));
  }
}
