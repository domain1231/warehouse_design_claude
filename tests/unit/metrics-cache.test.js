// unionArea 결과 기억(최근 16개): 같은 도형이면 같은 값, 도형이 바뀌면 새로 계산.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unionArea } from '../../src/warehouse/metrics.js';

const box = (x, y, w, d, extra = {}) => ({ x, y, width: w, depth: d, rotation: 0, ...extra });

test('같은 입력은 같은 값, 위치·꼭짓점이 바뀌면 다시 계산', () => {
  const a = [box(0, 0, 2, 2), box(1, 1, 2, 2)];
  assert.equal(unionArea(a, 10, 10), 7);
  assert.equal(unionArea(a, 10, 10), 7);
  assert.equal(unionArea([box(0, 0, 2, 2), box(5, 5, 2, 2)], 10, 10), 8);
  const tri = box(0, 0, 2, 2, { vertices: [[0, 0], [1, 0], [0, 1]] });
  assert.equal(unionArea([tri], 10, 10), 2);
  assert.equal(unionArea([{ ...tri, vertices: [[0, 0], [1, 0], [1, 1], [0, 1]] }], 10, 10), 4);
  assert.equal(unionArea(a, 3, 3), 7); // 창고 크기 변경(잘림 없음)
  assert.equal(unionArea(a, 2, 2), 4); // 창고 밖은 잘림
});

test('제자리 변경 후에도 새 값: 랙 x 이동 → spaceMetrics 구성 변화', async () => {
  const { spaceMetrics } = await import('../../src/metrics/space.js');
  const l = { warehouse: { width: 10, height: 10, ceiling: 3 }, objects: [{ id: 'a', kind: 'rack', code: 'a', ...box(0, 0, 2, 2), height: 2 }, { id: 'w', kind: 'wall', code: 'w', ...box(1, 0, 2, 2), height: 3 }] };
  const before = spaceMetrics(l).composition;
  assert.equal(before.rack.area, 4); assert.equal(before.unavailable.area, 2);
  l.objects[0].x = 5; // 같은 객체를 제자리 변경
  const after = spaceMetrics(l).composition;
  assert.equal(after.rack.area, 4); assert.equal(after.unavailable.area, 4);
});
