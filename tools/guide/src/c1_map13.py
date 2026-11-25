from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1600,'height':1330})
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1500)
    for d in pg.locator('dialog[open] button').all()[:0]: pass
    pg.screenshot(path='shots/g/c1_map.png')
    R=pg.evaluate("""()=>{const q=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]};
    return {hdr:q('#header-actions'),save:q('#vSaveDetail'),status:q('#wTop'),left:q('aside.sidebar.left'),scen:q('#r-toolbar'),view:q('#v-label-controls'),zoom:q('#toolbar'),plan:q('svg#plan'),rot:q('#rotate'),right:q('aside.sidebar.right')||q('main ~ aside'),legend:q('.legend')}}""")
    R['tb']=pg.evaluate("()=>[...document.querySelectorAll('#toolbar')].map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.y),Math.round(r.height)]})")
    print(json.dumps(R))
    b.close()
