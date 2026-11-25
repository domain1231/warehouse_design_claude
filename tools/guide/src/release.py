# 배포용 이름으로 묶기 + 사용자용 PDF (run.py --steps ... ,release)
import os,shutil,json
from playwright.sync_api import sync_playwright
GUIDE_VER=os.environ.get('GUIDE_VER','2.2'); APP_TAG=os.environ.get('APP_TAG','a14')
O='@@W@@/out/'; R=O+'release/'; os.makedirs(R,exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='@@CHROME@@',args=['--no-sandbox']); pg=b.new_page(viewport={'width':1300,'height':900})
    pg.goto('file://'+O+'Warehouse_Studio_v2_5_0a2_UserGuide_v2_0_사용자용.html'); pg.wait_for_timeout(2500); pg.emulate_media(media='print')
    pg.pdf(path=O+'user.pdf',format='A4',print_background=True,margin={'top':'12mm','bottom':'12mm','left':'10mm','right':'10mm'})
    b.close()
v=GUIDE_VER.replace('.','_')
m={'Warehouse_Studio_v2_5_0a2_UserGuide_v2_0.html':f'Warehouse_Studio_v2_5_0{APP_TAG}_UserGuide_v{v}.html',
   'Warehouse_Studio_v2_5_0a2_UserGuide_v2_0_사용자용.html':f'Warehouse_Studio_v2_5_0{APP_TAG}_UserGuide_v{v}_사용자용.html',
   'user.pdf':f'Warehouse_Studio_설명서_v{v}_사용자용.pdf','Warehouse_Studio_빠른카드_v2_0.pdf':f'Warehouse_Studio_빠른카드_v{v}.pdf'}
for k in ['관리자용_소책자','강사용_교육패킷','전체본_컬러','전체본_잉크절약']: m[f'Warehouse_Studio_설명서_v2_0_{k}.pdf']=f'Warehouse_Studio_설명서_v{v}_{k}.pdf'
extra={'@@W@@/work/cp/실사용테스트_과제3_시작.json':'실사용테스트_과제3_시작.json'}
out=[]
for a,b2 in m.items(): shutil.copy(O+a,R+b2); out.append([b2,os.path.getsize(R+b2)//1024])
for a,b2 in extra.items():
    if os.path.exists(a): shutil.copy(a,R+b2); out.append([b2,os.path.getsize(R+b2)//1024])
print(json.dumps(out,ensure_ascii=False,indent=0))
