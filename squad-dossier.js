(function(){
 'use strict';
 var TABS=['Приказы','Обзор','Персонал','Склад','Задачи','Транспорт','Хроника','Развитие'];
 var LEGACY=['Поселения','Экономика','Торговля','Дипломатия','Власть','Военное дело','Модификаторы'];
 var BASE=rState,memberIndex=null,taskFilter='all',eventFilter='all',selected=null,editor=null;
 var METRICS=[['cohesion','Сплочённость','Доверие и взаимовыручка'],['discipline','Дисциплина','Исполнение приказов'],['fatigue','Усталость','Накопленное утомление',true],['readiness','Боеготовность','Готовность к опасным ситуациям'],['visibility','Заметность','Риск привлечь внимание',true],['living','Условия проживания','Комфорт и безопасность лагеря']];
 var PHYSICAL=[['health','Здоровье'],['fatigue','Усталость',true],['hunger','Голод',true],['thirst','Жажда',true],['stress','Стресс',true]];
 var SKILLS=[['medicine','Медицина'],['shooting','Стрельба'],['survival','Выживание'],['engineering','Инженерия'],['mechanics','Механика'],['social','Общение']];
 var GEAR=['Основное оружие','Одежда','Защита','Рюкзак','Предмет 1','Предмет 2','Предмет 3','Предмет 4'];
 var STOCK=[['food','Продовольствие','порций'],['water','Вода','ед.'],['mats','Стройматериалы','ед.'],['meds','Медикаменты','комплектов'],['ammo','Боеприпасы','ед.'],['fuel','Топливо','л'],['equipment','Снаряжение','ед.']];
 var TYPES={project:'Проект отряда',personal:'Личный квест',story:'Сюжет отряда'},STATUS={active:'Выполняется',done:'Завершено',paused:'Приостановлено',failed:'Не выполнено'},STEPS={done:'Завершено',active:'Выполняется',next:'Впереди',hidden:'Скрытый этап'},CATEGORIES={personal:'Персональное',squad:'Отряд',story:'Сюжетное'};
 function e(v){return esc(v==null?'':String(v))}
 function clone(v){return JSON.parse(JSON.stringify(v))}
 function arr(v){return Array.isArray(v)?v:[]}
 function num(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null}
 function value(v){return num(v)===null?'—':String(num(v))}
 function get(o,k){return k.split('.').reduce(function(v,p){return v==null?undefined:v[p]},o)}
 function set(o,k,v){var keys=k.split('.'),last=keys.pop();keys.forEach(function(p){if(!o[p]||typeof o[p]!=='object')o[p]={};o=o[p]});o[last]=v}
 function data(s){return s.dossier&&typeof s.dossier==='object'?s.dossier:{}}
 function roster(s){var members=arr(s.mem).filter(function(m){return m&&typeof m==='object'});if(members.length||data(s).rosterManaged)return members;var a=LLAuthState.application;return isActivePlayer()&&a&&a.status==='approved'?arr(a.members):[]}
 function squad(){if(!isMaster())return me();var s=D.squads.find(function(q){return String(q.id)===String(selected==null?D.me:selected)});return s||D.squads.find(ok)}
 function button(label,action,index,primary){return '<button type="button" '+(primary?'class="pr" ':'')+'data-ds="'+action+'"'+(index!=null?' data-index="'+index+'"':'')+'>'+e(label)+'</button>'}
 function empty(text){return '<div class="ds-empty">'+e(text)+'</div>'}
 function meter(label,v,desc,inverse,tone){
  var n=num(v),p=n===null?0:Math.max(0,Math.min(100,n)),color=tone||(n===null?'':inverse?(p>=70?'bad':'risk'):(p<30?'bad':p<60?'risk':'good'));
  return '<div class="ds-meter '+color+'"><div class="ds-meter-head"><span>'+e(label)+'</span><strong>'+value(v)+'<small>/100</small></strong></div><div class="ds-track"'+(n!==null?' role="progressbar" aria-label="'+e(label)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+p+'"':' aria-label="'+e(label)+': не задано"')+'><i style="width:'+p+'%"></i></div>'+(desc?'<small class="ds-meter-desc">'+e(desc)+'</small>':'')+'</div>';
 }
 function tabs(active){return '<div class="tabs">'+TABS.map(function(t){return '<button data-s="'+t+'" class="'+(t===active?'on':'')+'">'+t+'</button>'}).join('')+'</div>'}
 function hero(s){
  var d=data(s),members=roster(s),count=members.length||(d.rosterManaged?0:num(s.r&&s.r.f)),cap=num(d.capacity),turn=GAME_CLOCK?GAME_CLOCK.turn:D.turn;
  return '<div class="ds-hero"><div class="ds-heading"><div><div class="eb">Досье отряда · Divide et Impera I Последний рассвет</div><h1>'+e(s.n)+'</h1><div class="ds-caption">Ход '+e(turn)+(d.location?' · '+e(d.location):'')+(s.l?'<br>Глава · '+e(s.l):'')+'</div></div><span class="ds-badge '+(s.set?'good':'')+'">'+e(d.status||(s.set?'Лагерь активен':'Отряд в пути'))+'</span></div><div class="ds-tiles"><div class="ds-tile"><strong>'+value(count)+(cap!==null?'/'+cap:'')+'</strong><span>Участники</span></div><div class="ds-tile"><strong>'+value(s.mor)+'</strong><span>Мораль</span></div><div class="ds-tile"><strong>'+value(d.cohesion)+'</strong><span>Сплочённость</span></div></div>'+(isMaster()?'<div class="ds-actions ds-squad-actions"><select data-ds-select aria-label="Выбрать отряд">'+D.squads.filter(ok).map(function(q){return '<option value="'+e(q.id)+'" '+(String(q.id)===String(s.id)?'selected':'')+'>'+e(q.n)+'</option>'}).join('')+'</select>'+button('Показатели отряда','edit-overview')+'<button type="button" data-squad-settings="edit">Настройки отряда</button><button type="button" class="pr" data-squad-settings="create">Создать отряд</button></div>':'')+'</div>';
 }
 function title(text,action,label){return '<div class="ds-titlebar"><h2>'+e(text)+'</h2>'+(isMaster()&&action?button(label||'Добавить',action):'')+'</div>'}
 function overview(s){var d=data(s);return '<div class="ds-layout"><section class="ds-box">'+title('Состояние отряда')+meter('Мораль',s.mor,'Общее эмоциональное состояние')+METRICS.slice(0,3).map(function(m){return meter(m[1],d[m[0]],m[2],m[3])}).join('')+'</section><section class="ds-box">'+title('Готовность и лагерь')+METRICS.slice(3).map(function(m){return meter(m[1],d[m[0]],m[2],m[3])}).join('')+'<div class="ds-note">Показатели обновляет мастер по результатам действий и вердиктов. Незаполненные значения отмечены прочерком.</div></section></div>'}

 function personIdentity(m,i){
  var hasPortrait=!!(m.dossier&&m.dossier.portrait);
  return '<section class="ds-box" style="margin-bottom:16px"><div class="ds-heading ds-person-heading"><div class="ds-person-identity">'+LLCharacterEquipment.portrait(m,'large')+'<div><h2>'+e(m.n)+'</h2><div class="ds-caption">'+e([m.spec,m.age?'Возраст: '+m.age:'',m.sex].filter(Boolean).join(' · '))+'</div></div></div><div class="ds-person-header-actions"><span class="ds-badge">'+(i===0?'Глава отряда':'Участник')+'</span>'+(isMaster()?button(hasPortrait?'Изменить портрет':'Добавить портрет','edit-portrait',i):'')+'</div></div></section>';
 }
 function personnel(s){
  var list=roster(s);
  if(memberIndex!==null&&list[memberIndex])return person(s,list[memberIndex],memberIndex);
  memberIndex=null;
  return '<section class="ds-box">'+title('Личный состав','add-member','Добавить участника')+'<p class="ds-caption">Выберите участника, чтобы открыть состояние, навыки и снаряжение.</p>'+(list.length?'<div class="ds-card-list">'+list.map(function(m,i){var d=m.dossier||{};return '<button class="ds-person" data-ds="person" data-index="'+i+'"><span class="ds-person-main">'+LLCharacterEquipment.portrait(m)+'<span><b>'+e(m.n||'Без имени')+(i===0?' · глава':'')+'</b><span class="ds-caption">'+e([m.spec,d.mood].filter(Boolean).join(' · '))+'</span><small>Здоровье '+value(d.health)+' · Усталость '+value(d.fatigue)+'</small></span></span></button>'}).join('')+'</div>':empty('Состав ещё не заполнен. Мастер может добавить участников отряда.'))+'</section>';
 }
 function person(s,m,i){
  var d=m.dossier||{},skills=d.skills||{};
  return '<div class="ds-actions" style="margin:0 0 16px">'+button('Назад к составу','people')+(isMaster()?button('Редактировать участника','edit-member',i)+button('Удалить из состава','remove-member',i):'')+'</div>'+personIdentity(m,i)+'<div class="ds-layout"><section class="ds-box"><h2>Физическое состояние</h2>'+PHYSICAL.map(function(a){return meter(a[1],d[a[0]],'',a[2])}).join('')+'</section><section class="ds-box"><h2>Психологическое состояние</h2><div class="ds-caption">Настроение</div><p>'+e(d.mood||'Не указано')+'</p>'+meter('Уверенность',d.confidence)+ '<h3>Характер и черты</h3><div class="ds-detail-text">'+e(d.traits||'Пока не описаны')+'</div><h3>Предыстория</h3><div class="ds-detail-text">'+e(m.bio||'Пока не описана')+'</div></section><section class="ds-box"><h2>Навыки</h2>'+SKILLS.map(function(a){return meter(a[1],skills[a[0]],'',false,'skill')}).join('')+'</section><section class="ds-box"><h2>Отношения</h2>'+(arr(d.relations).length?arr(d.relations).map(function(r){return meter(r.name,r.value,r.type,false,'skill')}).join(''):empty('Отношения пока не описаны.'))+'<h3>Личная сюжетная линия</h3><div class="ds-detail-text">'+e(d.story||'Личная история ещё не задана.')+'</div></section><section class="ds-box ds-full"><h2>Экипировка · 8 слотов</h2>'+LLCharacterEquipment.render(d,i,isMaster())+(m.inv?'<h3>Личный инвентарь</h3><div class="ds-detail-text">'+e(m.inv)+'</div>':'')+'</section></div>';
 }
 function stock(s){var d=data(s),r=s.r||{},extra=d.stock||{};return '<section class="ds-box">'+title('Общие запасы','edit-stock','Изменить запасы')+'<div class="ds-stock">'+STOCK.map(function(a){return '<article><b>'+a[1]+'</b><strong>'+value(a[0]==='fuel'||a[0]==='equipment'?extra[a[0]]:r[a[0]])+'</strong><span class="ds-caption">'+a[2]+'</span></article>'}).join('')+'</div><div class="ds-note">Продовольствие и вода учитываются за ход. Топливо хранится на общем складе, техническое состояние — в карточке транспорта. Запасы обновляет мастер.</div></section>'}
 function filters(kind,current,options){return '<div class="ds-filters">'+Object.keys(options).map(function(k){return '<button data-ds="'+kind+'" data-filter="'+k+'" class="'+(current===k?'on':'')+'">'+e(options[k])+'</button>'}).join('')+'</div>'}
 function tasks(s){
  var all=arr(data(s).tasks),list=all.map(function(t,i){return{t:t,i:i}}).filter(function(o){return taskFilter==='all'||o.t.type===taskFilter});
  return '<section class="ds-box">'+title('Задачи и сюжетные линии','add-task','Добавить задачу')+filters('task-filter',taskFilter,{all:'Все',project:'Проекты',personal:'Личные квесты',story:'Сюжет отряда'})+'<div class="ds-tiles" style="margin:0 0 20px">'+['project','personal','story'].map(function(k){return '<div class="ds-tile"><strong>'+all.filter(function(t){return t.type===k}).length+'</strong><span>'+TYPES[k]+'</span></div>'}).join('')+'</div>'+(list.length?list.map(function(o){var t=o.t;return '<article class="ds-box" style="margin-bottom:12px"><div class="ds-heading"><span class="ds-badge">'+e(TYPES[t.type]||TYPES.project)+'</span><span class="ds-badge '+(t.status==='done'?'good':'')+'">'+e(STATUS[t.status]||STATUS.active)+'</span></div><h3>'+e(t.title)+'</h3><div class="ds-caption">'+e(t.assignees||'Весь отряд')+'</div><p>'+e(t.description)+'</p>'+meter('Уровень выполнения',t.progress,'',false,t.type==='personal'?'skill':'good')+'<details style="margin-top:15px"><summary>Этапы и подробности</summary><h3>Этапы задачи</h3>'+(arr(t.steps).map(function(st){return '<div class="ds-step"><span class="ds-step-mark" aria-hidden="true">'+(st.status==='done'?'✓':'·')+'</span><span>'+e(st.title)+' <span class="ds-caption">— '+e(STEPS[st.status]||STEPS.next)+'</span></span></div>'}).join('')||'<p>Этапы ещё не заданы.</p>')+'<h3>Условия и расходы</h3><div class="ds-detail-text">'+e(t.costs||'Не указаны')+'</div><h3>Возможный результат</h3><div class="ds-detail-text">'+e(t.result||'Не указан')+'</div></details>'+(isMaster()?'<div class="ds-actions">'+button('Редактировать','edit-task',o.i)+button('Удалить','remove-task',o.i)+'</div>':'')+'</article>'}).join(''):empty('Задач в этой категории пока нет.'))+'</section>';
 }
 function vehicles(s){
  var list=arr(data(s).vehicles),fuel=(data(s).stock||{}).fuel;
  return '<section class="ds-box">'+title('Транспорт отряда','add-vehicle','Добавить транспорт')+(list.length?list.map(function(v,i){return '<details><summary><b>'+e(v.name)+'</b><br><span class="ds-caption">'+e(v.availability||'Доступность не указана')+'</span></summary><p>'+e(v.description)+'</p>'+meter('Техническое состояние',v.condition)+'<dl class="ds-keyvals"><dt>Топливо на складе</dt><dd>'+value(fuel)+' л</dd><dt>Грузоподъёмность</dt><dd>'+e(v.capacity||'Не указана')+'</dd><dt>Водитель</dt><dd>'+e(v.driver||'Не назначен')+'</dd><dt>Примечания</dt><dd>'+e(v.notes||'—')+'</dd></dl>'+(isMaster()?'<div class="ds-actions">'+button('Редактировать','edit-vehicle',i)+button('Удалить','remove-vehicle',i)+'</div>':'')+'</details>'}).join(''):empty('Транспорт пока не добавлен.'))+'</section>';
 }
 function chronicle(s){var list=arr(data(s).events).map(function(t,i){return{t:t,i:i}}).sort(function(a,b){return Number(b.t.turn||0)-Number(a.t.turn||0)||b.i-a.i}).filter(function(o){return eventFilter==='all'||o.t.category===eventFilter});return '<section class="ds-box">'+title('Хроника отряда','add-event','Добавить событие')+filters('event-filter',eventFilter,{all:'Все события',personal:'Персональные',squad:'Отряд',story:'Сюжетные'})+(list.length?list.map(function(o){var t=o.t;return '<details><summary><span class="ds-caption">Ход '+e(t.turn||'—')+(t.time?' · '+e(t.time):'')+' · '+e(CATEGORIES[t.category]||CATEGORIES.squad)+'</span><br><b>'+e(t.title)+'</b></summary><div class="ds-detail-text">'+e(t.text||'Подробности не добавлены.')+'</div>'+(isMaster()?'<div class="ds-actions">'+button('Редактировать','edit-event',o.i)+button('Удалить','remove-event',o.i)+'</div>':'')+'</details>'}).join(''):empty('Событий в этой категории пока нет.'))+(arr(D.log).length?'<details style="margin-top:22px"><summary>Прежний журнал проекта</summary><div class="ds-detail-text">'+arr(D.log).map(e).join('<br>')+'</div></details>':'')+'</section>'}
 function render(){
  var s=squad();if(isMaster()&&!s){document.getElementById('state').innerHTML='<div class="ds"><section class="ds-box"><h1>Отряды</h1><p>Создайте первый отряд, затем добавьте участников и заполните его показатели.</p><button type="button" class="pr" data-squad-settings="create">Создать отряд</button></section></div>';return}if((!isActivePlayer()&&!isMaster())||!ok(s)){document.getElementById('state').classList.remove('ds');BASE();return}
   if(isMaster())D.me=s.id;
  if(sub!=='Приказы'&&window.LLSquadOrders)window.LLSquadOrders.refresh();
  if(sub==='Бойцы')sub='Персонал';if(sub==='Журнал')sub='Хроника';
  var legacy=LEGACY.indexOf(sub)>=0,active=legacy?'Развитие':sub;
  if(sub==='Развитие'){sub='Поселения';legacy=true;active='Развитие'}
  var developed=legacy&&window.LLDevelopment?LLDevelopment.render(s,sub):null;
  if(developed!==null&&developed!==false){document.getElementById('state').classList.remove('ds');document.getElementById('state').innerHTML='<div class="ds">'+hero(s)+tabs(active)+'<div class="ds-filters">'+LEGACY.map(function(t){return '<button data-s="'+t+'" class="'+(sub===t?'on':'')+'">'+t+'</button>'}).join('')+'</div>'+developed+'</div>';return}
  if(sub==='Приказы'||legacy){
   BASE();var box=document.getElementById('state'),old=box.querySelector('.tabs');if(!old)return;
   if(legacy){old.outerHTML=tabs(active)+'<div class="ds-filters">'+LEGACY.map(function(t){return '<button data-s="'+t+'" class="'+(sub===t?'on':'')+'">'+t+'</button>'}).join('')+'</div>';}else old.outerHTML=tabs(active);
   var heading=box.querySelector('h1'),eyebrow=box.querySelector('.eb');if(heading)heading.remove();if(eyebrow)eyebrow.remove();
   box.insertAdjacentHTML('afterbegin',hero(s));box.classList.add('ds');return;
  }
  document.getElementById('state').classList.remove('ds');
  var view=sub==='Персонал'?personnel(s):sub==='Склад'?stock(s):sub==='Задачи'?tasks(s):sub==='Транспорт'?vehicles(s):sub==='Хроника'?chronicle(s):overview(s);
  document.getElementById('state').innerHTML='<div class="ds">'+hero(s)+tabs(active)+view+'</div>';
 }
 rState=render;
 var dialog=document.createElement('dialog');dialog.className='ds-dialog';dialog.setAttribute('aria-labelledby','ds-edit-title');document.body.append(dialog);
 function field(label,path,type,options,required,min,max){
  var v=get(editor.entity,path),control;
  if(type==='select')control='<select name="'+path+'">'+Object.keys(options).map(function(k){return '<option value="'+e(k)+'" '+(String(v)===k?'selected':'')+'>'+e(options[k])+'</option>'}).join('')+'</select>';
  else if(type==='textarea')control='<textarea name="'+path+'" maxlength="5000">'+e(v)+'</textarea>';
  else control='<input name="'+path+'" type="'+(type||'text')+'" value="'+e(v)+'" '+(type==='number'?'min="'+(min==null?0:min)+'" max="'+(max==null?100:max)+'" step="1"':'maxlength="200"')+(required?' required':'')+'>';
  return '<label class="ds-field '+(type==='textarea'?'wide':'')+'">'+e(label)+control+'</label>';
 }
 function numberFields(def,prefix){return def.map(function(a){return field(a[1],prefix+a[0],'number')}).join('')}
 function row(kind,v){
  v=v||{};if(kind==='step'&&!v.status)v.status='next';return '<div class="ds-edit-row" data-ds-row="'+kind+'">'+(kind==='step'?'<label class="ds-field">Этап<input data-key="title" value="'+e(v.title)+'" maxlength="300" required></label><label class="ds-field">Состояние<select data-key="status">'+Object.keys(STEPS).map(function(k){return '<option value="'+k+'" '+(v.status===k?'selected':'')+'>'+STEPS[k]+'</option>'}).join('')+'</select></label>':'<label class="ds-field">Участник<input data-key="name" value="'+e(v.name)+'" maxlength="100" required></label><div>'+ '<label class="ds-field">Отношение<input data-key="type" value="'+e(v.type)+'" maxlength="100"></label><label class="ds-field">Уровень / 100<input data-key="value" type="number" min="0" max="100" value="'+e(v.value)+'"></label></div>')+'<button type="button" data-ds-row-remove>Убрать</button></div>';
 }
 function extras(kind,values){return '<section class="ds-edit-section"><h3>'+(kind==='step'?'Этапы задачи':'Отношения')+'</h3><div data-ds-rows="'+kind+'">'+arr(values).map(function(v){return row(kind,v)}).join('')+'</div><button type="button" data-ds-row-add="'+kind+'">Добавить '+(kind==='step'?'этап':'отношение')+'</button></section>'}

 function portraitControls(entity){
  var position=(entity.dossier||{}).portraitPosition||'top';
  return '<section class="ds-portrait-editor"><div data-portrait-preview>'+LLCharacterEquipment.portrait(entity,'large')+'</div><div class="ds-portrait-controls"><h3>Портрет персонажа</h3><p>Фотография из файлов или галереи. JPG, PNG, WebP · до 20 МБ.</p><input type="file" accept="image/jpeg,image/png,image/webp" data-portrait-file hidden><div class="ds-actions"><button type="button" data-portrait-choose>Выбрать фото</button><button type="button" data-portrait-remove>Убрать портрет</button></div><label class="ds-field" style="margin-top:12px">Положение в рамке<select name="dossier.portraitPosition" data-portrait-position>'+[['top','Выше'],['center','По центру'],['bottom','Ниже']].map(function(o){return '<option value="'+o[0]+'" '+(o[0]===position?'selected':'')+'>'+o[1]+'</option>'}).join('')+'</select></label><span class="ds-portrait-message" role="status" data-portrait-message>Портрет изменится после сохранения карточки.</span></div></section>';
 }
 function releasePortraitPreview(){if(editor&&editor.portraitPreview){URL.revokeObjectURL(editor.portraitPreview);editor.portraitPreview=null}}
 function updatePortraitPreview(){
  var preview=dialog.querySelector('[data-portrait-preview]');if(!preview||!editor)return;
  if(editor.portraitPreview)preview.innerHTML='<span class="character-portrait is-large"><img class="is-ready" alt="Новый портрет" src="'+e(editor.portraitPreview)+'"></span>';
  else preview.innerHTML=LLCharacterEquipment.portrait(editor.entity,'large');
  var position=dialog.querySelector('[data-portrait-position]');if(position)preview.querySelector('.character-portrait').dataset.position=position.value;
 }
 function openEdit(kind,index){
  if(!isMaster())return;releasePortraitPreview();var s=squad(),d=data(s),listKey={member:'mem',task:'tasks',vehicle:'vehicles',event:'events'}[kind],list=kind==='member'?roster(s):arr(d[listKey]);
  var entity=kind==='overview'||kind==='stock'?clone(s):clone(list[index]||{});
  editor={kind:kind,index:index,squadId:s.id,source:clone(s),entity:entity,listKey:listKey,portraitBlob:null,portraitPreview:null,portraitBusy:false,oldPortraitId:get(entity,"dossier.portrait.id")||null};
  var content='',name={overview:'Показатели отряда',stock:'Общие запасы',member:'Участник отряда',task:'Задача',vehicle:'Транспорт',event:'Событие хроники'}[kind];
  if(kind==='overview'){
   content=field('Статус лагеря / отряда','dossier.status')+field('Местоположение','dossier.location')+field('Вместимость отряда','dossier.capacity','number',null,false,0,1000)+field('Мораль','mor','number',null,true)+numberFields(METRICS,'dossier.');
  }else if(kind==='stock'){content=STOCK.map(function(a){return field(a[1]+' · '+a[2],a[0]==='fuel'||a[0]==='equipment'?'dossier.stock.'+a[0]:'r.'+a[0],'number',null,a[0]!=='fuel'&&a[0]!=='equipment',0,100000000)}).join('');}
  else if(kind==='member'){
   content=field('Имя и фамилия','n','text',null,true)+field('Специальность','spec')+field('Возраст','age','number',null,false,0,150)+field('Пол','sex')+numberFields(PHYSICAL,'dossier.')+field('Настроение','dossier.mood')+field('Уверенность','dossier.confidence','number')+SKILLS.map(function(a){return field(a[1],'dossier.skills.'+a[0],'number')}).join('')+field('Характер и черты','dossier.traits','textarea')+field('Предыстория','bio','textarea')+field('Личный инвентарь (прежняя запись)','inv','textarea')+field('Личная сюжетная линия','dossier.story','textarea');
  }else if(kind==='task'){
   if(!entity.type)entity.type='project';if(!entity.status)entity.status='active';
   content=field('Название','title','text',null,true)+field('Тип','type','select',TYPES)+field('Состояние','status','select',STATUS)+field('Выполнение, %','progress','number')+field('Участники / ответственные','assignees')+field('Описание','description','textarea')+field('Условия и расходы','costs','textarea')+field('Возможный результат','result','textarea');
  }else if(kind==='vehicle')content=field('Название','name','text',null,true)+field('Доступность','availability')+field('Техническое состояние','condition','number')+field('Грузоподъёмность','capacity')+field('Водитель','driver')+field('Описание','description','textarea')+field('Примечания','notes','textarea');
  else{if(!entity.category)entity.category='squad';if(!entity.turn)entity.turn=GAME_CLOCK?GAME_CLOCK.turn:D.turn;content=field('Заголовок','title','text',null,true)+field('Категория','category','select',CATEGORIES)+field('Ход','turn','number',null,true,1,1000000)+field('Время / часть суток','time')+field('Подробности','text','textarea');}
  var extra='';
  if(kind==='task')extra=extras('step',entity.steps);
  if(kind==='member'){
   extra='<section class="ds-edit-section"><h3>Экипировка · 8 слотов</h3><div class="ds-form-grid">'+GEAR.map(function(label,k){return field((k+1)+'. '+label,'dossier.gear.'+k+'.name')+field('Описание предмета','dossier.gear.'+k+'.description','textarea')}).join('')+'</div></section>'+extras('relation',(entity.dossier||{}).relations);
  }
  dialog.innerHTML='<form><div class="ds-dialog-head"><h2 id="ds-edit-title">'+name+'</h2><button type="button" data-ds-cancel aria-label="Закрыть">×</button></div><div class="ds-dialog-body"><div class="ds-caption" style="margin-bottom:16px">Изменения станут видны игроку после сохранения. Пустой показатель означает «не задано».</div>'+(kind==='member'?portraitControls(entity):'')+'<div class="ds-form-grid">'+content+'</div>'+extra+'</div><div class="ds-dialog-foot"><span class="ds-form-error" role="status"></span><button type="button" data-ds-cancel>Отмена</button><button class="pr" type="submit">Сохранить</button></div></form>';
  dialog.showModal();
 }
 function collect(){
  var entity=clone(editor.entity);
  dialog.querySelectorAll('[name]').forEach(function(el){set(entity,el.name,el.type==='number'?(el.value===''?null:Number(el.value)):el.value.trim())});
  if(editor.kind==='member'){
   var gear=[];for(var i=0;i<8;i++)gear.push(get(entity,'dossier.gear.'+i)||{name:'',description:''});entity.dossier.gear=gear;
   entity.dossier.relations=collectRows('relation');
  }
  if(editor.kind==='task')entity.steps=collectRows('step');
  return entity;
 }
 function collectRows(kind){return Array.from(dialog.querySelectorAll('[data-ds-row="'+kind+'"]')).map(function(r){var v={};r.querySelectorAll('[data-key]').forEach(function(el){v[el.getAttribute('data-key')]=el.type==='number'?(el.value===''?null:Number(el.value)):el.value.trim()});return v})}
 async function commit(patch,source){
  if(!isMaster())throw Error('Изменять статистику может только мастер.');
  if(!worldSyncReady||!window.LLAuth||!window.LLAuth.updateSquadDossier)throw Error('Общая база ещё подключается. Попробуйте через несколько секунд.');
  if(!worldCloudExists)throw Error('Сначала опубликуйте общую карту в панели мастера.');
  var expected={};Object.keys(patch).forEach(function(k){expected[k]=source[k]===undefined?null:clone(source[k])});
  var result=await window.LLAuth.updateSquadDossier(source.id,patch,expected);
  var idx=D.squads.findIndex(function(q){return String(q.id)===String(source.id)});
  if(idx>=0&&Number(D.squads[idx].statsRevision||0)<=Number(result.statsRevision||0))D.squads[idx]=result;
  save();render();toast('Статистика отряда сохранена для игрока.','ok');
 }
 dialog.addEventListener('click',function(ev){
  var cancel=ev.target.closest('[data-ds-cancel]'),add=ev.target.closest('[data-ds-row-add]'),remove=ev.target.closest('[data-ds-row-remove]');
  if(cancel){dialog.close();return}if(remove){remove.closest('[data-ds-row]').remove();return}
  if(add){var kind=add.getAttribute('data-ds-row-add'),container=dialog.querySelector('[data-ds-rows="'+kind+'"]');if(container.children.length<100)container.insertAdjacentHTML('beforeend',row(kind));}
 });
 dialog.addEventListener('submit',async function(ev){
  ev.preventDefault();if(!isMaster()||!dialog.querySelector('form').reportValidity())return;if(editor.portraitBusy){dialog.querySelector('.ds-form-error').textContent='Дождитесь подготовки фотографии.';return}
  var entity=collect(),source=editor.source,patch={},kind=editor.kind;
  if(kind==='overview'){if(num(get(entity,'dossier.capacity'))!==null&&Number(entity.dossier.capacity)<roster(source).length){dialog.querySelector('.ds-form-error').textContent='Вместимость меньше текущего состава.';return}patch={dossier:entity.dossier,mor:entity.mor};}
  else if(kind==='stock'){patch={r:entity.r,dossier:entity.dossier||{}};}
  else if(kind==='member'){var members=clone(roster(source));if(editor.index==null)members.push(entity);else members[editor.index]=entity;patch={mem:members};}
  else{var dossier=clone(data(source)),items=arr(dossier[editor.listKey]).slice();if(editor.index==null){entity.id=uid();items.push(entity)}else items[editor.index]=entity;dossier[editor.listKey]=items;patch={dossier:dossier};}
  var submit=dialog.querySelector('[type=submit]'),operation=editor,newPortrait=null;submit.disabled=true;dialog.dataset.saving='true';dialog.querySelectorAll('input,textarea,select,button').forEach(function(b){b.disabled=true});
  try{
   if(kind==='member'&&operation.portraitBlob){
    if(!window.LLAuth||!window.LLAuth.uploadCharacterPortrait)throw Error('Сервис портретов ещё загружается.');
    dialog.querySelector('.ds-form-error').textContent='Загружаю портрет…';
    newPortrait=await window.LLAuth.uploadCharacterPortrait(operation.portraitBlob);if(editor!==operation||!dialog.open)throw Error('Сохранение отменено.');entity.dossier.portrait=newPortrait;
   }
   await commit(patch,source);
   if(kind==='member'&&operation.oldPortraitId&&operation.oldPortraitId!==get(entity,'dossier.portrait.id')&&window.LLAuth.deleteCharacterPortrait)window.LLAuth.deleteCharacterPortrait(operation.oldPortraitId).catch(function(){});
   dialog.close();
  }catch(error){
   if(newPortrait&&window.LLAuth.deleteCharacterPortrait)window.LLAuth.deleteCharacterPortrait(newPortrait.id).catch(function(){});
   dialog.querySelector('.ds-form-error').textContent=error.message||'Не удалось сохранить. Попробуйте снова.';
  }finally{submit.disabled=false;dialog.dataset.saving='false';dialog.querySelectorAll('input,textarea,select,button').forEach(function(b){b.disabled=false})}
 });

 dialog.addEventListener('cancel',function(ev){if(dialog.dataset.saving==='true')ev.preventDefault()});
 dialog.addEventListener('close',releasePortraitPreview);
 dialog.addEventListener('click',function(ev){
  if(ev.target.closest('[data-portrait-choose]'))dialog.querySelector('[data-portrait-file]').click();
  if(ev.target.closest('[data-portrait-remove]')){
   editor.portraitRequest=(editor.portraitRequest||0)+1;editor.portraitBusy=false;editor.portraitBlob=null;releasePortraitPreview();set(editor.entity,'dossier.portrait',null);
   dialog.querySelector('[data-portrait-file]').value='';updatePortraitPreview();dialog.querySelector('[data-portrait-message]').textContent='Портрет будет убран после сохранения.';
  }
 });
 dialog.addEventListener('change',async function(ev){
  if(ev.target.matches('[data-portrait-position]')){updatePortraitPreview();return}
  if(!ev.target.matches('[data-portrait-file]')||!ev.target.files[0]||!isMaster())return;
  var session=editor,request=(session.portraitRequest||0)+1;session.portraitRequest=request;session.portraitBusy=true;
  dialog.querySelector('[data-portrait-message]').textContent='Подготавливаю фотографию…';
  try{
   var blob=await LLCharacterEquipment.preparePortrait(ev.target.files[0]);
   if(editor!==session||session.portraitRequest!==request||!dialog.open)return;
   releasePortraitPreview();session.portraitBlob=blob;session.portraitPreview=URL.createObjectURL(blob);updatePortraitPreview();dialog.querySelector('[data-portrait-message]').textContent='Фотография готова. Сохраните карточку.';
  }catch(error){if(editor===session&&session.portraitRequest===request&&dialog.open)dialog.querySelector('[data-portrait-message]').textContent=error.message}
  finally{if(editor===session&&session.portraitRequest===request)session.portraitBusy=false}
 });
 var confirmDialog=document.createElement('dialog');confirmDialog.className='ds-dialog';confirmDialog.setAttribute('aria-label','Удалить запись');document.body.append(confirmDialog);
 function remove(kind,index){
  if(!isMaster())return;var source=clone(squad()),key={member:'mem',task:'tasks',vehicle:'vehicles',event:'events'}[kind],record=(kind==='member'?roster(source):arr(data(source)[key]))[index];if(!record)return;
  confirmDialog.innerHTML='<div class="ds-dialog-body"><h2>Удалить запись?</h2><p class="ds-detail-text">'+e(record.title||record.name)+'</p><p class="ds-caption">Запись исчезнет из статистики отряда.</p><div class="ds-form-error" role="status"></div></div><div class="ds-dialog-foot"><button data-cancel>Отмена</button><button class="pr" data-confirm>Удалить</button></div>';
  confirmDialog.querySelector('[data-cancel]').onclick=function(){confirmDialog.close()};
  confirmDialog.querySelector('[data-confirm]').onclick=async function(){var b=this;b.disabled=true;try{var patch;if(kind==='member'){var members=clone(roster(source));members.splice(index,1);patch={mem:members};memberIndex=null}else{var d=clone(data(source));d[key].splice(index,1);patch={dossier:d}}await commit(patch,source);if(kind==='member'&&record.dossier&&record.dossier.portrait&&window.LLAuth.deleteCharacterPortrait)window.LLAuth.deleteCharacterPortrait(record.dossier.portrait.id).catch(function(){});confirmDialog.close()}catch(er){confirmDialog.querySelector('.ds-form-error').textContent=er.message;b.disabled=false}};
  confirmDialog.showModal();
 }
 document.getElementById('state').addEventListener('change',function(ev){if(ev.target.matches('[data-ds-select]')&&isMaster()){selected=ev.target.value;var s=squad();if(s)D.me=s.id;memberIndex=null;render()}});
 document.getElementById('state').addEventListener('click',function(ev){
  var b=ev.target.closest('[data-ds]');if(!b)return;var action=b.getAttribute('data-ds'),i=b.hasAttribute('data-index')?Number(b.getAttribute('data-index')):null;
  if(action==='edit-gear'||action==='edit-portrait'){
   if(!isMaster())return;openEdit('member',i);
   var target=action==='edit-portrait'?dialog.querySelector('[data-portrait-choose]'):dialog.querySelector('[name="dossier.gear.'+Number(b.getAttribute('data-slot'))+'.name"]');
   if(target)target.focus();return;
  }
  if(action==='person'){memberIndex=i;render();return}
  if(action==='people'){memberIndex=null;render();return}
  if(action==='task-filter'){taskFilter=b.getAttribute('data-filter');render();return}
  if(action==='event-filter'){eventFilter=b.getAttribute('data-filter');render();return}
  if(action.indexOf('remove-')===0){remove(action.slice(7),i);return}
  if(action.indexOf('edit-')===0||action.indexOf('add-')===0)openEdit(action.replace(/^(edit|add)-/,''),i);
 });
 window.addEventListener('ll:auth-state',function(ev){var state=ev.detail||{},role=state.profile&&state.profile.role;if(role!=='master'&&role!=='owner'){if(dialog.open)dialog.close();if(confirmDialog.open)confirmDialog.close()}});
 window.LLSquadDossier={render:render,roster:roster,squad:squad,select:function(id){selected=id;D.me=id;memberIndex=null}};
 if(location.hash==='#state')render();
}());
