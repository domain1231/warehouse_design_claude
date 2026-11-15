// 색 표시 모드·사용자 지정 색 대조 사례(Phase 5c-2). 입력: fixtures/legacy/v2.4.1-primary.project.json AFTER 배치
// + colorFixture(랙 3~9번에 가상 Excel 선반·재고 기록). tools/color-diff.mjs가 기준본에서 화면 조작(exViz·exHeightPolicy·
// applyColors·vColorMode·지정색 적용/해제·기본 색 복원·실행취소)을 차례로 실행하고, 매 사례 끝에 도형 채움색·라벨·범례·설정을 기록한다.
// steps: { viz } | { heightPolicy } | { colors: { low, high, colors } } | { colorMode } | { objectColor: { rack, color } } (color null = 해제)
//        | { reset: 'ui'|'occupancy'|'all' } | { undo: true }
export function colorFixture(ids) {
  const item = (loc, shelf, pos, sh, mh) => ({ rowNo: pos, location: loc + '-' + shelf + '-' + pos, position: pos, itemCode: 'S-' + shelf + pos, itemName: '가상 자재', specification: 'SYN', reorderPoint: 1, maxStock: 5, averageInbound3M: 1, shelfLevel: shelf, mixedItemCount: 1, rackWidth: 800, rackDepth: 1850, rackHeight: 2000, shelfHeight: sh, materialHeight: mh, heightUtilization: null, rackUtilizationSource: 0, sourceUsedArea: 1.48, idleSpace: '', note: '' });
  const ex = (n, shelves) => ({ key: '7F-C-' + n, building: 'SYN', floor: '7', column: 'C', rackNumber: n, sourceFile: 'synthetic.xlsx', asOfDate: '2026-10-31', shelves });
  const loc = (n) => '7F-C-' + n;
  return {
    excel: {
      [ids[0]]: ex(1, [{ level: 1, items: [item(loc(1), 1, 1, 400, 120), item(loc(1), 1, 2, 400, 380)] }, { level: 2, items: [item(loc(1), 2, 1, 500, 100)] }]),
      [ids[1]]: ex(2, [{ level: 1, items: [item(loc(2), 1, 1, 400, 200)] }, { level: 2, items: [item(loc(2), 2, 1, 600, 600)] }, { level: 3, items: [item(loc(2), 3, 1, 300, 450)] }]),
      [ids[2]]: ex(3, [{ level: 1, items: [item(loc(3), 1, 1, 400, 100), item(loc(3), 1, 2, 450, 100)] }]),
      [ids[3]]: ex(4, [{ level: 1, items: [] }, { level: 2, items: [] }]),
      [ids[4]]: ex(5, [{ level: 1, items: [item(loc(5), 1, 1, 400, null)] }]),
      [ids[5]]: ex(6, [{ level: 1, items: [item(loc(6), 1, 1, 400, 0)] }]),
    },
    inventory: [
      { date: '2026-10-01', rackId: ids[0], capacity: 100, quantity: 0, unit: 'BOX', source: '가상', scenario: 'after' },
      { date: '2026-10-01', rackId: ids[1], capacity: 100, quantity: 30, unit: 'BOX', source: '가상', scenario: 'after' },
      { date: '2026-10-01', rackId: ids[2], capacity: 80, quantity: 60, unit: 'BOX', source: '가상', scenario: 'after' },
      { date: '2026-10-01', rackId: ids[3], capacity: 50, quantity: 49, unit: 'BOX', source: '가상', scenario: 'after' },
      { date: '2026-10-01', rackId: ids[4], capacity: 40, quantity: 52, unit: 'BOX', source: '가상', scenario: 'after' },
      { date: '2026-10-01', rackId: ids[5], capacity: null, quantity: 3, unit: 'BOX', source: '가상', scenario: 'after' },
      { date: '2026-10-02', rackId: ids[6], capacity: 10, quantity: 5, unit: 'BOX', source: '가상', scenario: 'before' },
    ],
  };
}
export const FIXTURE_RACKS = [3, 4, 5, 6, 7, 8, 9];

const palette = { empty: '#203040', low: '#2266aa', mid: '#88ccee', high: '#ffaa33', over: '#ff3355', unknown: '#777777' };
export const colorCases = [
  { name: '기본(실제 재고 적재율)', steps: [] },
  { name: '높이 활용률·가중 평균', steps: [{ viz: 'height' }] },
  { name: '높이 활용률·단순 평균', steps: [{ viz: 'height' }, { heightPolicy: 'meanMax' }] },
  { name: '높이 활용률·최대', steps: [{ viz: 'height' }, { heightPolicy: 'max' }] },
  { name: '위치 등록 현황', steps: [{ viz: 'registered' }] },
  { name: '품목별 관리 정보', steps: [{ viz: 'management' }] },
  { name: '임계값·색 변경(30/70)', steps: [{ colors: { low: 30, high: 70, colors: palette } }] },
  { name: '임계값 같은 값(60/60)', steps: [{ colors: { low: 60, high: 60, colors: palette } }] },
  { name: '사용자 지정 색: 랙·구조물 지정 후 해제 1건', steps: [{ objectColor: { rack: 3, color: '#ffffff' } }, { objectColor: { rack: 0, color: '#102030' } }, { objectColor: { object: 0, color: '#aa4400' } }, { objectColor: { rack: 0, color: null } }] },
  { name: '사용자 지정 색을 데이터 기반으로 전환', steps: [{ objectColor: { rack: 3, color: '#ffffff' } }, { colorMode: 'data' }] },
  { name: '기본 색 복원(적재율 색)', steps: [{ colors: { low: 30, high: 70, colors: palette } }, { objectColor: { rack: 3, color: '#ffffff' } }, { reset: 'occupancy' }] },
  { name: '기본 색 복원(전체)', steps: [{ colors: { low: 30, high: 70, colors: palette } }, { objectColor: { rack: 3, color: '#ffffff' } }, { reset: 'all' }] },
  { name: '색 변경 실행취소', steps: [{ colors: { low: 30, high: 70, colors: palette } }, { objectColor: { rack: 3, color: '#ffffff' } }, { undo: true }] },
];
