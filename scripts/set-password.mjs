import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
// Read stdin only; never put the plaintext password in an argument or output file.
process.stdout.write('Password input on stdin (hidden): ');
const password=await new Promise((resolve,reject)=>{
  let value='';process.stdin.resume();if(process.stdin.isTTY)process.stdin.setRawMode(true);
  process.stdin.on('data',buffer=>{
    for(const ch of buffer.toString()) {
      if(ch==='\r'||ch==='\n'){if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();resolve(value);return;}
      if(ch==='\u0003')process.exit(130);
      if(ch==='\b'||ch==='\u007f')value=value.slice(0,-1);else value+=ch;
    }
  });
  process.stdin.on('end',()=>reject(new Error('No password input received')));
});
if (!password) throw new Error('Password must not be empty');
const salt=randomBytes(16),iterations=600000;
const digest=pbkdf2Sync(password,salt,iterations,32,'sha256').toString('hex');
await writeFile(new URL('../data/access.json',import.meta.url),JSON.stringify({version:1,algorithm:'PBKDF2-SHA256',iterations,salt:salt.toString('hex'),digest},null,2)+'\n');
process.stdout.write('Password verifier saved. Plaintext was not saved.\n',()=>process.exit(0));
