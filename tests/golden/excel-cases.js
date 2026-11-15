// Excel 가져오기 대조용 가상 통합 문서(데이터만, 실제 업무 자료 아님).
// tools/excel-diff.mjs가 기준본 페이지의 SheetJS로 .xlsx/.csv 바이트를 만들어 fixtures/excel/에 저장하고,
// 같은 바이트를 기준본 EX.readFile·EX.analyze에 넣은 결과를 fixtures/legacy/excel-cases.json에 기록한다.
// tests/golden/X1-excel.test.js는 저장된 바이트를 재구축본 읽기·분석에 넣어 대조한다.
const HEADER = ['No.', '로케이션', '품목코드', '품목명', '규격', 'ROP', 'MAX  Stock', '3개월 평균 입고수량', 'Rack 단수', '혼적수', 'Rack 가로(mm)', 'Rack 세로 (mm)', 'Rack 높이 (mm)', 'Rack 단 높이 (mm)', '자재높이 (mm)', '용적률(%)', '랙 용적률(%)', '사용 면적(㎡)', '유휴 공간', '비고'];
const row = (no, loc, code, name, dims, sh, mh, extra = {}) => [no, loc, code, name, extra.spec ?? 'SYN-SPEC', extra.rop ?? 10, extra.max ?? 50, extra.avg ?? 12.5, extra.level ?? Number(loc.split('-')[3]), 1, dims[0], dims[1], dims[2], sh, mh, extra.hu ?? null, extra.ru ?? 0, extra.area ?? 1.48, '', extra.note ?? ''];
const D = [800, 1850, 2000];

const main = [
  ['가상 창고 자재 목록 (SYNTHETIC)'],
  [],
  [null, null, '총면적', '면적 사용률', '통로 비중'],
  [null, null, 336, 1.2, -0.1],
  [],
  ['※ 가상 자료'],
  [],
  HEADER,
  row(1, '7F-A-1-1-1', 'P-001', '가상 부품 하나', D, 400, 120),
  row(2, '7F-A-1-1-2', 'P-002', '가상 부품 둘', D, 400, 380, { hu: 0.95 }),
  row(3, '7F-A-1-2-1', 'B-100', '박스 자재', D, 350, 400, { hu: 0.5 }),
  row(4, '7f-a-1-2-2', 'B-101', '소문자 로케이션', D, 360, null),
  row(5, '7F-A-2-1-1', 'C-200', '규격 다른 랙 1', D, 400, 200),
  row(6, '7F-A-2-1-2', 'C-201', '규격 다른 랙 2', [900, 1850, 2000], 400, 210),
  row(7, '7F-B-10-3-1', 'D-300', '열 B', [1200, 600, 2500], 500, 100, { level: 2 }),
  row(8, '7F-B-10-3-1', 'D-301', '중복 로케이션', [1200, 600, 2500], 500, 100),
  row(9, '7F-B-11-1-1', 'E-400', '숫자 오류', [1200, 600, 2500], 'abc', 100),
  row(10, '7F-B-12-1-1', 'E-401', '음수 높이', [1200, 600, 2500], 500, -5),
  row(11, '잘못된-코드', 'E-402', '로케이션 오류', [1200, 600, 2500], 500, 100),
  row(12, '7F-C-1-1-1', 'F-500', '치수 없음', [0, 0, 0], 500, 100),
  row(13, '7F-B-10-1-1', 'G-600', '참고 용적률 문자', [1200, 600, 2500], 500, 100, { ru: '높음', note: '  앞뒤 공백  ' }),
  [],
  row(14, '7F-B-10-1-2', 'G-601', '빈 행 뒤', [1200, 600, 2500], 450, 100, { rop: '1,200' }),
];

// 후보 탐색용 다수 랙(3열 × 7랙, 크기 다양). 가상 자료.
const many = [HEADER];
let no = 1;
for (const [ci, col] of ['A', 'B', 'C'].entries()) {
  for (let n = 1; n <= 7; n++) {
    const dims = [800 + ((n * 170 + ci * 90) % 700), 600 + ((n * 310 + ci * 140) % 1250), 2000];
    many.push(row(no++, `7F-${col}-${n}-1-1`, `M-${col}${n}`, '다수 랙 자재', dims, 400, 100 + n * 10, { level: 1 }));
  }
}

export const excelCases = [
  { name: '기본(공유 문자열)', file: 'synthetic-basic.xlsx', aoa: main, sst: true },
  { name: '기본(인라인 문자열)', file: 'synthetic-inline.xlsx', aoa: main, sst: false },
  { name: '규격 충돌 선택 후 재분석', file: 'synthetic-basic.xlsx', aoa: main, sst: true, resolutions: { '7F-A-2': [900, 1850, 2000] } },
  { name: '필수 열 없음·같은 열 중복 매핑', file: 'synthetic-missing.xlsx', aoa: [HEADER.filter((h) => h !== 'Rack 높이 (mm)'), ['1', '7F-A-1-1-1']], sst: true, remap: { itemName: 1 } },
  { name: 'CSV(UTF-8 BOM, 따옴표·쉼표)', file: 'synthetic.csv', csv: '﻿' + [HEADER.map((h) => `"${h}"`).join(','), '1,7F-A-1-1-1,P-001,"부품, 쉼표",S,10,50,"1,250",1,1,800,1850,2000,400,120,,0,1.48,,', '2,7F-A-1-1-2,P-002,"따옴표 ""안""",S,10,50,3,1,1,800,1850,2000,400,380,0.95,0,1.48,,비고'].join('\r\n') + '\r\n' },
  { name: '다수 랙(후보 탐색용)', file: 'synthetic-many.xlsx', aoa: many, sst: true },
  { name: '머리글 행 자동 탐지 실패(기본 8행)', file: 'synthetic-noheader.xlsx', aoa: [['a', 'b'], [1, 2]], sst: true },
];

// 배치안 대조 사례(Phase 5b). 입력: synthetic-basic.xlsx 분석 + fixtures/legacy/v2.4.1-primary.project.json.
// steps를 차례로 실행하며, 'commit'은 직전 배치안을 대상 배치에 그대로 넣는다(적용 트랜잭션 대신 비교용).
const baseConfig = {
  building: 'SYN', floor: '7F', width: 24, depth: 14.2, originX: 1, originY: 1, northRotation: 0, columnDirection: 'east', firstRackPosition: 'north',
  columnGap: 0.6, rackGap: 0.2, rotation: 90, wallGap: 0.1, aisleTarget: 1.2, order: '', perColumnSettings: {}, empty: false, emptyW: 1, emptyD: 0.6, emptyH: 2,
  mode: 'new', keep: 'keep', date: '2026-11-01', source: '가상 자료', recordLayout: false, target: 'after', missingPolicy: 'mark', specPolicy: 'keep',
  autoPlacement: { mode: 'inside', keepManual: true, allowRotation: false, allowWarnings: true, preserveStructures: true },
};
export const proposalCases = [
  { name: '새 배치(기존 수동 랙·구조물 보호)', resolutions: { '7F-A-2': [800, 1850, 2000] }, steps: [{ c: {} }] },
  { name: '새 배치(수동 랙 보호 끔·구조물 제외)', resolutions: { '7F-A-2': [800, 1850, 2000] }, steps: [{ c: { autoPlacement: { ...baseConfig.autoPlacement, keepManual: false, preserveStructures: false } } }] },
  { name: '열 순서·북쪽 회전·서쪽 진행·남쪽 시작·열별 설정·빈 번호 후보', resolutions: { '7F-A-2': [900, 1850, 2000] }, steps: [{ c: { order: 'B, A', northRotation: 90, columnDirection: 'west', firstRackPosition: 'south', empty: true, perColumnSettings: { A: { x: 2.5, y: 3, rotation: 0 } }, autoPlacement: { ...baseConfig.autoPlacement, keepManual: false } } }] },
  { name: '병합: 규격 변경(설계 유지)·누락 표시·자재 변경', resolutions: { '7F-A-2': [800, 1850, 2000] }, steps: [{ c: { autoPlacement: { ...baseConfig.autoPlacement, keepManual: false } } }, 'commit', { c: { mode: 'merge', autoPlacement: { ...baseConfig.autoPlacement, keepManual: false } }, resolutions: { '7F-A-2': [900, 1850, 2000] }, dropRack: '7F-A-1', editItem: true }] },
  { name: '갱신 모드: 새 랙 제외·누락 삭제 승인·새 Excel 규격 적용', resolutions: { '7F-A-2': [800, 1850, 2000] }, steps: [{ c: { autoPlacement: { ...baseConfig.autoPlacement, keepManual: false } } }, 'commit', { c: { mode: 'update', keep: 'reflow', specPolicy: 'source', missingPolicy: 'delete', autoPlacement: { ...baseConfig.autoPlacement, keepManual: false } }, resolutions: { '7F-A-2': [900, 1850, 2000] }, dropRack: '7F-A-1', deleteMissing: true, onlyRacks: ['7F-A-1', '7F-A-2'] }] },
  { name: '적용: 새 배치 → 병합 재적용(배치 기록 포함)', resolutions: { '7F-A-2': [800, 1850, 2000] }, steps: [{ c: { autoPlacement: { ...baseConfig.autoPlacement, keepManual: false } } }, 'apply', { c: { mode: 'merge', recordLayout: true, autoPlacement: { ...baseConfig.autoPlacement, keepManual: false } }, resolutions: { '7F-A-2': [900, 1850, 2000] }, dropRack: '7F-A-1' }, 'apply'] },
  { name: '적용: BEFORE 대상 같은 날짜 두 번(스냅숏 교체·백업 재사용)', resolutions: { '7F-A-2': [800, 1850, 2000] }, steps: [{ c: { target: 'before' } }, 'apply', { c: { target: 'before', mode: 'merge' } }, 'apply'] },
  // Phase 6a 자동 배치 후보(W.build). build: true면 W.base 결과 뒤에 후보 목록·선택을 기록한다.
  { name: '후보: 넓은 창고(후보 0 그대로 선택)', resolutions: { '7F-A-2': [800, 1850, 2000] }, steps: [{ c: { autoPlacement: { ...baseConfig.autoPlacement, keepManual: false } }, build: true }] },
  { name: '후보: 좁은 창고·내부 우선', resolutions: { '7F-A-2': [800, 1850, 2000] }, steps: [{ c: { width: 9, depth: 6, autoPlacement: { ...baseConfig.autoPlacement, keepManual: false } }, build: true }] },
  { name: '후보: 좁은 창고·순서 우선·회전 허용', resolutions: { '7F-A-2': [800, 1850, 2000] }, steps: [{ c: { width: 9, depth: 6, autoPlacement: { ...baseConfig.autoPlacement, mode: 'order', allowRotation: true, keepManual: false } }, build: true }] },
  { name: '후보: 통로 우선·서쪽 진행·남쪽 시작', resolutions: { '7F-A-2': [800, 1850, 2000] }, steps: [{ c: { width: 10, depth: 7, columnDirection: 'west', firstRackPosition: 'south', autoPlacement: { ...baseConfig.autoPlacement, mode: 'aisle', keepManual: false } }, build: true }] },
  { name: '후보: 병합·재배치·수동 랙 보호', resolutions: { '7F-A-2': [800, 1850, 2000] }, steps: [{ c: { autoPlacement: { ...baseConfig.autoPlacement, keepManual: false } } }, 'commit', { c: { mode: 'merge', keep: 'reflow', width: 12, depth: 8 }, resolutions: { '7F-A-2': [900, 1850, 2000] }, build: true }] },
  { name: '후보(다수 랙): 좁은 창고·내부 우선(대기열 발생)', file: 'synthetic-many.xlsx', resolutions: {}, steps: [{ c: { width: 12, depth: 8, autoPlacement: { ...baseConfig.autoPlacement, keepManual: false, preserveStructures: false } }, build: true, reopt: [{ scope: 'all' }, { scope: 'boundary' }] }] },
  { name: '후보(다수 랙): 순서 우선·회전 허용', file: 'synthetic-many.xlsx', resolutions: {}, steps: [{ c: { width: 16, depth: 9, autoPlacement: { ...baseConfig.autoPlacement, mode: 'order', allowRotation: true, keepManual: false, preserveStructures: false } }, build: true, reopt: [{ scope: 'collision' }, { scope: 'all' }] }] },
  { name: '후보(다수 랙): 기존 배치 위 병합·새 랙만 재최적화', file: 'synthetic-many.xlsx', resolutions: {}, steps: [{ c: { autoPlacement: { ...baseConfig.autoPlacement, keepManual: false } } }, 'commit', { c: { mode: 'merge', keep: 'keep', width: 18, depth: 10, autoPlacement: { ...baseConfig.autoPlacement, keepManual: false } }, build: true, reopt: [{ scope: 'new' }, { scope: 'all' }] }] },
  { name: '후보(다수 랙): 통로 우선·구조물 유지·서쪽·남쪽', file: 'synthetic-many.xlsx', resolutions: {}, steps: [{ c: { width: 24, depth: 14.2, columnDirection: 'west', firstRackPosition: 'south', aisleTarget: 1.5, autoPlacement: { ...baseConfig.autoPlacement, mode: 'aisle', keepManual: false } }, build: true }] },
  { name: '후보(다수 랙): 열 순서 지정·넓은 간격', file: 'synthetic-many.xlsx', resolutions: {}, steps: [{ c: { width: 20, depth: 10, order: 'C, A, B', columnGap: 1.2, rackGap: 0.4, autoPlacement: { ...baseConfig.autoPlacement, keepManual: false, preserveStructures: false } }, build: true }] },
  { name: '후보(다수 랙): 아주 좁은 창고(창고 밖 대기열)', file: 'synthetic-many.xlsx', resolutions: {}, steps: [{ c: { width: 6, depth: 4, autoPlacement: { ...baseConfig.autoPlacement, keepManual: false, preserveStructures: false } }, build: true, reopt: [{ scope: 'selected' }, { scope: 'boundary' }, { scope: 'selected', select: [0, 5, 9] }, { scope: 'collision' }] }] },
  { name: '사용자 순서 오류', resolutions: { '7F-A-2': [800, 1850, 2000] }, steps: [{ c: { order: 'A' } }] },
].map((x) => ({ ...x, steps: x.steps.map((s) => (typeof s === 'string' ? s : { ...s, c: { ...baseConfig, ...s.c } })) }));
