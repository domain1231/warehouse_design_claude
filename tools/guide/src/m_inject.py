sc=box(20,16,300,40,'결정할 수 있는 것','','g')+box(360,16,300,40,'이 도구로 결정할 수 없는 것','','r')
L=['배치안 비교 (평균 용적률·저활용 랙·Δ 지도)','설정한 통로 폭·경계·충돌 위반 여부','Excel 로케이션 순서대로의 배치 가능성','필요 공간·부족 길이 (예: 0.6m 부족)']
R=['실제 설치 승인 (실측 필요)','하중·내진·법규 적합성','피난 경로·지게차 회전 안전','"더 넣을 수 있다"는 확정 (미판정)']
for i,(a,c) in enumerate(zip(L,R)):
    y=74+i*30
    sc+=f'<text x="34" y="{y}" font-size="13.5" fill="#164a31">✔ {a}</text><text x="374" y="{y}" font-size="13.5" fill="#6e1c14">✖ {c}</text>'
SVG_SCOPE=svg(680,180,sc,'그림 M-1 · 이 도구가 답하는 질문과 답하지 않는 질문')
mt=''
items=[('면적 사용률','랙 바닥 면적','총면적',0.09,'#3b6fb6'),('용적률 (높이 활용률)','자재 높이','선반 단 높이',0.57,'#2f8a5b'),('실제 재고 적재율','현재 수량','최대 수량',0.72,'#c57a14')]
for i,(t,num,den,v,c) in enumerate(items):
    y=22+i*62
    mt+=f'<text x="20" y="{y+20}" font-size="14" font-weight="600" fill="#1d2430">{t}</text>'
    mt+=f'<rect x="200" y="{y+4}" width="400" height="24" rx="5" fill="#f1f3f6" stroke="#c9ced6"/><rect x="200" y="{y+4}" width="{400*v:.0f}" height="24" rx="5" fill="{c}" opacity=".85"/>'
    mt+=f'<text x="200" y="{y+46}" font-size="12.5" fill="#555">{num} ÷ {den}</text><text x="610" y="{y+21}" font-size="13" fill="#555">예 {int(v*100)}%</text>'
SVG_METRIC=svg(680,205,mt,'그림 M-4 · 분모가 다르면 같은 %라도 다른 이야기입니다 (예시 수치)')
mg=open('@@W@@/scripts/mgr.html',encoding='utf-8').read()
mg=mg.replace('{{SVG_SCOPE}}',SVG_SCOPE).replace('{{SVG_METRIC}}',SVG_METRIC).replace('{{c4_cmp_top}}',img('c4n_map',1100))
dc_end=mg.index('<!-- ================= MANAGER PART')
front=mg[:dc_end]; mpart=mg[dc_end:]
body=body.replace('</header>','</header>\n'+front,1)
body=body.replace('<nav class="toc">',mpart+'\n<nav class="toc">',1) if False else body
# place manager part right after TOC, before course 0
body=body.replace('<!-- ================= COURSE 0 ================= -->',mpart+'\n<!-- ================= COURSE 0 ================= -->',1)
edu=open('@@W@@/scripts/edu.html',encoding='utf-8').read()
_i=body.index('<article id="ax-4"'); _j=body.index('</article>',_i)+len('</article>')
body=body[:_j]+'\n'+edu+body[_j:]
TOCM=('<nav class="toc">\n  <div class="toc-col tm">\n    <div class="toc-h">관리자 편</div>\n'
 '    <a href="#m1">M-1 본부장 한 장 요약</a><a href="#m2">M-2 검토 체크리스트</a><a href="#m3">M-3 표준 보고서 양식</a><a href="#m4">M-4 지표 정의</a><a href="#m5">M-5 운영 책임표</a>\n  </div>\n')
body=body.replace('<nav class="toc">\n',TOCM,1)
body=body.replace('<a href="#ax-4">A-4 한 장 요약</a>','<a href="#ax-4">A-4 한 장 요약</a><a href="#ax-5">A-5 교육 운영안</a><a href="#ax-6">A-6 화면 문구 색인</a>',1)
body=body.replace('처음 쓰는 사람을 위한 6개 코스','처음 쓰는 사람을 위한 6개 코스 + 관리자 편')
body=body.replace('<h2>용어 · 단축키 · 버튼 색인 · 한 장 요약</h2>','<h2>용어 · 단축키 · 버튼 색인 · 한 장 요약 · 교육 운영안 · 화면 문구 색인</h2>')
