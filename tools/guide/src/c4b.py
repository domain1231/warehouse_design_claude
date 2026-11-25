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
    pg.set_viewport_size({'width':1600,'height':2800}); pg.wait_for_timeout(300)
    pg.click('#compareBtn'); pg.wait_for_timeout(1200)
    R['compare']=pg.evaluate("()=>document.querySelector('#compareDialog').innerText.slice(0,4000)")
    pg.locator('#compareDialog').screenshot(path=S+'c4n_compare_full.png')
    # crops
    def tag(js,name):
        ok=pg.evaluate(js.replace('NAME',name)); return ok
    tag("()=>{const t=[...document.querySelectorAll('#compareDialog table')].find(t=>t.innerText.includes('목적 지표'));if(!t)return false;let p=t;while(p.parentElement&&!p.parentElement.matches('dialog')&&p.parentElement.innerText.length<t.innerText.length+400)p=p.parentElement;p.setAttribute('data-c','NAME');return true}",'goals')
    tag("()=>{const s=[...document.querySelectorAll('#compareDialog svg')].sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height)[0];if(!s)return false;s.setAttribute('data-c','NAME');return true}",'map')
    tag("()=>{const t=[...document.querySelectorAll('#compareDialog table')].find(t=>t.innerText.includes('로케이션 수'));if(!t)return false;let p=t.parentElement;p.setAttribute('data-c','NAME');return true}",'list')
    for n in ['goals','map','list']:
        try: pg.locator(f'[data-c={n}]').first.screenshot(path=S+f'c4n_{n}.png'); R['shot_'+n]='ok'
        except Exception as e: R['shot_'+n]='ERR '+str(e)[:100]
    # legend near map
    R['legend']=pg.evaluate("()=>{const t=document.querySelector('#compareDialog').innerText;const i=t.indexOf('+40%p');return t.slice(i,i+220)}")
    # filters
    R['filters']=pg.evaluate("()=>[...document.querySelectorAll('#compareDialog button,#compareDialog select,#compareDialog input[type=radio]')].map(e=>[e.tagName,e.id,(e.innerText||e.value||'').trim().slice(0,20)]).slice(0,40)")
    b.close()
json.dump(R,open('@@W@@/work/c4b.json','w'),ensure_ascii=False,indent=1)
print(json.dumps({k:v for k,v in R.items() if k!='compare'},ensure_ascii=False)[:3000]); print(R.get('compare','')[:3800])
