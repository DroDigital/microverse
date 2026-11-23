// Seeded, deterministic randomness. Every stochastic choice in the microverse
// flows through one of these so a seed always replays the same history.

export function hashSeed(seed) {
  const text = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.state = hashSeed(seed);
    this.spare = null;
  }

  // mulberry32
  float() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.float();
  }

  int(n) {
    return Math.floor(this.float() * n);
  }

  chance(p) {
    return this.float() < p;
  }

  pick(list) {
    return list[this.int(list.length)];
  }

  // Standard normal via Box-Muller.
  gaussian() {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = this.float();
    const v = this.float();
    const mag = Math.sqrt(-2 * Math.log(u));
    this.spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  }

  // Probability that a Poisson process with `rate` fires at least once in `dt`.
  poisson(rate, dt) {
    return this.float() < 1 - Math.exp(-rate * dt);
  }
}
