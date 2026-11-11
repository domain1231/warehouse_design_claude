# 개발명세서 요약

원본: 「Warehouse Layout Designer 최신 v2.4.1 기반 신규 완전 재구축 통합 개발명세서」 Greenfield Development Specification v1.0 (2026-11-11). 원본 전문은 claude.ai 프로젝트 「창고 레이아웃 다자이너」 문서에 있다. 저장소 반입 시 이 파일 옆에 `SPEC_v1_0.md`로 둔다.

## 우선순위
데이터 무결성 → 기존 기능 재현 → 공간계산 정확성 → Excel 로케이션 일관성 → 저장·복구 안정성 → 사용 편의성 → 성능 → 유지보수성 → 배포 파일 최적화 → AI 토큰 효율.

## 금지
기존 기능 임의 삭제, 호환 확인 없는 스키마 변경, 랙 규격·좌표 임의 수정, 안전 충돌 검증 우회, BEFORE/AFTER 참조 공유, 재고기록 임의 생성·삭제, 미검증 상태의 성공 표시, 저장 실패 무시, 테스트 없는 정식 Release, 불필요한 프레임워크.

## 기준본 수치 (유지 대상)
- 창고 치수 1~500m, 입력 0.1m / 객체 정밀도 0.001m / 스냅 0.001~2m 9단계
- Excel: 12MB, 20,000행, 201열, 20개 필드 매핑, 8행 머리글 기본 후보
- 열 우선 탐색: 기본 4후보(줄바꿈 시 8), 24,000 probe 공유 (시간 상한은 D-005 참조)
- 외부 대기 좌표: 회전 외곽 포함 -1000~1000m, 초과 시 적용 차단
- 백업: 전체 최근 3개/압축 3.2MB, 대상별 최근 6개/JSON 3.2MB
- 경고 유형: BOUNDARY, RACK_COLLISION, STRUCTURE_COLLISION, WALL_CLEARANCE, RACK_GAP, COLUMN_GAP, AISLE_MIN_WIDTH, AISLE_TARGET, EXTERNAL_WAITING
- 필수 테스트 ID: CAD01–12, GEO01–10, XL01–14, AL01–14, SV01–12, UI01–10 (명세 33장)

## 완료 판정
명세 39장 25개 조건. 단, 21번(GPT-6.1 SOL 상한)은 `docs/MODEL_POLICY.md`로 대체한다.
17번(일반·난독화 HTML) 중 난독화 HTML과 명세 29.3의 난독화 Release 자산은 사용자가 요청할 때만 작성·검증한다(2026-11-11 사용자 지시).
