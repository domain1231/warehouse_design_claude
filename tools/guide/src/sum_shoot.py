from playwright.sync_api import sync_playwright
import json
X='@@W@@/work/edu/교육용_창고데이터_Summary대조.xlsx'; S='@@W@@/shots/g/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1600,'height':1250},accept_downloads=True); pg=ctx.new_page(); pg.on('dialog',lambda d:d.accept())
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1300)
    pg.click('#newBlank'); pg.wait_for_timeout(400)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    pg.fill('#roomWidth','14'); pg.fill('#roomHeight','8'); pg.click('#applyRoom'); pg.wait_for_timeout(300)
    pg.click('#exOpen'); pg.wait_for_timeout(300); pg.set_input_files('#exFileDialog',X); pg.wait_for_timeout(2500)
    pg.select_option('#wMode','fixed'); pg.wait_for_timeout(2500)
    t=pg.evaluate("""()=>{const d=document.querySelector('dialog[open]');const c=[...d.querySelectorAll('*')].filter(e=>/Summary/.test(e.innerText||'')&&e.innerText.length<2500&&e.children.length>1);c.sort((a,b)=>a.innerText.length-b.innerText.length);const e=c.find(e=>/F4/.test(e.innerText)&&/CSV/.test(e.innerText))||c.find(e=>/F4/.test(e.innerText)&&e.querySelector('button'))||c[0];if(!e)return null;e.setAttribute('data-sum','1');e.scrollIntoView();return [e.tagName,e.id,e.className,e.innerText]}""")
    print(json.dumps(t,ensure_ascii=False,indent=0))
    if t:
        pg.wait_for_timeout(300); pg.locator('[data-sum="1"]').screenshot(path=S+'c2_summary.png')
        btn=pg.locator('[data-sum="1"] button',has_text='CSV')
        if btn.count():
            with pg.expect_download() as d: btn.first.click()
            d.value.save_as('@@W@@/work/edu/sum/diff.csv'); print('csv',d.value.suggested_filename, open('@@W@@/work/edu/sum/diff.csv',encoding='utf-8-sig').read()[:600])
    b.close()
