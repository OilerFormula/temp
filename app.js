import { metricValue, samplePoints, stats } from './engine.js';
import {assignSpeciesColors,DEFAULT_SPECIES_COLORS} from './chart-colors.js';
import { SOURCE, bundledData, liveData, readCache, saveCache } from './data-source.js';
import { TIME_DEFAULTS, validateTimeSettings, validateGrowthData, elapsedMinutes, timeSamples, formatMinutes } from './growth-time.js';
import {GROWTH_STOPS,pointerGrowth,synchronizedGrowth} from './chart-controls.js';
import {setupDashboard} from './dashboard.js';
import {RECOVERY_STATES,loadStaminaReference,restMultiplier,formatReferenceTime,formatReferenceSeconds,referenceDurations} from './stamina-reference.js';

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
const CHART_NAMES = { time:'성장시간', weight:'체중', speed:'달리기', attack:'공격력' };
const CHART_IDS = Object.keys(CHART_NAMES);
const DEFAULTS = { selected:['Carnotaurus','Ceratosaurus'],colors:{...DEFAULT_SPECIES_COLORS},chartGrowth:{time:55.509,weight:55.509,speed:55.509,attack:55.509},sharedGrowth:55.509,panelOrder:[],collapsed:[],path:'prime', hidden:{time:[],weight:[],speed:[],attack:[]}, time:TIME_DEFAULTS, speedMetrics:['sprint','boosted'], attackMetrics:['bite'], unreleased:false, log:false, nutrients:3, leaderSpeed:null };
let saved = {};
try {const current=localStorage.getItem('evrima-compare-view-v2');saved=JSON.parse(current??localStorage.getItem('evrima-compare-view-v1'))??{};if(!current)saved.selected=[...DEFAULTS.selected];} catch {}
const state = { ...DEFAULTS, ...saved, hidden:{...DEFAULTS.hidden,...saved.hidden} };
state.colors=saved.colors&&typeof saved.colors==='object'&&!Array.isArray(saved.colors)?saved.colors:{...DEFAULT_SPECIES_COLORS};
state.chartGrowth=Object.fromEntries(CHART_IDS.map(id=>{const value=saved.chartGrowth?.[id]??saved.growth??DEFAULTS.chartGrowth[id];return[id,Number.isFinite(value)&&value>=0&&value<=100?value:DEFAULTS.chartGrowth[id]];}));
state.sharedGrowth=Number.isFinite(saved.sharedGrowth)&&saved.sharedGrowth>=0&&saved.sharedGrowth<=100?saved.sharedGrowth:DEFAULTS.sharedGrowth;
delete state.growth;
state.collapsed=Array.isArray(saved.collapsed)?saved.collapsed:[];
state.panelOrder=Array.isArray(saved.panelOrder)?saved.panelOrder:[];
if(state.panelOrder.length&&!state.panelOrder.includes('stamina'))state.panelOrder.splice(state.panelOrder.includes('snapshot')?state.panelOrder.indexOf('snapshot'):state.panelOrder.length,0,'stamina');
state.stamina={onlySelected:saved.stamina?.onlySelected!==false,restSeconds:Number.isInteger(saved.stamina?.restSeconds)&&saved.stamina.restSeconds>=0&&saved.stamina.restSeconds<=3600?saved.stamina.restSeconds:100,recoveryBuff:saved.stamina?.recoveryBuff===true};
try { state.time=validateTimeSettings({...TIME_DEFAULTS,...saved.time,regions:saved.time?.regions??[]}); } catch { state.time={...TIME_DEFAULTS,regions:[]}; }
delete state.time.mode;
for (const key of ['selected','speedMetrics','attackMetrics']) if (!Array.isArray(state[key])) state[key] = [...DEFAULTS[key]];
for (const key of CHART_IDS) if (!Array.isArray(state.hidden[key])) state.hidden[key] = [];
if (!['prime','frail'].includes(state.path)) state.path = 'prime';
let data = null, refreshing = false, savedTimer, cursorFrame;
let growthTimes=null, growthLoadError='', timeSettingsError='';
let staminaReference=null,staminaLoadError='';
const charts = {};
const nameOf = name => NAMES[name] ?? name;
const colorOf = name => state.colors[name]??'#a0aeb2';
const options = () => ({ nutrients:Number(state.nutrients), leaderSpeed:state.leaderSpeed });
const persistView = () => { try { localStorage.setItem('evrima-compare-view-v2', JSON.stringify(state)); } catch {} };
const saveView = () => { clearTimeout(savedTimer); savedTimer = setTimeout(persistView,250); };
window.addEventListener('pagehide',persistView);
const dashboard=setupDashboard({state,chartNames:CHART_NAMES,panelNames:{stamina:'스태미나'},onSave:saveView,onResize:id=>{if(data&&CHART_IDS.includes(id))drawChart(id);}});
function notice(message, success = false) { $('notice').textContent = message; $('notice').hidden = !message; $('notice').classList.toggle('success', success); }
function setConnection(message, live = false) { $('connection-status').textContent = message; $('connection-dot').className = `status-dot ${live ? 'live' : 'offline'}`; }
function availableSpecies() { return Object.keys(data.species).filter(n => state.unreleased || data.species[n].released).sort(); }
function renderSpecies() {
  const query = $('search').value.trim().toLowerCase();
  const species = availableSpecies().filter(n => `${n} ${nameOf(n)}`.toLowerCase().includes(query));
  $('selected-count').textContent = state.selected.length;
  $('species-list').innerHTML = species.length ? species.map(n => `<label class="species-item ${state.selected.includes(n) ? 'selected' : ''}" style="--species-color:${colorOf(n)}"><input type="checkbox" value="${n}" ${state.selected.includes(n) ? 'checked' : ''} aria-label="${n} ${escape(nameOf(n))} 비교"><span class="color-dot"></span><span class="species-name"><strong>${n}</strong><small>${escape(nameOf(n))}</small></span>${!data.species[n].released ? '<span class="unreleased-badge">미출시</span>' : ''}<span class="selection-mark">${state.selected.includes(n) ? '✓' : ''}</span></label>`).join('') : '<p class="no-results">검색 결과가 없습니다.</p>';
}
function attackMetrics() {
  const keys = new Set();
  for (const name of state.selected) for (const key of Object.keys(data.species[name]?.damage ?? {})) if (key !== 'Bite') keys.add(key);
  return [{ id:'bite', label:'물기 힘', unit:'피해', dash:'' }, ...[...keys].sort().map((key, i) => ({ id:`attack:${key}`, label:ATTACK_NAMES[key] ? `${ATTACK_NAMES[key]} (${key})` : key, unit:'피해', dash:['8 5','3 5','10 3 2 3','6 3 2 3'][i % 4] }))];
}
function descriptors(chart) {
  if (chart === 'time') return [{id:'time',label:'누적 시간',unit:'분',dash:''}];
  if (chart === 'weight') return [{ id:'weight', label:'체중', unit:'kg', dash:'' }];
  if (chart === 'speed') return SPEED_METRICS;
  return attackMetrics();
}
function metricsFor(chart) {
  const selected = chart === 'speed' ? state.speedMetrics : state.attackMetrics;
  return descriptors(chart).filter(m => ['weight','time'].includes(chart) || selected.includes(m.id));
}
function renderFilters() {
  for (const chart of CHART_IDS) {
    $(`${chart}-filters`).innerHTML = state.selected.map(n => `<button class="species-chip" type="button" data-chart="${chart}" data-species="${n}" aria-pressed="${!state.hidden[chart].includes(n)}" aria-label="${escape(nameOf(n))} ${CHART_NAMES[chart]} 표시"><span class="color-dot" style="background:${colorOf(n)}"></span>${escape(nameOf(n))}</button>`).join('');
  }
  for (const chart of ['speed','attack']) {
    const selected = chart === 'speed' ? state.speedMetrics : state.attackMetrics;
    $(`${chart}-metrics`).innerHTML = descriptors(chart).map(m => `<label class="check"><input type="checkbox" data-metric="${m.id}" data-chart="${chart}" ${selected.includes(m.id) ? 'checked' : ''}>${m.dash ? '<span class="metric-dash" aria-hidden="true"></span>' : ''}${escape(m.label)}</label>`).join('');
  }
}
function makeSeries(chart) {
  const result = [];
  if (chart==='time' && (!growthTimes || timeSettingsError)) return result;
  for (const n of state.selected) {
    if (state.hidden[chart].includes(n) || !data.species[n]) continue;
    for (const metric of metricsFor(chart)) {
      const points = chart==='time' ? timeSamples(growthTimes.species[n],state.time) : samplePoints(data.species[n], data.abilities[n], metric.id, state.path, options());
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
    const message = chart==='time' && (timeSettingsError || growthLoadError) ? (timeSettingsError || growthLoadError) : !state.selected.length ? '왼쪽에서 비교할 공룡을 선택하세요.' : !metricsFor(chart).length ? '표시할 세부 항목을 켜 주세요.' : '선택한 항목의 데이터가 없습니다.';
    container.innerHTML = `<div class="empty-chart"><p>${escape(message)}</p><small>공룡과 항목의 표시 버튼을 확인하세요.</small></div>`;
    charts[chart] = null;
    $(`${chart}-readout`).innerHTML = '';
    return;
  }
  const W=Math.max(260,Math.round(container.clientWidth)), H=dashboard.isExpanded(chart)?Math.max(280,Math.min(620,window.innerHeight*.6)):W<600?250:310;
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
  let markup=`<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${CHART_NAMES[chart]} 성장 비교 그래프"><title>성장률별 공룡 비교</title><desc>성장률 0~100%. 아래 눈금의 숫자를 누르면 해당 성장률을 선택합니다.</desc><defs><clipPath id="clip-${chart}"><rect x="${left}" y="${top}" width="${width}" height="${height}"/></clipPath></defs><rect x="${x(.75)}" y="${top}" width="${width*.25}" height="${height}" fill="#20302a" opacity=".4"/>`;
  if (chart==='time') {
    for (const region of state.time.regions) markup+=`<rect x="${x(region.from/100)}" y="${top}" width="${width*(region.to-region.from)/100}" height="${height}" fill="#f7ae70" opacity=".05"/><line class="grid" x1="${x(region.from/100)}" x2="${x(region.from/100)}" y1="${top}" y2="${top+height}"/>`;
    for (const g of [state.time.start,state.time.target]) markup+=`<line class="time-boundary" x1="${x(g/100)}" x2="${x(g/100)}" y1="${top}" y2="${top+height}"/>`;
  }
  const ticks=log ? Array.from({length:maxLog-minLog+1},(_,i)=>10**(minLog+i)) : Array.from({length:6},(_,i)=>max*i/5);
  for (const tick of ticks) markup+=`<line class="grid" x1="${left}" x2="${W-right}" y1="${y(tick)}" y2="${y(tick)}"/>${values.length?`<text x="${left-12}" y="${y(tick)+4}" text-anchor="end">${format(tick,tick<1?3:1)}</text>`:''}`;
  for (const growth of GROWTH_STOPS) {
    const t=growth/100,hitWidth=Math.min(50,width*.12);
    markup+=`<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${top+height}"/><g class="growth-axis-stop" role="button" tabindex="0" data-preset-chart="${chart}" data-growth="${growth}" aria-label="${CHART_NAMES[chart]} ${growth}% 선택" aria-pressed="${growth===state.chartGrowth[chart]}"><rect x="${x(t)-hitWidth/2}" y="${H-40}" width="${hitWidth}" height="29" rx="5"/><text x="${x(t)}" y="${H-23}" text-anchor="middle">${growth}%</text></g>`;
  }
  markup+=`<text class="axis-title" x="${left}" y="13">${!values.length?'':chart==='weight'?'kg'+(log?' · 로그 눈금':''):chart==='speed'?'km/h':chart==='time'?'분':'공격 수치'}</text><text class="axis-title" x="${W-right}" y="${H-3}" text-anchor="end">성장률</text><text class="stage-tick" x="${x(.76)}" y="${top+13}">${chart==='time'?'식성 보너스 0%':state.path==='prime'?'PRIME ELDER':'FRAIL ELDER'}</text>`;
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
  markup+=`<g class="chart-cursor"><line class="cursor-line" y1="${top}" y2="${top+height}"/><g class="cursor-dots"></g></g><g class="chart-hover" hidden><line class="hover-line" y1="${top}" y2="${top+height}"/></g></g></svg><div class="hover-percent" hidden></div>`;
  container.innerHTML=markup;
  charts[chart]={series,x,y,left,width,W,H,top,height};
  updateReadout(chart);
}
function updateReadout(chart) {
  const model=charts[chart];
  if (!model) return;
  const t=state.chartGrowth[chart]/100;
  const line=$(`${chart}-plot`).querySelector('.cursor-line');
  line.setAttribute('x1',model.x(t));line.setAttribute('x2',model.x(t));
  let dots='',readout='';
  for (const s of model.series) {
    const v=chart==='time' ? elapsedMinutes(growthTimes.species[s.name],state.time.start,t*100,state.time) : metricValue(data.species[s.name],data.abilities[s.name],s.metric.id,t,state.path,options());
    if (v!=null && Number.isFinite(v)) dots+=`<circle class="cursor-point" cx="${model.x(t)}" cy="${model.y(v,s.metric.secondary)}" r="4" fill="${s.color}"/>`;
    const display=chart==='time' ? (t*100<state.time.start?'시작 이전':formatMinutes(v)) : format(v,chart==='weight'?3:2);
    readout+=`<span class="readout-item"><span class="color-dot" style="background:${s.color}"></span><span>${escape(nameOf(s.name))}</span>${chart==='weight'||chart==='time'?'':`<small>${escape(s.metric.label)}</small>`}<strong>${display}</strong>${chart!=='time'&&v!=null?`<small>${s.metric.unit}</small>`:''}</span>`;
  }
  $(`${chart}-plot`).querySelector('.cursor-dots').innerHTML=dots;
  $(`${chart}-readout`).innerHTML=readout;
}
function renderSnapshot() {
  $('snapshot-growth').textContent=`체중 ${format(state.chartGrowth.weight,3)}% · 달리기 ${format(state.chartGrowth.speed,3)}% · 공격력 ${format(state.chartGrowth.attack,3)}% · ${state.path==='prime'?'Prime':'Frail'}`;
  $('snapshot-body').innerHTML=state.selected.length ? state.selected.map(n=> {
    const weight=stats(data.species[n],data.abilities[n],state.chartGrowth.weight/100,state.path,state.nutrients,state.leaderSpeed);
    const speed=stats(data.species[n],data.abilities[n],state.chartGrowth.speed/100,state.path,state.nutrients,state.leaderSpeed);
    const attack=stats(data.species[n],data.abilities[n],state.chartGrowth.attack/100,state.path,state.nutrients,state.leaderSpeed);
    const s={...speed,weight:weight.weight,bite:attack.bite};
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
function renderGrowth(only=null) {
  $('time-cursor-label').textContent=`선택: ${format(state.time.start,3)}% → ${format(state.chartGrowth.time,3)}%`;
  for (const chart of only?[only]:CHART_IDS) {
    const control=document.querySelector(`[data-chart-growth="${chart}"]`);
    if(control&&document.activeElement!==control)control.value=Number(state.chartGrowth[chart].toFixed(3));
    for(const button of document.querySelectorAll(`[data-preset-chart="${chart}"]`))button.setAttribute('aria-pressed',String(Number(button.dataset.growth)===state.chartGrowth[chart]));
    updateReadout(chart);
  }
  renderSnapshot(); saveView();
}
function renderAll() {
  if (!data) return;
  state.selected=state.selected.filter(n=>data.species[n]);
  state.colors=assignSpeciesColors(state.selected,state.colors);
  renderSpecies();renderFilters();
  for (const chart of CHART_IDS) drawChart(chart);
  renderTimeResults();renderStamina();
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
  const staminaLoading=manual?reloadStamina():Promise.resolve();
  try {
    const next=await liveData(version,message=>setConnection(message));
    const stored=saveCache(next); applyData(next);
    notice(next.abilityWarning || (!stored?'데이터를 불러왔지만 이 브라우저에서는 저장 공간을 사용할 수 없습니다.':manual?`v${next.version} 데이터를 업데이트했습니다.`:''),!next.abilityWarning && stored);
  } catch(error) {
    if (data) setConnection(`연결 실패 · v${data.version} 유지`);
    else setConnection('데이터 연결 실패');
    if (data) $('version').value=data.version;
    notice(`업데이트하지 못했습니다. ${data?'저장된 데이터로 계속 사용할 수 있습니다. ':''}${error.name==='AbortError'?'연결 시간이 초과되었습니다.':error.message}`);
  } finally { await staminaLoading;refreshing=false;$('refresh').disabled=false;$('version').disabled=false; }
}

function staminaNames() {
  return state.stamina.onlySelected?state.selected:staminaReference?Object.keys(staminaReference.species).sort():[];
}
function staminaNameCell(name) {
  return `<td><div class="stamina-species"><span class="color-dot" style="background:${colorOf(name)}"></span><span><strong>${escape(name)}</strong><small>${escape(nameOf(name))}</small></span></div></td>`;
}
function renderStamina() {
  const names=staminaNames(),seconds=state.stamina.restSeconds;
  $('stamina-current-header').innerHTML=`${seconds}초 휴식<br><small>회복 배율</small>`;
  $('stamina-error').hidden=!staminaLoadError;$('stamina-error').textContent=staminaLoadError;
  const empty=staminaReference?'표시할 공룡을 선택하세요.':staminaLoadError?'스태미나 자료를 읽지 못했습니다.':'스태미나 자료 확인 중…';
  $('stamina-results').innerHTML=names.length?names.map(name=>{
    const profile=staminaReference?.species[name];
    if(!profile)return `<tr>${staminaNameCell(name)}<td colspan="7" class="missing-reference">자료 없음</td></tr>`;
    return `<tr>${staminaNameCell(name)}${RECOVERY_STATES.map(key=>`<td>${format(profile.regeneration[key],3)}</td>`).join('')}<td class="rest-multiplier">×${format(restMultiplier(profile,seconds),2)}</td><td>×${format(profile.rest.maximum,2)}</td><td>${profile.rest.fullAt}초</td></tr>`;
  }).join(''):`<tr><td colspan="8">${escape(empty)}</td></tr>`;
  const mode=state.stamina.recoveryBuff?1:0;
  const timingCell=value=>`<td class="stamina-duration"><strong>${escape(formatReferenceSeconds(value))}</strong>${value?`<small>${escape(formatReferenceTime(value))}</small>`:''}</td>`;
  $('stamina-primary-results').innerHTML=names.length?names.map(name=>{
    const timing=staminaReference?.species[name]?.timing;
    return `<tr>${staminaNameCell(name)}${timingCell(timing?.duration)}${timingCell(timing?.resting[mode])}</tr>`;
  }).join(''):`<tr><td colspan="3">${escape(empty)}</td></tr>`;
  $('stamina-timing-results').innerHTML=names.length?names.map(name=>{
    const timing=staminaReference?.species[name]?.timing;
    return `<tr>${staminaNameCell(name)}${timing?['duration','resting','standing','walking','trotting'].map(key=>`<td>${escape(formatReferenceTime(key==='duration'?timing[key]:timing[key][mode]))}</td>`).join(''):'<td colspan="5" class="missing-reference">자료 없음</td>'}</tr>`;
  }).join(''):`<tr><td colspan="6">${escape(empty)}</td></tr>`;
  $('stamina-source-summary').textContent=staminaReference?`자료 출처 · ${staminaReference.checkedOn} 확인 · 시간표 ${Object.values(staminaReference.species).filter(profile=>profile.timing).length}종 / 회복값 ${Object.keys(staminaReference.species).length}종`:'스태미나 자료 확인 중…';
  $('stamina-timing-note').textContent=`EQG 참고 자료${staminaReference?.timingSourceUpdating?' · 원본 갱신 중':''}. 버전·성장 단계 미명시. 지속 시간은 기본값, 완전 회복은 ${mode?'15% 버프':'버프 없음'} 상태의 휴식 기준입니다.`;
}
async function reloadStamina() {
  try {
    const next=await loadStaminaReference();
    staminaReference=next;staminaLoadError='';
    state.stamina.restSeconds=Math.min(next.maxSeconds,state.stamina.restSeconds);
    $('stamina-seconds').max=next.maxSeconds;$('stamina-seconds').value=state.stamina.restSeconds;
  } catch(error) {staminaLoadError=`자료 연결 실패${staminaReference?' · 이전 회복표 유지':''}: ${error.message}`;}
  renderStamina();saveView();
}
$('stamina-seconds').value=state.stamina.restSeconds;
$('stamina-seconds').addEventListener('input',event=>{
  if(event.target.value==='')return;
  const value=Number(event.target.value),maximum=staminaReference?.maxSeconds??200;
  if(!Number.isInteger(value)||value<0||value>maximum){event.target.setCustomValidity(`0~${maximum}초의 정수를 입력하세요.`);return;}
  event.target.setCustomValidity('');state.stamina.restSeconds=value;renderStamina();saveView();
});
$('stamina-seconds').addEventListener('change',event=>{event.target.setCustomValidity('');event.target.value=state.stamina.restSeconds;});
for(const [id,key] of [['stamina-selected','onlySelected'],['stamina-buff','recoveryBuff']]) {
  $(id).checked=state.stamina[key];
  $(id).addEventListener('change',event=>{state.stamina[key]=event.target.checked;renderStamina();saveView();});
}
$('stamina-export').addEventListener('click',()=>{
  if(!staminaReference||!staminaNames().length){notice('회복표 자료와 공룡 선택을 확인하세요.');return;}
  const rows=[['checked_on','species','duration_seconds_by_condition','full_rest_recovery_seconds_by_condition','recovery_buff_percent','timing_source','base_unit','standing','walking','trotting','resting','rest_seconds','rest_multiplier','max_rest_multiplier','max_at_seconds']];
  for(const name of staminaNames()) {
    const profile=staminaReference.species[name],timing=profile?.timing;
    rows.push([staminaReference.checkedOn,name,timing?JSON.stringify(referenceDurations(timing.duration)):'',timing?JSON.stringify(referenceDurations(timing.resting[state.stamina.recoveryBuff?1:0])):'',state.stamina.recoveryBuff?15:0,staminaReference.sources.timings,staminaReference.unit,...RECOVERY_STATES.map(key=>profile?.regeneration[key]??''),state.stamina.restSeconds,restMultiplier(profile,state.stamina.restSeconds)??'',profile?.rest.maximum??'',profile?.rest.fullAt??'']);
  }
  downloadCsv(rows,`evrima-stamina-${staminaReference.checkedOn}.csv`);
});
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
$('all-species').addEventListener('click',()=>{if(data){state.selected=availableSpecies();renderAll();}});
$('unreleased').checked=state.unreleased;
$('unreleased').addEventListener('change',event=> {state.unreleased=event.target.checked;if (!state.unreleased && data) state.selected=state.selected.filter(n=>data.species[n]?.released);renderAll();});
$('path').value=state.path;
$('path').addEventListener('change',event=>{state.path=event.target.value;renderAll();});
$('weight-log').checked=state.log;
$('weight-log').addEventListener('change',event=>{state.log=event.target.checked;drawChart('weight');saveView();});
document.addEventListener('input',event=>{
  const input=event.target,chart=input.dataset.chartGrowth;if(!chart||input.value==='')return;
  const value=Number(input.value);if(!Number.isFinite(value))return;
  state.chartGrowth[chart]=Math.max(0,Math.min(100,value));if(data)renderGrowth(chart);
});
document.addEventListener('focusout',event=>{if(event.target.dataset.chartGrowth&&data)renderGrowth();});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-preset-chart]');if(!button||!data)return;
  const chart=button.dataset.presetChart;state.chartGrowth[chart]=Number(button.dataset.growth);renderGrowth(chart);
});
document.addEventListener('click',event=> {
  const chip=event.target.closest('button[data-species]');
  if (!chip) return;
  const {chart,species}=chip.dataset;
  state.hidden[chart]=state.hidden[chart].includes(species)?state.hidden[chart].filter(n=>n!==species):[...state.hidden[chart],species];
  chip.setAttribute('aria-pressed',!state.hidden[chart].includes(species));drawChart(chart);saveView();
  if (chart==='time') renderTimeResults();
});
document.addEventListener('change',event=> {
  const target=event.target;if (!target.dataset.metric || !data) return;
  const key=target.dataset.chart==='speed'?'speedMetrics':'attackMetrics';
  state[key]=target.checked?[...new Set([...state[key],target.dataset.metric])]:state[key].filter(n=>n!==target.dataset.metric);
  drawChart(target.dataset.chart);saveView();
});
$('shared-growth-stops').innerHTML=GROWTH_STOPS.map(value=>`<button type="button" data-shared-growth="${value}" style="--stop:${value}%" aria-label="모든 그래프 ${value}% 선택">${value}%</button>`).join('');
function renderSharedGrowth() {
  $('shared-growth').value=state.sharedGrowth;
  $('shared-growth-value').textContent=`${format(state.sharedGrowth,3)}%`;
  $('shared-growth').setAttribute('aria-valuetext',`${format(state.sharedGrowth,3)}%`);
  for(const button of document.querySelectorAll('[data-shared-growth]'))button.setAttribute('aria-pressed',String(Number(button.dataset.sharedGrowth)===state.sharedGrowth));
}
function selectSharedGrowth(value) {
  state.chartGrowth=synchronizedGrowth(value,CHART_IDS);state.sharedGrowth=Number(value);
  renderSharedGrowth();if(data)renderGrowth();else saveView();
}
renderSharedGrowth();
$('shared-growth').addEventListener('input',event=>selectSharedGrowth(event.target.value));
$('shared-growth-stops').addEventListener('click',event=>{
  const button=event.target.closest('[data-shared-growth]');if(button)selectSharedGrowth(button.dataset.sharedGrowth);
});
document.addEventListener('keydown',event=>{
  const tick=event.target.closest('.growth-axis-stop');
  if(!tick||!['Enter',' '].includes(event.key))return;
  event.preventDefault();tick.dispatchEvent(new MouseEvent('click',{bubbles:true}));
});
for (const chart of CHART_IDS) {
  const plot=$(`${chart}-plot`);
  plot.insertAdjacentHTML('afterend',`<div class="chart-growth-controls"><label>성장치 <input type="number" min="0" max="100" step="0.001" value="${state.chartGrowth[chart]}" data-chart-growth="${chart}" aria-label="${CHART_NAMES[chart]} 성장치"> %</label></div>`);
  const hover=event=>{
    const model=charts[chart],svg=plot.querySelector('svg');if(!model||!svg)return;
    const bounds=svg.getBoundingClientRect(),growth=pointerGrowth(event.clientX,event.clientY,bounds,model),label=plot.querySelector('.hover-percent'),group=svg.querySelector('.chart-hover');
    label.hidden=growth==null;group.toggleAttribute('hidden',growth==null);
    if(growth==null)return;
    const line=group.querySelector('line');line.setAttribute('x1',model.x(growth/100));line.setAttribute('x2',model.x(growth/100));
    label.textContent=`${format(growth,3)}%`;label.style.left=`${Math.max(32,Math.min(bounds.width-32,event.clientX-bounds.left))}px`;label.style.top=`${Math.max(0,event.clientY-bounds.top-34)}px`;
  };
  plot.addEventListener('pointermove',hover);
  plot.addEventListener('pointerleave',()=>{plot.querySelector('.hover-percent')?.setAttribute('hidden','');plot.querySelector('.chart-hover')?.setAttribute('hidden','');});
  plot.addEventListener('click',event=>{
    if(event.button!==0||!charts[chart])return;
    const growth=pointerGrowth(event.clientX,event.clientY,plot.querySelector('svg').getBoundingClientRect(),charts[chart]);
    if(growth==null)return;state.chartGrowth[chart]=growth;renderGrowth(chart);
  });
}
$('nutrients').value=state.nutrients;
$('nutrients').addEventListener('change',event=>{state.nutrients=Number(event.target.value);if(data){drawChart('speed');renderSnapshot();saveView();}});
$('leader-speed').value=state.leaderSpeed??'';
$('leader-speed').addEventListener('input',event=>{const n=Number(event.target.value);state.leaderSpeed=event.target.value!==''&&Number.isFinite(n)&&n>=0&&n<=300?n:null;if(data){drawChart('speed');renderSnapshot();saveView();}});
$('refresh').addEventListener('click',()=>refresh(undefined));
$('version').addEventListener('change',event=>refresh(event.target.value));
$('export').addEventListener('click',exportCsv);
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(data)for(const chart of CHART_IDS)drawChart(chart);},150);});

function renderTimeResults() {
  $('time-target-label').textContent=`${format(state.time.start,3)}% → ${format(state.time.target,3)}%`;
  const names=state.selected.filter(n=>!state.hidden.time.includes(n));
  $('time-results').innerHTML=names.length ? names.map(n=>{
    const value=timeSettingsError ? null : elapsedMinutes(growthTimes?.species[n],state.time.start,state.time.target,state.time);
    return `<tr><td><span class="color-dot" style="background:${colorOf(n)}"></span>${escape(nameOf(n))}</td><td>${timeSettingsError?'설정 확인':formatMinutes(value)}</td><td>${value===Infinity?'∞':value==null?'—':format(value,2)}</td></tr>`;
  }).join('') : '<tr><td colspan="3">표시할 공룡을 선택하세요.</td></tr>';
  $('time-source-summary').textContent=growthTimes ? `기본 시간 · ${growthTimes.sourceName} · ${growthTimes.checkedOn} 확인 · ${Object.keys(growthTimes.species).length}종` : growthLoadError || '성장시간 자료 확인 중…';
  $('time-source-links').innerHTML=state.selected.map(n=>{
    const profile=growthTimes?.species[n];
    return profile ? `<a href="${escape(profile.source)}" target="_blank" rel="noopener noreferrer">${escape(nameOf(n))} ↗ <span>${profile.stageMinutes.join(' / ')}분</span></a>` : `<span>${escape(nameOf(n))} · 자료 없음</span>`;
  }).join('');
}

function renderTimeRegions() {
  $('time-regions').innerHTML=state.time.regions.length ? state.time.regions.map((r,i)=>`<div class="time-region"><label>시작 (%)<input type="number" min="0" max="75" step="any" data-time-row="${i}" data-field="from" aria-label="구간 ${i+1} 시작 성장률" value="${Number.isFinite(r.from)?r.from:''}"></label><label>끝 (%)<input type="number" min="0" max="75" step="any" data-time-row="${i}" data-field="to" aria-label="구간 ${i+1} 끝 성장률" value="${Number.isFinite(r.to)?r.to:''}"></label><label class="region-value-label">식성 보너스 (+%)<input type="number" min="0" max="300" step="any" data-time-row="${i}" data-field="bonus" aria-label="구간 ${i+1} 식성 값" value="${Number.isFinite(r.bonus)?r.bonus:''}"></label><button type="button" class="text-button" data-remove-region="${i}" aria-label="구간 ${i+1} 삭제">삭제</button></div>`).join('') : '<p class="small muted region-empty">전체 구간에 기본값 적용</p>';
}

function changeTimeSettings() {
  try { validateTimeSettings(state.time); timeSettingsError=''; } catch(error) { timeSettingsError=error.message; }
  $('time-error').hidden=!timeSettingsError; $('time-error').textContent=timeSettingsError;
  // The note describes the default (unassigned) bonus, independent of region overrides.
  const base=state.time.server*(1+state.time.bonus/100);
  $('time-rate-note').textContent=timeSettingsError ? '설정을 확인하세요.' : `미지정 구간 ×${format(base,3)} · 75% 이후 ×${format(state.time.server,3)}`;
  if (data) { drawChart('time'); renderTimeResults(); renderGrowth(); }
  saveView();
}

const timeInputs={ 'time-server':'server','time-bonus':'bonus','time-start':'start','time-target':'target' };
for (const [id,key] of Object.entries(timeInputs)) {
  $(id).value=state.time[key];
  $(id).addEventListener('input',event=>{state.time[key]=event.target.value===''?NaN:Number(event.target.value);changeTimeSettings();});
}
document.querySelector('.time-presets').addEventListener('click',event=>{
  const button=event.target.closest('[data-time-start]');
  if (!button) return;
  state.time.start=Number(button.dataset.timeStart); $('time-start').value=state.time.start; changeTimeSettings();
});
$('add-time-region').addEventListener('click',()=>{
  const sorted=[...state.time.regions].sort((a,b)=>a.from-b.from);
  if (timeSettingsError) { $('time-error').hidden=false;return; }
  const gaps=[];let cursor=0;
  for (const row of sorted) {if(row.from>cursor)gaps.push({from:cursor,to:row.from});cursor=Math.max(cursor,row.to);}
  if(cursor<75)gaps.push({from:cursor,to:75});
  const preferred=gaps.find(g=>g.to>state.time.start),gap=preferred??gaps[0];
  if (!gap) { $('time-error').textContent='0~75% 전체 구간이 지정되어 있습니다.';$('time-error').hidden=false;return; }
  const from=preferred?Math.max(gap.from,state.time.start):gap.from,to=gap.to;
  state.time.regions.push({from,to,bonus:Number.isFinite(state.time.bonus)?state.time.bonus:0}); renderTimeRegions();changeTimeSettings();
});
$('time-regions').addEventListener('input',event=>{
  const {timeRow,field}=event.target.dataset;if (timeRow===undefined) return;
  state.time.regions[Number(timeRow)][field]=event.target.value===''?NaN:Number(event.target.value);changeTimeSettings();
});
$('time-regions').addEventListener('click',event=>{
  const button=event.target.closest('[data-remove-region]');if(!button)return;
  state.time.regions.splice(Number(button.dataset.removeRegion),1);renderTimeRegions();changeTimeSettings();
});
$('time-export').addEventListener('click',()=>{
  if (!data || !growthTimes || timeSettingsError || !state.selected.length) { notice('성장시간 자료와 설정, 공룡 선택을 확인하세요.');return; }
  const rows=[['baseline_checked','species','start_percent','target_percent','elapsed_minutes','server_multiplier','interpretation','default_diet_percent','bonus_regions']];
  for (const n of state.selected) {
    if (state.hidden.time.includes(n)) continue;
    const points=new Set([...Array.from({length:101},(_,i)=>i),state.time.start,state.time.target,...state.time.regions.flatMap(r=>[r.from,r.to])]);
    for (const g of [...points].sort((a,b)=>a-b)) if (g>=state.time.start) {
      const value=elapsedMinutes(growthTimes.species[n],state.time.start,g,state.time);
      rows.push([growthTimes.checkedOn,n,state.time.start,g,value===Infinity?'Infinity':value??'',state.time.server,'bonus',state.time.bonus,JSON.stringify(state.time.regions)]);
    }
  }
  downloadCsv(rows,`evrima-growth-times-${growthTimes.checkedOn}.csv`);
});
function downloadCsv(rows,filename) {
  const csv='\uFEFF'+rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');
  a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
renderTimeRegions();changeTimeSettings();

async function start() {
  const staminaLoading=reloadStamina();
  const timeLoading=fetch('./data/growth-times.json',{signal:AbortSignal.timeout(12000)}).then(response=>{
    if(!response.ok)throw new Error('성장시간 기본 자료를 읽지 못했습니다.');return response.json();
  }).then(snapshot=>{growthTimes=validateGrowthData(snapshot);}).catch(error=>{growthLoadError=`성장시간 자료 연결 실패: ${error.message}`;});
  let initial=readCache();
  if (initial) initial.source='cache';
  else { try { initial=await bundledData(); } catch(error) { notice(`기본 데이터를 읽지 못했습니다. 원본 사이트에 연결합니다. ${error.message}`); } }
  await Promise.all([timeLoading,staminaLoading]);
  if (initial) applyData(initial);
  await refresh(undefined,false);
}
start();
