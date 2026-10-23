export function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGameSeed() {
  if (typeof globalThis.crypto !== "undefined") {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0];
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

export function createNextGameSeed(
  previousSeed: number | null,
  candidate = createGameSeed(),
) {
  if (previousSeed === null || candidate !== previousSeed) return candidate;
  return (candidate + 1) >>> 0;
}
