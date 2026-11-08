// Layout livre: arraste qualquer painel pela barrinha do topo; solte FORA da janela
// (ou dê duplo clique na barrinha) para abrir o painel numa janela própria — leve para o 2º monitor.
// Fechar a janela devolve o painel. Posições ficam salvas.
import { icon } from './icons.js';
import { toast } from './toast.js';

export const PANELS = [
  ['left-panel', 'Cena'], ['right-panel', 'Propriedades'], ['ai', 'Assistente'], ['bottom', 'Timeline'],
  ['tool-dock', 'Ferramentas'], ['precision-bar', 'Precisão'], ['view-tools', 'Visual'], ['op-panel', 'Ajustar operação'],
];
const KEY = 'mesh:layout';
const popped = new Map(); // id → { win, placeholder }
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };

// Painéis "destacados" vivem em outro documento: buscas por id continuam funcionando.
const nativeQS = Document.prototype.querySelector;
document.querySelector = function (sel) {
  return nativeQS.call(document, sel) || [...popped.values()].map((p) => nativeQS.call(p.win.document, sel)).find(Boolean) || null;
};

function grip(el, id, name) {
  if (el.querySelector(':scope > .grip')) return;
  const g = document.createElement('div'); g.className = 'grip'; g.title = `Arraste para mover “${name}”. Solte fora da janela (ou duplo clique) para abrir em outra janela/monitor.`;
  g.innerHTML = `<i></i><button class="grip-pop" title="Abrir em janela separada">${icon('external', 12)}</button>`;
  el.appendChild(g);
  g.querySelector('.grip-pop').onclick = (e) => { e.stopPropagation(); popOut(id, e.screenX, e.screenY); };
  g.ondblclick = (e) => popOut(id, e.screenX - 40, e.screenY - 10);
  g.onpointerdown = (e) => {
    if (e.button !== 0 || e.target.closest('.grip-pop') || popped.has(id)) return;
    e.preventDefault(); g.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect(); const ox = e.clientX - r.left, oy = e.clientY - r.top;
    // fixa tamanho e passa a posicionar por left/top
    Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', right: 'auto', bottom: 'auto', width: r.width + 'px', height: el.id === 'left-panel' ? '' : r.height + 'px', transform: 'none', maxWidth: 'none' });
    document.body.classList.add('dragging-panel'); el.classList.add('dragging');
    const mv = (ev) => {
      let x = ev.clientX - ox, y = ev.clientY - oy;
      // ímã: bordas da janela e de outros painéis (10px)
      const others = PANELS.map(([pid]) => pid !== id && document.getElementById(pid)).filter((p) => p && !p.classList.contains('hidden')).map((p) => p.getBoundingClientRect());
      const xs = [0, innerWidth - r.width, ...others.flatMap((o) => [o.left, o.right + 8, o.left - r.width - 8, o.right - r.width])];
      const ys = [44, innerHeight - r.height, ...others.flatMap((o) => [o.top, o.bottom + 8, o.top - r.height - 8, o.bottom - r.height])];
      for (const sx of xs) if (Math.abs(x - sx) < 10) { x = sx; break; }
      for (const sy of ys) if (Math.abs(y - sy) < 10) { y = sy; break; }
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.classList.toggle('will-pop', ev.clientX < 0 || ev.clientY < 0 || ev.clientX > innerWidth || ev.clientY > innerHeight);
    };
    const up = (ev) => {
      g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging-panel'); el.classList.remove('dragging', 'will-pop');
      const outside = ev.clientX < 0 || ev.clientY < 0 || ev.clientX > innerWidth || ev.clientY > innerHeight;
      if (outside) { popOut(id, ev.screenX - ox, ev.screenY - oy); return; }
      const d = load(); d[id] = { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height }; save(d);
    };
    g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
  };
}

export function popOut(id, sx = screenX + 80, sy = screenY + 80) {
  const el = document.getElementById(id); if (!el || popped.has(id)) return;
  const name = PANELS.find((p) => p[0] === id)?.[1] || id; const r = el.getBoundingClientRect();
  const w = window.open('', 'mesh-' + id, `popup=yes,width=${Math.round(Math.max(260, r.width))},height=${Math.round(Math.max(120, r.height))},left=${Math.round(sx)},top=${Math.round(sy)}`);
  if (!w) { toast('Não foi possível abrir a janela'); return; }
  const doc = w.document; doc.title = `Mesh — ${name}`;
  // copia estilos (link com URL absoluta, <style> do Vite em dev) e variáveis do tema
  document.querySelectorAll('link[rel=stylesheet], style').forEach((s) => { const c = s.cloneNode(true); if (s.href) c.href = s.href; doc.head.appendChild(c); });
  doc.documentElement.style.cssText = document.documentElement.style.cssText; doc.documentElement.className = document.documentElement.className;
  doc.body.className = document.body.className + ' popout';
  const placeholder = document.createComment('painel ' + id); el.before(placeholder);
  doc.body.appendChild(doc.adoptNode(el)); el.classList.add('popped');
  popped.set(id, { win: w, placeholder });
  // atalhos digitados na janela destacada valem no app
  w.addEventListener('keydown', (e) => { if (e.target.closest?.('input, textarea, select, .cm-editor')) return; window.dispatchEvent(new KeyboardEvent('keydown', e)); });
  w.addEventListener('pagehide', () => dockBack(id));
  window.addEventListener('beforeunload', () => w.close());
  window.dispatchEvent(new Event('resize'));
}

function dockBack(id) {
  const p = popped.get(id); if (!p) return; popped.delete(id);
  const el = p.win.document.getElementById(id);
  if (el) { p.placeholder.replaceWith(document.adoptNode(el)); el.classList.remove('popped'); } else p.placeholder.remove();
  window.dispatchEvent(new Event('resize'));
}

export function resetLayout() {
  save({}); popped.forEach((p) => p.win.close());
  PANELS.forEach(([id]) => { const el = document.getElementById(id); if (el) ['left', 'top', 'right', 'bottom', 'width', 'height', 'transform', 'maxWidth'].forEach((k) => (el.style[k] = '')); });
  toast('Layout restaurado');
}

export function initLayout() {
  const d = load();
  for (const [id, name] of PANELS) {
    const el = document.getElementById(id); if (!el) continue;
    grip(el, id, name);
    // painéis que re-renderizam o conteúdo (dock, barra) perdem a barrinha — devolve
    new MutationObserver(() => grip(el, id, name)).observe(el, { childList: true });
    const s = d[id];
    if (s) {
      const left = Math.min(parseFloat(s.left), innerWidth - 80), top = Math.min(parseFloat(s.top), innerHeight - 40);
      Object.assign(el.style, { left: Math.max(0, left) + 'px', top: Math.max(0, top) + 'px', right: 'auto', bottom: 'auto', width: s.width, height: s.height, transform: 'none', maxWidth: 'none' });
    }
  }
}
