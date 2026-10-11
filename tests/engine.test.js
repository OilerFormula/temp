import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { interpolate, cubic, stats, curve, metricValue, extractAbilities, validateSpecies, validateIndex, samplePoints } from '../engine.js';
const species = JSON.parse(fs.readFileSync(new URL('../data/species-0.21.784.json', import.meta.url), 'utf8'));
const abilities = JSON.parse(fs.readFileSync(new URL('../data/abilities-0.21.784.json', import.meta.url), 'utf8')).species;
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('downloaded dataset validates and has 22 released and 4 unreleased species', () => {
  assert.equal(Object.keys(validateSpecies(species)).length, 26);
  assert.equal(Object.values(species).filter(s => s.released).length, 22);
});
test('reproduces the user screenshot and charging tooltip at 55.509%', () => {
  const s = stats(species.Carnotaurus, abilities.Carnotaurus, .55509);
  close(s.weight, 832.216);close(s.sprint, 47.7519552);close(s.bite,85.56677142857143);close(s.boosted,57.30234624);close(s.stamina,-.78);
  close(s.attacks.AltBite,99.8279);
});
test('missing curves, empty keys and absent damage stay null, not zero', () => {
  assert.equal(interpolate([], .5), null);
  assert.equal(stats({ curves:{} },null,.5).bite,null);
  assert.equal(metricValue(species.Baryonyx,null,'bite',.5,'prime'),null);
});
test('curve edges clamp to first and last keys', () => {
  const keys=[{t:.25,v:10},{t:.75,v:30}];
  assert.equal(interpolate(keys,0),10);assert.equal(interpolate(keys,1),30);assert.equal(interpolate(keys,.5),20);
});
test('Hermite tangents affect interior values', () => {
  close(interpolate([{t:0,v:0,c:1,lt:4},{t:1,v:2,at:0}],.5),1.5);
  // Independent reference point computed from the original Tyrannosaurus keys.
  close(curve(species.Tyrannosaurus,'SprintSpeed',.375,'prime'),(792+1591.2)/2+(4428-912.1149)*.15/8);
});
test('weighted Bezier interpolation inverts the time axis', () => {
  // Horizontal handles at x=.1 and x=.6; choose a known Bezier parameter .4.
  const t=cubic(0,.1,.6,1,.4), expected=cubic(0,0,1,1,.4);
  close(interpolate([{t:0,v:0,c:1,w:2,lw:.1},{t:1,v:1,w:1,aw:.4}],t),expected);
});
test('before adulthood the viewer uses frail regardless of the selected path', () => {
  const s={curves:{Weight:{frail:[{t:0,v:1},{t:1,v:3}],prime:[{t:0,v:100},{t:1,v:200}]}}};
  close(curve(s,'Weight',.5,'prime'),2);close(curve(s,'Weight',.75,'prime'),175);
});
test('Prime and Frail differ at the 87.5% peak', () => {
  close(stats(species.Carnotaurus,null,.875,'prime').weight,1800);
  close(stats(species.Carnotaurus,null,.875,'frail').weight,1300);
});
test('Ambush is locked before SubAdult', () => {
  assert.equal(stats(species.Tyrannosaurus,abilities.Tyrannosaurus,.499).boosted,null);
  const s=stats(species.Tyrannosaurus,abilities.Tyrannosaurus,.5);
  close(s.boosted,s.sprint*1.2);assert.equal(s.stamina,null);
});
test('Gallimimus nutrients, Mobilize and flocking use separate additive formulas', () => {
  const s=stats(species.Gallimimus,null,.875,'prime',2,80);
  close(s.nutrients[3]-s.sprint,8.64);close(s.nutrients[2]-s.sprint,5.76);
  close(s.mobilize-s.nutrients[2],14.4);
  close(s.flock,s.nutrients[2]+(80-s.nutrients[2])*.666667);
  assert.equal(stats(species.Gallimimus,null,.875,'prime',3,80).flock,null);
});
test('attack names with dots remain available', () => {
  const s=stats(species.Allosaurus,null,.75);
  close(metricValue(species.Allosaurus,null,'attack:Pounce.LatchLoop',.75,'prime'),s.power*35);
});
test('curve sampling preserves exact keys and ability unlock boundaries', () => {
  const points=samplePoints(species.Tyrannosaurus,abilities.Tyrannosaurus,'boosted','prime');
  assert.ok(points.some(p=>p.t===.5 && p.v!=null));assert.ok(points.some(p=>p.t===.499999 && p.v===null));
  assert.ok(points.some(p=>p.t===.45));
});
test('extract ability constants from changing bundle names without executing source', () => {
  const source='const changedName={Carnotaurus:{label:"Charge",multiplier:1.25,verified:!0,staminaPerSec:-.8,trigger:"run {fast}"},Tyrannosaurus:{label:"Ambush",multiplier:1.2,durationSec:15,minStage:"SubAdult"}};throw new Error("must never run");';
  const a=extractAbilities(source,['Carnotaurus','Tyrannosaurus']);
  assert.equal(a.Carnotaurus.multiplier,1.25);assert.equal(a.Carnotaurus.staminaPerSec,-.8);assert.equal(a.Carnotaurus.trigger,'run {fast}');assert.equal(a.Tyrannosaurus.minStage,'SubAdult');
});
test('invalid or changed upstream schemas are rejected before replacing good data', () => {
  assert.throws(()=>validateIndex({latest:'../../bad',versions:[{id:'../../bad'}]}));
  assert.throws(()=>validateIndex({latest:'..',versions:[{id:'..'}]}));
  assert.throws(()=>validateIndex({latest:'x',versions:[{id:'y'}]}));
  assert.throws(()=>validateSpecies({Carnotaurus:{curves:{Weight:{frail:[{t:0,v:'bad'}],prime:[]}}}}));
  assert.throws(()=>validateSpecies({Carnotaurus:{curves:{Weight:{frail:[{t:.5,v:1},{t:.2,v:2}],prime:[]}}}}));
});
test('all shipped curve samples are finite or intentionally missing', () => {
  for(const [name,s] of Object.entries(species)) for(const path of ['prime','frail']) for(const metric of ['weight','sprint','bite','boosted']) for(let i=0;i<=100;i++) {
    const v=metricValue(s,abilities[name],metric,i/100,path);
    assert.ok(v===null || Number.isFinite(v),`${name} ${path} ${metric} ${i}`);
  }
});
