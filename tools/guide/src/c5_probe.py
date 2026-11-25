import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
log={}
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return [best.x,best.y,best.width,best.height]}"""
RIGHT="([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))).closest('aside')"
MSG="()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].map(e=>e.innerText.trim()).filter(t=>t&&!/SAVED|마지막 확인|기본값은 낮음|이력 0개|복원 완료 · 저장 후 읽기 확인$/.test(t))"
DL="()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,2500))"
CNT="()=>document.querySelector('#wTop').innerText.split('·')[0]"
def step(name,fn):
    try: log[name]=fn()
    except Exception as e: log[name]='ERR '+str(e)[:300]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1600,'height':1250},accept_downloads=True); pg=ctx.new_page()
    pg.on('dialog',lambda d:(log.setdefault('native',[]).append(d.message),d.accept()))
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(500)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(700)
    pg.fill('#roomWidth','10'); pg.fill('#roomHeight','6'); pg.click('#applyRoom'); pg.wait_for_timeout(300); pg.click('#fit'); pg.wait_for_timeout(300)
    cv=pg.evaluate("()=>{const r=document.querySelector('#plan').getBoundingClientRect();return [r.x,r.y,r.width,r.height]}"); clip=dict(zip(['x','y','width','height'],cv))
    x0,y0,w,h=pg.evaluate(ROOM); sx=w/10; sy=h/6; at=lambda mx,my:(x0+mx*sx,y0+my*sy)
    pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.click('button[data-tool=rack]')
    for pt in [(1.2,1.0),(3.0,1.0),(4.8,1.0),(1.2,3.0),(3.0,3.0)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(250)
    pg.click('button[data-tool=select]'); pg.mouse.click(*at(9.6,5.6)); pg.wait_for_timeout(200)
    log['n0']=pg.evaluate(CNT)
    # JSON backup download
    def jsonb():
        with pg.expect_download() as d: pg.click('#jsonOut')
        return d.value.suggested_filename
    step('json_name',jsonb)
    # delete 2 racks
    def del2():
        a=at(0.3,2.5); c=at(4.0,3.6); pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c,steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
        pg.click('#delete'); pg.wait_for_timeout(600)
        d=pg.evaluate(DL)
        if d: pg.locator('dialog[open]').first.screenshot(path=S+'c5_delete_confirm.png')
        btns=pg.evaluate("()=>[...document.querySelectorAll('dialog[open] button')].map(b=>[b.id,b.innerText.trim()])")
        return [d,btns,pg.evaluate(MSG)]
    step('del2',del2)
    def confirmdel():
        btn=pg.evaluate("()=>{const b=[...document.querySelectorAll('dialog[open] button')].find(b=>/삭제/.test(b.innerText)&&!/취소/.test(b.innerText));return b?b.id||b.innerText:null}")
        if btn: pg.locator('dialog[open] button',has_text='삭제').last.click(); pg.wait_for_timeout(600)
        return [btn,pg.evaluate(CNT),pg.evaluate(MSG)]
    step('confirmdel',confirmdel)
    def undo():
        pg.keyboard.press('Control+z'); pg.wait_for_timeout(500); a=pg.evaluate(CNT)
        pg.keyboard.press('Control+y'); pg.wait_for_timeout(500); bb=pg.evaluate(CNT)
        return [a,bb]
    step('undo',undo)
    def versions():
        pg.click('#vVersions'); pg.wait_for_timeout(600)
        pg.locator('#vBackupDialog').screenshot(path=S+'c5_versions.png')
        btns=pg.evaluate("()=>[...document.querySelectorAll('#vBackupDialog button')].map(b=>[b.id,b.innerText.trim(),b.disabled])")
        return [pg.evaluate(DL),btns]
    step('versions',versions)
    def restore():
        btn=pg.locator('#vBackupDialog button',has_text='복원').first
        btn.click(); pg.wait_for_timeout(800)
        return [pg.evaluate(DL),pg.evaluate(MSG),pg.evaluate(CNT)]
    step('restore',restore)
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    log['n_after_restore']=pg.evaluate(CNT)
    json.dump(log,open('@@W@@/work/c5_probe.json','w'),ensure_ascii=False)
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:8000])
