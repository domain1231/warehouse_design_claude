REG=[('①','저장·백업 버튼',(485,18,1093,37),'프로젝트 저장 · 이전 버전·백업 · 저장소 관리 · 취소/다시 · JSON 백업 · 불러오기 · 프로그램 정보 · 사용 안내'),
('②','저장 확인 줄',(0,75,1600,28),'마지막 확인 저장 시각. 이 PC·브라우저 저장이라는 안내 · 오른쪽 「지표 접기」'),
('③','지표 바',(0,135,1600,110),'전체 창고 면적 · 현재 랙 수 · 면적 사용률 · 통로 비중 · 보관 불가 구역 비중 · 보관 가능 잔여 비중 · 최소 통로 폭 · 공간 경고 (8칸)'),
('④','상태 줄',(0,245,1600,50),'경계 내부·초과, 충돌, 구조물, 통로, 간격, 대기 건수 · 「모든 랙 보기」 · 「위반 목록」'),
('⑤','설계 도구 (왼쪽)',(18,295,245,1019),'정밀 배치 설정, 선택·통로·화면, 보호 통로 설정, 01 프로젝트·공간, 02 배치 도구, Excel, 색상'),
('⑥','배치 전환',(263,300,1041,72),'BEFORE 보기 · AFTER 편집 · BEFORE → AFTER 복제 · BEFORE 잠금 · 가져오기 이력'),
('⑦','표시 설정',(263,378,1041,60),'랙 텍스트 · 색상 표시 · ZONE·번호 배치 · 랙 번호 형식'),
('⑧','화면 조작',(263,445,1041,95),'패널 접기/펼치기 · 편집 배치 · 비교 · 확대/축소 · 전체 보기 · 선택 확대'),
('⑨','도면',(263,542,1041,674),'클릭해서 놓고, 골라서 끌어 옮기는 곳. 원점은 창고 왼쪽 위'),
('⑩','범례',(263,1216,1041,41),'색이 뜻하는 구간 (예: 실제 재고 적재율)'),
('⑪','선택 객체 도구',(263,1257,1041,57),'↻ 90° · 복제 · 삭제 · SVG/PNG 내보내기 · 인쇄'),
('⑫','선택 정보 (오른쪽)',(1304,295,278,1019),'고른 객체의 번호·좌표·크기·회전 입력 · 아래 「공간 지표」(평균 용적률·빈 랙·저활용 랙·공간 구성 등)')]
FOCUS={'⑤','⑨','⑫'}
MW,MH=1600,1330
hs=''.join(f'<a class="hs" href="#c1-1" title="{n} {t}" style="left:{x/MW*100:.2f}%;top:{y/MH*100:.2f}%;width:{w/MW*100:.2f}%;height:{h/MH*100:.2f}%"><b>{n}</b></a>' for n,t,(x,y,w,h),d in REG)
MAP=f'<div class="map"><img src="{img("c1_map",1600)}" alt="메인 화면 지도">{hs}</div><figcaption>그림 1-1 · 메인 화면 지도 (첨부 도면 참고 샘플을 연 상태)</figcaption>'
MAP_ROWS=''.join(f'<tr class="{"focus" if n in FOCUS else ""}"><td>{n}</td><td>{t}</td><td>{d}</td></tr>' for n,t,_,d in REG)
ci='<rect x="80" y="40" width="500" height="300" fill="#152231" stroke="#9fb6d6" stroke-width="2"/>'
ci+='<circle cx="80" cy="40" r="6" fill="#ffc83c"/><text x="70" y="28" font-size="13" fill="#333" text-anchor="end">원점 (0, 0)</text>'
ci+='<line x1="80" y1="370" x2="590" y2="370" stroke="#3b6fb6" stroke-width="2" marker-end="url(#ah)"/><text x="600" y="374" font-size="14" fill="#173a6b" font-weight="600">X → 오른쪽</text>'
ci+='<line x1="40" y1="40" x2="40" y2="345" stroke="#2f8a5b" stroke-width="2" marker-end="url(#ah)"/><text x="12" y="372" font-size="14" fill="#164a31" font-weight="600">Y ↓ 아래</text>'
ci+='<rect x="230" y="90" width="60" height="25" fill="#7a8396" stroke="#c4ddff" stroke-width="2"/><text x="260" y="107" font-size="11.5" fill="#fff" text-anchor="middle">R-02</text>'
ci+='<circle cx="230" cy="90" r="5" fill="#ffc83c"/>'
ci+='<line x1="80" y1="90" x2="226" y2="90" stroke="#ffc83c" stroke-dasharray="4 3"/><text x="155" y="84" font-size="12.5" fill="#ffc83c" text-anchor="middle">X = 3m</text>'
ci+='<line x1="230" y1="40" x2="230" y2="86" stroke="#ffc83c" stroke-dasharray="4 3"/><text x="236" y="68" font-size="12.5" fill="#ffc83c">Y = 1m</text>'
ci+='<text x="260" y="134" font-size="12" fill="#cfd9e6" text-anchor="middle">폭 1.2m · 깊이 0.5m</text>'
ci+='<text x="330" y="210" font-size="13" fill="#cfd9e6" text-anchor="middle">기준점 = 랙의 왼쪽 위 모서리 (회전 전)</text>'
COORD=svg(720,395,ci,'그림 1-6 · 좌표 읽기 — 창고 왼쪽 위가 0, 랙은 자기 왼쪽 위 모서리로 위치를 잡습니다')
c1=open('@@W@@/scripts/course1.html',encoding='utf-8').read()
c1=c1.replace('{{MAP}}',MAP).replace('{{MAP_ROWS}}',MAP_ROWS).replace('{{COORD}}',COORD)
for n in ['c1_room_input','c1_s_room','c1_door_reject','c1_tools','c1_s_racks','c1_s_right','c1_s_xy','c1_s_dragging','c1_s_header','c1_bg_before','c1_bg_after','c1_bg_panel','c1_zones']:
    c1=c1.replace('{{'+n+'}}',img(n,1600 if n=='c1_s_header' else 1300))
body=body.replace('<!-- ================= COURSE 2 ================= -->',c1+'\n<!-- ================= COURSE 2 ================= -->')
OLD2='  <div class="toc-col">\n    <div class="toc-h">코스 2 · Excel로 자동 배치</div>'
TOC1=('  <div class="toc-col">\n    <div class="toc-h">코스 1 · 첫 창고 만들기</div>\n'
 '    <a href="#c1-1">1-1 화면 지도</a><a href="#c1-2">1-2 빈 프로젝트</a><a href="#c1-3">1-3 창고 크기</a><a href="#c1-4">1-4 출입문·기둥</a><a href="#c1-5">1-5 랙 3개</a><a href="#c1-6">1-6 숫자로 위치 맞추기</a><a href="#c1-7">1-7 옮기기·되돌리기</a><a href="#c1-8">1-8 저장 확인</a><a href="#c1-9">1-9 참고 도면·축척</a><a href="#c1-10">1-10 구역·거리 재기</a><a href="#c1-11">1-11 내보내기·인쇄</a><a href="#c1-x">확인·흔한 실수</a>\n  </div>\n')
assert OLD2 in body
body=body.replace(OLD2,TOC1+OLD2,1)
body=body.replace('처음 쓰는 사람을 위한 2개 코스','처음 쓰는 사람을 위한 3개 코스')
body=body.replace('코스 0 · 시작 전 10분 (데이터 지키기·옮기기) &nbsp;|&nbsp; 코스 2 · Excel로 자동 배치','코스 0 · 시작 전 10분 &nbsp;|&nbsp; 코스 1 · 첫 창고 만들기 &nbsp;|&nbsp; 코스 2 · Excel로 자동 배치')
body=body.replace('사용자 설명서 v2.0 초안(코스 0·2)','사용자 설명서 v2.0 초안(코스 0·1·2)')
