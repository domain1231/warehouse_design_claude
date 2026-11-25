import gzip as _gz, base64 as _b64, os as _os, json as _json
AN='@@W@@/shots/anim/'; CPD='@@W@@/work/cp/'
def _anim(n): return 'data:image/webp;base64,'+_b64.b64encode(open(AN+n,'rb').read()).decode()
FILES=[('코스1_완성본.json',CPD+'코스1_완성본.json',True),('코스3_시작.json',CPD+'코스3_시작.json',True),('코스4_시작.json',CPD+'코스4_시작.json',True),
       ('코스5_시작.json',CPD+'코스5_시작.json',True),('코스6_시작.json',CPD+'코스6_시작.json',True),('코스4_비교예시.json',CPD+'코스4_비교예시.json',True),('교육용_창고데이터_개선후.xlsx','@@W@@/work/edu/교육용_창고데이터_개선후.xlsx',False),('교육용_창고데이터_Summary대조.xlsx','@@W@@/work/edu/교육용_창고데이터_Summary대조.xlsx',False),('교육용_창고데이터.xlsx','@@W@@/work/edu/교육용_창고데이터.xlsx',False),('교육용_평면도.png','@@W@@/work/edu/교육용_평면도.png',False)]
_store=''; _fid={}
for i,(nm,path,gz) in enumerate(FILES):
    raw=open(path,'rb').read(); data=_gz.compress(raw,9) if gz else raw
    _fid[nm]=i; _store+=f'<script type="application/octet-stream" id="gf{i}" data-name="{nm}" data-gz="{1 if gz else 0}">{_b64.b64encode(data).decode()}</script>'
def DL(nm,label=None): return f'<a href="#" class="dlf" data-f="gf{_fid[nm]}">⤓ {label or nm}</a>'
START={
 'c1':('없음 · 빈 창고에서 시작합니다',DL('코스1_완성본.json','정답 확인용 · 코스1_완성본.json'),'10×6m · 출입문·기둥 · 랙 3개 (R-02가 X 3 / Y 1)'),
 'c2':(DL('교육용_창고데이터.xlsx'),None,'가상 3열 11랙 · C3 일부러 비움'),
 'c3':(DL('코스3_시작.json'),None,'10×6m · 높이가 제각각인 랙 4개'),
 'c4':(DL('코스4_시작.json'),None,'BEFORE 6랙(잠금) · AFTER 비어 있음'),
 'c5':(DL('코스5_시작.json'),None,'10×6m · 랙 5개'),
 'c6':(DL('코스6_시작.json'),None,'14×8m · 교육용 Excel 적용 AFTER (선반·자재 연결)'),
}
body=body.replace('{{DL_CMP}}',DL('코스4_비교예시.json'),1).replace('{{DL_SUM}}',DL('교육용_창고데이터_Summary대조.xlsx'),1)
for cid,(start,extra,desc) in START.items():
    box_=f'<div class="startbox"><b>실습 파일</b><span>시작: {start}</span>'+(f'<span>{extra}</span>' if extra else '')+f'<em>{desc}</em><small>JSON은 「불러오기」로 엽니다 · <b>업무 PC라면 먼저 「JSON 백업」</b> — 같은 브라우저의 모든 사본은 저장 공간을 같이 씁니다(<a href="#c0-0">0-0</a>)</small></div>'
    _s=body.index(f'<section class="course" id="{cid}">'); _a=body.index('<article',_s)
    body=body[:_a]+box_+'\n'+body[_a:]
def _after_h3(aid,html_):
    global body
    _s=body.index(f'<article id="{aid}"'); _h=body.index('</h3>',_s)+5
    body=body[:_h]+html_+body[_h:]
_after_h3('c1-7',f'<figure class="anim"><img src="{_anim("anim_drag.webp")}" alt="랙 끌어 옮기기 움직이는 그림"><figcaption>움직이는 그림 · R-03을 눌러 잡고 오른쪽으로 끌기 — 주변 객체까지 거리가 따라 바뀝니다</figcaption></figure>')
_after_h3('c3-1',f'<figure class="anim"><img src="{_anim("anim_box.webp")}" alt="상자로 여러 개 고르기 움직이는 그림"><figcaption>움직이는 그림 · 빈 곳에서 끌어 상자를 그리면 걸린 랙이 모두 선택됩니다</figcaption></figure>')
body=body.replace('<h4>꺾인 통로 (다각형)</h4>',f'<h4>꺾인 통로 (다각형)</h4><figure class="anim"><img src="{_anim("anim_poly.webp")}" alt="다각형 통로 그리기 움직이는 그림"><figcaption>움직이는 그림 · 모서리 6개를 차례로 클릭 → 「다각형 완성」</figcaption></figure>',1)
body=body.replace('<li>프로그램 HTML(v2.5.0-alpha.14), 이 설명서, 교육용 Excel(<code>교육용_창고데이터.xlsx</code> · 가상 3열 11랙)</li>',
 '<li>프로그램 HTML(v2.5.0-alpha.14), 이 설명서</li><li>실습 파일(설명서 안에 들어 있음): '+' · '.join(DL(n) for n,_,_ in FILES)+'</li>',1)
body=body+_store
