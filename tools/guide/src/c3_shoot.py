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
    for pt in [(1.2,1.0),(3.1,1.4),(4.6,0.9),(6.9,1.6)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(300)
    pg.click('button[data-tool=select]'); pg.mouse.click(*at(9.5,5.5)); pg.wait_for_timeout(300)
    a=at(0.3,0.3); c=at(8.2,2.6)
    pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c,steps=8); pg.mouse.up(); pg.wait_for_timeout(400)
    pg.evaluate("()=>"+RIGHT+".setAttribute('data-sec','right')")
    pg.screenshot(path=S+'c3_multi_panel.png',clip=dict(zip(['x','y','width','height'],pg.evaluate("()=>{const r="+RIGHT+".getBoundingClientRect();return [r.x,r.y,r.width,Math.min(r.height,620)]}"))))
    # 위쪽 정렬
    def top():
        pg.locator('[data-sec=right] button',has_text='위쪽 정렬').first.click(); pg.wait_for_timeout(600)
        pg.locator('#mEditDialog').screenshot(path=S+'c3_dlg_top.png')
        sel=pg.evaluate("()=>[...document.querySelectorAll('#mEditDialog select,#mEditDialog input')].filter(e=>e.getBoundingClientRect().width>0).map(e=>[e.id,e.tagName,e.type,e.value,(e.closest('label')?.innerText||'').split('\\n')[0]])")
        pg.click('#mEditApply'); pg.wait_for_timeout(600)
        pg.screenshot(path=S+'c3_after_top.png',clip=clip)
        return [sel,pg.evaluate(MSG)]
    step('top',top)
    def gapx():
        pg.locator('[data-sec=right] button',has_text='가로 간격').first.click(); pg.wait_for_timeout(600)
        gi=pg.locator('#mEditDialog label:has-text("외곽 사이 간격") input').first
        gi.fill('0.3'); gi.press('Tab'); pg.wait_for_timeout(200)
        pg.click('#mPreviewRefresh'); pg.wait_for_timeout(600)
        pg.locator('#mEditDialog').screenshot(path=S+'c3_dlg_gap.png')
        txt=pg.evaluate("()=>document.querySelector('#mEditDialog').innerText.slice(-400)")
        pg.click('#mEditApply'); pg.wait_for_timeout(600)
        pg.screenshot(path=S+'c3_after_gap.png',clip=clip)
        return [txt,pg.evaluate(MSG)]
    step('gap',gapx)
    # single select & arrow keys
    def keys():
        pg.mouse.click(*at(9.5,5.5)); pg.wait_for_timeout(200)
        # click first rack: find its center via right panel coords unknown; click near left
        pg.mouse.click(*at(0.6+0.6,1.15)); pg.wait_for_timeout(400)
        xi=pg.locator('[data-sec=right] label:has-text("X (m)") input').first
        v0=xi.input_value()
        pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(200); v1=xi.input_value()
        pg.keyboard.press('Shift+ArrowRight'); pg.wait_for_timeout(200); v2=xi.input_value()
        pg.keyboard.press('Control+z'); pg.wait_for_timeout(300); v3=xi.input_value()
        return [v0,v1,v2,v3,pg.evaluate("()=>"+RIGHT+".innerText.slice(0,40)")]
    step('keys',keys)
    json.dump(log,open('@@W@@/work/c3_shoot.json','w'),ensure_ascii=False)
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:4000])
