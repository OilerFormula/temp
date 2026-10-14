import {normalizeOrder} from './chart-controls.js';
export function setupDashboard({state,chartNames,onSave,onResize}) {
  const stack=document.querySelector('.chart-stack');
  const panels=new Map();let expanded=null,placeholder=null;
  const dialog=document.getElementById('chart-dialog');
  const settings=document.querySelector('.controls'),snapshot=document.querySelector('.snapshot');
  settings.id='settings-card';snapshot.id='snapshot-card';
  stack.prepend(settings);stack.append(snapshot);
  settings.insertAdjacentHTML('afterbegin','<div class="chart-header"><div><h2>설정</h2></div></div>');
  const titles={settings:'설정',...chartNames,snapshot:'수치 표'};
  for (const [id,title] of Object.entries(titles)) {
    const card=document.getElementById(`${id}-card`);if(!card)continue;
    panels.set(id,card);card.dataset.panel=id;card.classList.add('dashboard-card');
    const header=card.querySelector('.chart-header,.snapshot-header');
    const body=document.createElement('div');body.className='card-body';body.id=`panel-${id}-body`;
    for(const child of [...card.childNodes])if(child!==header)body.append(child);
    card.append(body);
    if(id==='snapshot')body.prepend(header.querySelector('#snapshot-growth'));
    const tools=document.createElement('div');tools.className='panel-tools';
    tools.innerHTML=`<button type="button" class="drag-handle panel-tool" aria-label="${title} 박스 이동" title="드래그로 이동">⠿</button><button type="button" class="panel-tool" data-panel-up aria-label="${title} 위로 이동" title="위로">↑</button><button type="button" class="panel-tool" data-panel-down aria-label="${title} 아래로 이동" title="아래로">↓</button>${id in chartNames?`<button type="button" class="panel-tool" data-panel-zoom aria-label="${title} 확대보기">확대</button>`:''}<button type="button" class="panel-tool" data-panel-fold aria-controls="${body.id}" aria-label="${title} 접기">접기</button>`;
    header.append(tools);header.classList.add('panel-header');
    fold(id,state.collapsed.includes(id));
  }
  state.panelOrder=normalizeOrder(state.panelOrder,[...panels.keys()]);
  for(const id of state.panelOrder)stack.append(panels.get(id));
  function persistOrder() {state.panelOrder=[...stack.querySelectorAll(':scope > [data-panel]')].map(el=>el.dataset.panel);onSave();}
  function fold(id,closed) {
    const card=panels.get(id);card.classList.toggle('collapsed',closed);card.querySelector('.card-body').hidden=closed;
    const button=card.querySelector('[data-panel-fold]');button.textContent=closed?'펼치기':'접기';button.setAttribute('aria-expanded',String(!closed));button.setAttribute('aria-label',`${titles[id]} ${closed?'펼치기':'접기'}`);
    state.collapsed=closed?[...new Set([...state.collapsed,id])]:state.collapsed.filter(n=>n!==id);
  }
  function restore() {
    if(!expanded)return;
    const card=expanded;placeholder.replaceWith(card);placeholder=null;expanded=null;
    card.classList.remove('expanded');
    for(const button of card.querySelectorAll('[data-panel-up],[data-panel-down],[data-panel-fold],.drag-handle'))button.disabled=false;
    const zoom=card.querySelector('[data-panel-zoom]');zoom.textContent='확대';zoom.setAttribute('aria-label',`${titles[card.dataset.panel]} 확대보기`);
    document.body.classList.remove('dialog-open');persistOrder();onResize(card.dataset.panel);zoom.focus();
  }
  dialog.addEventListener('close',restore);
  document.addEventListener('site-lock',()=>{if(dialog.open)dialog.close();});
  document.addEventListener('click',event=>{
    const button=event.target.closest('.panel-tool');if(!button)return;
    const card=button.closest('[data-panel]'),id=card?.dataset.panel;if(!id)return;
    if(button.hasAttribute('data-panel-fold')) {fold(id,!card.classList.contains('collapsed'));onSave();onResize(id);}
    else if(button.hasAttribute('data-panel-up')) {const previous=card.previousElementSibling;if(previous)stack.insertBefore(card,previous);persistOrder();}
    else if(button.hasAttribute('data-panel-down')) {const next=card.nextElementSibling;if(next)next.after(card);persistOrder();}
    else if(button.hasAttribute('data-panel-zoom')) {
      if(expanded){dialog.close();return;}
      if(card.classList.contains('collapsed'))fold(id,false);
      placeholder=document.createElement('div');placeholder.className='panel-placeholder';card.replaceWith(placeholder);
      expanded=card;dialog.append(card);card.classList.add('expanded');
      for(const tool of card.querySelectorAll('[data-panel-up],[data-panel-down],[data-panel-fold],.drag-handle'))tool.disabled=true;
      button.textContent='원래 크기';button.setAttribute('aria-label',`${titles[id]} 확대 보기 닫기`);
      dialog.setAttribute('aria-label',`${titles[id]} 확대보기`);dialog.showModal();document.body.classList.add('dialog-open');onResize(id);
    }
  });
  let drag=null;
  document.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('.drag-handle');if(!handle||handle.disabled||event.button!==0)return;
    event.preventDefault();drag={card:handle.closest('[data-panel]'),start:event.clientY,moved:false};handle.focus();
  });
  window.addEventListener('pointermove',event=>{
    if(!drag)return;if(Math.abs(event.clientY-drag.start)<6&&!drag.moved)return;
    drag.moved=true;drag.card.classList.add('dragging');
    const others=[...stack.children].filter(el=>el!==drag.card&&el.dataset.panel);
    const next=others.find(el=>{const rect=el.getBoundingClientRect();return event.clientY<rect.top+rect.height/2;});
    if(next)stack.insertBefore(drag.card,next);else stack.append(drag.card);
    if(event.clientY<70)window.scrollBy(0,-12);else if(event.clientY>window.innerHeight-70)window.scrollBy(0,12);
  });
  function endDrag() {if(!drag)return;drag.card.classList.remove('dragging');if(drag.moved)persistOrder();drag=null;}
  window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);window.addEventListener('blur',endDrag);
  document.addEventListener('keydown',event=>{
    if(!event.target.matches('.drag-handle')||!['ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();event.target.closest('[data-panel]').querySelector(event.key==='ArrowUp'?'[data-panel-up]':'[data-panel-down]').click();
  });
  return {isExpanded:id=>expanded?.dataset.panel===id};
}
