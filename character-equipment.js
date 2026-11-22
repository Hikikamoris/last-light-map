/* Original vector equipment diagram; portraits are separate lightweight game assets. */
(function(){
 'use strict';
 var labels=['Основное оружие','Одежда','Защита','Рюкзак','Предмет 1','Предмет 2','Предмет 3','Предмет 4'];
 var paths=[
  '<path d="m3 14 11-5 5 1 2-1 1 3-3 2-6 1-3 6H6l2-6-5 1zM14 9V6m3 3V5"/>',
  '<path d="m8 3-5 4-2 6 5 2 2-4v10h8V11l2 4 5-2-2-6-5-4-4 3z"/>',
  '<path d="m12 2 9 4-1 8c-1 4-5 7-8 8-3-1-7-4-8-8L3 6zM12 6v12M7 9h10"/>',
  '<rect x="5" y="6" width="14" height="16" rx="4"/><path d="M8 6V4a4 4 0 0 1 8 0v2M5 14h14M9 18h6M3 9v9m18-9v9"/>',
  '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 5V3h8v2M12 9v8m-4-4h8"/>',
  '<path d="m9 3 6 1 3 7-3 3-2 7-5-1 1-7-3-5zM9 13l6 1M8 5l7 2"/>',
  '<rect x="6" y="8" width="12" height="14" rx="2"/><path d="M8 8 5 1m9 7V4M9 12h6m-6 4h3m3 3h.01"/>',
  '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 10h18M8 4v6m8-6v6M8 15h8"/>'
 ];
 function esc(v){return String(v==null?'':v).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 function icon(i){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[i]+'</svg>'}
 function figure(){
  return '<svg class="eq-silhouette" viewBox="0 0 180 360" fill="none" aria-hidden="true">'+
   '<path d="M90 8v344M12 55h156M12 145h156M12 235h156M12 325h156" stroke="currentColor" stroke-opacity=".12" stroke-dasharray="3 5"/>'+
   '<ellipse cx="90" cy="340" rx="47" ry="8" fill="#070b06" opacity=".6"/>'+
   '<path d="M67 52q-1-32 23-33 25 1 24 33l-7 25H74z" fill="#424936" stroke="#a89965" stroke-width="1.3"/>'+
   '<path d="M73 46q17-15 34 0l-4 21H77z" fill="#171e14" stroke="#7f805a"/><path d="M78 53h24m-23 7h22" stroke="#626d51"/>'+
   '<path d="m73 76-28 15-12 74-10 56 16 4 20-56 6-39-5 78h60l-5-78 6 39 20 56 16-4-10-56-12-74-28-15" fill="#343e2d" stroke="#8d9063" stroke-width="1.3"/>'+
   '<path d="m23 221-4 20 5 7 12-8 3-15m102 0 3 15 12 8 5-7-4-20" fill="#4b503a" stroke="#8d9063"/>'+
   '<path d="M67 91h46l4 84H63z" fill="#252e20" stroke="#9e9360"/>'+
   '<path d="M71 96h38v24H71zM68 128h17v24H68zm27 0h17v24H95zM65 160h50v17H65z" fill="#414c32" stroke="#7c8057"/>'+
   '<path d="m61 181-5 42 13 91h18l3-98 3 98h18l13-91-5-42" fill="#2a3426" stroke="#8d9063" stroke-width="1.3"/>'+
   '<path d="M61 231h19v30H61zm39 0h19v30h-19z" fill="#3c4932" stroke="#67774b"/>'+
   '<path d="m68 306-4 19-7 10v7h30v-36m7 0v36h30v-7l-7-10-5-19" fill="#1d251b" stroke="#8d9063"/>'+
   '<path d="M30 108H8m145 18h19M38 190H8m131 4h33" stroke="#c5a650" stroke-opacity=".6"/>'+
   '<circle cx="30" cy="108" r="3" fill="#c5a650"/><circle cx="153" cy="126" r="3" fill="#c5a650"/><circle cx="38" cy="190" r="3" fill="#c5a650"/><circle cx="139" cy="194" r="3" fill="#c5a650"/>'+
   '</svg>';
 }
 function slot(gear,index,memberIndex,master){
  var item=gear[index]||{},occupied=Boolean(String(item.name||'').trim());
  return '<details class="eq-slot '+(occupied?'is-equipped':'is-empty')+'" data-gear-slot="'+index+'"><summary><span class="eq-slot-icon">'+icon(index)+'</span><span class="eq-slot-text"><small>'+labels[index]+'</small><b>'+esc(item.name||'Не назначено')+'</b></span><span class="eq-slot-chevron" aria-hidden="true">⌄</span></summary><div class="eq-slot-content"><p>'+esc(item.description||(occupied?'Описание предмета ещё не добавлено.':'Слот свободен.'))+'</p>'+(master?'<button type="button" data-ds="edit-gear" data-index="'+memberIndex+'" data-slot="'+index+'">'+(occupied?'Изменить предмет':'Назначить предмет')+'</button>':'')+'</div></details>';
 }
 function render(d,memberIndex,master){
  var gear=Array.isArray(d.gear)?d.gear:[],count=gear.slice(0,8).filter(function(g){return g&&String(g.name||'').trim()}).length;
  return '<div class="ds-gear eq-board"><div class="eq-layout"><div class="eq-side eq-left">'+slot(gear,0,memberIndex,master)+slot(gear,2,memberIndex,master)+'</div><div class="eq-figure"><span class="eq-eyebrow">Личное снаряжение</span>'+figure()+'<span class="eq-count"><b>'+count+'</b> / 8 слотов занято</span></div><div class="eq-side eq-right">'+slot(gear,1,memberIndex,master)+slot(gear,3,memberIndex,master)+'</div></div><div class="eq-quick-heading"><span>Предметы быстрого доступа</span><span>4 слота</span></div><div class="eq-quick">'+[4,5,6,7].map(function(k){return slot(gear,k,memberIndex,master)}).join('')+'</div></div>';
 }
 function portrait(m,size){
  var d=m.dossier||{},ref=d.portrait,id=ref&&ref.id;
  var initials=String(m.n||'').trim().split(/\s+/).slice(0,2).map(function(n){return n[0]||''}).join('')||'—';
  var position=['top','center','bottom'].includes(d.portraitPosition)?d.portraitPosition:'top';
  return '<span class="character-portrait '+(size==='large'?'is-large':'')+'" data-position="'+position+'"><span class="character-portrait-placeholder" aria-hidden="true"><svg viewBox="0 0 64 80" fill="none"><path d="M18 23a14 14 0 1 0 28 0 14 14 0 0 0-28 0Zm-8 48V60c0-12 10-18 22-18s22 6 22 18v11" stroke="currentColor" stroke-width="1.5"/></svg><b>'+esc(initials)+'</b></span>'+(id&&/^portrait_[a-zA-Z0-9]{10,40}$/.test(id)?'<img data-character-portrait="'+esc(id)+'" alt="Портрет: '+esc(m.n)+'" decoding="async" loading="lazy">':'')+'</span>';
 }
 var cache=new Map(),account=null;
 function hydrate(){
  document.querySelectorAll('img[data-character-portrait]').forEach(function(img){
   if(img.dataset.loading||img.getAttribute('src')||!window.LLAuth||!window.LLAuth.readCharacterPortrait)return;
   var id=img.dataset.characterPortrait,uid=LLAuthState.user&&LLAuthState.user.uid||'',key=uid+':'+id;img.dataset.loading='true';
   if(!cache.has(key))cache.set(key,window.LLAuth.readCharacterPortrait(id).then(function(blob){return URL.createObjectURL(blob)}));
   cache.get(key).then(function(url){
    if(!img.isConnected||uid!==(LLAuthState.user&&LLAuthState.user.uid||''))return;
    img.onload=function(){img.classList.add('is-ready')};img.onerror=function(){img.classList.remove('is-ready');img.title='Не удалось открыть портрет'};img.src=url;
   }).catch(function(){cache.delete(key);img.dataset.loading='error';img.title='Портрет временно недоступен'});
  });
 }
 new MutationObserver(hydrate).observe(document.body,{childList:true,subtree:true});
 window.addEventListener('ll:auth-state',function(){
  var uid=LLAuthState.user&&LLAuthState.user.uid||'';
  if(uid!==account){cache.forEach(function(p){p.then(function(url){URL.revokeObjectURL(url)}).catch(function(){})});cache.clear();account=uid;document.querySelectorAll('img[data-character-portrait]').forEach(function(img){img.removeAttribute('src');img.removeAttribute('data-loading');img.classList.remove('is-ready')});}
  hydrate();
 });
 async function preparePortrait(file){
  if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('Выберите фотографию JPG, PNG или WebP.');
  if(!file.size||file.size>20*1024*1024)throw Error('Выберите изображение размером до 20 МБ.');
  var url=URL.createObjectURL(file),image=new Image();
  try{
   await new Promise(function(resolve,reject){image.onload=resolve;image.onerror=function(){reject(Error('Не удалось открыть изображение. Попробуйте JPG или PNG.'))};image.src=url});
   var ratio=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
   canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
   var blob,quality=.86;
   do{blob=await new Promise(function(resolve){canvas.toBlob(resolve,'image/webp',quality)});quality-=.12}while(blob&&blob.size>120000&&quality>=.3);
   if(!blob||blob.size>120000)throw Error('Не удалось подготовить портрет. Попробуйте другое изображение.');
   return blob;
  }finally{URL.revokeObjectURL(url)}
 }
 window.LLCharacterEquipment={render:render,portrait:portrait,preparePortrait:preparePortrait,hydrate:hydrate};
}());
