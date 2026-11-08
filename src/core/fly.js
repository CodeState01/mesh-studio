// Câmera de voo (estilo engine de jogo):
//  • Segure o botão DIREITO no viewport → W A S D movem, mouse gira a câmera.
//  • Espaço/E sobe · Q/Ctrl desce · Shift acelera · roda do mouse muda a velocidade.
//  • Shift+F liga o "modo voo" contínuo (sem segurar botão) — Esc sai.
// Enquanto voa, as teclas não disparam atalhos do editor (S não vira "escalar" etc.).
import * as THREE from 'three';
import { renderer, camera, orbit, frameHooks, getRenderCamera } from './viewport.js';
import { bus } from './state.js';
import { isModal } from './precision.js';

export const fly = { active: false, toggle: false, speed: 4 };
const keys = new Set();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
let dist = 5, hud = null;
const cam = () => getRenderCamera() || camera;
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyQ', 'KeyE', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export function startFly(toggle = false) {
  if (fly.active || isModal()) return;
  const c = cam(); fly.active = true; fly.toggle = toggle;
  orbit.enabled = false; dist = Math.max(0.5, camera.position.distanceTo(orbit.target));
  euler.setFromQuaternion(c.quaternion);
  try { const p = renderer.domElement.requestPointerLock?.(); p?.catch?.(() => {}); } catch {} // sem gesto real o navegador recusa: aí gira segurando o botão direito
  showHud(); bus.emit('fly', true);
}
export function stopFly() {
  if (!fly.active) return; fly.active = false; keys.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  if (cam() === camera) orbit.target.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), dist);
  orbit.enabled = true; hideHud(); bus.emit('fly', false);
}
export const toggleFly = () => (fly.active ? stopFly() : startFly(true));
export const isFlying = () => fly.active;

function showHud() {
  if (!hud) { hud = document.createElement('div'); hud.className = 'fly-hud'; document.querySelector('#viewport').appendChild(hud); }
  hud.innerHTML = `<b>Voo</b><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> mover</span><span><kbd>Espaço</kbd> subir</span><span><kbd>Q</kbd> descer</span><span><kbd>Shift</kbd> rápido</span><span>roda: velocidade <b id="fly-spd">${fly.speed.toFixed(1)}</b> m/s</span><span><kbd>${fly.toggle ? 'Esc' : 'solte o botão'}</kbd> sair</span>`;
  hud.classList.add('on');
}
function hideHud() { hud?.classList.remove('on'); }

export function initFly() {
  const el = renderer.domElement;
  el.addEventListener('contextmenu', (e) => { if (!e.shiftKey) e.preventDefault(); });
  el.addEventListener('pointerdown', (e) => { if (e.button === 2 && !e.shiftKey && !e.altKey) { e.preventDefault(); startFly(false); } });
  window.addEventListener('pointerup', (e) => { if (e.button === 2 && fly.active && !fly.toggle) stopFly(); });
  window.addEventListener('mousemove', (e) => {
    if (!fly.active) return;
    const look = document.pointerLockElement || (e.buttons & 2); if (!look) return;
    const mx = e.movementX, my = e.movementY;
    euler.y -= mx * 0.0022; euler.x = THREE.MathUtils.clamp(euler.x - my * 0.0022, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    cam().quaternion.setFromEuler(euler);
  });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && fly.active && fly.toggle) stopFly(); });
  // Captura: roda ANTES dos atalhos do shell e impede que WASD virem comandos
  window.addEventListener('keydown', (e) => {
    if (!fly.active) return;
    if (e.code === 'Escape') { stopFly(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (MOVE_KEYS.includes(e.code)) { keys.add(e.code); e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('keyup', (e) => { keys.delete(e.code); }, true);
  el.addEventListener('wheel', (e) => {
    if (!fly.active) return; e.preventDefault(); e.stopImmediatePropagation();
    fly.speed = THREE.MathUtils.clamp(fly.speed * (e.deltaY < 0 ? 1.15 : 0.87), 0.2, 200);
    const s = document.getElementById('fly-spd'); if (s) s.textContent = fly.speed.toFixed(1);
  }, { capture: true, passive: false });
  window.addEventListener('blur', () => keys.clear());

  frameHooks.add((dt) => {
    if (!fly.active || !keys.size) return;
    const c = cam(); const fwd = c.getWorldDirection(new THREE.Vector3()); const right = fwd.clone().cross(c.up).normalize();
    const v = new THREE.Vector3();
    if (keys.has('KeyW') || keys.has('ArrowUp')) v.add(fwd);
    if (keys.has('KeyS') || keys.has('ArrowDown')) v.sub(fwd);
    if (keys.has('KeyD') || keys.has('ArrowRight')) v.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) v.sub(right);
    if (keys.has('Space') || keys.has('KeyE')) v.y += 1;
    if (keys.has('KeyQ') || keys.has('ControlLeft') || keys.has('ControlRight')) v.y -= 1;
    if (!v.lengthSq()) return;
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3 : 1;
    c.position.addScaledVector(v.normalize(), fly.speed * boost * dt);
  });
}
