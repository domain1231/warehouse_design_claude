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
import glob,os
def dec(t):
    t=re.sub(r'\\u([0-9a-fA-F]{4})',lambda m:chr(int(m.group(1),16)),t)
    return re.sub(r'\\x([0-9a-fA-F]{2})',lambda m:chr(int(m.group(1),16)),t)
appsrc=re.sub(r'\s+',' ',dec(open('@@W@@/dl/app.html',encoding='utf-8').read()))
cap=''
for f in glob.glob('@@W@@/work/*.json')+glob.glob('@@W@@/out/log_*.txt'):
    if re.search(r'verify|ftest|cp_test|build|booklets|user_ed|quickcard|release',os.path.basename(f)): continue
    cap+=open(f,encoding='utf-8',errors='ignore').read()
cap=re.sub(r'\s+',' ',dec(cap).replace('\\n',' ').replace('\\t',' '))
def parts(l):
    core=l.replace('…','').strip()
    return [x.strip() for x in re.split(r'…|·',l) if x.strip()] if '…' in l else [core]
tier={'dom':[],'source':[],'capture':[],'unverified':[]}
for l in labels:
    ps=[re.sub(r'\s+',' ',x) for x in parts(l)]
    if all(x in app for x in ps): tier['dom'].append(l)
    elif all(x in appsrc for x in ps): tier['source'].append(l)
    elif all(x in cap for x in ps): tier['capture'].append(l)
    else: tier['unverified'].append(l)
miss=tier['unverified']
print('labels',len(labels),'dom',len(tier['dom']),'source',len(tier['source']),'capture',len(tier['capture']),'unverified',len(miss))
print(json.dumps(miss,ensure_ascii=False,indent=0))
print('page height',gh,'broken imgs',broken,'console errs',errs[:5])
