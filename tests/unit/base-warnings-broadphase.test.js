// baseWarnings 광역 단계(정렬·스윕) 결과가 전수 쌍 검사(baseWarningsReference)와 같은 경고·같은 순서인지 확인
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createObject } from '../../src/core/project.js';
import { baseWarnings, baseWarningsReference } from '../../src/warehouse/constraints.js';
import { createIdGenerator } from '../../src/core/ids.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('baseWarnings 광역 단계: 무작위 배치 200개에서 전수 검사와 동일(순서 포함)', () => {
  let total = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(seed), nextId = createIdGenerator({ seed: 'bw' + seed });
    const W = 20 + r() * 20, H = 15 + r() * 15, objects = [];
    const n = 5 + Math.floor(r() * 60), kinds = ['rack', 'rack', 'rack', 'rack', 'wall', 'column', 'door', 'aisle', 'blocked', 'work'];
    const snap = (v) => (r() < 0.4 ? Math.round(v * 5) / 5 : v);
    for (let i = 0; i < n; i++) {
      const kind = kinds[Math.floor(r() * kinds.length)];
      const o = createObject(kind, snap(-1 + r() * (W + 1)), snap(-1 + r() * (H + 1)), snap(0.3 + r() * 4), snap(0.3 + r() * 3), { rotation: r() < 0.4 ? [90, 45, 30, 180][Math.floor(r() * 4)] : 0, capacity: 10, quantity: Math.floor(r() * 14) }, { nextId });
      if (kind === 'aisle' && r() < 0.4) { o.vertices = [[0, 0], [o.width, 0], [o.width, o.depth], [o.width / 2, o.depth], [0, o.depth * 0.5]]; }
      objects.push(o);
    }
    // 맞닿음 쌍(거리 0)과 minGap 경계 쌍을 강제로 넣는다.
    const a = createObject('rack', 2, 2, 1, 1, {}, { nextId }), b = createObject('rack', 3, 2, 1, 1, {}, { nextId }), c = createObject('rack', 4.3, 2, 1, 1, {}, { nextId });
    objects.push(a, b, c);
    const layout = { warehouse: { width: W, height: H, ceiling: 3 }, objects };
    const project = { settings: { minGap: [0, 0.3, 0.8][seed % 3] } };
    const fast = JSON.stringify(baseWarnings(layout, project));
    assert.equal(fast, JSON.stringify(baseWarningsReference(layout, project)), 'seed ' + seed);
    total += baseWarningsReference(layout, project).length;
  }
  assert.ok(total > 500, 'warnings generated: ' + total);
});
