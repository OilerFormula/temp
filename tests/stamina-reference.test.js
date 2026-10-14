import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateStaminaReference,restMultiplier,formatReferenceTime,formatReferenceSeconds,referenceDurations,STAMINA_SOURCES} from '../stamina-reference.js';
const snapshot=JSON.parse(await readFile(new URL('../data/stamina-reference.json',import.meta.url),'utf8'));

test('published stamina snapshot contains complete integer samples and explicit limitations',()=>{
  assert.equal(validateStaminaReference(snapshot),snapshot);
  assert.deepEqual(snapshot.sources,STAMINA_SOURCES);
  assert.equal(snapshot.growthSpecific,false);
  assert.equal(snapshot.totalStaminaAvailable,false);
  for(const profile of Object.values(snapshot.species)) {
    assert.equal(profile.rest.samples.length,snapshot.maxSeconds+1);
    assert.ok(Math.abs(restMultiplier(profile,profile.rest.fullAt)-profile.rest.maximum)<.02);
  }
});
test('rest lookup uses original samples and does not invent fractional or absent values',()=>{
  const profile={rest:{samples:[1,.99998,1.3,3]}};
  assert.equal(restMultiplier(profile,1),.99998);
  assert.equal(restMultiplier(profile,2),1.3);
  for(const value of [-1,1.5,4,NaN,Infinity,'2'])assert.equal(restMultiplier(profile,value),null);
  assert.equal(restMultiplier(null,2),null);
});
test('reference times preserve separate movement and resting conditions',()=>{
  assert.equal(formatReferenceTime('2:05m'),'2분 5초');
  assert.equal(formatReferenceTime('3m'),'3분');
  assert.equal(formatReferenceTime('0:15m(land)1m(water)'),'0분 15초 (육상) / 1분 (수중)');
  assert.equal(formatReferenceTime('3:20m(Quad)2:35m(Biped)'),'3분 20초 (사족) / 2분 35초 (이족)');
  assert.equal(formatReferenceTime('3:10m(5:20mLatched)'),'3분 10초 / 5분 20초 (매달림)');
  for(const value of [null,'3:60m','2m<script>','junk3m'])assert.equal(formatReferenceTime(value),'자료 없음');
});
test('snapshot validation rejects misleading units, invented growth data and damaged curves',()=>{
  const first=Object.keys(snapshot.species)[0];
  for(const mutate of [
    d=>d.unit='%/s',d=>d.growthSpecific=true,d=>d.totalStaminaAvailable=true,
    d=>d.sources.rest='https://unrelated.example/data.json',
    d=>d.species[first].rest.samples.pop(),d=>d.species[first].rest.samples[0]=NaN,
    d=>d.species[first].regeneration.standing=-1,
    d=>d.species[first].rest.fullAt=1.5,
    d=>d.species[first].timing.resting=['3m'],
    d=>d.species[first].timing.duration='4:60m'
  ]) {
    const invalid=structuredClone(snapshot);mutate(invalid);assert.throws(()=>validateStaminaReference(invalid));
  }
});
test('seconds conversion preserves durations and distinct movement conditions',()=>{
  assert.equal(formatReferenceSeconds('2:20m'),'140초');
  assert.equal(formatReferenceSeconds('3:10m'),'190초');
  assert.deepEqual(referenceDurations('0:15m(land)1m(water)'),[{seconds:15,condition:'land'},{seconds:60,condition:'water'}]);
  assert.equal(formatReferenceSeconds('3:10m(5:20mLatched)'),'190초 / 320초 (매달림)');
  for(const value of [null,'2:60m','bad']) {
    assert.equal(referenceDurations(value),null);
    assert.equal(formatReferenceSeconds(value),'자료 없음');
  }
});
test('missing timing data remains unavailable while valid zero recovery remains zero',()=>{
  const data=structuredClone(snapshot),name=Object.keys(data.species)[0];
  data.species[name].timing=null;data.species[name].regeneration.standing=0;
  assert.equal(validateStaminaReference(data).species[name].timing,null);
  assert.equal(data.species[name].regeneration.standing,0);
});
