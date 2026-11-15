// 내보내기 대조 사례(Phase 10). 입력: primary 프로젝트 + plan-cases detailFixture(Excel·재고). tools/export-diff.mjs가
// 기준본 rackRows()·historyRows()·CSV 양식 행·reportSvg()(SVG·PNG·인쇄 공통 원본)를 기록한다. today()는 '<TODAY>'로 치환.
export const exportCases = [
  { name: 'AFTER(재고·Excel 포함)', scenario: 'after', fixture: true },
  { name: 'BEFORE', scenario: 'before', fixture: true },
  { name: 'AFTER(재고 없음)', scenario: 'after', fixture: false },
  { name: '과거 조회 날짜(기록 배치 우선)', scenario: 'after', fixture: true, history: '2026-10-01' },
];
