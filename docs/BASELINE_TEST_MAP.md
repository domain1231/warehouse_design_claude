# 기준본 검사 → 기능 매핑

- 대상: 기준본 `domain1231/warehouse_design` v2.4.1 main의 브라우저 검사 14개 묶음(기대값 786). 정적 읽기로 분류했으며 `?`는 판단 기반 매핑이다.
- 묶음 약칭: core(92), acc=acceptance-v236(53), parity(49), prot=protection(16), xa=excel-apply-001(66), zoom(110), zcg=zoom-context-guards(11), wheel=wheel-frame(128), wc=wall-clearance(42), xc=excel-cross-building(51), cl=column-layout(62), sq=storage-quota(36), rm=room-apply(40), ru=release-ui(30).
- 재구축 기능을 구현할 때 해당 행의 기준본 검사가 확인하는 동작을 새 검사로 재현한다(검사 코드 복사가 아니라 동작 재현, 명세 32.2).

## 역색인

| F-ID | 기준본 검사 (묶음:케이스) |
|---|---|
| F-001 | core:실행 ?; prot:보호 상태 ?; ru:About 후 스키마 ? |
| F-002 | core:그룹 이동·Undo, 그룹 충돌, 정렬 미리보기; rm:RM20 |
| F-003 | rm:RM01–RM20 |
| F-004 | core:다각형 통로 생성; acc:T04 |
| F-005 | core:다각형 통로 생성 |
| F-006 | core:그룹 이동·Undo(T03,T16), 그룹 충돌(T04), 그룹 편집(T23–T24), 모바일 터치(T27); prot:드래그 잠금 |
| F-007 | acc:T07, T10; core:T13; cl:CL19 |
| F-008 | **없음** |
| F-009 | core:선택(T01–T02), 정렬(T05–T08), 일렬·간격(T09–T12), 로케이션 순서 ?, 정렬 미리보기, 확대 영역 선택 |
| F-010 | acc:T10, T28; xa:E21–E28; rm:RM12 |
| F-011 | core:T17–T18, 중심·크기·좌표, 핀치; acc:T04, T22; zcg 전체; zoom 전체; wheel W01–W45 대부분 |
| F-012 | **없음** |
| F-013 | core:T04, 회전 선택, 통로 오목·자기교차 ?; wc:SC06–SC07; cl:CL20–CL21 |
| F-014 | core:공간 부족; wc:SC01–SC05, SC08, SC10–SC11; cl:CL10–CL12, CL15–CL17, CL20–CL21; xa:E01–E02, E21–E28 ?, E30 ? |
| F-015 | core:경고 허용, 통로(T14), 통로 침범(T15); acc:T12, T20; xa:E01–E04; cl:CL15–CL18; rm:RM14 |
| F-016 | acc:T12 ?, T21 ?, T26 ?; wc:SC08–SC09, SC12 ?; cl:CL18, CL20–CL21, CL30 |
| F-017 | xa:E39; sq:ST02; cl:CL06, CL29; parity:규격 보존 ? |
| F-018 | wheel:W24 (모달 휠 격리만) |
| F-019 | **없음** |
| F-020 | **없음** |
| F-021 | core:엑셀 343, T23–T24; acc:T06, T27; parity:수량 null·재료 링크, 56랙 적용; xa:E05, E38–E39, REIMPORT, SOURCE_CHANGED; sq:ST02; xc:XC11, XC14 |
| F-022 | xc:XC01–XC08, XC15; cl:CL25–CL26 |
| F-023 | acc:T13–T14, T24, T26, T30 ?; parity:JSON 복원·경고 스냅샷; prot:권한 승인; xa:E06–E14, E17–E18, E29, E31, FINAL_CANCEL, SOURCE_CHANGED, MOBILE; xc:XC14–XC15; cl:CL18, CL23; wc:SC11; wheel:W23 |
| F-024 | acc:T07–T08, T16–T17, T19; parity:후보 5개·56랙·후보 동등; prot:범위 불변·보호 상태; xa:E05, E10; cl:CL22, CL30; wc:SC10 |
| F-025 | acc:T18; cl:CL01–CL09, CL19, CL30(UI); xa:E04 |
| F-026 | acc:T09, T12, T17, T22, T26–T27; parity:외부 인스펙터·대기 라벨; prot 대부분; cl:CL02–CL03, CL10–CL14, CL29; xc:XC02, XC06 |
| F-027 | core:전후 비교; acc:T23–T25; parity:BEFORE 불변·내보내기; xa:E15–E16, E32, E36, LOCK_OFF; sq:ST10–ST12, ST14; rm:RM02–RM03, RM05, RM17; xc:XC09–XC10; cl:CL23–CL24 |
| F-028 | xa:E16, E19–E20, E34–E35, ROLLBACK_MEMORY, FINAL_CANCEL; sq:ST02, ST09–ST12, ST14; cl:CL28 |
| F-029 | core:JSON·자동저장; parity:저장 확인; acc:T26, T29; sq:ST01, ST03, ST07–ST08, ST18; rm:RM16, RM19; xa:E36; wc:SC12 ? |
| F-030 | xa:E19, E34–E35, E40; sq:ST02–ST06, ST13–ST14; rm:RM16 |
| F-031 | sq:ST08–ST09, ST15–ST17 |
| F-032 | core:T26; acc:T26, T05 ?; parity:JSON 복원·내보내기; xa:E33; sq:ST06, ST17; zoom:Z28; wheel:W43–W44; cl:CL27; xc:XC12–XC13; rm:RM15 |
| F-033 | core:전후 비교 SVG·PNG |
| F-034 | rm:RM06–RM07; xa:E37, E40; sq:ST13; wheel:W45; xc:XC11 |
| F-035 | core:패널 접기(T19–T22), 모바일 레이아웃; acc:T01–T05, T29; parity:패널 접힘; xa:MOBILE; wheel:W01–W02, W10, W17–W22, W25, W36–W37 |
| F-036 | ru:버전·About |
| F-037 | 기준본 PR #21 `multi-tab.test.cjs` MT01–MT09 (main 병합 전) |
| F-038 | 횡단: 모든 묶음의 외부 요청 0·런타임 오류 0 검사 |
| F-039 | zoom:Z06–Z10, Z09 감도 저장 오류 |
| F-040 | cl:CL22 탐색 예산·사유 문구 |
| F-041 | cl:CL27 파생 검사 결과 재계산 |
| F-042 | core:모바일 레이아웃; acc:T29; xa:MOBILE; xc:XC16 |

## 기준본 자동 검사가 없는 기능
F-008(8방향 크기 조절), F-012(참고 도면·두 점 축척), F-019(ZONE·랙 번호 라벨), F-020(색상 범례·3종 지표)은 기준본에 자동 검사가 없다. 재구축 때 명세 33장 테스트(CAD05, CAD12, UI09, UI10)를 새로 작성하고, 기준본 동작은 화면 확인으로 대조한다. F-018은 모달 휠 격리만 검사되며 표시 내용 검사는 없다.

## 분류 시 관찰된 사항
- acceptance-v236은 매니페스트 기대값 53이지만 정적으로 센 검증 호출은 50개다. 실행 시 반복·조건부 호출로 53이 되는지 Phase 11 이전에 기준본 실행 로그로 확인한다.
- zoom-tests의 Z07·Z08은 케이스 목록 상수에는 있지만 실제 검증 호출에서는 발견되지 않았다.
- "배포본 동등성"(parity 일부, 대부분 묶음의 일반·배포 이중 실행)은 기능이 아니므로 행으로 만들지 않았다. 사용자 지시에 따라 재구축본은 요청 시에만 난독화본을 만든다.
