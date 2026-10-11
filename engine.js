// Growth curves use the same linear, Hermite and weighted-tangent rules as the source viewer.
export const KMH = 0.036;
export const STAGES = { Hatchling: 0, Juvenile: 0.25, SubAdult: 0.5, Adult: 0.75 };
export const COLORS = ['#f7ae70', '#7dd9b8', '#8aaeff', '#d3a0f3', '#f1d579', '#f18ca3', '#6dcde3', '#a8c97b', '#bdab91', '#b7bbff', '#fdcaad', '#91e8dd'];
export function cubic(a, b, c, d, t) {
  const s = 1 - t;
  return s ** 3 * a + 3 * s ** 2 * t * b + 3 * s * t ** 2 * c + t ** 3 * d;
}
function weighted(left, right, growth) {
  const width = right.t - left.t;
  const target = (growth - left.t) / width;
  const outSlope = left.lt ?? 0;
  const inSlope = right.at ?? 0;
  const outLength = [2, 3].includes(left.w) ? (left.lw ?? 0) : Math.hypot(width, outSlope * width) / 3;
  const inLength = [1, 3].includes(right.w) ? (right.aw ?? 0) : Math.hypot(width, inSlope * width) / 3;
  const outAngle = Math.atan(outSlope);
  const inAngle = Math.atan(inSlope);
  const x1 = Math.cos(outAngle) * outLength / width;
  const x2 = 1 - Math.cos(inAngle) * inLength / width;
  const y1 = left.v + Math.sin(outAngle) * outLength;
  const y2 = right.v - Math.sin(inAngle) * inLength;
  let low = 0, high = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (cubic(0, x1, x2, 1, mid) < target) low = mid;
    else high = mid;
  }
  return cubic(left.v, y1, y2, right.v, (low + high) / 2);
}
export function interpolate(keys, growth) {
  if (!keys?.length || !Number.isFinite(growth)) return null;
  if (growth <= keys[0].t) return keys[0].v;
  if (growth >= keys.at(-1).t) return keys.at(-1).v;
  for (let i = 0; i < keys.length - 1; i++) {
    const left = keys[i], right = keys[i + 1];
    if (growth < left.t || growth > right.t) continue;
    const width = right.t - left.t;
    if (width <= 0) return left.v;
    const t = (growth - left.t) / width;
    if (!left.c) return left.v + (right.v - left.v) * t;
    if (left.w || right.w) return weighted(left, right, growth);
    return (2 * t ** 3 - 3 * t ** 2 + 1) * left.v
      + (t ** 3 - 2 * t ** 2 + t) * (left.lt ?? 0) * width
      + (-2 * t ** 3 + 3 * t ** 2) * right.v
      + (t ** 3 - t ** 2) * (right.at ?? 0) * width;
  }
  return null;
}
export function curve(species, name, growth, path = 'prime') {
  const active = growth < 0.75 ? 'frail' : path;
  return interpolate(species.curves?.[name]?.[active], growth);
}
export function stats(species, ability, growth, path = 'prime', nutrients = 3, leaderSpeed = null) {
  const weight = curve(species, 'Weight', growth, path);
  const sprint = curve(species, 'SprintSpeed', growth, path);
  const power = curve(species, 'AttackPower', growth, path);
  const unlocked = ability && growth >= (STAGES[ability.minStage] ?? 0);
  const attacks = Object.fromEntries(Object.entries(species.damage ?? {}).map(([name, base]) => [name, power == null || base == null ? null : power * base]));
  const result = {
    weight, sprint: sprint == null ? null : sprint * KMH, power,
    bite: power == null || species.damageBite == null ? null : power * species.damageBite,
    boosted: unlocked && sprint != null ? sprint * ability.multiplier * KMH : null,
    stamina: unlocked ? ability.staminaPerSec ?? null : null,
    nutrients: {}, mobilize: null, flock: null, attacks
  };
  if (sprint != null && species.dietSpeed) {
    for (let n = 1; n <= species.dietSpeed.maxNutrients; n++) result.nutrients[n] = (sprint + n * species.dietSpeed.perNutrientCmS) * KMH;
    const base = (sprint + nutrients * species.dietSpeed.perNutrientCmS) * KMH;
    if (species.mobilize) result.mobilize = base + species.mobilize.boostCmS * KMH;
    const factor = species.flocking?.factorByNutrients?.[nutrients];
    if (leaderSpeed != null && factor != null) result.flock = base + (leaderSpeed - base) * factor;
  }
  return result;
}
export function metricValue(species, ability, metric, growth, path, options = {}) {
  const s = stats(species, ability, growth, path, options.nutrients ?? 3, options.leaderSpeed ?? null);
  if (metric.startsWith('attack:')) return s.attacks[metric.slice(7)] ?? null;
  if (metric.startsWith('nutrient:')) return s.nutrients[metric.slice(9)] ?? null;
  return s[metric] ?? null;
}
export function samplePoints(species, ability, metric, path, options = {}) {
  const times = new Set(Array.from({ length: 401 }, (_, i) => i / 400));
  for (const entry of Object.values(species.curves ?? {})) for (const keys of Object.values(entry)) for (const key of keys) times.add(key.t);
  if (ability?.minStage) { const t = STAGES[ability.minStage]; times.add(t); times.add(Math.max(0, t - 0.000001)); }
  return [...times].sort((a, b) => a - b).map(t => ({ t, v: metricValue(species, ability, metric, t, path, options) }));
}
export function validateIndex(value) {
  if (!value || typeof value.latest !== 'string' || !Array.isArray(value.versions) || !value.versions.length) throw new Error('버전 목록 형식이 변경되었습니다.');
  for (const v of value.versions) if (!/^[\w.-]+$/.test(v.id ?? '') || v.id.includes('..')) throw new Error('버전 ID가 올바르지 않습니다.');
  if (!value.versions.some(v => v.id === value.latest)) throw new Error('최신 버전이 목록에 없습니다.');
  return value;
}
export function validateSpecies(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) throw new Error('공룡 데이터 형식이 올바르지 않습니다.');
  for (const [name, s] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,48}$/.test(name) || !s.curves) throw new Error('공룡 데이터 형식이 변경되었습니다.');
    for (const [field, entry] of Object.entries(s.curves)) {
      for (const path of ['frail', 'prime']) {
        const keys = entry?.[path];
        if (!Array.isArray(keys)) throw new Error(`${name}: ${field} 곡선이 없습니다.`);
        let previous = -Infinity;
        for (const k of keys) {
          if (!Number.isFinite(k.t) || !Number.isFinite(k.v) || k.t < previous || k.t < 0 || k.t > 1) throw new Error(`${name}: 곡선 데이터가 올바르지 않습니다.`);
          for (const property of ['c', 'w', 'at', 'lt', 'aw', 'lw']) if (k[property] != null && !Number.isFinite(k[property])) throw new Error(`${name}: 접선 데이터가 올바르지 않습니다.`);
          previous = k.t;
        }
      }
    }
    if (s.damageBite != null && !Number.isFinite(s.damageBite)) throw new Error(`${name}: 공격력 데이터가 올바르지 않습니다.`);
    if (s.damage != null) for (const [key, v] of Object.entries(s.damage)) if (!/^[A-Za-z0-9_.]+$/.test(key) || !Number.isFinite(v)) throw new Error(`${name}: 추가 공격 데이터가 올바르지 않습니다.`);
  }
  return value;
}
// Only read known scalar values. Downloaded JavaScript is NEVER executed.
export function extractAbilities(script, speciesNames) {
  const found = {};
  for (const name of speciesNames) {
    const match = new RegExp(`\\b${name}:\\{label:("(?:[^"\\\\]|\\\\.)*")`).exec(script);
    if (!match) continue;
    const start = match.index + match[0].indexOf('{');
    let end = start, depth = 0, quote = false, escaped = false;
    for (; end < script.length; end++) {
      const ch = script[end];
      if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quote = false; }
      else if (ch === '"') quote = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) break;
    }
    const raw = script.slice(start, end + 1), ability = {};
    for (const field of ['label', 'provenance', 'minStage', 'trigger']) {
      const m = new RegExp(`(?:[,{])${field}:("(?:[^"\\\\]|\\\\.)*")`).exec(raw);
      if (m) ability[field] = JSON.parse(m[1]);
    }
    for (const field of ['multiplier', 'staminaPerSec', 'durationSec', 'cooldownSec']) {
      const m = new RegExp(`(?:[,{])${field}:(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)`).exec(raw);
      if (m) ability[field] = Number(m[1]);
    }
    ability.verified = /(?:[,{])verified:(?:!0|true)(?=[,}])/.test(raw);
    if (ability.label && Number.isFinite(ability.multiplier) && ability.multiplier > 0) found[name] = ability;
  }
  return found;
}
