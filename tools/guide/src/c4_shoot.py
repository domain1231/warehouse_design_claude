import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
log={}
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return [best.x,best.y,best.width,best.height]}"""
RIGHT="([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))).closest('aside')"
MSG="()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].map(e=>e.innerText.trim()).filter(t=>t&&!/SAVED|마지막 확인|기본값은 낮음|이력 0개|복원 완료/.test(t))"
DL="()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,3000))"
BAR="()=>document.querySelector('.r-toolbar').innerText"
def step(name,fn):
    try: log[name]=fn()
    except Exception as e: log[name]='ERR '+str(e)[:300]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':1250}); pg.on('dialog',lambda d:(log.setdefault('native',[]).append(d.message),d.accept()))
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(500)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(700)
    pg.click('#rBefore'); pg.wait_for_timeout(400)
    log['before_room_initial']=[pg.input_value('#roomWidth'),pg.input_value('#roomHeight')]
    pg.click('#fit'); pg.wait_for_timeout(300)
    cv=pg.evaluate("()=>{const r=document.querySelector('#plan').getBoundingClientRect();return [r.x,r.y,r.width,r.height]}"); clip=dict(zip(['x','y','width','height'],cv))
    bar=pg.evaluate("()=>{const r=document.querySelector('.r-toolbar').getBoundingClientRect();return {x:r.x,y:r.y-30,width:r.width,height:r.height+30}}")
    pg.screenshot(path=S+'c4_bar_locked.png',clip=bar)
    x0,y0,w,h=pg.evaluate(ROOM); sx=w/10; sy=h/6; at=lambda mx,my:(x0+mx*sx,y0+my*sy)
    pg.click('#rLock'); pg.wait_for_timeout(500)
    pg.screenshot(path=S+'c4_bar_unlocked.png',clip=bar); log['bar_unlocked']=pg.evaluate(BAR)
    pg.fill('#roomWidth','10'); pg.fill('#roomHeight','6'); pg.click('#applyRoom'); pg.wait_for_timeout(400); pg.click('#fit'); pg.wait_for_timeout(300)
    x0,y0,w,h=pg.evaluate(ROOM); sx=w/10; sy=h/6
    pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.click('button[data-tool=rack]')
    for pt in [(1.2,1.0),(3.3,1.3),(5.0,0.9),(1.4,3.2),(4.2,3.6),(7.5,2.2)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(250)
    pg.click('button[data-tool=select]'); pg.mouse.click(*at(9.6,5.6)); pg.wait_for_timeout(300)
    log['before_status']=pg.evaluate("()=>document.querySelector('#wTop').innerText.slice(0,90)")
    pg.screenshot(path=S+'c4_before.png',clip=clip)
    pg.click('#rLock'); pg.wait_for_timeout(500); log['bar_relocked']=pg.evaluate(BAR)
    def clone():
        pg.click('#rClone'); pg.wait_for_timeout(800); d=pg.evaluate(DL)
        if d:
            pg.locator('dialog[open]').first.screenshot(path=S+'c4_clone_dialog.png')
        ctl=pg.evaluate("()=>[...document.querySelectorAll('dialog[open] button, dialog[open] input, dialog[open] select')].map(b=>[b.id,b.tagName,b.type,(b.innerText||'').trim().slice(0,40),b.value?.slice?.(0,20),b.disabled,(b.closest('label')?.innerText||'').slice(0,70)])")
        return [d,ctl,pg.evaluate(MSG)]
    step('clone',clone)
    def doclone():
        # tick any required checkboxes then click primary apply
        pg.evaluate("()=>document.querySelectorAll('dialog[open] input[type=checkbox]').forEach(c=>{if(!c.checked)c.click()})"); pg.wait_for_timeout(300)
        btn=pg.evaluate("()=>{const bs=[...document.querySelectorAll('dialog[open] button')].filter(b=>!b.disabled&&/복제|적용|실행/.test(b.innerText));return bs.map(b=>b.id+'|'+b.innerText.trim())}")
        if btn: pg.click('#'+btn[-1].split('|')[0]); pg.wait_for_timeout(800)
        return [btn,pg.evaluate(MSG),pg.evaluate(BAR),pg.evaluate(DL)]
    step('doclone',doclone)
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    log['scenario']=pg.evaluate("()=>scenario.selectedOptions[0].text")
    if 'After' not in log['scenario']: pg.click('#rAfter'); pg.wait_for_timeout(500)
    pg.click('#fit'); pg.wait_for_timeout(300)
    x0,y0,w,h=pg.evaluate(ROOM); sx=w/10; sy=h/6
    pg.screenshot(path=S+'c4_after_cloned.png',clip=clip)
    # improve AFTER: select all & top align + gap, then second row
    def improve():
        a=at(0.3,0.3); c=at(6.4,2.0)
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c,steps=8); pg.mouse.up(); pg.wait_for_timeout(400)
        pg.evaluate("()=>"+RIGHT+".setAttribute('data-sec','right')")
        pg.locator('[data-sec=right] button',has_text='위쪽 정렬').first.click(); pg.wait_for_timeout(500); pg.click('#mEditApply'); pg.wait_for_timeout(500)
        pg.locator('[data-sec=right] button',has_text='가로 간격').first.click(); pg.wait_for_timeout(500)
        gi=pg.locator('#mEditDialog label:has-text("외곽 사이 간격") input').first; gi.fill('0.2'); gi.press('Tab'); pg.click('#mPreviewRefresh'); pg.wait_for_timeout(400); pg.click('#mEditApply'); pg.wait_for_timeout(500)
        # add 2 racks in AFTER
        pg.click('button[data-tool=rack]')
        for pt in [(6.0,1.0),(7.5,1.0)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(250)
        pg.click('button[data-tool=select]'); pg.mouse.click(*at(9.6,5.6)); pg.wait_for_timeout(300)
        pg.screenshot(path=S+'c4_after_improved.png',clip=clip)
        return [pg.evaluate("()=>document.querySelector('#wTop').innerText.slice(0,90)"),pg.evaluate(MSG)]
    step('improve',improve)
    def compare():
        pg.set_viewport_size({'width':1600,'height':2600}); pg.wait_for_timeout(300)
        pg.click('#compareBtn'); pg.wait_for_timeout(900); d=pg.evaluate(DL)
        pg.locator('#compareDialog').screenshot(path=S+'c4_compare.png')
        pg.select_option('#rCompareMode',index=3); pg.wait_for_timeout(600)
        pg.locator('#compareDialog').screenshot(path=S+'c4_compare_overlay.png')
        sv=pg.evaluate("()=>[...document.querySelectorAll('#compareDialog svg')].map(s=>{const r=s.getBoundingClientRect();return [r.width,r.height]})")
        return [d,sv,pg.evaluate("()=>rCompareMode.selectedOptions[0].text")]
    step('compare',compare)
    json.dump(log,open('@@W@@/work/c4_shoot.json','w'),ensure_ascii=False)
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:9000])
