// E1 크기 상한 왕복 검사용 합성 프로젝트(명시적인 가상 시험값, 운영 자료 아님).
// 앱 저장본과 같은 구성: BEFORE 배치 1개(합성 랙 N개)를 날짜별 배치 이력으로 복제하고, 마지막 이력 이름 길이로 앱이 내려받는 JSON 크기를 목표 바이트에 정확히 맞춘다.
import { createProject, createObject } from '../../src/core/project.js';
import { backupTarget } from '../../src/excel/apply.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { projectValidator, storeScanResults } from '../../src/core/session.js';
import { projectJsonText } from '../../src/persistence/project-file.js';

const bytes = (s) => Buffer.byteLength(s, 'utf8');

function baseProject(racks) {
  const nextId = createIdGenerator({ seed: 'size-e1' });
  const p = projectValidator(createProject({ sample: false, nextId }));
  const l = p.scenarios.before;
  l.warehouse = { width: 100, height: 60, ceiling: 6 };
  l.objects = Array.from({ length: racks }, (_, i) => createObject('rack', 1 + (i % 40) * 2.4, 1 + Math.floor(i / 40) * 1.6, 2, 1, { code: `SYN-${String(i + 1).padStart(4, '0')}` }, { nextId }));
  return projectValidator(p);
}

const day = (i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);

/** 앱이 내려받는 JSON(projectJsonText, 기본은 읽기 쉬운 JSON = 기준본·E1 이전 앱 저장본)이 정확히 target 바이트인 검증된 프로젝트와 그 원문. */
export function sizedProject(target, { racks = 400, format = 'pretty' } = {}) {
  const p0 = baseProject(racks);
  const make = (n, pad = 0) => {
    const q = structuredClone(p0);
    q.layoutSnapshots = Array.from({ length: n }, (_, i) => ({ id: `syn-snap-${i}`, name: `합성 배치 이력 ${day(i)}` + (i === n - 1 ? 'x'.repeat(pad) : ''), date: day(i), scenario: 'before', recordedAt: '2026-11-25T00:00:00.000Z', layout: structuredClone(p0.scenarios.before) }));
    // 앱 저장본처럼 BEFORE/AFTER 배치 검사 결과(autoPlacement.results)를 함께 기록한다(저장 시 session이 붙이는 값).
    return projectValidator(storeScanResults(projectValidator(q), { now: () => '2026-11-25T00:00:00.000Z' }));
  };
  const size = (q) => bytes(projectJsonText(q, format));
  const s1 = size(make(1)), per = size(make(2)) - s1;
  if (target < s1) throw new Error('목표 크기가 너무 작습니다');
  let n = 1 + Math.floor((target - s1) / per);
  let project = make(n);
  const pad = target - size(project);
  project = make(n, pad);
  const text = projectJsonText(project, format);
  if (bytes(text) !== target) throw new Error(`크기 맞춤 실패: ${bytes(text)} ≠ ${target}`);
  return { project, text };
}

// E5(D-089) 검사용: 배치 이력이 쌓인 가상 프로젝트(백업마다 그때까지의 스냅샷 전체 복사).
/**
 * 11/25 파일 형태(F6)의 가상 프로젝트: Excel 가져오기를 n번 할 때마다 '적용 전 백업 → 그 기준일 배치·Excel 스냅샷 추가' 순서(runTransaction과 같음).
 * 백업은 그때까지의 스냅샷 전체를 복사한다.
 */
export function historyProject({ racks = 300, imports = 4, seed = 'e5' } = {}) {
  const nextId = createIdGenerator({ seed });
  let p = projectValidator(createProject({ sample: false, nextId }));
  const l = p.scenarios.before;
  l.warehouse = { width: 100, height: 60, ceiling: 6 };
  l.objects = Array.from({ length: racks }, (_, i) => createObject('rack', 1 + (i % 40) * 2.4, 1 + Math.floor(i / 40) * 1.6, 2, 1, { code: `SYN-${i + 1}`, excel: { key: `SYN-${i + 1}`, building: 'SYN', shelves: [] } }, { nextId }));
  p = projectValidator(p);
  for (let i = 0; i < imports; i++) {
    backupTarget(p, 'before', 'Excel 가져오기', { nextId, now: () => '2026-11-25T00:00:00.000Z' });
    p.scenarios.before.objects[i].x += 0.001; // 가져오기마다 배치가 조금씩 바뀜
    p.layoutSnapshots.push({ id: nextId(), name: `배치 ${`2026-10-${String(10 + i).padStart(2, '0')}`}`, date: `2026-10-${String(10 + i).padStart(2, '0')}`, scenario: 'before', recordedAt: '2026-11-25T00:00:00.000Z', source: 'Excel', layout: structuredClone(p.scenarios.before) });
    p.excelSnapshots.push({ id: nextId(), date: `2026-10-${String(10 + i).padStart(2, '0')}`, scenario: 'before', source: '가상 시험 파일', data: p.scenarios.before.objects.map((o) => ({ id: o.id, excel: structuredClone(o.excel) })) });
    p = projectValidator(p);
  }
  return { p, nextId };
}
