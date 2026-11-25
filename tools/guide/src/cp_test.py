import json,os
from playwright.sync_api import sync_playwright
G='file://@@W@@/Warehouse_Studio_v2_5_0a2_UserGuide_v2_0.html'; APP='file://@@W@@/dl/app.html'
D='@@W@@/work/dltest/'; os.makedirs(D,exist_ok=True)
R={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1600,'height':950},accept_downloads=True); g=ctx.new_page()
    errs=[]; g.on('pageerror',lambda e:errs.append(str(e)))
    g.goto(G); g.wait_for_timeout(1000)
    links=g.evaluate("()=>[...document.querySelectorAll('a.dlf')].map(a=>[a.dataset.f,a.textContent])")
    R['links']=len(links); got={}
    for f,t in {l[0]:l[1] for l in links}.items():
        with g.expect_download() as d: g.locator(f'a.dlf[data-f={f}]').first.click()
        nm=d.value.suggested_filename; d.value.save_as(D+nm); got[nm]=os.path.getsize(D+nm)
    R['downloads']=got
    R['anims']=g.evaluate("()=>[...document.querySelectorAll('figure.anim img')].map(i=>[i.naturalWidth,i.closest('article').id])")
    R['startboxes']=g.evaluate("()=>[...document.querySelectorAll('.startbox')].map(s=>s.closest('section').id)")
    R['errs']=errs
    a=ctx.new_page(); a.on('dialog',lambda d:d.accept())
    res={}
    for nm in [k for k in got if k.endswith('.json')]:
        a.goto(APP); a.wait_for_timeout(1200)
        a.set_input_files('#jsonIn',D+nm); a.wait_for_timeout(1500)
        if a.locator('#vReplaceSave').is_visible(): a.locator('#vReplaceSave').click(); a.wait_for_timeout(1500)
        a.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
        res[nm]=a.evaluate("()=>[document.querySelector('#wTop').innerText.split('·')[0].trim(),scenario.selectedOptions[0].text,roomWidth.value+'x'+roomHeight.value,document.querySelector('.r-toolbar').innerText.split('\\n')[0]]")
    R['loaded']=res
    b.close()
print(json.dumps(R,ensure_ascii=False,indent=0))
