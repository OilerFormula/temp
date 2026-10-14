import { mkdir, copyFile, cp,readFile,writeFile,rm } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'dist');
await mkdir(dist,{recursive:true});
const browserFiles=['style.css','app.js','boot.js','access.js','dashboard.js','chart-controls.js','chart-colors.js','engine.js','data-source.js','growth-time.js'];
const hash=createHash('sha256');
for(const file of browserFiles)hash.update(await readFile(path.join(root,file)));
const version=hash.digest('hex').slice(0,12),assets=path.join(dist,'assets',version);
await mkdir(assets,{recursive:true});
for(const file of browserFiles) {
  await copyFile(path.join(root,file),path.join(assets,file));
  // Remove only known generated flat assets from earlier build formats.
  await rm(path.join(dist,file),{force:true});
}
const html=(await readFile(path.join(root,'index.html'),'utf8')).replace('./style.css',`./assets/${version}/style.css`).replace('./boot.js',`./assets/${version}/boot.js`);
await writeFile(path.join(dist,'index.html'),html);
for(const file of ['favicon.svg','.nojekyll'])await copyFile(path.join(root,file),path.join(dist,file));
await cp(path.join(root,'data'),path.join(dist,'data'),{recursive:true});
console.log(`Static site ready: ${dist}`);
