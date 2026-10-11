import { writeFile } from 'node:fs/promises';
import { liveData } from '../data-source.js';
const data=await liveData(undefined,message=>console.log(message));
if(data.abilityWarning) throw new Error(data.abilityWarning+' 기존 포함 데이터는 변경하지 않았습니다.');
const directory=new URL('../data/',import.meta.url);
const files={
  [`species-${data.version}.json`]:data.species,
  [`foods-${data.version}.json`]:data.foods,
  [`abilities-${data.version}.json`]:{source:data.abilitySource,checkedDate:data.fetchedAt.slice(0,10),note:'Read as scalar constants; source JavaScript was not executed.',species:data.abilities}
};
for(const [name,value] of Object.entries(files)) await writeFile(new URL(name,directory),JSON.stringify(value,null,2)+'\n');
// Index is written last, so it only references complete data files.
await writeFile(new URL('index.json',directory),JSON.stringify(data.index,null,2)+'\n');
console.log(`Bundled snapshot updated: ${data.version} (${Object.keys(data.species).length} species)`);
