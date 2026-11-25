import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
log={}
JS_RECT="""(sel)=>{const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height),e.tagName,e.className.toString().slice(0,30)]}"""
JS_UP="""([sel,minw])=>{let e=document.querySelector(sel);if(!e)return null;while(e.parentElement&&e.getBoundingClientRect().width<minw)e=e.parentElement;const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height),e.tagName,(e.id||e.className.toString()).slice(0,30)]}"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':950})
    pg.on('dialog',lambda d:d.accept())
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.screenshot(path=S+'c1_map.png')
    q={'header':('#vSave',700),'saveDetail':('#vSaveDetail',300),'kpi':('#wAll',0),'status':('#wAll',900),
       'left':('#qSnap',230),'scenario':('#rBefore',600),'view':('#vLabelMode',900),'zoom':('#fit',500),
       'canvas':('svg',0),'legend':('#rotate',0),'bottom':('#rotate',800),'right':('#mWheelSensitivity',0)}
    for k,(s,w) in q.items(): log[k]=pg.evaluate(JS_UP,[s,w])
    log['svgs']=pg.evaluate("()=>[...document.querySelectorAll('svg')].map(s=>{const r=s.getBoundingClientRect();return [s.id,Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]}).filter(x=>x[3]>200)")
    log['rightpanel']=pg.evaluate("()=>{const h=[...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'));let e=h;while(e.parentElement&&e.getBoundingClientRect().height<500)e=e.parentElement;const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height),e.tagName,e.id]}")
    log['kpibar']=pg.evaluate("()=>{const t=[...document.querySelectorAll('*')].find(e=>e.children.length==0&&e.textContent.trim()=='전체 창고 면적');let e=t;while(e.parentElement&&e.getBoundingClientRect().width<1500)e=e.parentElement;const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]}")
    log['legendrow']=pg.evaluate("()=>{const t=[...document.querySelectorAll('*')].find(e=>e.children.length==0&&e.textContent.trim()=='실제 재고 적재율');let e=t;while(e.parentElement&&e.getBoundingClientRect().width<900)e=e.parentElement;const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]}")
    log['tools']=pg.evaluate("()=>[...document.querySelectorAll('button')].filter(b=>/랙 추가|내부 벽|기둥|출입문|선택 \\/ 이동/.test(b.innerText)).map(b=>[b.id,b.innerText,b.dataset.tool||b.getAttribute('data-mode')||''])")
    json.dump(log,open('@@W@@/work/c1_probe.json','w'),ensure_ascii=False)
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0))
