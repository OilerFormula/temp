import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { liveData, saveCache, readCache } from '../data-source.js';
const species=JSON.parse(fs.readFileSync(new URL('../data/species-0.21.784.json',import.meta.url),'utf8'));
const store=new Map();
globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
const index={latest:'0.22.0',versions:[{id:'0.22.0',extracted:'2026-10-11'}]};
let abilityFailure=false, offline=false, broken=false;
globalThis.fetch=async url=> {
  if(offline) throw new Error('network unavailable');
  let value;
  if(url.endsWith('/data/index.json')) value=index;
  else if(url.endsWith('/species.json')) value=broken?{bad:{}}:species;
  else if(url.endsWith('/foods.json')) value={};
  else if(url.endsWith('/assets/new-hash.js')) {
    if(abilityFailure) throw new Error('bundle unavailable');
    value='const randomVariable={Carnotaurus:{label:"Charge",multiplier:1.3,staminaPerSec:-.7,verified:!0}};';
  } else value='<script type="module" crossorigin src="/assets/new-hash.js"></script>';
  return {ok:true,text:async()=>value,json:async()=>value};
};
test('fetch follows latest version and the current hashed script path',async()=>{
  const next=await liveData();
  assert.equal(next.version,'0.22.0');assert.equal(next.abilities.Carnotaurus.multiplier,1.3);
  assert.equal(next.abilitySource,'https://evrima-viewer.com/assets/new-hash.js');
  assert.equal(next.abilityWarning,null);assert.ok(saveCache(next));
});
test('offline network failure leaves the last successful cache intact',async()=>{
  offline=true;
  await assert.rejects(liveData(),/network unavailable/);
  assert.equal(readCache().version,'0.22.0');assert.equal(readCache().abilities.Carnotaurus.multiplier,1.3);
  offline=false;
});
test('ability download failure uses same-version cache with an explicit warning',async()=>{
  abilityFailure=true;
  const next=await liveData();assert.equal(next.abilities.Carnotaurus.multiplier,1.3);
  assert.match(next.abilityWarning,/저장된/);abilityFailure=false;
});
test('ability constants from a different version are never silently reused',async()=>{
  abilityFailure=true;index.latest='0.23.0';index.versions=[{id:'0.23.0'}];
  const next=await liveData();assert.deepEqual(next.abilities,{});assert.match(next.abilityWarning,/자료 없음/);
  abilityFailure=false;
});
test('changed upstream schema rejects the update without replacing cache',async()=>{
  broken=true;await assert.rejects(liveData(),/형식/);assert.equal(readCache().version,'0.22.0');broken=false;
});
