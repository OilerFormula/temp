import {normalizeOrder} from './chart-controls.js';

export function setupDashboard({state,chartNames,panelNames={},onSave,onResize}) {
  const stack=document.querySelector('.chart-stack'),panels=new Map(),animations=new Map();
  const dialog=document.getElementById('chart-dialog');
  let expanded=null,placeholder=null,drag=null,scrollFrame=0;
  const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const settings=document.querySelector('.controls'),snapshot=document.querySelector('.snapshot');
  settings.id='settings-card';snapshot.id='snapshot-card';
  stack.prepend(settings);stack.append(snapshot);
  settings.insertAdjacentHTML('afterbegin','<div class="chart-header"><div><h2>설정</h2></div></div>');
  const titles={settings:'설정',...chartNames,...panelNames,snapshot:'수치 표'};
  for(const [id,title] of Object.entries(titles)) {
    const card=document.getElementById(`${id}-card`);if(!card)continue;
    panels.set(id,card);card.dataset.panel=id;card.classList.add('dashboard-card');
    const header=card.querySelector('.chart-header,.snapshot-header');
    const body=document.createElement('div');body.className='card-body';body.id=`panel-${id}-body`;
    for(const child of [...card.childNodes])if(child!==header)body.append(child);
    card.append(body);
    if(id==='snapshot')body.prepend(header.querySelector('#snapshot-growth'));
    const tools=document.createElement('div');tools.className='panel-tools';
    tools.innerHTML=`${id in chartNames||id in panelNames?`<button type="button" class="panel-tool" data-panel-zoom aria-label="${title} 확대보기">확대</button>`:''}<button type="button" class="panel-tool" data-panel-fold aria-controls="${body.id}" aria-label="${title} 접기">접기</button>`;
    header.append(tools);header.classList.add('panel-header');
    if(id!=='settings')header.insertAdjacentHTML('beforebegin',`<button type="button" class="panel-drag-bar drag-handle" aria-label="${title} 박스 이동" title="드래그로 이동 · 방향키로 순서 변경"><span aria-hidden="true"></span></button>`);
    fold(id,state.collapsed.includes(id));
  }
  state.panelOrder=normalizeOrder(state.panelOrder,[...panels.keys()]);
  for(const id of state.panelOrder)stack.append(panels.get(id));
  function persistOrder() {
    state.panelOrder=normalizeOrder([...stack.querySelectorAll(':scope > [data-panel]')].map(el=>el.dataset.panel),[...panels.keys()]);onSave();
  }
  function fold(id,closed) {
    const card=panels.get(id);card.classList.toggle('collapsed',closed);card.querySelector('.card-body').hidden=closed;
    const button=card.querySelector('[data-panel-fold]');button.textContent=closed?'펼치기':'접기';button.setAttribute('aria-expanded',String(!closed));button.setAttribute('aria-label',`${titles[id]} ${closed?'펼치기':'접기'}`);
    state.collapsed=closed?[...new Set([...state.collapsed,id])]:state.collapsed.filter(n=>n!==id);
  }
  function animateLayout(change) {
    const positions=new Map([...stack.children].filter(el=>el.dataset.panel&&el.dataset.panel!=='settings'&&!el.classList.contains('panel-drop-slot')).map(el=>[el,el.getBoundingClientRect().top]));
    for(const animation of animations.values())animation.cancel();animations.clear();
    change();if(reducedMotion())return;
    for(const [card,oldTop] of positions) {
      if(!card.isConnected||card.parentElement!==stack)continue;
      const delta=oldTop-card.getBoundingClientRect().top;if(Math.abs(delta)<1)continue;
      const animation=card.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
      animations.set(card,animation);animation.onfinish=()=>{if(animations.get(card)===animation)animations.delete(card);};
    }
  }
  function restore() {
    if(!expanded)return;
    const card=expanded;placeholder.replaceWith(card);placeholder=null;expanded=null;card.classList.remove('expanded');
    for(const button of card.querySelectorAll('[data-panel-fold],.drag-handle'))button.disabled=false;
    const zoom=card.querySelector('[data-panel-zoom]');zoom.textContent='확대';zoom.setAttribute('aria-label',`${titles[card.dataset.panel]} 확대보기`);
    document.body.classList.remove('dialog-open');persistOrder();onResize(card.dataset.panel);zoom.focus();
  }
  dialog.addEventListener('close',restore);
  document.addEventListener('site-lock',()=>{endDrag(false);if(dialog.open)dialog.close();});
  document.addEventListener('click',event=>{
    const button=event.target.closest('.panel-tool');if(!button)return;
    const card=button.closest('[data-panel]'),id=card?.dataset.panel;if(!id)return;
    if(button.hasAttribute('data-panel-fold')) {fold(id,!card.classList.contains('collapsed'));onSave();onResize(id);}
    else if(button.hasAttribute('data-panel-zoom')) {
      if(expanded){dialog.close();return;}
      if(card.classList.contains('collapsed'))fold(id,false);
      placeholder=document.createElement('div');placeholder.className='panel-placeholder';card.replaceWith(placeholder);
      expanded=card;dialog.append(card);card.classList.add('expanded');
      for(const tool of card.querySelectorAll('[data-panel-fold],.drag-handle'))tool.disabled=true;
      button.textContent='축소';button.setAttribute('aria-label',`${titles[id]} 축소`);
      dialog.setAttribute('aria-label',`${titles[id]} 확대보기`);dialog.showModal();document.body.classList.add('dialog-open');onResize(id);
    }
  });
  function updateDropSlot(clientY) {
    const others=[...stack.children].filter(el=>el!==drag.slot&&el.dataset.panel&&el.dataset.panel!=='settings');
    const stackTop=stack.getBoundingClientRect().top;
    const next=others.find(el=>clientY<stackTop+el.offsetTop+el.offsetHeight/2);
    if((next&&drag.slot.nextElementSibling===next)||(!next&&stack.lastElementChild===drag.slot))return;
    animateLayout(()=>{if(next)stack.insertBefore(drag.slot,next);else stack.append(drag.slot);});
  }
  function autoScroll() {
    if(!drag?.moved||drag.landing)return;
    const edge=64,y=drag.clientY;
    const step=y<edge?-Math.ceil((edge-y)/5):y>window.innerHeight-edge?Math.ceil((y-window.innerHeight+edge)/5):0;
    if(step) {window.scrollBy(0,Math.max(-20,Math.min(20,step)));updateDropSlot(y);}
    scrollFrame=requestAnimationFrame(autoScroll);
  }
  document.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('.drag-handle');if(!handle||handle.disabled||event.button!==0||drag)return;
    event.preventDefault();handle.focus();
    const card=handle.closest('[data-panel]');if(card.dataset.panel==='settings')return;
    drag={card,handle,start:event.clientY,clientY:event.clientY,moved:false,pointerId:event.pointerId};
  });
  window.addEventListener('pointermove',event=>{
    if(!drag||drag.landing||event.pointerId!==drag.pointerId)return;
    drag.clientY=event.clientY;if(Math.abs(event.clientY-drag.start)<6&&!drag.moved)return;
    if(!drag.moved) {
      const rect=drag.card.getBoundingClientRect();drag.offset=drag.start-rect.top;drag.originalStyle=drag.card.getAttribute('style');drag.moved=true;
      const slot=document.createElement('div');slot.className='panel-drop-slot';slot.dataset.panel=drag.card.dataset.panel;slot.style.height=`${rect.height}px`;slot.setAttribute('aria-hidden','true');drag.slot=slot;
      drag.card.replaceWith(slot);document.body.append(drag.card);drag.card.classList.add('panel-floating');
      Object.assign(drag.card.style,{position:'fixed',top:`${rect.top}px`,left:`${rect.left}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:'0',zIndex:'20'});
      drag.handle.setPointerCapture(event.pointerId);document.body.classList.add('is-reordering');scrollFrame=requestAnimationFrame(autoScroll);
    }
    drag.card.style.top=`${event.clientY-drag.offset}px`;updateDropSlot(event.clientY);
  });
  function endDrag(animate=true) {
    if(!drag)return;
    cancelAnimationFrame(scrollFrame);
    if(!drag.moved){drag=null;return;}
    const current=drag;
    if(current.landing) {if(!animate)current.finish();return;}
    current.landing=true;persistOrder();
    try{current.handle.releasePointerCapture(current.pointerId);}catch{}
    const finish=()=>{
      current.animation?.cancel();current.slot.replaceWith(current.card);current.card.classList.remove('panel-floating');
      if(current.originalStyle===null)current.card.removeAttribute('style');else current.card.setAttribute('style',current.originalStyle);
      document.body.classList.remove('is-reordering');drag=null;onResize(current.card.dataset.panel);
    };
    current.finish=finish;
    if(!animate||reducedMotion()){finish();return;}
    const from=current.card.getBoundingClientRect(),to=current.slot.getBoundingClientRect();
    current.animation=current.card.animate([{transform:'translateY(0)'},{transform:`translateY(${to.top-from.top}px)`}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    current.animation.onfinish=finish;
  }
  window.addEventListener('pointerup',()=>endDrag());window.addEventListener('pointercancel',()=>endDrag(false));window.addEventListener('blur',()=>endDrag(false));
  document.addEventListener('keydown',event=>{
    if(!event.target.matches('.drag-handle')||event.target.disabled||!['ArrowUp','ArrowDown'].includes(event.key)||drag)return;
    event.preventDefault();const card=event.target.closest('[data-panel]');
    const neighbor=event.key==='ArrowUp'?card.previousElementSibling:card.nextElementSibling;
    if(!neighbor||neighbor.dataset.panel==='settings')return;
    animateLayout(()=>{if(event.key==='ArrowUp')neighbor.before(card);else neighbor.after(card);});persistOrder();
  });
  return {isExpanded:id=>expanded?.dataset.panel===id};
}
