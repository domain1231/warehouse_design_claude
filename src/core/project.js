// 프로젝트 데이터 모델: 생성(createProject)과 검증·기본값 보정(validateProject).
//
// 기준본 v2.4.1은 validateProject를 12단계(10 → 40 → 50 → 60 → 65×2 → 70×2 → 75 → 80 → 90 → 92)로,
// makeProject를 2단계(80 → 90)로 감싸 기능마다 기본값과 규칙을 덧붙였다(기준본 docs/FUNCTION_CHAIN.md).
// 이 모듈은 그 최종 합성 동작을 한 곳에 펼친 것이다. 단계 순서가 결과에 영향을 주므로
// validateProject 본문의 순서는 기준본 체인의 실제 실행 순서를 따른다(각 단계 주석의 번호).
//
// - 기본값 보정은 입력 객체를 직접 수정하고 같은 객체를 반환한다(기준본과 같은 계약).
// - Golden Master G5(샘플·빈 프로젝트)와 일치해야 한다(tests/golden/G5-project.test.js).
// - 아직 이식하지 않은 부분: 열 우선 모드 프로젝트의 검사 결과 재계산(92, W.scan 필요 — Phase 2·6).
import { createIdGenerator } from './ids.js';

export const SCHEMA_VERSION = '2.3.6';
export const SUPPORTED_VERSIONS = Object.freeze([1, '2.0', '2.2', '2.3.1', '2.3.2', '2.3.3', '2.3.4', '2.3.5', '2.3.6']);
export const OBJECT_TYPES = Object.freeze({ rack: '랙', wall: '내부 벽', column: '기둥', door: '출입문', aisle: '통로', blocked: '보관 불가', work: '작업 공간' });
export const COLORS_DEFAULT = Object.freeze({ empty: '#344052', low: '#315780', mid: '#80b3f1', high: '#e5a052', over: '#e46775', unknown: '#575568' });
export const THEME_KEYS = Object.freeze(['bg', 'panel', 'card', 'line', 'text', 'muted', 'blue', 'selected', 'header', 'canvas', 'floor', 'control']);
export const AISLE_TYPES = Object.freeze(['메인 이동 통로', '작업자 이동 통로', '자재 운반 통로', '랙 접근 통로', '출입문 연결 통로']);
export const EXCEL_FIELDS = Object.freeze([
  'rowNo', 'location', 'itemCode', 'itemName', 'specification', 'reorderPoint', 'maxStock', 'averageInbound3M', 'shelfLevel', 'mixedItemCount',
  'rackWidth', 'rackDepth', 'rackHeight', 'shelfHeight', 'materialHeight', 'heightUtilization', 'rackUtilizationSource', 'sourceUsedArea', 'sourceRemainingSpace', 'note',
]);
const PLACEMENT_MODES = ['inside', 'order', 'aisle', 'column'];

const clone = (x) => JSON.parse(JSON.stringify(x));
const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const parsesAsTime = (t) => Number.isFinite(Date.parse(t));

export class ProjectValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProjectValidationError';
  }
}
const fail = (message) => {
  throw new ProjectValidationError(message);
};

/** 기준본 finite(): 숫자 범위 검사 */
export function finite(v, name, min = 0, max = 1e7) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`${name} 값이 올바르지 않습니다.`);
  return v;
}

/** 기준본 dateOK(): YYYY-MM-DD 이면서 실제 달력 날짜 */
export function dateOK(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
}

const todayLocal = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** 로케이션 문자열 7F-C-5-3-1 파싱(기준본 EX.parse). 건물은 포함하지 않는다. */
export function parseLocation(v) {
  const m = String(v ?? '').replace(/\s/g, '').toUpperCase().match(/^(\d+)F-([A-Z]+)-(\d+)-(\d+)-(\d+)$/);
  if (!m) return null;
  const n = [m[1], m[3], m[4], m[5]].map(Number);
  if (n.some((x) => !Number.isSafeInteger(x) || x < 1 || x > 1e5)) return null;
  return {
    floor: `${n[0]}F`, floorNumber: n[0], column: m[2], rackNumber: n[1], shelfNumber: n[2], position: n[3],
    key: `${n[0]}F-${m[2]}-${n[1]}`, shelfKey: `${n[0]}F-${m[2]}-${n[1]}-${n[2]}`, location: `${n[0]}F-${m[2]}-${n[1]}-${n[2]}-${n[3]}`,
  };
}

/** 기준본 object(): 객체 기본 속성 */
export function createObject(kind, x, y, width, depth, extra = {}, { nextId }) {
  return {
    id: nextId(), kind, code: OBJECT_TYPES[kind], block: '', type: kind === 'rack' ? '중량랙' : OBJECT_TYPES[kind],
    x, y, width, depth, height: 2, rotation: 0, capacity: null, quantity: null, unit: 'BOX', note: '', provenance: '사용자 입력',
    minWidth: 1, targetWidth: 1.5, aisleType: '메인 이동 통로', swing: 'in-right', ...extra,
  };
}

// ---------- 기본값 보정 (기준본 *.ensure) ----------

const autoPlacementDefaults = () => ({ mode: 'inside', keepManual: true, allowRotation: false, allowWarnings: true, preserveStructures: true, allowWrap: false, externalDirection: 'right' });

function ensureEditing(p) { // 50 M.ensure
  p.editing ??= { selectedRackIds: [], selectionRule: 'intersect', allowWarnings: false, groupEditing: { gap: 0.3, order: 'x', anchor: 'first' } };
  p.viewport ??= { zoom: 1, panX: 0, panY: 0, centerLocked: true };
  p.panels ??= { leftOpen: true, rightOpen: true };
  p.commandHistory ??= [];
  p.aisleRules ??= Object.fromEntries(AISLE_TYPES.map((t) => [t, { minWidth: 1, targetWidth: 1.2, enabled: true }]));
}

function ensureExcel(p) { // 40 EX.ensure
  p.locationLayout ??= { originX: 1, originY: 1, columnDirection: 'east', firstRackPosition: 'north', columnGap: 0.6, rackGap: 0.2, northRotation: 0, rotation: 90, wallGap: 0.1, aisleTarget: 1.2, perColumnSettings: {} };
  p.importHistory ??= [];
  p.excelSnapshots ??= [];
  p.settings.vizMode ??= 'inventory';
  p.settings.heightPolicy ??= 'weightedMax';
}

const dims = (o) => ({ width: o.width, depth: o.depth, height: o.height ?? null });
const sameDims = (a, b) => ['width', 'depth', 'height'].every((k) => a[k] === b[k] || (Number.isFinite(a[k]) && Number.isFinite(b[k]) && Math.abs(a[k] - b[k]) < 1e-8));

/** 기준본 최종 S.ensure = 70(rEnsure) ∘ 65(bEnsure) ∘ 60(S.ensure) */
function ensureSpecsPanelsScenarios(p) {
  // 60: 패널·규격
  ensureEditing(p);
  p.panels.bottomOpen ??= true;
  p.panels.bottomSections ??= { inventory: true, racks: true, space: true };
  p.panels.bottomHeight ??= 300;
  p.rackInfographic ??= { shelfOrder: 'bottom' };
  p.specificationHistory ??= [];
  for (const l of [...Object.values(p.scenarios), ...(p.layoutSnapshots || []).map((s) => s.layout).filter(Boolean)]) {
    for (const o of l.objects) {
      if (o.kind === 'rack' && !o.originalSpec) {
        const items = o.excel?.shelves?.flatMap((s) => s.items) || [];
        const i = items.find((it) => it.rackWidth > 0 && it.rackDepth > 0 && it.rackHeight > 0);
        o.originalSpec = i
          ? { width: i.rackWidth / 1e3, depth: i.rackDepth / 1e3, height: i.rackHeight / 1e3, source: o.excel.sourceFile || 'Excel', asOf: o.excel.asOfDate || null, origin: 'excel' }
          : { ...dims(o), source: '등록 당시 설계값 · 실측 미확인', asOf: null, origin: 'design' };
      }
      o.designSpec = dims(o);
      if (o.kind === 'rack') o.specificationChanged = !sameDims(o.originalSpec, o.designSpec);
      o.resizeConstraints ??= { minWidth: 0.05, minDepth: 0.05, maxWidth: 500, maxDepth: 500, aspectLocked: false };
    }
  }
  // 65: 하단 패널 배치이력
  const b = p.panels;
  b.bottomSections.layout ??= b.bottomSections.inventory;
  b.layoutPreset ??= 'restored-default';
  b.panelHeights ??= { upper: Math.round(b.bottomHeight * 0.42), lower: Math.round(b.bottomHeight * 0.58) };
  b.view ??= { rackSearch: '', type: '', load: 'all', rackSort: 'original', rackScroll: 0, inventoryQuery: '', inventoryDate: '', inventoryScroll: 0, layoutScope: 'current', layoutScroll: 0 };
  for (const s of p.layoutSnapshots) {
    s.id ??= `legacy-layout-${s.scenario}-${s.date}`;
    s.name ??= '이름 미기록';
  }
  // 70: 배치 보호·백업·재고 이력 범위
  ensureExcel(p);
  p.scenarioMeta ??= {};
  p.layoutBackups ??= [];
  p.layoutRevisions ??= [];
  for (const k of ['before', 'after']) {
    p.scenarioMeta[k] ??= { locked: k === 'before', versionId: `layout-${k}`, createdAt: null, sourceInfo: null, locationLayout: clone(p.locationLayout) };
    if (p.metadata.sample) p.scenarios[k].referenceSample ??= true;
  }
  for (const r of p.inventoryHistory) {
    if (!r.scenario) {
      const ids = ['before', 'after'].filter((k) => p.scenarios[k].objects.some((o) => o.id === r.rackId));
      r.scenario = ids.length === 1 ? ids[0] : 'legacy';
      if (r.scenario === 'legacy') r.scopeNote = '이전 버전 배치 미지정 · 수량 적용 안 함';
    }
  }
}

function ensureAppearance(p) { // 75 V.ensure
  p.theme ??= { presetId: 'original', customColors: {}, objectColors: { before: {}, after: {} }, colorMode: 'data' };
  p.theme.objectColors ??= { before: {}, after: {} };
  p.theme.objectColors.before ??= {};
  p.theme.objectColors.after ??= {};
  p.rackLabels ??= { orientation: 'screen-horizontal', displayMode: 'rack-code', autoFontSize: true, externalLabelFallback: true };
  p.persistence ??= { lastSavedAt: null, revision: 0 };
}

function ensurePrecision(p, fresh = false) { // 80 Q.ensure
  if (!p?.settings) return;
  p.precision ??= { snapStep: fresh ? 0.01 : p.settings.grid, displayDecimals: 3, keyStep: 0.01, fastStep: 0.1, guides: true, guideSnap: false };
  p.rackLabels ??= { orientation: 'screen-horizontal', displayMode: 'rack-code', autoFontSize: true, externalLabelFallback: true };
  p.rackLabels.layoutMode ??= 'auto';
  p.rackLabels.numberPadding ??= 2;
  p.rackLabels.zoneNames ??= { before: {}, after: {} };
  p.rackLabels.zoneNames.before ??= {};
  p.rackLabels.zoneNames.after ??= {};
}

function extendColumnSettings(s) { // 92 C.extend
  if (isPlain(s)) {
    if (s.allowWrap === undefined) s.allowWrap = false;
    if (s.externalDirection === undefined) s.externalDirection = 'right';
  }
  return s;
}

function ensureAutoPlacement(p) { // 최종 W.ensure = 92 ∘ 90
  ensureSpecsPanelsScenarios(p);
  ensurePrecision(p);
  if (p.autoPlacement === undefined) {
    p.autoPlacement = { version: 1, settings: { before: autoPlacementDefaults(), after: autoPlacementDefaults() }, results: {}, reviewNotes: { before: {}, after: {} }, history: [] };
    p.panels.bottomOpen = false;
  }
  if (!isPlain(p.autoPlacement)) fail('자동 배치 정보 형식 오류');
  for (const k of ['before', 'after']) {
    for (const o of p.scenarios[k].objects) {
      if (o.kind === 'rack' && o.placementMeta === undefined) o.placementMeta = { manualEdited: null, positionLocked: false, waiting: false, editedAt: null };
    }
  }
  for (const k of ['before', 'after']) extendColumnSettings(p.autoPlacement?.settings?.[k]);
}

// ---------- 생성 ----------

/**
 * 새 프로젝트(기준본 makeProject 최종 합성: 90 W.ensure ∘ 80 Q.ensure(fresh) ∘ 00 makeProject).
 * @param {{sample?: boolean, nextId?: () => string, today?: () => string}} options
 */
export function createProject({ sample = true, nextId = createIdGenerator(), today = todayLocal } = {}) {
  const warehouse = { width: 24, height: 14, ceiling: null };
  const objects = [];
  const make = (kind, x, y, w, d, extra) => createObject(kind, x, y, w, d, extra, { nextId });
  if (sample) {
    let n = 701;
    const xs = [0.6, 3.6, 5.3, 7.5, 9.4, 10.3, 12.6, 13.5, 16, 16.9, 19, 21.7];
    xs.forEach((x, i) => {
      const block = i < 4 ? 'A' : i < 8 ? 'B' : 'C';
      for (let j = 0; j < (i === 3 ? 3 : 4); j++) {
        objects.push(make('rack', x, 2.4 + j * 2.05, 0.8, 1.85, { code: `${block}-${n++}`, block, provenance: '도면 참고 샘플' }));
      }
    });
    objects.push(
      make('aisle', 0.3, 0.3, 23.4, 1.6, { code: '북측 통로', minWidth: 1.2, targetWidth: 1.5 }),
      make('aisle', 0.3, 11, 23.4, 1.6, { code: '남측 주통로', minWidth: 1.2, targetWidth: 1.5 }),
      make('door', 10.5, 0.1, 1.4, 1.4, { code: '북측 출입문', swing: 'in-right' }),
      make('door', 5.2, 12.6, 2.4, 1.3, { code: '남측 출입문', swing: 'out-left' }),
      make('door', 21.8, 12.6, 1.7, 1.3, { code: '보조 출입문', swing: 'out-right' }),
    );
    [[0.15, 0.15], [12, 0.15], [23.1, 0.15], [0.15, 13], [12, 13], [23.1, 13]].forEach(([x, y], i) => objects.push(make('column', x, y, 0.7, 0.7, { code: `기둥 ${i + 1}` })));
  }
  const base = { warehouse, objects };
  const p = {
    version: '2.3.3',
    metadata: {
      name: sample ? '자재창고 배치 검토 · 샘플' : '새 창고 프로젝트',
      sample,
      created: today(),
      note: sample ? '첨부 도면 참고. 치수 및 위치는 수정 가능한 샘플이며 실측 아님.' : '',
    },
    scenarios: { before: clone(base), after: clone(base) },
    inventoryHistory: [],
    layoutSnapshots: [],
    settings: { scenario: 'after', grid: 0.5, gridOn: true, snap: true, policy: 'warn', minGap: 0, low: 50, high: 90, colors: { ...COLORS_DEFAULT }, background: { data: '', show: false, opacity: 0.25, x: 0, y: 0, width: 24, height: 14 } },
  };
  ensurePrecision(p, true);
  ensureAutoPlacement(p);
  return p;
}

// ---------- 검증 ----------

function isSimplePolygon(v) {
  const n = v.length;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const intersects = (a, b, c, d) => {
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (intersects(v[i], v[(i + 1) % n], v[j], v[(j + 1) % n])) return false;
    }
  }
  return true;
}

function validateColumnOptions(o) { // 92 C.validateOptions
  if (!isPlain(o)) fail('열 배치 기준 형식 오류');
  const d = { allowWrap: false, keepManual: true, allowRotation: false, externalDirection: 'right', northRotation: 0, columnDirection: 'east', firstRackPosition: 'north', order: '', first: {} };
  for (const k of Object.keys(d)) if (o[k] === undefined) o[k] = d[k];
  for (const k of ['allowWrap', 'keepManual', 'allowRotation']) if (typeof o[k] !== 'boolean') fail(`열 배치 옵션 오류: ${k}`);
  if (o.externalDirection !== 'right' || ![0, 90, 180, 270].includes(o.northRotation) || !['east', 'west'].includes(o.columnDirection) || !['north', 'south'].includes(o.firstRackPosition) || typeof o.order !== 'string' || o.order.length > 1e4 || !isPlain(o.first) || Object.keys(o.first).length > 1500) fail('열 배치 방향/순서 오류');
  for (const [k, v] of Object.entries(o.first)) if (k.length > 1e4 || !['north', 'south'].includes(v)) fail('열별 진행 방향 오류');
  return o;
}

const validPlacementMeta = (m) => m && [null, true, false].includes(m.manualEdited) && typeof m.positionLocked === 'boolean' && typeof m.waiting === 'boolean' && (m.editedAt === null || (typeof m.editedAt === 'string' && parsesAsTime(m.editedAt)));

/** 배치(BEFORE/AFTER/스냅샷/백업) 검증: 기준본 최종 validateLayout = 92 ∘ 90 ∘ 10 */
export function validateLayout(l) {
  if (!l || !l.warehouse || !Array.isArray(l.objects) || l.objects.length > 1500) fail('배치 형식 또는 객체 수가 올바르지 않습니다.');
  finite(l.warehouse.width, '가로', 1, 500);
  finite(l.warehouse.height, '세로', 1, 500);
  if (l.warehouse.ceiling !== null) finite(l.warehouse.ceiling, '천장', 0.05, 100);
  const ids = new Set();
  const codes = new Set();
  for (const o of l.objects) {
    if (!o || !OBJECT_TYPES[o.kind] || typeof o.id !== 'string' || !o.id || ids.has(o.id)) fail('객체 ID 중복 또는 잘못된 종류입니다.');
    ids.add(o.id);
    for (const k of ['code', 'type', 'block', 'unit', 'note', 'provenance']) if (typeof o[k] !== 'string' || o[k].length > 1e4) fail(`${k} 텍스트 형식 오류`);
    if (!o.code.trim() || !o.unit.trim()) fail('번호와 단위는 필수입니다.');
    if (o.kind === 'rack') {
      if (codes.has(o.code)) fail(`랙 번호 중복: ${o.code}`);
      codes.add(o.code);
    }
    finite(o.x, 'X', -1e3, 1e3);
    finite(o.y, 'Y', -1e3, 1e3);
    finite(o.width, '폭', 0.01, 500);
    finite(o.depth, '깊이', 0.01, 500);
    finite(o.height, '높이', 0.01, 100);
    finite(o.rotation, '회전', -36e3, 36e3);
    for (const k of ['capacity', 'quantity']) if (o[k] !== null) finite(o[k], k, 0, 1e12);
    finite(o.minWidth, '최소 통로 폭', 0, 500);
    finite(o.targetWidth, '목표 통로 폭', o.minWidth, 500);
    if (!['in-right', 'in-left', 'out-right', 'out-left'].includes(o.swing)) fail('문 방향 오류');
  }
  // 90
  if (l.autoPlacementRules) {
    const r = l.autoPlacementRules;
    if (!PLACEMENT_MODES.includes(r.mode)) fail('배치 기준 모드 오류');
    for (const n of ['wallGap', 'rackGap', 'columnGap', 'aisleTarget']) finite(r[n], n, 0, 50);
  }
  for (const o of l.objects) if (o.placementMeta !== undefined && !validPlacementMeta(o.placementMeta)) fail('랙 위치 보호 정보 오류');
  // 92
  if (l.autoPlacementRules?.mode === 'column') {
    const r = l.autoPlacementRules;
    if (r.columnOptions === undefined) r.columnOptions = validateColumnOptions({});
    validateColumnOptions(r.columnOptions);
  }
  return l;
}

function checkExcelHierarchy(e, counter) { // 40 checkExcel
  if (!e || typeof e.key !== 'string' || typeof e.building !== 'string' || !Array.isArray(e.shelves) || e.shelves.length > 1e3) fail('Excel 랙 계층 형식 오류');
  for (const s of e.shelves) {
    finite(s.level, '선반 번호', 1, 1e5);
    if (!Array.isArray(s.items) || s.items.length > 2e4) fail('Excel 선반 목록 형식 오류');
    const seen = new Set();
    for (const i of s.items) {
      counter.items++;
      const loc = parseLocation(i.location);
      if (!loc || loc.key !== e.key || loc.shelfNumber !== s.level || seen.has(i.location)) fail('Excel 자재 로케이션 연결/중복 오류');
      seen.add(i.location);
      for (const k of EXCEL_FIELDS) {
        const v = i[k];
        if (v !== null && v !== undefined && typeof v !== 'number' && typeof v !== 'string') fail('Excel 필드 형식 오류');
        if (typeof v === 'number' && !Number.isFinite(v)) fail('Excel 숫자 형식 오류');
        if (typeof v === 'string' && v.length > 2e4) fail('Excel 텍스트 길이 초과');
      }
    }
  }
}

function checkColumnSettings(s) { // 92 C.checkSettings
  extendColumnSettings(s);
  if (!isPlain(s) || typeof s.allowWrap !== 'boolean' || s.externalDirection !== 'right') fail('열 배치 설정 오류 · 외부 방향은 오른쪽만 지원합니다.');
}

/**
 * 프로젝트 검증과 기본값 보정. 입력 객체를 보정해 그대로 반환한다. 실패 시 ProjectValidationError.
 * 실행 순서는 기준본 12단계 체인의 실제 호출 순서다.
 */
export function validateProject(p) {
  if (!p || typeof p !== 'object') fail('지원되지 않는 프로젝트 형식/버전입니다.');
  try {
    // [70r] S.ensure → [65b] S.ensure → [60] S.ensure → [50] M.ensure → [40] EX.ensure (모두 멱등, 한 번으로 충분)
    if (p.scenarios && p.metadata && p.settings) {
      ensureSpecsPanelsScenarios(p);
    }
  } catch (e) {
    if (e instanceof ProjectValidationError) throw e;
    fail('지원되지 않는 프로젝트 형식/버전입니다.');
  }

  // [10] 기본 구조
  if (!SUPPORTED_VERSIONS.includes(p.version) || !p.scenarios || !p.metadata || typeof p.metadata.name !== 'string' || p.metadata.name.length > 1e3) fail('지원되지 않는 프로젝트 형식/버전입니다.');
  validateLayout(p.scenarios.before);
  validateLayout(p.scenarios.after);
  if (!Array.isArray(p.inventoryHistory) || !Array.isArray(p.layoutSnapshots) || p.inventoryHistory.length > 1e5 || p.layoutSnapshots.length > 1e3) fail('이력 형식 또는 개수 오류');
  const layoutKeys = new Set();
  for (const s of p.layoutSnapshots) {
    if (!dateOK(s.date) || !['before', 'after'].includes(s.scenario) || layoutKeys.has(`${s.date}|${s.scenario}`)) fail('잘못되거나 중복된 배치 이력');
    layoutKeys.add(`${s.date}|${s.scenario}`);
    validateLayout(s.layout);
  }
  const seen = new Set();
  for (const s of p.inventoryHistory) {
    const key = `${s.date}|${s.rackId}|${s.scenario || 'legacy'}`;
    if (!dateOK(s.date) || typeof s.rackId !== 'string' || !s.rackId || typeof s.unit !== 'string' || !s.unit || typeof s.source !== 'string' || !s.source.trim() || seen.has(key)) fail('재고 이력 날짜/ID/단위/출처 중복 또는 형식 오류');
    seen.add(key);
    for (const k of ['capacity', 'quantity']) if (s[k] !== null) finite(s[k], k, 0, 1e12);
  }
  const st = p.settings;
  if (!st || !['before', 'after'].includes(st.scenario) || !['warn', 'block'].includes(st.policy) || typeof st.gridOn !== 'boolean' || typeof st.snap !== 'boolean') fail('설정 형식 오류');
  finite(st.grid, '그리드', 0.05, 10);
  finite(st.minGap, '최소 간격', 0, 20);
  finite(st.low, '보통 기준', 1, 98);
  finite(st.high, '주의 기준', st.low + 1, 100);
  for (const k of Object.keys(COLORS_DEFAULT)) if (!isHex(st.colors?.[k])) fail('색상 형식 오류');
  const bg = st.background;
  if (!bg || typeof bg.data !== 'string' || bg.data.length > 9e6 || (bg.data && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(bg.data))) fail('안전한 PNG/JPEG/WebP 배경만 지원합니다.');
  finite(bg.opacity, '투명도', 0, 1);
  finite(bg.x, '배경 X', -1e3, 1e3);
  finite(bg.y, '배경 Y', -1e3, 1e3);
  finite(bg.width, '배경 폭', 0.01, 2e3);
  finite(bg.height, '배경 높이', 0.01, 2e3);

  // [40] Excel
  if (!Array.isArray(p.importHistory) || !Array.isArray(p.excelSnapshots) || p.importHistory.length > 1e4 || p.excelSnapshots.length > 1e3) fail('Excel 이력 형식/개수 오류');
  if (!['inventory', 'height', 'registered', 'management'].includes(st.vizMode) || !['weightedMax', 'meanMax', 'max'].includes(st.heightPolicy)) fail('Excel 표시 설정 오류');
  const ll = p.locationLayout;
  for (const k of ['originX', 'originY']) finite(ll[k], k, -1e3, 1e3);
  for (const k of ['columnGap', 'rackGap', 'wallGap', 'aisleTarget']) finite(ll[k], k, 0, 50);
  finite(ll.rotation, '회전', -36e3, 36e3);
  if (![0, 90, 180, 270].includes(ll.northRotation) || !['east', 'west'].includes(ll.columnDirection) || !['north', 'south'].includes(ll.firstRackPosition) || !ll.perColumnSettings || typeof ll.perColumnSettings !== 'object') fail('자동 배치 설정 형식 오류');
  for (const h of p.importHistory) if (!dateOK(h.date) || !Array.isArray(h.keys) || h.keys.some((k) => typeof k !== 'string')) fail('가져오기 이력 형식 오류');
  const counter = { items: 0 };
  for (const l of [...Object.values(p.scenarios), ...p.layoutSnapshots.map((s) => s.layout)]) for (const o of l.objects) if (o.excel) checkExcelHierarchy(o.excel, counter);
  const seenDates = new Set();
  for (const s of p.excelSnapshots) {
    if (!dateOK(s.date) || !['before', 'after'].includes(s.scenario) || !Array.isArray(s.data) || seenDates.has(`${s.date}|${s.scenario}`)) fail('Excel 스냅샷 형식/날짜 중복 오류');
    seenDates.add(`${s.date}|${s.scenario}`);
    for (const d of s.data) {
      if (typeof d.id !== 'string') fail('Excel 스냅샷 ID 오류');
      checkExcelHierarchy(d.excel, counter);
    }
  }
  if (counter.items > 3e5) fail('Excel 전체 이력 자재 수가 지원 한도를 초과합니다.');

  // [50] 편집·화면·명령
  if (!['1', '2.0', '2.2', '2.3.1', '2.3.2', '2.3.3', '2.3.4', '2.3.5', '2.3.6'].includes(String(p.version))) fail('지원되지 않는 편집 버전');
  const ed = p.editing;
  const vp = p.viewport;
  if (!Array.isArray(ed.selectedRackIds) || ed.selectedRackIds.some((id) => typeof id !== 'string') || !['intersect', 'contain'].includes(ed.selectionRule) || typeof ed.allowWarnings !== 'boolean') fail('편집 상태 형식 오류');
  finite(vp.zoom, '배율', 1e-4, 30);
  finite(vp.panX, '화면 X', -5e3, 5e3);
  finite(vp.panY, '화면 Y', -5e3, 5e3);
  if (typeof vp.centerLocked !== 'boolean' || typeof p.panels.leftOpen !== 'boolean' || typeof p.panels.rightOpen !== 'boolean' || !Array.isArray(p.commandHistory) || p.commandHistory.length > 200) fail('화면·명령 상태 형식 오류');
  for (const r of Object.values(p.aisleRules)) {
    finite(r.minWidth, '통로 최소 폭', 0, 500);
    finite(r.targetWidth, '통로 목표 폭', r.minWidth, 500);
    if (typeof r.enabled !== 'boolean') fail('통로 기준 형식 오류');
  }
  for (const type of AISLE_TYPES) if (!p.aisleRules[type] || typeof p.aisleRules[type] !== 'object') fail('통로 유형 기준 누락');
  ed.groupEditing ??= { gap: 0.3, order: 'x', anchor: 'first' };
  finite(ed.groupEditing.gap, '편집 간격', 0, 500);
  for (const h of p.commandHistory) {
    if (!h || typeof h.id !== 'string' || typeof h.type !== 'string' || typeof h.time !== 'string' || typeof h.success !== 'boolean' || !Array.isArray(h.targetIds) || h.targetIds.length > 1500 || h.targetIds.some((id) => typeof id !== 'string') || !Array.isArray(h.before) || !Array.isArray(h.after)) fail('편집 명령 형식 오류');
    for (const v of [...h.before, ...h.after]) {
      if (typeof v.id !== 'string' || typeof v.code !== 'string') fail('편집 명령 객체 형식 오류');
      for (const k of ['x', 'y', 'rotation']) finite(v[k], k, -36e3, 36e3);
      for (const k of ['width', 'depth']) finite(v[k], k, 0.01, 500);
    }
  }
  for (const l of [...Object.values(p.scenarios), ...p.layoutSnapshots.map((s) => s.layout)]) {
    for (const o of l.objects) {
      if (o.vertices) {
        if (o.kind !== 'aisle' || !Array.isArray(o.vertices) || o.vertices.length < 3 || o.vertices.length > 60 || o.vertices.some((v) => !Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)) || !isSimplePolygon(o.vertices)) fail('보호 통로 다각형 형식 오류');
      }
      if (o.kind === 'aisle') {
        if (o.clearanceAxis && !['auto', 'x', 'y'].includes(o.clearanceAxis)) fail('통로 단면 방향 오류');
        if (o.scopeIds && (!Array.isArray(o.scopeIds) || o.scopeIds.some((id) => typeof id !== 'string'))) fail('통로 검사 대상 ID 오류');
        if (o.warningsEnabled !== undefined && typeof o.warningsEnabled !== 'boolean') fail('통로 경고 설정 오류');
      }
    }
  }

  // [60] 하단 패널·규격
  const pb = p.panels;
  if (typeof pb.bottomOpen !== 'boolean' || !pb.bottomSections || ['inventory', 'racks', 'space'].some((k) => typeof pb.bottomSections[k] !== 'boolean')) fail('하단 패널 상태 형식 오류');
  finite(pb.bottomHeight, '하단 높이', 96, 900);
  if (!['bottom', 'top'].includes(p.rackInfographic.shelfOrder) || !Array.isArray(p.specificationHistory) || p.specificationHistory.length > 500) fail('규격·선반 설정 형식 오류');
  for (const l of Object.values(p.scenarios)) {
    for (const o of l.objects) {
      const c = o.resizeConstraints;
      for (const k of ['minWidth', 'minDepth']) finite(c[k], k, 0.01, 500);
      finite(c.maxWidth, '최대 폭', c.minWidth, 500);
      finite(c.maxDepth, '최대 깊이', c.minDepth, 500);
      if (typeof c.aspectLocked !== 'boolean') fail('비율 잠금 형식 오류');
      if (o.originalSpec) {
        for (const k of ['width', 'depth']) finite(o.originalSpec[k], `원본 ${k}`, 0.01, 500);
        if (o.originalSpec.height !== null) finite(o.originalSpec.height, '원본 높이', 0.01, 500);
        if (typeof o.originalSpec.source !== 'string' || !['excel', 'design'].includes(o.originalSpec.origin)) fail('원본 규격 형식 오류');
      }
    }
  }

  // [65b] 배치이력 패널
  const view = pb.view;
  if (typeof pb.bottomSections.layout !== 'boolean' || !['restored-default', 'custom'].includes(pb.layoutPreset)) fail('배치이력 패널 상태 오류');
  finite(pb.panelHeights.upper, '상단 패널 높이', 40, 800);
  finite(pb.panelHeights.lower, '하단 패널 높이', 40, 800);
  for (const k of ['rackSearch', 'type', 'load', 'rackSort', 'inventoryQuery', 'inventoryDate', 'layoutScope']) if (typeof view[k] !== 'string' || view[k].length > 2e3) fail('패널 검색 상태 오류');
  for (const k of ['rackScroll', 'inventoryScroll', 'layoutScroll']) finite(view[k], '패널 스크롤', 0, 1e8);
  if (!['original', 'code', 'codeDesc'].includes(view.rackSort) || !['current', 'all'].includes(view.layoutScope)) fail('패널 정렬 상태 오류');
  for (const s of p.layoutSnapshots) {
    if (typeof s.id !== 'string' || typeof s.name !== 'string' || (s.recordedAt !== undefined && (typeof s.recordedAt !== 'string' || !parsesAsTime(s.recordedAt)))) fail('배치 기록 식별자·시각 오류');
  }

  // [65rec] 규격 변경 이력
  if (vp.fitScale !== undefined) finite(vp.fitScale, '기준 화면 배율', 1e-3, 1e5);
  for (const h of p.specificationHistory) {
    if (!h || !['id', 'time', 'rackId', 'code', 'scenario', 'type', 'source'].every((k) => typeof h[k] === 'string') || !['before', 'after'].includes(h.scenario) || !['design-only', 'physical-confirmed'].includes(h.type) || !parsesAsTime(h.time)) fail('규격 변경 이력 형식 오류');
    for (const d of [h.before, h.after]) {
      if (!d || typeof d !== 'object') fail('규격 변경 이력 치수 누락');
      finite(d.width, '이력 폭', 0.01, 500);
      finite(d.depth, '이력 깊이', 0.01, 500);
      if (d.height !== null) finite(d.height, '이력 높이', 0, 500);
    }
  }

  // [70r] 배치 보호·백업
  if (!Array.isArray(p.layoutBackups) || p.layoutBackups.length > 6 || !Array.isArray(p.layoutRevisions) || p.layoutRevisions.length > 100) fail('배치 백업·수정 이력 오류');
  for (const k of ['before', 'after']) if (typeof p.scenarioMeta[k]?.locked !== 'boolean' || typeof p.scenarioMeta[k].versionId !== 'string') fail('배치 보호 상태 오류');
  for (const b of p.layoutBackups) {
    if (!b || !['before', 'after'].includes(b.target) || typeof b.id !== 'string' || !parsesAsTime(b.time) || !b.meta || !Array.isArray(b.excelSnapshots) || !Array.isArray(b.layoutSnapshots) || !Array.isArray(b.inventoryHistory)) fail('백업 구조 오류');
    validateLayout(b.layout);
  }
  for (const r of p.inventoryHistory) if (!['before', 'after', 'legacy'].includes(r.scenario)) fail('재고 이력 배치 오류');

  // [70rMeta] 대상별 Excel 배치 기준
  for (const k of ['before', 'after']) {
    const m = p.scenarioMeta[k];
    const l = m.locationLayout;
    if (!l || !['east', 'west'].includes(l.columnDirection) || !['north', 'south'].includes(l.firstRackPosition)) fail('대상 자동 배치 설정 오류');
    for (const n of ['originX', 'originY']) finite(l[n], n, -1e3, 1e3);
    for (const n of ['columnGap', 'rackGap', 'wallGap', 'aisleTarget']) finite(l[n], n, 0, 50);
    finite(l.rotation, '회전', -36e3, 36e3);
    if (m.sourceInfo !== null) {
      const s = m.sourceInfo;
      if (!s || !['file', 'sheet', 'asOf', 'source', 'importedAt'].every((key) => typeof s[key] === 'string') || !dateOK(s.asOf) || !parsesAsTime(s.importedAt)) fail('배치 Excel 출처 정보 오류');
    }
  }

  // [75] 색상·라벨·저장 메타
  ensureAppearance(p);
  const theme = p.theme;
  if (!theme || !['data', 'custom'].includes(theme.colorMode) || !theme.customColors || Array.isArray(theme.customColors)) fail('테마 형식 오류');
  for (const [k, c] of Object.entries(theme.customColors)) if (!THEME_KEYS.includes(k) || !isHex(c)) fail('UI 색상 형식 오류');
  for (const k of ['before', 'after']) {
    const map = theme.objectColors[k];
    if (!map || Array.isArray(map) || typeof map !== 'object' || Object.keys(map).length > 1500) fail('객체 색상 형식 오류');
    for (const c of Object.values(map)) if (!isHex(c)) fail('객체 색상 형식 오류');
  }
  const labels = p.rackLabels;
  if (labels.orientation !== 'screen-horizontal' || !['rack-code', 'occupancy', 'detail', 'minimal'].includes(labels.displayMode) || labels.autoFontSize !== true || labels.externalLabelFallback !== true) fail('랙 라벨 설정 오류');
  if (!Number.isSafeInteger(p.persistence.revision) || p.persistence.revision < 0 || (p.persistence.lastSavedAt !== null && !parsesAsTime(p.persistence.lastSavedAt))) fail('저장 메타데이터 오류');

  // [80] 정밀 편집·ZONE 라벨
  ensurePrecision(p);
  const pr = p.precision;
  for (const key of ['snapStep', 'keyStep', 'fastStep']) {
    finite(pr[key], key, 1e-3, 10);
    if (Math.abs(pr[key] * 1e3 - Math.round(pr[key] * 1e3)) > 1e-6) fail('정밀 배치 간격은 0.001m 단위여야 합니다.');
  }
  if (![2, 3, 4].includes(pr.displayDecimals) || typeof pr.guides !== 'boolean' || typeof pr.guideSnap !== 'boolean' || pr.fastStep < pr.keyStep) fail('정밀 편집 설정 오류');
  if (!['auto', 'stacked', 'inline', 'minimal'].includes(labels.layoutMode) || ![0, 2, 3].includes(labels.numberPadding)) fail('ZONE 라벨 설정 오류');
  for (const k of ['before', 'after']) {
    const names = labels.zoneNames[k];
    if (!names || typeof names !== 'object' || Array.isArray(names) || Object.keys(names).length > 1500) fail('ZONE 표시 이름 형식 오류');
    for (const [key, name] of Object.entries(names)) if (key.length > 300 || typeof name !== 'string' || name.length > 80) fail('ZONE 표시 이름은 80자 이하로 입력하세요.');
  }

  // [90] 자동 배치 저장 형식
  ensureAutoPlacement(p);
  const ap = p.autoPlacement;
  if (ap.version !== 1 || !ap.settings || !ap.results || !ap.reviewNotes || !Array.isArray(ap.history) || ap.history.length > 40) fail('자동 배치 저장 형식 오류');
  for (const k of ['before', 'after']) {
    const s = ap.settings[k];
    if (!s || !PLACEMENT_MODES.includes(s.mode) || ['keepManual', 'allowRotation', 'allowWarnings', 'preserveStructures'].some((n) => typeof s[n] !== 'boolean')) fail('자동 배치 설정 오류');
    const notes = ap.reviewNotes[k];
    if (!notes || typeof notes !== 'object' || Array.isArray(notes) || Object.keys(notes).length > 1500 || Object.values(notes).some((n) => n !== 'review')) fail('위반 검토 상태 오류');
    const r = ap.results[k];
    if (r && (!Array.isArray(r.rows) || r.rows.length > 1500 || typeof r.fingerprint !== 'string' || !parsesAsTime(r.checkedAt))) fail('배치 검사 결과 형식 오류');
  }
  for (const h of ap.history) {
    if (!h || !['before', 'after'].includes(h.scenario) || !parsesAsTime(h.time) || typeof h.acknowledged !== 'boolean' || typeof h.fingerprint !== 'string' || !h.layout) fail('자동 배치 확인 이력 오류');
    validateLayout(h.layout);
  }

  // [92] 열 우선 설정 (검사 결과 재계산은 Phase 2·6에서 이식)
  for (const k of ['before', 'after']) checkColumnSettings(ap.settings[k]);
  for (const b of p.layoutBackups || []) if (b.autoPlacement?.settings) checkColumnSettings(b.autoPlacement.settings);

  p.version = SCHEMA_VERSION;
  return p;
}

/** BEFORE와 AFTER가 객체 참조를 공유하지 않는지 확인한다(기준본 V.independent). */
export function assertIndependent(p) {
  const seen = new WeakSet();
  const walk = (o, visit) => {
    if (!o || typeof o !== 'object') return;
    visit(o);
    for (const v of Object.values(o)) walk(v, visit);
  };
  walk(p.scenarios.before, (o) => seen.add(o));
  walk(p.scenarios.after, (o) => {
    if (seen.has(o)) fail('BEFORE/AFTER가 객체 참조를 공유합니다. 저장을 중단했습니다.');
  });
}
