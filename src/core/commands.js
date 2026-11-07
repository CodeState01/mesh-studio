// Registro de comandos: menus, atalhos e paleta (Ctrl+K / F3) usam a mesma fonte.
export const commands = new Map();

export function registerCommand(c) { commands.set(c.id, c); }
export function runCommand(id, ...args) {
  const c = commands.get(id); if (!c) { console.warn('comando desconhecido', id); return; }
  return c.run(...args);
}

// Normaliza um KeyboardEvent para string tipo "Ctrl+Shift+Z".
export function keyOf(e) {
  const k = e.code === 'Space' ? 'Space' : e.code.startsWith('Numpad') ? e.code
    : /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5)
    : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.shiftKey ? 'Shift' : '', e.altKey ? 'Alt' : '', k].filter(Boolean).join('+');
}
