# AI 인수인계

## 현재 상태 (2026-11-11)
- 단계: 저장소 골격 (Phase 0 준비). PR `chore/scaffold`.
- 앱 2.5.0-alpha.0 / 스키마 2.3.6. 화면은 버전 표시만 있는 골격이다.
- 구현된 기반 모듈: `src/core/ids.js`(시드 주입 ID), `src/geometry/tolerance.js`(허용오차 단일 정의).
- 검사: 단위 14 + 빌드 + 오프라인 검증 + E2E 1. Linux, Node 24.22.2, Chrome for Testing 153에서 PASS. Windows CI는 이 PR의 Actions 결과를 확인한다.

## 다음 작업
1. 기준본 저장소 A4: Golden Master 하네스(기준본 HTML 구동, 가상 입력의 배치·경고·JSON 덤프, Excel Key 기준 정규화).
2. 기준본 저장소 A5: 공개 함수 래핑 체인 덤프 → 이 저장소 `FEATURE_PARITY_MATRIX.md` 세분화.
3. Phase 1: 프로젝트 모델·스키마 2.3.6 왕복, patch 이력, 저장 어댑터(2-슬롯 + revision 검사).

## 미결 사항
- 명세서 원본 전문(`docs/SPEC_v1_0.md`) 반입 여부.
- 접촉(거리 0)의 충돌 판정 정책 — Phase 2에서 기준본 확인(D-004).
- 최종 Release 위치 — Phase 12(D-001).

## NOT RUN
- Windows Edge, 실제 마우스·터치패드, 모바일 실기기.
