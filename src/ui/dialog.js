// Diálogo de texto próprio (Electron não suporta window.prompt).
export function askText(title, value = '') {
  return new Promise((resolve) => {
    const root = document.querySelector('#modal-root');
    root.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(420px,92vw)">
      <div class="modal-h">${title}</div>
      <div class="modal-b"><input class="field" id="dlg-in" style="height:32px;font-size:13px"></div>
      <div class="modal-f"><button class="btn" data-r="0">Cancelar</button><button class="btn primary" data-r="1">OK</button></div></div></div>`;
    const inp = root.querySelector('#dlg-in'); inp.value = value; inp.focus(); inp.select();
    const done = (ok) => { const v = inp.value.trim(); root.innerHTML = ''; resolve(ok && v ? v : null); };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
    root.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => done(b.dataset.r === '1')));
  });
}
