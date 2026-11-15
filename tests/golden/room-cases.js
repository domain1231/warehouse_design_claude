// 창고 치수 적용·참고 도면 대조 사례(Phase 9a). 입력: primary 프로젝트 AFTER.
// room: 기준본 roomWidth/roomHeight/ceiling 입력 → R.updateRoomApplyState 사유 → applyRoom 결과(창고·경고·실행취소·안내).
// background: settings.background를 정해 scene() 안의 <image> 요소와 순서를 기록. derive: 면적·알려진 가로로 역산.
export const roomCases = [
  { name: '정상 확대', room: { width: '30', height: '18', ceiling: '' } },
  { name: '축소(경계 초과 경고, 경고 허용)', room: { width: '10', height: '8', ceiling: '' } },
  { name: '축소(경고 차단 정책)', policy: 'block', room: { width: '10', height: '8', ceiling: '' } },
  { name: '범위 밖(0.5)', room: { width: '0.5', height: '8', ceiling: '' } },
  { name: '0.1m 단위 아님(12.34)', room: { width: '12.34', height: '8', ceiling: '' } },
  { name: '빈 값', room: { width: '', height: '8', ceiling: '' } },
  { name: '천장 높이 지정', room: { width: '24', height: '14.2', ceiling: '6.5' } },
  { name: 'BEFORE 잠금', scenario: 'before', locked: true, room: { width: '30', height: '18', ceiling: '' } },
  { name: '면적 역산(240㎡, 가로 20m)', derive: { area: '240', known: '20' } },
  { name: '면적 역산 오류(가로 0)', derive: { area: '240', known: '0' } },
  { name: '참고 도면 표시', background: { data: 'data:image/png;base64,iVBORw0KGgo=', show: true, opacity: 0.4, x: 1.5, y: -2, width: 20, height: 12 } },
  { name: '참고 도면 숨김', background: { data: 'data:image/png;base64,iVBORw0KGgo=', show: false, opacity: 0.25, x: 0, y: 0, width: 24, height: 14.2 } },
];
