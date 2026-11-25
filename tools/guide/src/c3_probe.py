import json,traceback
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
log={}
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return [best.x,best.y,best.width,best.height]}"""
RIGHT="([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))).closest('aside')"
MSG="()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].map(e=>e.innerText.trim()).filter(t=>t&&!/SAVED|마지막 확인|기본값은 낮음|이력 0개/.test(t))"
def dl(pg): return pg.evaluate("()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,1500))")
def step(name,fn):
    try: log[name]=fn()
    except Exception as e: log[name]='ERR '+str(e)[:300]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':1250}); pg.on('dialog',lambda d:d.accept())
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(500)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(700)
    pg.fill('#roomWidth','10'); pg.fill('#roomHeight','6'); pg.click('#applyRoom'); pg.wait_for_timeout(400); pg.click('#fit'); pg.wait_for_timeout(400)
    cv=pg.evaluate("()=>{const r=document.querySelector('#plan').getBoundingClientRect();return [r.x,r.y,r.width,r.height]}")
    clip=dict(zip(['x','y','width','height'],cv))
    x0,y0,w,h=pg.evaluate(ROOM); sx=w/10; sy=h/6; at=lambda mx,my:(x0+mx*sx,y0+my*sy)
    log['defaults']=pg.evaluate("()=>({snap:qSnapStep.value,key:qKeyStep.value,fast:qFastStep.value,policy:collisionPolicy.selectedOptions[0].text,minGap:minGap.value,grid:gridStep.value,dist:distributeGap.value,rule:mSelectRule.selectedOptions[0].text})")
    pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.click('button[data-tool=rack]')
    for pt in [(1.2,1.0),(3.1,1.4),(4.6,0.9),(6.9,1.6)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(300)
    pg.click('button[data-tool=select]'); pg.mouse.click(*at(9.5,5.5)); pg.wait_for_timeout(300)
    pg.screenshot(path=S+'c3_scatter.png',clip=clip)
    # box select
    def box():
        a=at(0.3,0.3); c=at(8.2,2.6)
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move((a[0]+c[0])/2,(a[1]+c[1])/2,steps=5); pg.mouse.move(*c,steps=5)
        pg.screenshot(path=S+'c3_boxing.png',clip=clip); pg.mouse.up(); pg.wait_for_timeout(400)
        pg.screenshot(path=S+'c3_boxed.png',clip=clip)
        return pg.evaluate("()=>"+RIGHT+".innerText.slice(0,900)")
    step('box',box)
    def align():
        pg.click('#alignY'); pg.wait_for_timeout(500); d=dl(pg); m=pg.evaluate(MSG)
        if d: pg.locator('dialog[open]').first.screenshot(path=S+'c3_align_dialog.png')
        return [d,m]
    step('alignY',align)
    def closeok():
        d=dl(pg)
        if d:
            btns=pg.evaluate("()=>[...document.querySelectorAll('dialog[open] button')].map(b=>[b.id,b.innerText.trim()])")
            return btns
    step('align_btns',closeok)
    json.dump(log,open('@@W@@/work/c3_probe.json','w'),ensure_ascii=False)
    pg.context.storage_state(path='@@W@@/work/c3_state.json')
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:5000])
