# 기능 동등성 매트릭스 (초안)

- 상태: Phase 0. 기준본 `docs/FEATURE_MAP.md`, 명세 33장, 기준본 함수 체인(`docs/FUNCTION_CHAIN.md`, 74개 체인)과 기준본 검사 분류(`docs/BASELINE_TEST_MAP.md`)로 작성했다. 행별 기준본 검사 목록은 BASELINE_TEST_MAP 역색인을 본다.
- Golden Master(`fixtures/golden`) 일치 여부는 검증 열에 `G1 일치`처럼 기록한다.
- 기준 위치는 기준본 `src/runtime/` 파일과 공개 함수다. 같은 함수가 여러 파일에서 감싸지므로 "최종 유효 동작"을 기준으로 판정한다.
- 기준본(v2.4.x)에서 버그를 고치거나 기능을 바꾸면, 같은 시점에 이 매트릭스에 행 또는 테스트 ID를 추가한다. 재구축본이 v2.4.1 시점에 고정되어 이후 수정을 놓치지 않게 하기 위함이다.
- 구현 상태: NOT STARTED / IMPLEMENTING / IMPLEMENTED / TESTING / VERIFIED / BLOCKED. 기준본에 기능이 있다는 이유로 VERIFIED 처리하지 않는다.

| ID | 기존 기능 | 기준 위치 | 사용자 입력 | 기대 결과 | 관련 데이터 | 재구축 모듈 | 테스트 ID | 구현 | 검증 |
|---|---|---|---|---|---|---|---|---|---|
| F-001 | 프로젝트 생성·검증 | 00-core makeProject, validateProject | 새 프로젝트 | 스키마 2.3.6 유효 프로젝트 | Project 전체 | core/project | SV10 | IMPLEMENTED | G5 일치, 기준본 대조 V1 70사례 일치 — 열 우선 결과 재계산 제외 |
| F-002 | Undo/Redo | 00-core commit/undo (전체 JSON 60개) | Ctrl+Z/Y, 버튼 | 원상복원, 이력 필드 보존 | undo/redo | core/history (patch 기반) | CAD08 | NOT STARTED | — |
| F-003 | 창고 치수 적용·면적 역산 | 70-scenarios R.updateRoomApplyState | 가로·세로·면적 | 경계만 갱신, 랙 불변 | warehouse | warehouse/constraints, ui | UI01–UI05 | NOT STARTED | — |
| F-004 | SVG 렌더링·통계 | 20-renderer renderScene | — | 미터 좌표 기준 도면 | objects | cad/renderer | CAD10 | NOT STARTED | — |
| F-005 | 객체 생성·삭제·복제 | 30-editor-io | 도구 선택·클릭 | 객체 추가/삭제 | objects | cad/interaction | CAD01 | NOT STARTED | — |
| F-006 | 드래그 이동·그룹 이동 | 50-editor | 마우스 드래그 | 좌표 정확, 상대 위치 유지 | objects | cad/interaction | CAD02, CAD07 | NOT STARTED | — |
| F-007 | 회전 (90°·임의 각도) | 50-editor, 10-geometry polygon | 회전 입력 | 규격 보존, 실제 형상 | rotation | geometry/rotation | CAD03, CAD04 | NOT STARTED | — |
| F-008 | 8방향 크기 조절 | 50-editor | 핸들 드래그 | 로컬 좌표계 크기 변경 | width/depth | cad/interaction | CAD05 | NOT STARTED | — |
| F-009 | 다중 선택·정렬 | 50-editor | Shift 클릭, 정렬 버튼 | 선택 집합 편집 | selection | cad/selection | CAD06 | NOT STARTED | — |
| F-010 | 정밀 좌표·스냅·키보드 이동 | 80-precision-labels | 방향키, 스냅 간격 | 1mm 정확 이동 | x/y | geometry/tolerance ✚, cad/snapping | CAD09 | NOT STARTED | — |
| F-011 | 카메라·휠 확대 | 50-editor M.handleWheel/flushWheel | 휠, 핀치, 패널 스크롤 | 좌표 불변, 패널 스크롤 분리 | viewport | cad/camera | CAD10, CAD11 | NOT STARTED | — |
| F-012 | 참고 도면·두 점 축척 | 35-reference | 이미지, 두 점+거리 | 축척 계산 | background | cad/reference | CAD12 | NOT STARTED | — |
| F-013 | 회전 충돌 (SAT) | 10-geometry overlaps | — | 정확한 겹침 판정, 접촉은 충돌 아님(D-004) | objects | geometry/polygons, geometry/collision | GEO01, GEO08, G1 | IMPLEMENTING | G1 일치(기본연산 421쌍) — 경고 통합 전 |
| F-014 | 간격·이격 (다각형 최소거리) | 10-geometry gap, warnings | 간격 설정 | 실제/요구/부족 거리 | settings | geometry/collision(gap), geometry/clearance | GEO02–GEO05, G1, G2 | IMPLEMENTING | G1 gap 일치 — 경고(G2) 전 |
| F-015 | 경계 초과·통로 최소 폭 | 10-geometry warnings | 통로 설정 | 경고·차단 구분 | aisles | geometry/clearance | GEO06, GEO07 | NOT STARTED | — |
| F-016 | 경고 중복 제거·분류 | 90-auto-layout W.scan (BUG-SCAN-001) | — | 중복 집계 없음 | warnings | warehouse/constraints | GEO09, GEO10 | NOT STARTED | — |
| F-017 | 원본/설계 규격 | 60-specifications | 규격 편집 | 원본 보존, 차이 표시 | spec | warehouse/racks | — (Phase 0 배정) | IMPLEMENTING | 기본값·검증(originalSpec/designSpec) G5·V1 일치 — 편집 UI 전 |
| F-018 | 랙 상세 인포그래픽 | 65-panels-details | 더블클릭 | 선반별 자재·지표 | shelves | ui/panels | UI08 | NOT STARTED | — |
| F-019 | ZONE·랙 번호 라벨 | 80-precision-labels | 라벨 설정 | 정방향·외부 표시 | rackLabels | cad/labels | UI09 | NOT STARTED | — |
| F-020 | 색상 범례·3종 지표 | 75-storage-appearance | 임계값·색상 | 지표 분리 표시 | theme | warehouse/utilization | UI10 | NOT STARTED | — |
| F-021 | Excel 읽기·매핑·로케이션 | 40-excel EX.readFile | XLSX/CSV, 머리글, 매핑 | 원본 의미 보존, null 유지 | excelSnapshots | excel/* | XL01–XL05, XL10 | NOT STARTED | — |
| F-022 | 건물별 코드·기존 랙 매칭 | 70-scenarios EX.proposal (BUG-EXCEL-CODE-001) | 건물 설정 | ID·사용자 이름 보존 | R.key | excel/proposal | XL06–XL09 | NOT STARTED | — |
| F-023 | Excel 미리보기·적용 승인 | 90-auto-layout W.readiness/proof, EX.apply | 후보·경고 확인 | 승인 후보=적용 후보 | autoPlacement | scenarios/approval | XL11–XL13 | NOT STARTED | — |
| F-024 | 기존 자동 배치 모드 | 90-auto-layout W.fits/scan/pack | 배치 설정 | 기존 후보 재현 | autoPlacement | placement/* | AL01–AL03 | NOT STARTED | — |
| F-025 | 열 우선 최대 수용 | 92-column-layout C.search | 열 우선 모드 | 열·번호 순서, 부분 수용 | autoPlacement | placement/column-layout | AL04–AL06, AL12, AL14 | NOT STARTED | — |
| F-026 | 외부 대기·재수용 | 92-column-layout C.queue | 재수용 버튼 | 겹침 없음, 규격 유지 | objects | placement/external-queue | AL07–AL11, AL13 | NOT STARTED | — |
| F-027 | BEFORE/AFTER·잠금·비교 | 70-scenarios | 잠금, 복제, 비교 | 독립성, 비교 출력 | scenarios | scenarios/* | SV09 | NOT STARTED | — |
| F-028 | 원자적 적용 트랜잭션 | 70-scenarios R.transaction | 적용 | 실패 시 전체 복원 | 전체 | scenarios/transactions | XL14 | NOT STARTED | — |
| F-029 | 검증 저장·무변경 생략 | 75 V.atomic/V.write/V.fingerprint | 저장 | SAVED/UNSAVED/ROLLED_BACK | persistence | persistence/storage | SV01–SV03, SV11 | IMPLEMENTING | 저장소 단위 검사(SV01–SV03, SV11) — UI 연결 전 |
| F-030 | Quota 처리·백업 순환 | 75 V.track/V.restore (BUG-STORAGE-001) | — | 정상본 보존, 3/6개 순환 | layoutBackups | persistence/backups | SV04–SV07, SV12 | IMPLEMENTING | Quota 주입 단위 검사(SV04, SV05, SV12) — 백업 순환 전 |
| F-031 | 저장소 진단·복구 다운로드 | 75 V.measureStorage/storageSnapshot | 저장소 관리 | 크기·단계 표시 | — | persistence/diagnostics | — (Phase 0 배정) | NOT STARTED | — |
| F-032 | JSON 내보내기·불러오기 | 30-editor-io | 파일 | 2.3.6 무손실 왕복 | Project | exports/json, persistence/migration | SV08, SV10 | NOT STARTED | — |
| F-033 | CSV·SVG·PNG·인쇄 내보내기 | 30-editor-io, 65-panels-details | 내보내기 | 오프라인 출력 | — | exports/* | — (Phase 0 배정) | NOT STARTED | — |
| F-034 | 재고기록·배치이력·과거 조회 | 65-panels-details, 70-scenarios | 기록, 날짜 선택 | 읽기 전용 조회, null 보존 | inventoryHistory, layoutSnapshots | scenarios/history | UI04 | NOT STARTED | — |
| F-035 | 패널 접기·하단 패널 | shell, 65-panels-details | 패널 버튼 | 좌표 불변 | — | ui/panels | UI06, UI07 | NOT STARTED | — |
| F-037 | 다중 탭·창 덮어쓰기 방지 (BUG-STORAGE-002, v2.4.2 후보) | 75 V.write V.baseRaw/V.concurrentChange, 99 bootstrap | 두 탭에서 저장, 다시 저장 확인 | 다른 탭 저장 후 덮어쓰기 차단, 확인 시에만 덮어쓰기(이전본은 last-good) | persistence | persistence/storage (revision 검사) | 기준본 MT01–MT09 | IMPLEMENTING | CONFLICT·force 단위 검사 — UI 연결 전 |
| F-036 | 프로그램 정보·버전 표시 | 99-bootstrap | — | 앱/스키마 버전 분리 | — | main | smoke E2E | IMPLEMENTED | TESTING |

| F-038 | 오프라인·런타임 오류 0 (횡단) | 모든 묶음 공통 | — | 외부 요청 0, 런타임 오류 0 | — | tools/verify, tests/e2e | smoke E2E | IMPLEMENTED | TESTING |
| F-039 | 휠 감도 설정·저장 | 50-editor M.setWheelMode | 감도 선택 | 프로젝트와 독립 저장, 손상 시 안전 기본값 | 별도 키 | cad/camera | — | NOT STARTED | — |
| F-040 | 탐색 예산·중단 사유 | 92 C.limits/C.check | — | probe 상한, 사유 표시(D-005 결정적) | autoPlacement | placement/candidates | AL12 | NOT STARTED | — |
| F-041 | 파생 검사 결과 재계산 | 92 JSON 복원 후 재검사 | JSON 불러오기 | 저장된 집계 불신, 현재 좌표로 재계산 | autoPlacement | placement/diagnostics | — | NOT STARTED | — |
| F-042 | 모바일 드로어·레이아웃 | shell, 65 | 좁은 화면 | 가로 넘침 없음, 드로어 동작 | — | ui/panels | — | NOT STARTED | — |

✚ 기반 모듈 구현됨 (`src/geometry/tolerance.js`, `src/core/ids.js`). 기능 행 자체는 아직 NOT STARTED.
