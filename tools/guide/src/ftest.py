import json
from playwright.sync_api import sync_playwright
F='file://@@W@@/Warehouse_Studio_v2_5_0a2_UserGuide_v2_0.html'
R={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1600,'height':950}); g=ctx.new_page()
    errs=[]; g.on('pageerror',lambda e:errs.append(str(e))); g.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    g.goto(F); g.wait_for_timeout(800)
    R['side']=g.evaluate("()=>{const s=document.getElementById('gSide');const r=s.getBoundingClientRect();return [r.width,s.querySelectorAll('.gs-c').length,s.querySelectorAll('.gs-s a').length]}")
    g.fill('#gQ','통로 폭'); g.wait_for_timeout(300)
    R['search']=g.evaluate("()=>[document.querySelector('.gr-n')?.textContent,[...document.querySelectorAll('.gr b')].slice(0,5).map(x=>x.textContent)]")
    g.screenshot(path='@@W@@/shots/f_search.png')
    g.locator('.gr').first.click(); g.wait_for_timeout(900)
    R['afterclick']=g.evaluate("()=>[location.hash,document.querySelector('.gs-s a.on')?.textContent]")
    g.fill('#gQ','없는단어zz'); g.wait_for_timeout(200); R['nohit']=g.evaluate("()=>document.querySelector('.gr-none')?.textContent")
    g.fill('#gQ','')
    g.evaluate("()=>document.getElementById('c3-4').scrollIntoView()"); g.wait_for_timeout(700)
    R['spy']=g.evaluate("()=>[document.querySelector('.gs-c.cur>a')?.textContent,document.querySelector('.gs-s a.on')?.textContent]")
    g.screenshot(path='@@W@@/shots/f_spy.png')
    im=g.locator('#c3-4 figure img').first; im.click(); g.wait_for_timeout(300)
    R['lb']=g.evaluate("()=>[document.getElementById('gLb').classList.contains('on'),document.querySelector('#gLb .lb-c').textContent.slice(0,40)]")
    g.screenshot(path='@@W@@/shots/f_lb.png'); g.keyboard.press('Escape'); g.wait_for_timeout(200)
    R['lbclose']=g.evaluate("()=>document.getElementById('gLb').classList.contains('on')")
    g.evaluate("()=>document.getElementById('c1-x').scrollIntoView()"); g.locator('#c1-x input').first.check(); g.locator('#c1-x input').nth(1).check(); g.wait_for_timeout(200)
    g.reload(); g.wait_for_timeout(800)
    R['persist']=g.evaluate("()=>[[...document.querySelectorAll('#c1-x input')].map(i=>i.checked),document.querySelector('a[data-t=c1] .pg')?.textContent]")
    # print selection: only manager part
    g.evaluate("()=>{document.querySelectorAll('#gPr input').forEach(i=>i.checked=i.dataset.c==='mg')}")
    g.evaluate("()=>{window.print=()=>{};}")
    g.click('#gPrint') if g.locator('#gPrint').is_visible() else g.evaluate("()=>document.getElementById('gPrint').click()")
    R['noprint']=g.evaluate("()=>document.querySelectorAll('.noprint').length")
    b.close()
    R['errs']=errs
    # narrow
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    g=b.new_page(viewport={'width':1000,'height':900}); g.goto(F); g.wait_for_timeout(600)
    R['narrow']=g.evaluate("()=>[getComputedStyle(document.getElementById('gTog')).display,document.getElementById('gSide').getBoundingClientRect().right]")
    g.click('#gTog'); g.wait_for_timeout(400); R['narrow_open']=g.evaluate("()=>document.getElementById('gSide').getBoundingClientRect().right")
    b.close()
print(json.dumps(R,ensure_ascii=False,indent=0))
