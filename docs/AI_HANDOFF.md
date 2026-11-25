# AI 인수인계

## 현재 상태 (2026-11-15)
- 단계: Phase 5c(라벨·색 표시) 완료. PR `feature/phase5c2-colors`(기준: main). PR #1~#26은 main에 병합됨.
- 앱 2.5.0-alpha.13 / 스키마 2.3.6.
- 검사: 단위 108 + Golden 286(todo 2: G3·G4) + 빌드 + 오프라인 검증 + E2E 65. Linux, Node 24, Chrome 153에서 PASS.

### 2026-11-25 정밀 입력 전체 취소 칸 표시(D-076, #105) · fix/aisle-input-revert-feedback
- `revertedFieldMessage`(commands.js), main.js `editField`→`markReverted`, styles `.field-reverted`. 공간 검증(`r.spatial`) 취소일 때만.
- 로컬: unit(신규 1) · golden · build · verify, e2e edit(D-076 신규·속성 입력·드래그 이동)·ux-improvements·group-panel·details·ui-parity PASS.
- 설명서(tools/guide) 3장 경고 상자·A-6 문구는 이 변경이 들어간 alpha가 나오면 새 토스트 문구로 갱신.

### 2026-11-25 사용자 설명서 촬영·빌드 파이프라인 이관(#107) · docs/guide-pipeline
- `tools/guide/run.py --work <폴더> --app dist/…html`: 촬영(capture) → 빌드 → 검증(문구 대조·기능·실습 파일 불러오기) → PDF·사용자용 판. 경로는 토큰(@@W@@·@@CHROME@@)으로 두고 실행 시 치환. 교육용 가상 Excel은 `fixtures/guide/`.
- 앱 소스·검사 변경 없음. 설명서 관련 이슈: #105(통로 숫자 입력 순서에 따른 전체 취소), #106(백업 시각 UTC 표시).
- 보완(같은 PR): release 단계(배포 이름·사용자용 PDF), 문구 검증 4단계(DOM·앱 소스·촬영 로그·unverified), c1 촬영의 남은 경고 토스트 숨김, 재촬영으로 바뀐 캡션 숫자 4곳 정정.
- 다음: alpha가 바뀌면 run.py 재실행 → `out/log_*.txt`의 ERR와 verify13 unverified 확인 → 숫자 든 캡션을 그림과 대조 → 바뀐 절만 본문 수정. 확정판은 v2.5.0 기능 동결 이후.

### 2026-11-24 Track C C9 BE/AF 면적 기준 통일(D-075) · feature/c9-area-basis (C8 위에 쌓음)
- `compareBasis`·`compareBasisText`·`compareSpace`(space.js), `setReferenceArea`(scenarios.js), 검증기 `scenarioMeta[k].referenceArea`. purposeCompare·scenarioDelta가 비교 기준 사용.
- 로컬: unit 249, golden 298, build·verify, e2e compare-basis(신규)·compare-purpose·compare-delta·compare-change-list·ui-parity·excel-summary-compare·scenarios PASS.
- Track C C8~C10 완료. 다음: #101→#102→#103 순서 병합 후 alpha.13 여부 결정, Phase 11-5(사용자 확인)·Phase 12.

### 2026-11-24 Track C C8 공간 구성 5분해 + M12·M13(D-074) · feature/c8-composition-storage (C10 위에 쌓음)
- M7 5분해(composition.emptyRack), M12 storable, M13 shelfFree(`shelfFreeVolume`). 비교표 9행, 막대 빈 랙 빗금(`.seg-empty`).
- 로컬: unit 246, golden 298, build·verify, e2e compare-purpose·compare-delta·compare-change-list·ui-parity PASS. 706호 6.8%→12.9% 예시 파일 없음(NOT RUN).
- 다음: C9(BE/AF 면적 기준 통일).

### 2026-11-24 Track C C10 빈 랙 처리 규칙(D-073) · feature/c10-empty-racks
- M3 빈 랙(R = 0) 제외, M4 빈 로케이션(품목코드 없음) 제외(품목코드 열 없으면 미적용), Δ 지도 '비움(이전 완료)'·범례·변화 목록 필터, C7 대조는 F4 AVERAGEIF 감지 + 빈 랙·로케이션 안내.
- GT-EMPTY 가상 데이터셋(`tests/unit/helpers/space-synthetic.js` syntheticEmpty, 430행·빈 랙 12): 84.81% · 33 / 343 · 빈 랙 12 · 빈 랙 면적 9.5064㎡ · 악화 0.
- 로컬: unit 242, golden 298, build·verify, e2e compare-change-list·compare-delta·compare-purpose·excel-summary-compare·ui-parity PASS. 운영 JSON BEFORE 값 불변 확인(로컬).
- 다음: C8(공간 구성 5분해 + M12·M13) → C9(BE/AF 면적 기준 통일).

### 2026-11-24 방향키 화면 이동 — 중심 고정 상태에서 동작 안 함 수정 · fix/keyboard-pan-center-lock
- 원인: 새 도면 기본 viewport가 centerLocked=true인데 키 이동이 고정 상태면 건너뜀(E2E는 고정을 먼저 풀어 놓쳐서 통과). 수정: 마우스 끌기와 같이 고정을 풀고 이동. 회귀 E2E 추가(수정 전 실패 확인).

### 2026-11-24 방향키 화면 이동 방향 수정 · fix/keyboard-pan-direction
- 사용자 지적(↑ 누르면 도면이 아래로): 도면 내용이 누른 방향으로 움직이게 변경(선택 객체 미세 이동과 같은 방향감). D-071 보완 기록, 중심 고정은 마우스 끌기처럼 풀고 이동(문서 정정).

### 2026-11-24 영역 선택 '모든 객체'(D-072) · feature/marquee-all
- #mSelectRule에 intersect-all·contain-all 추가(기본 랙만). 혼합 선택: 이동·삭제 전체, 회전·복제·그룹 편집 랙만, 삭제 확인문 종류별 개수.
- UI parity 간극 24 → 25. 로컬: unit 234, golden 298, build·verify, e2e marquee-all 외 9파일 PASS.
### 2026-11-24 방향키 화면 이동·대각선(D-071) · feature/keyboard-pan
- 선택 없음: 방향키 화면 이동(Shift 3배, 대각선, 누르는 동안 연속), 멈출 때 viewport 1회 저장. 선택 있음: 기존 미세 이동 + 두 키 동시 대각선 한 명령.
- `src/cad/keypan.js`(heldVector·panDelta·isArrow). 실제 키보드·터치패드 NOT RUN.
- 로컬: unit 236, golden 298, build·verify, e2e keyboard-pan·edit·ui-parity·plan·left-tools 20 PASS.

### 2026-11-24 Excel 업데이트·병합 사용자 수정값 보존(D-070) · feature/update-keep-user-fields
- 사용자 승인. 일치한 기존 랙을 바탕으로 Excel 유래 값(연결·선반·자재·원본 규격·정책상 설계 규격·위치)만 덮어씀. 블록·종류·사용자 속성·메모·용량·수량·단위 보존. 'new' 방식·위치 정책·규격 정책 불변. provenance는 위치 출처를 따라감(유지=기존, 재배치=자동 배치).
- 기준본 대비 의도적 차이(기준본은 일부 필드를 기본값으로 되돌림). Golden 차이 없음.
- 로컬: unit 226, golden 298, build·verify, e2e 4파일 12 PASS.

### 2026-11-24 Phase 11-4 독립 검토 — 저장·세션 수정 · fix/storage-review
- 독립 검토 지적 재현·수정: ① 손상 저장본 교체가 QUOTA로 한 번 실패하면 이후 영구 저장 불가(같은 손상 원문의 보호 사본이면 재사용) ② 저장 중 들어온 편집이 SAVED로 가려짐(보낸 프로젝트와 같을 때만 saved) ③ 실패한 저장의 백업 되돌리기가 백업을 지움(저장 실패 시 되돌리지 않음, 교체 취소는 링이 그대로일 때만) ④ 손상 백업 링이 큰 편집을 영구 차단(':quarantine' 키로 격리 후 새 링) ⑤ BEFORE 잠금 중 BEFORE를 바꾸는 실행취소/다시실행 허용(기준본 R.step 규칙·문구 이식).
- 기록만: 전체 교체 실패 시 그 사이 화면 보기 변경 유실(영향 작음).
- 재현 검사 tests/unit/persistence-review.test.js(7, 수정 전 실패 확인). session-backups 기대값 갱신(실패 저장 후 백업 1개 유지).
- 로컬: unit 225, golden 298, build·verify, e2e storage·storage2·history·scenarios·json-import-abort 18 PASS.
### 2026-11-24 Phase 11-4 독립 검토 — 자동 배치·Excel 적용 수정 · fix/placement-review
- 독립 검토(별도 맥락) 지적 9건 중 재현·수정 3건: 고정 열 장애물 회피가 위치 유지 랙(keep·잠금·수동 유지)까지 밀던 문제(유지 랙은 겹침 장애물로 취급, 열 밀림 전파 차단), placementMeta 없는 예전 랙 TypeError, 경계 초과 열 중복 기록.
- 기준본과 동일해 유지: 업데이트 시 일부 사용자 필드 기본값 복귀, 유지 랙 사후 검증 없음, BEFORE 잠금 UI 전용 확인, rackDiff 중복 키, 유지 시 좌상단 기준 — 사용자 결정 대기.
- 로컬: unit 221, golden 298, build·verify, e2e 4파일 12 PASS.
### 2026-11-24 Phase 11-3 성능·메모리 · perf/phase11-measure
- v2.4.1 대비(2회 중 좋은 값, Linux Chrome): 500랙 선택 524→44ms, 끌기 183→46, 확대 324→34, 저장 506→339, heap 11.8→7.3MB / 1000랙 선택 1367→95, 저장 1353→768. 56랙 편집 1회 저장만 82→~98ms(+15ms, 쓰기 후 읽기 검증 고정 비용 추정).
- 실행취소 메모리(500랙): 재구축 7.3→20.5MB(200편집) 후 정체(600편집 18MB, 상한 60개·차분 저장) / v2.4.1 11.9→112MB.
- 문서 docs/perf/2026-11-24-phase11.md. 페이지 오류 0.
- 다음: 11-4 저장·자동 배치 독립 검토.

### 2026-11-24 Phase 11-2 기능 동등성 판정 · test/phase11-parity
- docs/FEATURE_PARITY_MATRIX.md: F-001~F-041 VERIFIED(41/41), F-042 모바일 DEFERRED. 행마다 검사 파일 명시, 상태값 정리.
- 보충 검사: original-spec(F-017), storage2 진단(F-031), smoke 버전 분리(F-036), offline-walk 외부 요청 0·오류 0(F-038), probe-budget 탐색 한도(F-040). src 변경·버그 없음.
- 다음: 11-3 성능·메모리(0~1000랙, 실행취소 누적), 11-4 저장·자동 배치 독립 검토.
### 2026-11-24 Phase 11-1 Golden 마무리 · test/phase11-golden
- G3(Excel 분석, CSV·XLSX 2건)·G4(자동 배치 10건: inside·order·aisle·column nowrap/wrap, 30×20·10×10)를 기준본 Golden Master와 정확히 비교 — 차이 0. `pending.test.js` 삭제, golden todo 0(298 PASS).
- fixture: `fixtures/excel/sample-inventory.*`(기준본 생성 가상 자료).
- 다음: 11-2 기능 동등성 매트릭스 VERIFIED 판정.

### 2026-11-24 랙 선택 성능 — 공간 지표 메모 · perf/select-memo
- panels.js 단일 슬롯 메모(배치 객체 동일성 + 값 의존성). 500랙 선택 중앙값 약 52ms(수정 전 55~65, Track C 전 45), 라벨 전환 약 200ms.
- 검사: unit 209, golden 286, build·verify, e2e 11파일 17 PASS(새 space-memo: 선택 3회 재계산 0, 삭제·실행취소·다시실행 후 값 갱신).
### 2026-11-24 C7 보완 — Summary 시트 80% 미만 대조(D-069) · feature/summary-low80
- `readLowLocations`(src/excel/analyze.js), 대조 상자 행 '80% 미만 로케이션 (Summary 시트)'. 가상 fixture에 Summary 시트 추가.
- 로컬: unit 211, golden 286, build·verify, e2e 4파일 11 PASS. 전체 E2E는 CI.

### 2026-11-24 최적화·디버그 4 · chore/optimize-debug-4
- 성능: 500랙 랙 선택 106 → 55~65ms(alpha.9 45), 라벨 전환 301 → 207~237ms. 원인 면적 합집합 LRU 캐시 thrash, `AREA_CACHE_MAX` 16 → 64. `docs/perf/2026-11-24-trackc.md`.
- 실데이터 스모크(운영 JSON 11/02 + 업무 Excel, 로컬·미커밋): 페이지 오류 0, NaN/undefined 표시 0, 저장·재열기 유지. 발견 1건 수정 — AFTER가 빈 배치일 때 비교표가 통로 비중 100% 등으로 표시 → '배치 없음', Δ 범례 'AFTER 배치가 없어 Δ를 계산할 수 없습니다.'
- 확인: 통로 종류 기준 적용 시 '하한' 외 경고 증가분은 같은 적용이 목표 폭(1.2m)도 덮어써서 생긴 '유효 폭 … / 목표 … 미달'(기준본 동작, 정상).
- 로컬: unit 209, golden 286, build·verify, e2e 6파일 PASS. 전체 E2E는 CI.

### 2026-11-24 Track C · C7 Excel Summary 대조(D-068) · feature/excel-summary-c7
- Excel 미리보기에 Summary(F4·D4·E4·G4·H4) vs 앱 계산 대조, 원인 자동 감지(용적률 수식 분모 열·형식 밖·자재>단·표 범위 밖·직접 입력·단 높이 0), 차이 행 CSV. 적용 시 sourceInfo.excelSummary 저장.
- 로컬 실데이터: 202호BE만 불일치(용적률 수식이 MAX Stock으로 나눔 193행). 나머지 일치.
- 로컬: unit 206, golden 286, build·verify, e2e 4파일 11 PASS. 전체 E2E는 CI.
- Track C(C1~C7) 완료. 다음 후보: alpha.11 버전 PR·Draft, Summary 시트 80% 미만 블록 대조, Phase 계속.

### 2026-11-24 Track C · C6 벽 이격 수정(D-067) · 검사 절차 간소화(D-066) · feature/wallgap-c6
- #prWallGap 모든 배치에서 활성, `wallGapOf`·`setWallGap`(src/warehouse/placement-rules.js). 직접 그린 배치는 layout.wallGap만 변경.
- D-066: PR 전 로컬은 단위·골든·빌드·검증 + 관련 E2E, 전체 E2E는 CI. Codex 리뷰 절차 제외.
- 로컬: unit 199, golden 286, build·verify, e2e(placement-rules·wallgap-edit·ui-parity·collapse) 5 PASS. 전체 E2E는 CI.
- 다음: C7 Excel Summary 동기화 확인 화면.

### 2026-11-24 Track C · C5 통로 기준 검증(D-065) · feature/aisle-target-c5
- 기준 = max(통로 최소 폭, 통로 종류 기준(왼쪽에서 사용자 수정)). 주통로 기준 < 1.0m 설정 경고(고정 하한, 화면 목록만, 골든 불변). 최소 통로 폭 칸 경고 색. 1.2/1.0은 참고 권장값.
- `AISLE_STANDARDS`·`aisleStandard`·`aisleSettingIssues`(src/warehouse/aisles.js), spaceMetrics `aisleBelowStandard`.
- 검사: pnpm check PASS(PR 본문 수치). Windows Edge NOT RUN.
- 다음: C6 벽 이격(D-054로 대부분 완료 — 남은 범위 확인) / C7 Excel Summary 동기화 확인.

### 2026-11-24 Track C · C4 랙 변화 목록(D-064) · feature/rack-change-list-c4
- 좌표 표 → ΔR 정렬 목록(필터 개선/악화/변화 없음/기타, 정렬 Δ·악화·코드), '랙 변화 목록 CSV' 추가. 기준본 '랙 변경 CSV' 유지.
- `rackChangeList`·`changeListCsvRows`(src/metrics/delta.js). UI parity 간극 23 → 24.
- 검사: pnpm check PASS(PR 본문 수치). Windows Edge NOT RUN.
- 다음: C5 통로 기준 검증 / C6 벽 이격 설정(D-054로 일부 완료, 남은 범위 확인) / C7 Excel Summary 동기화 확인.

### 2026-11-24 Track C · C3 Δ 지도 모드(D-063) · feature/delta-map-c3
- 비교 대화상자 기본 보기 = Δ 용적률 지도(랙별 ΔR 구간 색, 라벨 Δ%p, 변경은 노랑 점선만). 기존 모드는 보조.
- `rackDeltaMap`·`DELTA_BINS`(src/metrics/delta.js). UI parity 간극 22 → 23.
- 검사: pnpm check PASS(PR 본문 수치). 색약 시뮬레이션 실기 확인·Windows Edge NOT RUN.
- 다음: C4 랙 변화 목록(ΔR 정렬·개선/악화/변화 없음 필터·CSV).

### 2026-11-24 Track C · C2 비교표 재구성(D-062) · feature/compare-c2
- 비교 대화상자 첫 화면: 목적 지표 7행(산식 툴팁) · 공간 구성 누적 막대 · 배치 변경 한 줄 요약(0이면 숨김). 기존 표는 '세부 지표'로 화면 필터만.
- `purposeCompare`(src/metrics/space.js), `layoutChangeSummary`(src/warehouse/scenarios.js). compareRows 불변(골든 S2).
- 검사: pnpm check PASS(아래 PR 본문 수치). Windows Edge·실제 마우스 NOT RUN.
- 다음: C3 Δ 지도 모드(구간 +40/+20~40/+1~20/0/악화, 색약 명도 차 확인).

### 2026-11-24 Track C · C1 2단계 화면 단일화(D-061) · feature/space-metrics-c1b
- 상단·오른쪽 공간 지표를 `src/metrics/space.js`로 연결, ① Excel 방식 기본(면적 사용률·통로 비중), Excel 총면적 `sourceInfo.referenceArea` 저장. `space-kpi.js` 삭제.
- 검사: e2e `kpi-shares`·`kpi-more` 재작성, 단위 `excel-reference-area.test.js`. 로컬: 운영 JSON + 706호BE 업데이트 → 130.5 저장·44.0%·58.4%.
- 다음: C2(비교표 재구성).

### 2026-11-24 Track C · C1 1단계 지표 모듈(D-060) · feature/space-metrics-c1
- `src/metrics/space.js`(M1~M11 순수 함수) + 골든 테스트 `tests/unit/space-golden.test.js`(가상 데이터셋, GT 8건 PASS).
- 로컬: 업무 Excel 706호 Summary 완전 일치, 운영 JSON BEFORE 평균 용적률 = F4. 다른 호실 Summary 차이는 Excel 표 범위 문제로 판단(C7에서 표시).
- 다음: C1 2단계(화면 연결·Excel 총면적 저장·모드 표시) → C2.

### 2026-11-24 추가 공간 지표(D-059) · feature/kpi-more
- 상단 8칸(+잔여 비중·최소 통로 폭), 오른쪽 공간 지표 +5줄(잔여 비중·통로:랙 면적비·최소 통로 폭·BEFORE→AFTER 증감·평균 용적률). '평균 용적률' 용어 채택(업무 Excel 열 이름).
- 사용자 운영 JSON 로컬 확인: 잔여 25.0%·면적비 0.99·최소 통로 0.8m(통로 008)·평균 용적률 60.0%(56/59랙)·AFTER 비어 있음.

### 2026-11-24 상단 지표 통로 비중·보관 불가 비중(D-058) · feature/kpi-aisle-share
- 상단 지표 6칸: 적재율 칸 제외, 통로 비중·보관 불가 구역 비중 추가(공간 지표 면적 ÷ 전체 면적). 사용자 운영 JSON으로 로컬 확인: 통로 36.2%(56.73㎡)·보관 불가 3.0%(4.74㎡).
- e2e `kpi-shares.test.js`.

### 2026-11-23 JSON 불러오기 'The operation was aborted' · fix/json-import-abort
- 사용자 보고(Windows): JSON 불러오기 시 'The operation was aborted'. 코드에 중단(abort) 호출 없음 → 브라우저 파일 읽기(`File.text()`)가 AbortError로 실패한 경우로 판단(클라우드 동기화 온라인 전용 파일·네트워크 드라이브·내려받는 중 파일 등). Linux에서 재현 불가 → NOT RUN(Windows 실기기).
- 수정: 읽기 실패(AbortError/NotReadableError) 시 FileReader로 1회 재시도, 브라우저 오류일 때만 실패 문구에 단계·오류 종류·해결 안내 추가(일반 오류는 기준본 문구 그대로), 파일 선택은 읽은 뒤에 비움.
- 검사: 단위 `json-import-read.test.js`, e2e `json-import-abort.test.js`(브라우저에서 AbortError 주입).

### 2026-11-23 예전 배치의 자동 배치 기준 편집(D-057) · fix/rule-edit-legacy
- 예전 Excel 적용 배치(기록 없음)도 Excel 불러오기 이력이 있으면 기준 입력란 활성, Excel 입력값을 '미적용'으로 표시, 처음 고칠 때 현재 배치에 기록 생성.
- 사용자 운영 JSON(11/02)으로 로컬 확인: BEFORE 59랙·AFTER 모두 입력란 활성(0.6/0.2/0.1/1.2), 페이지 오류 0. 운영 JSON은 커밋하지 않음.

### 2026-11-23 하단 패널 열림 도면 최소 높이(D-056) · fix/canvas-min-bottom-open
- 하단 패널을 열어도 도면 칸 268 → 약 757px(1920×1080), 하단 패널은 도면 아래 원래 높이. 사용자 승인.
- e2e `canvas-bottom-open.test.js` 추가, `history.test.js` 스크롤 보정.
- alpha.6 Draft 본문 수정은 이 세션 권한으로 불가(Release 편집 403). 사용자가 직접 고치거나 alpha.7로 대체.

### 2026-11-23 최적화·디버그 3 · chore/optimize-debug-3
- 점검: 신규 기능(D-054·D-055) 크롤(규칙 편집·BEFORE 잠금·BEFORE/AFTER 전환·실행취소·접기×화면 4종·접은 채 Excel·버튼 48개 일반 크롤) 페이지 오류 0. 미사용 export 없음(테스트 전용만). 성능 `docs/perf/2026-11-23-alpha6.md`.
- 수정: 자동 배치 기준 입력이 거부되면(빈 값·범위·단위·BEFORE 잠금) 입력란을 저장된 값으로 되돌린다(전에는 잘못된 값이 남음). e2e 단언 추가.
- 정정: D-055 '도면 작업 영역 약 165px 커짐' → 위로 올라와 스크롤이 줄어듦(세로 1400px 이상에서만 도면 칸 확대). DECISIONS·릴리스 본문(md) 정정.
- 확인: 하단 패널을 열면 도면 칸 268px(1920×1080)은 v2.4.1과 같음(기준본 동작).

### 2026-11-23 지표 영역 접기(D-055) · feature/collapse-panels
- 상단 지표 영역 접기(한 줄 요약에 랙 수·점유율·경고 수 유지)·오른쪽 공간 지표 접기. `panels.topCollapsed`·`metricsCollapsed` 저장.
- e2e `tests/e2e/collapse.test.js` 추가. UI 차이 20 → 22(승인된 extra). alpha.6 버전 PR #66은 이 기능을 넣기 위해 닫음(사용자 지시).

### 2026-11-23 자동 배치 기준 배치 후 수정(D-054) · feature/rule-edit
- 왼쪽 정밀 배치 설정에 열·랙 간격·벽 이격·통로 목표 입력란 4개(사용자 승인). 랙 위치 불변, 검사 기준만 변경. Excel 대화상자 가로·세로 step 0.001.
- e2e `tests/e2e/placement-rules.test.js` 추가. UI 차이 16 → 20(승인된 extra).

### 2026-11-20 창고 치수 1mm 단위(D-052) · fix/room-mm-input
- 창고 가로·세로·천장 높이 입력 0.1m → 0.001m. golden R1 12.34 사례를 의도적 차이로 기록.
- `pnpm check`: unit 162, golden 286(todo 2), e2e 98 PASS.

### 2026-11-20 샘플 표시 해제·창고 밖 구조물 경고(D-053) · fix/sample-flag-structures
- 창고 재생성·전체 삭제 시 샘플 해제(Excel 대상이 현재 배치로). Excel 미리보기에 창고 밖 유지 구조물 경고(`structuresOutside`).
- D-052(창고 가로·세로 1mm 단위)는 fix/room-mm-input에서 처리.
- `pnpm check`: unit 161, golden 286(todo 2), e2e 98 PASS.

### 2026-11-20 도면 칸 최소 높이(D-051) · fix/canvas-min-height
- alpha.1~3에서 낮은 화면의 도면 칸이 작아지던 문제(1920×890: 674→277px) 수정: 기준본 높이를 최소로, 큰 화면에서만 화면에 맞춤.
- `pnpm check`: unit 158, golden 286(todo 2), e2e 98 PASS.

### 2026-11-20 통로 최대 폭 상한(D-050) · feature/fixed-max-aisle
- '통로 최대 폭(m)' 입력(기본 1.5): 고르게 나눌 때 상한, 남는 공간은 끝 벽 쪽. 자동 추천도 상한 적용 폭으로 비교.
- `pnpm check`: unit 158, golden 286(todo 2), e2e 97 PASS. UI 대조 고정 차이 16건.

### 2026-11-20 최적화·디버그 2차 · chore/optimize-debug-2
- 점검: `pnpm check` 통과, 로케이션 열 고정 설정 576개 조합(북쪽 0/90°, 진행·시작 방향, 축·한 줄 열 수·통로 방식·간격·시작·누락 번호) 화면 순회 → 페이지 오류 0, NaN/undefined 표시 0. 일반 UI 순회 오류 0.
- 정리: 쓰지 않는 1단계 계산 코드(planFixed·gapsFor·planText 등)와 MM_INPUT_MESSAGE 제거, 검사는 evaluateShape로 대체.
- 성능: `unionArea` 최근 결과 기억(16개). 이전 '라벨 전환 500랙 느림'은 서로 다른 방식을 비교한 측정 오류로 정정(docs/perf).
- 안내 추가: 들어가는 형태가 없으면 창고 크기·통로 목표·랙 회전을 확인하라는 문장.
- 발견: '남는 폭을 고르게'는 넓은 창고에서 통로가 지나치게 넓어짐 → D-050으로 해결.
- Squash 병합 전환은 효과 없음 확인(병합 커밋은 이미 GitHub 서명 Verified, Squash도 커밋한 쪽은 GitHub) → 추천에서 제외.
- `pnpm check`: unit 154, golden 286(todo 2), e2e 97 PASS.

### 2026-11-16 로케이션 형식 확장(D-049) · 운영 JSON 왕복 · feature/location-format-ext
- `src/core/location.js`: 숫자로 시작하는 열(2A), 로마 숫자 랙(II=2). 2A 열 프로젝트는 v2.4.1에서 열 수 없음(경고 표시).
- 운영 JSON 2개(v2.3.4 저장본, 사용자 제공·미커밋): 재구축·v2.4.1 모두 열림, 공간 검사 결과 일치, 좌표 변경 0, 재구축 저장본을 v2.4.1에서 다시 열기 성공, 실제 화면 JSON 불러오기 SAVED. (정식 판 확인 목록 2번, Linux Chrome 기준)
- 실제 전체 Excel(12시트, 미커밋): 인식 랙 202호 32, 205호 65, 214호 31, 706호 56, 709호 38.
- `pnpm check`: unit 154, golden 286(todo 2), e2e 97 PASS.

### 2026-11-16 정식 판 확인 목록 · 성능 재측정 · docs/release-checklist-perf
- `docs/RELEASE_CHECKLIST.md`: Windows Edge 실사용·운영 JSON·전체 Excel·백업 복구 수동 확인표(사용자 실행). 자료 필요: 전체 Excel, 운영 JSON.
- `docs/perf/2026-11-16-alpha2.md`: v2.4.1 대비 56·200·500랙 측정. 라벨 방식 전환 500랙만 느림(355→459ms) → 최적화 후보.
### 2026-11-16 구조물 반영 자동 추천(D-048) · feature/fixed-obstacle-aware
- 자동 추천 + 구조물이 있으면 형태별 실제 배치로 비교해 선택(`buildFixedCandidates`). D-047 한계(추천이 구조물 미고려) 해소.
- `pnpm check`: unit 151, golden 286(todo 2), e2e 97 PASS.

### 2026-11-16 장애물 회피(D-047) · feature/fixed-obstacles(#51 위에 쌓음)
- `avoidObstacles`(candidates.js): 생성 랙이 구조물과 겹치면 열 방향으로 밀기. 진단 문구 추가. 화면 요소 추가 없음.
- `pnpm check`: unit 150, golden 286(todo 2), e2e 97 PASS.
- 한계: 형태 추천·최대 통로 계산은 구조물 미고려.

### 2026-11-16 누락 번호 처리(D-046) · feature/fixed-missing-gaps
- '누락 번호' 선택(당겨 붙임 / 빈자리 비워 둠), 진단에 누락 목록 표시. 단위 검사 `tests/unit/fixed-gaps.test.js`.
- `pnpm check`: unit 148, golden 286(todo 2), e2e 97 PASS. UI 대조 고정 차이 15건.
- 다음: 후보 B(장애물 고려 배치).

### 2026-11-16 실제 창고 검토 · 기본값 자동 추천(D-045) · feature/fixed-default-auto
- 사용자 창고 18.44×8.5m, 대차 통로 0.8m, A열 동쪽·01번 북쪽, 장애물 없음. 예시 Excel 56랙: 모든 열 사이 최대 0.70m(0.8m 불가, 52/56), 등 맞댐 1.22m 56/56 → 사용자 안1 선택.
- 기본값을 자동 추천으로 변경. 랙 얇은 선은 장식 선 그대로(앞면 정의 안 함).
- `pnpm check`: unit 146, golden 286(todo 2), e2e 97 PASS.

### 2026-11-16 Release Draft 워크플로(D-044) · chore/release-draft-workflow
- Actions → 'Release Draft' → Run workflow(버전 입력) → 검사 통과 시 Draft pre-release 생성 → 사용자가 확인 후 Publish.
- 본문 원본: `docs/releases/v<버전>.md`(v2.5.0-alpha.1 포함). 세션에서 workflow_dispatch API 호출 가능 여부는 병합 후 확인.

### 2026-11-16 로케이션 열 고정 2단계(D-042) · feature/fixed-layout-stage2
- 설정 추가: 배치 축(열/행/자동 추천), 한 줄 열 수(1/2), 시작 방향(설정대로/지그재그). 계산 `evaluateShape`·`recommend`·`targetsFor`, 생성은 `generateRacks`의 `fixedLayout {axes, rotationOffset, targets}`(열을 목표 위치로 통째 이동).
- 진단: 8가지 형태 최대 통로 표 + 적용 형태. 행 배치 방향 읽는 법 안내.
- v2.4.1 호환 직접 확인(행·한 줄 2열·등 맞댐·지그재그, 24×14): 56랙, 위반 0.
- UI 대조 고정 차이 11 → 14건(#fxAxis·#fxPerLine·#fxStart, 사용자 승인).
- `pnpm check`: unit 146, golden 286(todo 2), e2e 97 PASS(Linux Chrome). NOT RUN: Windows Edge, 실제 마우스·터치패드, 모바일, 실제 업무 Excel.
- 행 배치 방향 이름: D-043(제안 B)로 해결 — feature/row-direction-labels(#46 위에 쌓음).

### 2026-11-16 로케이션 열 고정 배치(D-041) · feature/fixed-column-layout
- Excel 자동 배치 방식 '로케이션 열 고정 · 열·번호 순서 유지' 추가(1단계). 계산 `src/autolayout/fixed-columns.js`, 생성 `generateRacks`의 `columnGaps`·`fixedAlign`, 후보 `buildFixedCandidates`, UI `#fxOptions`(통로 방식·열 사이 간격·진단).
- 저장은 모드 'order' + 확장 필드 fixedColumns(v2.4.1 호환). v2.4.1 HTML의 validateProject로 직접 확인: 56랙, 모드 order, 확장 필드 유지, v2.4.1 scan 위반 0.
- 예시 Excel 18.44×8.5m: 모든 열 사이 0.703m 56/56, 등 맞댐 1.22m 56/56.
- UI 대조 고정 차이 7 → 11건(새 선택 항목·설정 패널, 사용자 승인).
- `pnpm check`: unit 141, golden 286(todo 2), e2e 97 PASS(Linux Chrome). NOT RUN: Windows Edge, 실제 마우스·터치패드, 모바일, 실제 업무 Excel.
- 다음(2단계): 행 배치(한 줄 두 열), 지그재그 시작, 방식 자동 추천.

### 2026-11-16 사용성 개선 6건(D-040) · fix/ux-improvements
- Release v2.5.0-alpha.0 Draft는 세션에서 API 403(Release 생성 불가)이라 사용자가 직접 생성(대상 main 1aa4aa4).
- 변경: 2개 이상 삭제 확인, 하단 패널 닫힘 시 높이 맞춤(3단 화면), JSON 형식 오류 위치 안내, 정밀 입력 문구 통일, 배치 거부 사유·해결 안내, Ctrl+S 결과 알림.
- 검사: `tests/unit/ux-messages.test.js`, `tests/e2e/ux-improvements.test.js`. `details.test.js` 더블클릭 전 '선택 확대' 추가(높이 맞춤으로 배율이 작아져 선택 핸들이 랙 중심을 덮음).
- `pnpm check`: unit 138, golden 286(skip 2), e2e 96 PASS(Linux Chrome). NOT RUN: Windows Edge, 실제 마우스·터치패드, 모바일.
- 다음: 자동 배치 개선안(제안 1~3) 검토·승인 후 진행.

### 2026-11-15 UI 동일성(D-032) · Phase 9b-0
- 사용자 지시: UI 구성·문구·디자인은 v2.4.1과 동일. 감사 결과 `docs/UI_PARITY_AUDIT.md`(PR #29 병합).
- 9b-0: `tools/ui-inventory.mjs`(기준본 UI 목록 생성) → `fixtures/legacy/ui-inventory.json`. 검사 `tests/e2e/ui-parity.test.js`, 고정 차이 `tests/e2e/ui-parity-gaps.json` 707건. 차이가 늘면 실패, 고친 차이를 목록에서 안 지워도 실패(래칫). 갱신: `UPDATE_UI_GAPS=1 node --test tests/e2e/ui-parity.test.js`.
- 다음: 9b-1(헤더·KPI·상태 줄·3단 배치·글꼴·버튼 치수) → 9b-2 … 9b-7. 재구축 화면은 기준본 id·섹션 제목·문구를 그대로 사용한다.
- 독립 검토: 사용자 지시로 Opus. frugal 훅이 격리 Opus 에이전트를 막으므로 현재는 main 세션(Opus)에서 검토한다.
- 성능 비교(tools/perf-compare.mjs, 브랜치 chore/phase11-perf)는 25분 제한에 걸려 결과 없음. 사례 축소 후 재실행 필요.

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

## Phase 5c-2 결과 (2026-11-15, feature/phase5c2-colors)
- `src/warehouse/appearance.js`, 왼쪽 패널 "색상" 구역, 속성 창 지정색(D-020). 대조 `tests/golden/L2-colors.test.js` 14, E2E `tests/e2e/colors.test.js` 4.
- 모델 배분: 기준본 추출 Haiku, 대조 사례·판정 Opus, 구현·E2E Sonnet(재시도 없음).
- NOT RUN: Windows Edge, 실제 마우스.

## Phase 6a 결과 (2026-11-15, feature/phase6a-candidates, PR #17 위에 쌓음)
- `src/autolayout/candidates.js`(D-021), Excel 대화상자 배치 방식·회전 허용·선택 후보 표시·적용. 대조 X2 19(후보 10사례 추가), E2E excel 3.
- 모델 배분: 알고리즘 이식·기준본 대조 Opus, 화면 연결·E2E Sonnet.

## Phase 6b 결과 (2026-11-15, feature/phase6b-comparison)
- `reoptimize`·`candidateSummary`(D-022), Excel 대화상자 비교표·후보 선택·위반 목록·재최적화. 대조 X2 20(재최적화 4사례 추가), E2E excel 4.
- 모델 배분: 재최적화 계산·기준본 대조 Opus, 화면·E2E Sonnet.
- NOT RUN: Windows Edge, 390px 화면에서 비교표 가로 스크롤 실측.

## Phase 6c 결과 (2026-11-15, feature/phase6c-column, PR #19 위에 쌓음)
- `src/autolayout/column.js`(D-023), Excel 대화상자 열 우선 방식·열 후보 비교·열별 수용표·외부 재수용·적용 차단. 대조 X2 30(열 우선 10사례 추가), E2E excel 5.
- 결정 확정(2026-11-15): 탐색 시간 상한 제거 수용, 복제 시 재고 기록 복사 유지, 백업 한도 문구를 BEFORE·AFTER 합계로 수정.
- NOT RUN: 500랙 규모 탐색(기준본 시간 상한 도달 여부), Windows Edge.

## Phase 7a 결과 (2026-11-15, feature/phase7-scenarios)
- `src/warehouse/scenarios.js`(D-024), `src/ui/scenario-dialogs.js`. 대조 `tests/golden/S2-scenarios.test.js` 8, E2E `tests/e2e/scenarios.test.js` 3.
- 모델 배분: 계산 이식·기준본 대조 Opus, 화면·E2E Sonnet.

## Phase 7b 결과 (2026-11-15, feature/phase7b-history, PR #22 위에 쌓음)
- 과거 날짜 조회(D-025): records.js 조회 함수, 왼쪽 패널 "과거 조회", 읽기 전용 차단, 배치 기록 '조회'. 대조 `tests/golden/H1-history.test.js` 8, E2E `tests/e2e/history.test.js` 2.

## Phase 8 결과 (2026-11-15, feature/phase8-backups, PR #23 위에 쌓음)
- `src/persistence/backups.js`, 세션 백업 연결·replaceProject·recoveryText, `src/ui/storage-dialogs.js`(D-026). 단위 backups 5 + session-backups 5, E2E storage2 5.
- 원격의 `feature/phase8-storage`는 폐기된 이전 브랜치(강제 푸시 금지로 새 이름 사용). 삭제는 사용자 판단.

## 매트릭스 감사·잔여 기능 (2026-11-15, chore/matrix-audit)
- D-030: F-010 거리 표시(Q1), F-020 UI 색·복원 미리보기, F-041 검사 결과 재계산. 42개 중 40개 구현, F-042 보류, 나머지 0.

## 출시 준비 (2026-11-15, chore/release-prep)
- D-031: `pnpm golden:refresh`(확인 모드)·`golden:write`, `tools/legacy-json-compat.mjs`(v2.4.1 JSON 불러오기 PASS), docs/MIGRATION.md. 실사용 시험판 v2.5.0-alpha.0(main ad45ae0) 사용자 전달.

### 2026-11-16 Phase 9b-3~9b-7 자동 진행 결과
- PR(쌓인 순서대로 병합 필요): #33 9b-3 다중 랙 편집 패널·인스펙터 → #34 9b-4 위반 목록·Ctrl+S → #35 9b-5 하단 패널(D-034) → #36 9b-6a 정보·안내·비교 SVG/PNG·첨부 도면·도면 흔들림 수정(D-035, D-036) → #37 9b-6b Excel 대화상자 안전 확인·4방향 → #38 9b-7 남은 대화상자 id·문구.
- UI 차이 고정 목록 376 → 9건. 남은 9건 처리안은 docs/UI_PARITY_AUDIT.md '남은 차이 9건과 처리안'.
- PR #33~#38 병합 완료(2026-11-16, 사용자 승인, 쌓인 브랜치라 병합 커밋 방식). D-037(사용자 결정): 덮어쓰기·손상 저장본 교체 버튼을 기준본 흐름으로 통합, 매핑 요약 복사 삭제, 손상 원본 보존 키(:protected-original). 남은 UI 차이 6건(버전 2 + 모바일 4).
- 검사 도우미: tests/e2e/helpers.js waitPlanStable(끌기 전 도면 위치 안정 대기).

### 2026-11-16 코드 최적화·디버그 (chore/optimize-debug)
- 디버그: UI 전체 순회(모든 버튼·대화상자·선택 상태·Excel 4방식·잘못된 JSON·키보드) 런타임 오류 0건. 수정: 세션 편집 확정 직렬화(백업 대기 중 동시 편집 잃어버린 갱신, 재현 검사 session-concurrency), 과거 조회 중 배치이력 복원 확인 순서, 미사용 상수 정리.
- 성능(v2.4.1 대비 이미 1.5~3배 빠름): 랙 툴팁 문구 캐시, 공간 경고 쌍 검사 sort-and-sweep(기존 전수 비교와 200개 무작위 배치에서 결과·순서 동일), 끌기 렌더 프레임당 1회. 500랙 끌기 71→38ms/이동, 1000랙 121→64ms. 측정 도구·원자료: 작업 폴더 perf(커밋 안 함).
- 남은 성능 여지: 저장 주기(압축·검증), 1000랙 선택, renderPlan 문자열 조립(증분 렌더는 위험도 커서 보류).

## 다음 작업
- Phase 9a 완료(D-029, feature/phase9a-room-reference). 남은 Phase 9b(선택): 미뤄 둔 UI(색 직접 입력·미수용 상세·모든 랙 보기·첨부 도면 사용). 모바일(F-042)은 정책상 보류.
- Phase 11: 기준본 전수 비교·500랙 성능·고위험 영역 독립 검토.
- Phase 10 완료(D-028, feature/phase10-exports). 남음: 배포 패키지(ZIP·SHA256)는 Phase 12와 함께.
- Phase 9로 미룬 것: UI 색 직접 입력·프리셋, 복원 미리보기.
- Phase 6: 자동 배치 후보(W.pack 5종·W.build·비교표·후보 선택), 열 우선 생성(92).
- 사용자 확인 필요: 실제 업무 Excel을 로컬 빌드로 열고 '매핑 요약 복사' 결과(값 제외)로 매핑 확인.

## 미결 사항
- 명세서 원본 전문(`docs/SPEC_v1_0.md`) 반입 여부.
- 최종 Release 위치 — Phase 12(D-001).

## NOT RUN
- Windows Edge, 실제 마우스·터치패드, 모바일 실기기.
