import pypdf,os,shutil,subprocess
from playwright.sync_api import sync_playwright
MAIN='file://@@W@@/Warehouse_Studio_v2_5_0a2_UserGuide_v2_0.html'
OUT='@@W@@/out/'; os.makedirs(OUT,exist_ok=True)
INS=open('@@W@@/work/instructor_section.html',encoding='utf-8').read()
PREP="""([keep,hideArticlesExcept,ins,ink,quiz])=>{
 const m=document.querySelector('main');
 [...m.children].forEach(ch=>{if(ch.tagName==='SCRIPT')return;const ok=keep.some(k=>ch.matches(k));ch.classList.toggle('noprint',!ok)});
 if(hideArticlesExcept){const [sec,ids]=hideArticlesExcept;document.querySelectorAll(sec+' article').forEach(a=>a.classList.toggle('noprint',!ids.includes(a.id)));}
 if(ins){const f=document.querySelector('main footer');f.insertAdjacentHTML('beforebegin',ins);}
 document.body.classList.toggle('inksave',!!ink);
 if(quiz)document.querySelectorAll('.quiz details').forEach(d=>d.open=true);
 document.querySelectorAll('.check input').forEach(i=>i.checked=false);
}"""
JOBS=[
 ('관리자용_소책자',['header.cover','.notice.warn','#dc','#mg','footer'],None,False,False,False),
 ('강사용_교육패킷',['header.cover','#dc','#ax','footer'],('#ax',['ax-5','ax-6','ax-7']),True,False,True),
 ('전체본_컬러',['*'],None,False,False,False),
 ('전체본_잉크절약',['*'],None,False,True,False),
]
res={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    for name,keep,hide,ins,ink,quiz in JOBS:
        g=b.new_page(viewport={'width':1100,'height':900}); g.goto(MAIN); g.wait_for_timeout(1200)
        g.evaluate(PREP,[keep,hide,INS if ins else '',ink,quiz]); g.wait_for_timeout(500)
        g.emulate_media(media='print')
        path=OUT+f'Warehouse_Studio_설명서_v2_0_{name}.pdf'
        g.pdf(path=path,format='A4',print_background=True)
        res[name]=(len(pypdf.PdfReader(path).pages),os.path.getsize(path)//1024); g.close()
    g=b.new_page(); g.goto('file://@@W@@/Warehouse_Studio_빠른카드_v2_0.html'); g.wait_for_timeout(600)
    path=OUT+'Warehouse_Studio_빠른카드_v2_0.pdf'; g.pdf(path=path,format='A4',print_background=True,prefer_css_page_size=True)
    res['빠른카드']=(len(pypdf.PdfReader(path).pages),os.path.getsize(path)//1024)
    # previews for visual check
    g.set_viewport_size({'width':794,'height':1123}); g.screenshot(path='@@W@@/shots/qc.png',full_page=True)
    g2=b.new_page(viewport={'width':1100,'height':900}); g2.goto(MAIN); g2.wait_for_timeout(1000)
    g2.evaluate(PREP,[['*'],None,'',True,False]); g2.emulate_media(media='print'); g2.wait_for_timeout(300)
    g2.locator('#c1-5').screenshot(path='@@W@@/shots/ink_c15.png')
    b.close()
print(res); print('pdftoppm', shutil.which('pdftoppm'))
