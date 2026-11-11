# AI 인수인계

## 현재 상태 (2026-11-11)
- 단계: 저장소 골격 (Phase 0 준비). PR `chore/scaffold`.
- 앱 2.5.0-alpha.0 / 스키마 2.3.6. 화면은 버전 표시만 있는 골격이다.
- 구현된 기반 모듈: `src/core/ids.js`(시드 주입 ID), `src/geometry/tolerance.js`(허용오차 단일 정의).
- 검사: 단위 14 + 빌드 + 오프라인 검증 + E2E 1. Linux, Node 24.22.2, Chrome for Testing 153에서 PASS. Windows CI는 이 PR의 Actions 결과를 확인한다.

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

## 다음 작업
0. (완료) Phase 0: 기준본 FUNCTION_CHAIN과 786/88 검사 분류로 `FEATURE_PARITY_MATRIX.md` 세분화, Golden Master 비교 도구(이 저장소 `tools/golden-compare`) 설계.
2. Phase 1: 프로젝트 모델·스키마 2.3.6 왕복(G5 기준), patch 이력, 저장 어댑터(2-슬롯 + revision 검사).
3. Phase 2: 기하·공간검사를 G1·G2와 일치시키기.

## 미결 사항
- 명세서 원본 전문(`docs/SPEC_v1_0.md`) 반입 여부.
- 접촉(거리 0)의 충돌 판정 정책 — Phase 2에서 기준본 확인(D-004).
- 최종 Release 위치 — Phase 12(D-001).

## NOT RUN
- Windows Edge, 실제 마우스·터치패드, 모바일 실기기.
