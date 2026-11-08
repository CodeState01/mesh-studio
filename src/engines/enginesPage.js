// Conexão com engines: envia a cena/seleção para a pasta do projeto da engine,
// com "sincronização ao vivo" (reexporta sozinho quando a cena muda).
import { exportData } from '../io/io.js';
import { content } from '../core/objects.js';
import { state, bus } from '../core/state.js';
import { settings, saveSettings } from '../core/settings.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';

export const ENGINES = [
  { id: 'unity', name: 'Unity', fmt: 'glb', color: '#9aa3ad', hint: 'Escolha uma pasta dentro de Assets/ (ex.: Assets/Mesh). Instale o pacote glTFast (com.unity.cloud.gltfast) para importar .glb — o Unity reimporta sozinho a cada envio.', script: 'integrations/unity/MeshLiveLink.cs' },
  { id: 'unreal', name: 'Unreal Engine', fmt: 'glb', color: '#c9ccd3', hint: 'Escolha uma pasta fora de Content/ (ex.: Projeto/MeshInbox). O script Python incluso importa os .glb para /Game/Mesh (ative o plugin "Python Editor Script").', script: 'integrations/unreal/mesh_import.py' },
  { id: 'godot', name: 'Godot', fmt: 'glb', color: '#6fa8dc', hint: 'Escolha uma pasta dentro do projeto (ex.: res://mesh). O Godot importa .glb nativamente e atualiza ao detectar mudanças.', script: 'integrations/godot/README.md' },
  { id: 'roblox', name: 'Roblox Studio', fmt: 'obj', color: '#e5534b', hint: 'Exporta OBJ/GLB para uma pasta. No Studio use Avatar/Home › Import 3D e selecione o arquivo. Dica: o servidor MCP do Roblox Studio também pode ser usado em conjunto.', script: 'integrations/roblox/README.md' },
  { id: 'blender', name: 'Blender', fmt: 'glb', color: '#b9f23c', hint: 'Instale o add-on incluso (Edit › Preferences › Add-ons › Install) e aponte para esta pasta: o Blender recarrega a cena sozinho a cada envio.', script: 'integrations/blender/mesh_live_link.py' },
  { id: 'web', name: 'Web / Three.js', fmt: 'glb', color: '#7bd389', hint: 'Exporta .glb pronto para Three.js, Babylon.js, PlayCanvas, A-Frame ou <model-viewer>.', script: null },
];
const FORMATS = ['glb', 'gltf', 'obj', 'stl'];
const cfg = (id) => (settings.engines[id] ||= { dir: '', fmt: ENGINES.find((e) => e.id === id).fmt, live: false, last: null });

export async function sendTo(id, onlySelection = false) {
  const e = ENGINES.find((x) => x.id === id); const c = cfg(id);
  const objs = onlySelection && state.selected ? [state.selected] : content.children;
  const { data, binary } = await exportData(c.fmt, objs);
  const name = `${onlySelection && state.selected ? state.selected.name.replace(/[^\w.-]+/g, '_') : 'mesh_cena'}.${c.fmt}`;
  if (window.meshApp?.file?.writeTo && c.dir) {
    const path = await window.meshApp.file.writeTo({ dir: c.dir, name, data, binary });
    c.last = new Date().toLocaleTimeString(); saveSettings();
    return path;
  }
  // Web / sem pasta: download
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data])); a.download = name; a.click();
  return name;
}

// Sincronização ao vivo: reexporta 1,5s depois da última mudança.
let liveTimer;
function scheduleLive() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(async () => {
    for (const e of ENGINES) { const c = settings.engines[e.id]; if (c?.live && c.dir) { try { await sendTo(e.id); bus.emit('engines:synced', e.id); } catch (err) { console.warn(err); } } }
  }, 1500);
}
['scene:changed', 'object:transformed', 'material:changed', 'history'].forEach((ev) => bus.on(ev, scheduleLive));

export function renderEngines(el) {
  el.innerHTML = `<div class="page-wrap"><header class="page-head"><div><h1>Engines</h1>
    <p>Envie seus modelos direto para a pasta do projeto da sua engine. Com <b>Sync ao vivo</b>, cada mudança na cena é reenviada automaticamente.</p></div></header>
    <div class="engine-grid">${ENGINES.map((e) => { const c = cfg(e.id); return `
      <article class="engine" data-e="${e.id}" style="--ec:${e.color}">
        <header><span class="eng-dot"></span><b>${e.name}</b>${c.live && c.dir ? '<span class="live-pill">ao vivo</span>' : ''}</header>
        <p>${e.hint}</p>
        <div class="row"><label>Pasta</label><button class="btn sm path" data-a="dir" title="${c.dir || ''}">${icon('folder', 14)}<span>${c.dir ? c.dir.split(/[\\/]/).slice(-2).join('/') : 'Escolher pasta…'}</span></button></div>
        <div class="row"><label>Formato</label><select class="field" data-a="fmt">${FORMATS.map((f) => `<option ${f === c.fmt ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
        <div class="row"><label>Sync ao vivo</label><label class="toggle"><input type="checkbox" data-a="live" ${c.live ? 'checked' : ''} ${c.dir ? '' : 'disabled'}><span></span></label></div>
        <footer><button class="btn sm" data-a="sel">Enviar seleção</button><button class="btn sm primary" data-a="all">${icon('upload', 14)} Enviar cena</button>
        ${c.dir ? `<button class="icon-btn" data-a="open" title="Abrir pasta">${icon('folder', 15)}</button>` : ''}</footer>
        <small class="eng-last">${c.last ? 'Último envio: ' + c.last : e.script ? 'Integração: ' + e.script : ''}</small>
      </article>`; }).join('')}</div></div>`;
  el.querySelector('.engine-grid').onclick = async (ev) => {
    const card = ev.target.closest('[data-e]'); const a = ev.target.closest('[data-a]')?.dataset.a; if (!card || !a) return;
    const id = card.dataset.e; const c = cfg(id);
    try {
      if (a === 'dir') {
        if (!window.meshApp?.file?.pickDir) { toast('Disponível no app desktop'); return; }
        const d = await window.meshApp.file.pickDir({ title: 'Pasta do projeto — ' + ENGINES.find((x) => x.id === id).name }); if (!d) return;
        c.dir = d; saveSettings(); renderEngines(el);
      }
      if (a === 'all' || a === 'sel') { const p = await sendTo(id, a === 'sel'); toast('Enviado: ' + p.split(/[\\/]/).pop()); renderEngines(el); }
      if (a === 'open') window.meshApp?.file?.openPath(c.dir);
    } catch (err) { toast(err.message, { kind: 'error' }); }
  };
  el.querySelector('.engine-grid').onchange = (ev) => {
    const card = ev.target.closest('[data-e]'); const a = ev.target.dataset.a; const c = cfg(card.dataset.e);
    if (a === 'fmt') c.fmt = ev.target.value;
    if (a === 'live') { c.live = ev.target.checked; if (c.live) scheduleLive(); toast(c.live ? 'Sync ao vivo ligado' : 'Sync ao vivo desligado'); }
    saveSettings(); renderEngines(el);
  };
}
