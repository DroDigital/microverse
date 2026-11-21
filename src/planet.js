// The planet surface: a wrapped hex grid with fractal terrain, a latitude
// climate, and a molten crust that cools until the first rains fill the
// basins.

import { wrappedHexGrid, components, bfs } from './hex.js';
import { fbm3 } from './noise.js';

const OCEAN_FRACTION = 0.64;
const MOLTEN_EXCESS_K = 1400; // surface excess over equilibrium at formation
const COOLING_TAU = 90e6; // years
const BOILING_K = 373;
const FREEZING_K = 271;
const LAPSE_K_PER_KM = 6.5;
const MAX_LAND_KM = 6;
const MIN_CONTINENT_CELLS = 6;

export class Planet {
  constructor(rng, { width = 48, height = 26, equilibriumK = 255, name = 'the planet' } = {}) {
    this.name = name;
    this.grid = wrappedHexGrid(width, height);
    const n = this.grid.size;
    this.age = 0;
    this.greenhouseK = rng.range(24, 42);
    this.meanK = equilibriumK + this.greenhouseK;

    // Terrain: noise sampled on a cylinder so the map wraps east-west.
    const seed = (rng.float() * 2 ** 31) | 0;
    const raw = new Float64Array(n);
    const aspect = height / width;
    for (let i = 0; i < n; i++) {
      const lon = this.grid.longitude(i);
      const y = (this.grid.row[i] / height) * aspect * 2 * Math.PI;
      const radius = 1.75;
      raw[i] = fbm3(Math.cos(lon) * radius + 11.3, Math.sin(lon) * radius - 7.1, y * radius * 0.55, seed);
      // Squash the poles toward ocean/ice so continents sit mostly in the middle.
      const lat = Math.abs(this.grid.latitude(i)) / (Math.PI / 2);
      raw[i] -= 0.12 * lat ** 3;
    }
    const sorted = Float64Array.from(raw).sort();
    const sea = sorted[Math.floor(n * OCEAN_FRACTION)];
    const top = sorted[n - 1];
    const bottom = sorted[0];
    this.elevation = new Float64Array(n); // km relative to sea level
    for (let i = 0; i < n; i++) {
      this.elevation[i] = raw[i] >= sea
        ? ((raw[i] - sea) / (top - sea)) * MAX_LAND_KM
        : -((sea - raw[i]) / (sea - bottom)) * 5;
    }
    this.land = Uint8Array.from(this.elevation, (e) => (e >= 0 ? 1 : 0));

    // Climate baseline: warm equator, cold poles, thin air on mountains.
    this.baseK = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = Math.sin(this.grid.latitude(i));
      const lapse = this.land[i] ? this.elevation[i] * LAPSE_K_PER_KM : 0;
      this.baseK[i] = this.meanK + 15 - 45 * s * s - lapse;
    }

    // Moisture falls off with distance from the sea.
    this.coastDistance = new Uint8Array(n).fill(255);
    for (let i = 0; i < n; i++) {
      if (this.land[i]) continue;
      if (!this.grid.neighbors[i].some((j) => this.land[j])) continue;
      for (const [j, d] of bfs(this.grid, i, 12, (k) => this.land[k] === 1)) {
        if (this.land[j] && d < this.coastDistance[j]) this.coastDistance[j] = d;
      }
    }
    this.moisture = Float64Array.from(this.coastDistance, (d, i) =>
      this.land[i] ? 0.35 + 0.65 * Math.exp(-(d - 1) / 3) : 1);

    // Continents: connected land masses big enough to count.
    const { label, groups } = components(this.grid, (i) => this.land[i] === 1);
    this.continentOf = new Int32Array(n).fill(-1);
    this.continents = [];
    for (const cells of groups.sort((a, b) => b.length - a.length)) {
      if (cells.length < MIN_CONTINENT_CELLS) continue;
      const id = this.continents.length;
      for (const c of cells) this.continentOf[c] = id;
      this.continents.push({ id, cells });
    }
    this.landLabel = label;
    this.oceansFormed = false;
  }

  get size() {
    return this.grid.size;
  }

  // Surface heat left over from accretion, decaying as the crust cools.
  get residualHeatK() {
    return MOLTEN_EXCESS_K * Math.exp(-this.age / COOLING_TAU);
  }

  get meanSurfaceK() {
    return this.meanK + this.residualHeatK;
  }

  temperature(i) {
    return this.baseK[i] + this.residualHeatK;
  }

  isOcean(i) {
    return this.oceansFormed && !this.land[i];
  }

  isIce(i) {
    return this.isOcean(i) && this.temperature(i) < FREEZING_K;
  }

  // Advance geological time. Returns true on the tick the oceans condense.
  step(dt) {
    this.age += dt;
    if (!this.oceansFormed && this.meanSurfaceK < BOILING_K) {
      this.oceansFormed = true;
      return true;
    }
    return false;
  }
}
