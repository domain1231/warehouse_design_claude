import json,re
from playwright.sync_api import sync_playwright
S='@@W@@/shots/g/'
X='@@W@@/work/edu/교육용_창고데이터.xlsx'
out={}
def run(pg,W,H,tag):
    pg.goto('file://@@W@@/dl/app.html'); pg.wait_for_timeout(1300)
    pg.click('#newBlank'); pg.wait_for_timeout(400)
    if pg.locator('#vReplaceSave').is_visible(): pg.locator('#vReplaceSave').click(); pg.wait_for_timeout(600)
    pg.fill('#roomWidth',str(W)); pg.fill('#roomHeight',str(H)); pg.click('#applyRoom'); pg.wait_for_timeout(300)
    pg.click('#exOpen'); pg.wait_for_timeout(300); pg.set_input_files('#exFileDialog',X); pg.wait_for_timeout(2500)
    res={}
    for mode in ['inside','order','fixed','aisle','column']:
        pg.select_option('#wMode',mode); pg.wait_for_timeout(2500)
        t=pg.evaluate("()=>document.querySelector('dialog[open]').innerText")
        line=re.search(r'선택 후보:[^\n]*',t); summ=re.search(r'전체 \d+랙 · 경계 내부[^\n]*',t)
        rows=re.findall(r'\n([^\n]+)\n\t(\d+ / \d+)\t(\d+ / \d+)\t(\d+ / \d+)\t(\d+ / \d+)\t(\d+ / \d+)\t(\d+)\t',t)
        extra=re.findall(r'(폭 [\d.]+m 부족[^\n]*|[^\n]*부족[^\n]*m[^\n]*)',t)[:3]
        labels=pg.evaluate("()=>{const s=[...document.querySelectorAll('dialog[open] svg')].sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0];return s?[...s.querySelectorAll('text')].map(x=>x.textContent).filter(x=>/^[A-C]\\d\\d$/.test(x)):[]}")
        res[mode]={'line':line.group(0) if line else None,'summary':summ.group(0) if summ else None,'rows':rows[:6],'extra':extra,'order':labels}
        pg.evaluate("()=>{const s=[...document.querySelectorAll('dialog[open] svg')].sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0];s&&s.setAttribute('data-pv','1')}")
        try: pg.locator('[data-pv]').first.screenshot(path=f'{S}v_{tag}_{mode}.png')
        except Exception as e: res[mode]['shot']=str(e)[:80]
        pg.evaluate("()=>document.querySelectorAll('[data-pv]').forEach(e=>e.removeAttribute('data-pv'))")
    return res
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1400,'height':3200}); pg.on('dialog',lambda d:d.accept())
    out['wide']=run(pg,14,8,'wide'); out['tight']=run(pg,7,5,'tight')
    b.close()
json.dump(out,open('@@W@@/work/v_modes.json','w'),ensure_ascii=False,indent=1)
for k,v in out.items():
    print('=====',k)
    for m,r in v.items(): print(m,'|',r['line'],'\n   ',r['summary'],'\n   rows',r['rows'][:3],'\n   extra',r['extra'],'\n   order',' '.join(r['order']))
