export const TIME_DEFAULTS = { server:1, mode:'bonus', bonus:0, start:25, target:75, regions:[] };
export const TIME_BOUNDARIES = [0,25,50,75,100];

export function validateTimeSettings(settings) {
  if (!Number.isFinite(settings.server) || settings.server <= 0) throw new Error('서버 성장 배율은 0보다 커야 합니다.');
  if (!['bonus','total'].includes(settings.mode)) throw new Error('성장률 해석을 선택하세요.');
  if (!Number.isFinite(settings.bonus) || settings.bonus < 0 || settings.bonus > 300) throw new Error('식성 값은 0~300%로 입력하세요.');
  if (![settings.start,settings.target].every(v=>Number.isFinite(v) && v>=0 && v<=100) || settings.target < settings.start) throw new Error('시작·목표 성장률은 0~100%, 목표는 시작 이상이어야 합니다.');
  if (!Array.isArray(settings.regions)) throw new Error('구간 설정을 확인하세요.');
  const sorted = [...settings.regions].sort((a,b)=>a.from-b.from);
  for (let i=0;i<sorted.length;i++) {
    const row=sorted[i];
    if (![row.from,row.to,row.bonus].every(Number.isFinite) || row.from < 0 || row.to > 75 || row.from >= row.to) throw new Error('보너스 구간은 0~75% 안에서 시작보다 끝이 커야 합니다.');
    if (row.bonus < 0 || row.bonus > 300) throw new Error('구간별 식성 값은 0~300%로 입력하세요.');
    if (i && row.from < sorted[i-1].to) throw new Error('보너스 구간이 겹칩니다. 경계를 조정하세요.');
  }
  return settings;
}

export function validateGrowthData(snapshot) {
  if (snapshot?.schemaVersion !== 1 || !snapshot.species || typeof snapshot.checkedOn !== 'string') throw new Error('성장시간 자료 형식이 올바르지 않습니다.');
  for (const [name,profile] of Object.entries(snapshot.species)) {
    if (!Array.isArray(profile.stageMinutes) || profile.stageMinutes.length !== 4 || !profile.stageMinutes.every(v=>Number.isFinite(v)&&v>0)) throw new Error(`${name}: 단계별 성장시간이 올바르지 않습니다.`);
    if (!profile.source?.startsWith('https://www.evrimaquickguide.com/')) throw new Error(`${name}: 성장시간 출처를 확인하세요.`);
  }
  return snapshot;
}

export function timeMultiplier(growthPercent, settings) {
  if (growthPercent >= 75) return settings.server;
  const region=settings.regions.find(row=>growthPercent>=row.from && growthPercent<row.to);
  const value=region?.bonus ?? settings.bonus;
  return settings.server * (settings.mode==='bonus' ? 1+value/100 : value/100);
}

// Integrate every crossed stage and bonus boundary; the 75% cutoff is unconditional.
export function elapsedMinutes(profile, from, to, settings) {
  if (!profile?.stageMinutes || !Number.isFinite(from) || !Number.isFinite(to) || from<0 || to>100 || to<from) return null;
  if (from===to) return 0;
  const cuts=[...new Set([from,to,...TIME_BOUNDARIES,...settings.regions.flatMap(r=>[r.from,r.to])])].filter(v=>v>=from&&v<=to).sort((a,b)=>a-b);
  let result=0;
  for (let i=1;i<cuts.length;i++) {
    const left=cuts[i-1],right=cuts[i],mid=(left+right)/2;
    const stage=Math.min(3,Math.floor(mid/25));
    const multiplier=timeMultiplier(mid,settings);
    if (multiplier===0) return Infinity;
    const value=profile.stageMinutes[stage];
    if (!Number.isFinite(value) || value<=0 || !Number.isFinite(multiplier) || multiplier<0) return null;
    result += value*(right-left)/25/multiplier;
  }
  return result;
}

export function timeSamples(profile, settings) {
  const cuts=new Set([...Array.from({length:401},(_,i)=>i/4),settings.start,settings.target,...settings.regions.flatMap(r=>[r.from,r.to])]);
  return [...cuts].sort((a,b)=>a-b).map(g=>({t:g/100,v:g<settings.start?null:elapsedMinutes(profile,settings.start,g,settings)}));
}

export function formatMinutes(minutes) {
  if (minutes===Infinity) return '성장 정지';
  if (minutes==null || !Number.isFinite(minutes)) return '자료 없음';
  if (minutes===0) return '0분';
  if (minutes<1) return '1분 미만';
  const rounded=Math.round(minutes),hours=Math.floor(rounded/60),rest=rounded%60;
  return hours ? `${hours}시간${rest?' '+rest+'분':''}` : `${rounded}분`;
}
