import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { csvParse, parseInventoryCsv, importInventory, inventorySnapshotExists, saveInventorySnapshot } from '../../src/warehouse/inventory-csv.js';

const make = () => validateProject(createProject({ nextId: createIdGenerator({ seed: 'inv' }), today: () => '2026-11-16' }));
const racks = (p) => p.scenarios[p.settings.scenario].objects.filter((o) => o.kind === 'rack');
const rejects = (text, p, msg, opts) => assert.throws(() => parseInventoryCsv(text, p, opts), (e) => e.message.includes(msg));

test('csvParse: BOM·따옴표·빈 줄', () => {
  assert.deepEqual(csvParse('﻿a,"b,c"\r\n\r\n"d""e",f\n'), [['a', 'b,c'], ['d"e', 'f']]);
  assert.throws(() => csvParse('"abc'), /닫히지/);
});

test('가져오기: 별칭 머리글, 출처 기본값, 빈 수량은 null', () => {
  const p = make(), [a, b] = racks(p);
  const r = parseInventoryCsv(`날짜,랙ID,최대수량,현재수량,단위\n2026-11-01,${a.id},100,40,${a.unit}\n2026-11-01,${b.id},,,${b.unit}\n`, p);
  assert.equal(r.count, 2);
  assert.deepEqual(r.history[0], { date: '2026-11-01', rackId: a.id, unit: a.unit, source: 'CSV 사용자 제공', scenario: p.settings.scenario, capacity: 100, quantity: 40 });
  assert.equal(r.history[1].quantity, null);
  assert.equal(r.history[1].capacity, null);
  assert.equal(p.inventoryHistory.length, 0, '입력 프로젝트는 바뀌지 않는다');
});

test('가져오기 오류 문구와 전부 아니면 전무', () => {
  const p = make(), a = racks(p)[0], h = 'date,rackId,capacity,quantity,unit,source';
  rejects('date,rackId\n', p, '필수 재고 CSV 머리글 오류');
  rejects(`${h}\n2026-11-01,${a.id},1,1\n`, p, 'CSV 열 개수 오류');
  rejects(`scenario,${h}\nbefore,2026-11-01,${a.id},1,1,${a.unit},x\n`, p, 'CSV 배치와 현재 편집안이 다릅니다.');
  rejects(`${h}\n2026-02-30,${a.id},1,1,${a.unit},\n`, p, 'CSV 날짜·랙 ID·단위 오류');
  rejects(`${h}\n2026-11-01,없는랙,1,1,${a.unit},\n`, p, 'CSV 날짜·랙 ID·단위 오류');
  rejects(`${h}\n2026-11-01,${a.id},1,1,PLT,\n`, p, 'CSV 날짜·랙 ID·단위 오류');
  rejects(`${h}\n2026-11-01,${a.id},1,-1,${a.unit},\n`, p, 'quantity');
  rejects(`${h}\n2026-11-01,${a.id},1,1e13,${a.unit},\n`, p, 'quantity');
  rejects(`${h}\n2026-11-01,${a.id},1,1,${a.unit},\n2026-11-01,${a.id},2,2,${a.unit},\n`, p, '중복 기록 · 교체 허용을 확인하세요.');
  // 둘째 행만 오류여도 첫 행은 반영되지 않는다
  rejects(`${h}\n2026-11-01,${a.id},1,1,${a.unit},\n2026-11-02,${a.id},x,1,${a.unit},\n`, p, 'capacity');
});

test('같은 날짜·랙 기록은 교체 허용을 켠 때만 교체', () => {
  const p = make(), a = racks(p)[0], line = (q) => `date,rackId,capacity,quantity,unit,source\n2026-11-01,${a.id},10,${q},${a.unit},내 자료\n`;
  p.inventoryHistory = parseInventoryCsv(line(1), p).history;
  rejects(line(2), p, '중복 기록 · 교체 허용을 확인하세요.');
  const r = parseInventoryCsv(line(2), p, { replace: true });
  assert.equal(r.history.length, 1);
  assert.equal(r.history[0].quantity, 2);
  assert.equal(r.history[0].source, '내 자료');
  const q = structuredClone(p);
  importInventory(r.history)(q);
  validateProject(q);
});

test('현재 재고·배치 저장: 랙마다 기록, 같은 날짜 교체, 배치 이력 선택', () => {
  const p = make(), n = racks(p).length;
  assert.equal(inventorySnapshotExists(p, '2026-11-02', true), false);
  saveInventorySnapshot({ id: 's1', date: '2026-11-02', source: '사용자 직접 입력', includeLayout: false, recordedAt: '2026-11-16T00:00:00.000Z' })(p);
  assert.equal(p.inventoryHistory.length, n);
  assert.ok(p.inventoryHistory.every((r) => r.scenario === p.settings.scenario && r.quantity === null));
  assert.equal(p.layoutSnapshots.length, 0);
  assert.equal(inventorySnapshotExists(p, '2026-11-02', false), true);
  racks(p)[0].quantity = 5;
  saveInventorySnapshot({ id: 's2', date: '2026-11-02', source: 'B', includeLayout: true, recordedAt: '2026-11-16T00:00:00.000Z' })(p);
  assert.equal(p.inventoryHistory.length, n);
  assert.equal(p.inventoryHistory.find((r) => r.rackId === racks(p)[0].id).quantity, 5);
  assert.equal(p.layoutSnapshots.length, 1);
  assert.equal(p.layoutSnapshots[0].name, p.metadata.name);
  assert.notEqual(p.layoutSnapshots[0].layout, p.scenarios[p.settings.scenario]);
  validateProject(structuredClone(p));
});
