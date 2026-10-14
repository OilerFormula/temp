import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assignSpeciesColors,colorDistance,contrastRatio,DEFAULT_SPECIES_COLORS,SPECIES_COLORS} from '../chart-colors.js';
const names=Object.keys(JSON.parse(readFileSync(new URL('../data/species-0.21.784.json',import.meta.url),'utf8')));

test('every shipped species can receive a unique color visible on the dark plot',()=>{
  const assigned=assignSpeciesColors(names,DEFAULT_SPECIES_COLORS);
  assert.equal(Object.keys(assigned).length,names.length);
  assert.equal(new Set(Object.values(assigned)).size,names.length);
  for(const color of Object.values(assigned))assert.ok(contrastRatio(color)>=4.5);
  assert.ok(SPECIES_COLORS.length>=names.length);
});
test('adding and removing dinosaurs keeps the other selections stable',()=>{
  const original=assignSpeciesColors(['Carnotaurus','Ceratosaurus'],DEFAULT_SPECIES_COLORS);
  const added=assignSpeciesColors(['Carnotaurus','Ceratosaurus','Allosaurus'],original);
  for(const name of Object.keys(original))assert.equal(added[name],original[name]);
  assert.ok(colorDistance(added.Allosaurus,added.Carnotaurus)>.15);
  assert.ok(colorDistance(added.Allosaurus,added.Ceratosaurus)>.15);
  const removed=assignSpeciesColors(['Ceratosaurus','Allosaurus'],added);
  assert.deepEqual(removed,{Ceratosaurus:added.Ceratosaurus,Allosaurus:added.Allosaurus});
  assert.deepEqual(assignSpeciesColors(Object.keys(removed),removed),removed);
});
test('saved duplicate or invalid colors are repaired before rendering',()=>{
  const assigned=assignSpeciesColors(['one','two','three','four'],{one:'#f7ae70',two:'#f7ae70',three:'red;position:fixed',four:'#000000'});
  assert.equal(assigned.one,'#f7ae70');
  assert.equal(new Set(Object.values(assigned)).size,4);
  for(const color of Object.values(assigned))assert.ok(SPECIES_COLORS.includes(color));
  assert.deepEqual(assignSpeciesColors([],assigned),{});
});
