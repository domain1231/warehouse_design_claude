(function(){
  var store={get:function(k){try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}},set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
  var KEY='wsguide-v2.0-checks';
  var courses=[].slice.call(document.querySelectorAll('section.course'));
  var side=document.createElement('aside'); side.id='gSide'; side.setAttribute('aria-label','목차와 검색');
  var h='<div class="gs-top"><input id="gQ" type="search" placeholder="검색 (예: 통로 폭, 복원, BEFORE)" aria-label="설명서 검색"><div id="gRes" role="listbox"></div></div><nav class="gs-nav">';
  courses.forEach(function(c){
    var t=c.querySelector('h2'); var b=c.querySelector('.badge'); if(!t)return;
    h+='<div class="gs-c"><a href="#'+c.id+'" data-t="'+c.id+'"><b>'+(b?b.textContent:'')+'</b> '+t.textContent.split(' — ')[0]+'</a><div class="gs-s">';
    [].slice.call(c.querySelectorAll('article.step')).forEach(function(a){var x=a.querySelector('h3');if(x)h+='<a href="#'+a.id+'" data-t="'+a.id+'">'+x.textContent+'</a>'});
    h+='</div></div>';
  });
  h+='</nav><details class="gs-print"><summary>인쇄 범위 고르기</summary><div id="gPr"></div><label><input type="checkbox" id="gQa"> 퀴즈 정답 펼쳐서 인쇄</label><label><input type="checkbox" id="gInk"> 잉크 절약 · 흑백 인쇄용 (어두운 화면을 밝게)</label><button type="button" id="gPrint">선택한 범위 인쇄</button></details>';
  side.innerHTML=h; document.body.appendChild(side);
  var pr=document.getElementById('gPr');
  courses.forEach(function(c){var t=c.querySelector('.badge');var l=document.createElement('label');l.innerHTML='<input type="checkbox" checked data-c="'+c.id+'"> '+(t?t.textContent:c.id)+' · '+(c.querySelector('h2')||{}).textContent.split(' — ')[0];pr.appendChild(l)});
  var tog=document.createElement('button'); tog.id='gTog'; tog.type='button'; tog.textContent='목차·검색'; tog.onclick=function(){document.body.classList.toggle('gs-open')}; document.body.appendChild(tog);
  var top=document.createElement('button'); top.id='gTop'; top.type='button'; top.textContent='↑ 맨 위'; top.onclick=function(){scrollTo({top:0,behavior:'smooth'})}; document.body.appendChild(top);
  document.body.classList.add('gs');
  side.addEventListener('click',function(e){if(e.target.closest('a')&&innerWidth<1400)document.body.classList.remove('gs-open')});
  // scrollspy
  var links={}; [].slice.call(side.querySelectorAll('a[data-t]')).forEach(function(a){links[a.getAttribute('data-t')]=a});
  var targets=[].slice.call(document.querySelectorAll('section.course, article.step'));
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){var id=x.target.id;var a=links[id];if(!a)return;
      if(x.target.tagName==='ARTICLE'){[].slice.call(side.querySelectorAll('.gs-s a.on')).forEach(function(o){o.classList.remove('on')});a.classList.add('on')}
      else{[].slice.call(side.querySelectorAll('.gs-c')).forEach(function(o){o.classList.remove('cur')});a.parentNode.classList.add('cur')}
      if(innerWidth>=1400){var r=a.getBoundingClientRect(),n=side.querySelector('.gs-nav').getBoundingClientRect();if(r.top<n.top||r.bottom>n.bottom)a.scrollIntoView({block:'nearest'})}}})},{rootMargin:'-10% 0px -80% 0px'});
    targets.forEach(function(t){io.observe(t)});
  }
  // search
  var idx=targets.filter(function(t){return t.tagName==='ARTICLE'}).map(function(a){var hd=a.querySelector('h3');var c=a.closest('section.course');var cb=c&&c.querySelector('.badge');return {el:a,title:(cb?cb.textContent+' · ':'')+(hd?hd.textContent:a.id),text:a.textContent.replace(/\s+/g,' ')}});
  var q=document.getElementById('gQ'),res=document.getElementById('gRes');
  function esc(s){return s.replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  q.addEventListener('input',function(){
    var v=q.value.trim(); res.innerHTML=''; if(v.length<2){res.style.display='none';return}
    var terms=v.toLowerCase().split(/\s+/); var hits=[];
    idx.forEach(function(o){var low=o.text.toLowerCase(),tl=o.title.toLowerCase();if(terms.every(function(t){return low.indexOf(t)>=0})){var p=low.indexOf(terms[0]);var sn=o.text.slice(Math.max(0,p-30),p+70);hits.push({o:o,s:(tl.indexOf(terms[0])>=0?3:0)+terms.reduce(function(n,t){return n+low.split(t).length-1},0),sn:sn})}});
    hits.sort(function(a,b){return b.s-a.s});
    res.style.display='block';
    if(!hits.length){res.innerHTML='<div class="gr-none">결과 없음 · 다른 말로 찾아보세요 (예: "저장 안 됨" → "UNSAVED")</div>';return}
    res.innerHTML='<div class="gr-n">'+hits.length+'곳</div>'+hits.slice(0,30).map(function(h,i){var sn=esc(h.sn);terms.forEach(function(t){if(t)sn=sn.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),function(m){return '<mark>'+m+'</mark>'})});return '<a href="#'+h.o.el.id+'" class="gr" data-i="'+i+'"><b>'+esc(h.o.title)+'</b><span>…'+sn+'…</span></a>'}).join('');
  });
  res.addEventListener('click',function(e){var a=e.target.closest('a.gr');if(!a)return;var t=document.getElementById(a.getAttribute('href').slice(1));if(t){t.classList.remove('flash');void t.offsetWidth;t.classList.add('flash')}});
  document.addEventListener('keydown',function(e){if(e.key==='/'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();document.body.classList.add('gs-open');q.focus()}});
  // lightbox
  var lb=document.createElement('div'); lb.id='gLb'; lb.setAttribute('role','dialog'); lb.setAttribute('aria-label','그림 크게 보기'); lb.innerHTML='<img alt=""><div class="lb-c"></div><button type="button" aria-label="닫기">닫기 ×</button>'; document.body.appendChild(lb);
  function close(){lb.classList.remove('on')}
  lb.addEventListener('click',close); document.addEventListener('keydown',function(e){if(e.key==='Escape')close()});
  [].slice.call(document.querySelectorAll('figure img, .map img, .fm-img img')).forEach(function(im){im.classList.add('zoomable');im.tabIndex=0;im.title='눌러서 크게 보기';
    function open(){lb.querySelector('img').src=im.src;var c=im.closest('figure,.map');var cap=c&&c.querySelector('figcaption');if(!cap&&c&&c.nextElementSibling&&c.nextElementSibling.tagName==='FIGCAPTION')cap=c.nextElementSibling;lb.querySelector('.lb-c').textContent=cap?cap.textContent:'';lb.classList.add('on')}
    im.addEventListener('click',function(e){if(e.target.closest('.map')&&e.target!==im)return;open()}); im.addEventListener('keydown',function(e){if(e.key==='Enter')open()})});
  // checklist memory
  var boxes=[].slice.call(document.querySelectorAll('.check input[type=checkbox], .chk input[type=checkbox]')); var saved=store.get(KEY)||{};
  boxes.forEach(function(b,i){var k='c'+i;if(saved[k])b.checked=true;b.addEventListener('change',function(){saved[k]=b.checked;store.set(KEY,saved);prog()})});
  function prog(){courses.forEach(function(c){var bs=[].slice.call(c.querySelectorAll('.check input[type=checkbox]'));if(!bs.length)return;var n=bs.filter(function(b){return b.checked}).length;var a=links[c.id];if(!a)return;var s=a.querySelector('.pg');if(!s){s=document.createElement('span');s.className='pg';a.appendChild(s)}s.textContent=n+'/'+bs.length;s.classList.toggle('done',n===bs.length)})}
  prog();
  // print selection
  function applyPrint(){[].slice.call(pr.querySelectorAll('input')).forEach(function(i){var c=document.getElementById(i.getAttribute('data-c'));if(c)c.classList.toggle('noprint',!i.checked)});
    document.body.classList.toggle('inksave',document.getElementById('gInk').checked);var qa=document.getElementById('gQa').checked;[].slice.call(document.querySelectorAll('.quiz details')).forEach(function(d){if(qa){d.dataset.was=d.open?'1':'0';d.open=true}})}
  function resetPrint(){document.body.classList.remove('inksave');[].slice.call(document.querySelectorAll('.noprint')).forEach(function(c){c.classList.remove('noprint')});[].slice.call(document.querySelectorAll('.quiz details[data-was]')).forEach(function(d){d.open=d.dataset.was==='1';delete d.dataset.was})}
  document.getElementById('gPrint').onclick=function(){applyPrint();window.print();setTimeout(resetPrint,500)};
  addEventListener('afterprint',resetPrint);
})();
(function(){
  function b64(s){var bin=atob(s.replace(/\s+/g,''));var u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u}
  document.addEventListener('click',function(e){
    var a=e.target.closest('a.dlf'); if(!a)return; e.preventDefault();
    var s=document.getElementById(a.getAttribute('data-f')); if(!s)return;
    var name=s.getAttribute('data-name'), u=b64(s.textContent);
    var type=/\.json$/.test(name)?'application/json':/\.xlsx$/.test(name)?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'image/png';
    function save(blob){var url=URL.createObjectURL(blob);var x=document.createElement('a');x.href=url;x.download=name;document.body.appendChild(x);x.click();setTimeout(function(){URL.revokeObjectURL(url);x.remove()},1500)}
    if(s.getAttribute('data-gz')==='1'){
      if(!('DecompressionStream' in window)){alert('이 브라우저는 압축 해제를 지원하지 않습니다. 최신 Chrome 또는 Edge에서 열어 주세요.');return}
      new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).blob().then(function(b){save(new Blob([b],{type:type}))});
    } else save(new Blob([u],{type:type}));
  });
})();
