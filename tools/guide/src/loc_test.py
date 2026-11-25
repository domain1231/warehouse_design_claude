from playwright.sync_api import sync_playwright
import json,tempfile
R={}
with sync_playwright() as p:
    ud=tempfile.mkdtemp()
    ctx=p.chromium.launch_persistent_context(ud,executable_path='@@CHROME@@',args=['--no-sandbox'],viewport={'width':1600,'height':950})
    pg=ctx.new_page(); pg.on('dialog',lambda d:d.accept())
    pg.goto('file:///tmp/locA/app.html'); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(400)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    pg.fill('#projectName','위치테스트-A'); pg.press('#projectName','Tab'); pg.fill('#roomWidth','11'); pg.fill('#roomHeight','7'); pg.click('#applyRoom'); pg.wait_for_timeout(800)
    pg.click('#vSave'); pg.wait_for_timeout(800)
    R['A_saved']=pg.evaluate("()=>[projectName.value,roomWidth.value,document.body.innerText.includes('SAVED')]")
    pg.close()
    for url,k in [('file:///tmp/locA/app.html','A_reopen'),('file:///tmp/locB/renamed_copy.html','B_other_folder_name')]:
        q=ctx.new_page(); q.goto(url); q.wait_for_timeout(1500)
        R[k]=q.evaluate("()=>[projectName.value,roomWidth.value+'x'+roomHeight.value,(document.body.innerText.match(/(●|○)[^\\n]{0,30}/)||[''])[0]]")
        q.close()
    ctx.close()
print(json.dumps(R,ensure_ascii=False))
