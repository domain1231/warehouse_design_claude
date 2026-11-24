# fixtures/excel

가상 통합 문서(SYNTHETIC). 실제 업무 Excel이 아니다. `tools/excel-diff.mjs`가 기준본 v2.4.1 페이지의 SheetJS로 `tests/golden/excel-cases.js`의 표를 써서 만든다. 사례를 바꾸면 기준본에서 다시 생성한다.

`synthetic-summary.xlsx`(SYNTHETIC)는 위 SheetJS 생성 목록이 아니라 `node tools/make-synthetic-summary.cjs`로 만든다(C7 Excel Summary 대조 시험용: F4·G4가 행 계산과 다름, 'Buffer Rack'·자재높이 > 단 높이 행, 표 밖 1행).
- `sample-inventory.csv`·`sample-inventory.xlsx`: 기준본 `tools/generate-fixtures.cjs`가 만든 가상 재고 목록(56랙·343위치, 'SYNTHETIC TEST ONLY'). Golden G3에서 사용.
