import base64,io,re
from PIL import Image
G='@@W@@/shots/g/'
def img(n,maxw=1300):
    im=Image.open(G+n+'.png').convert('RGB')
    if im.width>maxw: im=im.resize((maxw,int(im.height*maxw/im.width)),Image.LANCZOS)
    b=io.BytesIO(); im.save(b,'WEBP',quality=82,method=6)
    return 'data:image/webp;base64,'+base64.b64encode(b.getvalue()).decode()
def box(x,y,w,h,t,s='',cls='b'):
    fill={'b':'#eef3fb','g':'#e8f5ee','o':'#fdf2e3','r':'#fdecec','n':'#f3f3f1','p':'#efeefc'}[cls]
    st={'b':'#3b6fb6','g':'#2f8a5b','o':'#c57a14','r':'#c0392b','n':'#8a8a85','p':'#5a4fc0'}[cls]
    tx={'b':'#173a6b','g':'#164a31','o':'#6b3f06','r':'#6e1c14','n':'#333','p':'#2e2670'}[cls]
    out=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{st}" stroke-width="1"/>'
    if s:
        out+=f'<text x="{x+w/2}" y="{y+h/2-9}" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="600" fill="{tx}">{t}</text>'
        out+=f'<text x="{x+w/2}" y="{y+h/2+11}" text-anchor="middle" dominant-baseline="central" font-size="12.5" fill="{tx}" opacity=".85">{s}</text>'
    else:
        out+=f'<text x="{x+w/2}" y="{y+h/2}" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="600" fill="{tx}">{t}</text>'
    return out
def arr(x1,y1,x2,y2,label='',lx=None,ly=None):
    o=f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#666" stroke-width="1.3" marker-end="url(#ah)"/>'
    if label: o+=f'<text x="{lx if lx is not None else (x1+x2)/2+6}" y="{ly if ly is not None else (y1+y2)/2}" font-size="12.5" fill="#555">{label}</text>'
    return o
def path(d): return f'<path d="{d}" fill="none" stroke="#666" stroke-width="1.3" marker-end="url(#ah)"/>'
DEF='<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1L9 5L1 9z" fill="#666"/></marker></defs>'
def svg(w,h,inner,title): return f'<figure class="dia"><svg viewBox="0 0 {w} {h}" role="img" aria-label="{title}">{DEF}{inner}</svg><figcaption>{title}</figcaption></figure>'

mig=svg(900,330,
 box(330,10,240,56,'예전 버전 작업이 있나요?','v2.4.1 · v2.3.6','n')+
 arr(450,66,450,96)+
 box(280,98,340,56,'같은 PC · 같은 브라우저인가?','폴더·파일 이름은 상관없음','n')+
 path('M280 126 L150 126 L150 186')+'<text x="170" y="118" font-size="12.5" fill="#555">예</text>'+
 path('M620 126 L750 126 L750 186')+'<text x="712" y="118" font-size="12.5" fill="#555">아니오 / 모름</text>'+
 box(40,188,220,56,'예전 작업이 자동 표시','읽기만 · 아직 UNSAVED','o')+
 box(640,188,220,56,'예전 버전에서 JSON 백업','→ 새 버전 「불러오기」','b')+
 arr(150,244,150,262)+
 box(40,264,220,52,'「프로젝트 저장」 → SAVED','','g')+
 path('M750 244 L750 290 L644 290')+
 path('M260 290 L356 290')+
 box(360,262,280,56,'JSON 백업 1부 따로 보관','어느 길이든 마지막 단계','g'),
 '그림 0-3 · 예전 데이터 옮기기 — 확실한 길은 JSON 백업 → 불러오기')

flow=svg(960,120,
 box(10,30,130,60,'대상','AFTER / BEFORE','p')+arr(140,60,160,60)+
 box(162,30,140,60,'1 파일 분석','시트·머리글·매핑','b')+arr(302,60,322,60)+
 box(324,30,140,60,'2 창고 규칙','치수·방향·간격','b')+arr(464,60,484,60)+
 box(486,30,140,60,'3 적용 정책','교체·병합·업데이트','b')+arr(626,60,646,60)+
 box(648,30,150,60,'4 방식·미리보기','후보 비교·경고','b')+arr(798,60,818,60)+
 box(820,30,130,60,'적용','여기서만 변경','g'),
 '그림 2-0 · Excel 창의 진행 순서 — 적용 전까지 프로젝트는 그대로')

parts=[('7F','층','#5a4fc0'),('C','열','#3b6fb6'),('5','랙 번호','#2f8a5b'),('3','선반','#c57a14'),('1','자재 위치','#c0392b')]
inner='';x=150
for i,(t,l,c) in enumerate(parts):
    inner+=f'<rect x="{x}" y="30" width="96" height="60" rx="8" fill="#fff" stroke="{c}" stroke-width="2"/><text x="{x+48}" y="60" text-anchor="middle" dominant-baseline="central" font-size="28" font-weight="700" fill="{c}">{t}</text>'
    inner+=f'<text x="{x+48}" y="112" text-anchor="middle" font-size="14" fill="{c}" font-weight="600">{l}</text>'
    if i<4: inner+=f'<text x="{x+108}" y="60" text-anchor="middle" dominant-baseline="central" font-size="26" fill="#999">-</text>'
    x+=120
inner+='<path d="M150 135 L150 145 L486 145 L486 135" fill="none" stroke="#2f8a5b" stroke-width="1.5"/><text x="318" y="166" text-anchor="middle" font-size="13.5" fill="#164a31">랙 코드 7F-C-5 → 도면의 랙 1개</text>'
inner+='<path d="M510 135 L510 145 L726 145 L726 135" fill="none" stroke="#c57a14" stroke-width="1.5"/><text x="618" y="166" text-anchor="middle" font-size="13.5" fill="#6b3f06">랙 안의 주소 (선반·자재)</text>'
loc=svg(880,185,inner,'그림 2-0b · 로케이션 7F-C-5-3-1 읽기 — 마지막 숫자는 수량이 아니라 자재 위치')

dec=svg(940,300,
 box(330,10,280,56,'절대 양보할 수 없는 것은?','하나만 고르세요','n')+
 path('M380 66 L110 66 L110 120')+path('M430 66 L340 66 L340 120')+path('M510 66 L600 66 L600 120')+path('M560 66 L830 66 L830 120')+
 box(10,122,200,60,'현장 번호 순서','열·번호 그대로','o')+
 box(240,122,200,60,'모든 랙이 창고 안','순서는 바뀌어도 됨','o')+
 box(500,122,200,60,'통로 폭','목표 폭 먼저','o')+
 box(730,122,200,60,'열 구조 + 최대 수량','남으면 밖에 대기','o')+
 arr(110,182,110,212)+arr(340,182,340,212)+arr(600,182,600,212)+arr(830,182,830,212)+
 box(10,214,200,66,'로케이션 열 고정','부족하면 길이 안내','g')+
 box(240,214,200,66,'창고 내부 수용 우선','','g')+
 box(500,214,200,66,'통로 확보 우선','','g')+
 box(730,214,200,66,'열 우선 최대 수용','미수용 외부 배치','g'),
 '그림 2-4 · 배치 방식 선택 흐름 (번호 순서만 대체로 지키면 되면 「로케이션 순서 우선」)')

CSS='''
:root{--ink:#1d2430;--mut:#5b6573;--line:#dfe3ea;--bg:#f7f8fa;--acc:#2f5fa8;--g:#2f8a5b;--o:#c57a14;--r:#c0392b}
*{box-sizing:border-box}body{margin:0;font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.7;font-size:15.5px}
main{max-width:1080px;margin:0 auto;padding:28px 24px 60px}
.cover{background:#14202f;color:#fff;border-radius:16px;padding:34px 36px;margin-bottom:18px}
.kicker{font-size:12px;letter-spacing:.14em;color:#9fb6d6}.cover h1{margin:6px 0 4px;font-size:30px}.sub{margin:0;color:#cfd9e6}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.meta span{background:#22324a;border-radius:20px;padding:4px 12px;font-size:12.5px;color:#cfd9e6}.meta b{color:#fff}
.notice{background:#fff;border:1px solid var(--line);border-left:5px solid var(--acc);border-radius:0;padding:12px 16px;margin:10px 0;font-size:14.5px}
.notice.warn{border-left-color:var(--o);background:#fffaf1}
.toc{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0 26px}.toc-col{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 18px}
.toc-h{font-weight:700;margin-bottom:6px}.toc a{display:block;color:var(--acc);text-decoration:none;font-size:14.5px;padding:2px 0}.toc a:hover{text-decoration:underline}
.course{margin-top:34px}.course-head{display:flex;gap:16px;align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px}
.badge{background:var(--acc);color:#fff;font-weight:700;border-radius:10px;padding:10px 14px;white-space:nowrap}.badge.b2{background:var(--g)}
.course-head h2{margin:0 0 4px;font-size:22px}.goal{margin:0;color:var(--mut)}.time{margin-left:auto;white-space:nowrap;background:var(--bg);border-radius:20px;padding:4px 12px;font-size:13px;color:var(--mut)}
.summary{background:#eef3fb;border:1px solid #c9d8ef;border-radius:12px;padding:14px 20px;margin:14px 0}.summary-h{font-weight:700;color:#173a6b;margin-bottom:4px}.summary ol{margin:4px 0;padding-left:20px}
.step{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 22px;margin:16px 0;scroll-margin-top:12px}
.step h3{margin:0 0 8px;font-size:18.5px}.n{display:inline-block;background:var(--ink);color:#fff;border-radius:6px;padding:0 8px;margin-right:8px;font-size:14px}
.step h4{margin:12px 0 4px}
figure{margin:12px 0}figure img{width:100%;height:auto;border:1px solid var(--line);border-radius:8px;display:block;background:#0f1722}
figcaption{font-size:13px;color:var(--mut);margin-top:5px}
.dia svg{width:100%;height:auto;background:#fff;border:1px solid var(--line);border-radius:10px;font-family:inherit}
.tip{background:#f3f7f4;border:1px solid #cfe5d7;border-radius:10px;padding:10px 14px;margin:10px 0;font-size:14.5px}
.warnbox{background:#fdecec;border:1px solid #f2c3bd;border-radius:10px;padding:12px 14px;margin:12px 0;font-size:14.5px}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:14.5px}th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}th{background:#f1f3f6}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;vertical-align:-1px}.dot.g{background:var(--g)}.dot.o{background:var(--o)}.dot.r{background:var(--r)}
.signal td:first-child{font-weight:600;white-space:nowrap}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}.two.small{gap:10px}
.cardx{border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:14.5px}.rec{display:inline-block;background:#e8f5ee;color:#164a31;border-radius:10px;padding:0 8px;font-size:12.5px;margin-left:4px}
.new{display:inline-block;background:#efeefc;color:#2e2670;border-radius:10px;padding:0 7px;font-size:12px}
.side{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:18px;align-items:start}
ol.do{padding-left:22px}ol.do li{margin:4px 0}
.read{border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:12px 0}.read-h{background:#f1f3f6;padding:8px 12px;font-weight:600;font-size:14px}
.rrow{display:grid;grid-template-columns:1fr 90px 1fr;gap:10px;padding:7px 12px;border-top:1px solid var(--line);font-size:14px}.rrow em{font-style:normal;color:var(--mut)}
.rrow.ok b{color:var(--g)}.rrow.ng b{color:var(--o)}.rrow.no b{color:var(--r)}
.check{background:#fff;border:2px dashed #9bb7df;border-radius:14px;padding:14px 20px;margin:18px 0 8px}.check-h{font-weight:700;margin-bottom:6px}.check label{display:block;margin:4px 0;cursor:pointer}
.mistake th{background:#fdf2e3}
code{background:#f1f3f6;border-radius:4px;padding:0 5px;font-size:13.5px}
footer{margin-top:40px;color:var(--mut);font-size:12.5px;text-align:center}
.b1{background:#7a4fc0!important}
.toc{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))!important}
.b4{background:#1d8a8a!important}
.quote.light{background:#f1f3f6;color:#1d2430;border:1px solid #dfe3ea}
.b3{background:#c57a14!important}
.quote{background:#2a1416;color:#f5d7d7;border-radius:8px;padding:8px 12px;margin:8px 0;font-size:14px}
.map{position:relative;margin:12px 0}.map img{width:100%;display:block;border-radius:8px}
.hs{position:absolute;border:2px dashed rgba(255,200,60,.9);border-radius:6px;background:rgba(255,200,60,.06)}
.hs:hover{background:rgba(255,200,60,.22)}
.hs b{position:absolute;left:-11px;top:-11px;width:24px;height:24px;border-radius:50%;background:#ffc83c;color:#1d2430;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #1d2430}
.maplegend td:first-child{width:52px;text-align:center;font-weight:700}
.maplegend .focus td{background:#fff8e6}
.b5{background:#c0392b!important}.b6{background:#5b6573!important}
.diag td{font-size:14px}.diag .grp{background:#14202f;color:#fff;font-weight:700;padding:5px 10px}.diag a{color:var(--acc);white-space:nowrap;margin-left:4px}
kbd{display:inline-block;border:1px solid #c9ced6;border-bottom-width:2px;border-radius:4px;padding:0 5px;font-size:12.5px;background:#fff;font-family:inherit}
.idx td:nth-child(2){white-space:nowrap}
.a4grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.a4c{border:1px solid var(--line);border-radius:10px;padding:8px 12px}.a4c h4{margin:2px 0 4px}.a4c ul{margin:0;padding-left:18px;font-size:14px}
@media print{.a4{break-before:page}.hs{display:none}a{color:inherit;text-decoration:none}}
.bm{background:#14202f!important}
.doccontrol{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 16px;margin:10px 0}
.dct td{font-size:13.5px;padding:5px 9px}.dct td:nth-child(odd){background:#f1f3f6;width:14%;font-weight:600}
.fill{color:#b06a00}
.hist summary{cursor:pointer;font-size:13.5px;color:var(--acc);margin:4px 0}
.readers{margin:14px 0}.rd-h{font-weight:700;margin-bottom:6px}.rd-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.rd{display:block;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px;text-decoration:none;color:var(--ink)}.rd:hover{border-color:var(--acc)}
.rd b{display:block;font-size:16px}.rd span{display:block;font-size:13px;color:var(--mut)}.rd em{display:block;font-style:normal;font-size:13px;color:var(--acc);margin-top:4px}
.tm{border-color:#14202f!important;border-width:2px!important}
.exec{border:2px solid #14202f;border-radius:12px;padding:14px 18px}.ex-lead{font-size:15.5px;margin-bottom:8px}
.ex-two{display:grid;grid-template-columns:1fr 1fr;gap:16px}.ex-ask{background:#fff8e6;border-radius:10px;padding:8px 16px;margin-top:10px}.ex-ask h4{margin:4px 0}
.small{font-size:13px;color:var(--mut)}
.lv{display:inline-block;border-radius:10px;padding:0 8px;font-size:12.5px;white-space:nowrap}.l3{background:#e8f5ee;color:#164a31}.l2{background:#eef3fb;color:#173a6b}.l1{background:#fdf2e3;color:#6b3f06}.l0{background:#f1f3f6;color:#444}
.chk td:nth-child(4),.chk td:nth-child(5),.chk th:nth-child(4),.chk th:nth-child(5){text-align:center;font-size:16px;width:64px;white-space:nowrap}.chk td:first-child{width:30px;text-align:center}
.sign{display:flex;justify-content:space-between;margin:14px 0 4px;font-size:14px}
.form{border:2px solid #1d2430;border-radius:6px;padding:12px 16px;background:#fff}.f-title{text-align:center;font-size:19px;font-weight:700;margin-bottom:8px;letter-spacing:.05em}
.fm td{font-size:13.5px}.fm td i{color:#8a8a85;font-style:normal}.fm td:nth-child(odd):not(.kpi td){background:#f7f8fa}
.kpi td:first-child{background:#f7f8fa}.fm-img{margin:8px 0}.fm-img img{width:100%;border:1px solid var(--line);border-radius:6px}
.f-note{font-size:12.5px;color:var(--mut);border-top:1px solid var(--line);padding-top:6px}
.legend{display:flex;flex-wrap:wrap;gap:12px;padding:10px 12px;font-size:13.5px}.legend i{display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:5px;vertical-align:-2px}
.raci td:not(:first-child){text-align:center;font-weight:700;width:12%}.raci th{font-size:13px}
.quiz details{border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin:6px 0}.quiz summary{cursor:pointer;font-weight:600}.quiz p{margin:6px 0 0}
@media print{.page{break-before:page}.quiz details{break-inside:avoid}}
.b6c{background:#2f6f3e!important}
.measured td.g{color:#164a31}.measured td.o{color:#6b3f06;background:#fdf6ea}.measured td.r{color:#6e1c14;background:#fdf0ef}
.grid5{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure.narrow img{max-width:680px;width:100%}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;align-items:start}.grid2{display:grid;grid-template-columns:1.3fr 1fr;gap:12px;align-items:start}@media (max-width:760px){.grid3,.grid2{grid-template-columns:1fr}}.grid5 figure{margin:4px 0}
.vscope{font-size:13.5px}.vscope ul{margin:4px 0 6px;padding-left:20px}

#gSide{display:none}
body.gs #gSide{display:flex;flex-direction:column;position:fixed;left:0;top:0;bottom:0;width:290px;background:#fff;border-right:1px solid var(--line);z-index:50;font-size:13.5px}
.gs-top{padding:12px;border-bottom:1px solid var(--line);position:relative}
#gQ{width:100%;padding:8px 10px;border:1px solid #c9ced6;border-radius:8px;font:inherit;font-size:14px}
#gRes{display:none;position:absolute;left:12px;right:-360px;top:52px;max-height:70vh;overflow:auto;background:#fff;border:1px solid #c9ced6;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:60}
.gr{display:block;padding:8px 12px;border-top:1px solid var(--line);text-decoration:none;color:var(--ink)}.gr:hover{background:#eef3fb}.gr b{display:block;font-size:13.5px}.gr span{font-size:12.5px;color:var(--mut)}
.gr-n,.gr-none{padding:8px 12px;font-size:12.5px;color:var(--mut)}mark{background:#ffe58a;color:inherit;border-radius:2px}
.gs-nav{flex:1;overflow:auto;padding:6px 0 10px}
.gs-c>a{display:block;padding:6px 14px;color:var(--ink);text-decoration:none;font-weight:600}.gs-c>a b{display:inline-block;background:#14202f;color:#fff;border-radius:5px;padding:0 6px;font-size:11.5px;margin-right:4px}
.gs-s{display:none}.gs-c.cur .gs-s{display:block}
.gs-s a{display:block;padding:3px 14px 3px 30px;color:var(--mut);text-decoration:none;font-size:13px}.gs-s a.on{color:var(--acc);font-weight:600;background:#eef3fb}
.pg{float:right;font-size:11.5px;color:var(--mut);font-weight:400}.pg.done{color:var(--g)}
.gs-print{border-top:1px solid var(--line);padding:8px 12px;font-size:13px}.gs-print summary{cursor:pointer;font-weight:600}.gs-print label{display:block;margin:3px 0}
#gPrint{margin-top:6px;width:100%;padding:7px;border-radius:8px;border:1px solid var(--acc);background:var(--acc);color:#fff;font:inherit;cursor:pointer}
@media (min-width:1400px){body.gs main{margin-left:300px;margin-right:auto}}
#gTog{display:none}
@media (max-width:1399px){body.gs #gSide{transform:translateX(-100%);transition:transform .2s;box-shadow:4px 0 20px rgba(0,0,0,.15)}body.gs.gs-open #gSide{transform:none}#gTog{display:block;position:fixed;left:12px;bottom:12px;z-index:55;padding:8px 14px;border-radius:20px;border:1px solid #14202f;background:#14202f;color:#fff;font:inherit;cursor:pointer}#gRes{right:12px}}
#gTop{position:fixed;right:14px;bottom:12px;z-index:55;padding:6px 12px;border-radius:20px;border:1px solid #c9ced6;background:#fff;font:inherit;font-size:13px;cursor:pointer}
img.zoomable{cursor:zoom-in}
#gLb{display:none;position:fixed;inset:0;background:rgba(10,14,20,.88);z-index:100;align-items:center;justify-content:center;flex-direction:column;cursor:zoom-out;padding:20px}
#gLb.on{display:flex}#gLb img{max-width:96vw;max-height:86vh;border-radius:6px;background:#0f1722}#gLb .lb-c{color:#e5edf6;font-size:14px;margin-top:10px;max-width:90vw;text-align:center}
#gLb button{position:absolute;top:14px;right:18px;background:#fff;border:0;border-radius:16px;padding:5px 12px;font:inherit;cursor:pointer}
.flash{animation:fl 1.6s ease}@keyframes fl{0%{box-shadow:0 0 0 4px #ffc83c}100%{box-shadow:0 0 0 0 transparent}}
@media print{#gSide,#gTog,#gTop,#gLb{display:none!important}body.gs main{margin-left:auto}.noprint{display:none!important}}
.startbox{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;background:#f3f0fb;border:1px solid #d9d2f2;border-radius:10px;padding:9px 14px;margin:12px 0;font-size:14px}
.startbox b{color:#2e2670}.startbox em{font-style:normal;color:var(--mut)}.startbox small{flex-basis:100%;color:var(--mut);font-size:12.5px}
a.dlf{display:inline-block;background:#5a4fc0;color:#fff;border-radius:16px;padding:2px 11px;text-decoration:none;font-size:13.5px}a.dlf:hover{background:#3c3489}
.anim img{border:2px solid #5a4fc0!important}
.howto{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:12px 0}
.hw-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 14px}.hw-grid>div{display:flex;flex-direction:column;gap:3px;font-size:13px;color:var(--mut)}
.hw-k{font-size:14px;color:var(--ink);font-weight:600}.hw-num{letter-spacing:.1em}
.mini{margin:0!important;padding:3px 8px!important;font-size:12.5px!important;color:var(--ink)}.quote.mini{color:#f5d7d7}
.hw-dot{display:inline-block;width:20px;height:20px;border-radius:50%;background:#ff3b30;color:#fff;text-align:center;line-height:20px;font-size:12px}
.eidx td{font-size:13.5px}.eidx .em{font-family:inherit;background:#f7f8fa}
.ek{display:inline-block;border-radius:10px;padding:0 8px;font-size:12px;white-space:nowrap}.ek-r{background:#fdecec;color:#6e1c14}.ek-c{background:#fdf2e3;color:#6b3f06}.ek-x{background:#eef3fb;color:#173a6b}.ek-i{background:#efeefc;color:#2e2670}.ek-n{background:#e8f5ee;color:#164a31}
@media print{a.dlf{background:none;color:inherit;padding:0}}
@media (max-width:900px){.hw-grid{grid-template-columns:1fr 1fr}}
#gTog,#gTop{opacity:.85;font-size:12.5px!important;padding:5px 11px!important}#gTog:hover,#gTop:hover{opacity:1}
@media (max-width:1399px){main{padding-bottom:80px!important}}
.alpha{display:inline-block;vertical-align:middle;margin-left:8px;background:#fff4d6;color:#6b3f06;border:1px dashed #c57a14;border-radius:10px;padding:0 8px;font-size:12px;font-weight:400}
.fb{margin:14px 0 0;background:#f7f8fa;border:1px dashed #b8c0cc;border-radius:10px;padding:8px 14px;font-size:13px;color:var(--mut)}.fb b{color:var(--ink)}
.exam td:last-child{text-align:center;font-weight:700;width:52px}.exam td:first-child{width:28px;text-align:center}
@media print{
 body.inksave figure img,body.inksave .map img,body.inksave .fm-img img{filter:invert(1) hue-rotate(180deg) contrast(.95)}
 body.inksave .cover{background:#fff!important;color:#000!important;border:2px solid #000}body.inksave .cover *{color:#000!important}body.inksave .meta span{background:#fff!important;border:1px solid #000}
 body.inksave .quote{background:#fff!important;color:#000!important;border:1px solid #000}body.inksave .diag .grp{background:#fff!important;color:#000!important;border-bottom:2px solid #000}
 body.inksave .badge,body.inksave .n,body.inksave .gs-c>a b{background:#fff!important;color:#000!important;border:1px solid #000}
}
@media (max-width:760px){.rd-grid,.ex-two{grid-template-columns:1fr 1fr}}
@media (max-width:760px){.toc,.two,.side{grid-template-columns:1fr}.course-head{flex-wrap:wrap}}
@media print{body{background:#fff}.step,.course-head,.check{break-inside:avoid}.toc{display:none}.cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
'''
body=open('@@W@@/scripts/body.html',encoding='utf-8').read()
rep={'svg_migrate':mig,'svg_flow':flow,'svg_loc':loc,'svg_decide':dec}
for n in ['c0_help','v_tight_inside','v_tight_fixed','v_tight_aisle','v_tight_column','c0_about','c0_header','c0_header_saved','c0_after_json','c0_versions','c0_storage','c2_sec0','c2_sec1','c2_sec3','c2_fixed_settings','c2_preview_svg','c2_preview_svg_gap','c2_apply','c2_result','c2_summary']:
    rep[n]=img(n, 1600 if 'header' in n else 1300)
body=re.sub(r'\{\{(\w+)\}\}',lambda m:m.group(0) if m.group(1).startswith('DL_') else rep[m.group(1)],body)
exec(open('@@W@@/scripts/c1_inject.py',encoding='utf-8').read())
exec(open('@@W@@/scripts/c3_inject.py',encoding='utf-8').read())
exec(open('@@W@@/scripts/c4_inject.py',encoding='utf-8').read())
exec(open('@@W@@/scripts/c5_inject.py',encoding='utf-8').read())
exec(open('@@W@@/scripts/c6_inject.py',encoding='utf-8').read())
exec(open('@@W@@/scripts/m_inject.py',encoding='utf-8').read())
exec(open('@@W@@/scripts/p2_inject.py',encoding='utf-8').read())
exec(open('@@W@@/scripts/p3_inject.py',encoding='utf-8').read())
assert '{{' not in body
html=f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Warehouse Studio v2.5.0-alpha.14 사용자 설명서 v2.0 · 코스 0~5·부록</title><style>{CSS}</style></head><body><main>{body}</main><script>'+open('@@W@@/scripts/guide.js',encoding='utf-8').read()+'</script></body></html>'
open('@@W@@/Warehouse_Studio_v2_5_0a2_UserGuide_v2_0.html','w',encoding='utf-8').write(html)
import os as _os; _os.makedirs('@@W@@/out',exist_ok=True); open('@@W@@/out/Warehouse_Studio_v2_5_0a2_UserGuide_v2_0.html','w',encoding='utf-8').write(html)
print('KB',len(html.encode())//1024)
