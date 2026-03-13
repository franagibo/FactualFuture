/** Simple RNG helpers. Currently wrap Math.random but centralized so we can later thread seeds/state. */
export type Rng = () => number;

/** Default RNG, backed by Math.random(). */
export const defaultRng: Rng = () => Math.random();

/** Create a deterministic RNG from a seed (mulberry32). Same seed => same sequence. */
export function createSeededRng(seed: number): Rng {
  return function seededRng(): number {
    seed = (seed + 0x6d2b79f5) | 0; // mulberry32
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | (t ^ (t >>> 15)))) ^ t;
    return ((t >>> 0) / 4294967296);
  };
}

/** Fisher–Yates shuffle using the provided RNG (default: Math.random). */
export function rngShuffle<T>(arr: T[], rng: Rng = defaultRng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Random integer in [min, max] using the provided RNG. */
export function rngRandomInt(min: number, max: number, rng: Rng = defaultRng): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick up to `count` distinct items from the array using a shuffle. */
export function rngPickRandom<T>(arr: T[], count: number, rng: Rng = defaultRng): T[] {
  const copy = rngShuffle(arr, rng);
  return copy.slice(0, Math.min(count, copy.length));
}

