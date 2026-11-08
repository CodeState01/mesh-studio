let host;
export function toast(msg, { kind = 'info', ms = 2600, action } = {}) {
  if (!host) { host = document.createElement('div'); host.className = 'toasts'; document.body.appendChild(host); }
  const t = document.createElement('div'); t.className = `toast ${kind}`;
  t.innerHTML = `<span></span>`; t.firstChild.textContent = msg;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.run(); t.remove(); }; t.appendChild(b); }
  host.appendChild(t); requestAnimationFrame(() => t.classList.add('in'));
  const close = () => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); };
  setTimeout(close, ms);
  return { close, update: (m) => { t.firstChild.textContent = m; } };
}
