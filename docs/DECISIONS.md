# 설계 결정 기록

## D-001 별도 저장소에서 재구축 (2026-11-11, 사용자 확정)
- 결정: `domain1231/warehouse_design_claude`에서 재구축한다. 기준본 저장소는 v2.4.x 유지보수와 Golden Master 생성에만 사용한다.
- 이유: 기준본 main·Release 보호, 이관용 규칙과 재구축 원칙의 충돌 회피, 독립 CI.
- 기준본 결과는 가상 데이터 기반 Golden Master JSON만 `fixtures/golden/`으로 가져온다. 서브모듈은 쓰지 않는다.
- 최종 배포 위치(새 저장소 Release로 전환 여부)는 Phase 12에서 결정한다.

## D-002 번들러로 esbuild 사용
- 결정: 개발 소스는 ES 모듈로 나누고, `tools/build.cjs`가 esbuild로 하나의 IIFE로 묶어 단일 HTML에 인라인한다.
- 이유: 단일 오프라인 HTML 요구를 지키면서 모듈 경계를 명확히 하기 위해. 단일 바이너리 의존성 1개로 범위가 작다. UI 프레임워크가 아니다.
- 설치는 `--ignore-scripts`로 하며 esbuild는 플랫폼 패키지로 동작한다.

## D-003 ID 생성기 주입
- 결정: `src/core/ids.js`의 `createIdGenerator`를 통해서만 ID를 만든다. 테스트는 시드를 고정한다.
- 이유: 기준본은 `crypto.randomUUID`로 실행마다 ID가 달라 Golden Master에서 ID를 직접 비교할 수 없다. 기준본과의 비교는 Excel Key로 매핑한다.

## D-004 허용오차 단일 정의
- 결정: 입력 1mm / 기하 판정 1µm / 연산 잡음 1nm을 `src/geometry/tolerance.js`에서만 정의한다.
- 이유: 기준본은 파일마다 1e-6~1e-12의 서로 다른 상수를 썼다. 1µm 이하 부족분은 1mm 입력 체계에서 계산 잡음으로 본다.
- 미결: 접촉(거리 0)을 충돌로 볼지는 Phase 2에서 기준본 동작(Golden Master)을 확인해 정한다.

## D-005 결정적 자동 배치 탐색 (Phase 6 예정)
- 결정: 후보 선택은 probe 예산으로만 결정한다. 시간 상한은 "탐색 미완료" 표시로만 쓴다.
- 이유: 기준본의 1,500ms 벽시계 상한은 PC 속도에 따라 후보 집합을 바꾼다.
- 기준본과 결과가 다를 수 있으며, 차이 수용 여부는 Phase 6에서 사용자 확인을 받는다.
