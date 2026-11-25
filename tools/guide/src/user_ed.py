import re
F='@@W@@/out/Warehouse_Studio_v2_5_0a2_UserGuide_v2_0.html'
s=open(F,encoding='utf-8').read()
a=s.index(re.search(r'<section[^>]*id="mg"',s).group(0))
# find matching </section>
i=a; depth=0
for m in re.finditer(r'<section\b|</section>',s[a:]):
    depth+= 1 if m.group(0)=='<section' else -1
    if depth==0: b=a+m.end(); break
s=s[:a]+s[b:]
s=re.sub(r'<a href="#(mg|m[1-5])"[^>]*>[^<]*</a>\s*(·\s*)?','',s) if False else s
# TOC/nav links to manager parts: drop; inline references: point to glossary
def fix(m):
    t=m.group(2)
    return f'<a href="#ax-1">{t if not t.startswith("M-") else "A-1 용어"}</a>'
s=re.sub(r'<a href="#(m[1-5])"[^>]*>([^<]*)</a>',fix,s)
s=re.sub(r'<a href="#mg"[^>]*>[^<]*</a>','',s)
s=s.replace('사용자 설명서','사용자 설명서 (사용자용)',1)
O=F.replace('.html','_사용자용.html'); open(O,'w',encoding='utf-8').write(s)
print(len(s), 'left m-ids:',re.findall(r'href="#(m[1-5]|mg)"',s)[:5], 'M-4 mentions:',s.count('M-4'))
s=open(O,encoding='utf-8').read()
s=re.sub(r'<a class="rd" href="#m[12]">.*?</a>\s*','',s,flags=re.S)
s=s.replace('아래 시연 시나리오 + M-2·M-4','아래 시연 시나리오 + 관리자용 소책자').replace('M-1 한 장 요약 + 실제 보고서(M-3) 1건','관리자용 소책자 + 실제 보고서 1건')
open(O,'w',encoding='utf-8').write(s); print('m refs left:',len(re.findall(r'href="#m[1-5]"',s)),'M- left:',len(re.findall(r'M-[1-5]',s)))
