import {COLORS} from './engine.js';

const BACKGROUND='#1a2225';
const linear=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
const rgb=color=>[1,3,5].map(start=>linear(parseInt(color.slice(start,start+2),16)/255));
const luminance=color=>{const [r,g,b]=rgb(color);return .2126*r+.7152*g+.0722*b;};
export function contrastRatio(color,background=BACKGROUND) {
  const a=luminance(color),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
function oklab(color) {
  const [r,g,b]=rgb(color);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
export function colorDistance(a,b) {
  const left=oklab(a),right=oklab(b);return Math.hypot(...left.map((v,i)=>v-right[i]));
}
function fromLch(lightness,chroma,hue) {
  const angle=hue*Math.PI/180,a=chroma*Math.cos(angle),b=chroma*Math.sin(angle);
  const l=(lightness+.3963377774*a+.2158037573*b)**3;
  const m=(lightness-.1055613458*a-.0638541728*b)**3;
  const s=(lightness-.0894841775*a-1.291485548*b)**3;
  const channels=[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
  return '#'+channels.map(value=>{
    const bounded=Math.max(0,Math.min(1,value));
    const srgb=bounded<=.0031308?12.92*bounded:1.055*bounded**(1/2.4)-.055;
    return Math.round(srgb*255).toString(16).padStart(2,'0');
  }).join('');
}
const candidates=[...COLORS];
for(const lightness of [.66,.77,.88])for(const chroma of [.11,.18,.25])for(let hue=0;hue<360;hue+=15)candidates.push(fromLch(lightness,chroma,hue));
export const SPECIES_COLORS=Object.freeze([...new Set(candidates)].filter(color=>contrastRatio(color)>=4.5));
export const DEFAULT_SPECIES_COLORS=Object.freeze({Carnotaurus:COLORS[0],Ceratosaurus:COLORS[1]});
const palette=new Map(SPECIES_COLORS.map(color=>[color,oklab(color)]));

// Keep existing selections stable; give a new selection the largest minimum
// perceptual distance from the colors already in use.
export function assignSpeciesColors(selected,previous={}) {
  const names=[...new Set(selected)],assigned=new Map(),used=new Set();
  for(const name of names) {
    const color=previous?.[name];
    if(palette.has(color)&&!used.has(color)){assigned.set(name,color);used.add(color);}
  }
  for(const name of names) {
    if(assigned.has(name))continue;
    let best=null,bestScore=-1;
    for(const [color,lab] of palette) {
      if(used.has(color))continue;
      const score=used.size?Math.min(...[...used].map(other=>Math.hypot(...lab.map((v,i)=>v-palette.get(other)[i])))):0;
      if(score>bestScore){best=color;bestScore=score;}
    }
    if(best===null)throw new RangeError('색을 배정할 수 있는 공룡 수를 초과했습니다.');
    assigned.set(name,best);used.add(best);
  }
  return Object.fromEntries(names.map(name=>[name,assigned.get(name)]));
}
