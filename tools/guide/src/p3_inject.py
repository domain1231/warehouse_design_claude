import gzip as _gz3, base64 as _b3
# ---- A-7 exam into appendix
ex=open('@@W@@/scripts/exam.html',encoding='utf-8').read().replace('{{DL_XLSX}}',DL('교육용_창고데이터.xlsx'))
_i=body.index('<article id="ax-6"'); _j=body.index('</article>',_i)+len('</article>')
body=body[:_j]+'\n'+ex+body[_j:]
body=body.replace('<a href="#ax-6">A-6 화면 문구 색인</a>','<a href="#ax-6">A-6 화면 문구 색인</a><a href="#ax-7">A-7 실기 평가</a>',1)
body=body.replace('교육 운영안 · 화면 문구 색인</h2>','교육 운영안 · 화면 문구 색인 · 실기 평가</h2>',1)
body=body.replace('<td>본부장</td><td>보고 · 5분</td>','<td>본부장</td><td>보고 · 5분</td>',1)
body=body.replace('<h4>수료 확인 퀴즈 (답은 눌러서 확인)</h4>','<h4>수료 확인 퀴즈 (답은 눌러서 확인) · 실기는 <a href="#ax-7">A-7</a></h4>',1)
# ---- alpha badges
ALPHA={'c2-4':'화면 제목에 「Excel 자동 배치 · v2.3.6」이 남아 있음','c2-5':'이번 버전에서 새로 생긴 기능','c3-1':'패널 이름에 「v2.3.6 / 선택 · 통로 · 화면」이 남아 있음','c3-3':'패널 이름에 「정밀 배치 설정 · v2.3.6」이 남아 있음',
       'c4-4':'비교 창은 alpha.14에서 다시 크게 바뀜 · 정식판 전 또 바뀔 수 있음','c6-1':'「실측 위치 (미지원)」','c6-2':'상단 수량 지표 칸이 alpha.13부터 빠짐 · 「위치 등록 현황」 세부 계산은 확인 전'}
for aid,why in ALPHA.items():
    _s=body.index(f'<article id="{aid}"'); _h=body.index('</h3>',_s)
    body=body[:_h]+f' <span class="alpha" title="v2.5.0-alpha.14 기준 · 이후 버전에서 바뀔 수 있음">시험 버전 · {why}</span>'+body[_h:]
body=body.replace('<div><span class="hw-k">빨간 테두리 <b class="hw-dot">1</b></span><span>그림에서 누를 곳과 순서</span></div>',
 '<div><span class="hw-k">빨간 테두리 <b class="hw-dot">1</b></span><span>그림에서 누를 곳과 순서</span></div><div><span class="hw-k"><span class="alpha">시험 버전</span></span><span>지금 버전(alpha)에서만 그런 부분 · 바뀌면 먼저 고칠 곳</span></div>',1)
body=body.replace('표기 약속 8가지','표기 약속 9가지',1)
# ---- feedback box per course
FB=('<div class="fb"><b>틀린 곳이나 바뀐 화면을 보셨나요?</b> 문의처 <span class="fill">[기입]</span>로 '
    '① 설명서 버전(v2.2) ② 절 번호(예: {c}) ③ 화면 캡처 ④ 「프로그램 정보」의 버전을 보내 주세요. 확인되면 다음 개정에 반영합니다.</div>')
for cid,ex_ in [('c0','0-3'),('c1','1-4'),('c2','2-5'),('c3','3-4'),('c4','4-4'),('c5','5-4'),('c6','6-2')]:
    _s=body.index(f'<section class="course" id="{cid}">'); _e=body.index('</section>',_s)
    body=body[:_e]+FB.format(c=ex_)+'\n'+body[_e:]
# ---- doc control: revision cycle + known limits
body=body.replace('<tr><td>배포 범위</td><td>사내 한정 · 외부 반출 금지</td><td>문의처</td><td class="fill">[기입]</td></tr>',
 '<tr><td>배포 범위</td><td>사내 한정 · 외부 반출 금지</td><td>문의처</td><td class="fill">[기입]</td></tr>'
 '<tr><td>개정 주기</td><td>프로그램 버전이 바뀔 때마다 · 그 외 분기 1회 점검</td><td>최신본 확인</td><td>「프로그램 정보」의 버전과 이 표의 대상 프로그램이 다르면 최신 설명서를 요청하세요</td></tr>',1)
body=body.replace('<li>실제 운영 JSON·업무 Excel</li></ul>','<li>실제 운영 JSON·업무 Excel</li><li>Firefox·Safari의 저장 방식 (저장 위치 설명은 Chrome 계열에서 확인)</li></ul><p><b>시험 버전에서 알려진 차이</b> — 본문에 <span class="alpha">시험 버전</span> 표시</p><ul><li>화면 일부 제목에 옛 버전 표기 「v2.3.6」이 남아 있음</li><li>백업 시각이 UTC로 표시됨 (한국 시각 +9시간)</li><li>모바일 화면은 이번 버전에서 보류, 「실측 위치」 보기는 미지원</li></ul>',1)
# ---- instructor answer key (separate file, not in main body)
_ins=open('@@W@@/scripts/instructor.html',encoding='utf-8').read().replace('{{exam_answer}}',img('exam_answer',1300))
_raw=open('@@W@@/work/cp/실기_정답예시.json','rb').read()
_ins=_ins.replace('{{DL_ANSWER}}','<a href="#" class="dlf" data-f="gfans">⤓ 실기_정답예시.json</a>')
_ins+=f'<script type="application/octet-stream" id="gfans" data-name="실기_정답예시.json" data-gz="1">{_b3.b64encode(_gz3.compress(_raw,9)).decode()}</script>'
open('@@W@@/work/instructor_section.html','w',encoding='utf-8').write(_ins)
