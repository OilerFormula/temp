// A browser-side visit gate, not server-side access control.
export async function passwordDigest(password,config,cryptoApi=globalThis.crypto) {
  const key=await cryptoApi.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const salt=Uint8Array.from(config.salt.match(/../g),byte=>parseInt(byte,16));
  const bits=await cryptoApi.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:config.iterations},key,256);
  return Array.from(new Uint8Array(bits),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function validateAccessConfig(config) {
  if (config?.version!==1 || config.algorithm!=='PBKDF2-SHA256' || !/^[a-f0-9]{32}$/.test(config.salt??'') || !/^[a-f0-9]{64}$/.test(config.digest??'') || !Number.isInteger(config.iterations) || config.iterations<100000 || config.iterations>2000000) throw new Error('잠금 설정을 확인하세요.');
  return config;
}
export async function verifyPassword(password,config,cryptoApi=globalThis.crypto) {
  validateAccessConfig(config);
  return (await passwordDigest(password,config,cryptoApi))===config.digest;
}
