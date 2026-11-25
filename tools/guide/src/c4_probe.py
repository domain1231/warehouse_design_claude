import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
log={}
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return [best.x,best.y,best.width,best.height]}"""
MSG="()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].map(e=>e.innerText.trim()).filter(t=>t&&!/SAVED|마지막 확인|기본값은 낮음|이력 0개|복원 완료/.test(t))"
DL="()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,2500))"
ST="()=>({scen:scenario.selectedOptions[0].text,lock:rLock.innerText,bar:document.querySelector('.r-toolbar')?.innerText,title:(document.querySelector('.r-toolbar')?.previousElementSibling||{}).innerText})"
def step(name,fn):
    try: log[name]=fn()
    except Exception as e: log[name]='ERR '+str(e)[:300]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':1250}); pg.on('dialog',lambda d:(log.setdefault('native',[]).append(d.message),d.accept()))
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(500)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(700)
    log['blank']=pg.evaluate(ST)
    pg.fill('#roomWidth','10'); pg.fill('#roomHeight','6'); pg.click('#applyRoom'); pg.wait_for_timeout(400)
    step('toBefore',lambda:(pg.click('#rBefore'),pg.wait_for_timeout(500),pg.evaluate(ST),pg.evaluate(MSG),pg.evaluate(DL)))
    pg.click('#fit'); pg.wait_for_timeout(300)
    x0,y0,w,h=pg.evaluate(ROOM); sx=w/10; sy=h/6; at=lambda mx,my:(x0+mx*sx,y0+my*sy)
    def place():
        pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.click('button[data-tool=rack]')
        for pt in [(1.2,1.0),(3.3,1.3),(5.0,0.9),(1.4,3.2),(4.2,3.6),(7.5,2.2)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(250)
        pg.click('button[data-tool=select]')
        return [pg.evaluate("()=>document.querySelector('#wTop').innerText.slice(0,80)"),pg.evaluate(MSG)]
    step('placeBefore',place)
    step('lock',lambda:(pg.click('#rLock'),pg.wait_for_timeout(500),pg.evaluate(ST),pg.evaluate(MSG),pg.evaluate(DL)))
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    def tryedit():
        pg.mouse.click(*at(1.2,1.0)); pg.wait_for_timeout(300); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(300)
        return pg.evaluate(MSG)
    step('editLocked',tryedit)
    def clone():
        pg.click('#rClone'); pg.wait_for_timeout(700); d=pg.evaluate(DL)
        if d: pg.locator('dialog[open]').first.screenshot(path=S+'c4_clone_dialog.png')
        btns=pg.evaluate("()=>[...document.querySelectorAll('dialog[open] button, dialog[open] input, dialog[open] select')].map(b=>[b.id,b.tagName,b.type,(b.innerText||b.value||'').trim().slice(0,40),b.disabled,(b.closest('label')?.innerText||'').slice(0,60)])")
        return [d,btns]
    step('clone',clone)
    json.dump(log,open('@@W@@/work/c4_probe.json','w'),ensure_ascii=False)
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:7000])
