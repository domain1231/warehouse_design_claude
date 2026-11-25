import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
log={}
MSG="()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].map(e=>e.innerText.trim()).filter(t=>t&&!/SAVED|마지막 확인|기본값은 낮음|이력 0개|적용 준비/.test(t))"
DL="()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,1200))"
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return [best.x,best.y,best.width,best.height]}"""
def step(n,f):
    try: log[n]=f()
    except Exception as e: log[n]='ERR '+str(e)[:250]
def secof(pg,sel,tag):
    return pg.locator(sel).first.evaluate(f"e=>{{let p=e;while(p.parentElement&&p.tagName!='DETAILS')p=p.parentElement;p.open=true;p.setAttribute('data-sec','{tag}');return p.innerText.slice(0,900)}}")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1600,'height':1250},accept_downloads=True); pg=ctx.new_page()
    pg.on('dialog',lambda d:(log.setdefault('native',[]).append(d.message[:200]),d.accept()))
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.click('#helpBtn'); pg.wait_for_timeout(400); pg.locator('#helpDialog').screenshot(path=S+'c0_help.png'); pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    pg.click('#newBlank'); pg.wait_for_timeout(400)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    pg.fill('#roomWidth','10'); pg.fill('#roomHeight','6'); pg.click('#applyRoom'); pg.wait_for_timeout(300); pg.click('#fit'); pg.wait_for_timeout(300)
    cv=pg.evaluate("()=>{const r=document.querySelector('#plan').getBoundingClientRect();return [r.x,r.y,r.width,r.height]}"); clip=dict(zip(['x','y','width','height'],cv))
    def bg():
        t=secof(pg,'#bgOpacity','bg')
        ctl=pg.evaluate("()=>[...document.querySelectorAll('[data-sec=bg] button,[data-sec=bg] input,[data-sec=bg] label')].map(e=>[e.tagName,e.id,(e.innerText||e.value||'').trim().slice(0,40)])")
        pg.set_input_files('#imageIn','@@W@@/work/edu/교육용_평면도.png'); pg.wait_for_timeout(1200)
        m=pg.evaluate(MSG)[-3:]; d=pg.evaluate(DL)
        pg.locator('[data-sec=bg]').screenshot(path=S+'c1_bg_panel.png')
        pg.screenshot(path=S+'c1_bg_loaded.png',clip=clip)
        return [t,ctl,m,d]
    step('bg',bg)
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    x0,y0,w,h=pg.evaluate(ROOM); sx=w/10; sy=h/6; at=lambda a,c:(x0+a*sx,y0+c*sy)
    def zones():
        r=[]
        for tool,pt in [('blocked',(2.0,4.5)),('work',(6.5,4.5))]:
            pg.click(f'button[data-tool={tool}]'); pg.wait_for_timeout(150); pg.mouse.click(*at(*pt)); pg.wait_for_timeout(400)
            r.append(pg.evaluate("()=>([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))).closest('aside').innerText.slice(0,60)"))
        pg.click('button[data-tool=rack]'); pg.mouse.click(*at(2.0,1.2)); pg.wait_for_timeout(300)
        pg.click('button[data-tool=rack]') if False else None
        # place rack into blocked zone (should be rejected)
        pg.mouse.click(*at(2.0,4.5)); pg.wait_for_timeout(300); r.append(pg.evaluate(MSG)[-1:])
        pg.click('button[data-tool=select]'); pg.mouse.click(*at(9.7,0.2)); pg.wait_for_timeout(300)
        pg.screenshot(path=S+'c1_zones.png',clip=clip)
        return r
    step('zones',zones)
    def measure():
        pg.click('button[data-tool=measure]') if pg.locator('button[data-tool=measure]').count() else pg.locator('button',has_text='거리 측정').first.click()
        pg.wait_for_timeout(200); m0=pg.evaluate(MSG)[-1:]
        a=at(1.0,3.0); c=at(9.0,3.0)
        pg.mouse.click(*a); pg.wait_for_timeout(200); pg.mouse.move(*c,steps=5); pg.mouse.click(*c); pg.wait_for_timeout(400)
        m1=pg.evaluate(MSG)[-2:]
        pg.screenshot(path=S+'c1_measure.png',clip=clip)
        pg.keyboard.press('Escape'); pg.click('button[data-tool=select]')
        return [m0,m1,pg.evaluate("()=>[...document.querySelectorAll('#plan text')].map(t=>t.textContent).filter(t=>/m$/.test(t)).slice(0,8)")]
    step('measure',measure)
    def exports():
        r={}
        for bid in ['svgOut','pngOut']:
            try:
                with pg.expect_download(timeout=8000) as d: pg.click('#'+bid)
                r[bid]=d.value.suggested_filename
            except Exception as e: r[bid]='ERR '+str(e)[:80]
        return r
    step('exports',exports)
    def inv():
        pg.click('#sBottomToggle'); pg.wait_for_timeout(400)
        pg.locator('button',has_text='재고기록').first.click(); pg.wait_for_timeout(400)
        pg.locator('#saveSnapshot').evaluate("e=>{let p=e;while(p.parentElement&&p.getBoundingClientRect().height<200)p=p.parentElement;p.setAttribute('data-sec','inv')}")
        pg.locator('[data-sec=inv]').scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        pg.locator('[data-sec=inv]').screenshot(path=S+'c6_inv_panel.png')
        t=pg.evaluate("()=>document.querySelector('[data-sec=inv]').innerText.slice(0,1200)")
        pg.locator('#saveSnapshot').evaluate("e=>e.click()"); pg.wait_for_timeout(700)
        m=pg.evaluate(MSG)[-2:]
        pg.locator('button',has_text='배치이력').first.click(); pg.wait_for_timeout(400)
        pg.locator('#bSaveLayout').evaluate("e=>{let p=e;while(p.parentElement&&p.getBoundingClientRect().height<160)p=p.parentElement;p.setAttribute('data-sec','lay')}")
        pg.locator('[data-sec=lay]').scroll_into_view_if_needed(); pg.locator('[data-sec=lay]').screenshot(path=S+'c6_layout_panel.png')
        t2=pg.evaluate("()=>document.querySelector('[data-sec=lay]').innerText.slice(0,800)")
        return [t,m,t2]
    step('inv',inv)
    json.dump(log,open('@@W@@/work/c7.json','w'),ensure_ascii=False,indent=1)
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:7000])
