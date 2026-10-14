import { verifyPassword,validateAccessConfig } from './access.js';
const gate=document.getElementById('access-gate'),workspace=document.getElementById('workspace');
const form=document.getElementById('access-form'),input=document.getElementById('access-password');
const status=document.getElementById('access-status'),submit=document.getElementById('access-submit');
let config,loaded=false;
async function unlock() {
  if (!loaded) {await import('./app.js');loaded=true;}
  gate.hidden=true;workspace.hidden=false;
  window.dispatchEvent(new Event('resize'));
  document.getElementById('lock-site').focus();
}
function lock() {
  try {sessionStorage.removeItem('evrima-access-v1');} catch {}
  workspace.hidden=true;gate.hidden=false;input.value='';status.textContent='';input.focus();
  document.dispatchEvent(new Event('site-lock'));
}
document.getElementById('lock-site').addEventListener('click',lock);
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!config)return;
  submit.disabled=true;status.textContent='확인 중…';
  try {
    if (!await verifyPassword(input.value,config)) {status.textContent='비밀번호가 맞지 않습니다.';input.select();return;}
    input.value='';try {sessionStorage.setItem('evrima-access-v1',config.digest);} catch {}
    await unlock();status.textContent='';
  } catch {status.textContent='화면을 열지 못했습니다. 새로고침해 주세요.';}
  finally {submit.disabled=false;}
});
try {
  const response=await fetch('./data/access.json',{cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Missing access config');config=validateAccessConfig(await response.json());
  submit.disabled=false;
  let remembered=false;try {remembered=sessionStorage.getItem('evrima-access-v1')===config.digest;} catch {}
  if(remembered)await unlock();else input.focus();
} catch {status.textContent='잠금 설정을 불러오지 못했습니다. 새로고침해 주세요.';}
