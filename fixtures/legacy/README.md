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
