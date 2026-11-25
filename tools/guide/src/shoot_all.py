import json
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
import os; os.makedirs(S,exist_ok=True)
X='@@W@@/work/edu/교육용_창고데이터.xlsx'
J='@@REPO@@/fixtures/legacy/v2.4.1-primary.project.json'
log={}
def el(pg,sel,name):
    try:
        pg.locator(sel).first.screenshot(path=S+name+'.png'); log[name]='ok'
    except Exception as e: log[name]='ERR '+str(e)[:120]
def closeall(pg):
    pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())"); pg.wait_for_timeout(200)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':950})
    pg.on('dialog',lambda d: d.accept())
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    pg.screenshot(path=S+'c0_main.png')
    pg.screenshot(path=S+'c0_header.png',clip={'x':0,'y':0,'width':1600,'height':100})
    pg.click('#aboutBtn'); pg.wait_for_timeout(400); el(pg,'#aboutDialog','c0_about'); closeall(pg)
    pg.click('#vSave'); pg.wait_for_timeout(800)
    pg.screenshot(path=S+'c0_header_saved.png',clip={'x':0,'y':0,'width':1600,'height':100})
    log['hdr_saved']=pg.evaluate("()=>document.querySelector('header,.top,body').innerText.slice(0,400)")
    pg.click('#vVersions'); pg.wait_for_timeout(400); el(pg,'#vBackupDialog','c0_versions'); closeall(pg)
    pg.click('#vStorage'); pg.wait_for_timeout(600); el(pg,'#vStorageDialog','c0_storage'); closeall(pg)
    # make an edit -> unsaved
    pg.fill('#projectName','교육용 창고'); pg.press('#projectName','Tab'); pg.wait_for_timeout(500)
    pg.screenshot(path=S+'c0_header_unsaved.png',clip={'x':0,'y':0,'width':1600,'height':100})
    # JSON import
    pg.set_input_files('#jsonIn',J); pg.wait_for_timeout(1200)
    log['json_dialog']=pg.evaluate("()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id+'::'+d.innerText.slice(0,1500))")
    if pg.locator('dialog[open]').count(): el(pg,'dialog[open]','c0_json_import')
    pg.screenshot(path=S+'c0_after_json.png')
    closeall(pg)
    # replace dialog
    pg.fill('#projectName','교육용 창고 2'); pg.press('#projectName','Tab'); pg.wait_for_timeout(300)
    pg.click('#newBlank'); pg.wait_for_timeout(600)
    log['after_newblank']=pg.evaluate("()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.id)")
    if pg.locator('#vReplaceSave').is_visible():
        el(pg,'#vReplaceDialog','c0_replace'); pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(700)
    closeall(pg)
    # ---- course 2
    pg.set_viewport_size({'width':1400,'height':3200})
    pg.fill('#roomWidth','14'); pg.fill('#roomHeight','8'); pg.click('#applyRoom'); pg.wait_for_timeout(400)
    pg.click('#exOpen'); pg.wait_for_timeout(400)
    pg.set_input_files('#exFileDialog',X); pg.wait_for_timeout(2500)
    pg.select_option('#wMode','fixed'); pg.wait_for_timeout(2500)
    hs=pg.evaluate("()=>[...document.querySelectorAll('#wDialog h3, dialog[open] h3')].map((h,i)=>{h.parentElement.setAttribute('data-shot','s'+i);const r=h.parentElement.getBoundingClientRect();return [i,h.innerText,Math.round(r.width),Math.round(r.height)]})")
    log['h3']=hs
    for i,t,w,h in hs: el(pg,f'[data-shot=s{i}]',f'c2_sec{i}')
    el(pg,'#fxAxis >> xpath=ancestor::details[1]','c2_fixed_settings')
    # preview svg
    svgs=pg.evaluate("()=>[...document.querySelectorAll('dialog[open] svg')].map((s,i)=>{s.setAttribute('data-svg','v'+i);const r=s.getBoundingClientRect();return [i,Math.round(r.width),Math.round(r.height)]})")
    log['svgs']=svgs
    big=max(svgs,key=lambda x:x[1]*x[2])[0] if svgs else None
    if big is not None: el(pg,f'[data-svg=v{big}]','c2_preview_svg')
    # gap: 빈자리 비워 둠 variant
    pg.select_option('#fxGaps',index=1); pg.wait_for_timeout(2000)
    if big is not None: el(pg,f'dialog[open] svg >> nth={big}','c2_preview_svg_gap')
    pg.select_option('#fxGaps',index=0); pg.wait_for_timeout(2000)
    # apply
    log['apply_btns']=pg.evaluate("()=>[...document.querySelectorAll('dialog[open] button')].map(b=>[b.id,b.innerText.trim().slice(0,40),b.disabled]).filter(x=>/적용|확인/.test(x[1]))")
    log['checks']=pg.evaluate("()=>[...document.querySelectorAll('dialog[open] input[type=checkbox]')].map(c=>[c.id,c.checked,(c.closest('label')||{}).innerText?.slice(0,50)])")
    b.close()
json.dump(log,open('@@W@@/work/shoot_all.json','w'),ensure_ascii=False,indent=1)
print(json.dumps(log,ensure_ascii=False,indent=0)[:6000])
