// Plugin de exemplo — mostra como estender o Argila sem tocar no núcleo.
export default (api) => {
  api.registerPrimitive('pyramid', 'Pirâmide', () => new api.THREE.ConeGeometry(0.7, 1.1, 4).translate(0, 0.55, 0));
};
