import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
log={}
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return best?[best.x,best.y,best.width,best.height]:null}"""
RIGHT="([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))).closest('aside')"
def status(pg): return pg.evaluate("()=>document.querySelector('#wTop')?.innerText||''")
NOTOAST="()=>document.querySelectorAll('[role=status],[role=alert],[aria-live]').forEach(e=>{if(/전체 취소/.test(e.innerText||''))e.style.visibility='hidden'})"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':1250})
    pg.on('dialog',lambda d:d.accept())
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(500)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(700)
    pg.fill('#roomWidth','10'); pg.fill('#roomHeight','6'); pg.click('#applyRoom'); pg.wait_for_timeout(500)
    pg.click('#fit'); pg.wait_for_timeout(400)
    cv=pg.evaluate("()=>{const r=document.querySelector('#plan').getBoundingClientRect();return [r.x,r.y,r.width,r.height]}"); log['cv']=cv
    clip={'x':cv[0],'y':cv[1],'width':cv[2],'height':cv[3]}
    pg.evaluate(NOTOAST); pg.screenshot(path=S+'c1_s_room.png',clip=clip)
    log['kpi_room']=pg.evaluate("()=>{const t=[...document.querySelectorAll('*')].find(e=>e.children.length==0&&e.textContent.trim()=='전체 창고 면적');return t.parentElement.innerText}")
    x0,y0,w,h=pg.evaluate(ROOM); sx=w/10; sy=h/6; log['scale']=[sx,sy]
    at=lambda mx,my:(x0+mx*sx,y0+my*sy)
    tries=[]
    pg.click('button[data-tool=door]'); pg.wait_for_timeout(150)
    pg.mouse.click(*at(8.5,5.75)); pg.wait_for_timeout(250)
    tries.append(pg.evaluate("()=>[...document.querySelectorAll('[role=status],[role=alert],.toast,[aria-live]')].map(e=>e.innerText.trim()).filter(Boolean)"))
    pg.evaluate(NOTOAST); pg.screenshot(path=S+'c1_s_door_reject.png')
    log['policy']=pg.evaluate("()=>document.querySelector('#collisionPolicy').selectedOptions[0].text")
    tries.append(pg.evaluate("()=>document.querySelector('button[data-tool=door]').className"))
    if 'active' not in tries[-1] and 'on' not in tries[-1]: pg.click('button[data-tool=door]'); pg.wait_for_timeout(150)
    pg.mouse.click(*at(8.5,5.3)); pg.wait_for_timeout(400)
    tries.append(pg.evaluate("()=>"+RIGHT+".innerText.slice(0,40)"))
    log['door_tries']=tries
    pg.click('button[data-tool=column]'); pg.wait_for_timeout(150); pg.mouse.click(*at(5,3)); pg.wait_for_timeout(400)
    log['col']=pg.evaluate("()=>"+RIGHT+".innerText.slice(0,60)")
    pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.fill('#newHeight','2')
    pg.click('button[data-tool=rack]'); pg.wait_for_timeout(150)
    for pt in [(1.5,1.5),(3.5,1.5),(1.5,4)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(350)
    pg.click('button[data-tool=select]'); pg.wait_for_timeout(200)
    pg.mouse.click(*at(9.7,0.3)); pg.wait_for_timeout(300)  # empty click to deselect
    pg.evaluate(NOTOAST); pg.screenshot(path=S+'c1_s_racks.png',clip=clip)
    log['status_racks']=status(pg)
    # select rack 2 & edit coords
    pg.mouse.click(*at(3.5,1.5)); pg.wait_for_timeout(400)
    pg.evaluate("()=>"+RIGHT+".setAttribute('data-sec','right')")
    pg.evaluate(NOTOAST); pg.screenshot(path=S+'c1_s_right.png',clip=dict(zip(['x','y','width','height'],pg.evaluate("()=>{const r="+RIGHT+".getBoundingClientRect();return [r.x,r.y,r.width,Math.min(r.height,560)]}"))))
    xi=pg.locator('[data-sec=right] label:has-text("X (m)") input').first
    yi=pg.locator('[data-sec=right] label:has-text("Y (m)") input').first
    log['xy_before']=[xi.input_value(),yi.input_value()]
    xi.fill('3'); xi.press('Enter'); yi.fill('1'); yi.press('Enter'); pg.wait_for_timeout(400)
    log['xy_after']=[xi.input_value(),yi.input_value()]
    pg.evaluate(NOTOAST); pg.screenshot(path=S+'c1_s_xy.png',clip=clip)
    # drag rack 3
    sxp,syp=at(1.5,4); ex,ey=at(6.5,4)
    pg.mouse.click(9,9) if False else None
    pg.mouse.move(sxp,syp); pg.mouse.down(); pg.mouse.move((sxp+ex)/2,syp,steps=6); pg.mouse.move(ex,ey,steps=6); pg.wait_for_timeout(150)
    pg.evaluate(NOTOAST); pg.screenshot(path=S+'c1_s_dragging.png',clip=clip)
    pg.mouse.up(); pg.wait_for_timeout(400)
    log['xy_r3']=[pg.locator('[data-sec=right] label:has-text("X (m)") input').first.input_value(),pg.locator('[data-sec=right] label:has-text("Y (m)") input').first.input_value()]
    pg.evaluate(NOTOAST); pg.screenshot(path=S+'c1_s_dragged.png',clip=clip)
    # overlap test: move rack3 onto column
    pg.keyboard.press('Control+s'); pg.wait_for_timeout(700)
    log['toast']=pg.evaluate("()=>[...document.querySelectorAll('[role=status],.toast,[aria-live]')].map(e=>e.innerText.trim()).filter(Boolean).slice(0,5)")
    pg.evaluate(NOTOAST); pg.screenshot(path=S+'c1_s_saved_full.png')
    pg.evaluate(NOTOAST); pg.screenshot(path=S+'c1_s_header.png',clip={'x':0,'y':0,'width':1600,'height':100})
    log['status_end']=status(pg)
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0))
