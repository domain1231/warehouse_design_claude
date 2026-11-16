# 기준본 저장 형식 고정 자료

기준본 v2.4.1 일반본에서 내장 샘플 프로젝트(이름만 `SYNTHETIC legacy fixture`로 변경)를 저장해 받은 **가상 데이터**입니다.

| 파일 | 내용 |
|---|---|
| v2.4.1-primary.txt | 기준본 localStorage `warehouse-studio-v1` 저장 원문 (`warehouse-backup-zip-v1` 압축 형식) |
| v2.4.1-primary.project.json | 기준본 `V.unpack`으로 풀어낸 프로젝트 JSON (스키마 2.3.6) |

- 재구축본 `src/persistence/zip.js`는 원문을 이 JSON과 바이트 동일하게 복원해야 합니다(`tests/unit/zip.test.js`).
- 반대 방향(재구축본 원문을 기준본이 읽는지)은 `tools/legacy-compat.mjs`로 확인합니다(기준본 저장소 필요).
- `plan-cases.json`: 도면 보기 대조(카메라 사례, 객체 도형). `tools/plan-diff.mjs`로 기준본 일반본에서 생성. 입력 배치는 `v2.4.1-primary.project.json`(가상 자료).
- `edit-cases.json`: 편집 명령 대조(바뀐 객체·명령 기록·규격 이력). `tools/edit-diff.mjs`로 기준본 일반본에서 생성. 입력 배치는 `v2.4.1-primary.project.json`(가상 자료).
- `excel-cases.json`: Excel 읽기·분석 대조. 입력 바이트는 `fixtures/excel/`(가상 통합 문서, `tools/excel-diff.mjs`가 기준본 SheetJS로 생성).

## 일괄 재생성

`BASELINE_REPO=<기준본 경로> WAREHOUSE_BROWSER_PATH=<chrome> pnpm golden:refresh`가 위 `*-diff.mjs` 도구를 모두 순서대로 실행하고 `tests/golden`을 재검증한 뒤 `git diff --stat fixtures/`로 바뀐 자료를 보여줍니다. 기본은 확인 모드(대조 통과 시 재생성 자료를 되돌림, 커밋하지 않은 자료 변경이 있으면 시작 전 중단)이고, 기준본이 바뀌어 새로 기록할 때만 `pnpm golden:write`로 실행한 뒤 차이를 확인하고 커밋합니다.
