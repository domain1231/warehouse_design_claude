// G1: 기하 기본연산이 기준본 v2.4.1과 일치하는지 검사한다 (421쌍, 경계 사례 포함).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScenario, normalize, diff, formatDiff } from './compare.js';
import { polygon } from '../../src/geometry/polygons.js';
import { overlaps, gap } from '../../src/geometry/collision.js';

const golden = loadScenario('G1');

test('G1 기준 데이터 형식', () => {
  assert.equal(golden.scenario, 'G1');
  assert.equal(golden.data.pairs.length, 421);
});

test('G1 polygon·overlaps·gap 421쌍이 기준본과 일치한다', () => {
  const failures = [];
  for (const pair of golden.data.pairs) {
    const actual = normalize({
      a: pair.a,
      b: pair.b,
      name: pair.name,
      polygonA: polygon(pair.a),
      polygonB: polygon(pair.b),
      overlaps: overlaps(pair.a, pair.b),
      gap: gap(pair.a, pair.b),
    });
    const rows = diff(normalize(pair), actual, 5);
    if (rows.length) failures.push(`[${pair.name}]\n${formatDiff(rows)}`);
  }
  assert.equal(failures.length, 0, failures.slice(0, 10).join('\n'));
});

test('G1 접촉 정책: 변·꼭짓점 접촉은 충돌이 아니고 1mm 겹침은 충돌이다 (D-004)', () => {
  const byName = new Map(golden.data.pairs.map((p) => [p.name, p]));
  for (const name of ['edge contact gap 0', 'corner contact']) {
    const p = byName.get(name);
    assert.equal(overlaps(p.a, p.b), false, name);
    assert.equal(gap(p.a, p.b), 0, name);
  }
  const p = byName.get('overlap 1mm');
  assert.equal(overlaps(p.a, p.b), true);
});
