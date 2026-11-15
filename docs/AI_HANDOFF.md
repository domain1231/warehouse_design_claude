# AI 인수인계

## 현재 상태 (2026-11-15)
- 단계: Phase 5b(Excel 배치안·적용 트랜잭션) 완료. PR `feature/phase5b-excel-apply`(기준: main). PR #1~#13은 main에 병합됨.
- 앱 2.5.0-alpha.0 / 스키마 2.3.6.
- 검사: 단위 96 + Golden 208(todo 2: G3·G4) + 빌드 + 오프라인 검증 + E2E 35. Linux, Node 24, Chrome 153에서 PASS.

## 기준 데이터 (2026-11-11)
- `fixtures/golden/` G1–G5: 기준본 `tools/golden-master.cjs`(기준본 PR #22)로 생성, 3회 독립 실행 sha256 동일. 사용법은 `fixtures/golden/README.md`.
- 기준본 함수 체인: 기준본 `docs/FUNCTION_CHAIN.md` (340개 중 74개 체인, `validateProject` 12단계, `commit` 6단계).
- D-004 해소: 기준본은 접촉(거리 0)을 충돌로 보지 않는다.

## Phase 0 결과 (2026-11-11, feature/phase0-golden-compare)
- `tests/golden/`: 공용 비교 도우미(정규화·경로 diff) + G1 검사. G2–G5는 todo로 목표 Phase 표시. `pnpm check`에 포함.
- `src/geometry/polygons.js`, `collision.js`: G1 421쌍 기준본과 1e-9 완전 일치. 기하 EPS를 기준본 1e-8로 맞춤(D-004 갱신).
- 기준 데이터 결함 수정: G1 무작위 입력이 정규화로 손실되던 문제를 기준본 하네스에서 0.1mm·0.001° 양자화로 해결(기준본 PR #22, 새 저장소 PR #2 갱신).
- `docs/BASELINE_TEST_MAP.md`: 기준본 14개 묶음 → F-001~F-042 역색인. 자동 검사 없는 기능: F-008, F-012, F-019, F-020.
- 매트릭스: F-013·F-014 IMPLEMENTING(G1 일치), F-038~F-042 추가.

## Phase 1a 결과 (2026-11-11, feature/phase1-storage)
- `src/persistence/zip.js`: 기준본 저장 형식(warehouse-backup-zip-v1) 읽기·쓰기, CRC32, 크기 상한. 기준본 저장 원문 바이트 동일 복원, 재구축본 원문을 기준본이 읽음(`tools/legacy-compat.mjs`).
- `src/persistence/storage.js`: 2-슬롯 + 포인터 원자 저장(D-007), 무변경 생략, 동시 저장 2단계 감지·force 덮어쓰기, 손상 보호, last-good, 기준본 키 읽기 전용(D-006).
- 단위 검사 37개(압축 6, 저장소 17 포함). UI·앱 연결은 아직 없음.

## Phase 1b-1 결과 (2026-11-11, feature/phase1-project-model)
- `src/core/project.js`: createProject·validateProject·validateLayout·assertIndependent·parseLocation. 기준본 12단계 체인을 실행 순서대로 펼침(D-008).
- Golden G5(샘플·빈) 완전 일치. 기준본 대조 V1: 70사례 수락/거부·메시지·보정 결과 sha256 일치(`tests/golden/V1-validation.test.js`, 자료 재생성 `tools/validation-diff.mjs`).
- 저장소에 validate 연결 시 기준본 저장본 로드·잘못된 프로젝트 저장 차단 확인.
- D-006 확정: A안(기준본 키 쓰지 않음).

## Phase 1b-2 결과 (2026-11-11, feature/phase1-session)
- `src/core/history.js`: 변경분 실행취소(D-009). `src/core/session.js`: 편집 세션·자동 저장·충돌·손상 보호(D-010).
- `src/main.js`: 저장 상태·이름 편집·저장·덮어쓰기 확인·손상 교체·실행취소·JSON 내보내기 화면(도면 없음). storage 이벤트 연결.
- 브라우저 E2E `tests/e2e/storage.test.js` 5개: 새로고침 복원, 실행취소 저장, 기준본 데이터 로드(키 불변), Quota 주입 실패·재시도, 두 탭 충돌·확인 후 덮어쓰기. Linux Chrome for Testing 153. Windows Edge NOT RUN(CI windows-latest는 Chromium).
- Phase 1 완료 범위: 저장 계층·프로젝트 모델·실행취소·세션. 남은 저장 항목: 백업 순환(3/6개), 저장소 진단, JSON 불러오기 UI → Phase 8·9.

## Phase 2 결과 (2026-11-11, feature/phase2-spatial)
- `src/geometry/polygons.js`·`collision.js`·`clearance.js`, `src/warehouse/constraints.js`(warnings·scanLayout·layoutSignature), `src/core/format.js`(D-011).
- 기준본 대조: `tests/golden/G2-spatial.test.js` 11, `S1-spatial.test.js` 22(사례 21 + 목록 일치). 자료 재생성: `BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/spatial-diff.mjs`.
- 세션 저장 시 BEFORE/AFTER 검사 결과 기록(`storeScanResults`), 같은 배치면 UNCHANGED.
- 성능: 랙 500 배치 검사 중앙값 약 35ms(Node). 브라우저 측정 NOT RUN.
- 미이식: 열 우선 배치 확장 검사·결과 재계산(92) → Phase 6.

## Phase 3a 결과 (2026-11-15, feature/phase3-plan)
- `src/cad/camera.js`(fitView·viewBox·zoomBy·pan·pinch·중심·선택 영역 보기·휠), `selection.js`, `scene.js`, `wheel-settings.js`, `session.setView/flushView`, 저장 직렬화(D-012).
- 기준본 대조 `tests/golden/P1-plan.test.js` 16(카메라 13사례·도형·겹침 표시). 재생성: `BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/plan-diff.mjs`.
- E2E `tests/e2e/plan.test.js` 6: 휠 기준점·좌표 불변·복원, 패널 휠 분리, 선택·영역 선택·복원, 팬·Esc·버튼, 휠 감도, 390px.
- NOT RUN: 실제 마우스·터치패드·터치 핀치(합성 이벤트만), Windows Edge, 브라우저 성능 측정.

## Phase 3b-1 결과 (2026-11-15, feature/phase3b-edit)
- `src/warehouse/commands.js`(applyCommand·applyMove·명령들·정렬 가이드), `src/ui/inspector.js`, `session.apply`·`nextId`·편집 환경 `setView`, `tolerance.js` addMm·snapToStep·roundMm(D-013).
- 기준본 대조 `tests/golden/E1-edit.test.js` 20(19사례). 재생성: `BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/edit-diff.mjs`.
- E2E `tests/e2e/edit.test.js` 5: 추가·실행취소, 드래그 이동·차단 안내, 방향키·복사/붙여넣기·회전·삭제·Esc, 속성·1mm 거부·위치 잠금, BEFORE 잠금.
- NOT RUN: 실제 마우스·터치패드·터치 드래그, Windows Edge.

## Phase 3b-2 결과 (2026-11-15, feature/phase3b2-resize)
- `commands.js` resized·handlePoint·applyResize, calculateGroup·groupOrder·readGroupConfig·applyGroupPreview, `src/ui/group-dialog.js`, `session.setView({ scenario, beforeLocked })`(D-014).
- 기준본 대조 E1 34(33사례). E2E `tests/e2e/edit2.test.js` 4: 크기 조절·실행취소, 정렬 대화상자 적용·그룹 회전, 위반 시 적용 잠금, 대상 전환·잠금 해제·복원.
- NOT RUN: 실제 마우스·터치패드, Windows Edge.

## Phase 4a 결과 (2026-11-15, feature/phase4-panels)
- `src/warehouse/metrics.js`, `src/warehouse/racklist.js`, `src/ui/panels.js`, 도면 흐림(scene filter), `setView({ panels })`, fitScale 유지 버그 수정(D-015).
- 기준본 대조 `tests/golden/P2-panels.test.js` 10. E2E `tests/e2e/panels.test.js` 5.
- NOT RUN: Windows Edge, 실제 마우스·터치.

## Phase 4b 결과 (2026-11-15, feature/phase4b-details)
- `src/warehouse/rackinfo.js`, `src/warehouse/records.js`, `src/ui/rack-detail.js`, `src/ui/records-panel.js`, `applyCommand` resetCamera, `setView({ rackInfographic })`, verify 이름공간 허용(D-016).
- 기준본 대조 P3 7, E1 37(36사례). E2E `tests/e2e/details.test.js` 3.
- NOT RUN: Windows Edge, 실제 마우스·터치.

## Phase 5a 결과 (2026-11-15, feature/phase5-excel)
- `src/excel/xlsx.js`(외부 라이브러리 없는 XLSX·CSV 읽기), `src/excel/analyze.js`, `src/ui/excel-dialog.js`(D-017).
- 가상 통합 문서 `fixtures/excel/`(기준본 SheetJS로 생성). 대조 `tests/golden/X1-excel.test.js` 8. 재생성: `BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/excel-diff.mjs`.
- NOT RUN: 실제 업무 Excel(커밋 금지 자료), Windows Edge.

## Phase 5b 결과 (2026-11-15, feature/phase5b-excel-apply)
- `src/excel/proposal.js`(readExcelConfig·generateRacks·buildProposal), `src/excel/apply.js`(captureTarget·backupTarget·runTransaction·applyExcelProposal), Excel 대화상자 설정·미리보기·경고 확인·적용·매핑 요약 복사(D-018).
- 기준본 대조 `tests/golden/X2-proposal.test.js` 9(배치안 6 + 적용 2 + 목록). 단위 `tests/unit/excel-apply.test.js` 4. E2E excel 2.
- NOT RUN: 실제 업무 Excel, Windows Edge.

## Phase 5c-1 결과 (2026-11-15, feature/phase5c-labels, PR #14 위에 쌓음)
- `src/cad/labels.js`, 라벨 설정 3종·상태 문구, 속성 창 ZONE 표시 이름(D-019). 대조 `tests/golden/L1-labels.test.js` 11, E2E `tests/e2e/labels.test.js` 4.
- 모델 배분 첫 적용: 기준본 추출 Haiku, 대조 사례·판정 Opus, 구현·E2E Sonnet(docs/MODEL_POLICY.md).
- NOT RUN: Windows Edge·실제 글꼴(Segoe UI·맑은 고딕) 렌더링, 실제 마우스.

## 다음 작업
- Phase 5c-2: 표시 색 모드(settings.vizMode 4종, EX.color·EX.legend·임계값), 사용자 지정 색(theme.colorMode·objectColors, 속성 창 색 지정·초기화 대화상자).
- Phase 6: 자동 배치 후보(W.pack 5종·W.build·비교표·후보 선택), 열 우선 생성(92).
- 사용자 확인 필요: 실제 업무 Excel을 로컬 빌드로 열고 '매핑 요약 복사' 결과(값 제외)로 매핑 확인.

## 미결 사항
- 명세서 원본 전문(`docs/SPEC_v1_0.md`) 반입 여부.
- 최종 Release 위치 — Phase 12(D-001).

## NOT RUN
- Windows Edge, 실제 마우스·터치패드, 모바일 실기기.
