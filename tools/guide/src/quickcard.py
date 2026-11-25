import base64,io
from PIL import Image,ImageDraw,ImageFont
G='@@W@@/shots/g/'
im=Image.open(G+'c1_map.png').convert('RGB'); d=ImageDraw.Draw(im)
try: F=ImageFont.truetype('/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',30)
except: F=ImageFont.load_default()
REG=[('1',(485,18,1093,37)),('2',(0,75,1600,28)),('3',(0,135,1600,81)),('4',(0,216,1600,50)),('5',(18,266,245,640)),('6',(263,266,1041,81)),('7',(263,353,1041,55)),('8',(263,414,1041,99)),('9',(263,513,1041,295)),('10',(263,808,1041,41)),('11',(263,849,1041,57)),('12',(1304,266,278,640))]
for n,(x,y,w,h) in REG:
    d.rectangle([x+2,y+2,x+w-2,y+h-2],outline=(255,200,60),width=4)
    d.ellipse([x+4,y+4,x+44,y+44],fill=(255,200,60)); d.text((x+24,y+24),n,fill=(20,30,45),font=F,anchor='mm')
im=im.resize((800,475),Image.LANCZOS); b=io.BytesIO(); im.save(b,'WEBP',quality=80)
MAP='data:image/webp;base64,'+base64.b64encode(b.getvalue()).decode()
H=f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Warehouse Studio 빠른 카드 · v2.5.0-alpha.13</title><style>.map img{{filter:invert(1) hue-rotate(180deg)}}
@page{{size:A4;margin:9mm}}
*{{box-sizing:border-box}}body{{margin:0;font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#1d2430;font-size:10.2px;line-height:1.38}}
.top{{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #14202f;padding-bottom:4px;margin-bottom:6px}}
.top h1{{margin:0;font-size:17px}}.top span{{font-size:10px;color:#5b6573}}
.g{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}}
.c{{border:1px solid #c9ced6;border-radius:6px;padding:5px 7px;break-inside:avoid}}.c h2{{margin:0 0 3px;font-size:11.5px;background:#14202f;color:#fff;border-radius:4px;padding:1px 6px;display:inline-block}}
.c ol,.c ul{{margin:0;padding-left:15px}}.c li{{margin:1px 0}}
.map{{grid-column:span 2}}.map img{{width:100%;border-radius:4px;display:block}}
.lg{{font-size:9.6px;columns:2;column-gap:10px}}.lg div{{break-inside:avoid}}
b.k{{display:inline-block;border:1px solid #9aa3af;border-bottom-width:2px;border-radius:3px;padding:0 3px;font-size:9.4px;background:#fff}}
.w{{background:#fdecec;border-color:#f2c3bd}}.q{{font-size:9.4px;background:#f1f3f6;border-radius:3px;padding:1px 4px;display:block;margin:2px 0}}
table{{width:100%;border-collapse:collapse}}td{{border-top:1px solid #e3e6eb;padding:1px 3px;vertical-align:top}}
.foot{{margin-top:5px;font-size:9px;color:#5b6573;display:flex;justify-content:space-between}}
</style></head><body>
<div class="top"><h1>Warehouse Studio 빠른 카드</h1><span>프로그램 v2.5.0-alpha.13 · 설명서 v2.0 · 자세한 내용은 「사용자 설명서」의 절 번호 참고</span></div>
<div class="g">
 <div class="c map"><h2>화면 지도</h2><img src="{MAP}" alt="화면 지도"></div>
 <div class="c lg"><h2>칸 이름</h2>
  <div>① 저장·백업 버튼</div><div>② 마지막 확인 저장 시각</div><div>③ 지표 바</div><div>④ 상태 줄·위반 목록</div><div>⑤ 설계 도구</div><div>⑥ BEFORE/AFTER 전환</div><div>⑦ 표시 설정</div><div>⑧ 확대·비교·하단 패널</div><div>⑨ 도면</div><div>⑩ 범례</div><div>⑪ 회전·복제·삭제·내보내기</div><div>⑫ 선택 정보(숫자 입력)</div></div>
 <div class="c"><h2>시작 전 3원칙</h2><ol><li>늘 <b>같은 브라우저</b>로 연다 (폴더·이름은 무관, 0-0)</li><li>상단 <b>● 모든 변경사항 저장됨 · SAVED</b> 확인 (0-2)</li><li>하루 마감·큰 작업 전 <b>「JSON 백업」</b> → 드라이브에 보관 (5-1)</li></ol></div>
 <div class="c"><h2>놓기·고치기</h2><ol><li>⑤ 도구 고르기 → ⑨ 클릭 (<b>클릭점 = 가운데</b>)</li><li>끝나면 「↖ 선택 / 이동」</li><li>⑫ X·Y = <b>왼쪽 위 모서리</b>, 원점 = 창고 왼쪽 위</li><li>방향키 0.01m · <b class="k">Shift</b>+방향키 0.1m</li></ol></div>
 <div class="c"><h2>다듬기</h2><ol><li>빈 곳 끌기 = 여러 개 선택</li><li>⑫ 「위쪽 정렬」·「가로 간격」 → 미리보기 → <b>「그룹 전체에 적용」</b></li><li>「↔ 통로」 → 최소 확보 폭·목표 폭</li><li>④ 「위반 목록」 0건 확인</li></ol></div>
 <div class="c"><h2>Excel 자동 배치 (5칸)</h2><ol><li>대상 <b>AFTER</b> + 「선택한 대상 배치를 확인했습니다.」</li><li>머리글 8행 · <b>20개 필드 중 20개 매핑</b></li><li>창고 치수·북쪽·A열 기준점</li><li>순서 지킴 = 「로케이션 열 고정」 · 축 「자동 추천」</li><li>미리보기 → 「AFTER에 확인 후 적용」</li></ol></div>
 <div class="c"><h2>개선안 비교</h2><ol><li>「BEFORE 보기」 → 「BEFORE 잠금 해제」</li><li><b>치수부터</b> 넣고 현재 랙 입력 → 「BEFORE 잠그기」</li><li>「BEFORE → AFTER 복제」 → 「AFTER · 편집」 확인</li><li>⑧ 「비교」 → 면적 기준 → 목적 지표 → Δ 지도 빨강 빗금 · <b>「비움」은 악화 아님 · 「미확인」은 0 아님</b></li></ol></div>
 <div class="c"><h2>되돌리기 (작은 것부터)</h2><ol><li><b class="k">Ctrl</b>+<b class="k">Z</b> / <b class="k">Ctrl</b>+<b class="k">Y</b></li><li>BEFORE·AFTER 하나만: 하단 「이 상태로 복원」</li><li>전체: ① 「이전 버전·백업」 → 「현재 백업 후 복원」</li><li>파일: ① 「불러오기」</li></ol></div>
 <div class="c"><h2>헷갈리는 지표</h2><table><tr><td><b>면적 사용률</b></td><td>랙 바닥 ÷ 총면적</td></tr><tr><td><b>용적률</b></td><td>자재 높이 ÷ 선반 높이 (=높이 활용률)</td></tr><tr><td><b>평균 용적률</b></td><td>랙 평균의 평균 · 빈 랙 제외</td></tr><tr><td><b>적재율</b></td><td>현재 수량 ÷ 최대 수량</td></tr></table><div style="margin-top:3px">색: 빈 랙 0 · 여유 &lt;50 · 보통 &lt;90 · 적재 주의 ≤100 · 초과 &gt;100</div></div>
 <div class="c w"><h2>이 문장이 뜨면</h2>
  <span class="q">전체 취소: … 창고 경계 이탈</span>→ 더 안쪽에 놓고 숫자로 맞춤
  <span class="q">전체 취소: … 통로 폭 부족</span>→ 통로·랙 위치 조정
  <span class="q">전체 취소: BEFORE 원본 잠금 상태입니다.</span>→ 잠금 해제 후 수정
  <span class="q">Rack 단수와 선반 번호 불일치</span>→ 그 행의 선반 번호로</div>
 <div class="c"><h2>단축키</h2><table><tr><td><b class="k">Ctrl</b>+<b class="k">S</b></td><td>저장(결과 알림)</td></tr><tr><td><b class="k">Delete</b></td><td>삭제(2개 이상 확인)</td></tr><tr><td><b class="k">Enter</b></td><td>숫자 적용</td></tr><tr><td><b class="k">Esc</b></td><td>다각형 그리기 취소</td></tr><tr><td><b class="k">Shift</b>/<b class="k">Ctrl</b>+클릭</td><td>선택 추가 / 토글</td></tr><tr><td>더블클릭</td><td>랙 선반별 자재</td></tr></table></div>
 <div class="c w"><h2>꼭 기억</h2><ul><li>자동 배치는 <b>초기 설계안</b> — 실측·하중·피난 검토 별도</li><li>「경고 후 허용」은 검토 뒤 <b>바로 끄기</b></li><li>HTML만 보내면 작업은 안 감 → JSON을 함께</li><li>백업 시각은 UTC (+9시간)</li></ul></div>
</div>
<div class="foot"><span>문의처 [기입] · 사내 한정</span><span>Warehouse Studio 사용자 설명서 v2.0 부록 · 2026-11-16</span></div>
</body></html>'''
open('@@W@@/Warehouse_Studio_빠른카드_v2_0.html','w',encoding='utf-8').write(H); print('ok',len(H)//1024,'KB')
