import re,json,html as H
from playwright.sync_api import sync_playwright
X='@@W@@/work/edu/교육용_창고데이터.xlsx'
GUIDE='@@W@@/out/Warehouse_Studio_v2_5_0a2_UserGuide_v2_0.html'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1400,'height':1000})
    pg.on('dialog',lambda d:d.accept())
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    texts=[pg.evaluate("()=>document.documentElement.textContent+' '+[...document.querySelectorAll('[title]')].map(e=>e.title).join(' ')")]
    texts.append(pg.evaluate("()=>document.body.innerText"))
    pg.click('#vSave'); pg.wait_for_timeout(600); texts.append(pg.evaluate("()=>document.body.innerText"))
    pg.click('#exOpen'); pg.wait_for_timeout(300); pg.set_input_files('#exFileDialog',X); pg.wait_for_timeout(2500)
    pg.select_option('#wMode','fixed'); pg.wait_for_timeout(2000)
    texts.append(pg.evaluate("()=>document.documentElement.textContent"))
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    pg.click('#newBlank'); pg.wait_for_timeout(500); texts.append(pg.evaluate("()=>document.documentElement.textContent"))
    app=re.sub(r'\s+',' ',' '.join(texts))
    # render guide
    g=b.new_page(viewport={'width':1200,'height':900})
    errs=[]; g.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    g.goto('file://'+GUIDE); g.wait_for_timeout(1000)
    g.screenshot(path='@@W@@/shots/guide_full.png',full_page=True)
    gh=g.evaluate("()=>document.body.scrollHeight")
    broken=g.evaluate("()=>[...document.images].filter(i=>!i.naturalWidth).length")
    b.close()
src=open(GUIDE,encoding='utf-8').read()
src=re.sub(r'data:image[^"]+','',src)
txt=H.unescape(re.sub('<[^>]+>','',src))
labels=sorted(set(re.findall(r'「([^」]+)」',txt)))
miss=[]
for l in labels:
    core=l.replace('…','').strip()
    parts=[x.strip() for x in core.split('·') if x.strip()] if '…' in l else [core]
    if not all(re.sub(r'\s+',' ',x) in app for x in parts): miss.append(l)
print('labels',len(labels),'missing',len(miss)); print(json.dumps(miss,ensure_ascii=False,indent=0))
print('page height',gh,'broken imgs',broken,'console errs',errs[:5])
