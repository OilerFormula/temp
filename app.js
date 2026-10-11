import { COLORS, metricValue, samplePoints, stats } from './engine.js';
import { SOURCE, bundledData, liveData, readCache, saveCache } from './data-source.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const format = (value, digits = 2) => value == null || !Number.isFinite(value) ? '자료 없음' : new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
const NAMES = { Allosaurus:'알로사우루스', Austroraptor:'아우스트로랍토르', Avaceratops:'아바케라톱스', Baryonyx:'바리오닉스', Beipiaosaurus:'베이피아오사우루스', Camarasaurus:'카마라사우루스', Carnotaurus:'카르노타우루스', Ceratosaurus:'케라토사우루스', Deinosuchus:'데이노수쿠스', Diabloceratops:'디아블로케라톱스', Dilophosaurus:'딜로포사우루스', Dryosaurus:'드리오사우루스', Gallimimus:'갈리미무스', Herrerasaurus:'헤레라사우루스', Hypsilophodon:'힙실로포돈', Kentrosaurus:'켄트로사우루스', Maiasaura:'마이아사우라', Omniraptor:'옴니랍토르', Oviraptor:'오비랍토르', Pachycephalosaurus:'파키케팔로사우루스', Pteranodon:'프테라노돈', Stegosaurus:'스테고사우루스', Tenontosaurus:'테논토사우루스', Triceratops:'트리케라톱스', Troodon:'트로오돈', Tyrannosaurus:'티라노사우루스' };
const ATTACK_NAMES = { AltBite:'보조 물기', Knockdown:'넘어뜨리기', Stagger:'비틀거림', SelfStagger:'자기 비틀거림', Tail:'꼬리', TailSwipe:'꼬리 휘두르기', Kick:'발차기', Pounce:'덮치기', Headbutt:'박치기', Charge:'돌진', Claw:'발톱', Peck:'쪼기', Bite:'물기' };
const SPEED_METRICS = [
  { id:'sprint', label:'기본 질주', unit:'km/h', dash:'' },
  { id:'boosted', label:'차징 / Ambush', unit:'km/h', dash:'8 5' },
  { id:'nutrient:1', label:'영양소 1개', unit:'km/h', dash:'3 5' },
  { id:'nutrient:2', label:'영양소 2개', unit:'km/h', dash:'6 3 2 3' },
  { id:'nutrient:3', label:'영양소 3개', unit:'km/h', dash:'10 3 2 3' },
  { id:'mobilize', label:'Mobilize', unit:'km/h', dash:'14 5' },
  { id:'flock', label:'무리 보정', unit:'km/h', dash:'4 3 1 3' },
  { id:'stamina', label:'스태미나 · 오른쪽 축', unit:'/s', dash:'2 5', secondary:true }
];
const DEFAULTS = { selected:['Carnotaurus','Ceratosaurus','Omniraptor'], growth:55.509, path:'prime', hidden:{weight:[],speed:[],attack:[]}, speedMetrics:['sprint','boosted'], attackMetrics:['bite'], unreleased:false, log:false, nutrients:3, leaderSpeed:null };
let saved = {};
try { saved = JSON.parse(localStorage.getItem('evrima-compare-view-v1')) ?? {}; } catch {}
const state = { ...DEFAULTS, ...saved, hidden:{...DEFAULTS.hidden,...saved.hidden} };
for (const key of ['selected','speedMetrics','attackMetrics']) if (!Array.isArray(state[key])) state[key] = [...DEFAULTS[key]];
for (const key of ['weight','speed','attack']) if (!Array.isArray(state.hidden[key])) state.hidden[key] = [];
if (!Number.isFinite(state.growth) || state.growth < 0 || state.growth > 100) state.growth = DEFAULTS.growth;
if (!['prime','frail'].includes(state.path)) state.path = 'prime';
let data = null, refreshing = false, savedTimer, cursorFrame;
const charts = {};
const nameOf = name => NAMES[name] ?? name;
const colorOf = name => {
  const list = [...DEFAULTS.selected, ...Object.keys(data.species).sort().filter(n => !DEFAULTS.selected.includes(n))];
  const i = list.indexOf(name);
  return COLORS[i] ?? `hsl(${Math.round(i * 137.508) % 360} 65% 72%)`;
};
const options = () => ({ nutrients:Number(state.nutrients), leaderSpeed:state.leaderSpeed });
const saveView = () => { clearTimeout(savedTimer); savedTimer = setTimeout(() => { try { localStorage.setItem('evrima-compare-view-v1', JSON.stringify(state)); } catch {} }, 250); };
function notice(message, success = false) { $('notice').textContent = message; $('notice').hidden = !message; $('notice').classList.toggle('success', success); }
function setConnection(message, live = false) { $('connection-status').textContent = message; $('connection-dot').className = `status-dot ${live ? 'live' : 'offline'}`; }
function availableSpecies() { return Object.keys(data.species).filter(n => state.unreleased || data.species[n].released).sort(); }
function renderSpecies() {
  const query = $('search').value.trim().toLowerCase();
  const species = availableSpecies().filter(n => `${n} ${nameOf(n)}`.toLowerCase().includes(query));
  $('selected-count').textContent = state.selected.length;
  $('species-list').innerHTML = species.length ? species.map(n => `<label class="species-item ${state.selected.includes(n) ? 'selected' : ''}" style="--species-color:${colorOf(n)}"><input type="checkbox" value="${n}" ${state.selected.includes(n) ? 'checked' : ''} aria-label="${escape(nameOf(n))} 비교"><span class="color-dot"></span><span class="species-name"><strong>${escape(nameOf(n))}</strong><small>${n}</small></span>${!data.species[n].released ? '<span class="unreleased-badge">미출시</span>' : ''}<span class="selection-mark">${state.selected.includes(n) ? '✓' : ''}</span></label>`).join('') : '<p class="no-results">검색 결과가 없습니다.</p>';
}
function attackMetrics() {
  const keys = new Set();
  for (const name of state.selected) for (const key of Object.keys(data.species[name]?.damage ?? {})) if (key !== 'Bite') keys.add(key);
  return [{ id:'bite', label:'물기 힘', unit:'피해', dash:'' }, ...[...keys].sort().map((key, i) => ({ id:`attack:${key}`, label:ATTACK_NAMES[key] ? `${ATTACK_NAMES[key]} (${key})` : key, unit:'피해', dash:['8 5','3 5','10 3 2 3','6 3 2 3'][i % 4] }))];
}
function descriptors(chart) {
  if (chart === 'weight') return [{ id:'weight', label:'체중', unit:'kg', dash:'' }];
  if (chart === 'speed') return SPEED_METRICS;
  return attackMetrics();
}
function metricsFor(chart) {
  const selected = chart === 'speed' ? state.speedMetrics : state.attackMetrics;
  return descriptors(chart).filter(m => chart === 'weight' || selected.includes(m.id));
}
function renderFilters() {
  for (const chart of ['weight','speed','attack']) {
    $(`${chart}-filters`).innerHTML = state.selected.map(n => `<button class="species-chip" type="button" data-chart="${chart}" data-species="${n}" aria-pressed="${!state.hidden[chart].includes(n)}" aria-label="${escape(nameOf(n))} ${chart === 'weight' ? '체중' : chart === 'speed' ? '달리기' : '공격력'} 표시"><span class="color-dot" style="background:${colorOf(n)}"></span>${escape(nameOf(n))}</button>`).join('');
  }
  for (const chart of ['speed','attack']) {
    const selected = chart === 'speed' ? state.speedMetrics : state.attackMetrics;
    $(`${chart}-metrics`).innerHTML = descriptors(chart).map(m => `<label class="check"><input type="checkbox" data-metric="${m.id}" data-chart="${chart}" ${selected.includes(m.id) ? 'checked' : ''}>${m.dash ? '<span class="metric-dash" aria-hidden="true"></span>' : ''}${escape(m.label)}</label>`).join('');
  }
}
function makeSeries(chart) {
  const result = [];
  for (const n of state.selected) {
    if (state.hidden[chart].includes(n) || !data.species[n]) continue;
    for (const metric of metricsFor(chart)) {
      const points = samplePoints(data.species[n], data.abilities[n], metric.id, state.path, options());
      if (!points.some(p => p.v != null && Number.isFinite(p.v))) continue;
      result.push({ name:n, metric, points, color:colorOf(n) });
    }
  }
  return result;
}
function niceMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value)), ratio = value / power;
  return (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 2.5 ? 2.5 : ratio <= 5 ? 5 : ratio <= 8 ? 8 : 10) * power;
}
function drawChart(chart) {
  const series = makeSeries(chart), container = $(`${chart}-plot`);
  if (!series.length) {
    const message = !state.selected.length ? '왼쪽에서 비교할 공룡을 선택하세요.' : !metricsFor(chart).length ? '표시할 세부 항목을 켜 주세요.' : '선택한 항목의 데이터가 없습니다.';
    container.innerHTML = `<div class="empty-chart"><p>${message}</p><small>공룡과 항목의 표시 버튼을 확인하세요.</small></div>`;
    charts[chart] = null;
    $(`${chart}-readout`).innerHTML = '';
    return;
  }
  const W=Math.max(300,Math.round(container.clientWidth)), H=W<600?250:310;
  const left=W<600?45:65, right=chart==='speed' && series.some(s=>s.metric.secondary) ? (W<600?52:70) : (W<600?16:28), top=26, bottom=46;
  const width=W-left-right, height=H-top-bottom;
  const values=series.filter(s=>!s.metric.secondary).flatMap(s=>s.points.map(p=>p.v).filter(v=>v!=null && Number.isFinite(v)));
  const log = chart === 'weight' && state.log;
  const max = niceMax(values.reduce((m,v)=>Math.max(m,v),0) * 1.05);
  const minPositive = values.reduce((m,v)=>v>0?Math.min(m,v):m,Infinity);
  const minLog = Number.isFinite(minPositive) ? Math.floor(Math.log10(minPositive)) : -1;
  const maxLog = Math.max(minLog+1,Math.ceil(Math.log10(max)));
  const rateValues=series.filter(s=>s.metric.secondary).flatMap(s=>s.points.map(p=>p.v).filter(v=>v!=null));
  const rateLow=rateValues.length ? -niceMax(Math.max(1,...rateValues.map(v=>Math.abs(v))) * 1.05) : -1;
  const x = t=>left+t*width;
  const y = (value, secondary=false)=>secondary ? top+height*(value/rateLow) : log ? top+height*(1-(Math.log10(Math.max(10**minLog,value))-minLog)/(maxLog-minLog)) : top+height*(1-value/max);
  let markup=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${chart==='weight'?'체중':chart==='speed'?'달리기':'공격력'} 성장 비교 그래프"><title>성장률별 공룡 비교</title><desc>성장률 0~100%. 아래에 선택한 성장률의 숫자 데이터가 있습니다.</desc><defs><clipPath id="clip-${chart}"><rect x="${left}" y="${top}" width="${width}" height="${height}"/></clipPath></defs><rect x="${x(.75)}" y="${top}" width="${width*.25}" height="${height}" fill="#20302a" opacity=".4"/>`;
  const ticks=log ? Array.from({length:maxLog-minLog+1},(_,i)=>10**(minLog+i)) : Array.from({length:6},(_,i)=>max*i/5);
  for (const tick of ticks) markup+=`<line class="grid" x1="${left}" x2="${W-right}" y1="${y(tick)}" y2="${y(tick)}"/>${values.length?`<text x="${left-12}" y="${y(tick)+4}" text-anchor="end">${format(tick,tick<1?3:1)}</text>`:''}`;
  for (const t of [0,.25,.5,.75,.875,1]) markup+=`<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${top+height}"/><text x="${x(t)}" y="${H-23}" text-anchor="middle">${t*100}%</text>`;
  markup+=`<text class="axis-title" x="${left}" y="13">${!values.length?'':chart==='weight'?'kg'+(log?' · 로그 눈금':''):chart==='speed'?'km/h':'공격 수치'}</text><text class="axis-title" x="${W-right}" y="${H-3}" text-anchor="end">성장률</text><text class="stage-tick" x="${x(.76)}" y="${top+13}">${state.path==='prime'?'PRIME':'FRAIL'} ELDER</text>`;
  if (rateValues.length) {
    markup+=`<text class="axis-title" x="${W-right+13}" y="13">/s</text>`;
    for (let i=0;i<=4;i++) { const v=rateLow*i/4; markup+=`<text x="${W-right+13}" y="${y(v,true)+4}">${format(v,2)}</text>`; }
  }
  markup+=`<g clip-path="url(#clip-${chart})">`;
  for (const s of series) {
    let path='', started=false;
    for (const p of s.points) {
      if (p.v==null || !Number.isFinite(p.v) || (log && p.v<=0)) { started=false; continue; }
      path+=`${started?'L':'M'}${x(p.t).toFixed(3)},${y(p.v,s.metric.secondary).toFixed(3)} `; started=true;
    }
    markup+=`<path class="curve" stroke="${s.color}" stroke-dasharray="${s.metric.dash}" d="${path.trim()}"><title>${escape(nameOf(s.name))} · ${escape(s.metric.label)}</title></path>`;
  }
  markup+=`<g class="chart-cursor"><line class="cursor-line" y1="${top}" y2="${top+height}"/><g class="cursor-dots"></g></g></g></svg>`;
  container.innerHTML=markup;
  charts[chart]={series,x,y,left,width,W};
  updateReadout(chart);
}
function updateReadout(chart) {
  const model=charts[chart];
  if (!model) return;
  const t=state.growth/100;
  const line=$(`${chart}-plot`).querySelector('.cursor-line');
  line.setAttribute('x1',model.x(t));line.setAttribute('x2',model.x(t));
  let dots='',readout='';
  for (const s of model.series) {
    const v=metricValue(data.species[s.name],data.abilities[s.name],s.metric.id,t,state.path,options());
    if (v!=null && Number.isFinite(v)) dots+=`<circle class="cursor-point" cx="${model.x(t)}" cy="${model.y(v,s.metric.secondary)}" r="4" fill="${s.color}"/>`;
    readout+=`<span class="readout-item"><span class="color-dot" style="background:${s.color}"></span><span>${escape(nameOf(s.name))}</span>${chart==='weight'?'':`<small>${escape(s.metric.label)}</small>`}<strong>${format(v,chart==='weight'?3:2)}</strong>${v!=null?`<small>${s.metric.unit}</small>`:''}</span>`;
  }
  $(`${chart}-plot`).querySelector('.cursor-dots').innerHTML=dots;
  $(`${chart}-readout`).innerHTML=readout;
}
function renderSnapshot() {
  $('snapshot-growth').textContent=`성장 ${format(state.growth,3)}% · ${state.path==='prime'?'Prime':'Frail'}`;
  $('snapshot-body').innerHTML=state.selected.length ? state.selected.map(n=> {
    const s=stats(data.species[n],data.abilities[n],state.growth/100,state.path,state.nutrients,state.leaderSpeed);
    const ability=data.abilities[n];
    return `<tr><td><span class="color-dot" style="background:${colorOf(n)}"></span><span>${escape(nameOf(n))}<br><small>${n}</small></span></td><td>${format(s.weight,3)}</td><td>${format(s.sprint,2)}</td><td>${s.boosted!=null?`${format(s.boosted,2)} <small>${escape(ability.label)}</small>`:s.mobilize!=null?`${format(s.mobilize,2)} <small>Mobilize · 영양 ${state.nutrients}개</small>`:'자료 없음'}</td><td>${format(s.bite,2)}</td><td>${format(s.stamina,2)}</td></tr>`;
  }).join('') : '<tr><td colspan="6">비교할 공룡을 선택하세요.</td></tr>';
}
function renderAbilityNotes() {
  $('ability-notes').innerHTML=state.selected.flatMap(n=> {
    const ability=data.abilities[n], s=data.species[n], parts=[];
    if (ability) parts.push(`${nameOf(n)} ${ability.label}: ×${ability.multiplier}${ability.staminaPerSec!=null?' · 스태미나 '+ability.staminaPerSec+'/s':''}${ability.durationSec!=null?' · 지속 '+ability.durationSec+'초':''}${ability.cooldownSec!=null?' · 쿨다운 '+ability.cooldownSec+'초':''}${ability.minStage?' · '+ability.minStage+'부터':''} · 원본 서버 측정값`);
    if (s.dietSpeed) parts.push(`${nameOf(n)}: 영양소당 +${format(s.dietSpeed.perNutrientCmS*.036,2)} km/h${s.mobilize?' · Mobilize +'+format(s.mobilize.boostCmS*.036,2)+' km/h ('+s.mobilize.durationSec+'초 / 쿨다운 '+s.mobilize.cooldownSec+'초)':''}`);
    return parts.map(text=>`<span>${escape(text)}</span>`);
  }).join('');
}
function renderGrowth() {
  $('growth').value=state.growth; $('growth-number').value=Number(state.growth.toFixed(3));
  $('stage-label').textContent=state.growth<25?'Hatchling':state.growth<50?'Juvenile':state.growth<75?'Sub-Adult':'Adult';
  for (const chart of ['weight','speed','attack']) updateReadout(chart);
  renderSnapshot(); saveView();
}
function renderAll() {
  if (!data) return;
  state.selected=state.selected.filter(n=>data.species[n]);
  renderSpecies();renderFilters();
  for (const chart of ['weight','speed','attack']) drawChart(chart);
  renderAbilityNotes();renderGrowth();saveView();
}
function applyData(next) {
  data=next;
  $('version').innerHTML=data.index.versions.map(v=>`<option value="${escape(v.id)}" ${v.id===data.version?'selected':''}>${escape(v.id)}${v.id===data.index.latest?' · 최신':''}</option>`).join('');
  const info=data.index.versions.find(v=>v.id===data.version);
  $('source-extracted').textContent=`v${data.version} · 추출 ${info?.extracted??'미제공'}`;
  $('update-details').textContent=`데이터 버전 ${data.version} · 원본 추출일 ${info?.extracted??'미제공'} · ${data.fetchedAt?'마지막 수신 '+new Date(data.fetchedAt).toLocaleString('ko-KR'):'프로젝트에 포함된 데이터'}${data.abilityWarning?' · '+data.abilityWarning:''}`;
  setConnection(`${data.source==='live'?'사이트 연결됨':data.source==='cache'?'저장된 데이터':'기본 데이터'} · v${data.version}`,data.source==='live');
  renderAll();
}
async function refresh(version, manual=true) {
  if (refreshing) return;
  refreshing=true; $('refresh').disabled=true; $('version').disabled=true;
  if (manual) notice('');
  try {
    const next=await liveData(version,message=>setConnection(message));
    const stored=saveCache(next); applyData(next);
    notice(next.abilityWarning || (!stored?'데이터를 불러왔지만 이 브라우저에서는 저장 공간을 사용할 수 없습니다.':manual?`v${next.version} 데이터를 업데이트했습니다.`:''),!next.abilityWarning && stored);
  } catch(error) {
    if (data) setConnection(`연결 실패 · v${data.version} 유지`);
    else setConnection('데이터 연결 실패');
    if (data) $('version').value=data.version;
    notice(`업데이트하지 못했습니다. ${data?'저장된 데이터로 계속 사용할 수 있습니다. ':''}${error.name==='AbortError'?'연결 시간이 초과되었습니다.':error.message}`);
  } finally { refreshing=false;$('refresh').disabled=false;$('version').disabled=false; }
}
function exportCsv() {
  if (!data || !state.selected.length) { notice('CSV로 내보낼 공룡을 먼저 선택해 주세요.'); return; }
  const rows=[['version','species','path','growth_percent','graph','metric','value','unit']];
  for (const chart of ['weight','speed','attack']) for (const n of state.selected) {
    if (state.hidden[chart].includes(n)) continue;
    for (const metric of metricsFor(chart)) for (let i=0;i<=100;i++) {
      const v=metricValue(data.species[n],data.abilities[n],metric.id,i/100,state.path,options());
      rows.push([data.version,n,i<75?'frail':state.path,i,chart,metric.id,v==null?'':v,metric.unit]);
    }
  }
  const csv='\uFEFF'+rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');
  a.href=url;a.download=`evrima-compare-${data.version}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('search').addEventListener('input',()=>data&&renderSpecies());
$('species-list').addEventListener('change',event=> {
  const target=event.target;
  if (!data || target.type!=='checkbox') return;
  if (target.checked && !state.selected.includes(target.value)) state.selected.push(target.value);
  else state.selected=state.selected.filter(n=>n!==target.value);
  renderAll();
});
$('clear-species').addEventListener('click',()=>{state.selected=[];renderAll();});
$('unreleased').checked=state.unreleased;
$('unreleased').addEventListener('change',event=> {state.unreleased=event.target.checked;if (!state.unreleased && data) state.selected=state.selected.filter(n=>data.species[n]?.released);renderAll();});
$('path').value=state.path;
$('path').addEventListener('change',event=>{state.path=event.target.value;renderAll();});
$('weight-log').checked=state.log;
$('weight-log').addEventListener('change',event=>{state.log=event.target.checked;drawChart('weight');saveView();});
for (const id of ['growth','growth-number']) $(id).addEventListener('input',event=> {
  if (event.target.value==='') return;
  const value=Number(event.target.value);if (!Number.isFinite(value)) return;
  state.growth=Math.max(0,Math.min(100,value));if(data)renderGrowth();
});
$('growth-number').addEventListener('blur',()=>{if(data)renderGrowth();});
document.querySelector('.stage-presets').addEventListener('click',event=> {const button=event.target.closest('button[data-growth]');if(button && data){state.growth=Number(button.dataset.growth);renderGrowth();}});
document.querySelector('.chart-stack').addEventListener('click',event=> {
  const chip=event.target.closest('button[data-species]');
  if (!chip) return;
  const {chart,species}=chip.dataset;
  state.hidden[chart]=state.hidden[chart].includes(species)?state.hidden[chart].filter(n=>n!==species):[...state.hidden[chart],species];
  chip.setAttribute('aria-pressed',!state.hidden[chart].includes(species));drawChart(chart);saveView();
});
document.querySelector('.chart-stack').addEventListener('change',event=> {
  const target=event.target;if (!target.dataset.metric || !data) return;
  const key=target.dataset.chart==='speed'?'speedMetrics':'attackMetrics';
  state[key]=target.checked?[...new Set([...state[key],target.dataset.metric])]:state[key].filter(n=>n!==target.dataset.metric);
  drawChart(target.dataset.chart);saveView();
});
for (const chart of ['weight','speed','attack']) {
  const pointToGrowth=event=> {
    if (!charts[chart] || (event.type==='pointermove' && event.pointerType!=='mouse')) return;
    const svg=$(`${chart}-plot`).querySelector('svg'),bounds=svg.getBoundingClientRect(),model=charts[chart];
    const pos=(event.clientX-bounds.left)/bounds.width*model.W;
    if(pos<model.left || pos>model.left+model.width)return;
    cancelAnimationFrame(cursorFrame);cursorFrame=requestAnimationFrame(()=>{state.growth=Math.round((pos-model.left)/model.width*100000)/1000;renderGrowth();});
  };
  $(`${chart}-plot`).addEventListener('pointermove',pointToGrowth);
  $(`${chart}-plot`).addEventListener('pointerdown',pointToGrowth);
}
$('nutrients').value=state.nutrients;
$('nutrients').addEventListener('change',event=>{state.nutrients=Number(event.target.value);if(data){drawChart('speed');renderSnapshot();saveView();}});
$('leader-speed').value=state.leaderSpeed??'';
$('leader-speed').addEventListener('input',event=>{const n=Number(event.target.value);state.leaderSpeed=event.target.value!==''&&Number.isFinite(n)&&n>=0&&n<=300?n:null;if(data){drawChart('speed');renderSnapshot();saveView();}});
$('refresh').addEventListener('click',()=>refresh(undefined));
$('version').addEventListener('change',event=>refresh(event.target.value));
$('export').addEventListener('click',exportCsv);
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(data)for(const chart of ['weight','speed','attack'])drawChart(chart);},150);});

async function start() {
  let initial=readCache();
  if (initial) initial.source='cache';
  else { try { initial=await bundledData(); } catch(error) { notice(`기본 데이터를 읽지 못했습니다. 원본 사이트에 연결합니다. ${error.message}`); } }
  if (initial) applyData(initial);
  await refresh(undefined,false);
}
start();
