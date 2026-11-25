import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
log={}
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return best?[best.x,best.y,best.width,best.height]:null}"""
def dlgs(pg): return pg.evaluate("()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,500))")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':950})
    pg.on('dialog',lambda d:d.accept())
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(500)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(700)
    pg.screenshot(path=S+'c1_blank.png')
    log['blank_room']=[pg.input_value('#roomWidth'),pg.input_value('#roomHeight')]
    pg.fill('#roomWidth','10'); pg.fill('#roomHeight','6'); pg.wait_for_timeout(200)
    pg.locator('#applyRoom').evaluate("e=>{let p=e;while(p.parentElement&&p.tagName!='DETAILS')p=p.parentElement;p.setAttribute('data-sec','room')}")
    pg.locator('[data-sec=room]').screenshot(path=S+'c1_room_input.png')
    pg.click('#applyRoom'); pg.wait_for_timeout(500); log['dlg_room']=dlgs(pg)
    pg.click('#fit'); pg.wait_for_timeout(400)
    pg.screenshot(path=S+'c1_room_applied.png')
    log['kpi']=pg.evaluate("()=>document.body.innerText.slice(300,700)")
    rr=pg.evaluate(ROOM); log['room_rect']=rr
    x0,y0,w,h=rr; sx=w/10; sy=h/6
    def at(mx,my): return (x0+mx*sx, y0+my*sy)
    # door on bottom wall, column inside
    pg.click('button[data-tool=door]'); pg.wait_for_timeout(200)
    pg.mouse.click(*at(8.5,5.98)); pg.wait_for_timeout(400); log['dlg_door']=dlgs(pg)
    pg.click('button[data-tool=column]'); pg.wait_for_timeout(200)
    pg.mouse.click(*at(5,3)); pg.wait_for_timeout(400)
    # tool panel crop
    pg.locator('button[data-tool=rack]').evaluate("e=>{let p=e;while(p.parentElement&&p.tagName!='DETAILS')p=p.parentElement;p.setAttribute('data-sec','tools')}")
    pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.fill('#newHeight','2')
    pg.click('button[data-tool=rack]'); pg.wait_for_timeout(200)
    pg.locator('[data-sec=tools]').screenshot(path=S+'c1_tools.png')
    for mx,my in [(1.5,1.5),(3.5,1.5),(1.5,4)]:
        pg.mouse.click(*at(mx,my)); pg.wait_for_timeout(400)
    log['dlg_rack']=dlgs(pg)
    pg.click('button[data-tool=select]'); pg.wait_for_timeout(200)
    pg.screenshot(path=S+'c1_racks.png')
    # select second rack
    pg.mouse.click(*at(3.5+0.0,1.5)); pg.wait_for_timeout(500)
    pg.screenshot(path=S+'c1_selected.png')
    log['right_inputs']=pg.evaluate("()=>{const a=([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))||document.body).closest('aside');return [...a.querySelectorAll('input,select,button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>[e.tagName,e.id,e.type||'',(e.closest('label')?.innerText||e.innerText||'').trim().slice(0,30),e.value?.slice?.(0,20)])}")
    log['right_text']=pg.evaluate("()=>([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))||document.body).closest('aside').innerText.slice(0,1500)")
    pg.evaluate("()=>([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))||document.body).closest('aside').setAttribute('data-sec','right')")
    pg.locator('[data-sec=right]').screenshot(path=S+'c1_right.png')
    json.dump(log,open('@@W@@/work/c1_shoot.json','w'),ensure_ascii=False)
    pg.context.storage_state(path='@@W@@/work/c1_state.json')
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:5000])
