export const GROWTH_STOPS=[0,25,50,75,87.5,100];
export function pointerGrowth(clientX,clientY,bounds,model) {
  if (!model || bounds.width<=0 || bounds.height<=0) return null;
  const x=(clientX-bounds.left)/bounds.width*model.W;
  const y=(clientY-bounds.top)/bounds.height*model.H;
  if(x<model.left || x>model.left+model.width || y<model.top || y>model.top+model.height) return null;
  return Math.round((x-model.left)/model.width*100000)/1000;
}
export function reorderPanel(order,panel,target) {
  if(!order.includes(panel)||!order.includes(target)||panel===target||panel==='settings'||target==='settings')return [...order];
  const result=order.filter(id=>id!==panel);result.splice(result.indexOf(target),0,panel);return result;
}
export function normalizeOrder(value,keys) {
  const order=[...new Set([...(Array.isArray(value)?value.filter(id=>keys.includes(id)):[]),...keys])];
  return keys.includes('settings')?['settings',...order.filter(id=>id!=='settings')]:order;
}
export function synchronizedGrowth(value,keys) {
  const growth=Number(value);
  if(!Number.isFinite(growth)||growth<0||growth>100)throw new RangeError('성장치는 0~100%입니다.');
  return Object.fromEntries(keys.map(id=>[id,growth]));
}
