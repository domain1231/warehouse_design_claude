hp=''
vals=[('1번 선반',50),('2번 선반',63.3),('3번 선반',50)]
for i,(n,v) in enumerate(vals):
    y=20+i*34
    hp+=f'<text x="20" y="{y+16}" font-size="13.5" fill="#333">{n} 최대</text><rect x="110" y="{y+2}" width="300" height="20" rx="4" fill="#f1f3f6" stroke="#c9ced6"/><rect x="110" y="{y+2}" width="{300*v/100:.0f}" height="20" rx="4" fill="#2f8a5b" opacity=".8"/><text x="420" y="{y+17}" font-size="13" fill="#333">{v}%</text>'
hp+=box(470,14,200,34,'단순평균 ≈ 54%','','b')+box(470,58,200,34,'가중평균 (선반 높이로)','','p')+box(470,102,200,34,'최대값 = 63.3%','','o')
SVG_HPOL=svg(690,150,hp,'그림 6-4 · 교육용 7F-A-1 · 선반 값 세 개를 랙 값 하나로 묶는 세 가지 방법')
c6=open('@@W@@/scripts/course6.html',encoding='utf-8').read().replace('{{SVG_HPOL}}',SVG_HPOL)
for n in ['c6_detail','c6_qty_colors','c6_viz_height','c6_zone','c6_theme','c6_inv_panel','c6_layout_panel']:
    c6=c6.replace('{{'+n+'}}',img(n,1600 if n=='c6_kpi_qty' else 1300))
_k=body.index('<!-- ================= APPENDIX')
body=body[:_k]+c6+'\n'+body[_k:]
TOC6=('  <div class="toc-col">\n    <div class="toc-h">코스 6 · 자재와 재고 보기</div>\n'
 '    <a href="#c6-1">6-1 선반별 자재</a><a href="#c6-2">6-2 재고 수량과 색</a><a href="#c6-3">6-3 랙 텍스트·ZONE 이름</a><a href="#c6-4">6-4 높이 집계 정책</a><a href="#c6-5">6-5 색상 설정·복원</a><a href="#c6-6">6-6 날짜별 기록·과거 조회</a><a href="#c6-x">확인·흔한 실수</a>\n  </div>\n')
_t=body.index('<div class="toc-h">부록'); _t=body.rindex('  <div class="toc-col">',0,_t)
body=body[:_t]+TOC6+body[_t:]
body=body.replace('처음 쓰는 사람을 위한 6개 코스','처음 쓰는 사람을 위한 7개 코스')

body=body.replace('코스 5 · 지키기·문제 해결 &nbsp;|&nbsp; 부록','코스 5 · 지키기·문제 해결 &nbsp;|&nbsp; 코스 6 · 자재와 재고 &nbsp;|&nbsp; 부록')
