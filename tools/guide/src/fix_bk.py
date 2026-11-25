from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
import json
S='@@W@@/shots/g/'; APP='file://@@W@@/dl/app.html'
ROOM="""()=>{const s=document.querySelector('#plan');let best=null,ba=0;s.querySelectorAll('rect').forEach(r=>{const b=r.getBoundingClientRect();const a=b.width*b.height;if(a>ba&&b.width<s.getBoundingClientRect().width*0.99){ba=a;best=b}});return [best.x,best.y,best.width,best.height]}"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':1400}); pg.on('dialog',lambda d:d.accept())
    pg.goto(APP); pg.wait_for_timeout(1300)
    pg.click('#newBlank'); pg.wait_for_timeout(400)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    pg.click('#rBefore'); pg.click('#rLock'); pg.wait_for_timeout(300)
    pg.fill('#roomWidth','10'); pg.fill('#roomHeight','6'); pg.click('#applyRoom'); pg.wait_for_timeout(300); pg.click('#fit'); pg.wait_for_timeout(300)
    x0,y0,w,h=pg.evaluate(ROOM); at=lambda a,c:(x0+a*w/10,y0+c*h/6)
    pg.click('button[data-tool=rack]')
    for pt in [(1.2,1.0),(3.0,1.0),(4.8,1.0)]: pg.mouse.click(*at(*pt)); pg.wait_for_timeout(200)
    pg.click('button[data-tool=select]'); pg.click('#rLock'); pg.wait_for_timeout(300)
    for k in range(2):
        pg.click('#rClone'); pg.wait_for_timeout(500); pg.click('#rCloneApply'); pg.wait_for_timeout(700)
        pg.evaluate("()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    pg.click('#sBottomToggle'); pg.wait_for_timeout(400)
    for t in ['▾ 공간검토','▾ 랙 목록']:
        l=pg.locator('button',has_text=t)
        if l.count(): l.first.click(); pg.wait_for_timeout(200)
    sm=pg.locator('summary',has_text='Excel 가져오기·자동 백업 이력').first; sm.click(); pg.wait_for_timeout(400)
    sm.evaluate("e=>{const d=e.parentElement;d.setAttribute('data-sec','bk');let p=d;while(p){const cs=getComputedStyle(p);if(cs.overflowY!='visible'||cs.maxHeight!='none'){p.style.maxHeight='none';p.style.height='auto';p.style.overflow='visible'}p=p.parentElement;if(p===document.body)break}}")
    pg.wait_for_timeout(300)
    pg.locator('[data-sec=bk]').scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    pg.locator('[data-sec=bk]').screenshot(path=S+'c5_target_backups.png')
    rr=pg.evaluate("()=>{const s=document.querySelector('[data-sec=bk]').getBoundingClientRect();const b=[...document.querySelectorAll('[data-sec=bk] button')].find(e=>e.innerText.trim()=='이 상태로 복원');const r=b.getBoundingClientRect();return [r.x-s.x,r.y-s.y,r.width,r.height,s.width,s.height]}")
    im=Image.open(S+'c5_target_backups.png').convert('RGB'); sc=im.width/rr[4]; d=ImageDraw.Draw(im)
    x,y,w2,h2=[v*sc for v in rr[:4]]
    d.rounded_rectangle([x-4,y-4,x+w2+4,y+h2+4],radius=7,outline=(255,59,48),width=3)
    d.ellipse([x-18,y-18,x+6,y+6],fill=(255,59,48),outline='white',width=2); d.text((x-9,y-14),'1',fill='white')
    im.save(S+'c5_target_backups.png'); print(rr, im.size)
    b.close()
