// 정렬 가이드·가까운 거리 표시 대조 사례(F-010 잔여). 입력: primary 프로젝트 AFTER. tools/guide-diff.mjs가 기준본
// scene()의 g.q-guide(가이드 + Q.nearest 거리 경로·문구)를 기록한다. select: AFTER 랙 순번, move: 첫 선택 랙 이동량(m).
export const guideCases = [
  { name: '선택 없음', select: [] },
  { name: '랙 1개 선택', select: [0] },
  { name: '랙 2개 선택', select: [0, 5] },
  { name: '겹침(0m)', select: [1], move: [0, -0.5] },
  { name: '5m 넘는 거리만(표시 없음)', select: [20], move: [0, 0], isolate: true },
  { name: '확대 상태(글자 크기)', select: [3], zoom: 3 },
  { name: '가이드 끔', select: [0], guides: false },
];
