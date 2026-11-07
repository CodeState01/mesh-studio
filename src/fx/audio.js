// Motor de áudio: SFX sintetizados (sem arquivos), clipes importados,
// e uma saída "MediaStream" para gravar o áudio junto com o vídeo exportado.
export const SFX_PRESETS = ['whoosh', 'impact', 'click', 'rise', 'pop', 'beep', 'boom', 'shimmer', 'glitch'];

let ctx, master, recordDest;
export function audioCtx() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    recordDest = ctx.createMediaStreamDestination(); master.connect(recordDest);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const audioStream = () => (audioCtx(), recordDest.stream);

function noiseBuffer(sec = 1) {
  const c = audioCtx(); const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b;
}
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

// Cada preset é uma pequena receita de síntese subtrativa/FM.
const RECIPES = {
  whoosh(c, out, t) {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(1.2);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3500, t + 0.35); f.frequency.exponentialRampToValueAtTime(500, t + 0.9);
    const g = c.createGain(); env(g, t, 0.3, 0.8, 0.6); n.connect(f).connect(g).connect(out); n.start(t); n.stop(t + 1.2);
  },
  impact(c, out, t) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    const g = c.createGain(); env(g, t, 0.005, 1, 0.5); o.connect(g).connect(out); o.start(t); o.stop(t + 0.6);
    const n = c.createBufferSource(); n.buffer = noiseBuffer(0.3); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    const g2 = c.createGain(); env(g2, t, 0.002, 0.6, 0.15); n.connect(f).connect(g2).connect(out); n.start(t);
  },
  click(c, out, t) {
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 2200;
    const g = c.createGain(); env(g, t, 0.001, 0.25, 0.03); o.connect(g).connect(out); o.start(t); o.stop(t + 0.05);
  },
  rise(c, out, t) {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(1600, t + 1.5);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(6000, t + 1.5);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 1.7);
  },
  pop(c, out, t) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.08);
    const g = c.createGain(); env(g, t, 0.002, 0.7, 0.1); o.connect(g).connect(out); o.start(t); o.stop(t + 0.15);
  },
  beep(c, out, t) {
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 880;
    const g = c.createGain(); env(g, t, 0.01, 0.4, 0.2); o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
  },
  boom(c, out, t) {
    const n = c.createBufferSource(); n.buffer = noiseBuffer(2.5); const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(60, t + 2);
    const g = c.createGain(); env(g, t, 0.01, 1, 2.2); n.connect(f).connect(g).connect(out); n.start(t);
    RECIPES.impact(c, out, t);
  },
  shimmer(c, out, t) {
    [1, 1.5, 2, 2.5, 3].forEach((m, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 660 * m;
      const g = c.createGain(); env(g, t + i * 0.06, 0.02, 0.12, 1.2); o.connect(g).connect(out); o.start(t + i * 0.06); o.stop(t + 1.6);
    });
  },
  glitch(c, out, t) {
    for (let i = 0; i < 8; i++) {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 80 + Math.random() * 2000;
      const g = c.createGain(); const s = t + i * 0.035; env(g, s, 0.001, 0.2, 0.025); o.connect(g).connect(out); o.start(s); o.stop(s + 0.04);
    }
  },
};

export function playSFX(preset, { volume = 1, when = 0 } = {}) {
  const c = audioCtx(); const g = c.createGain(); g.gain.value = volume; g.connect(master);
  (RECIPES[preset] || RECIPES.click)(c, g, c.currentTime + when);
}

// ---------- Clipes de áudio importados ----------
const buffers = new Map(); // id -> AudioBuffer
export async function decodeAudio(id, arrayBuffer) {
  const b = await audioCtx().decodeAudioData(arrayBuffer.slice(0)); buffers.set(id, b); return b.duration;
}
const playing = new Set();
export function playBuffer(id, offset = 0, volume = 1) {
  const b = buffers.get(id); if (!b) return;
  const c = audioCtx(); const s = c.createBufferSource(); s.buffer = b;
  const g = c.createGain(); g.gain.value = volume; s.connect(g).connect(master); s.start(0, Math.max(0, offset));
  playing.add(s); s.onended = () => playing.delete(s);
}
export function stopAllBuffers() { playing.forEach((s) => { try { s.stop(); } catch {} }); playing.clear(); }
