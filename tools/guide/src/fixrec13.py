from playwright.sync_api import sync_playwright
import json,re
exec(open('scripts/exam.py',encoding='utf-8').read().split('def FILL')[0].split('with sync_playwright')[0])
out={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':1250}); pg.on('dialog',lambda d:d.accept())
    pg.goto(APP); pg.wait_for_timeout(1300)
    pg.click('#newBlank'); pg.wait_for_timeout(400)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    for W,H in [(14,8),(10,6)]:
        pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
        pg.fill('#roomWidth',str(W)); pg.fill('#roomHeight',str(H)); pg.click('#applyRoom'); pg.wait_for_timeout(300)
        pg.click('#exOpen'); pg.wait_for_timeout(300); pg.set_input_files('#exFileDialog',X); pg.wait_for_timeout(2500)
        pg.select_option('#wMode','fixed'); pg.wait_for_timeout(2500)
        t=pg.evaluate("()=>document.querySelector('dialog[open]').innerText")
        i=t.find('열 고정'); 
        lines=[l for l in t.split('\n') if re.search(r'열 배치|행 배치|등 맞댐|모든 줄|불가|부족|가장 긴|추천|목표|✔',l)]
        out[f'{W}x{H}']=lines[:40]
        el=pg.locator('dialog[open] :text("배치 후보")').first
        try:
            box=pg.evaluate("()=>{const e=[...document.querySelectorAll('dialog[open] *')].find(e=>e.children.length<40&&/열 배치\\(세로\\)/.test(e.innerText)&&/행 배치/.test(e.innerText)&&e.innerText.length<2500);if(!e)return null;e.setAttribute('data-rec','1');e.scrollIntoView();return e.innerText}")
            out[f'{W}x{H}_box']=box
            if box: pg.locator('[data-rec="1"]').first.screenshot(path=f'shots/g/c2_rec_{W}x{H}.png')
        except Exception as e: out['err']=str(e)[:200]
        pg.evaluate("()=>document.querySelectorAll('[data-rec]').forEach(e=>e.removeAttribute('data-rec'))")
    print(json.dumps(out,ensure_ascii=False,indent=0))
    b.close()
