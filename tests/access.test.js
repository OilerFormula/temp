import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {verifyPassword,validateAccessConfig} from '../access.js';
const salt='0123456789abcdef0123456789abcdef';
const config={version:1,algorithm:'PBKDF2-SHA256',iterations:100000,salt,digest:pbkdf2Sync('test-only-password',Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex')};
test('password verifier accepts the right password and rejects a wrong/empty password',async()=>{
  assert.equal(await verifyPassword('test-only-password',config),true);
  assert.equal(await verifyPassword('wrong-password',config),false);
  assert.equal(await verifyPassword('',config),false);
});
test('broken lock config fails closed before session matching or verification',()=>{
  for(const value of [null,{}, {...config,digest:null},{...config,salt:'bad'},{...config,iterations:0}])assert.throws(()=>validateAccessConfig(value));
});
