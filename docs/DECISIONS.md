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

