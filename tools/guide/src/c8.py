import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
log={}
MSG="()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].map(e=>e.innerText.trim()).filter(t=>t&&!/SAVED|마지막 확인|기본값은 낮음|이력 \\d개|적용 준비/.test(t))"
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return [best.x,best.y,best.width,best.height]}"""
RIGHT="([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))).closest('aside')"
def step(n,f):
    try: log[n]=f()
    except Exception as e: log[n]='ERR '+str(e)[:250]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':1250}); pg.on('dialog',lambda d:(log.setdefault('native',[]).append(d.message[:200]),d.accept()))
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(400)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    pg.fill('#roomWidth','10'); pg.fill('#roomHeight','6'); pg.click('#applyRoom'); pg.wait_for_timeout(300); pg.click('#fit'); pg.wait_for_timeout(300)
    cv=pg.evaluate("()=>{const r=document.querySelector('#plan').getBoundingClientRect();return [r.x,r.y,r.width,r.height]}"); clip=dict(zip(['x','y','width','height'],cv))
    x0,y0,w,h=pg.evaluate(ROOM); sx=w/10; sy=h/6; at=lambda a,c:(x0+a*sx,y0+c*sy)
    def calib():
        pg.locator('#bgOpacity').evaluate("e=>{let p=e;while(p.parentElement&&p.tagName!='DETAILS')p=p.parentElement;p.open=true}")
        pg.set_input_files('#imageIn','@@W@@/work/edu/교육용_평면도.png'); pg.wait_for_timeout(1000)
        pg.fill('#bgOpacity','0.6') if pg.locator('#bgOpacity').get_attribute('type')!='range' else pg.locator('#bgOpacity').evaluate("e=>{e.value=0.6;e.dispatchEvent(new Event('input',{bubbles:true}))}")
        v0=pg.evaluate("()=>[bgX.value,bgY.value,bgW.value,bgH.value]")
        pg.screenshot(path=S+'c1_bg_before.png',clip=clip)
        # image px -> room m: image stretched over room; scale bar image x 100..600 of 1100 -> room x = 100/1100*10 .. 600/1100*10 ; y 690/700*6
        pg.click('#calibrate'); pg.wait_for_timeout(200); m0=pg.evaluate(MSG)[-1:]
        pg.mouse.click(*at(100/1100*float(v0[2]),690/700*float(v0[3]))); pg.wait_for_timeout(250)
        pg.mouse.click(*at(600/1100*float(v0[2]),690/700*float(v0[3]))); pg.wait_for_timeout(600)
        m1=pg.evaluate(MSG)[-2:]; v1=pg.evaluate("()=>[bgX.value,bgY.value,bgW.value,bgH.value]")
        pg.screenshot(path=S+'c1_bg_after.png',clip=clip)
        return [v0,m0,m1,v1]
    step('calib',calib)
    pg.click('#clearBg') if False else None
    def review_click():
        pg.locator('label:has-text("공간 위반을 경고 후 허용")').first.click()
        pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.click('button[data-tool=rack]')
        pg.mouse.click(*at(3,3)); pg.wait_for_timeout(250); pg.mouse.click(*at(3.4,3.1)); pg.wait_for_timeout(300)
        pg.click('button[data-tool=select]'); pg.mouse.click(*at(9.6,0.3)); pg.wait_for_timeout(300)
        before=pg.evaluate("()=>"+RIGHT+".innerText.slice(0,20)")
        pg.click('#sBottomToggle'); pg.wait_for_timeout(400)
        items=pg.evaluate("()=>{const h=[...document.querySelectorAll('h2')].find(h=>h.innerText.trim()=='공간 검토');const sec=h?h.parentElement.parentElement:null;return sec?[...sec.querySelectorAll('button,li,tr,[role=button]')].map(e=>e.tagName+':'+e.innerText.trim().slice(0,80)).slice(0,10):[]}")
        btn=pg.locator('button',has_text='충돌').first
        n=btn.count()
        if n: btn.click(); pg.wait_for_timeout(400)
        after=pg.evaluate("()=>"+RIGHT+".innerText.slice(0,40)")
        # violation dialog row click
        pg.evaluate("()=>document.querySelector('#wViolations').click()"); pg.wait_for_timeout(500)
        rows=pg.evaluate("()=>[...document.querySelectorAll('#wDialog tbody tr, #wDialog button')].map(e=>e.tagName+':'+e.innerText.trim().slice(0,60)).slice(0,8)")
        cand=pg.locator('#wDialog button').filter(has_text='R-').first
        res=None
        if cand.count(): cand.click(); pg.wait_for_timeout(500); res=[pg.evaluate("()=>"+RIGHT+".innerText.slice(0,40)"),pg.evaluate("()=>!!document.querySelector('#wDialog[open]')")]
        pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
        return [before,items,n,after,rows,res]
    step('review',review_click)
    json.dump(log,open('@@W@@/work/c8.json','w'),ensure_ascii=False,indent=1)
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:5000])
