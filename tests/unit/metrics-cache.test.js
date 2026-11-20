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
