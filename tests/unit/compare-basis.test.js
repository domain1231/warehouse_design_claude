// GT-BASIS(로드맵 6.5, C9 · D-075): BE/AF 비교는 같은 총면적 기준을 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareBasis, compareBasisText, purposeCompare, scenarioDelta, referenceAreaOf } from '../../src/metrics/space.js';
import { setReferenceArea } from '../../src/warehouse/scenarios.js';

const rack = (id, x) => ({ id, kind: 'rack', code: id, x, y: 0, width: 2, depth: 1, rotation: 0, height: 2, excel: { key: id, shelves: [{ level: 1, items: [{ location: `7F-A-${id}-1-1`, shelfHeight: 1000, materialHeight: 500 }] }] } });
const lay = () => ({ warehouse: { width: 20, height: 10, ceiling: 2.7 }, objects: [rack('1', 0), rack('2', 3), { id: 'A', kind: 'aisle', x: 0, y: 2, width: 20, depth: 1.2, rotation: 0 }] });
const src = (area) => ({ file: 'f.xlsx', sheet: 'S', asOf: '2026-11-01', source: 'excel', importedAt: '2026-11-01T00:00:00Z', ...(area ? { referenceArea: area } : {}) });
const proj = (bArea, aArea, locked = false) => ({ scenarios: { before: lay(), after: lay() }, scenarioMeta: { before: { locked, sourceInfo: bArea === undefined ? null : src(bArea) }, after: { locked: false, sourceInfo: aArea === undefined ? null : src(aArea) } } });

test('GT-BASIS BE에 Excel 총면적 없음 + AF 130.5㎡, 랙 배치 동일 → 양쪽 모두 도면 기준, 통로 비중 차이 0.0%p, 기준 안내', () => {
  const p = proj(undefined, 130.5), cb = compareBasis(p);
  assert.equal(cb.basis, 'drawing');
  assert.deepEqual(cb.missing, ['BEFORE']);
  assert.equal(cb.from, 'after');
  assert.equal(cb.fromArea, 130.5);
  assert.equal(compareBasisText(cb), '면적 기준: 도면 전체 (BEFORE에 Excel 면적 없음)');
  const by = Object.fromEntries(purposeCompare(p).map((r) => [r.id, r]));
  assert.equal(by.M6.delta, '±0.0%p');
  assert.equal(by.M6.before, by.M6.after);
  assert.match(by.M6.tip, /면적 기준: 도면 전체/);
  const d = scenarioDelta(p);
  assert.equal(d.aisleShare, 0);
  assert.equal(d.areaUse, 0);
});

test('양쪽 모두 Excel 총면적이 있으면 ① 각자 값, 둘 다 없으면 ② · 안내 문구', () => {
  const cb = compareBasis(proj(120, 130.5));
  assert.equal(cb.basis, 'excel');
  assert.deepEqual(cb.areas, { before: 120, after: 130.5 });
  assert.equal(compareBasisText(cb), '면적 기준: Excel 총면적 (BEFORE 120㎡ · AFTER 130.5㎡)');
  const none = compareBasis(proj(undefined, undefined));
  assert.equal(none.from, null);
  assert.equal(compareBasisText(none), '면적 기준: 도면 전체 (양쪽 모두 Excel 면적 없음)');
});

test('한쪽 Excel 총면적을 다른 쪽에 적용: 출처 정보는 만들지 않고 referenceArea로 저장 · Excel 값이 우선 · 잠금이면 거부', () => {
  const p = proj(undefined, 130.5);
  const r = setReferenceArea(p, 'before', 130.5);
  assert.ok(r.ok);
  assert.notEqual(r.project, p, '원본 불변');
  assert.equal(p.scenarioMeta.before.referenceArea, undefined);
  assert.equal(r.project.scenarioMeta.before.sourceInfo, null);
  assert.equal(r.project.scenarioMeta.before.referenceArea, 130.5);
  const cb = compareBasis(r.project);
  assert.equal(cb.basis, 'excel');
  assert.deepEqual(cb.areas, { before: 130.5, after: 130.5 });
  assert.equal(purposeCompare(r.project).find((x) => x.id === 'M6').delta, '±0.0%p');
  const q = proj(100, 130.5);
  q.scenarioMeta.before.referenceArea = 130.5;
  assert.equal(referenceAreaOf(q, 'before'), 100, 'Excel 가져오기 값이 우선');
  const locked = setReferenceArea(proj(undefined, 130.5, true), 'before', 130.5);
  assert.equal(locked.ok, false);
  assert.match(locked.reason, /BEFORE 원본 잠금/);
  assert.equal(setReferenceArea(p, 'before', -1).ok, false);
  assert.equal(setReferenceArea(p, 'side', 1).ok, false);
});
