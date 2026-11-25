ly=box(30,14,250,58,'① 자동 저장','편집할 때마다 · 이 브라우저','b')
ly+=box(30,86,250,58,'② 자동 백업','이전 버전 3개 · 대상별 6개','p')
ly+=box(30,158,250,58,'③ JSON 백업 파일','내가 받아 둔 파일 · PC 밖 보관 가능','g')
ly+='<rect x="300" y="10" width="380" height="140" rx="10" fill="none" stroke="#8a8a85" stroke-dasharray="5 4"/><text x="490" y="140" font-size="12.5" fill="#555" text-anchor="middle">이 PC·이 브라우저 안 (지우면 사라짐)</text>'
ly+='<text x="320" y="48" font-size="13.5" fill="#173a6b">「● 모든 변경사항 저장됨 · SAVED」로 확인</text>'
ly+='<text x="320" y="120" font-size="13.5" fill="#2e2670">큰 작업 직전에 프로그램이 스스로 남김</text>'
ly+='<text x="320" y="192" font-size="13.5" fill="#164a31">브라우저·PC가 바뀌어도 남는 유일한 사본</text>'
SVG_LAYERS=svg(700,230,ly,'그림 5-0 · 작업이 보관되는 세 겹')
un=''
steps=[('① Ctrl+Z','방금 한 편집','b'),('② 대상별 백업','BEFORE 또는 AFTER 하나','p'),('③ 이전 버전·백업','프로젝트 전체','o'),('④ JSON 불러오기','파일 시점으로 전체','g')]
for i,(t,s_,c) in enumerate(steps):
    x=10+i*172
    un+=box(x,30,158,60,t,s_,c)
    if i<3: un+=f'<line x1="{x+160}" y1="60" x2="{x+170}" y2="60" stroke="#666" stroke-width="1.3" marker-end="url(#ah)"/>'
un+='<line x1="20" y1="112" x2="680" y2="112" stroke="#c0392b" stroke-width="1.3" marker-end="url(#ah)"/><text x="20" y="132" font-size="12.5" fill="#6e1c14">작은 실수</text><text x="680" y="132" font-size="12.5" fill="#6e1c14" text-anchor="end">큰 사고 · 되돌리는 범위가 커짐</text>'
SVG_UNDO=svg(700,145,un,'그림 5-2 · 작은 것부터 시도하세요')
IDX=[('프로젝트 저장 · JSON 백업 · 불러오기','①','c0-2'),('이전 버전·백업 · 저장소 관리','①','c0-4'),('↶ 취소 · ↷ 다시','①','c1-7'),('프로그램 정보 · 사용 안내','①','c0-1'),
('모든 랙 보기 · 위반 목록','④','c3-6'),('정밀 배치 설정 (스냅·방향키)','⑤ 맨 위','c3-3'),('전체 랙 선택 · 영역 선택 기준','⑤ 선택·통로·화면','c3-1'),
('공간 위반을 경고 후 허용 (기본 차단)','⑤ 선택·통로·화면','c3-5'),('다각형 통로 그리기 · 같은 종류의 통로에 기준 적용','⑤ 보호 통로 설정','c3-4'),('현재 통로 폭 · 충돌 확인','⑤ 보호 통로 설정','c3-6'),
('마우스 휠 확대 감도','⑤ 배치맵 설정','ax-2'),('가져오기 / 자동 배치 설정 (Excel)','⑤ Excel / 로케이션 자동 생성','c2-1'),('가로 X · 세로 Y · 치수 적용','⑤ 01 / 프로젝트 · 공간','c1-3'),
('랙 추가 · 기둥 · 출입문 · 통로 · 거리 측정','⑤ 02 / 배치 도구','c1-4'),('충돌 정책 · 랙 사이 최소 여유','⑤ 03 / 정밀 배치','c3-5'),('빈 프로젝트 · 첨부 도면 참고 샘플','⑤ 아래쪽','c1-2'),
('BEFORE 보기 · AFTER 편집 · BEFORE 잠금','⑥','c4-1'),('BEFORE → AFTER 복제','⑥ · ⑧','c4-2'),('랙 텍스트 · 색상 표시 · ZONE·번호 배치','⑦','c1-1'),
('편집 배치 · 비교 · 전체 보기 · 하단 전체 펼치기','⑧','c4-4'),('↻ 90° · 복제 · 삭제 · SVG · PNG · 인쇄','⑪','c1-7'),('X·Y·폭·깊이·회전 · 최대 수량','⑫','c1-6'),
('다중 랙 편집 패널 (정렬·간격)','⑫ (여러 개 선택 시)','c3-2'),('Excel 가져오기·자동 백업 이력','하단 패널','c5-4')]
IDX_ROWS=''.join(f'<tr><td>{a}</td><td>{b_}</td><td><a href="#{c}">{("코스 "+c[1:]) if c[0]=="c" else ("부록 A-"+c[3:])}</a></td></tr>' for a,b_,c in IDX)
c5=open('@@W@@/scripts/course5.html',encoding='utf-8').read()
c5=c5.replace('{{SVG_LAYERS}}',SVG_LAYERS).replace('{{SVG_UNDO}}',SVG_UNDO).replace('{{IDX_ROWS}}',IDX_ROWS)
for n in ['c5_versions','c5_target_backups']: c5=c5.replace('{{'+n+'}}',img(n,1300))
body=body.replace('<footer>',c5+'\n<footer>',1)
TOC5=('  <div class="toc-col">\n    <div class="toc-h">코스 5 · 지키기·문제 해결</div>\n'
 '    <a href="#c5-1">5-1 JSON 백업</a><a href="#c5-2">5-2 되돌리기 4단계</a><a href="#c5-3">5-3 지우고 되돌리기</a><a href="#c5-4">5-4 AFTER만 되살리기</a><a href="#c5-5">5-5 증상별 처방</a>\n  </div>\n'
 '  <div class="toc-col">\n    <div class="toc-h">부록</div>\n'
 '    <a href="#ax-1">A-1 용어</a><a href="#ax-2">A-2 단축키·마우스</a><a href="#ax-3">A-3 버튼 색인</a><a href="#ax-4">A-4 한 장 요약</a>\n  </div>\n</nav>')
body=body.replace('</nav>',TOC5,1)
body=body.replace('처음 쓰는 사람을 위한 5개 코스','처음 쓰는 사람을 위한 6개 코스')
body=body.replace('코스 4 · 개선안 비교</p>','코스 4 · 개선안 비교 &nbsp;|&nbsp; 코스 5 · 지키기·문제 해결 &nbsp;|&nbsp; 부록</p>')
body=body.replace('사용자 설명서 v2.0 초안(코스 0~4)','사용자 설명서 v2.0 (코스 0~5 · 부록)')
body=body.replace('사용자 설명서 v2.0 초안</div>','사용자 설명서 v2.0</div>')
