import json,os,time
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'; X='@@W@@/work/edu/교육용_창고데이터.xlsx'; APP='file://@@W@@/dl/app.html'
log={}; t0=time.time()
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return [best.x,best.y,best.width,best.height]}"""
RIGHT="([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))).closest('aside')"
MSG="()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].map(e=>e.innerText.trim()).filter(t=>t&&!/SAVED|마지막 확인|기본값은 낮음|이력 \\d개|적용 준비/.test(t))"
def FILL(pg,l,v):
    el=pg.locator('[data-sec=right]').get_by_label(l,exact=True).first
    if not el.count(): el=pg.locator(f'[data-sec=right] label:has-text("{l}") input').first
    el.fill(v); el.press('Enter'); pg.wait_for_timeout(200)
def step(n,f):
    try: log[n]=f()
    except Exception as e: log[n]='ERR '+str(e)[:250]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1600,'height':1250},accept_downloads=True); pg=ctx.new_page(); pg.on('dialog',lambda d:d.accept())
    pg.goto(APP); pg.wait_for_timeout(1300)
    pg.click('#newBlank'); pg.wait_for_timeout(400)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    # task1: BEFORE = Excel 14x8 (fixed), lock
    def t1():
        pg.click('#rBefore'); pg.click('#rLock'); pg.wait_for_timeout(300)
        pg.fill('#roomWidth','14'); pg.fill('#roomHeight','8'); pg.click('#applyRoom'); pg.wait_for_timeout(300)
        pg.click('#exOpen'); pg.wait_for_timeout(300); pg.set_input_files('#exFileDialog',X); pg.wait_for_timeout(2500)
        pg.select_option('#rTarget','before'); pg.wait_for_timeout(500)
        pg.select_option('#wMode','fixed'); pg.wait_for_timeout(2500)
        pg.locator('label:has-text("선택한 대상 배치를 확인했습니다")').first.click(); pg.wait_for_timeout(200)
        pg.click('#exApply'); pg.wait_for_timeout(1500); pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
        r=pg.evaluate("()=>document.querySelector('#wTop').innerText.split('\\n')[0]")
        pg.click('#rLock'); pg.wait_for_timeout(300)
        return [r,pg.evaluate("()=>document.querySelector('.r-toolbar').innerText.split('\\n')[0]")]
    step('t1',t1)
    def t2():
        pg.click('#rClone'); pg.wait_for_timeout(500); pg.click('#rCloneApply'); pg.wait_for_timeout(800); pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
        if 'After' not in pg.evaluate("()=>scenario.selectedOptions[0].text"): pg.click('#rAfter'); pg.wait_for_timeout(300)
        pg.click('#fit'); pg.wait_for_timeout(300)
        return pg.evaluate("()=>[document.querySelector('.r-toolbar').innerText.split('\\n')[0],document.querySelector('#wTop').innerText.split('\\n')[0]]")
    step('t2',t2)
    def t2save():
        with pg.expect_download() as d: pg.click('#jsonOut')
        d.value.save_as('@@W@@/work/cp/실사용테스트_과제3_시작.json'); return d.value.suggested_filename
    step('t2save',t2save)
    def t3():
        x0,y0,w,h=pg.evaluate(ROOM); at=lambda a,c:(x0+a*w/14,y0+c*h/8)
        rk=pg.evaluate("()=>[...document.querySelectorAll('#plan [data-id]')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.width,r.y,r.height,e.textContent]}).filter(x=>x[1]>15&&x[3]>15)")
        m=[[(r[0]-x0)*14/w,(r[0]+r[1]-x0)*14/w,(r[2]-y0)*8/h,(r[2]+r[3]-y0)*8/h,r[4][:12]] for r in rk]
        A=[r for r in m if 'A' in r[4]]; B=[r for r in m if 'B' in r[4]]
        ar=max(r[1] for r in A); bl=min(r[0] for r in B)
        ys=min(r[2] for r in A+B); ye=max(r[3] for r in A+B)
        log['geom']=[round(ar,3),round(bl,3),round(ys,3),round(ye,3),len(A),len(B)]
        mr=max(r[1] for r in m); log['maxright']=round(mr,2)
        pg.click('button[data-tool=aisle]'); pg.mouse.click(*at((mr+14)/2,4) if mr<12 else at(7,(ye+8)/2)); pg.wait_for_timeout(400)
        pg.evaluate("()=>"+RIGHT+".setAttribute('data-sec','right')")
        log['after_click']=pg.evaluate("()=>"+RIGHT+".innerText.slice(0,40)")
        f=lambda l,v:FILL(pg,l,v)
        gw=round(bl-ar,2); gx=round(ar,2)
        f('최소 확보 폭 (m)','1.2'); f('목표 폭 (m)','1.5'); M=[]
        for l,v in [('Y (m)',str(round(ys,2))),('깊이 (m)',str(round(ye-ys,2))),('폭 (m)',str(gw)),('X (m)',str(gx))]:
            f(l,v); M.append([l,v,pg.evaluate(MSG)[-1:]])
        log['seq']=M; log['msgs3']=pg.evaluate(MSG)[-4:]
        log['aisle_in']=[gx,round(ys,2),gw,round(ye-ys,2)]
        info=pg.evaluate("()=>"+RIGHT+".innerText.split('\\n').filter(l=>/유효|확보|부족|폭/.test(l)).slice(0,6)")
        pg.click('button[data-tool=select]'); pg.mouse.click(*at(13.8,7.9)); pg.wait_for_timeout(200)
        pg.click('#mValidate'); pg.wait_for_timeout(600)
        v=pg.evaluate("()=>[...document.querySelectorAll('dialog[open]')].map(d=>d.innerText.slice(0,500))")
        pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
        return [info,v,pg.evaluate(MSG)[-2:],pg.evaluate("()=>document.querySelector('#wTop').innerText.split('\\n')[0]")]
    step('t3',t3)
    def t4():
        racks=pg.evaluate("()=>[...document.querySelectorAll('#plan [data-id]')].map(e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,r.width,r.height,e.textContent]}).filter(x=>x[2]>15&&x[3]>15&&/ZONE/.test(x[4]))")
        out=[]
        for i,(mx,cur) in enumerate([(60,30),(60,57),(60,66)]):
            pg.mouse.click(racks[i][0],racks[i][1]); pg.wait_for_timeout(300); pg.evaluate("()=>"+RIGHT+".setAttribute('data-sec','right')")
            for l,v in [('최대 수량',str(mx)),('현재 수량',str(cur)),('적재 단위','BOX')]:
                FILL(pg,l,v)
        x0,y0,w,h=pg.evaluate(ROOM); pg.mouse.click(x0+w*0.97,y0+h*0.97); pg.wait_for_timeout(300)
        pg.select_option('#vLabelMode','occupancy'); pg.wait_for_timeout(300)
        cv=pg.evaluate("()=>{const r=document.querySelector('#plan').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}")
        pg.screenshot(path=S+'exam_answer.png',clip=cv)
        leg=pg.evaluate("()=>[...document.querySelectorAll('#plan text')].map(t=>t.textContent).filter(t=>/%/.test(t)).slice(0,6)")
        return leg
    step('t4',t4)
    def t5():
        pg.click('#compareBtn'); pg.wait_for_timeout(800)
        t=pg.evaluate("()=>document.querySelector('#compareDialog').innerText")
        import re
        keep=[l for l in t.split('\n') if re.search(r'(최대 보관 수량|최소 통로 폭|통로 최소 폭 위반|공간 경고|면적 기준|전체 랙 수|배치 변경)',l)]
        with pg.expect_download() as d: pg.click('#compareDialog [data-testid=compare-present-pdf]')
        n1=d.value.suggested_filename
        pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
        with pg.expect_download() as d: pg.click('#jsonOut')
        d.value.save_as('@@W@@/work/cp/실기_정답예시.json')
        return [keep,n1,d.value.suggested_filename]
    step('t5',t5)
    log['seconds']=round(time.time()-t0)
    b.close()
print(json.dumps(log,ensure_ascii=False,indent=0))
