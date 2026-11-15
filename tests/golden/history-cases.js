// 과거 날짜 조회 대조 사례(Phase 7b). 입력: primary 프로젝트 + plan-cases detailFixture(4번째 랙 Excel·재고 기록)
// + historyFixture(배치 기록·Excel 스냅숏 가상 자료). tools/history-diff.mjs가 기준본 display()·historyStatus를 기록한다.
export function historyFixture(after, rackId, excel) {
  const moved = JSON.parse(JSON.stringify(after));
  const r = moved.objects.find((o) => o.id === rackId);
  r.x += 1.25;
  return {
    layoutSnapshots: [{ id: 'snap-after-1001', date: '2026-10-01', scenario: 'after', name: '가상 배치 기록', recordedAt: '2026-10-01T09:00:00.000Z', layout: moved }],
    excelSnapshots: [{ id: 'xsnap-after-1031', date: '2026-10-31', scenario: 'after', source: '가상 자료', data: [{ id: rackId, excel: { ...excel, originalRackSpecification: { width: 0.9, depth: 1.85, height: 2 } } }] }],
  };
}
export const historyCases = [
  { name: '현재 편집(날짜 없음)', date: '', mode: 'recorded' },
  { name: '기록 배치 우선·배치 기록 있는 날', date: '2026-10-01', mode: 'recorded' },
  { name: '현재 배치 + 과거 재고(같은 날)', date: '2026-10-01', mode: 'current' },
  { name: '배치 기록 없는 날(다른 랙 재고)', date: '2026-10-05', mode: 'recorded' },
  { name: '다른 범위 기록만 있는 날', date: '2026-09-30', mode: 'recorded' },
  { name: 'Excel 스냅숏 날(원본 규격)', date: '2026-10-31', mode: 'recorded' },
  { name: 'BEFORE 대상 조회', date: '2026-10-01', mode: 'recorded', scenario: 'before' },
];
