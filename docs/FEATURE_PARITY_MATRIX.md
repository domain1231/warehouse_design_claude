# 기능 동등성 매트릭스 (초안)

- 상태: Phase 0. 기준본 `docs/FEATURE_MAP.md`, 명세 33장, 기준본 함수 체인(`docs/FUNCTION_CHAIN.md`, 74개 체인)과 기준본 검사 분류(`docs/BASELINE_TEST_MAP.md`)로 작성했다. 행별 기준본 검사 목록은 BASELINE_TEST_MAP 역색인을 본다.
- Golden Master(`fixtures/golden`) 일치 여부는 검증 열에 `G1 일치`처럼 기록한다.
- 기준 위치는 기준본 `src/runtime/` 파일과 공개 함수다. 같은 함수가 여러 파일에서 감싸지므로 "최종 유효 동작"을 기준으로 판정한다.
- 기준본(v2.4.x)에서 버그를 고치거나 기능을 바꾸면, 같은 시점에 이 매트릭스에 행 또는 테스트 ID를 추가한다. 재구축본이 v2.4.1 시점에 고정되어 이후 수정을 놓치지 않게 하기 위함이다.
- 구현 상태: NOT STARTED / IMPLEMENTING / IMPLEMENTED / TESTING / VERIFIED / BLOCKED. 기준본에 기능이 있다는 이유로 VERIFIED 처리하지 않는다.

| ID | 기존 기능 | 기준 위치 | 사용자 입력 | 기대 결과 | 관련 데이터 | 재구축 모듈 | 테스트 ID | 구현 | 검증 |
|---|---|---|---|---|---|---|---|---|---|
| F-001 | 프로젝트 생성·검증 | 00-core makeProject, validateProject | 새 프로젝트 | 스키마 2.3.6 유효 프로젝트 | Project 전체 | core/project | SV10 | IMPLEMENTED | G5 일치, 기준본 대조 V1 70사례 일치 — 열 우선 결과 재계산 제외 |
| F-002 | Undo/Redo | 00-core commit/undo (전체 JSON 60개) | Ctrl+Z/Y, 버튼 | 원상복원, 이력 필드 보존 | undo/redo | core/history, core/session | CAD08 | IMPLEMENTING | patch 이력 단위 검사(무작위 200단계 왕복), 저장 E2E — 도면 편집 UI 전 |
| F-003 | 창고 치수 적용·면적 역산 | 70-scenarios R.updateRoomApplyState | 가로·세로·면적 | 경계만 갱신, 랙 불변 | warehouse | warehouse/constraints, ui | UI01–UI05 | NOT STARTED | — |
| F-004 | SVG 렌더링·통계 | 20-renderer renderScene | — | 미터 좌표 기준 도면 | objects | cad/scene, warehouse/metrics, ui/panels | CAD10, P1, P2, E2E panels | IMPLEMENTING | 도형·겹침 표시(P1), 통계·범례·검색 흐림(P2) 기준본 일치. 라벨·Excel 색·참고 도면 전 |
| F-005 | 객체 생성·삭제·복제 | 30-editor-io | 도구 선택·클릭 | 객체 추가/삭제 | objects | warehouse/commands | CAD01, E1, E2E edit | IMPLEMENTED | 추가(7종)·삭제·복제·회전·복사/붙여넣기 기준본 일치(E1). 다각형 통로·팔레트 끌어놓기 전 |
| F-006 | 드래그 이동·그룹 이동 | 50-editor | 마우스 드래그 | 좌표 정확, 상대 위치 유지 | objects | warehouse/commands | CAD02, CAD07, E1, E2E edit | IMPLEMENTED | 단일·그룹 드래그, 스냅·mm 정리, 경고 차단, 포인터 취소, 위치 잠금 기준본 일치(E1). 실제 마우스 NOT RUN |
| F-007 | 회전 (90°·임의 각도) | 50-editor, 10-geometry polygon | 회전 입력 | 규격 보존, 실제 형상 | rotation | geometry/rotation | CAD03, CAD04 | NOT STARTED | — |
| F-008 | 8방향 크기 조절 | 50-editor | 핸들 드래그 | 로컬 좌표계 크기 변경 | width/depth | warehouse/commands(resized), cad/scene(핸들) | CAD05, E1, E2E edit2 | IMPLEMENTED | 8방향·회전 로컬 축·스냅·최소 크기·비율 고정·차단 기준본 일치(E1). 실제 마우스 NOT RUN |
| F-009 | 다중 선택·정렬 | 50-editor | Shift 클릭, 정렬 버튼 | 선택 집합 편집 | selection | cad/selection, warehouse/commands(calculateGroup), ui/group-dialog | CAD06, E1, E2E plan·edit2 | IMPLEMENTED | 선택 + 정렬 6종·일렬·간격(고정/균등)·그룹 이동·그룹 회전·순서(직접 지정 포함)·위반 허용 기준본 일치(E1) |
| F-010 | 정밀 좌표·스냅·키보드 이동 | 80-precision-labels | 방향키, 스냅 간격 | 1mm 정확 이동 | x/y | geometry/tolerance(addMm·snapToStep), warehouse/commands | CAD09, E1, unit commands | IMPLEMENTING | 방향키 0.01/Shift 0.1m, 1mm 입력 검사, 스냅 간격·정렬 가이드 — 가이드 흡착은 단위 검사만, 거리 표시 전 |
| F-011 | 카메라·휠 확대 | 50-editor M.handleWheel/flushWheel | 휠, 핀치, 패널 스크롤 | 좌표 불변, 패널 스크롤 분리 | viewport | cad/camera | CAD10, CAD11, P1, E2E plan | IMPLEMENTED | 카메라 13사례 기준본 일치, 휠 기준점·패널 스크롤 분리·팬·Esc 취소 E2E(합성 이벤트). 실제 마우스·터치패드·핀치 NOT RUN |
| F-012 | 참고 도면·두 점 축척 | 35-reference | 이미지, 두 점+거리 | 축척 계산 | background | cad/reference | CAD12 | NOT STARTED | — |
| F-013 | 회전 충돌 (SAT) | 10-geometry overlaps | — | 정확한 겹침 판정, 접촉은 충돌 아님(D-004) | objects | geometry/polygons, geometry/collision | GEO01, GEO08, G1, G2, S1 | IMPLEMENTED | G1 421쌍·G2·S1(회전 랙·벽·기둥 충돌) 기준본 일치 |
| F-014 | 간격·이격 (다각형 최소거리) | 10-geometry gap, warnings | 간격 설정 | 실제/요구/부족 거리 | settings | geometry/collision(gap), geometry/clearance | GEO02–GEO05, G1, G2, S1 | IMPLEMENTED | G1 gap·G2·S1(최소 간격 경계값, 벽·외벽 이격, 설계 간격) 기준본 일치 |
| F-015 | 경계 초과·통로 최소 폭 | 10-geometry warnings | 통로 설정 | 경고·차단 구분 | aisles | geometry/clearance, warehouse/constraints | GEO06, GEO07, G2, S1 | IMPLEMENTED | 경계 이탈·통로 최소/목표 폭·침범·L자 통로·출입문 연결·scopeIds 기준본 일치. 경고/차단 정책 UI 전 |
| F-016 | 경고 중복 제거·분류 | 90-auto-layout W.scan (BUG-SCAN-001) | — | 중복 집계 없음 | warnings | warehouse/constraints | GEO09, GEO10, G2, S1 | IMPLEMENTING | W.scan 집계·중복 제거(BUG-SCAN-001)·지문 기준본 일치. 열 우선 확장(92)은 Phase 6 |
| F-017 | 원본/설계 규격 | 60-specifications | 규격 편집 | 원본 보존, 차이 표시 | spec | warehouse/racks | — (Phase 0 배정) | IMPLEMENTING | 기본값·검증(originalSpec/designSpec) G5·V1 일치 — 편집 UI 전 |
| F-018 | 랙 상세 인포그래픽 | 65-panels-details | 더블클릭 | 선반별 자재·지표 | shelves | warehouse/rackinfo, ui/rack-detail | UI08, P3, E2E details | IMPLEMENTED | 더블클릭·요약·선반 SVG·자재 상세·검색·선반 필터·방향 저장·SVG/PNG/CSV·실제 설비 확인 기준본 일치(P3·E1) |
| F-019 | ZONE·랙 번호 라벨 | 80-precision-labels | 라벨 설정 | 정방향·외부 표시 | rackLabels | cad/labels, ui/inspector | L1, E2E labels | DONE | Q.parts·V.fullLabel·V.labels(내부 맞춤·두 줄/한 줄·축약·외부 라벨·표식)·표시 모드 4종·번호 형식·ZONE 표시 이름 기준본 일치(L1 10사례). 기준본에는 자동 검사 없음 |
| F-020 | 색상 범례·3종 지표 | 75-storage-appearance | 임계값·색상 | 지표 분리 표시 | theme, settings | warehouse/appearance, ui/inspector | L2, E2E colors | IMPLEMENTING | 표시 모드 4종·높이 집계 3정책·임계값/색·사용자 지정 색·기본 색 복원·실행취소 기준본 일치(L2 13사례). 남음: UI 색(vThemeFields·프리셋), 복원 미리보기 대화상자 |
| F-021 | Excel 읽기·매핑·로케이션 | 40-excel EX.readFile | XLSX/CSV, 머리글, 매핑 | 원본 의미 보존, null 유지 | excelSnapshots | excel/xlsx, excel/analyze, ui/excel-dialog | XL01–XL05, XL10, X1, unit xlsx, E2E excel | DONE | XLSX·CSV 읽기, 머리글 탐지, 자동 매핑, 분석·규격 충돌 선택 기준본 일치(X1 6사례). 값 없는 매핑 요약 복사 추가 |
| F-022 | 건물별 코드·기존 랙 매칭 | 70-scenarios EX.proposal (BUG-EXCEL-CODE-001) | 건물 설정 | ID·사용자 이름 보존 | R.key | excel/proposal | XL06–XL09, X2 | DONE | 생성·건물 키 매칭·병합/갱신·규격 재가져오기·누락 정책·보호 랙·구조물 기준본 W.base 일치(X2 6사례) |
| F-023 | Excel 미리보기·적용 승인 | 90-auto-layout W.readiness/proof, EX.apply | 후보·경고 확인 | 승인 후보=적용 후보 | autoPlacement | ui/excel-dialog, excel/apply | XL11–XL13, E2E excel | IMPLEMENTING | 미리보기·경고 확인·잠금/최종 확인·미리보기 후 변경 감지, 대안 후보 자동 선택(D-021), 비교표·직접 선택·범위별 재최적화(D-022), 열 우선 후보·적용 차단(D-023) |
| F-024 | 기존 자동 배치 모드 | 90-auto-layout W.fits/scan/pack | 배치 설정 | 기존 후보 재현 | autoPlacement | autolayout/candidates | AL01–AL03, X2 | DONE | 내부·순서·통로 방식 후보 5~6종 생성·점수·선택 기준본 일치(X2 후보 10사례, 대기열 포함) |
| F-025 | 열 우선 최대 수용 | 92-column-layout C.search | 열 우선 모드 | 열·번호 순서, 부분 수용 | autoPlacement | autolayout/column | AL04–AL06, AL12, AL14, X2 | IMPLEMENTED | 열 우선 후보·외부 대기·열 진단·재최적화 기준본 일치(X2 10사례). 탐색 시간 상한은 제거(D-023, 사용자 확정) |
| F-026 | 외부 대기·재수용 | 92-column-layout C.queue | 재수용 버튼 | 겹침 없음, 규격 유지 | objects | placement/external-queue | AL07–AL11, AL13 | IMPLEMENTED | 열 우선 외부 대기열·대기 사유·외부 재수용 기준본 일치(X2, D-023) |
| F-027 | BEFORE/AFTER·잠금·비교 | 70-scenarios | 잠금, 복제, 비교 | 독립성, 비교 출력 | scenarios | warehouse/scenarios, ui/scenario-dialogs | SV09, S2, E2E scenarios | IMPLEMENTED | 잠금(Phase 3b)·복제·백업 복원·비교표·변경 행·CSV 기준본 일치(S2 7사례, D-024) |
| F-028 | 원자적 적용 트랜잭션 | 70-scenarios R.transaction | 적용 | 실패 시 전체 복원 | 전체 | excel/apply | XL14, X2, unit excel-apply | DONE | R.capture·R.backup·R.transaction·EX.apply(+75·80·90 래퍼) 기준본 일치(X2 적용 2사례: 백업·수정 이력·가져오기 이력·스냅숏·자동 배치 이력). 다른 편집안 변경·검증 실패·참조 공유 시 전체 취소 |
| F-029 | 검증 저장·무변경 생략 | 75 V.atomic/V.write/V.fingerprint | 저장 | SAVED/UNSAVED/ROLLED_BACK | persistence | persistence/storage, core/session | SV01–SV03, SV11 | IMPLEMENTED | 단위(SV01–SV03, SV11) + 브라우저 E2E(저장·새로고침 복원) |
| F-030 | Quota 처리·백업 순환 | 75 V.track/V.restore (BUG-STORAGE-001) | — | 정상본 보존, 3/6개 순환 | layoutBackups | persistence/backups | SV04–SV07, SV12 | IMPLEMENTED | 최신 3개 전체 프로젝트 백업 링·배치 백업 6개 순환·Quota 안내·저장 실패 시 백업 되돌리기(D-026, 단위·E2E) |
| F-031 | 저장소 진단·복구 다운로드 | 75 V.measureStorage/storageSnapshot | 저장소 관리 | 크기·단계 표시 | — | persistence/diagnostics | — (Phase 0 배정) | IMPLEMENTED | 저장소 관리 대화상자·복구 JSON 내려받기(D-026, E2E storage2) |
| F-032 | JSON 내보내기·불러오기 | 30-editor-io | 파일 | 2.3.6 무손실 왕복 | Project | exports/json, persistence/migration | SV08, SV10 | IMPLEMENTED | JSON 불러오기(12MB·교체 보호·백업 후 교체·실행취소)·날짜 붙은 내보내기, 기준본 저장 형식 양방향 호환(D-026) |
| F-033 | CSV·SVG·PNG·인쇄 내보내기 | 30-editor-io, 65-panels-details | 내보내기 | 오프라인 출력 | — | exports/* | — (Phase 0 배정) | NOT STARTED | — |
| F-034 | 재고기록·배치이력·과거 조회 | 65-panels-details, 70-scenarios | 기록, 날짜 선택 | 읽기 전용 조회, null 보존 | inventoryHistory, layoutSnapshots | warehouse/records, ui/records-panel | UI04, P3, E1, E2E details | IMPLEMENTED |재고 기록 조회(범위·검색·null 보존), 배치 이력 기록·복원·비교 기준본 일치 — 과거 날짜 읽기 전용 조회 모드(Phase 7) 전 · 과거 날짜 조회 모드(읽기 전용) 기준본 일치(H1 7사례, D-025) |
| F-035 | 패널 접기·하단 패널 | shell, 65-panels-details | 패널 버튼 | 좌표 불변 | — | ui/panels, main | UI06, UI07, E2E panels | IMPLEMENTING | 좌우 패널 접기·저장·축척 불변(E2E) — 하단 패널(재고·배치 이력) 전 |
| F-037 | 다중 탭·창 덮어쓰기 방지 (BUG-STORAGE-002, v2.4.2 후보) | 75 V.write V.baseRaw/V.concurrentChange, 99 bootstrap | 두 탭에서 저장, 다시 저장 확인 | 다른 탭 저장 후 덮어쓰기 차단, 확인 시에만 덮어쓰기(이전본은 last-good) | persistence | persistence/storage (revision 검사) | 기준본 MT01–MT09 | IMPLEMENTED | 단위(2단계 감지·경쟁) + 브라우저 E2E(알림·차단·확인 후 덮어쓰기) |
| F-036 | 프로그램 정보·버전 표시 | 99-bootstrap | — | 앱/스키마 버전 분리 | — | main | smoke E2E | IMPLEMENTED | TESTING |

| F-038 | 오프라인·런타임 오류 0 (횡단) | 모든 묶음 공통 | — | 외부 요청 0, 런타임 오류 0 | — | tools/verify, tests/e2e | smoke E2E | IMPLEMENTED | TESTING |
| F-039 | 휠 감도 설정·저장 | 50-editor M.setWheelMode | 감도 선택 | 프로젝트와 독립 저장, 손상 시 안전 기본값 | 별도 키 | cad/wheel-settings | unit plan, E2E plan | IMPLEMENTED | 저장·쓰기 후 읽기·손상 시 기본값·기준본 키 읽기 전용 |
| F-040 | 탐색 예산·중단 사유 | 92 C.limits/C.check | — | probe 상한, 사유 표시(D-005 결정적) | autoPlacement | placement/candidates | AL12 | IMPLEMENTED | 탐색 예산(probe·시작점·오프셋·후보)만으로 중단, 중단 사유 표시, 시간 상한 제거(D-023, 사용자 확정) |
| F-041 | 파생 검사 결과 재계산 | 92 JSON 복원 후 재검사 | JSON 불러오기 | 저장된 집계 불신, 현재 좌표로 재계산 | autoPlacement | placement/diagnostics | — | NOT STARTED | — |
| F-042 | 모바일 드로어·레이아웃 | shell, 65 | 좁은 화면 | 가로 넘침 없음, 드로어 동작 | — | ui/panels | — | DEFERRED | 사용자 지시(2026-11-15)로 요청 전까지 개발·검사 보류 |

✚ 기반 모듈 구현됨 (`src/geometry/tolerance.js`, `src/core/ids.js`). 기능 행 자체는 아직 NOT STARTED.
