// 다각형 통로 모양(정규화·단순성·닫힘 점 규칙)과 통로 검토 행
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createObject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { polygonAisleShape, addPolygonAisle, applyCommand, active, POLYGON_INVALID_MESSAGE } from '../../src/warehouse/commands.js';
import { aisleReviewRows, aisleCsvRows } from '../../src/warehouse/aisles.js';

test('polygonAisleShape: 상자 정규화, 소수 좌표 보존, 닫힘 점(0.02m 이내) 제거', () => {
  const s = polygonAisleShape([[1, 2], [5, 2], [5, 3.5], [1, 3.5], [1.01, 2.01]]);
  assert.deepEqual([s.x, s.y, s.width, s.depth], [1, 2, 4, 1.5]);
  assert.deepEqual(s.vertices, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  assert.equal(polygonAisleShape([[0.1234, 0.5], [1.1234, 0.5], [0.6, 1.5]]).x, 0.1234);
});

test('polygonAisleShape: 자기 교차·면적 0·겹침 점은 같은 메시지로 거부', () => {
  for (const pts of [[[0, 0], [2, 2], [2, 0], [0, 2]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 0], [1, 1], [1, 0]], [[0, 0], [1, 1]]]) {
    assert.throws(() => polygonAisleShape(pts), { message: POLYGON_INVALID_MESSAGE });
  }
});

test('addPolygonAisle + applyCommand: 통로 NNN 코드·종류·기준값·vertices, 실패 시 프로젝트 불변', () => {
  const nextId = createIdGenerator({ seed: 'poly' });
  const p = validateProject(createProject({ sample: false, nextId }));
  p.settings.scenario = 'after';
  const add = addPolygonAisle([[1, 1], [4, 1], [4, 2], [1, 2]], '랙 접근 통로', { nextId });
  const r = applyCommand(p, add.mutate, { nextId });
  assert.ok(r.ok, r.reason);
  const o = active(r.project).objects.find((x) => x.id === add.id);
  assert.equal(o.kind, 'aisle');
  assert.match(o.code, /^통로 \d{3}$/);
  assert.equal(o.aisleType, '랙 접근 통로');
  assert.equal(o.clearanceAxis, 'auto');
  assert.equal(o.vertices.length, 4);
  assert.throws(() => addPolygonAisle([[0, 0], [2, 2], [2, 0], [0, 2]], '메인 이동 통로', { nextId }));
  assert.equal(active(p).objects.length, 0);
});

test('aisleReviewRows: 샘플 프로젝트 통로마다 한 행, CSV 마지막 열 미검증', () => {
  const nextId = createIdGenerator({ seed: 'rows' });
  const p = validateProject(createProject({ sample: true, nextId }));
  const l = active(p);
  const rows = aisleReviewRows(l);
  assert.equal(rows.length, l.objects.filter((o) => o.kind === 'aisle').length);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(['⚠ 보호 구역 침범 또는 폭 부족', '목표 폭 미달', '설정한 단면 폭 기준 통과', '경고 사용 안 함'].includes(r.status));
    assert.ok(['지정 랙', '전체'].includes(r.scope) && ['미지정', '접촉', '미연결'].includes(r.door));
  }
  const csv = aisleCsvRows(rows);
  assert.equal(csv[0].length, 9);
  assert.ok(csv.slice(1).every((r) => r.length === 9 && r[8] === '미검증'));
  const empty = aisleReviewRows({ objects: [createObject('rack', 0, 0, 1, 1, { id: 'x' }, { nextId })] });
  assert.deepEqual(empty, []);
});
