// Ao abrir um projeto: reconstrói as partes "vivas" dos recursos (traços, curvas, nós, simulações, shape keys).
import { rehydratePencil } from './grease.js';
import { rehydrateCurves } from './curves.js';
import { rehydrateGeoNodes } from './geonodes.js';
import { rehydrateSims } from './sims.js';
import { rehydrateAnimX } from './animx.js';
import { sync as syncCompositor } from './compositor.js';

export function rehydrateFeatures(root) {
  for (const fn of [rehydrateCurves, rehydrateGeoNodes, rehydratePencil, rehydrateSims, rehydrateAnimX]) { try { fn(root); } catch (e) { console.error('rehydrate', e); } }
  try { syncCompositor(); } catch {}
}
