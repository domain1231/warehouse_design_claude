import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/'
X='@@W@@/work/edu/교육용_창고데이터.xlsx'
out={}
CSS="dialog[open]{max-height:none!important;height:auto!important;overflow:visible!important;position:absolute!important;top:0!important} dialog[open] *{max-height:none!important}"
def boxes(pg):
    return pg.evaluate("()=>[...document.querySelectorAll('dialog[open] h3')].map(h=>{const r=h.getBoundingClientRect();return {t:h.innerText,y:r.top+scrollY}})")
def dlgbox(pg):
    return pg.evaluate("()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}}")
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1400,'height':1000})
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(500)
    pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    pg.fill('#roomWidth','14'); pg.fill('#roomHeight','8'); pg.click('#applyRoom'); pg.wait_for_timeout(400)
    pg.click('#exOpen'); pg.wait_for_timeout(400)
    pg.screenshot(path=S+'c2_open.png')
    pg.set_input_files('#exFileDialog',X); pg.wait_for_timeout(2500)
    pg.add_style_tag(content=CSS); pg.wait_for_timeout(400)
    out['bx1']=boxes(pg); out['d1']=dlgbox(pg)
    pg.screenshot(path=S+'c2_dialog_default.png',full_page=True)
    # switch to 로케이션 열 고정
    opts=pg.evaluate("()=>[...document.querySelector('#wMode').options].map(o=>[o.value,o.text])")
    out['wModeOpts']=opts
    v=[o[0] for o in opts if '열 고정' in o[1]][0]
    pg.select_option('#wMode',v); pg.wait_for_timeout(2500)
    out['bx2']=boxes(pg); out['d2']=dlgbox(pg)
    pg.screenshot(path=S+'c2_dialog_colfix.png',full_page=True)
    out['colfix_text']=pg.evaluate("()=>document.querySelector('dialog[open]').innerText")
    out['selects2']=pg.evaluate("()=>[...document.querySelectorAll('dialog[open] select')].filter(s=>s.id).map(s=>({id:s.id,val:s.value,txt:s.options[s.selectedIndex]?.text,opts:[...s.options].map(o=>o.text)}))")
    json.dump(out,open('@@W@@/work/shoot2.json','w'),ensure_ascii=False,indent=1)
    b.close()
print(json.dumps({k:out[k] for k in ['bx1','d1','bx2','d2','wModeOpts']},ensure_ascii=False))
t=out['colfix_text']; i=t.find('4 / 적용 전 미리보기'); print(t[i:i+4000])
print([ (s['id'],s['txt'],s['opts']) for s in out['selects2'] if s['id'] not in ('exSheet',)])
