// E7(D-092) 크기 예산 검사용 가상 사용 시나리오(명시적인 가상 시험값, 운영 자료 아님).
// 규모는 11/02 운영 파일 구성(랙 59대·랙당 약 4.5KB·선반 2.5단·Excel 행 약 585바이트·29개 열)에 맞췄다.
// Excel 가져오기 = apply.js와 같은 순서(적용 전 배치 백업 → 배치·Excel 스냅샷 → 자동 배치 확인 이력).
// 배치 저장 = 다른 기준일의 배치 스냅샷 기록(AFTER). 자동 배치 = 자동 배치 후보를 고른 Excel 가져오기(AFTER) — 앱에서 확인 이력은 Excel 적용 때만 생긴다.
import { createProject, createObject } from '../../../src/core/project.js';
import { createIdGenerator } from '../../../src/core/ids.js';
import { projectValidator } from '../../../src/core/session.js';
import { backupTarget } from '../../../src/excel/apply.js';
import { scanLayout } from '../../../src/warehouse/constraints.js';

const NOW = '2026-11-25T00:00:00.000Z';
const now = () => NOW;
const day = (i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
const COLS = 'ABCDEFGHIJ';

function excelRow(col, no, level, pos, seed) {
  const location = `7F-${col}-${no}-${level}-${pos}`;
  return {
    sourceRow: 9 + seed, rowNo: seed + 1, location, itemCode: `P${String(seed).padStart(6, '0')}`, itemName: `가상 시험 품목 ${seed} — 규격 확인용 긴 이름 (운영 파일 품목명 길이에 맞춘 가상 문자열)`, specification: `가상 규격 ${seed % 97}×${seed % 53}×${seed % 31} mm, 재질 가상`,
    reorderPoint: (seed * 7) % 500, maxStock: (seed * 11) % 2000, averageInbound3M: (seed * 3) % 300, shelfLevel: level, mixedItemCount: 1,
    rackWidth: 1800, rackDepth: 900, rackHeight: 2400, shelfHeight: 800, materialHeight: 300 + (seed % 400), heightUtilization: ((300 + (seed % 400)) / 800), rackUtilizationSource: 0.5, sourceUsedArea: 1.2, sourceRemainingSpace: 0.4,
    note: `가상 비고 ${seed} · 입고 주기·보관 조건 메모 길이를 운영 파일과 비슷하게 맞춘 가상 문자열`, floor: '7F', floorNumber: 7, column: col, rackNumber: no, shelfNumber: level, position: pos, key: `7F-${col}-${no}`, shelfKey: `7F-${col}-${no}-${level}`,
  };
}

function rackExcel(col, no, seed) {
  const levels = 3;
  return {
    key: `7F-${col}-${no}`, floor: '7F', column: col, rackNumber: no, building: 'SYN', issues: [], sourceFile: '가상 시험 파일.xlsx', sheet: '가상', asOfDate: day(0), placeholder: false, physicalConfirmed: false, missingInLatest: false, originalRackSpecification: { width: 1800, depth: 900, height: 2400, source: '가상 시험 파일' },
    shelves: Array.from({ length: levels }, (_, l) => ({ level: l + 1, items: [excelRow(col, no, l + 1, 1, seed * 10 + l)] })),
  };
}

/** 가상 사용 시나리오를 실행한 프로젝트. 모든 단계는 검증기를 통과한다. */
export function usageProject({ racks = 60, imports = 30, saves = 30, autos = 10 } = {}) {
  const nextId = createIdGenerator({ seed: 'e7' });
  let p = projectValidator(createProject({ sample: false, nextId }));
  p.scenarios.before.warehouse = { width: 40, height: 30, ceiling: 6 };
  p.scenarios.before.objects = Array.from({ length: racks }, (_, i) => {
    const col = COLS[i % COLS.length], no = 1 + Math.floor(i / COLS.length);
    return createObject('rack', 1 + (i % 10) * 3.6, 1 + Math.floor(i / 10) * 2.4, 1.8, 0.9, { code: `${col}-${no}`, excel: rackExcel(col, no, i) }, { nextId });
  });
  p.scenarios.after = structuredClone(p.scenarios.before);
  p = projectValidator(p);
  let d = 0;
  const history = (k) => {
    p.autoPlacement.history.push({ id: nextId(), scenario: k, time: NOW, acknowledged: true, fingerprint: scanLayout(p.scenarios[k], p, { now }).fingerprint, candidate: '기존 배치 규칙', backupId: p.layoutBackups.at(-1)?.id ?? null, layout: structuredClone(p.scenarios[k]) });
    if (p.autoPlacement.history.length > 40) p.autoPlacement.history.shift();
  };
  for (let i = 0; i < Math.max(imports, saves); i++) {
    if (i < imports) { // Excel 가져오기(BEFORE)
      backupTarget(p, 'before', 'Excel 가져오기', { nextId, now });
      for (const o of p.scenarios.before.objects) for (const s of o.excel.shelves) for (const it of s.items) it.materialHeight = 300 + ((it.rowNo + i * 13) % 400);
      const date = day(d++);
      p.excelSnapshots.push({ id: nextId(), date, scenario: 'before', source: '가상 시험 파일', data: p.scenarios.before.objects.map((o) => ({ id: o.id, excel: structuredClone(o.excel) })) });
      p.layoutSnapshots.push({ id: nextId(), date, scenario: 'before', name: `가상 시험 파일 · before`, recordedAt: NOW, layout: structuredClone(p.scenarios.before) });
      history('before');
    }
    if (i < saves) { // 배치 저장(AFTER 배치를 다른 기준일로 기록)
      p.scenarios.after.objects[i % racks].x += 0.001;
      p.layoutSnapshots.push({ id: nextId(), date: day(d++), scenario: 'after', name: '배치 저장', recordedAt: NOW, layout: structuredClone(p.scenarios.after) });
    }
    if (i < autos) { // 자동 배치 후보로 Excel 가져오기(AFTER) — 앱에서 자동 배치 확인 이력은 Excel 적용 때만 생긴다
      backupTarget(p, 'after', 'Excel 가져오기', { nextId, now });
      p.scenarios.after.objects[(i * 7) % racks].y += 0.001;
      const date = day(d++);
      p.excelSnapshots.push({ id: nextId(), date, scenario: 'after', source: '가상 시험 파일', data: p.scenarios.after.objects.map((o) => ({ id: o.id, excel: structuredClone(o.excel) })) });
      p.layoutSnapshots.push({ id: nextId(), date, scenario: 'after', name: `가상 시험 파일 · after`, recordedAt: NOW, layout: structuredClone(p.scenarios.after) });
      history('after');
    }
    p = projectValidator(p);
  }
  // 명령 이력 200건(상한, 11/02 운영 파일과 같은 개수): 이동 명령의 전후 객체 요약
  const snap = (o, dx) => ({ id: o.id, code: o.code, x: o.x + dx, y: o.y, rotation: o.rotation, width: o.width, depth: o.depth });
  p.commandHistory = Array.from({ length: 200 }, (_, i) => { const o = p.scenarios.after.objects[i % racks]; return { id: `cmd-${i}`, type: 'move', targetIds: [o.id], before: [snap(o, 0)], after: [snap(o, 0.1)], time: NOW, success: true, reason: '', scenario: 'after' }; });
  return projectValidator(p);
}
