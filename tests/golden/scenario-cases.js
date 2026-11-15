// BEFORE/AFTER 시나리오 대조 사례(Phase 7a). 입력: fixtures/legacy/v2.4.1-primary.project.json.
// steps: { edit: 'move'|'rotate'|'resize'|'delete'|'add'|'clearBefore'|'origSpec' } (AFTER/BEFORE 직접 변경, 비교 입력 준비)
//        | { clone: 'replace'|'version' } | { restore: n } (layoutBackups의 n번째, 음수는 뒤에서) | 'snapshot' (비교표·변경 행·프로젝트 일부 기록)
export const scenarioCases = [
  { name: '기본 비교', steps: ['snapshot'] },
  { name: 'AFTER 이동·회전·규격·삭제·추가 후 비교', steps: [{ edit: 'move' }, { edit: 'rotate' }, { edit: 'resize' }, { edit: 'delete' }, { edit: 'add' }, { edit: 'origSpec' }, 'snapshot'] },
  { name: 'BEFORE 없음 비교', steps: [{ edit: 'clearBefore' }, 'snapshot'] },
  { name: 'BEFORE→AFTER 복제(교체)', steps: [{ edit: 'move' }, { clone: 'replace' }, 'snapshot'] },
  { name: 'BEFORE→AFTER 복제(새 버전)', steps: [{ clone: 'version' }, 'snapshot'] },
  { name: '복제 후 백업 복원', steps: [{ edit: 'move' }, { clone: 'replace' }, { restore: 0 }, 'snapshot'] },
  { name: '복제 두 번(같은 내용 백업 재사용)·마지막 백업 복원', steps: [{ clone: 'replace' }, { clone: 'replace' }, { restore: -1 }, 'snapshot'] },
];
