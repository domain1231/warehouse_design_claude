import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
X='@@W@@/work/edu/교육용_창고데이터.xlsx'
log={}
DL="()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,2500))"
MSG="()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].map(e=>e.innerText.trim()).filter(t=>t&&!/SAVED|마지막 확인|기본값은 낮음|이력 0개/.test(t))"
RIGHT="([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))).closest('aside')"
def step(n,f):
    try: log[n]=f()
    except Exception as e: log[n]='ERR '+str(e)[:250]
def opts(pg,sel): return pg.evaluate(f"()=>[...document.querySelector('{sel}').options].map(o=>[o.value,o.text])")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':1250}); pg.on('dialog',lambda d:(log.setdefault('native',[]).append(d.message),d.accept()))
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(400)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    pg.fill('#roomWidth','14'); pg.fill('#roomHeight','8'); pg.click('#applyRoom'); pg.wait_for_timeout(300)
    pg.click('#exOpen'); pg.wait_for_timeout(300); pg.set_input_files('#exFileDialog',X); pg.wait_for_timeout(2500)
    pg.select_option('#wMode','fixed'); pg.wait_for_timeout(2500)
    pg.locator('label:has-text("선택한 대상 배치를 확인했습니다")').first.click(); pg.wait_for_timeout(300)
    pg.click('#exApply'); pg.wait_for_timeout(1500)
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    pg.click('#fit'); pg.wait_for_timeout(400)
    cv=pg.evaluate("()=>{const r=document.querySelector('#plan').getBoundingClientRect();return [r.x,r.y,r.width,r.height]}"); clip=dict(zip(['x','y','width','height'],cv))
    log['options']={k:opts(pg,k) for k in ['#exViz','#exHeightPolicy','#vLabelMode','#vColorMode','#qLabelLayout','#qNumberPadding']}
    log['defaults']=pg.evaluate("()=>({viz:exViz.value,hp:exHeightPolicy.value,label:vLabelMode.value,color:vColorMode.value,ll:qLabelLayout.value,pad:qNumberPadding.value})")
    pg.screenshot(path=S+'c6_applied.png',clip=clip)
    # rack element centers
    racks=pg.evaluate("()=>[...document.querySelectorAll('#plan [data-id]')].map(e=>{const r=e.getBoundingClientRect();return [e.getAttribute('data-id'),r.x+r.width/2,r.y+r.height/2,r.width,r.height,e.textContent.trim().slice(0,12)]}).filter(x=>x[3]>15&&x[4]>15)")
    log['racks']=racks[:12]
    def viz():
        r={}
        for v,t in log['options']['#exViz']:
            pg.select_option('#exViz',v); pg.wait_for_timeout(500); pg.screenshot(path=S+f'c6_viz_{v}.png',clip=clip)
            r[v]=pg.evaluate("()=>{const l=[...document.querySelectorAll('*')].find(e=>e.children.length==0&&/^실제 재고 적재율$|^높이 활용률$|^위치 등록|^품목별/.test(e.textContent.trim())&&e.getBoundingClientRect().y>700);let p=l;for(let i=0;i<3&&p;i++)p=p.parentElement;return p?p.innerText.slice(0,300):''}")
        pg.select_option('#exViz',log['defaults']['viz']); pg.wait_for_timeout(300)
        return r
    step('viz',viz)
    def labels():
        r={}
        for v,t in log['options']['#vLabelMode']:
            pg.select_option('#vLabelMode',v); pg.wait_for_timeout(400); pg.screenshot(path=S+f'c6_label_{v}.png',clip=clip)
            r[v]=pg.evaluate("()=>[...document.querySelectorAll('#plan text')].map(t=>t.textContent).slice(0,12).join('|')")
        pg.select_option('#vLabelMode',log['defaults']['label']); pg.wait_for_timeout(300)
        return r
    step('labels',labels)
    def hpol():
        pg.select_option('#vLabelMode',[v for v,t in log['options']['#vLabelMode'] if '높이' in t][0]); pg.wait_for_timeout(300)
        r={}
        for v,t in log['options']['#exHeightPolicy']:
            pg.select_option('#exHeightPolicy',v); pg.wait_for_timeout(500)
            r[t]=pg.evaluate("()=>[...document.querySelectorAll('#plan text')].map(t=>t.textContent).filter(x=>/%/.test(x)).slice(0,11).join(' ')")
        pg.select_option('#exHeightPolicy',log['defaults']['hp']); pg.select_option('#vLabelMode',log['defaults']['label']); pg.wait_for_timeout(300)
        return r
    step('hpol',hpol)
    def detail():
        x,y=racks[0][1],racks[0][2]
        pg.mouse.dblclick(x,y); pg.wait_for_timeout(900)
        d=pg.evaluate(DL)
        if d: pg.locator('#sInfoDialog').screenshot(path=S+'c6_detail.png')
        o={k:opts(pg,k) for k in ['#sInfoShelf','#sShelfOrder','#sInfoMode']}
        btns=pg.evaluate("()=>[...document.querySelectorAll('#sInfoDialog button')].map(b=>[b.id,b.innerText.trim()])")
        return [d,o,btns]
    step('detail',detail)
    def shelf():
        o=log['detail'][1]['#sInfoShelf'] if isinstance(log['detail'],list) else []
        if len(o)>1:
            pg.select_option('#sInfoShelf',o[1][0]); pg.wait_for_timeout(500); pg.locator('#sInfoDialog').screenshot(path=S+'c6_detail_shelf.png')
        pg.select_option('#sShelfOrder',index=1); pg.wait_for_timeout(500); pg.locator('#sInfoDialog').screenshot(path=S+'c6_detail_order.png')
        return pg.evaluate("()=>document.querySelector('#sInfoDialog').innerText.slice(0,2000)")
    step('shelf',shelf)
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    def theme():
        pg.click('#vThemeOpen'); pg.wait_for_timeout(700); d=pg.evaluate(DL)
        pg.locator('#vThemeDialog').screenshot(path=S+'c6_theme.png')
        c=pg.evaluate("()=>[...document.querySelectorAll('#vThemeDialog button,#vThemeDialog select,#vThemeDialog input[type=checkbox]')].map(b=>[b.id,b.tagName,(b.innerText||b.value||'').trim().slice(0,40),(b.closest('label')?.innerText||'').slice(0,50)])")
        pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
        return [d,c]
    step('theme',theme)
    json.dump(log,open('@@W@@/work/c6_probe.json','w'),ensure_ascii=False,indent=1)
    pg.context.storage_state(path='@@W@@/work/c6_state.json')
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:9000])
