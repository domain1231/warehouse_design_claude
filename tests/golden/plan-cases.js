// 카메라 대조 사례(데이터만). tools/plan-diff.mjs가 기준본에서 결과를 받아 fixtures/legacy/plan-cases.json에 기록하고
// tests/golden/P1-plan.test.js가 재구축본 src/cad/camera.js 결과와 대조한다. 사례를 바꾸면 기준본에서 다시 생성해야 한다.
// steps: { op: 'zoom', f, anchor? } | { op: 'center', reset } | { op: 'focus', count }
const locked = { zoom: 1, panX: 0, panY: 0, centerLocked: true };
const free = { zoom: 1.3, panX: 2.25, panY: -1.5, centerLocked: false };

export const cameraCases = [
  { name: '기본 화면(가로)', size: { w: 1000, h: 600 }, viewport: locked, steps: [] },
  { name: '기본 화면(세로·모바일)', size: { w: 390, h: 700 }, viewport: locked, steps: [] },
  { name: '중심 고정 확대 버튼', size: { w: 1000, h: 600 }, viewport: locked, steps: [{ op: 'zoom', f: 0.8 }, { op: 'zoom', f: 0.8 }] },
  { name: '중심 고정이면 기준점 무시', size: { w: 1000, h: 600 }, viewport: locked, steps: [{ op: 'zoom', f: 0.8, anchor: { x: 3, y: 4 } }] },
  { name: '자유 화면 기준점 확대·축소', size: { w: 1000, h: 600 }, viewport: free, steps: [{ op: 'zoom', f: 0.8, anchor: { x: 3, y: 4 } }, { op: 'zoom', f: 1.25, anchor: { x: 10.5, y: 2 } }] },
  { name: '휠 한 프레임(e^0.1, e^-0.1)', size: { w: 1280, h: 720 }, viewport: free, steps: [{ op: 'zoom', f: Math.exp(0.1), anchor: { x: 1, y: 1 } }, { op: 'zoom', f: Math.exp(-0.1), anchor: { x: 7.123, y: 5.5 } }] },
  { name: '배율 상한 30', size: { w: 1000, h: 600 }, viewport: free, steps: [{ op: 'zoom', f: 0.001, anchor: { x: 5, y: 5 } }] },
  { name: '배율 하한 0.05', size: { w: 1000, h: 600 }, viewport: free, steps: [{ op: 'zoom', f: 1000, anchor: { x: 5, y: 5 } }] },
  { name: '선택 영역 보기(랙 3개)', size: { w: 1000, h: 600 }, viewport: locked, steps: [{ op: 'focus', count: 3 }] },
  { name: '선택 영역 보기(랙 1개, 좁은 화면)', size: { w: 390, h: 700 }, viewport: locked, steps: [{ op: 'focus', count: 1 }] },
  { name: '중심 맞춤(배율 유지)', size: { w: 1000, h: 600 }, viewport: free, steps: [{ op: 'center', reset: false }] },
  { name: '전체 보기(100%)', size: { w: 1000, h: 600 }, viewport: free, steps: [{ op: 'center', reset: true }] },
  { name: '아주 작은 화면(1px 하한)', size: { w: 0, h: 0 }, viewport: locked, steps: [] },
];

// 랙 목록·검색·필터 대조 사례(Phase 4). 입력 배치: fixtures/legacy/v2.4.1-primary.project.json AFTER.
export const listCases = [
  { name: '전체·도면 순서' },
  { name: '번호 오름차순', rackSort: 'code' },
  { name: '검색 b-7·번호 내림차순', rackSearch: 'b-7', rackSort: 'codeDesc' },
  { name: '정보 없음 필터', load: 'unknown' },
  { name: '랙 종류 중량랙·검색 72', type: '중량랙', rackSearch: '72' },
  { name: '빈 랙 필터(해당 없음)', load: 'empty' },
];

// 랙 상세·재고 기록 대조용 가상 자료(Phase 4b). AFTER 4번째 랙에 Excel 선반 계층을 붙이고 재고 기록 3건을 넣는다.
export function detailFixture(rackId, otherRackId) {
  const item = (shelf, pos, code, name, shelfHeight, materialHeight, row) => ({ rowNo: row, location: `7F-A-1-${shelf}-${pos}`, position: pos, itemCode: code, itemName: name, specification: 'SYN', reorderPoint: 10, maxStock: 50, averageInbound3M: 12.5, shelfLevel: shelf, mixedItemCount: 1, rackWidth: 800, rackDepth: 1850, rackHeight: 2000, shelfHeight, materialHeight, heightUtilization: null, rackUtilizationSource: '', sourceUsedArea: null, sourceRemainingSpace: '', note: '', sourceRow: row + 1 });
  return {
    excel: { key: '7F-A-1', building: 'SYN', floor: '7', column: 'A', rackNumber: 1, sourceFile: 'synthetic.xlsx', asOfDate: '2026-10-31', shelves: [
      { level: 1, items: [item(1, 2, 'P-002', '가상 부품 둘', 400, 380, 3), item(1, 1, 'P-001', '가상 부품 하나', 400, 120, 2)] },
      { level: 2, items: [item(2, 1, 'B-100', '박스 자재', 350, 400, 4)] },
      { level: 3, items: [], emptyConfirmed: true },
      { level: 4, items: [] },
    ] },
    inventory: [
      { date: '2026-10-01', rackId, capacity: 100, quantity: 40, unit: 'BOX', source: '가상 기록', scenario: 'after' },
      { date: '2026-10-05', rackId: otherRackId, capacity: null, quantity: 5, unit: 'BOX', source: '가상 기록', scenario: 'after' },
      { date: '2026-09-30', rackId, capacity: 80, quantity: null, unit: 'BOX', source: '이전 버전', scenario: 'legacy' },
    ],
  };
}
export const detailViews = [
  { name: '전체 선반(아래→위)', shelfOrder: 'bottom', info: { shelf: '', item: null, search: '' } },
  { name: '위→아래·검색 P-00', shelfOrder: 'top', info: { shelf: '', item: null, search: 'p-00' } },
  { name: '2번 선반·자재 선택', shelfOrder: 'bottom', info: { shelf: '2', item: '7F-A-1-2-1', search: '' } },
];
