mv=''
lanes=[('마우스로 끌기','스냅 간격 따름 (기본 0.01m)','b'),('방향키 / Shift+방향키','0.01m / 0.1m씩','p'),('오른쪽 X·Y 숫자 입력','0.001m까지 · 스냅 제외','g')]
for i,(t,s_,c) in enumerate(lanes):
    y=20+i*70
    mv+=box(30,y,230,54,t,'',c)
    mv+=f'<line x1="262" y1="{y+27}" x2="330" y2="{y+27}" stroke="#666" stroke-width="1.3" marker-end="url(#ah)"/>'
    mv+=box(334,y,300,54,s_,'','n')
SVG_MOVE=svg(670,230,mv,'그림 3-3 · 옮기는 방법 세 가지와 각각이 따르는 단위')
po=box(250,10,220,50,'랙을 옮김 / 놓음','','n')
po+=box(250,90,220,54,'공간 위반이 생기나?','통로·경계·충돌','n')
po+=arr(360,60,360,88)
po+=path('M250 117 L130 117 L130 175')+'<text x="140" y="110" font-size="12.5" fill="#555">기본 (차단)</text>'
po+=path('M470 117 L600 117 L600 175')+'<text x="490" y="110" font-size="12.5" fill="#555">경고 후 허용 켬</text>'
po+=box(20,177,220,58,'이동 전체 취소','화면 아래에 이유 표시','r')
po+=box(490,177,220,58,'이동은 됨 · 위반 기록','빨간 표시 · 위반 목록','o')
po+=arr(600,235,600,262)
po+=box(490,264,220,52,'위반 목록 → 옮겨서 해결','','g')
SVG_POLICY=svg(730,330,po,'그림 3-5 · 공간 위반 처리 흐름 — 기본은 미리 막고, 허용을 켜면 기록해서 나중에 해결')
c3=open('@@W@@/scripts/course3.html',encoding='utf-8').read()
c3=c3.replace('{{SVG_MOVE}}',SVG_MOVE).replace('{{SVG_POLICY}}',SVG_POLICY)
for n in ['c3_scatter','c3_boxing','c3_multi_panel','c3_dlg_gap','c3_after_top','c3_after_gap','c3_aisle_right','c3_aisle_set','c3_poly_drawing','c3_poly_done','c3_aisle_rule','c3_violation','c3_status','c3_vlist','c3_validate']:
    c3=c3.replace('{{'+n+'}}',img(n,1600 if n=='c3_status' else 1300))
body=body.replace('<!-- ================= COURSE 2 ================= -->','<!-- ================= COURSE 2 ================= -->',1)
# place course 3 after course 2 (before footer)
body=body.replace('<footer>',c3+'\n<footer>',1)
TOC3=('  <div class="toc-col">\n    <div class="toc-h">코스 3 · 다듬기</div>\n'
 '    <a href="#c3-1">3-1 여러 개 고르기</a><a href="#c3-2">3-2 줄·간격 맞추기</a><a href="#c3-3">3-3 정확히 옮기기</a><a href="#c3-4">3-4 보호 통로</a><a href="#c3-5">3-5 위반이 생기는 방식</a><a href="#c3-6">3-6 위반 없애기</a><a href="#c3-x">확인·흔한 실수</a>\n  </div>\n</nav>')
body=body.replace('</nav>',TOC3,1)
body=body.replace('처음 쓰는 사람을 위한 3개 코스','처음 쓰는 사람을 위한 4개 코스')
body=body.replace('코스 2 · Excel로 자동 배치</p>','코스 2 · Excel로 자동 배치 &nbsp;|&nbsp; 코스 3 · 다듬기</p>')
body=body.replace('사용자 설명서 v2.0 초안(코스 0·1·2)','사용자 설명서 v2.0 초안(코스 0~3)')
