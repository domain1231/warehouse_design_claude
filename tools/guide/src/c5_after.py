import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
log={}
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return [best.x,best.y,best.width,best.height]}"""
MSG="()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].map(e=>e.innerText.trim()).filter(t=>t&&!/SAVED|마지막 확인|기본값은 낮음|이력 0개/.test(t))"
DL="()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,2000))"
CNT="()=>document.querySelector('#wTop').innerText.split('·')[0]+' | '+scenario.selectedOptions[0].text"
def step(name,fn):
    try: log[name]=fn()
    except Exception as e: log[name]='ERR '+str(e)[:300]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':1250})
    pg.on('dialog',lambda d:(log.setdefault('native',[]).append(d.message),d.accept()))
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(500)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(700)
    pg.click('#rBefore'); pg.wait_for_timeout(300); pg.click('#rLock'); pg.wait_for_timeout(300)
    pg.fill('#roomWidth','10'); pg.fill('#roomHeight','6'); pg.click('#applyRoom'); pg.wait_for_timeout(300); pg.click('#fit'); pg.wait_for_timeout(300)
    x0,y0,w,h=pg.evaluate(ROOM); sx=w/10; sy=h/6; at=lambda mx,my:(x0+mx*sx,y0+my*sy)
    pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.click('button[data-tool=rack]')
    for pt in [(1.2,1.0),(3.0,1.0),(4.8,1.0)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(250)
    pg.click('button[data-tool=select]'); pg.click('#rLock'); pg.wait_for_timeout(300)
    pg.click('#rClone'); pg.wait_for_timeout(500); pg.click('#rCloneApply'); pg.wait_for_timeout(700)
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    if 'After' not in pg.evaluate("()=>scenario.selectedOptions[0].text"): pg.click('#rAfter'); pg.wait_for_timeout(300)
    pg.click('#fit'); pg.wait_for_timeout(300); x0,y0,w,h=pg.evaluate(ROOM); sx=w/10; sy=h/6
    pg.click('button[data-tool=rack]')
    for pt in [(1.2,3.5),(3.0,3.5),(4.8,3.5),(6.6,3.5)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(250)
    pg.click('button[data-tool=select]')
    log['after_work']=pg.evaluate(CNT)
    # clone again -> replaces AFTER
    pg.click('#rClone'); pg.wait_for_timeout(500); pg.click('#rCloneApply'); pg.wait_for_timeout(700)
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    if 'After' not in pg.evaluate("()=>scenario.selectedOptions[0].text"): pg.click('#rAfter'); pg.wait_for_timeout(300)
    log['after_replaced']=pg.evaluate(CNT)
    # open bottom panel
    def bottom():
        pg.click('#sBottomToggle'); pg.wait_for_timeout(500)
        sm=pg.locator('summary',has_text='Excel 가져오기·자동 백업 이력').first
        sm.click(); pg.wait_for_timeout(500)
        det=sm.evaluate("e=>{const d=e.parentElement;d.setAttribute('data-sec','bk');return d.innerText.slice(0,2000)}")
        pg.locator('[data-sec=bk]').scroll_into_view_if_needed()
        pg.locator('[data-sec=bk]').screenshot(path=S+'c5_target_backups.png')
        btns=pg.evaluate("()=>[...document.querySelectorAll('[data-sec=bk] button')].map(b=>[b.id,b.innerText.trim(),b.disabled])")
        return [det,btns]
    step('bottom',bottom)
    def hist():
        pg.click('#rHistory'); pg.wait_for_timeout(600); d=pg.evaluate(DL)
        if d: pg.locator('dialog[open]').first.screenshot(path=S+'c5_rhistory.png')
        pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
        return [d,pg.evaluate(MSG)[-3:]]
    step('rHistory',hist)
    def restoreTarget():
        bt=pg.locator('[data-sec=bk] button',has_text='복원').first
        bt.click(); pg.wait_for_timeout(800)
        d=pg.evaluate(DL)
        if d: pg.locator('dialog[open]').first.screenshot(path=S+'c5_target_restore_dialog.png')
        return [d,pg.evaluate(MSG)[-3:],pg.evaluate(CNT)]
    step('restoreTarget',restoreTarget)
    json.dump(log,open('@@W@@/work/c5_after.json','w'),ensure_ascii=False)
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:8000])
