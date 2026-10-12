import { mkdir, copyFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'dist');
await mkdir(dist,{recursive:true});
for(const file of ['index.html','style.css','app.js','engine.js','data-source.js','growth-time.js','favicon.svg','.nojekyll']) await copyFile(path.join(root,file),path.join(dist,file));
await cp(path.join(root,'data'),path.join(dist,'data'),{recursive:true});
console.log(`Static site ready: ${dist}`);
