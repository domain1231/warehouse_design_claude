import json,os
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'; CP='@@W@@/work/cp/'
APP='file://@@W@@/dl/app.html'
X1='@@W@@/work/edu/교육용_창고데이터.xlsx'; X2='@@W@@/work/edu/교육용_창고데이터_개선후.xlsx'
R={}
def close(pg): pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
def excel(pg,file,target,mode='fixed',gen=None):
    pg.click('#exOpen'); pg.wait_for_timeout(300); pg.set_input_files('#exFileDialog',file); pg.wait_for_timeout(2500)
    pg.select_option('#rTarget',target); pg.wait_for_timeout(400)
    if gen: pg.select_option('#exMode',gen); pg.wait_for_timeout(400)
    if mode: pg.select_option('#wMode',mode); pg.wait_for_timeout(2200)
    t=pg.evaluate("()=>document.querySelector('dialog[open]').innerText")
    pg.locator('label:has-text("선택한 대상 배치를 확인했습니다")').first.click(); pg.wait_for_timeout(200)
    pg.click('#exApply'); pg.wait_for_timeout(1600); close(pg)
    return t
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1600,'height':1250},accept_downloads=True); pg=ctx.new_page()
    pg.on('dialog',lambda d:(R.setdefault('native',[]).append(d.message[:160]),d.accept()))
    pg.goto(APP); pg.wait_for_timeout(1500)
    pg.click('#newBlank'); pg.wait_for_timeout(400)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    pg.click('#rBefore'); pg.click('#rLock'); pg.wait_for_timeout(300)
    pg.fill('#roomWidth','14'); pg.fill('#roomHeight','8'); pg.click('#applyRoom'); pg.wait_for_timeout(300)
    R['genopts']=None
    excel(pg,X1,'before')
    pg.click('#rLock'); pg.wait_for_timeout(300)
    pg.click('#rClone'); pg.wait_for_timeout(500); pg.click('#rCloneApply'); pg.wait_for_timeout(800); close(pg)
    if 'After' not in pg.evaluate("()=>scenario.selectedOptions[0].text"): pg.click('#rAfter'); pg.wait_for_timeout(300)
    pg.click('#exOpen'); pg.wait_for_timeout(300)
    R['genopts']=pg.evaluate("()=>[...document.querySelectorAll('dialog[open] select')].filter(s=>[...s.options].some(o=>/병합|업데이트/.test(o.text))).map(s=>[s.id,[...s.options].map(o=>[o.value,o.text])])")
    close(pg)
    gid,opts=R['genopts'][0]
    merge=[v for v,t in opts if '병합' in t][0]
    t=excel(pg,X2,'after',mode=None,gen=None) if False else None
    pg.click('#exOpen'); pg.wait_for_timeout(300); pg.set_input_files('#exFileDialog',X2); pg.wait_for_timeout(2500)
    pg.select_option('#rTarget','after'); pg.select_option('#'+gid,merge); pg.wait_for_timeout(500)
    pg.select_option('#wMode','fixed'); pg.wait_for_timeout(2200)
    R['after_preview']=pg.evaluate("()=>{const t=document.querySelector('dialog[open]').innerText;const i=t.indexOf('선택 후보');const j=t.indexOf('경고');return [t.slice(i,i+300),t.slice(Math.max(0,j-100),j+500)]}")
    pg.locator('label:has-text("선택한 대상 배치를 확인했습니다")').first.click()
    for lab in ['경고가 발생해도','현재 후보의 경고를 확인했습니다']:
        l=pg.locator(f'dialog[open] label:has-text("{lab}")')
        if l.count(): l.first.click(); pg.wait_for_timeout(200)
    R['apply_state']=pg.evaluate("()=>[exApply.innerText,exApply.disabled]")
    pg.click('#exApply'); pg.wait_for_timeout(1600); close(pg)
    R['after_status']=pg.evaluate("()=>document.querySelector('#wTop').innerText.split('\\n')[0]")
    pg.click('#vSave'); pg.wait_for_timeout(400)
    with pg.expect_download() as d: pg.click('#jsonOut')
    d.value.save_as(CP+'코스4_비교예시.json')
    pg.set_viewport_size({'width':1440,'height':900}); pg.wait_for_timeout(300)
    pg.click('#compareBtn'); pg.wait_for_timeout(1500)
    R['compare']=pg.evaluate("()=>document.querySelector('#compareDialog').innerText.slice(0,5000)")
    pg.screenshot(path=S+'c4n_compare_full.png')
    UN="""(sel)=>{const es=[...document.querySelectorAll('#compareDialog '+sel)].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});if(!es.length)return null;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const e of es){const r=e.getBoundingClientRect();x0=Math.min(x0,r.left);y0=Math.min(y0,r.top);x1=Math.max(x1,r.right);y1=Math.max(y1,r.bottom)}return {x:Math.max(0,x0-10),y:Math.max(0,y0-10),width:x1-x0+20,height:y1-y0+20}}"""
    def mapshot(name):
        try:
            pg.evaluate("()=>{const r=document.querySelector('#compareDialog [data-testid=compare-right]');const s=[...r.querySelectorAll('svg')].sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height)[0];s.setAttribute('data-c','map')}")
            c=pg.evaluate(UN,'[data-delta-legend], [data-c=map]')
            pg.screenshot(path=S+f'c4n_{name}.png',clip=c); R['shot_'+name]='ok'
        except Exception as e: R['shot_'+name]='ERR '+str(e)[:120]
    mapshot('map')
    try:
        pg.locator('#compareDialog [data-testid=compare-present]').check(); pg.wait_for_timeout(600); mapshot('present')
        pg.locator('#compareDialog [data-testid=compare-present]').uncheck(); pg.wait_for_timeout(400)
    except Exception as e: R['present']='ERR '+str(e)[:120]
    try:
        row=pg.locator('#compareDialog [data-change-table] tr', has_text='7F-B-3').first; row.click(); pg.wait_for_timeout(600)
        R['focus_note']=pg.evaluate("()=>{const n=document.querySelector('#compareDialog [data-focus-note]');return n?n.innerText:''}")
        mapshot('linked'); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    except Exception as e: R['linked']='ERR '+str(e)[:120]
    for btn,fn in [('compare-present-pdf','c4n_present.pdf'),('compare-present-png','c4n_present_out.png')]:
        try:
            with pg.expect_download(timeout=15000) as d: pg.locator(f'#compareDialog [data-testid={btn}]').click()
            d.value.save_as('@@W@@/work/cp/'+fn); R[btn]=d.value.suggested_filename
            if fn.endswith('.pdf'):
                import subprocess; subprocess.run(['pdftoppm','-r','90','-png','-singlefile','-f','1','-l','1','@@W@@/work/cp/'+fn,S+'c4n_pdf'],check=False)
        except Exception as e: R[btn]='ERR '+str(e)[:120]
    pg.set_viewport_size({'width':1440,'height':2400}); pg.wait_for_timeout(600)
    def clip(sel,name):
        try:
            c=pg.evaluate(UN,sel)
            if not c: R['shot_'+name]='none'; return
            pg.screenshot(path=S+f'c4n_{name}.png',clip=c); R['shot_'+name]='ok'
        except Exception as e: R['shot_'+name]='ERR '+str(e)[:120]
    clip('[data-headline], [data-kpis]','head')
    clip('[data-sources], [data-purpose]','goals')
    clip('.r-comp-row, .r-comp-bar, [data-seg]','bars')
    clip('[data-change-filter], [data-change-sort], [data-change-count], [data-change-table]','list')
    R['legend']=pg.evaluate("()=>{const t=document.querySelector('#compareDialog').innerText;const i=t.indexOf('+40%p');return t.slice(i,i+260)}")
    R['filters']=pg.evaluate("()=>[...document.querySelectorAll('#compareDialog button,#compareDialog select,#compareDialog input')].map(e=>[e.tagName,e.dataset.testid||e.id,(e.innerText||e.value||'').trim().slice(0,30)])")
    json.dump(R,open('@@W@@/work/c4b.json','w'),ensure_ascii=False,indent=1)
    b.close()
json.dump(R,open('@@W@@/work/c4b.json','w'),ensure_ascii=False,indent=1)
print(json.dumps({k:v for k,v in R.items() if k!='compare'},ensure_ascii=False)[:3000]); print(R.get('compare','')[:3800])
