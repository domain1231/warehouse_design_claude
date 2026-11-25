import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
log={}
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return [best.x,best.y,best.width,best.height]}"""
RIGHT="([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))).closest('aside')"
MSG="()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].map(e=>e.innerText.trim()).filter(t=>t&&!/SAVED|마지막 확인|기본값은 낮음|이력 0개|복원 완료/.test(t))"
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
    pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.click('button[data-tool=rack]')
    for pt in [(1.2,1.0),(3.0,1.0),(4.8,1.0),(1.2,5.0),(3.0,5.0)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(250)
    # aisle tool
    def aisle():
        pg.click('button[data-tool=aisle]'); pg.wait_for_timeout(150); pg.mouse.click(*at(3.0,3.0)); pg.wait_for_timeout(500)
        pg.evaluate("()=>"+RIGHT+".setAttribute('data-sec','right')")
        t=pg.evaluate("()=>"+RIGHT+".innerText.slice(0,1500)")
        ins=pg.evaluate("()=>[...document.querySelectorAll('[data-sec=right] input,[data-sec=right] select,[data-sec=right] button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>[e.id,e.tagName,(e.closest('label')?.innerText||e.innerText||'').split('\\n')[0].slice(0,30),e.value?.slice?.(0,20)])")
        pg.screenshot(path=S+'c3_aisle_right.png',clip=dict(zip(['x','y','width','height'],pg.evaluate("()=>{const r="+RIGHT+".getBoundingClientRect();return [r.x,r.y,r.width,Math.min(r.height,700)]}"))))
        return [t,ins,pg.evaluate(MSG)]
    step('aisle',aisle)
    def setaisle():
        # set aisle as full-width horizontal 1.0 tall: X0.2 Y2.5 W9.6 D1.0? fields names
        def f(lbl,v):
            el=pg.locator(f'[data-sec=right] label:has-text("{lbl}") input').first; el.fill(v); el.press('Enter'); pg.wait_for_timeout(200)
        f('X (m)','0.2'); f('Y (m)','2.6'); f('폭 (m)','9.6'); f('깊이 (m)','0.9')
        pg.click('button[data-tool=select]'); pg.mouse.click(*at(9.7,0.2)); pg.wait_for_timeout(300)
        pg.screenshot(path=S+'c3_aisle_set.png',clip=clip)
        return [pg.evaluate("()=>document.querySelector('#wTop').innerText"),pg.evaluate(MSG)]
    step('setaisle',setaisle)
    def validate():
        pg.click('#mValidate'); pg.wait_for_timeout(700)
        d=pg.evaluate("()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,1500))")
        if d: pg.locator('dialog[open]').first.screenshot(path=S+'c3_validate.png')
        return [d,pg.evaluate(MSG)]
    step('validate',validate)
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    # move rack into aisle under block policy
    def block():
        pg.mouse.click(*at(3.0,5.0)); pg.wait_for_timeout(300)
        s=at(3.0,5.0); e=at(3.0,3.0)
        pg.mouse.move(*s); pg.mouse.down(); pg.mouse.move(*e,steps=8); pg.mouse.up(); pg.wait_for_timeout(500)
        m=pg.evaluate(MSG); pg.screenshot(path=S+'c3_block_full.png')
        return [m,pg.evaluate("()=>document.querySelector('#wTop').innerText")]
    step('block',block)
    def allow():
        pg.locator('label:has-text("공간 위반을 경고 후 허용")').first.click(); pg.wait_for_timeout(300)
        s=at(3.0,5.0); e=at(3.0,3.0)
        pg.mouse.move(*s); pg.mouse.down(); pg.mouse.move(*e,steps=8); pg.mouse.up(); pg.wait_for_timeout(600)
        m=pg.evaluate(MSG); pg.mouse.click(*at(9.7,0.2)); pg.wait_for_timeout(300)
        pg.screenshot(path=S+'c3_violation.png',clip=clip)
        pg.screenshot(path=S+'c3_status.png',clip={'x':0,'y':135,'width':1600,'height':135})
        return [m,pg.evaluate("()=>document.querySelector('#wTop').innerText")]
    step('allow',allow)
    def vlist():
        pg.click('#wViolations'); pg.wait_for_timeout(600)
        d=pg.evaluate("()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,1500))")
        pg.locator('dialog[open]').first.screenshot(path=S+'c3_vlist.png')
        return d
    step('vlist',vlist)
    def polygon():
        pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
        pg.click('#mPolygonAisle'); pg.wait_for_timeout(300); m0=pg.evaluate(MSG)
        for pt in [(6.6,0.3),(9.7,0.3),(9.7,5.7),(8.6,5.7),(8.6,1.4),(6.6,1.4)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(200)
        pg.screenshot(path=S+'c3_poly_drawing.png',clip=clip)
        pg.click('#mFinishPolygon'); pg.wait_for_timeout(600)
        m1=pg.evaluate(MSG)
        pg.screenshot(path=S+'c3_poly_done.png',clip=clip)
        return [m0,m1,pg.evaluate("()=>"+RIGHT+".innerText.slice(0,500)")]
    step('polygon',polygon)
    def rules():
        el=pg.locator('#mApplyAisleRule').evaluate("e=>{let p=e;while(p.parentElement&&p.tagName!='SECTION'&&p.tagName!='DETAILS')p=p.parentElement;p.setAttribute('data-sec','aislerule');return p.innerText.slice(0,600)}")
        pg.locator('[data-sec=aislerule]').screenshot(path=S+'c3_aisle_rule.png')
        return el
    step('rules',rules)
    json.dump(log,open('@@W@@/work/c3_aisle.json','w'),ensure_ascii=False)
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:7000])
