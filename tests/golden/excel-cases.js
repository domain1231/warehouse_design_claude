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

export const excelCases = [
  { name: '기본(공유 문자열)', file: 'synthetic-basic.xlsx', aoa: main, sst: true },
  { name: '기본(인라인 문자열)', file: 'synthetic-inline.xlsx', aoa: main, sst: false },
  { name: '규격 충돌 선택 후 재분석', file: 'synthetic-basic.xlsx', aoa: main, sst: true, resolutions: { '7F-A-2': [900, 1850, 2000] } },
  { name: '필수 열 없음·같은 열 중복 매핑', file: 'synthetic-missing.xlsx', aoa: [HEADER.filter((h) => h !== 'Rack 높이 (mm)'), ['1', '7F-A-1-1-1']], sst: true, remap: { itemName: 1 } },
  { name: 'CSV(UTF-8 BOM, 따옴표·쉼표)', file: 'synthetic.csv', csv: '﻿' + [HEADER.map((h) => `"${h}"`).join(','), '1,7F-A-1-1-1,P-001,"부품, 쉼표",S,10,50,"1,250",1,1,800,1850,2000,400,120,,0,1.48,,', '2,7F-A-1-1-2,P-002,"따옴표 ""안""",S,10,50,3,1,1,800,1850,2000,400,380,0.95,0,1.48,,비고'].join('\r\n') + '\r\n' },
  { name: '머리글 행 자동 탐지 실패(기본 8행)', file: 'synthetic-noheader.xlsx', aoa: [['a', 'b'], [1, 2]], sst: true },
];
