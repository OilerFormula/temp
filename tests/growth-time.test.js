import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TIME_DEFAULTS, validateTimeSettings, validateGrowthData, elapsedMinutes, timeMultiplier, timeSamples, formatMinutes } from '../growth-time.js';

const snapshot=validateGrowthData(JSON.parse(await readFile(new URL('../data/growth-times.json',import.meta.url),'utf8')));
const settings=(overrides={})=>({...TIME_DEFAULTS,regions:[],...overrides});
// Fixed fixtures exercise known examples without preventing legitimate source updates.
const carno={stageMinutes:[40,90,120,210]};
const rex={stageMinutes:[70,613,840,610]};
const approx=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('baseline covers 21 species and excludes unreliable Austroraptor figures',()=>{
  assert.equal(Object.keys(snapshot.species).length,21);
  assert.equal(snapshot.species.Austroraptor,undefined);
  assert.equal(elapsedMinutes(carno,25,75,settings()),210);
  assert.equal(elapsedMinutes(carno,0,100,settings()),460);
});
test('diet input is always an additional bonus; legacy mode cannot change it',()=>{
  approx(elapsedMinutes(rex,25,75,settings({server:1.25,mode:'total',bonus:180})),1453/3.5);
  approx(elapsedMinutes(rex,25,75,settings({server:1.25,bonus:180})),1453/3.5);
});
test('75-100% always excludes food bonus and keeps server multiplier',()=>{
  for(const mode of ['bonus','total']) for(const bonus of [0,180,300]) {
    const config=settings({server:1.25,mode,bonus,regions:[{from:0,to:75,bonus:300}]});
    approx(elapsedMinutes(carno,75,100,config),210/1.25);
    assert.equal(timeMultiplier(75,config),1.25);
    assert.equal(timeMultiplier(87.5,config),1.25);
  }
});
test('an interval crossing 75 splits precisely at the fixed cutoff',()=>{
  const config=settings({server:2,bonus:300});
  approx(elapsedMinutes(carno,70,80,config),120*(5/25)/8+210*(5/25)/2);
  approx(elapsedMinutes(carno,25,100,config),210/8+210/2);
});
test('regions crossing species stage boundaries are integrated independently',()=>{
  const config=settings({regions:[{from:25,to:40,bonus:100},{from:40,to:60,bonus:200},{from:60,to:75,bonus:0}]});
  assert.equal(elapsedMinutes(carno,25,75,config),127);
  assert.equal(elapsedMinutes(carno,25,100,config),337);
});
test('gaps use the global setting, adjacent intervals and unordered rows work',()=>{
  const config=settings({bonus:100,regions:[{from:50,to:75,bonus:300},{from:25,to:50,bonus:0}]});
  assert.doesNotThrow(()=>validateTimeSettings(config));
  approx(elapsedMinutes(carno,0,75,config),40/2+90+120/4);
});
test('arbitrary fractional start/target and 87.5% elder checkpoint work',()=>{
  approx(elapsedMinutes(carno,30.5,44.25,settings()),90*13.75/25);
  approx(elapsedMinutes(carno,75,87.5,settings({bonus:300})),105);
  assert.equal(elapsedMinutes(carno,50,50,settings()),0);
});
test('zero diet bonus retains baseline growth, including legacy total settings',()=>{
  const config=settings({mode:'total',bonus:0});
  assert.equal(elapsedMinutes(carno,25,75,config),210);
  assert.equal(elapsedMinutes(carno,75,100,config),210);
  assert.equal(elapsedMinutes(carno,25,25,config),0);
  assert.equal(formatMinutes(Infinity),'성장 정지');
});
test('missing data and before-start samples never become zero time',()=>{
  assert.equal(elapsedMinutes(undefined,25,75,settings()),null);
  assert.equal(elapsedMinutes(carno,50,25,settings()),null);
  const points=timeSamples(carno,settings({start:30.125,regions:[{from:30.125,to:42.625,bonus:200}]}));
  assert.equal(points.find(p=>p.t===0.25).v,null);
  assert.equal(points.find(p=>p.t===0.30125).v,0);
  assert.ok(points.some(p=>p.t===0.42625));
});
test('rejects overlaps, post-75 overrides, invalid targets and nonpositive server rates',()=>{
  for(const config of [settings({server:0}),settings({server:-1}),settings({server:Infinity}),settings({bonus:301}),settings({target:20}),settings({regions:[{from:50,to:80,bonus:0}]}),settings({regions:[{from:0,to:40,bonus:0},{from:30,to:60,bonus:100}]})]) assert.throws(()=>validateTimeSettings(config));
  assert.doesNotThrow(()=>validateTimeSettings(settings({server:0.05,bonus:300,start:100,target:100})));
});
test('every profile has monotonic cumulative time and rate changes preserve additivity',()=>{
  const config=settings({server:1.25,bonus:180,regions:[{from:35,to:63,bonus:270}]});
  for(const profile of Object.values(snapshot.species)) {
    const points=timeSamples(profile,config).filter(p=>p.v!=null);
    for(let i=1;i<points.length;i++) assert.ok(points[i].v>=points[i-1].v);
    approx(elapsedMinutes(profile,25,100,config),elapsedMinutes(profile,25,75,config)+elapsedMinutes(profile,75,100,config));
  }
});
test('invalid growth snapshot fails validation instead of fabricating durations',()=>{
  assert.throws(()=>validateGrowthData({schemaVersion:1,checkedOn:'2026-10-12',species:{Test:{stageMinutes:[1,2,3,-1],source:'https://www.evrimaquickguide.com/test'}}}));
  assert.equal(formatMinutes(0),'0분');
  assert.equal(formatMinutes(0.2),'1분 미만');
  assert.equal(formatMinutes(646),'10시간 46분');
});
