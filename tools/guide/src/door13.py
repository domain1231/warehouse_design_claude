from playwright.sync_api import sync_playwright
import json
exec(open('@@W@@/scripts/exam.py',encoding='utf-8').read().split('def FILL')[0].split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':1250}); pg.on('dialog',lambda d:d.accept())
    pg.goto(APP); pg.wait_for_timeout(1300)
    pg.click('#newBlank'); pg.wait_for_timeout(400)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    pg.fill('#roomWidth','14'); pg.fill('#roomHeight','8'); pg.click('#applyRoom'); pg.wait_for_timeout(300); pg.click('#fit'); pg.wait_for_timeout(300)
    x0,y0,w,h=pg.evaluate(ROOM); at=lambda a,c:(x0+a*w/14,y0+c*h/8)
    pg.click('button[data-tool=door]'); pg.mouse.click(*at(7,0.05)); pg.wait_for_timeout(400)
    m=pg.evaluate("()=>[...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].filter(e=>/전체 취소/.test(e.innerText)).map(e=>{const r=e.getBoundingClientRect();return [e.innerText.trim(),r.x,r.y,r.width,r.height]})")
    print(json.dumps(m,ensure_ascii=False))
    cv=pg.evaluate("()=>{const r=document.querySelector('#plan').getBoundingClientRect();return [r.x,r.y,r.width,r.height]}")
    ys=[cv[1]]+[e[2] for e in m]; ye=[cv[1]+cv[3]*0.45]+[e[2]+e[4] for e in m]
    top=max(0,min(ys)-10); bot=max(ye)+10
    e=m[0]; pg.screenshot(path='@@W@@/shots/g/c1_door_reject.png',clip={'x':e[1]-30,'y':e[2]-16,'width':e[3]+60,'height':e[4]+32})
    b.close()
