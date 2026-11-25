import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
X='@@W@@/work/edu/교육용_창고데이터.xlsx'
log={}
DL="()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,1500))"
MSG="()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].map(e=>e.innerText.trim()).filter(t=>t&&!/SAVED|마지막 확인|기본값은 낮음|이력 0개/.test(t))"
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
    pg.fill('#roomWidth','14'); pg.fill('#roomHeight','8'); pg.click('#applyRoom'); pg.wait_for_timeout(300)
    pg.click('#exOpen'); pg.wait_for_timeout(300); pg.set_input_files('#exFileDialog',X); pg.wait_for_timeout(2500)
    pg.select_option('#wMode','fixed'); pg.wait_for_timeout(2000)
    pg.fill('#exColumnGap','0.6') if False else None
    pg.locator('label:has-text("선택한 대상 배치를 확인했습니다")').first.click(); pg.click('#exApply'); pg.wait_for_timeout(1500)
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    pg.click('#fit'); pg.wait_for_timeout(400)
    cv=pg.evaluate("()=>{const r=document.querySelector('#plan').getBoundingClientRect();return [r.x,r.y,r.width,r.height]}"); clip=dict(zip(['x','y','width','height'],cv))
    racks=pg.evaluate("()=>[...document.querySelectorAll('#plan [data-id]')].map(e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,r.width,r.height]}).filter(x=>x[2]>15&&x[3]>15)")
    def sel(i): pg.mouse.click(racks[i][0],racks[i][1]); pg.wait_for_timeout(350); pg.evaluate("()=>"+RIGHT+".setAttribute('data-sec','right')")
    def pol():
        sel(0); r={}
        for v in ['weightedMax','meanMax','max']:
            pg.select_option('#exHeightPolicy',v); pg.wait_for_timeout(400)
            t=pg.evaluate("()=>"+RIGHT+".innerText")
            r[v]=[l for l in t.split('\n') if '높이' in l][:6]
        pg.select_option('#exHeightPolicy','weightedMax'); return r
    step('policy',pol)
    def qty():
        out=[]
        for i,(mx,cur) in enumerate([(100,95),(100,40),(100,120),(100,0),(100,70)]):
            sel(i)
            m=pg.locator('[data-sec=right] label:has-text("최대 수량") input').first; c=pg.locator('[data-sec=right] label:has-text("현재 수량") input').first
            m.fill(str(mx)); m.press('Enter'); c.fill(str(cur)); c.press('Enter'); pg.wait_for_timeout(300)
            out.append(pg.evaluate("()=>"+RIGHT+".innerText.split('\\n').slice(2,6).join(' / ')"))
        pg.mouse.click(cv[0]+cv[2]/2, cv[1]+cv[3]*0.55); pg.wait_for_timeout(300)
        pg.select_option('#exViz','inventory'); pg.select_option('#vLabelMode','occupancy'); pg.wait_for_timeout(500)
        pg.screenshot(path=S+'c6_qty_colors.png',clip=clip)
        pg.screenshot(path=S+'c6_kpi_qty.png',clip={'x':0,'y':135,'width':1600,'height':135})
        pg.select_option('#vLabelMode','rack-code')
        return out
    step('qty',qty)
    def zone():
        sel(0); z=pg.locator('#qZoneName'); v0=z.input_value(); z.fill('원자재'); pg.click('#qZoneApply'); pg.wait_for_timeout(500)
        pg.mouse.click(cv[0]+cv[2]/2, cv[1]+cv[3]*0.55); pg.wait_for_timeout(300)
        pg.select_option('#qLabelLayout','stacked'); pg.wait_for_timeout(400)
        pg.screenshot(path=S+'c6_zone.png',clip=clip)
        t=pg.evaluate("()=>[...document.querySelectorAll('#plan text')].map(t=>t.textContent).slice(0,10).join('|')")
        pg.select_option('#qLabelLayout','auto')
        return [v0,t,pg.evaluate(MSG)[-2:]]
    step('zone',zone)
    def snap():
        pg.click('#sBottomToggle'); pg.wait_for_timeout(400)
        btn=pg.locator('button',has_text='재고기록').first; btn.click(); pg.wait_for_timeout(400)
        sec=btn.evaluate("e=>{let p=e.parentElement;while(p&&p.innerText.length<300)p=p.parentElement;p.setAttribute('data-sec','inv');return p.innerText.slice(0,1500)}")
        pg.locator('[data-sec=inv]').scroll_into_view_if_needed(); pg.locator('[data-sec=inv]').screenshot(path=S+'c6_inv_panel.png')
        pg.evaluate("()=>document.querySelector('#saveSnapshot').click()"); pg.wait_for_timeout(700)
        d=pg.evaluate(DL); m=pg.evaluate(MSG)[-2:]
        return [sec,d,m]
    step('snapshot',snap)
    def past():
        # change qty of rack 0 then view history date
        sel(0); c=pg.locator('[data-sec=right] label:has-text("현재 수량") input').first; c.fill('10'); c.press('Enter'); pg.wait_for_timeout(300)
        pg.evaluate("()=>{historyDate.value='2026-11-16';historyDate.dispatchEvent(new Event('change',{bubbles:true}));historyDate.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(700)
        modes=pg.evaluate("()=>[...historyMode.options].map(o=>[o.value,o.text])")
        st=pg.evaluate("()=>document.querySelector('#liveBtn').getBoundingClientRect().width>0")
        txt=pg.evaluate(MSG)[-3:]
        pg.screenshot(path=S+'c6_past_full.png')
        # try edit while past
        pg.mouse.click(racks[1][0],racks[1][1]); pg.wait_for_timeout(300); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(300)
        m2=pg.evaluate(MSG)[-2:]
        hdr=pg.evaluate("()=>document.querySelector('.r-toolbar').innerText.split('\\n')[0]")
        if st: pg.click('#liveBtn'); pg.wait_for_timeout(500)
        return [modes,st,txt,m2,hdr,pg.evaluate("()=>document.querySelector('.r-toolbar').innerText.split('\\n')[0]")]
    step('past',past)
    json.dump(log,open('@@W@@/work/c6b.json','w'),ensure_ascii=False,indent=1)
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:7000])
