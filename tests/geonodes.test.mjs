// Testes dos nós de geometria: cada modelo avalia, instancia e respeita a ligação dos fios.
import * as THREE from 'three';
import { evaluateGraph, PRESETS, NODE_TYPES } from '../src/features/geonodes.js';
let fails = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const plane = new THREE.PlaneGeometry(2, 2, 4, 4).rotateX(-Math.PI / 2);
const tris = (g) => g.attributes.position.count / 3;

const basic = evaluateGraph(PRESETS.basic(), plane); ok(tris(basic) === 32, `vazio: entrada → saída sem mudar (${tris(basic)} tri)`);
const rocks = evaluateGraph(PRESETS.rocks(), plane); ok(tris(rocks) > tris(basic) * 5, `pedras: plano + instâncias (${tris(rocks)} tri)`);
const grass = evaluateGraph(PRESETS.grass(), plane); const bb = new THREE.Box3().setFromBufferAttribute(grass.attributes.position);
ok(bb.max.y > 0.03 && bb.min.y > -0.01, `grama cresce para cima do plano (y ${bb.min.y.toFixed(3)}…${bb.max.y.toFixed(3)})`);
const grid = evaluateGraph(PRESETS.cubegrid(), plane); ok(tris(grid) === 36 * 12, `grade 6×6 de cubos = 432 tri (${tris(grid)})`);
const org = evaluateGraph(PRESETS.organic(), new THREE.BoxGeometry(1, 1, 1)); ok(tris(org) > 12 * 8, `orgânico subdivide e deforma (${tris(org)} tri)`);
// Sem fio para a saída → geometria vazia; fio desligado não quebra
const g = PRESETS.basic(); g.links = []; ok(tris(evaluateGraph(g, plane)) === 0, 'saída desconectada → geometria vazia');
// Mesma semente → mesmo resultado (determinístico, como no Blender)
const a = evaluateGraph(PRESETS.rocks(), plane).attributes.position.array, b = evaluateGraph(PRESETS.rocks(), plane).attributes.position.array;
ok(a.length === b.length && a.every((v, i) => v === b[i]), 'determinístico com a mesma semente');
ok(Object.keys(NODE_TYPES).length >= 14, `${Object.keys(NODE_TYPES).length} tipos de nó`);
console.log(fails ? `\n${fails} falha(s)` : '\nTodos os testes passaram'); process.exit(fails ? 1 : 0);
