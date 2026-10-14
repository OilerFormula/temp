export const RECOVERY_STATES=['standing','walking','trotting','resting'];
export const STAMINA_SOURCES={
  regeneration:'https://myislemap.com/assets/charts/stamina-regeneration.json',
  rest:'https://myislemap.com/assets/charts/rest-multiplier-time.json',
  timings:'https://www.evrimaquickguide.com/gameplay/health-statuses/stamina'
};
const finite=(value,low,high)=>typeof value==='number'&&Number.isFinite(value)&&value>=low&&value<=high;
const TIME_PATTERN=/^(?:\d+(?::[0-5]?\d)?m(?:\([A-Za-z]+\))?)+$/;
const normalizedTime=value=>typeof value==='string'?value.replace(/\((\d+(?::\d{1,2})?m)([A-Za-z]+)\)/g,'$1($2)'):'';
const validTime=value=>typeof value==='string'&&value.length<=120&&TIME_PATTERN.test(normalizedTime(value));

export function validateStaminaReference(snapshot) {
  const fail=()=>{throw new Error('스태미나 자료 형식을 확인할 수 없습니다.');};
  if(!snapshot||snapshot.schema!==1||snapshot.sourceName!=='MyIsleMap'||snapshot.unit!=='configured-value'||snapshot.growthSpecific!==false||snapshot.totalStaminaAvailable!==false||snapshot.timingGrowth!==null||typeof snapshot.timingSourceUpdating!=='boolean'||!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.checkedOn))fail();
  for(const [key,url] of Object.entries(STAMINA_SOURCES))if(snapshot.sources?.[key]!==url)fail();
  if(!Number.isInteger(snapshot.maxSeconds)||!finite(snapshot.maxSeconds,1,3600)||!snapshot.species||Array.isArray(snapshot.species)||Object.keys(snapshot.species).length<20)fail();
  for(const [name,profile] of Object.entries(snapshot.species)) {
    if(!/^[A-Z][A-Za-z]{1,63}$/.test(name)||!profile?.regeneration||!profile.rest)fail();
    if(Object.keys(profile.regeneration).length!==4||!RECOVERY_STATES.every(key=>finite(profile.regeneration[key],0,1000)))fail();
    const rest=profile.rest;
    if(!finite(rest.maximum,1,100)||!Number.isInteger(rest.fullAt)||!finite(rest.fullAt,0,snapshot.maxSeconds)||!Array.isArray(rest.samples)||rest.samples.length!==snapshot.maxSeconds+1||!rest.samples.every(value=>finite(value,.8,rest.maximum+.02))||Math.abs(rest.samples[rest.fullAt]-rest.maximum)>.02)fail();
    if(profile.timing!==null) {
      const timing=profile.timing;
      if(!timing||!validTime(timing.duration))fail();
      for(const key of RECOVERY_STATES)if(!Array.isArray(timing[key])||timing[key].length!==2||!timing[key].every(validTime))fail();
    }
  }
  return snapshot;
}

export function restMultiplier(profile,seconds) {
  if(!profile||!Number.isInteger(seconds)||seconds<0||seconds>=profile.rest.samples.length)return null;
  return profile.rest.samples[seconds];
}

export function formatReferenceTime(value) {
  if(!validTime(value))return '자료 없음';
  const labels={land:'육상',water:'수중',Quad:'사족',Biped:'이족',Latched:'매달림'};
  return [...normalizedTime(value).matchAll(/(\d+)(?::(\d{1,2}))?m(?:\(([A-Za-z]+)\))?/g)].map(([,minutes,seconds,label])=>`${Number(minutes)}분${Number(seconds)?` ${Number(seconds)}초`:''}${label?` (${labels[label]??label})`:''}`).join(' / ');
}

export async function loadStaminaReference() {
  const response=await fetch('./data/stamina-reference.json',{cache:'no-cache',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('스태미나 자료를 읽지 못했습니다.');
  return validateStaminaReference(await response.json());
}
