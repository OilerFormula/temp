import { validateIndex, validateSpecies, extractAbilities } from './engine.js';
export const SOURCE = 'https://evrima-viewer.com';
const CACHE_KEY = 'evrima-compare-data-v1';
export async function request(url, asText = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
    if (!response.ok) throw new Error(`데이터 요청 실패 (${response.status})`);
    return asText ? await response.text() : await response.json();
  } finally { clearTimeout(timer); }
}
export function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!cached) return null;
    validateIndex(cached.index);
    validateSpecies(cached.species);
    if (!cached.index.versions.some(v => v.id === cached.version)) return null;
    return cached;
  } catch { return null; }
}
export function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}
export async function bundledData() {
  const index = validateIndex(await request('./data/index.json'));
  const version = index.latest;
  const [species, abilityFile, foods] = await Promise.all([
    request(`./data/species-${version}.json`), request(`./data/abilities-${version}.json`), request(`./data/foods-${version}.json`).catch(() => ({}))
  ]);
  return { index, version, species: validateSpecies(species), abilities: abilityFile.species ?? {}, abilitySource: abilityFile.source, foods, source: 'bundled', fetchedAt: null, abilityWarning: null };
}
export async function liveData(versionId, onProgress = () => {}) {
  onProgress('버전 목록 확인 중…');
  const index = validateIndex(await request(`${SOURCE}/data/index.json`));
  const version = versionId ?? index.latest;
  if (!index.versions.some(v => v.id === version)) throw new Error('사이트에서 해당 버전을 제공하지 않습니다.');
  onProgress(`${version} 공룡 데이터 수신 중…`);
  const [species, foods] = await Promise.all([
    request(`${SOURCE}/data/v/${version}/species.json`), request(`${SOURCE}/data/v/${version}/foods.json`).catch(() => ({}))
  ]);
  validateSpecies(species);
  let abilities = {}, abilitySource = null, abilityWarning = null;
  if (version === index.latest) {
    try {
      onProgress('차징·특수능력 정보 확인 중…');
      const html = await request(`${SOURCE}/`, true);
      const scriptPath = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/g;
      let match;
      while ((match = scriptPath.exec(html))) {
        const url = new URL(match[1], SOURCE);
        if (url.origin === SOURCE && url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js')) { abilitySource = url.href; break; }
      }
      if (!abilitySource) throw new Error('사이트 스크립트를 찾지 못했습니다.');
      abilities = extractAbilities(await request(abilitySource, true), Object.keys(species));
      if (!Object.keys(abilities).length) throw new Error('특수능력 데이터 구조가 변경되었습니다.');
    } catch (error) {
      const cached = readCache();
      if (cached?.version === version && Object.keys(cached.abilities ?? {}).length) {
        abilities = cached.abilities;
        abilitySource = cached.abilitySource;
        abilityWarning = '특수능력 갱신 실패: 이 버전의 저장된 보정값을 사용 중입니다.';
      } else {
        abilityWarning = '특수능력 갱신 실패: 차징·Ambush는 자료 없음으로 표시합니다.';
      }
    }
  } else {
    const cached = readCache();
    if (cached?.version === version) { abilities = cached.abilities ?? {}; abilitySource = cached.abilitySource; }
    else abilityWarning = '과거 버전의 특수능력 보정값은 제공되지 않아 제외했습니다.';
  }
  return { index, version, species, abilities, abilitySource, abilityWarning, foods, source: 'live', fetchedAt: new Date().toISOString() };
}
