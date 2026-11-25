import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
X='@@W@@/work/edu/교육용_창고데이터.xlsx'
log={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1400,'height':3200})
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(500)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    pg.fill('#roomWidth','14'); pg.fill('#roomHeight','8'); pg.click('#applyRoom'); pg.wait_for_timeout(400)
    pg.click('#exOpen'); pg.wait_for_timeout(400)
    pg.set_input_files('#exFileDialog',X); pg.wait_for_timeout(2500)
    pg.select_option('#wMode','fixed'); pg.wait_for_timeout(2500)
    pg.locator('label:has-text("선택한 대상 배치를 확인했습니다")').first.click(); pg.wait_for_timeout(400)
    ap=pg.locator('#exApply'); ap.scroll_into_view_if_needed()
    box=pg.evaluate("()=>{const r=document.querySelector('#exApply').closest('section,div').getBoundingClientRect();return [r.x,r.y,r.width,r.height]}")
    pg.locator('#exApply').evaluate("e=>e.parentElement.parentElement.setAttribute('data-ap','1')")
    pg.locator('[data-ap]').screenshot(path=S+'c2_apply.png')
    log['disabled']=ap.is_disabled()
    ap.click(); pg.wait_for_timeout(1500)
    log['dlg']=pg.evaluate("()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,600))")
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    pg.set_viewport_size({'width':1600,'height':950}); pg.wait_for_timeout(400)
    pg.click('#fit'); pg.wait_for_timeout(500)
    pg.screenshot(path=S+'c2_result.png')
    log['status']=pg.evaluate("()=>document.body.innerText.slice(0,700)")
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0)[:2500])
