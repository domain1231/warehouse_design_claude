// 랙·ZONE 라벨 대조 사례(Phase 5c, F-019). 입력: fixtures/legacy/v2.4.1-primary.project.json AFTER 배치
// + plan-cases detailFixture(4번째 랙에 Excel 정보·재고 기록). tools/label-diff.mjs가 기준본 scene()의 g.v-labels와
// Q.parts·V.fullLabel 결과를 fixtures/legacy/label-cases.json에 기록한다. 화면 크기·카메라는 기록값을 그대로 재사용한다.
// zoom: 기준본 zoom(f) 반복(화면 중심 기준, f>1은 축소). zone: { rackIndex: 이름 } (Q.parts 키로 zoneNames에 저장).
export const labelCases = [
  { name: '기본(자동·두 자리·랙 코드)', size: { w: 1400, h: 900 } },
  { name: '축소(zoom 2×2: 외부 라벨·표식 대체)', size: { w: 1400, h: 900 }, zoom: [2, 2] },
  { name: '확대(zoom 0.55×0.55)', size: { w: 1400, h: 900 }, zoom: [0.55, 0.55] },
  { name: '세로 쌓기·번호 그대로', size: { w: 1400, h: 900 }, labels: { layoutMode: 'stacked', numberPadding: 0 } },
  { name: '한 줄·세 자리·적재율', size: { w: 1400, h: 900 }, labels: { layoutMode: 'inline', numberPadding: 3, displayMode: 'occupancy' } },
  { name: '상세 표시', size: { w: 1400, h: 900 }, zoom: [1.6], labels: { displayMode: 'detail' } },
  { name: '최소(선택 랙만)', size: { w: 1400, h: 900 }, labels: { layoutMode: 'minimal' }, select: 2 },
  { name: '최소 표시 모드(선택 랙만)', size: { w: 1400, h: 900 }, labels: { displayMode: 'minimal' }, select: 1 },
  { name: 'ZONE 표시 이름(짧은·긴 이름)', size: { w: 1400, h: 900 }, zone: { 3: '입고 대기', 0: '아주긴구역표시이름열두자' } },
  { name: '좁은 화면 390px', size: { w: 390, h: 700 } },
];
