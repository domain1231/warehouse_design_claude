// Excel 열 매핑·분석(기준본 40 EX.norm·EX.number·EX.parse·loadSheet 머리글 찾기·EX.autoMap·EX.analyze). DOM 없음.
// 원본 규격과 설계 규격을 섞지 않는다. 수량·현재고 정보가 없으므로 MAX Stock·평균 입고를 현재고로 쓰지 않는다.
import { EXCEL_FIELD_LABELS as FIELDS } from '../warehouse/rackinfo.js';
import { formatNumber as fmt } from '../core/format.js';
import { parseLocationCode, legacyColumn } from '../core/location.js';

export { FIELDS };
const TEXT_FIELDS = new Set(['location', 'itemCode', 'itemName', 'specification', 'note']);
const NUMERIC = new Set(FIELDS.map(([k]) => k).filter((k) => !TEXT_FIELDS.has(k)));
export const REQUIRED_FIELDS = ['location', 'rackWidth', 'rackDepth', 'rackHeight'];

/** 머리글 비교용 정규화(전각·공백·괄호·%·단위 기호 제거). */
export const normHeader = (v) => String(v ?? '').normalize('NFKC').toLowerCase().replace(/[\s\n\r()[\]{}%._²㎡]/g, '').replace(/m2/g, 'm');

/** 숫자 칸: 빈 값은 null, 참/거짓은 NaN(오류), 천 단위 쉼표 허용. */
export const excelNumber = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : typeof v === 'boolean' ? NaN : Number(String(v).replace(/,/g, '').trim()));

/** 로케이션 코드 '7F-A-1-2-3'(층-열-랙-선반-위치). 공백 제거·대문자. 형식이 틀리면 null. */
// D-049: 형식 해석은 core/location.js 공용 구현을 쓴다.
export { romanToNumber } from '../core/location.js';
export function parseExcelLocation(v) {
  return parseLocationCode(v);
}

/** 머리글 행 찾기: 앞 40행 중 필드 이름과 가장 많이 일치하는 행(0부터). 일치가 없으면 7(8행). */
export function detectHeaderRow(matrix) {
  let best = { score: 0, row: 7 };
  for (let r = 0; r < Math.min(40, matrix.length); r++) {
    const values = (matrix[r] || []).map(normHeader);
    const score = FIELDS.filter(([, name]) => values.includes(normHeader(name))).length;
    if (score > best.score) best = { score, row: r };
  }
  return best.row;
}

/** 머리글 이름으로 열 자동 매핑. headerRow1: 머리글 행(1부터). 찾지 못하면 -1. */
export function autoMap(matrix, headerRow1) {
  const row = matrix[headerRow1 - 1] || [];
  return Object.fromEntries(FIELDS.map(([key, name]) => [key, row.findIndex((v) => normHeader(v) === normHeader(name))]));
}

/**
 * 분석(기준본 EX.analyze). 선반·랙 계층, 규격 충돌, 높이 입력, 원본 면적 참고값을 검사한다.
 * @param {{ matrix: any[][], headerRow1: number, mapping: Record<string, number>, cell: (addr: string) => any, resolutions?: Record<string, number[]>, formula?: (addr: string) => boolean, formulaText?: (addr: string) => string, tableRef?: string|null }} input
 * @returns {{ rows, racks, issues, duplicates, dataRows, referenceArea, area, dimensionConflicts }}
 */
export function analyzeSheet({ matrix, headerRow1, mapping: map, cell = () => undefined, resolutions = {}, formula = () => false, formulaText = () => '', tableRef = null }) {
  const issues = [], rows = [], seen = new Set(), racks = new Map();
  const add = (type, row, text) => issues.push({ type, row, text });
  for (const k of REQUIRED_FIELDS) if (map[k] === undefined || map[k] < 0) add('error', headerRow1, '필수 열 미지정: ' + FIELDS.find(([key]) => key === k)[1]);
  const mapped = Object.values(map).filter((n) => n >= 0);
  if (new Set(mapped).size !== mapped.length) add('error', headerRow1, '동일 원본 열이 여러 필드에 매핑되었습니다.');
  let dataRows = 0, duplicates = 0;
  for (let idx = headerRow1; idx < matrix.length; idx++) {
    const r = matrix[idx] || [];
    if (!r.some((v) => v !== null && String(v).trim() !== '')) continue;
    dataRows++;
    const item = { sourceRow: idx + 1 };
    let bad = false;
    for (const [k] of FIELDS) {
      const v = map[k] >= 0 ? r[map[k]] : null;
      item[k] = v === undefined ? null : v;
      if (typeof item[k] === 'string') item[k] = item[k].trim();
      if (NUMERIC.has(k)) {
        const n = excelNumber(v);
        if (Number.isNaN(n)) {
          if (k === 'rackUtilizationSource' || k === 'heightUtilization') {
            item[k] = v;
            add('warning', idx + 1, k + ' 원본 값은 참고로만 보관합니다.');
          } else {
            add('error', idx + 1, k + ' 숫자 형식 오류');
            bad = true;
          }
        } else item[k] = n;
      } else item[k] = String(v ?? '').trim();
    }
    const loc = parseExcelLocation(item.location);
    if (!loc) {
      add('error', idx + 1, '빈 로케이션 또는 잘못된 코드: ' + item.location);
      continue;
    }
    if (seen.has(loc.location)) {
      duplicates++;
      add('error', idx + 1, '중복 로케이션: ' + loc.location);
      continue;
    }
    seen.add(loc.location);
    Object.assign(item, loc);
    if (item.shelfLevel !== null && item.shelfLevel !== loc.shelfNumber) add('warning', idx + 1, 'Rack 단수와 선반 번호 불일치 · 로케이션 번호를 사용');
    for (const k of ['reorderPoint', 'maxStock', 'averageInbound3M', 'materialHeight', 'shelfHeight', 'rackWidth', 'rackDepth', 'rackHeight']) {
      if (item[k] !== null && (!Number.isFinite(item[k]) || item[k] < 0)) {
        add('error', idx + 1, k + '는 0 이상이어야 합니다.');
        bad = true;
      }
    }
    if (bad) continue;
    rows.push(item);
    let rack = racks.get(loc.key);
    if (!rack) {
      rack = { key: loc.key, floor: loc.floor, column: loc.column, rackNumber: loc.rackNumber, items: [], shelves: new Map(), issues: [] };
      racks.set(loc.key, rack);
    }
    rack.items.push(item);
    let shelf = rack.shelves.get(loc.shelfNumber);
    if (!shelf) {
      shelf = { level: loc.shelfNumber, key: loc.shelfKey, items: [] };
      rack.shelves.set(loc.shelfNumber, shelf);
    }
    shelf.items.push(item);
  }
  const dimensionConflicts = [];
  for (const rack of racks.values()) {
    const sets = new Map();
    for (const item of rack.items) {
      if (item.rackWidth > 0 && item.rackDepth > 0 && item.rackHeight > 0) {
        const dim = [item.rackWidth, item.rackDepth, item.rackHeight];
        sets.set(dim.join('|'), dim);
      }
    }
    const options = [...sets.values()];
    if (!options.length) {
      add('error', rack.items[0].sourceRow, rack.key + ' 유효한 랙 치수 없음');
      rack.invalid = true;
      continue;
    }
    if (options.length > 1) {
      dimensionConflicts.push({ key: rack.key, options });
      const choice = resolutions[rack.key];
      if (!choice) {
        add('conflict', rack.items[0].sourceRow, rack.key + ' 규격 불일치 · 사용할 치수를 직접 선택하세요.');
        rack.unresolved = true;
      } else rack.dimensions = choice;
    } else rack.dimensions = options[0];
    rack.shelves = [...rack.shelves.values()].sort((a, b) => a.level - b.level);
    for (const shelf of rack.shelves) {
      shelf.items.sort((a, b) => a.position - b.position);
      const hs = new Set(shelf.items.map((i) => i.shelfHeight).filter((v) => v !== null));
      if (hs.size > 1) {
        rack.issues.push(shelf.key + ' 선반 높이 불일치');
        add('warning', shelf.items[0].sourceRow, shelf.key + ' 선반 높이 불일치 · 랙 높이 집계 미확인 처리');
      }
      const ps = new Set(shelf.items.map((i) => i.materialHeight).filter((v) => v !== null));
      if (ps.size > 1) rack.issues.push(shelf.key + ' 복수 자재 높이: ' + [...ps].join(', ') + 'mm');
      for (const i of shelf.items) {
        if (!i.shelfHeight || i.materialHeight === null) add('warning', i.sourceRow, '높이 활용률 계산 입력 누락');
        else if (typeof i.heightUtilization === 'number' && Math.abs(i.heightUtilization - i.materialHeight / i.shelfHeight) > 1e-6) add('warning', i.sourceRow, '원본 용적률과 높이 재계산값 불일치');
      }
    }
  }
  let referenceArea = null;
  if (normHeader(cell('C3')).includes('총면적')) referenceArea = excelNumber(cell('C4'));
  const area = [...racks.values()].filter((r) => r.dimensions).reduce((n, r) => n + (r.dimensions[0] * r.dimensions[1]) / 1e6, 0);
  const sourceArea = rows.reduce((n, r) => n + (r.sourceUsedArea || 0), 0);
  if (sourceArea > area + 1e-6) add('warning', null, `원본 사용 면적 반복 합계 ${fmt(sourceArea, 4)}㎡ → 고유 랙 ${fmt(area, 4)}㎡로 재계산`);
  if (cell('D4') > 1) add('warning', 4, '원본 면적 사용률 100% 초과 · 직접 재계산');
  if (cell('E4') < 0) add('warning', 4, '원본 통로 비중 음수 · 실제 통로로 사용하지 않음');
  if (rows.length && rows.every((r) => String(r.rackUtilizationSource) === '0')) add('warning', null, '원본 랙 용적률은 모두 0 · 실제 적재율로 사용하지 않음');
  // D-049: 숫자로 시작하는 열 이름(예: 2A)은 재구축만 읽는다. 이 랙을 담은 프로젝트 JSON은 v2.4.1에서 열 수 없다.
  const modern = [...new Set([...racks.values()].filter((r) => !r.invalid && !legacyColumn(r.column)).map((r) => r.column))];
  if (modern.length) add('warning', null, `열 이름 ${modern.slice(0, 8).join('·')}${modern.length > 8 ? ' …' : ''}은(는) v2.4.1이 읽지 못하는 형식입니다. 이 랙을 적용한 프로젝트 JSON은 v2.4.1에서 열 수 없습니다.`);
  add('warning', null, '현재고·수량 단위·실제 평면 좌표가 없습니다. MAX Stock/평균 입고는 현재고로 대입하지 않습니다.');
  add('warning', null, '자동 배치 위치는 사용자 규칙에 따른 초기 설계안이며 실측 관계는 미확인입니다.');
  const result = { rows, racks: [...racks.values()].filter((r) => !r.invalid), issues, duplicates, dataRows, referenceArea, area, dimensionConflicts };
  const excelSummary = readSummary(cell, formula, tableRef);
  if (excelSummary) excelSummary.qDivisor = qDivisorOf(matrix, headerRow1, formulaText);
  if (excelSummary) { // 머리글이 맞을 때만(없으면 키 없음)
    result.excelSummary = excelSummary;
    // Excel 표는 거부된 행(형식 밖 로케이션·중복)도 센다. 대조용으로 모든 데이터 행을 숫자 변환만 해서 따로 보관한다.
    const numAt = (r, k) => { const n = map[k] >= 0 ? excelNumber(r[map[k]]) : null; return Number.isNaN(n) ? null : n; };
    result.summaryRows = [];
    for (let idx = headerRow1; idx < matrix.length; idx++) {
      const r = matrix[idx] || [];
      if (!r.some((v) => v !== null && String(v).trim() !== '')) continue;
      result.summaryRows.push({ sourceRow: idx + 1, location: map.location >= 0 ? String(r[map.location] ?? '').trim() : '', shelfHeight: numAt(r, 'shelfHeight'), materialHeight: numAt(r, 'materialHeight'), rackWidth: numAt(r, 'rackWidth'), rackDepth: numAt(r, 'rackDepth'), rackHeight: numAt(r, 'rackHeight') });
    }
  }
  return result;
}

// C7: 용적률(Q) 열 수식 'P9/H9'(IFERROR·시트 한정·$ 허용)의 나누는 열 중 가장 많은 것. 수식이 없으면 null.
function qDivisorOf(matrix, headerRow1, formulaText) {
  const head = matrix[headerRow1 - 1] || [];
  const qc = head.findIndex((v) => normHeader(v) === normHeader('용적률(%)'));
  if (qc < 0) return null;
  const counts = new Map();
  for (let idx = headerRow1; idx < matrix.length; idx++) {
    const m = /(?:[\w.]+!)?[A-Z]{1,3}\$?\d+\s*\/\s*(?:(?:'[^']*'|[\w.]+)!)?\$?([A-Z]{1,3})\$?\d+/.exec(formulaText(encodeColLetter(qc) + (idx + 1)) || '');
    if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const ci = top[0].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return { column: top[0], header: String(head[ci] ?? '').replace(/\s+/g, ' ').trim(), rows: top[1] };
}
const encodeColLetter = (c) => { let s = ''; for (c += 1; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s; return s; };

// C7: 방 시트 Summary(C3..H3 머리글, C4..H4 값). 숫자만 받는다(그 밖은 null).
const SUMMARY_LABELS = [['C', '총면적'], ['D', '면적사용률'], ['E', '통로비중'], ['F', '평균용적률'], ['G', "rackq'ty"]];
const sumNum = (v) => { const n = excelNumber(v); return typeof n === 'number' && Number.isFinite(n) ? n : null; };
export function readSummary(cell, formula, tableRef) {
  const h = (c) => normHeader(cell(c + '3'));
  if (!SUMMARY_LABELS.every(([c, k]) => h(c).includes(k))) return null;
  if (!h('H').includes('유휴') || !h('H').includes("q'ty")) return null;
  const cols = ['C', 'D', 'E', 'F', 'G', 'H'];
  const formulas = Object.fromEntries(cols.slice(1).map((c) => [c + '4', !!formula(c + '4')]));
  return { totalArea: sumNum(cell('C4')), areaUse: sumNum(cell('D4')), aisleShare: sumNum(cell('E4')), avgVolume: sumNum(cell('F4')), rackCount: sumNum(cell('G4')), idleRacks: sumNum(cell('H4')), lowLocations: null, formulas, tableRef: tableRef || null, qDivisor: null };
}
