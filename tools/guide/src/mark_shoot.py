import json, os
from playwright.sync_api import sync_playwright
from PIL import Image
S='@@W@@/shots/g/'; A='@@W@@/shots/anim/'; CP='@@W@@/work/cp/'
os.makedirs(A,exist_ok=True); os.makedirs(CP,exist_ok=True)
X='@@W@@/work/edu/교육용_창고데이터.xlsx'
APP='file://@@W@@/dl/app.html'
log={}
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return [best.x,best.y,best.width,best.height]}"""
RIGHT="([...document.querySelectorAll('h2')].find(h=>h.innerText.startsWith('선택 객체'))).closest('aside')"
MARKJS="""([sel,n,txt])=>{let el=null;
 if(txt){el=[...document.querySelectorAll(sel)].find(e=>e.innerText&&e.innerText.trim().startsWith(txt)&&e.getBoundingClientRect().width>0)}else{el=[...document.querySelectorAll(sel)].find(e=>e.getBoundingClientRect().width>0)}
 if(!el)return false; const t=el.closest('label')&&el.tagName!=='LABEL'&&el.type==='checkbox'?el.closest('label'):el;
 const r=t.getBoundingClientRect(); const host=t.closest('dialog[open]')||document.body;
 const d=document.createElement('div');d.className='__mk';
 d.style.cssText=`position:fixed;left:${r.x-4}px;top:${r.y-4}px;width:${r.width+8}px;height:${r.height+8}px;border:3px solid #ff3b30;border-radius:7px;z-index:2147483647;pointer-events:none;box-shadow:0 0 0 2px rgba(255,255,255,.55)`;
 const b=document.createElement('div');b.textContent=n;b.style.cssText='position:absolute;left:-15px;top:-15px;width:24px;height:24px;border-radius:50%;background:#ff3b30;color:#fff;font:700 14px/24px sans-serif;text-align:center;box-shadow:0 0 0 2px #fff';
 d.appendChild(b);host.appendChild(d);return true}"""
def mark(pg,items):
    ok=[]
    for it in items:
        sel,n=it[0],it[1]; txt=it[2] if len(it)>2 else None
        ok.append(pg.evaluate(MARKJS,[sel,str(n),txt]))
    return ok
def unmark(pg): pg.evaluate("()=>document.querySelectorAll('.__mk').forEach(e=>e.remove())")
def closeall(pg): pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())"); pg.wait_for_timeout(150)
def tag_up(pg,sel,stop,name):
    pg.locator(sel).first.evaluate(f"e=>{{let p=e;while(p.parentElement&&p.tagName!=='{stop}')p=p.parentElement;p.setAttribute('data-sec','{name}')}}")
def shot_el(pg,sel,path):
    pg.locator(sel).first.screenshot(path=path)

def shot_marked(pg,sec,items,path):
    pg.locator(sec).first.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    pg.evaluate("(s)=>{const e=document.querySelector(s);const r=e.getBoundingClientRect();if(r.bottom>innerHeight||r.top<0)e.scrollIntoView({block:'start'})}",sec); pg.wait_for_timeout(200)
    ok=mark(pg,items)
    r=pg.evaluate("(s)=>{const r=document.querySelector(s).getBoundingClientRect();const x=Math.max(0,r.x-18),y=Math.max(0,r.y-18);return {x:x,y:y,width:r.width+(r.x-x),height:Math.min(r.height+(r.y-y),innerHeight-y)}}",sec)
    pg.screenshot(path=path,clip=r); unmark(pg); return ok
def blank(pg,W,H):
    pg.goto(APP); pg.wait_for_timeout(1300)
    pg.click('#newBlank'); pg.wait_for_timeout(400)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    pg.fill('#roomWidth',str(W)); pg.fill('#roomHeight',str(H)); pg.click('#applyRoom'); pg.wait_for_timeout(300); pg.click('#fit'); pg.wait_for_timeout(300)
def geo(pg,W,H):
    x0,y0,w,h=pg.evaluate(ROOM); sx=w/W; sy=h/H
    cv=pg.evaluate("()=>{const r=document.querySelector('#plan').getBoundingClientRect();return [r.x,r.y,r.width,r.height]}")
    return (lambda a,c:(x0+a*sx,y0+c*sy)), dict(zip(['x','y','width','height'],cv))
def save_json(pg,name):
    with pg.expect_download() as d: pg.click('#jsonOut')
    d.value.save_as(CP+name); return os.path.getsize(CP+name)
def frames_to_webp(frames,out,w=760,dur=170,hold=1300):
    ims=[Image.open(f).convert('RGB') for f in frames]
    ims=[i.resize((w,int(i.height*w/i.width)),Image.LANCZOS) for i in ims]
    durs=[dur]*len(ims); durs[-1]=hold; durs[0]=700
    ims[0].save(out,save_all=True,append_images=ims[1:],duration=durs,loop=0,quality=70,method=6)
    return os.path.getsize(out)
def step(n,f):
    try: log[n]=f()
    except Exception as e: log[n]='ERR '+str(e)[:300]

with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1600,'height':1250},accept_downloads=True); pg=ctx.new_page()
    pg.on('dialog',lambda d:d.accept())
    # ---------- session 1: header, storage, room, tools, right, drag anim
    def s1():
        pg.goto(APP); pg.wait_for_timeout(1500)
        mark(pg,[('#vSave',1),('.header-actions *','2','○')])
        pg.screenshot(path=S+'c0_header.png',clip={'x':0,'y':0,'width':1600,'height':100}); unmark(pg)
        pg.click('#vStorage'); pg.wait_for_timeout(500); mark(pg,[('#vStorageDownload',1)]); shot_el(pg,'#vStorageDialog',S+'c0_storage.png'); unmark(pg); closeall(pg)
        pg.click('#newBlank'); pg.wait_for_timeout(400)
        if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
        pg.fill('#roomWidth','10'); pg.fill('#roomHeight','6')
        tag_up(pg,'#applyRoom','DETAILS','room'); r=shot_marked(pg,'[data-sec=room]',[('#roomWidth',1),('#roomHeight',2),('#applyRoom',3)],S+'c1_room_input.png')
        pg.click('#applyRoom'); pg.wait_for_timeout(300); pg.click('#fit'); pg.wait_for_timeout(300)
        at,clip=geo(pg,10,6)
        pg.click('button[data-tool=door]'); pg.mouse.click(*at(8.5,5.3)); pg.wait_for_timeout(300)
        pg.click('button[data-tool=column]'); pg.mouse.click(*at(5,3)); pg.wait_for_timeout(300)
        pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.fill('#newHeight','2')
        pg.click('button[data-tool=rack]'); pg.wait_for_timeout(150)
        tag_up(pg,'button[data-tool=rack]','DETAILS','tools'); r2=shot_marked(pg,'[data-sec=tools]',[('#newRackType',1),('#newWidth',2),('button[data-tool=rack]',3)],S+'c1_tools.png')
        for pt in [(1.5,1.5),(3.5,1.5),(1.5,4)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(300)
        pg.click('button[data-tool=select]'); pg.mouse.click(*at(9.7,0.3)); pg.wait_for_timeout(200)
        pg.mouse.click(*at(3.5,1.5)); pg.wait_for_timeout(400)
        pg.evaluate("()=>"+RIGHT+".setAttribute('data-sec','right')")
        r3=mark(pg,[('[data-sec=right] label',1,'X (m)'),('[data-sec=right] label',2,'Y (m)')])
        rc=pg.evaluate("()=>{const r="+RIGHT+".getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:Math.min(r.height,560)}}")
        pg.screenshot(path=S+'c1_s_right.png',clip=rc); unmark(pg)
        xi=pg.locator('[data-sec=right] label:has-text("X (m)") input').first; yi=pg.locator('[data-sec=right] label:has-text("Y (m)") input').first
        xi.fill('3'); xi.press('Enter'); yi.fill('1'); yi.press('Enter'); pg.wait_for_timeout(300)
        pg.mouse.click(*at(9.7,0.3)); pg.wait_for_timeout(200)
        # drag animation of R-03
        fr=[]; s=at(1.5,4); e=at(6.5,4)
        pg.mouse.click(*s); pg.wait_for_timeout(250); pg.screenshot(path=A+'d00.png',clip=clip); fr.append(A+'d00.png')
        pg.mouse.move(*s); pg.mouse.down()
        for i in range(1,13):
            t=i/12; pg.mouse.move(s[0]+(e[0]-s[0])*t, s[1]+(e[1]-s[1])*t, steps=2); pg.wait_for_timeout(60)
            f=A+f'd{i:02d}.png'; pg.screenshot(path=f,clip=clip); fr.append(f)
        pg.mouse.up(); pg.wait_for_timeout(300); f=A+'d99.png'; pg.screenshot(path=f,clip=clip); fr.append(f)
        sz=frames_to_webp(fr,A+'anim_drag.webp')
        pg.click('#vSave'); pg.wait_for_timeout(500)
        js=save_json(pg,'코스1_완성본.json')
        return [r,r2,r3,sz,js]
    step('s1',s1)
    # ---------- session 2: Excel dialog marks + course6 start + detail
    def s2():
        pg.set_viewport_size({'width':1400,'height':3200})
        blank(pg,14,8)
        pg.click('#exOpen'); pg.wait_for_timeout(300); pg.set_input_files('#exFileDialog',X); pg.wait_for_timeout(2500)
        pg.select_option('#wMode','fixed'); pg.wait_for_timeout(2500)
        hs=pg.evaluate("()=>[...document.querySelectorAll('dialog[open] h3')].map((h,i)=>{h.parentElement.setAttribute('data-shot','s'+i);return h.innerText})")
        r=mark(pg,[('#rTarget',1),('dialog[open] label',2,'선택한 대상 배치를 확인했습니다')]); shot_el(pg,'[data-shot=s0]',S+'c2_sec0.png'); unmark(pg)
        r2=mark(pg,[('dialog[open] label',1,'파일 선택'),('#exHeader',2),('dialog[open] *','3','20개 필드 중')]); shot_el(pg,'[data-shot=s1]',S+'c2_sec1.png'); unmark(pg)
        r3=mark(pg,[('#fxAxis',1),('#fxGaps',2)]); shot_el(pg,'#fxAxis >> xpath=ancestor::details[1]',S+'c2_fixed_settings.png'); unmark(pg)
        pg.locator('label:has-text("선택한 대상 배치를 확인했습니다")').first.click(); pg.wait_for_timeout(300)
        pg.locator('#exApply').evaluate("e=>e.parentElement.parentElement.setAttribute('data-ap','1')")
        r4=mark(pg,[('#exApply',1)]); shot_el(pg,'[data-ap]',S+'c2_apply.png'); unmark(pg)
        pg.click('#exApply'); pg.wait_for_timeout(1500); closeall(pg)
        pg.set_viewport_size({'width':1600,'height':1250}); pg.wait_for_timeout(300); pg.click('#fit'); pg.wait_for_timeout(300)
        js=save_json(pg,'코스6_시작.json')
        racks=pg.evaluate("()=>[...document.querySelectorAll('#plan [data-id]')].map(e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,r.width,r.height]}).filter(x=>x[2]>15&&x[3]>15)")
        pg.mouse.dblclick(racks[0][0],racks[0][1]); pg.wait_for_timeout(900)
        r5=mark(pg,[('#sInfoShelf',1),('#sShelfOrder',2),('#sInfoPng',3)]); shot_el(pg,'#sInfoDialog',S+'c6_detail.png'); unmark(pg); closeall(pg)
        return [hs,r,r2,r3,r4,r5,js]
    step('s2',s2)
    # ---------- session 3: course 3 start, box anim, multi panel, dialog, aisle, polygon anim
    def s3():
        blank(pg,10,6); at,clip=geo(pg,10,6)
        pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.click('button[data-tool=rack]')
        for pt in [(1.2,1.0),(3.1,1.4),(4.6,0.9),(6.9,1.6)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(250)
        pg.click('button[data-tool=select]'); pg.mouse.click(*at(9.5,5.5)); pg.wait_for_timeout(300)
        pg.click('#vSave'); pg.wait_for_timeout(400); js=save_json(pg,'코스3_시작.json')
        fr=[]; a=at(0.3,0.3); c=at(8.2,2.6)
        f=A+'b00.png'; pg.screenshot(path=f,clip=clip); fr.append(f)
        pg.mouse.move(*a); pg.mouse.down()
        for i in range(1,11):
            t=i/10; pg.mouse.move(a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t,steps=2); pg.wait_for_timeout(50)
            f=A+f'b{i:02d}.png'; pg.screenshot(path=f,clip=clip); fr.append(f)
        pg.mouse.up(); pg.wait_for_timeout(350); f=A+'b99.png'; pg.screenshot(path=f,clip=clip); fr.append(f)
        sz1=frames_to_webp(fr,A+'anim_box.webp')
        pg.evaluate("()=>"+RIGHT+".setAttribute('data-sec','right')")
        r=mark(pg,[('[data-sec=right] button',1,'위쪽 정렬'),('[data-sec=right] button',2,'가로 간격')])
        rc=pg.evaluate("()=>{const r="+RIGHT+".getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:Math.min(r.height,620)}}")
        pg.screenshot(path=S+'c3_multi_panel.png',clip=rc); unmark(pg)
        pg.locator('[data-sec=right] button',has_text='가로 간격').first.click(); pg.wait_for_timeout(500)
        gi=pg.locator('#mEditDialog label:has-text("외곽 사이 간격") input').first; gi.fill('0.3'); gi.press('Tab'); pg.click('#mPreviewRefresh'); pg.wait_for_timeout(500)
        r2=mark(pg,[('#mAction',1),('#mGap',2),('#mPreviewRefresh',3),('#mEditApply',4)]); shot_el(pg,'#mEditDialog',S+'c3_dlg_gap.png'); unmark(pg)
        pg.click('#mEditClose'); pg.wait_for_timeout(300); closeall(pg)
        pg.mouse.click(*at(9.5,5.5)); pg.wait_for_timeout(200)
        pg.click('button[data-tool=aisle]'); pg.mouse.click(*at(3.0,3.6)); pg.wait_for_timeout(500)
        pg.evaluate("()=>"+RIGHT+".setAttribute('data-sec','right')")
        r3=mark(pg,[('[data-sec=right] label',1,'최소 확보 폭 (m)'),('[data-sec=right] label',2,'목표 폭 (m)'),('[data-sec=right] label',3,'통로 종류')])
        rc=pg.evaluate("()=>{const r="+RIGHT+".getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:Math.min(r.height,700)}}")
        pg.screenshot(path=S+'c3_aisle_right.png',clip=rc); unmark(pg)
        pg.click('button[data-tool=select]'); pg.mouse.click(*at(9.5,5.5)); pg.wait_for_timeout(200)
        fr=[]; pg.click('#mPolygonAisle'); pg.wait_for_timeout(300); f=A+'p00.png'; pg.screenshot(path=f,clip=clip); fr.append(f)
        for i,pt in enumerate([(6.6,0.3),(9.7,0.3),(9.7,5.7),(8.6,5.7),(8.6,2.6),(6.6,2.6)]):
            pg.mouse.click(*at(*pt)); pg.wait_for_timeout(250); f=A+f'p{i+1:02d}.png'; pg.screenshot(path=f,clip=clip); fr.append(f); fr.append(f)
        pg.click('#mFinishPolygon'); pg.wait_for_timeout(600); pg.mouse.click(*at(5,5.6)); pg.wait_for_timeout(300)
        f=A+'p99.png'; pg.screenshot(path=f,clip=clip); fr.append(f)
        sz2=frames_to_webp(fr,A+'anim_poly.webp',dur=260)
        return [js,sz1,r,r2,r3,sz2]
    step('s3',s3)
    # ---------- session 4: BEFORE lock bar, course 4 start, clone dialog, then course5 versions/targets
    def s4():
        blank(pg,10,6)
        pg.click('#rBefore'); pg.wait_for_timeout(400)
        bar=pg.evaluate("()=>{const r=document.querySelector('.r-toolbar').getBoundingClientRect();return {x:r.x,y:r.y-30,width:r.width,height:r.height+30}}")
        r=mark(pg,[('#rLock',1)]); pg.screenshot(path=S+'c4_bar_locked.png',clip=bar); unmark(pg)
        pg.click('#rLock'); pg.wait_for_timeout(500)
        r2=mark(pg,[('#rLock',1)]); pg.screenshot(path=S+'c4_bar_unlocked.png',clip=bar); unmark(pg)
        pg.fill('#roomWidth','10'); pg.fill('#roomHeight','6'); pg.click('#applyRoom'); pg.wait_for_timeout(300); pg.click('#fit'); pg.wait_for_timeout(300)
        at,clip=geo(pg,10,6)
        pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.click('button[data-tool=rack]')
        for pt in [(1.2,1.0),(3.3,1.3),(5.0,0.9),(1.4,3.2),(4.2,3.6),(7.5,2.2)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(250)
        pg.click('button[data-tool=select]'); pg.click('#rLock'); pg.wait_for_timeout(400)
        pg.click('#vSave'); pg.wait_for_timeout(400); js=save_json(pg,'코스4_시작.json')
        pg.click('#rClone'); pg.wait_for_timeout(700)
        r3=mark(pg,[('#rCloneChoice',1),('#rCloneApply',2)]); shot_el(pg,'#rCloneDialog',S+'c4_clone_dialog.png'); unmark(pg)
        pg.click('#rCloneApply'); pg.wait_for_timeout(800); closeall(pg)
        if 'After' not in pg.evaluate("()=>scenario.selectedOptions[0].text"): pg.click('#rAfter'); pg.wait_for_timeout(300)
        pg.click('#fit'); pg.wait_for_timeout(300); at,clip=geo(pg,10,6)
        pg.click('button[data-tool=rack]')
        for pt in [(1.2,5.2),(3.0,5.2)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(250)
        pg.click('button[data-tool=select]')
        a=at(0.2,4.6); c=at(4.2,5.8); pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c,steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
        pg.click('#delete'); pg.wait_for_timeout(600)
        pg.click('#vVersions'); pg.wait_for_timeout(600)
        r4=mark(pg,[('#vBackupDialog button',1,'현재 백업 후 복원'),('#vBackupDialog button',2,'이 버전 JSON')]); shot_el(pg,'#vBackupDialog',S+'c5_versions.png'); unmark(pg); closeall(pg)
        pg.click('#rClone'); pg.wait_for_timeout(500); pg.click('#rCloneApply'); pg.wait_for_timeout(700); closeall(pg)
        pg.click('#sBottomToggle'); pg.wait_for_timeout(400)
        sm=pg.locator('summary',has_text='Excel 가져오기·자동 백업 이력').first; sm.click(); pg.wait_for_timeout(400)
        sm.evaluate("e=>e.parentElement.setAttribute('data-sec','bk')")
        pg.locator('[data-sec=bk]').screenshot(path=S+'c5_target_backups.png')
        rr=pg.evaluate("()=>{const s=document.querySelector('[data-sec=bk]').getBoundingClientRect();const b=[...document.querySelectorAll('[data-sec=bk] button')].find(e=>e.innerText.trim()=='이 상태로 복원');const r=b.getBoundingClientRect();return [r.x-s.x,r.y-s.y,r.width,r.height,s.width,s.height]}")
        from PIL import ImageDraw
        im=Image.open(S+'c5_target_backups.png').convert('RGB'); sc=im.width/rr[4]; d=ImageDraw.Draw(im)
        x,y,w,h=[v*sc for v in rr[:4]]
        d.rounded_rectangle([x-4,y-4,x+w+4,y+h+4],radius=7,outline=(255,59,48),width=3)
        d.ellipse([x-16,y-16,x+8,y+8],fill=(255,59,48),outline='white',width=2); d.text((x-7,y-13),'1',fill='white')
        im.save(S+'c5_target_backups.png'); r5=rr
        return [r,r2,js,r3,r4,r5]
    step('s4',s4)
    # ---------- session 5: course 5 start file (5 racks)
    def s5():
        blank(pg,10,6); at,clip=geo(pg,10,6)
        pg.fill('#newWidth','1.2'); pg.fill('#newDepth','0.5'); pg.click('button[data-tool=rack]')
        for pt in [(1.2,1.0),(3.0,1.0),(4.8,1.0),(1.2,3.0),(3.0,3.0)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(250)
        pg.click('button[data-tool=select]'); pg.click('#vSave'); pg.wait_for_timeout(400)
        return save_json(pg,'코스5_시작.json')
    step('s5',s5)
    b.close()
json.dump(log,open('@@W@@/work/mark_shoot.json','w'),ensure_ascii=False,indent=1)
print(json.dumps(log,ensure_ascii=False))
