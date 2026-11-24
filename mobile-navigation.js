/* Keep the same permission-controlled links and actions on mobile and desktop. */
(function(){
 'use strict';
 var nav=document.getElementById('nav'),header=document.querySelector('body>header'),main=document.querySelector('main');
 if(!nav||!header||!main)return;
 var home=document.createComment('Primary navigation'),media=matchMedia('(max-width:700px)');
 nav.before(home);
 var toggle=document.createElement('button');
 toggle.id='mobile-menu-toggle';toggle.type='button';toggle.setAttribute('aria-label','Открыть меню разделов');toggle.setAttribute('aria-controls','mobile-navigation');toggle.setAttribute('aria-expanded','false');
 toggle.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
 header.prepend(toggle);
 var dialog=document.createElement('dialog');
 dialog.id='mobile-navigation';dialog.setAttribute('aria-labelledby','mobile-navigation-title');
 dialog.innerHTML='<div class="mobile-menu-heading"><div><small>Divide et Impera I Последний рассвет</small><h2 id="mobile-navigation-title">Разделы</h2></div><button type="button" aria-label="Закрыть меню">×</button></div>';
 document.body.append(dialog);
 var context=document.createElement('div');context.id='mobile-context';context.setAttribute('aria-label','Подразделы');context.hidden=true;header.after(context);
 function close(){if(dialog.open)dialog.close();toggle.setAttribute('aria-expanded','false');}
 toggle.onclick=function(){dialog.showModal();toggle.setAttribute('aria-expanded','true');var active=nav.querySelector('a.on');if(active)active.focus();};
 dialog.querySelector('button').onclick=close;
 dialog.addEventListener('close',function(){toggle.setAttribute('aria-expanded','false');});
 dialog.addEventListener('click',function(e){if(e.target===dialog){var r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
 nav.addEventListener('click',function(e){if(e.target.closest('a'))close();});
 window.addEventListener('hashchange',close);
 function sync(){
  if(!media.matches){
   close();if(nav.parentNode!==home.parentNode)home.after(nav);
   document.querySelectorAll('.mobile-tabs-source').forEach(function(t){t.classList.remove('mobile-tabs-source');});
   context.hidden=true;context.replaceChildren();return;
  }
  if(nav.parentNode!==dialog)dialog.append(nav);
  var view=main.querySelector('.view.on'),tabs=view&&view.querySelector('.tabs'),fragment=document.createDocumentFragment();
  if(tabs){
   if(!tabs.classList.contains('mobile-tabs-source'))tabs.classList.add('mobile-tabs-source');
   Array.from(tabs.children).forEach(function(original){
    if(original.tagName!=='BUTTON')return;
    var button=original.cloneNode(true);button.removeAttribute('id');button.type='button';
    button.setAttribute('aria-pressed',String(original.classList.contains('on')));
    button.onclick=function(){original.click();};fragment.append(button);
   });
  }else if(view&&['v-map','v-editor','v-marker-studio'].includes(view.id)){
   ['#map','#editor','#marker-studio'].forEach(function(hash){
    var original=nav.querySelector('a[href="'+hash+'"]');if(!original||original.style.display==='none')return;
    var link=original.cloneNode(true);link.removeAttribute('id');link.removeAttribute('style');if(link.classList.contains('on'))link.setAttribute('aria-current','page');fragment.append(link);
   });
   if(fragment.childNodes.length<2)fragment.replaceChildren();
  }
  context.replaceChildren(fragment);context.hidden=!context.children.length;
  var active=nav.querySelector('a.on');nav.querySelectorAll('a').forEach(function(a){if(a===active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if(active)toggle.setAttribute('aria-label','Открыть меню разделов. Сейчас: '+active.textContent.trim());
  document.body.style.setProperty('--mobile-nav-height',(header.offsetHeight+(context.hidden?0:context.offsetHeight))+'px');
  if(context.querySelector('.on'))context.querySelector('.on').scrollIntoView({block:'nearest',inline:'nearest'});
 }
 var frame=0;function schedule(){if(!frame)frame=requestAnimationFrame(function(){frame=0;sync();});}
 new MutationObserver(schedule).observe(main,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
 new MutationObserver(schedule).observe(nav,{subtree:true,attributes:true,attributeFilter:['style','class']});
 media.addEventListener('change',schedule);window.addEventListener('resize',schedule);sync();
}());
