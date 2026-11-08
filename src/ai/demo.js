// Modo demo (offline): roteiro de chamadas de ferramenta em lotes paralelos,
// para mostrar os múltiplos cursores sem precisar de chave de API.
let n = 0;
const C = (name, args) => ({ id: 'demo' + ++n, name, args });

export function demoPlan(prompt = '') {
  const title = (prompt.match(/"([^"]+)"/)?.[1] || 'MESH').slice(0, 18);
  return [
    [
      C('set_environment', { sky: 'night', bloom: 0.3, fog: 0.025, exposure: 0.9 }),
      C('add_primitive', { type: 'plane', name: 'Chão', scale: [6, 1, 6], color: '#24262c' }),
      C('add_light', { type: 'spot', name: 'Key', position: [4, 6, 4], intensity: 35, color: '#ffe2c4' }),
      C('add_light', { type: 'point', name: 'Rim', position: [-4, 3, -3], intensity: 25, color: '#3d7bff' }),
    ],
    [
      C('add_text', { text: title, name: 'Título', size: 0.9, position: [0, 1.4, 0], color: '#ff6a3d', emissive: 0.6 }),
      C('add_primitive', { type: 'torusknot', name: 'Nó', position: [-3, 1.2, -1], color: '#d9dbe0' }),
      C('add_primitive', { type: 'icosphere', name: 'Mesh', position: [3, 1, -1], color: '#3dd6ff' }),
      C('add_vfx', { type: 'magic', name: 'Faíscas', position: [0, 0.2, 0.5], color: '#ff9b5e' }),
    ],
    [
      C('set_material', { target: 'Nó', metalness: 1, roughness: 0.2 }),
      C('set_material', { target: 'Esfera', texture: 'marble', roughness: 0.3 }),
      C('set_material', { target: 'Chão', roughness: 0.35, metalness: 0.2 }),
      C('motion_preset', { target: 'Título', preset: 'pop_in', start: 0, duration: 1 }),
    ],
    [
      C('motion_preset', { target: 'Nó', preset: 'spin', start: 0, duration: 4 }),
      C('motion_preset', { target: 'Esfera', preset: 'bounce', start: 0.4, duration: 1.4 }),
      C('add_sfx', { preset: 'whoosh', time: 0 }),
      C('add_sfx', { preset: 'impact', time: 1.0 }),
    ],
    [
      C('add_camera', { name: 'Cam', position: [0, 2.2, 7.5], look_at: [0, 1.1, 0], fov: 38 }),
      C('video_add_clip', { kind: 'scene', start: 0, duration: 5, transition: 'fade' }),
      C('video_add_clip', { kind: 'title', text: 'feito no Mesh', start: 3, duration: 2, color: '#ffffff' }),
      C('set_timeline', { duration: 5, time: 0, play: true }),
    ],
  ];
}
