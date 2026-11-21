// Life on the planet. Each ocean or land cell may hold a population with a
// biomass (0-1, relative to what the cell can carry) and a complexity score.
// Complexity drifts upward at rates set per evolutionary band; populations
// spread into neighbouring cells and out-compete simpler life they meet;
// impacts knock everything back. A land population that reaches complexity 6
// is sapient.

export const MILESTONES = [
  'self-replicating chemistry',
  'nucleated cells',
  'multicellular life',
  'nervous systems',
  'life on land',
  'large brains',
  'sapience',
];

export const LAND_LEVEL = 4;
export const SAPIENCE_LEVEL = 6;
const OCEAN_CAP = 5.2; // without fire and hands, the sea tops out here
const ABIOGENESIS_RATE = 6e-12; // per suitable ocean cell per year
const DRIFT_PER_GYR = [0.75, 0.95, 2.4, 6, 3, 3]; // complexity gained per Gyr, by band
const SPREAD_TAU = 3e6; // years for a full-biomass cell to seed a neighbour
const GROWTH_TAU = 2e6;
const IMPACT_RATE = 1 / 240e6; // background rate, after the early bombardment fades
const BOMBARDMENT_TAU = 500e6;
const BURIAL_PER_YEAR = 1e-8; // fraction of biomass that becomes fossil fuel each year

const thermal = (k) => Math.max(0, 1 - ((k - 293) / 38) ** 2);

export class Biosphere {
  constructor(rng, planet) {
    this.rng = rng;
    this.planet = planet;
    const n = planet.size;
    this.biomass = new Float64Array(n);
    this.complexity = new Float64Array(n);
    this.fossil = new Float64Array(n);
    this.bandRate = DRIFT_PER_GYR.map((r) => r * Math.exp(0.3 * rng.gaussian()));
    this.alive = false;
    this.milestone = -1;
    this.maxComplexity = 0;
    this.livingCells = 0;
    this.sapient = null;
    this.impacts = 0;
  }

  // How much of cell i life of complexity c can occupy (0-1).
  habitat(i, c) {
    const p = this.planet;
    const k = p.temperature(i);
    if (p.land[i]) return c >= LAND_LEVEL ? thermal(k) * p.moisture[i] : 0;
    if (!p.oceansFormed) return 0;
    let h = thermal(k);
    if (p.isIce(i)) h *= 0.3;
    // Hydrothermal vents keep simple life going where the surface can't.
    if (c < 2 && k > 240 && k < 380) h = Math.max(h, 0.15);
    return h;
  }

  step(dt) {
    const events = [];
    const { rng, planet, biomass, complexity } = this;
    const n = planet.size;

    if (!this.alive) {
      for (let i = 0; i < n; i++) {
        if (this.habitat(i, 0) > 0 && planet.temperature(i) < 360 && rng.poisson(ABIOGENESIS_RATE, dt)) {
          biomass[i] = 0.05;
          complexity[i] = 0;
          this.alive = true;
          this.milestone = 0;
          events.push({ kind: 'abiogenesis', cell: i, text: `Self-replicating chemistry appears in the ${this.describe(i)}.` });
          break;
        }
      }
      if (!this.alive) return events;
    }

    // Growth, evolution and burial.
    const grow = 1 - Math.exp(-dt / GROWTH_TAU);
    let living = 0;
    let maxC = 0;
    for (let i = 0; i < n; i++) {
      if (biomass[i] <= 0) continue;
      const c = complexity[i];
      const k = this.habitat(i, c);
      if (k < 0.02) {
        this.clear(i);
        continue;
      }
      biomass[i] += (k - biomass[i]) * grow;
      const cap = planet.land[i] ? SAPIENCE_LEVEL + 0.5 : OCEAN_CAP;
      const band = Math.min(DRIFT_PER_GYR.length - 1, Math.floor(c));
      const drift = (dt / 1e9) * this.bandRate[band] * (0.4 + 0.6 * k) * (1 + 0.3 * rng.gaussian());
      complexity[i] = Math.min(cap, Math.max(0, c + drift));
      this.fossil[i] += biomass[i] * dt * BURIAL_PER_YEAR * (c >= 1 ? 1 : 0.3);
      living += 1;
      if (complexity[i] > maxC) maxC = complexity[i];
    }

    // Dispersal and competition.
    for (let i = 0; i < n; i++) {
      if (biomass[i] <= 0) continue;
      if (!rng.poisson(biomass[i] / SPREAD_TAU, dt)) continue;
      const nb = planet.grid.neighbors[i];
      const j = nb[rng.int(nb.length)];
      const c = complexity[i];
      const k = this.habitat(j, c);
      if (k < 0.05) continue;
      if (biomass[j] <= 0) {
        biomass[j] = 0.1 * k;
        complexity[j] = Math.max(0, c - 0.02);
      } else if (c > complexity[j] + 0.02 && rng.chance(0.5)) {
        complexity[j] = c - 0.01;
      }
    }

    // Impacts.
    const bombardment = 1 + 6 * Math.exp(-planet.age / BOMBARDMENT_TAU);
    if (rng.poisson(IMPACT_RATE * bombardment, dt)) events.push(...this.impact());

    if (living === 0) {
      this.alive = false;
      this.milestone = -1;
      events.push({ kind: 'extinction', text: 'Every living cell is gone. The oceans are sterile again.' });
    }
    this.livingCells = living;
    this.maxComplexity = maxC;

    while (this.milestone + 1 < SAPIENCE_LEVEL && maxC >= this.milestone + 1) {
      this.milestone += 1;
      events.push({ kind: 'milestone', level: this.milestone, text: `First ${MILESTONES[this.milestone]}.` });
    }

    // Sapience: the most capable well-fed land population.
    if (!this.sapient && maxC >= SAPIENCE_LEVEL) {
      let best = -1;
      for (let i = 0; i < n; i++) {
        if (planet.land[i] && complexity[i] >= SAPIENCE_LEVEL && biomass[i] > 0.3) {
          if (best < 0 || biomass[i] > biomass[best]) best = i;
        }
      }
      if (best >= 0) {
        this.sapient = { cell: best };
        this.milestone = SAPIENCE_LEVEL;
        events.push({ kind: 'sapience', cell: best });
      }
    }
    return events;
  }

  clear(i) {
    this.biomass[i] = 0;
    this.complexity[i] = 0;
  }

  impact() {
    const { rng, planet } = this;
    const radius = Math.min(6, 1 + Math.floor(-Math.log(1 - rng.float()) * 1.3));
    const centre = rng.int(planet.size);
    this.impacts += 1;
    const struck = [centre];
    const seen = new Set(struck);
    for (let ring = 0; ring < radius; ring++) {
      for (const c of struck.slice()) {
        for (const j of planet.grid.neighbors[c]) {
          if (!seen.has(j)) {
            seen.add(j);
            struck.push(j);
          }
        }
      }
    }
    for (const c of struck) this.clear(c);
    if (radius < 3) return [];
    const km = Math.round(5 * 2.2 ** radius);
    let text = `A ${km} km impactor strikes the ${this.describe(centre)}.`;
    if (radius >= 4) {
      const loss = 0.5 + 0.08 * (radius - 4);
      for (let i = 0; i < planet.size; i++) {
        if (this.biomass[i] <= 0) continue;
        this.biomass[i] *= 1 - loss;
        this.complexity[i] = Math.max(0, this.complexity[i] - 0.12 * (radius - 3));
      }
      text += ` Impact winter: ${Math.round(loss * 100)}% of all biomass dies.`;
    }
    return [{ kind: 'impact', cell: centre, radius, cells: struck, text }];
  }

  describe(i) {
    const p = this.planet;
    const lat = (p.grid.latitude(i) * 180) / Math.PI;
    const band = Math.abs(lat) < 23 ? 'tropical' : Math.abs(lat) < 55 ? 'temperate' : 'polar';
    if (!p.land[i]) return `${band} ${p.isIce(i) ? 'ice shelf' : 'ocean'}`;
    return `${band} ${p.elevation[i] > 2.5 ? 'highlands' : p.coastDistance[i] <= 1 ? 'coast' : 'interior'}`;
  }
}
