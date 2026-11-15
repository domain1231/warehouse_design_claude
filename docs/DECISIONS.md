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
- 결정: 입력 1mm / 기하 판정 1e-8m / 연산 잡음 1nm을 `src/geometry/tolerance.js`에서만 정의한다. 기하 판정 값은 처음에 1µm로 정했으나, 기준본 EPS(1e-8)와 Golden Master 일치를 위해 2026-11-11 1e-8로 맞췄다(SAT 분리 축은 기준본과 같이 정규화하지 않은 변 법선).
- 이유: 기준본은 파일마다 1e-6~1e-12의 서로 다른 상수를 썼다. 공간 판정의 핵심(10-geometry)은 1e-8이며, 이 값 이하 부족분은 1mm 입력 체계에서 계산 잡음으로 본다.
- 접촉 정책 (2026-11-11 Golden Master G1로 확인): 기준본 `overlaps()`는 변 접촉·꼭짓점 접촉(거리 0)을 충돌로 보지 않고, 1mm 겹침부터 충돌로 판정한다. `gap()`은 0.299를 그대로 반환한다. 재구축본은 이 동작을 따른다. 접촉 허용 여부는 이격(minGap) 규칙으로 별도 판정된다.

## D-005 결정적 자동 배치 탐색 (Phase 6 예정)
- 결정: 후보 선택은 probe 예산으로만 결정한다. 시간 상한은 "탐색 미완료" 표시로만 쓴다.
- 이유: 기준본의 1,500ms 벽시계 상한은 PC 속도에 따라 후보 집합을 바꾼다.
- 기준본과 결과가 다를 수 있으며, 차이 수용 여부는 Phase 6에서 사용자 확인을 받는다.

## D-006 저장 키와 기준본 데이터 (2026-11-11, Phase 1a)
- 결정: 재구축본은 `warehouse-layout-v2:slot-a|slot-b|pointer` 키에 저장한다. 기준본 키 `warehouse-studio-v1`은 처음 실행 시 읽기만 하고 수정·삭제하지 않는다.
- 저장 원문은 기준본과 같은 `warehouse-backup-zip-v1` 형식이다. 기준본 v2.4.1이 이 원문을 읽을 수 있음을 `tools/legacy-compat.mjs`로 확인했다(원문 복원 바이트 동일, 새로고침 부팅 정상).
- 이유: 기준본 데이터를 원본 보존본으로 남기고, 재구축본 저장 방식(2-슬롯·포인터)과 섞지 않기 위해.
- 영향: 같은 브라우저에서 기준본으로 되돌아가면 기준본은 재구축본 이전의 자기 데이터를 연다. 최신 작업을 기준본으로 옮기려면 JSON 내보내기·불러오기를 쓴다. 저장 공간은 기준본 1개 + 재구축본 슬롯 2개를 차지한다.
- 확정(2026-11-11 사용자 결정, A안): 기준본 키에는 쓰지 않는다. 기준본 키는 원본 보존본으로만 둔다. 재구축본에서 기준본으로 최신 작업을 옮길 때는 JSON 내보내기·불러오기를 쓴다.

## D-007 저장 원자성: 2-슬롯 + 포인터 (2026-11-11, Phase 1a)
- 결정: 비활성 슬롯에 쓰고 읽어서 확인한 뒤 포인터 키 하나만 교체한다. 포인터 교체 전 어떤 실패도 기존 저장본을 바꾸지 않으므로 기준본의 바이트 복구 쓰기가 필요 없다. 교체 후 비활성 슬롯이 직전 저장본(last-good)이 된다.
- 동시 저장: 각 저장소 인스턴스는 마지막으로 읽거나 쓴 포인터 원문을 기억하고, 저장 시작 시와 포인터 교체 직전(비동기 압축 이후)에 두 번 비교한다. 다르면 CONFLICT로 중단하고, 명시적 확인(force) 시에만 덮어쓴다(기준본 BUG-STORAGE-002와 같은 정책).
- 브라우저 요구: CompressionStream/DecompressionStream('deflate-raw') (Chrome·Edge 103+, Firefox 113+, Safari 16.4+). 실제 Windows Edge 확인은 UI 연결 단계(Phase 1b)에서 한다.

## D-008 프로젝트 모델: 기준본 검증 체인을 한 함수로 펼침 (2026-11-11, Phase 1b)
- 결정: `src/core/project.js`의 `validateProject`는 기준본 12단계 래퍼(10→40→50→60→65×2→70×2→75→80→90→92)와 기본값 보정(S.ensure 3단계, M/EX/V/Q/W.ensure)의 최종 합성 동작을 실행 순서 그대로 한 함수에 펼친다. `createProject`는 makeProject 최종 합성(90 W.ensure ∘ 80 Q.ensure(fresh) ∘ 00)이다.
- 검증: Golden Master G5(샘플·빈 프로젝트) 완전 일치, 기준본 대조 70사례(수락 10·거부 60)에서 수락/거부·오류 메시지·보정 결과 sha256 일치(`tools/validation-diff.mjs` → `fixtures/legacy/validation-cases.json`).
- 미이식: 열 우선 모드 배치(`autoPlacementRules.mode === "column"`)의 검사 결과 재계산(W.scan) — Phase 2·6.
- 참고: 기준본 `tools/function-chain.cjs`는 `const x=S.ensure;S.ensure=p=>` 형태(멤버 화살표 함수 포획)를 놓친다. S.ensure 체인(60→65→70)은 직접 확인했다.

## D-009 실행취소: 변경분(patch) 기록 (2026-11-11, Phase 1b-2)
- 결정: `src/core/history.js`는 편집 전후 프로젝트의 구조 차이만 기록한다. 되돌리는 범위는 기준본과 같은 프로젝트 전체(재고·배치 이력 기록 포함)이며 persistence만 제외한다. 상한 60단계(기준본과 동일).
- 이유: 기준본은 편집마다 프로젝트 전체 JSON 문자열을 쌓아 이력이 커질수록 편집 비용과 메모리가 늘었다. 샘플 프로젝트에서 랙 1개 이동 기록은 기준본 방식의 1% 미만이다.
- 한계: 배열 길이가 바뀌는 편집(객체 추가·삭제)은 그 배열 전체를 한 번 기록한다. 대규모 프로젝트에서 측정 후 필요하면 ID 기반 배열 diff로 개선한다.

## D-010 편집 세션과 자동 저장 (2026-11-11, Phase 1b-2)
- 결정: `src/core/session.js`가 편집 확정(복사본 수정 → 검증 → 실행취소 기록 → 자동 저장)과 저장 상태(saved/unsaved/saving/error)를 담당한다. 검증 실패 편집은 적용·기록·저장하지 않는다. 저장 실패 시 편집은 메모리에 남고 상태는 error(code: QUOTA/CONFLICT/CORRUPT/VERIFY/…)이다.
- 기준본과 같이 편집마다 자동 저장한다. 기준본 데이터로 시작하면 안내를 표시하고 첫 저장 전까지 unsaved로 둔다.

## D-011 공간검사: 기준본 래퍼 체인을 결과 기준으로 펼침 (2026-11-11, Phase 2)
- 기준본 `warnings`(10 기본 → 40 이격·외벽 → 50 통로 유효/목표 폭·침범·출입문 연결)와 `W.scan`/`W.signature`(90, 92 래핑)를 `src/warehouse/constraints.js` 한 모듈로 펼쳤다. 다각형·충돌·통로 유효 폭은 `src/geometry/{polygons,collision,clearance}.js` 순수 함수.
- 동등성 기준은 기준본 결과 자체다: 경고 문구·순서·지문, 집계(counts), 대기·설계 간격까지 `tools/spatial-diff.mjs`로 기준본 일반본에서 받은 판정(`fixtures/legacy/spatial-cases.json`)과 비교한다(G2 11, S1 21사례). 숫자 표기는 기준본 `fmt`(ko-KR)를 `src/core/format.js`로 옮겼다.
- 저장 직전에 BEFORE/AFTER 검사 결과를 기록한다(기준본 V.write 래퍼 `W.storeResults`). 배치 지문이 같으면 이전 결과를 유지해 내용이 같은 저장은 UNCHANGED로 생략된다.
- 열 우선(column) 배치의 확장 검사·결과 재계산(92)은 자동 배치와 함께 Phase 6에서 이식한다. 그 전까지 `scanLayout`은 column 모드에서 오류를 던지고, 저장 시에는 기존 결과를 건드리지 않는다.
- 성능: 랙 500 + 벽 6 + 통로 4 배치 검사 중앙값 약 35ms(Linux, Node 24, 7회). 브라우저·Windows는 NOT RUN.

## D-012 도면 보기: 카메라·선택은 저장하되 실행취소에서 뺀다 (2026-11-15, Phase 3a)
- 카메라(`src/cad/camera.js`)·선택(`selection.js`)·도면 문자열(`scene.js`)은 DOM 없는 함수다. `main.js`는 이벤트 연결만 한다.
- 기준본처럼 `viewport`(fitScale 포함)와 `editing.selectedRackIds/selectionScenario`를 프로젝트에 저장한다. 다만 `session.setView`로 바꾸며 실행취소 기록에는 넣지 않는다(실행취소가 화면을 되돌리지 않음). 확대·이동 중 매 프레임 저장하지 않도록 250ms 뒤 한 번 저장, 조작 종료·선택은 즉시 저장.
- fitScale(배율 1의 1m당 px)은 기준본 65 래퍼대로 한 번 정하면 유지한다. 창 크기·패널이 바뀌어도 축척이 변하지 않고, 전체 보기·50%·200%에서만 다시 계산한다.
- 세션 저장을 한 줄로 직렬화했다(`save` 체인). 편집 자동 저장과 화면 저장이 겹쳐 같은 탭이 자기 자신을 다른 탭 충돌로 오인하지 않게 한다.
- 성능: 확대·이동은 SVG viewBox만 바꾸고, 도면 내용은 배치·선택·설정이 바뀔 때만 다시 만든다(기준본은 이동 중에도 매번 전체를 다시 그림). 랙 500개 도면 생성 중앙값 약 22ms(Node).
- 휠 감도는 `warehouse-layout-v2:wheel-sensitivity`에 저장하고 쓰기 후 읽기를 확인한다. 기준본 키(`warehouse-studio-v1-wheel-sensitivity-v1`)는 처음에 읽기만 한다(D-006).
- 기준본 일치: `tools/plan-diff.mjs` → `fixtures/legacy/plan-cases.json`. 카메라 13사례(viewport·viewBox 완전 일치), 도면 객체 도형 58개·겹침 표시 3개 일치.
- 아직 옮기지 않은 그리기: 라벨(F-019), Excel 상태 색, 검색·필터 흐림, 참고 도면(F-012), 측정. 객체 이동·크기 조절·생성은 Phase 3b.

## D-013 편집 명령: 기준본 commit 래퍼 체인을 한 함수로 (2026-11-15, Phase 3b-1)
- `src/warehouse/commands.js`의 `applyCommand`가 기준본 commit 체인(90 위치 잠금·수동 편집 → 70 BEFORE 잠금·재고 기록 대상 → 60 크기 제한·규격 이력 → 50 정책 동기화·새 통로 기준값·검증·새 공간 경고 차단·명령 기록)을 순서대로 재현한다. 입력 프로젝트는 바꾸지 않는 순수 함수이며, 드래그 이동 확정은 `applyMove`(기준본 M.finish 90→80→50)다.
- 실패도 기준본처럼 명령 기록(success:false)을 남기고 저장한다. 실행취소 기록은 성공한 명령만 만든다(`session.apply`). 실행취소는 이전 상태 전체로 돌아가므로 그 뒤의 실패 기록도 사라진다(기준본과 같음).
- 명령 기록 이름은 기준본처럼 따로 지정한 경우(키보드 미세 이동, 설계 치수 직접 입력, 객체/그룹 이동) 외에는 '객체 수정'이다.
- 좌표 연산은 기준본 Q.add·snapped·Q.roundMm과 같은 `addMm`·`snapToStep`·`roundMm`(`tolerance.js`). 복제 위치(+0.5m)는 기준본의 단순 덧셈 대신 `addMm`을 써 부동소수점 잡음이 저장되지 않게 했다(대조 결과 1e-9 범위 동일).
- 객체 1개 선택 시 X·Y·폭·깊이 칸은 1mm 단위가 아니면 명령 없이 거부한다(기준본 Q.input). 랙 2개 이상 선택 시 속성 칸 대신 안내만 보인다(그룹 편집 패널은 Phase 3b-2).
- 도면을 누르면 입력 칸 포커스를 풀어 단축키(방향키·Delete·R·Ctrl+C/V/Z/Y/A·Esc)가 도면에 적용되게 했다(기준본은 체크박스에 포커스가 남으면 방향키가 무시됨).
- 기준본 일치: `tools/edit-diff.mjs` → `fixtures/legacy/edit-cases.json`. 19사례(추가 성공·충돌 실패, 통로 기준값, 삭제, 복제, 회전, 미세 이동, 속성·수량 null, NaN·1mm 거부, 설계 치수·크기 제한, 드래그 스냅·mm 정리·그룹·차단·포인터 취소·위치 잠금, BEFORE 잠금)에서 바뀐 객체·명령 기록·규격 이력·선택이 같다.
- 아직 옮기지 않은 것: 대량 삭제 전 별도 저장 백업(75 V.checkpoint, Phase 8), 8방향 크기 조절(F-008)·정렬·그룹 회전 대화상자·다각형 통로 그리기·랙 팔레트 끌어놓기(Phase 3b-2), 가까운 랙 거리 표시(Q.nearest).

## D-014 크기 조절·다중 랙 편집·배치 대상 전환 (2026-11-15, Phase 3b-2)
- 크기 조절: 기준본 65 `S.resized`를 `commands.resized`로 옮겼다. 반대쪽 핸들을 고정점으로 로컬(회전) 좌표에서 계산하고 스냅·크기 제한·비율 고정을 따른다. 확정은 시작 상태에서 x·y·폭·깊이·높이를 한 번에 `applyCommand`(명령 '크기 조절')로 적용하므로 크기 제한·규격 이력·경고 차단이 편집 명령과 같다. 조절 중에는 세션을 건드리지 않는 미리보기와 크기·새 경고를 표시한다.
- 회전한 객체의 x·y는 기준본과 같이 반올림하지 않는다(1mm 반올림은 정밀 입력 칸에만).
- 다중 랙 편집: 기준본 50 `M.calculate/M.order/M.applyEdit` + 80 입력 검사를 `calculateGroup/groupOrder/readGroupConfig/applyGroupPreview`로 옮겼다. 대화상자(`src/ui/group-dialog.js`)는 적용 전 미리보기·위반 건수를 보이고, 위반이 있으면 '허용'을 확인해야 적용한다(overrideAllow). 정렬·간격 단추와 랙 2개 이상 회전은 이 대화상자를 연다. 명령 이름은 기준본처럼 '그룹 ' + 동작 이름(예: '그룹 그룹 이동' 그대로).
- 그룹 이동(ΔX·ΔY)만 기준본의 단순 덧셈 대신 `addMm`(입력이 1mm 단위라 잡음만 제거). 그 외 정렬·간격 계산은 기준본과 같은 부동소수점 연산.
- 배치 대상 전환(기준본 70 `R.switch`): `session.setView({ scenario })`가 settings.scenario를 바꾸고 해당 대상의 locationLayout을 복사하며 선택을 비운다. BEFORE 잠금 전환은 `setView({ beforeLocked })`, 해제할 때만 확인을 받는다. 둘 다 실행취소 기록 없이 저장(기준본과 같음).
- 기준본 일치: `edit-cases`에 크기 조절 5·다중 랙 편집 9사례를 더해 총 33사례가 같다. 기준본 대화상자 값은 페이지에 남으므로 도구가 사례마다 처음 값으로 되돌린다.
- 아직 옮기지 않은 것: 랙 더블클릭 상세 정보(F-018), 다각형 통로 그리기, 랙 팔레트 끌어놓기, 통로 유형 기준 편집 대화상자.

## D-015 통계·랙 목록·범례·패널 접기 (2026-11-15, Phase 4a)
- 통계(`src/warehouse/metrics.js`): 기준본 metrics·unionArea·clipPolygon·unitTotals를 그대로 옮겼다. 적재율은 최대·현재 수량이 모두 있는 랙만으로 계산하고 미확인 수량을 0으로 보지 않는다. 오목 다각형 면적은 기준본과 같은 띠 근사.
- 랙 목록·검색·필터(`src/warehouse/racklist.js`): 기준본 match(코드·블록·Excel 로케이션·자재 검색, 종류, 적재 상태)와 65 정렬(줄 문자열의 한국어 숫자 비교)을 옮겼다. 맞지 않는 랙은 도면에서 불투명도 0.2로 흐린다. 검색어·필터·정렬은 기준본처럼 `panels.view`에 저장(실행취소 없음).
- 범례: 기준본 40 EX.legend + 80 범위 문구(예: '보통 (50% 이상 ~ 90% 미만)'). 표시 모드(vizMode)별 항목은 Excel 단계에서 화면 전환을 붙인다.
- 패널 접기: `panels.leftOpen/rightOpen` 저장. 접힌 패널은 격자 칸(0px)을 유지한다.
- 버그 수정(이번 단계에서 발견): 저장된 viewport에 fitScale이 없는 프로젝트를 연 뒤 다른 변경(패널 접기 등)이 생기면 화면 크기로 fitScale을 다시 계산해 축척이 바뀌던 문제. 화면에서 정한 fitScale을 viewport가 바뀔 때까지 유지한다(E2E 패널 접기로 확인).
- 기준본 일치: `tools/plan-diff.mjs` panels — BEFORE/AFTER 통계, 범례 문구, 랙 목록 6사례(검색·필터·정렬·흐림) 일치(P2).
- 아직 옮기지 않은 것: 랙 상세 인포그래픽(F-018, 더블클릭), 하단 패널(재고 기록·배치 이력, F-034·F-035), 목록·이력 스크롤 위치 저장, 표시 모드 전환(Excel 단계).

## D-016 랙 상세·재고 기록·배치 이력 (2026-11-15, Phase 4b)
- 랙 상세(`src/warehouse/rackinfo.js`, `src/ui/rack-detail.js`): 기준본 65 S.infoSvg·S.renderInfo를 옮겼다. 선반·자재는 Excel 원본 계층만 쓰고 선반 수·빈 선반·현재고는 추정하지 않는다. 높이 활용률(자재높이÷선반높이)은 현재 적재율과 별개로 표시한다. 더블클릭은 포인터 캡처 때문에 대상이 SVG일 수 있어 기준본처럼 점이 들어간 랙(회전 반영)을 찾는다. 선반 번호 방향은 `rackInfographic.shelfOrder`에 저장(실행취소 없음).
- 실제 설비 변경 확인: 기준본 명령 그대로(physicalConfirmation, 규격 이력 physical-confirmed, 500개 유지).
- 재고 기록·배치 이력: 기준본은 하단 패널이지만 재구축은 정보 패널의 접힘 구역 두 개로 둔다(기능 동일: 범위·검색·날짜·쪽 넘김, 현재 배치 기록, 복원, 비교). 복원은 기준본처럼 같은 ID 랙의 수량·단위·자재 연결·원본 규격을 유지하고 화면을 초기화한다(`applyCommand` resetCamera). 과거 날짜 '조회'(읽기 전용 화면)는 이력 조회 모드와 함께 Phase 7.
- 내려받는 SVG에는 xmlns가 필요하므로 오프라인 검사(`tools/verify.cjs`)가 SVG 이름공간 식별자만 허용한다(네트워크 요청 아님).
- 기준본 일치: plan-diff details(요약 9항목, 인포그래픽 SVG 3가지 보기·자재 상세, 재고 기록 3범위) P3 7건, edit-cases(배치 이력 기록·복원·실제 설비 확인) 3사례 추가.

## D-017 Excel 읽기: SheetJS 대신 최소 XLSX·CSV 읽기를 직접 구현 (2026-11-15, Phase 5a)
- 기준본은 SheetJS(XLSX.read + sheet_to_json raw·defval null·blankrows)를 번들했다. 재구축은 새 의존성 없이 `src/excel/xlsx.js`에 필요한 부분만 구현했다: ZIP 중앙 디렉터리 → DecompressionStream('deflate-raw') → workbook.xml·관계·sharedStrings·시트 XML. 브라우저와 Node 모두 같은 코드로 동작하고 DOM이 필요 없다.
- 이유: 단일 오프라인 HTML 크기(SheetJS는 수백 KB), 의존성·라이선스 관리, 결정적 검사. 필요한 기능은 셀 원시 값 읽기뿐이다(수식 계산·서식·쓰기 불필요).
- 동작 기준(기준본과 같음): 숫자는 숫자, 공유/인라인/수식 문자열은 문자열, 참/거짓은 boolean, 오류 값(#N/A 등)은 빈 칸, 날짜는 일련번호 그대로, 서식 문자열은 조각을 잇고 발음(rPh)은 뺀다, _xHHHH_·XML 엔터티를 푼다. CSV는 UTF-8(BOM 제거, 잘못된 바이트는 오류)·따옴표·줄바꿈 포함 칸을 지원하고 모든 값은 문자열. 12MB·20,010행(sheetRows)·2만 행/201열 제한 동일. 암호화·ZIP64는 미지원(오류 안내).
- 분석(`src/excel/analyze.js`): 기준본 EX.norm·EX.number·EX.parse·머리글 탐지·EX.autoMap·EX.analyze를 그대로 옮겼다(재정의 없음 확인).
- 기준본 일치: `tools/excel-diff.mjs`가 기준본 페이지의 SheetJS로 가상 통합 문서를 만들어 `fixtures/excel/`에 저장(공유 문자열·인라인 문자열·CSV·오류 칸·빈 행·중복·규격 충돌 등)하고, 같은 바이트의 기준본 결과(행렬·머리글 행·매핑·분석)를 기록한다. 재구축 X1 6사례 완전 일치.
- 범위: 이번 단계는 읽기·매핑·검증 화면까지. 배치 생성·건물 코드·기존 랙 매칭·적용(EX.generate/proposal/apply, 60·70·90·92 래퍼)은 Phase 5b.


## D-018 Excel 배치안·적용 트랜잭션 (2026-11-15, Phase 5b)
- 배치안(`src/excel/proposal.js`): 기준본 40 EX.generate → 60·70 EX.proposal 래퍼(건물+로케이션 키, 규격 재가져오기 정책, 누락 랙 표시/유지/승인 삭제) → 90 W.base(보호 랙·구조물 유지)까지 한 함수 `buildProposal`로 펼쳤다. 설정 읽기(`readExcelConfig`)는 40·70·90 EX.config 검사를 합쳤다.
- 적용(`src/excel/apply.js`): `captureTarget`(70 R.capture + 75 objectColors + 80 zoneNames + 90 autoPlacement), `backupTarget`(R.backup: 같은 사유·내용 연속 백업 재사용, 6개·3.2MB 순환), `runTransaction`(R.transaction: 복사본에서만 변경, 다른 편집안 변경·참조 공유·검증 실패 시 입력 프로젝트 그대로 반환), `applyExcelProposal`(EX.apply 본문 + 90 자동 배치 설정·이력 40개).
- 저장·실행취소는 세션(`session.apply`)이 맡는다. 기준본은 저장(V.write) 실패도 전체 취소했지만, 재구축 세션은 편집을 메모리에 유지하고 저장 실패 상태를 표시하며 저장소는 직전 정상본을 보존한다(D-010과 같은 방식). 실행취소로 적용 전 상태로 돌아갈 수 있다.
- 후보: Phase 5b는 기준본 후보 0번 '기존 배치 규칙'(W.base 결과)만 적용한다. 기준본은 후보 0번이 모두 내부·정상이 아니면 대안 후보(W.pack 행 재구성·방향 반전·열 재구성·면적 순·회전)를 자동 선택하므로, 이 경우 결과가 다를 수 있다 → Phase 6에서 W.pack·W.build·후보 비교표를 이식한다. 자동 배치 방식 선택 칸도 Phase 6(현재 'inside' 고정).
- 승인 후보=적용 후보: 기준본 W.proof 대신 미리보기를 만든 프로젝트 객체와 적용 시점 프로젝트가 같은지 확인한다(세션 프로젝트는 변경 시 새 객체). 다르면 다시 계산하고 재확인을 요구한다. 설정을 바꾸면 경고 확인 체크가 풀린다.
- 기준본 일치: `tools/excel-diff.mjs`가 기준본 페이지에서 W.base 결과를 실제 70 EX.apply(wApply)와 90 R.transaction으로 적용(화면 확인·후보 일치 검사만 대체)한 프로젝트를 기록한다. 자동 배치 이력 지문은 객체 ID를 포함하므로 "적용 배치의 검사 지문과 같은가"만 비교한다. X2 8사례 일치.
- 매핑 요약 복사: 실제 업무 파일 확인을 위해 시트·머리글 이름·열 위치·건수·문제 유형만 복사한다(품목·로케이션 등 셀 값 제외).

## D-019 랙·ZONE 라벨과 글자 폭 측정 (2026-11-15, Phase 5c-1)
- `src/cad/labels.js`: 기준본 80 Q.parts·V.fullLabel·V.labels(실효 정의, 75:108은 덮어써져 미사용)와 75 fits·V.shortCode·V.textColor를 옮겼다. 라벨은 객체 뒤·오버레이 앞에 그린다. 표시 설정 변경과 ZONE 표시 이름은 기준본 V.appearanceEdit처럼 실행취소에 기록한다.
- 글자 폭: 기준본은 canvas measureText로 라벨 맞춤·외부 배치를 정한다. 브라우저에서는 같은 방식(같은 글꼴 지정)을 쓴다. Node 검사에는 canvas가 없으므로 `tools/label-metrics.mjs`가 Chrome에서 잰 글자 폭·글자 쌍 보정 표(`tests/golden/label-metrics.js`)를 `setFallbackMeasure`로 주입한다. 표는 검사 전용이며 배포본에 넣지 않는다(배포본 증가분 약 13KB는 코드만).
- 한계: 실제 화면의 라벨 맞춤은 사용자 PC 글꼴(Segoe UI·맑은 고딕 유무)에 따라 달라진다(기준본과 같은 성질). 대조 자료는 이 Linux Chrome 글꼴 기준이며, 글꼴이 다른 환경에서 기준 자료를 다시 만들면 표도 함께 다시 만든다.
- 기준본 대조: `tools/label-diff.mjs`가 기준본 scene()의 g.v-labels·Q.parts·V.fullLabel을 기록한다. 기준본에는 이 기능의 자동 검사가 없었으므로 L1이 첫 자동 검사다.

## D-020 색 표시 모드·사용자 지정 색 (2026-11-15, Phase 5c-2)
- `src/warehouse/appearance.js`: 기준본 40 EX.height·EX.value·EX.state·EX.color, 75 V.fill(래퍼)·applyColors·V.resetColors·객체 지정색을 옮겼다. 랙 채움색과 라벨 글자색은 같은 `rackColor`를 쓴다.
- 기준본과 다르던 재구축 동작 2건을 고쳤다: 범례의 높이 집계 안내가 정책별 문구가 아니었음, 통로 경고 색이 사용자 지정 색보다 우선했음(기준본은 지정색 우선).
- 화면: 기준본의 색 설정 입력(shell.html:21)·표시 모드·높이 정책·색 모드 선택은 왼쪽 패널 "색상" 구역에, 기본 색 복원은 대화상자 대신 같은 구역의 범위 선택+버튼으로 두었다(전체 복원 확인 문구는 기준본 그대로). 변경은 모두 검증 후 실행취소에 기록하고, 실패하면 이전 값을 유지하며 '색상·표시 설정 취소: <사유>'를 표시한다.
- 미이식: UI 색 직접 입력(vThemeFields·customColors·프리셋)과 복원 미리보기 → Phase 9.
- 기준본 대조: `tools/color-diff.mjs`가 기준본에서 실제 화면 조작(선택 상자·입력·버튼·실행취소)으로 상태를 만들고 도형 채움색·라벨·범례·설정·실행취소 단계 수·거부 안내를 기록한다. 기준본에는 이 기능의 자동 검사가 없었다.

## D-021 자동 배치 후보(내부·순서·통로 방식) (2026-11-15, Phase 6a)
- `src/autolayout/candidates.js`: 기준본 90 W.changed·W.moved·W.orderLoss·W.score·W.compare·W.candidate·W.fits·W.pack·W.build를 옮겼다. 열 우선(column) 방식은 92가 W.fits·W.scan·W.base·W.pack·W.build를 대체하므로 Phase 6c.
- 결정성: 기준본 W.pack은 원래 시간 상한 없이 객체당 probe 6000개로 탐색을 끊는다. 그대로 `PROBE_LIMIT`로 두었다.
- 후보: '기존 배치 규칙'(W.base) + 행 재구성·진행 방향 반전·열 재구성·면적 순(+회전 허용 시 90° 회전). 후보 0이 모두 내부 정상이면 0, 아니면 1부터 방식별 점수(사전식)가 가장 좋은 후보. Excel 적용은 선택 후보 배치와 이름을 기록한다(D-018의 "후보 0만 적용" 한계 해소).
- 기준본 대조: 가상 다수 랙 통합 문서(`fixtures/excel/synthetic-many.xlsx`, 3열×7랙)를 추가하고 X2에 후보 10사례(좌표·회전·대기열·점수·선택)를 기록했다. 모두 일치.
- 미이식: 후보 비교표·직접 선택·부분 재배치 범위(new/selected/boundary/collision) 화면 → Phase 6b.

## D-022 후보 비교표·직접 선택·재최적화 (2026-11-15, Phase 6b)
- `reoptimize`(candidates.js): 기준본 wOptimize의 계산 부분. 현재 후보를 기준으로 범위(전체·새 랙·선택·경계 초과·충돌) 안 랙만 행·반전·열·면적(·회전) 방식으로 다시 배치하고 점수가 가장 좋은 변형을 새 후보로 추가한다. 안내 문구(개선 여부·경계·충돌·이동 수·창고 면적−랙 면적)는 기준본 그대로.
- 기준본 대조: 기준본 wOptimize 본문(변형 목록·정렬·첫 후보)을 기준본 W.pack·W.candidate·W.compare로 재현해 기록했다(화면 조작 대신). 4사례(선택 없음 오류·개선 안 됨·연쇄 재최적화·병합 위 새 랙만) 일치.
- 화면: 비교표(기준본 W.comparison 열 8개)·후보 라디오 선택(후보 재생성 없이 미리보기 전환)·위반 목록(W.list: 선택 체크·초점 이동·초과 거리·충돌 대상·상태)·범위 선택·재최적화/이전 후보·창고 밖 대기 랙까지 보이는 미리보기 범위. 후보를 바꾸면 경고 확인이 풀린다.
- 미이식: 기준본의 '모든 랙 보기'·'위반 랙 확인' 버튼 → Phase 9.

## D-023 열 우선 최대 수용 배치와 탐색 시간 상한 제거 (2026-11-15, Phase 6c)
- `src/autolayout/column.js`: 기준본 92의 C.*(열 묶음·축·템플릿·오프셋·시작점 탐색·외부 대기열·열 조건 보강 검사·후보 점수)와 W.fits·W.scan·W.signature·W.base·W.build·EX.generate 래퍼, C.optimize 계산을 옮겼다. `buildCandidates`·`baseProposal`이 열 우선 방식을 분기한다. `scanLayout`은 열 우선 배치를 column.js가 등록한 검사로 넘긴다(모듈 순환 참조 방지).
- **결정성(기준본과 다른 점):** 기준본은 후보 생성 1회 공통으로 탐색 횟수 24000과 함께 **시간 상한 1.5초('time-bound')** 로도 탐색을 끊었다. 같은 입력이라도 PC 성능에 따라 결과가 달라질 수 있다. 재구축은 AGENTS.md 결정성 규칙에 따라 탐색 예산(probe 24000·시작점 64·오프셋 12·후보 8)으로만 끊고, 걸린 시간은 표시용으로만 기록한다(지문에서도 제외). 시험 사례는 모두 시간 상한 전에 끝나 기준본과 같다. 대규모 배치에서 기준본이 시간 상한에 걸리는 경우 결과가 다를 수 있다 → 사용자 수용 여부 확인 필요(로드맵 Phase 6 결정 사항).
- 기준본 대조: X2 열 우선 10사례(구조물 있는/빈 창고, 줄바꿈·회전, 열 순서·열별 시작 방향·원점, 북쪽 회전 90°, 저장 배치 위 병합·보호 랙) + 재최적화·외부 재수용. 랙 좌표·회전·대기·대기 사유·보호 여부·열 진단(그룹·실패·탐색 횟수)·참고 후보·선택이 일치.
- 화면: 열 우선 방식·열 줄바꿈, 열 후보 비교표(비교 전용 참고 행 포함), 열별 수용표, 외부 재수용, 안전하지 않은 후보는 적용 차단(기준본 문구). 기준본의 미수용 상세(C.renderMissing)·미리보기 초점 확장은 Phase 9.

## D-024 BEFORE→AFTER 복제·백업 복원·비교 (2026-11-15, Phase 7a)
- `src/warehouse/scenarios.js`: 기준본 70 R.install(+75 객체 색·80 ZONE 이름·90 자동 배치 설정·검토 메모 래퍼), rCloneApply 적용부, R.restore 적용부, R.diff·R.desc·R.diffRows, compareRows(70:49+70:62)를 옮겼다. 복제·복원은 runTransaction(자동 백업·수정 이력·실패 시 전체 취소)과 세션 실행취소를 쓴다.
- 기준본 그대로 유지한 동작(검토 필요 표시): 복제 시 BEFORE 재고 기록이 ID를 유지한 채 AFTER 범위로도 복사된다. 배치 백업 6개·3.2MB 한도는 화면 문구("대상별")와 달리 BEFORE·AFTER 합계에 적용된다. 바꾸려면 사용자 결정 후 별도 PR.
- 기준본 대조: `tools/scenario-diff.mjs`가 기준본에서 실제 rCloneApply·R.restore를 실행(확인 창은 승인)하고 비교표·변경 행·프로젝트 일부를 기록한다. S2 7사례 일치.
- 화면: 복제 대화상자(미리보기·교체/새 버전/취소), 비교 대화상자(지표표·나란히/BEFORE/AFTER/겹쳐 보기·변경 표시·변경 목록·CSV/JSON 내려받기), 가져오기 이력·배치 백업 복원 대화상자. 비교 대화상자는 열린 채 실행취소하면 다시 그리지 않는다(다시 열면 갱신).
