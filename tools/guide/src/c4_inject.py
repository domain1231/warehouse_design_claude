ba=box(20,20,230,64,'BEFORE · 현재안','기준 · 기본 잠금','p')
ba+=box(450,20,230,64,'AFTER · 개선안','자유롭게 편집','g')
ba+=f'<line x1="252" y1="44" x2="446" y2="44" stroke="#666" stroke-width="1.3" marker-end="url(#ah)"/><text x="349" y="36" font-size="12.5" fill="#555" text-anchor="middle">① BEFORE → AFTER 복제</text>'
ba+='<path d="M135 84 L135 120 L565 120 L565 84" fill="none" stroke="#c57a14" stroke-width="1.3" stroke-dasharray="5 4"/>'
ba+=box(255,104,190,40,'② 비교','','o')
ba+='<text x="135" y="168" font-size="12.5" fill="#555" text-anchor="middle">현재 창고 그대로 · 바꾸지 않음</text><text x="565" y="168" font-size="12.5" fill="#555" text-anchor="middle">정렬·추가·삭제·Excel 적용</text>'
SVG_BA=svg(700,185,ba,'그림 4-0 · BEFORE는 지키고, AFTER에서 바꾸고, 둘을 비교합니다')
cm=''
_L=[('① 결론 문장','좋아진 지표 최대 3개 · ⚠ 주의 줄','p'),('② KPI 카드 4개','평균 용적률·80% 미만·빈 랙·보관 가능','p'),('③ 출처 칩','시트·기준일 · 면적 기준','n'),('④ 목적 지표 표','BE → AF · 차이 ▲▼','b'),('⑤ 공간 구성 막대','구간별 Δ · 노란 강조','n'),('⑥ 세부 지표 · ⑦ 랙 변화 목록','보관 수량 · 랙 하나씩 · 필터','n')]
for _i,(_t,_s,_c) in enumerate(_L):
    _y=10+_i*48; cm+=box(20,_y,400,44,_t,_s,_c)
cm+=box(440,10,250,284,'⑧ Δ 용적률 지도','오른쪽 고정 · 발표 모드 · 열 요약','b')
cm+='<text x="22" y="316" font-size="12" fill="#555">화면 폭 1280px 이상이면 왼쪽(①~⑦)과 오른쪽(⑧) 2단 · 좁으면 위아래로 이어짐 · 표·목록 행을 누르면 ⑧에서 그 랙이 강조</text>'
SVG_CMP=svg(710,328,cm,'그림 4-4 · alpha.14 비교 창의 구성 (넓은 화면 기준)')
c4=open('@@W@@/scripts/course4.html',encoding='utf-8').read().replace('{{SVG_BA}}',SVG_BA).replace('{{SVG_CMP}}',SVG_CMP)
for n in ['c4_bar_locked','c4_bar_unlocked','c4_before','c4_clone_dialog','c4_after_improved','c4n_goals','c4n_map','c4n_list','c4n_compare_full','c4n_head','c4n_present','c4n_linked','c4n_pdf']:
    c4=c4.replace('{{'+n+'}}',img(n,1300))
body=body.replace('<footer>',c4+'\n<footer>',1)
TOC4=('  <div class="toc-col">\n    <div class="toc-h">코스 4 · 개선안 비교</div>\n'
 '    <a href="#c4-1">4-1 BEFORE 만들기</a><a href="#c4-2">4-2 AFTER로 복제</a><a href="#c4-3">4-3 AFTER에서 개선</a><a href="#c4-4">4-4 비교 창 읽기</a><a href="#c4-5">4-5 보고할 때 지킬 것</a><a href="#c4-x">확인·흔한 실수</a>\n  </div>\n</nav>')
body=body.replace('</nav>',TOC4,1)
body=body.replace('처음 쓰는 사람을 위한 4개 코스','처음 쓰는 사람을 위한 5개 코스')
body=body.replace('코스 3 · 다듬기</p>','코스 3 · 다듬기 &nbsp;|&nbsp; 코스 4 · 개선안 비교</p>')
body=body.replace('사용자 설명서 v2.0 초안(코스 0~3)','사용자 설명서 v2.0 초안(코스 0~4)')
