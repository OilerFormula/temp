import test from 'node:test';
import assert from 'node:assert/strict';
import {GROWTH_STOPS,pointerGrowth,reorderPanel,normalizeOrder,synchronizedGrowth} from '../chart-controls.js';
const model={W:900,H:310,left:65,width:800,top:26,height:238};
const bounds={left:100,top:50,width:450,height:155};
test('pointer maps scaled SVG coordinates into exact percentage and rejects axes',()=>{
  assert.equal(pointerGrowth(132.5,100,bounds,model),0);
  assert.equal(pointerGrowth(332.5,100,bounds,model),50);
  assert.equal(pointerGrowth(532.5,100,bounds,model),100);
  assert.equal(pointerGrowth(120,100,bounds,model),null);
  assert.equal(pointerGrowth(332.5,190,bounds,model),null);
  assert.equal(pointerGrowth(332.5,55,bounds,model),null);
});
test('all six stage buttons retain the exact elder peak',()=>assert.deepEqual(GROWTH_STOPS,[0,25,50,75,87.5,100]));
test('saved layout order repairs duplicates and unknown panels without losing cards',()=>{
  assert.deepEqual(normalizeOrder(['weight','missing','weight','time'],['settings','time','weight','speed','attack','snapshot']),['settings','weight','time','speed','attack','snapshot']);
  assert.deepEqual(reorderPanel(['time','weight','speed'],'speed','time'),['speed','time','weight']);
});
test('settings cannot be moved or displaced by another panel',()=>{
  const order=['settings','time','weight','speed'];
  assert.deepEqual(reorderPanel(order,'settings','weight'),order);
  assert.deepEqual(reorderPanel(order,'weight','settings'),order);
  assert.deepEqual(reorderPanel(order,'speed','time'),['settings','speed','time','weight']);
});
test('shared selection preserves fractional values and stage checkpoints across every graph',()=>{
  const keys=['time','weight','speed','attack'];
  for(const value of [...GROWTH_STOPS,42.137]) {
    assert.deepEqual(Object.values(synchronizedGrowth(String(value),keys)),keys.map(()=>value));
  }
  for(const value of [-1,101,NaN,Infinity,'bad'])assert.throws(()=>synchronizedGrowth(value,keys),RangeError);
});
