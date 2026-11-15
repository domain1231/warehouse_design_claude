// 편집 명령 대조 사례(데이터만). tools/edit-diff.mjs가 기준본에서 결과를 받아 fixtures/legacy/edit-cases.json에 기록하고
// tests/golden/E1-edit.test.js가 재구축본 src/warehouse/commands.js 결과와 대조한다. 사례를 바꾸면 기준본에서 다시 생성해야 한다.
// 입력 배치: fixtures/legacy/v2.4.1-primary.project.json (AFTER, 경고 허용 끔, 스냅 0.01m).
// setup: { allowWarnings?, snap?, scenario?, lockFirst? }  select: 시작 시 AFTER 랙 목록의 순번
// steps: { op: 'add', kind, point } | 'delete' | 'duplicate' | 'rotate' | { op: 'nudge', dx, dy, fast }
//        | { op: 'field', field, raw, number } | { op: 'dimension', field, raw } | { op: 'move', dx, dy, cancel? }
//        | { op: 'resize', handle, dx, dy } | { op: 'group', action, fields?: { mGap, mAlignRef, ... }, allow? }   setup.aspect: 첫 선택 랙 비율 고정
export const editCases = [
  { name: '랙 추가(기본 크기·스냅)', select: [], steps: [{ op: 'add', kind: 'rack', point: { x: 12.3456, y: 6.789 } }] },
  { name: '랙 추가(경고 허용, 추가 랙 설정 기본값)', select: [], setup: { allowWarnings: true }, steps: [{ op: 'add', kind: 'rack', point: { x: 12.3456, y: 6.789 } }] },
  { name: '통로 추가(통로 기준값 적용)', select: [], setup: { allowWarnings: true }, steps: [{ op: 'add', kind: 'aisle', point: { x: 12, y: 6.5 } }] },
  { name: '기둥 추가: 랙과 겹쳐 차단(실패 기록)', select: [0], steps: [{ op: 'add', kind: 'column', point: { x: 1, y: 3.3 } }] },
  { name: '랙 2개 삭제', select: [3, 4], steps: ['delete'] },
  { name: '랙 복제(+0.5m, 경고 허용)', select: [10], setup: { allowWarnings: true }, steps: ['duplicate'] },
  { name: '랙 90° 회전(경고 허용)', select: [7], setup: { allowWarnings: true }, steps: ['rotate'] },
  { name: '방향키 미세 이동 0.01m·Shift 0.1m', select: [20], setup: { allowWarnings: true }, steps: [{ op: 'nudge', dx: 1, dy: 0, fast: false }, { op: 'nudge', dx: 0, dy: 1, fast: true }] },
  { name: '속성: 이름·최대 수량·현재 수량 비우기', select: [2], steps: [{ op: 'field', field: 'code', raw: 'Z-999', number: false }, { op: 'field', field: 'capacity', raw: '100', number: true }, { op: 'field', field: 'quantity', raw: '', number: true }] },
  { name: '속성: X에 빈 값(NaN) 거부', select: [2], steps: [{ op: 'field', field: 'x', raw: '', number: true }] },
  { name: '설계 치수 직접 입력: 폭 변경(규격 이력)', select: [5], setup: { allowWarnings: true }, steps: [{ op: 'dimension', field: 'width', raw: '0.95' }] },
  { name: '설계 치수 직접 입력: 0 거부(크기 제한)', select: [5], steps: [{ op: 'dimension', field: 'depth', raw: '' }] },
  { name: '드래그 이동(스냅 0.01)', select: [12], setup: { allowWarnings: true }, steps: [{ op: 'move', dx: 0.1234, dy: -0.0567 }] },
  { name: '드래그 이동(스냅 끔, 끝 위치 mm 정리)', select: [12], setup: { allowWarnings: true, snap: false }, steps: [{ op: 'move', dx: 0.12345, dy: 0.0006 }] },
  { name: '그룹 이동 2개', select: [30, 31], setup: { allowWarnings: true }, steps: [{ op: 'move', dx: 0.3, dy: 0 }] },
  { name: '드래그 이동: 겹침 차단(경고 허용 끔)', select: [12], steps: [{ op: 'move', dx: 0, dy: 0.6 }] },
  { name: '드래그 이동: 포인터 취소(사용자 취소 기록)', select: [12], steps: [{ op: 'move', dx: 0.5, dy: 0, cancel: true }] },
  { name: '드래그 이동: 위치 잠금 랙 취소', select: [12], setup: { lockFirst: true, allowWarnings: true }, steps: [{ op: 'move', dx: 0.5, dy: 0 }] },
  { name: 'BEFORE 잠금: 추가 거부(기록 없음)', select: [], setup: { scenario: 'before' }, steps: [{ op: 'add', kind: 'rack', point: { x: 12, y: 6 } }] },
  { name: '크기 조절 se(+0.2, +0.1, 스냅)', select: [12], setup: { allowWarnings: true }, steps: [{ op: 'resize', handle: 'se', dx: 0.2034, dy: 0.1012 }] },
  { name: '회전 후 크기 조절 e(로컬 축)', select: [12], setup: { allowWarnings: true }, steps: ['rotate', { op: 'resize', handle: 'e', dx: 0.0, dy: 0.25 }] },
  { name: '크기 조절 nw: 최소 크기 제한', select: [12], setup: { allowWarnings: true }, steps: [{ op: 'resize', handle: 'nw', dx: 5, dy: 5 }] },
  { name: '크기 조절: 비율 고정', select: [12], setup: { allowWarnings: true, aspect: true }, steps: [{ op: 'resize', handle: 'se', dx: 0.4, dy: 0.05 }] },
  { name: '크기 조절: 겹침 차단(경고 허용 끔)', select: [12], steps: [{ op: 'resize', handle: 'e', dx: 1.5, dy: 0 }] },
  { name: '그룹 왼쪽 정렬(그룹 경계)', select: [30, 31, 32], setup: { allowWarnings: true }, steps: [{ op: 'group', action: 'left' }] },
  { name: '그룹 위쪽 정렬(기준 랙)', select: [32, 30, 31], setup: { allowWarnings: true }, steps: [{ op: 'group', action: 'top', fields: { mAlignRef: 'first' } }] },
  { name: '그룹 가로 일렬 배치 간격 0.2', select: [30, 31, 32], setup: { allowWarnings: true }, steps: [{ op: 'group', action: 'lineX', fields: { mGap: '0.2' } }] },
  { name: '그룹 세로 간격 배치 균등 분배', select: [5, 6, 7, 8], setup: { allowWarnings: true }, steps: [{ op: 'group', action: 'spaceY', fields: { mSpaceMode: 'between' } }] },
  { name: '그룹 가로 간격 배치 그룹 중심 고정·직접 순서', select: [30, 31, 32], setup: { allowWarnings: true }, steps: [{ op: 'group', action: 'spaceX', fields: { mAnchor: 'center', mOrder: 'custom', mCustomOrder: '#CODES' } }] },
  { name: '그룹 이동 ΔX 0.25', select: [30, 31], setup: { allowWarnings: true }, steps: [{ op: 'group', action: 'move', fields: { mMoveX: '0.25' } }] },
  { name: '그룹 중심 회전 90°', select: [30, 31], setup: { allowWarnings: true }, steps: [{ op: 'group', action: 'rotate' }] },
  { name: '그룹 정렬: 위반 미허용이면 적용 안 함', select: [30, 31, 32], steps: [{ op: 'group', action: 'top', fields: { mAlignRef: 'warehouse' } }] },
  { name: '그룹 정렬: 위반 확인 후 허용', select: [30, 31, 32], steps: [{ op: 'group', action: 'top', fields: { mAlignRef: 'warehouse' }, allow: true }] },
];
