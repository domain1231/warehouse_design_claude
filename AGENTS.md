# 재구축 개발 규칙

이 저장소는 Warehouse Layout Designer v2.4.1(`domain1231/warehouse_design@d7b1e696`, 스키마 2.3.6)을 기능 기준으로 새 아키텍처에서 다시 구축한다. 기준본의 이관용 규칙(함수 포획·초기화 순서 보존, 14개 파일 유지)은 이 저장소에 적용하지 않는다.

## 시작할 때
- 읽는 순서: 이 파일 → `docs/AI_HANDOFF.md` → 해당 Issue → 관련 소스만. 저장소 전체 재감사를 하지 않는다.
- 요구사항 근거: `docs/SPEC.md`(명세 요약·원본 위치), `docs/FEATURE_PARITY_MATRIX.md`, `docs/DECISIONS.md`.
- 기준본 동작 확인은 기준본 저장소의 소스·문서·Golden Master 결과로 한다. 기준본 HTML을 복사해 재구축으로 표시하지 않는다.

## 데이터 무결성 (최우선)
- 좌표·규격은 미터. 입력 최소 단위 1mm. 기존 JSON의 유효한 소수 좌표를 임의 반올림하지 않는다.
- 허용오차는 `src/geometry/tolerance.js`에서만 정의한다. 허용오차로 실제 충돌·이격 부족을 정상 판정하지 않는다.
- Object ID / Excel Key(건물+로케이션) / Display Code를 구분한다. 건물은 로케이션 문자열에서 추측하지 않는다.
- 원본 규격과 설계 규격을 섞지 않는다. 수량 미확인은 null. ROP·MAX Stock·평균 입고량·높이 활용률은 현재고가 아니다.
- BEFORE/AFTER는 참조를 공유하지 않는다. 저장은 쓰기 후 읽기 검증을 통과해야 SAVED로 표시한다. 실패 시 기존 정상본을 보존한다.
- 스키마 2.3.6 JSON 읽기 호환을 유지한다. 앱 버전(`package.json.version`)과 스키마 버전(`warehouse.projectSchemaVersion`)을 섞지 않는다.

## 결정성
- ID는 `src/core/ids.js` 생성기를 주입해서 만든다. 테스트·Golden Master는 시드를 고정한다.
- 자동 배치 후보 선택은 탐색 예산(probe 수)으로만 결정한다. 시간 상한은 "탐색 미완료" 표시용이다.

## 구현 방식
- 순수 JS·CSS·SVG. UI 프레임워크를 도입하지 않는다. 새 의존성은 사유를 `docs/DECISIONS.md`에 기록한 뒤 추가한다.
- 계산(기하·배치·검증)은 DOM 없는 순수 함수로 작성하고 단위 검사를 붙인다.
- 최종 산출물은 외부 자원 없는 단일 HTML이다(`pnpm verify`가 검사).
- 최소한의 올바른 구현을 우선한다. 지나치게 작은 모듈을 기계적으로 만들지 않는다.

## 명령
- 설치: `pnpm install --frozen-lockfile --ignore-scripts`
- 브라우저: `pnpm exec playwright install chromium` 또는 `WAREHOUSE_BROWSER_PATH=<chrome 경로>`
- 전체 검사: `pnpm check` (단위 → 빌드 → 오프라인 검증 → E2E)

## GitHub
- 한 작업 = 한 Issue = 한 브랜치(`feature/`, `fix/`, `chore/`, `docs/`) = 한 PR. main 직접 push·force push·자동 merge 금지(최초 등록 커밋만 예외).
- PASS는 해당 커밋에서 실제 실행한 결과만 보고한다. 실행하지 않은 환경(Windows Edge, 실제 마우스·터치패드, 모바일)은 NOT RUN으로 적는다.
- 업무 Excel·운영 JSON·실제 도면·PC 경로·토큰은 커밋하지 않는다. `fixtures/`에는 명시적인 가상 자료만 둔다.
- 작업을 마치면 `docs/AI_HANDOFF.md`와 PR 본문에 실행한 검사, 미해결 사항, 다음 작업을 기록한다.
- Release는 Draft까지만 만든다. 게시(Published)와 기존 태그·Release 변경은 사용자 승인 후에만 한다.
- AI 모델 사용 기준은 `docs/MODEL_POLICY.md`를 따른다.
