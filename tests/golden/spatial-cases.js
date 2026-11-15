// 공간검사 대조용 배치 사례(데이터만). G2가 다루지 않는 유형을 채운다.
// tools/spatial-diff.mjs가 기준본에서 warnings·W.scan 결과를 받아 fixtures/legacy/spatial-cases.json에 기록하고,
// tests/golden/S1-spatial.test.js가 재구축본 결과와 대조한다. 사례를 바꾸면 기준본에서 다시 생성해야 한다.
//
// 형식: { name, warehouse, minGap, wallGap(locationLayout), layoutWallGap(배치 단위, 선택), rules(autoPlacementRules, 선택),
//         objects: [[kind, x, y, width, depth, extra]] }  extra.id·code는 필수.
const R = (id, x, y, w = 1.2, d = 0.6, extra = {}) => ['rack', x, y, w, d, { id, code: id, ...extra }];
const excel = (column, n) => ({ excel: { key: `7F-${column}-${n}`, building: 'SYN', floor: '7F', column, rackNumber: n, shelves: [] } });
const base = { warehouse: { width: 20, height: 12, ceiling: 3 }, minGap: 0, wallGap: 0.1 };

export const spatialCases = [
  { ...base, name: '내부 벽 이격 0.1m, 기준 0.3m (BUG-SCAN-001)', wallGap: 0.3, objects: [R('R1', 2, 2), ['wall', 3.3, 1, 0.15, 4, { id: 'W1', code: 'W1' }]] },
  { ...base, name: '회전 벽·회전 랙 이격', wallGap: 0.3, objects: [R('R1', 2, 2, 1.2, 0.6, { rotation: 30 }), ['wall', 3.5, 1, 0.15, 4, { id: 'W1', code: 'W1', rotation: 15 }]] },
  { ...base, name: '벽과 겹침(구조 충돌)', wallGap: 0.3, objects: [R('R1', 2, 2), ['wall', 2.9, 1, 0.15, 4, { id: 'W1', code: 'W1' }]] },
  { ...base, name: '외벽 이격 부족', wallGap: 0.2, objects: [R('R1', 0.05, 3), R('R2', 18.85, 3), R('R3', 5, 0.15)] },
  { ...base, name: '랙 회전 충돌', objects: [R('R1', 4, 4, 1.2, 0.6, { rotation: 30 }), R('R2', 4.9, 4.2, 1.2, 0.6, { rotation: -20 })] },
  { ...base, name: '기둥·보관불가·출입문 충돌', objects: [R('R1', 4, 4), ['column', 4.9, 4.1, 0.5, 0.5, { id: 'C1', code: 'C1' }], R('R2', 8, 4), ['blocked', 8.5, 3.8, 1, 1, { id: 'B1', code: 'B1' }], R('R3', 12, 4), ['door', 12.8, 4.2, 1.4, 1.4, { id: 'D1', code: 'D1' }]] },
  { ...base, name: '작업 공간과 겹친 랙은 경고 없음', objects: [R('R1', 4, 4), ['work', 4.2, 4.1, 2, 2, { id: 'K1', code: 'K1' }]] },
  { ...base, name: '통로 침범(유효 폭 부족)', objects: [['aisle', 2, 2, 10, 1.6, { id: 'A1', code: 'A1', minWidth: 1.2, targetWidth: 1.5 }], R('R1', 5, 1.8, 1.2, 0.8)] },
  { ...base, name: '좁은 통로(최소 폭 미달)', objects: [['aisle', 2, 2, 10, 0.9, { id: 'A1', code: 'A1', minWidth: 1.2, targetWidth: 1.5 }]] },
  { ...base, name: '통로 목표 폭 미달(검토 경고)', objects: [['aisle', 2, 2, 10, 1.3, { id: 'A1', code: 'A1', minWidth: 1.2, targetWidth: 1.5 }]] },
  { ...base, name: 'L자 다각형 통로와 장애물', objects: [['aisle', 2, 2, 6, 6, { id: 'A1', code: 'A1', minWidth: 1.2, targetWidth: 1.5, vertices: [[0, 0], [1, 0], [1, 0.3], [0.3, 0.3], [0.3, 1], [0, 1]] }], R('R1', 4.5, 2.6, 1.2, 0.6), ['column', 2.2, 5.5, 0.5, 0.5, { id: 'C1', code: 'C1' }]] },
  { ...base, name: '출입문 연결 통로: 연결됨·끊김', objects: [['door', 1.6, 2.1, 1.4, 1.4, { id: 'D1', code: 'D1' }], ['aisle', 3, 2, 8, 1.6, { id: 'A1', code: 'A1', minWidth: 1.2, targetWidth: 1.5, linkedDoorId: 'D1' }], ['aisle', 3, 6, 8, 1.6, { id: 'A2', code: 'A2', minWidth: 1.2, targetWidth: 1.5, linkedDoorId: 'D1' }]] },
  { ...base, name: '통로 검사 범위 지정(scopeIds)', objects: [['aisle', 2, 2, 10, 1.6, { id: 'A1', code: 'A1', minWidth: 1.2, targetWidth: 1.5, scopeIds: ['R2'] }], R('R1', 4, 1.8, 1.2, 0.8), R('R2', 8, 1.8, 1.2, 0.8)] },
  { ...base, name: '적재율 초과·천장 높이 초과', objects: [R('R1', 4, 4, 1.2, 0.6, { capacity: 10, quantity: 12 }), R('R2', 8, 4, 1.2, 0.6, { height: 3.2 })] },
  { ...base, name: '경계 이탈(일반·회전)', objects: [R('R1', -0.3, 4), R('R2', 19.5, 5, 1.2, 0.6, { rotation: 45 }), R('R3', 6, 11.7)] },
  { ...base, name: '최소 간격 0.3: 0.299 위반, 0.3 충족', minGap: 0.3, objects: [R('R1', 2, 2), R('R2', 3.499, 2), R('R3', 6, 2), R('R4', 7.5, 2)] },
  { ...base, name: '배치 규칙 설계 간격(열 내·열 간)', rules: { mode: 'inside', wallGap: 0.1, rackGap: 0.3, columnGap: 0.6, aisleTarget: 1.2 }, objects: [R('A1', 2, 2, 1.2, 0.6, excel('A', 1)), R('A2', 3.4, 2, 1.2, 0.6, excel('A', 2)), R('B1', 2, 3.0, 1.2, 0.6, excel('B', 1))] },
  { ...base, name: '배치 규칙 통로 모드(aisleTarget 적용)', rules: { mode: 'aisle', wallGap: 0.1, rackGap: 0.2, columnGap: 0.6, aisleTarget: 1.2 }, objects: [R('A1', 2, 2, 1.2, 0.6, excel('A', 1)), R('A2', 3.6, 2, 1.2, 0.6, excel('A', 2))] },
  { ...base, name: '외벽 이격 중복 제거(전역 0.2 + 규칙 0.4)', wallGap: 0.2, rules: { mode: 'inside', wallGap: 0.4, rackGap: 0.2, columnGap: 0.6, aisleTarget: 1.2 }, objects: [R('R1', 0.1, 5)] },
  { ...base, name: '외부 대기 랙', objects: [R('R1', 4, 4), R('R2', 22, 1, 1.2, 0.6, { placementMeta: { manualEdited: null, positionLocked: false, waiting: true, editedAt: null } })] },
  { ...base, name: '배치 단위 벽 이격(layout.wallGap)', wallGap: 0.1, layoutWallGap: 0.5, objects: [R('R1', 0.3, 5), R('R2', 3, 2), ['wall', 4.5, 1, 0.15, 3, { id: 'W1', code: 'W1' }]] },
];
