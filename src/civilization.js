// The sapient species: from foragers to sail-and-bronze cultures, stalled at
// a pre-electric ceiling until electricity is introduced. Then knowledge of
// induction spreads settlement to settlement, every electrified cell builds
// generating capacity from whatever its land offers, and grids interconnect
// until one network spans every inhabited continent.

import { bfs } from './hex.js';

export const PRE_ELECTRIC_CEILING = 3.6;
export const ERAS = [
  { tech: 0, name: 'foragers' },
  { tech: 1, name: 'farming villages' },
  { tech: 2, name: 'cities and bronze' },
  { tech: 2.6, name: 'ocean-going sail' },
  { tech: 3.3, name: 'printing and clockwork' },
];
export const ELECTRIC_ERAS = [
  { level: 0, name: 'galvanic cells' },
  { level: 1, name: 'dynamos and arc light' },
  { level: 2, name: 'alternating-current networks' },
  { level: 3, name: 'high-voltage undersea cables' },
  { level: 4, name: 'wind and solar fields' },
  { level: 5, name: 'a synchronized planetary grid' },
];
export const SOURCES = ['hydro', 'combustion', 'wind', 'solar'];
const UNLOCK = { hydro: 1, combustion: 1.4, wind: 3.6, solar: 4.2 };
const SEA_LANE_REACH = 4; // ocean cells a sailing culture can cross
const CABLE_ERA = 3;
const SEAFARING_TECH = 2.6;
const STEAMSHIP_ERA = 2;
const GLOBAL_COVERAGE = 0.9;
const LIT_KW_PER_PERSON = 0.02; // a settlement counts as electrified above this

export class Civilization {
  constructor(rng, planet, biosphere, { species, origin }) {
    this.rng = rng;
    this.planet = planet;
    this.biosphere = biosphere;
    this.species = species;
    const n = planet.size;
    this.population = new Float64Array(n); // millions
    this.knows = new Uint8Array(n); // understands electricity
    this.capacity = new Float64Array(n); // GW of generation built
    this.mix = SOURCES.map(() => new Float64Array(n)); // GW by source
    this.reserves = new Float64Array(n); // fossil fuel, normalized units
    this.tech = 0;
    this.electricLevel = -1;
    this.introducedAt = null;
    this.contactCell = null;
    this.globalAt = null;
    this.era = 0;
    this.yearsSinceSapience = 0;
    this.yearsSinceContact = 0;
    this.population[origin] = 0.01;
    this.reached = new Set([planet.continentOf[origin]]);

    // What each land cell can offer people and power plants.
    this.liveable = new Float64Array(n);
    this.hydro = new Float64Array(n);
    this.wind = new Float64Array(n);
    this.solar = new Float64Array(n);
    let fossilTotal = 0;
    let landCells = 0;
    for (let i = 0; i < n; i++) {
      if (!planet.land[i]) continue;
      landCells += 1;
      const k = planet.temperature(i);
      const comfort = Math.max(0, 1 - ((k - 291) / 32) ** 2);
      this.liveable[i] = comfort * planet.moisture[i] * (0.5 + 0.5 * Math.min(1, biosphere.biomass[i] + 0.2));
      let drop = 0;
      for (const j of planet.grid.neighbors[i]) drop = Math.max(drop, planet.elevation[i] - Math.max(0, planet.elevation[j]));
      this.hydro[i] = Math.min(1, drop / 2) * planet.moisture[i];
      const lat = Math.abs(planet.grid.latitude(i));
      this.wind[i] = 0.3 + 0.4 * Math.sin(lat) + (planet.coastDistance[i] <= 1 ? 0.3 : 0);
      this.solar[i] = Math.cos(lat) * (1.2 - 0.5 * planet.moisture[i]);
      // Fossil fuel under the cell plus a share of the shelf beside it.
      let f = biosphere.fossil[i];
      for (const j of planet.grid.neighbors[i]) if (!planet.land[j]) f += biosphere.fossil[j] / 3;
      this.reserves[i] = f;
      fossilTotal += f;
    }
    const meanFossil = fossilTotal / Math.max(1, landCells);
    for (let i = 0; i < n; i++) this.reserves[i] /= meanFossil || 1;

    // Sea lanes: coastal land cells reachable from each other across a few ocean cells.
    this.seaLanes = new Map();
    for (let i = 0; i < n; i++) {
      if (!planet.land[i] || planet.coastDistance[i] > 1) continue;
      const reach = bfs(planet.grid, i, SEA_LANE_REACH + 1, (j) => !planet.land[j] || planet.coastDistance[j] <= 1);
      const lanes = [];
      for (const [j] of reach) {
        if (j !== i && planet.land[j] && planet.continentOf[j] !== planet.continentOf[i]) lanes.push(j);
      }
      if (lanes.length) this.seaLanes.set(i, lanes);
    }
  }

  get electrified() {
    return this.introducedAt !== null;
  }

  totals() {
    let population = 0, served = 0, capacity = 0, cells = 0, lit = 0;
    const bySource = SOURCES.map(() => 0);
    for (let i = 0; i < this.planet.size; i++) {
      const p = this.population[i];
      if (p <= 0) continue;
      population += p;
      cells += 1;
      if (this.capacity[i] >= LIT_KW_PER_PERSON * p) {
        served += p;
        lit += 1;
      }
      capacity += this.capacity[i];
      for (let s = 0; s < SOURCES.length; s++) bySource[s] += this.mix[s][i];
    }
    return { population, served, capacity, cells, lit, bySource };
  }

  // Where to introduce electricity by default: the most populous settlement.
  capital() {
    let best = -1;
    for (let i = 0; i < this.planet.size; i++) {
      if (this.population[i] > 0 && (best < 0 || this.population[i] > this.population[best])) best = i;
    }
    return best;
  }

  introduceElectricity(cell, years) {
    if (this.electrified) return false;
    if (cell == null || this.population[cell] <= 0) cell = this.capital();
    if (cell < 0) return false;
    this.introducedAt = years;
    this.contactCell = cell;
    this.knows[cell] = 1;
    this.electricLevel = 0;
    return true;
  }

  carryingCapacity(i) {
    const base = 0.2 + 1.6 * Math.min(this.tech, PRE_ELECTRIC_CEILING); // millions per ideal cell
    const boost = this.electrified ? 1 + 1.2 * Math.max(0, this.electricLevel) : 1;
    return this.liveable[i] * base * boost;
  }

  step(dt, years) {
    const events = [];
    const { rng, planet, population } = this;
    const n = planet.size;
    this.yearsSinceSapience += dt;

    // Knowledge and technique.
    const totals = this.totals();
    if (!this.electrified) {
      const pace = (1 + Math.log10(1 + totals.population)) / 30000;
      this.tech += dt * pace * Math.max(0, 1 - this.tech / PRE_ELECTRIC_CEILING) * 1.6;
      this.tech = Math.min(this.tech, PRE_ELECTRIC_CEILING);
    } else {
      this.yearsSinceContact += dt;
      const share = totals.population > 0 ? totals.served / totals.population : 0;
      const next = Math.min(ELECTRIC_ERAS.length - 1, this.electricLevel + (dt / 30) * (0.4 + share));
      this.tech = Math.max(this.tech, PRE_ELECTRIC_CEILING + next);
      if (Math.floor(next) > Math.floor(this.electricLevel)) {
        const era = ELECTRIC_ERAS[Math.floor(next)];
        events.push({ kind: 'electric-era', level: Math.floor(next), text: `The ${this.species} build ${era.name}.` });
      }
      this.electricLevel = next;
    }
    while (!this.electrified && this.era + 1 < ERAS.length && this.tech >= ERAS[this.era + 1].tech) {
      this.era += 1;
      events.push({ kind: 'era', text: `The ${this.species} reach the age of ${ERAS[this.era].name}.` });
    }

    // Population growth and migration.
    const grow = 1 - Math.exp(-dt / (this.electrified ? 30 : 400));
    const seafaring = this.tech >= SEAFARING_TECH;
    const migrate = this.electrified ? 1 / 15 : 1 / 600;
    for (let i = 0; i < n; i++) {
      const p = population[i];
      if (p <= 0) continue;
      const k = this.carryingCapacity(i);
      population[i] = Math.max(0.001, p + (k - p) * grow);
      if (!rng.poisson(migrate * Math.min(1, p / Math.max(k, 1e-6)), dt)) continue;
      let j;
      const lanes = this.seaLanes.get(i);
      if (seafaring && lanes && rng.chance(0.25)) j = lanes[rng.int(lanes.length)];
      else {
        const nb = planet.grid.neighbors[i];
        j = nb[rng.int(nb.length)];
      }
      if (planet.land[j] && population[j] <= 0 && this.liveable[j] > 0.05) {
        population[j] = Math.min(0.05, p * 0.1);
        const continent = planet.continentOf[j];
        if (continent >= 0 && !this.reached.has(continent)) {
          this.reached.add(continent);
          events.push({ kind: 'landfall', cell: j, text: `The ${this.species} make landfall on a new continent (${this.continentsSettled()} settled).` });
        }
      }
    }

    // Steamships and aircraft reach any shore.
    if (this.electrified && this.electricLevel >= STEAMSHIP_ERA && rng.poisson(1 / 15, dt)) {
      const target = this.unsettledContinents()[0];
      if (target) {
        const cells = target.cells.filter((c) => this.liveable[c] > 0.05);
        const j = cells[rng.int(cells.length)];
        population[j] = 0.05;
        this.knows[j] = 1;
        this.reached.add(target.id);
        events.push({ kind: 'landfall', cell: j, text: `Steamships carry the ${this.species} and their dynamos to an unsettled continent (${this.continentsSettled()} settled).` });
      }
    }

    if (this.electrified) events.push(...this.electrify(dt, years));
    return events;
  }

  // Continents with room to live that nobody has reached yet, largest first.
  unsettledContinents() {
    return this.planet.continents.filter((c) => this.liveableContinent(c) && !this.reached.has(c.id));
  }

  liveableContinent(c) {
    let sum = 0;
    for (const i of c.cells) sum += this.liveable[i];
    return sum >= 2;
  }

  continentsSettled() {
    const seen = new Set();
    for (let i = 0; i < this.planet.size; i++) {
      if (this.population[i] > 0 && this.planet.continentOf[i] >= 0) seen.add(this.planet.continentOf[i]);
    }
    return seen.size;
  }

  electrify(dt, years) {
    const events = [];
    const { rng, planet, population, knows } = this;
    const n = planet.size;
    const cables = this.electricLevel >= CABLE_ERA;

    // Know-how spreads overland and along sea lanes.
    const learn = 1 - Math.exp(-dt / 4);
    for (let i = 0; i < n; i++) {
      if (!knows[i] || population[i] <= 0) continue;
      for (const j of planet.grid.neighbors[i]) {
        if (!knows[j] && population[j] > 0 && rng.chance(learn)) knows[j] = 2; // learns next tick
      }
      const lanes = this.seaLanes.get(i);
      if (lanes && rng.poisson(1 / 12, dt)) {
        const j = lanes[rng.int(lanes.length)];
        if (!knows[j] && population[j] > 0) knows[j] = 2;
      }
    }
    for (let i = 0; i < n; i++) if (knows[i] === 2) knows[i] = 1;

    // Build generation toward demand, choosing sources by what the land offers.
    const perCapitaKW = 0.05 + 1.95 * (1 - Math.exp(-Math.max(0, this.electricLevel) / 2.5));
    const build = 1 - Math.exp(-dt / 12);
    const unlocked = SOURCES.map((s) => this.electricLevel >= UNLOCK[s]);
    for (let i = 0; i < n; i++) {
      if (!knows[i] || population[i] <= 0) continue;
      const demand = population[i] * perCapitaKW; // millions * kW = GW
      this.capacity[i] += (demand - this.capacity[i]) * build;
      const offer = [
        unlocked[0] ? this.hydro[i] * 1.2 : 0,
        unlocked[1] ? Math.min(1, this.reserves[i]) * 1.1 : 0,
        unlocked[2] ? this.wind[i] : 0,
        unlocked[3] ? this.solar[i] * 1.1 : 0,
      ];
      let sum = offer.reduce((a, b) => a + b, 0);
      if (sum <= 0) {
        // Galvanic piles only: a trickle until dynamos arrive.
        this.capacity[i] = Math.min(this.capacity[i], population[i] * 0.002);
        for (let s = 0; s < SOURCES.length; s++) this.mix[s][i] = 0;
        continue;
      }
      for (let s = 0; s < SOURCES.length; s++) this.mix[s][i] = (this.capacity[i] * offer[s]) / sum;
      // Burning fuel depletes it: a cell's fair share lasts ~150 years at 5 GW.
      this.reserves[i] = Math.max(0, this.reserves[i] - (this.mix[1][i] * dt) / 750);
    }

    // Has generation gone global?
    if (this.globalAt === null) {
      const t = this.totals();
      const settled = new Set();
      const lit = new Set();
      for (let i = 0; i < n; i++) {
        const c = planet.continentOf[i];
        if (c < 0 || population[i] <= 0) continue;
        settled.add(c);
        if (this.capacity[i] > 0 && this.mix.some((m) => m[i] > 0)) lit.add(c);
      }
      const coverage = t.population > 0 ? t.served / t.population : 0;
      const liveable = this.planet.continents.filter((c) => this.liveableContinent(c));
      const allContinents = liveable.every((c) => lit.has(c.id));
      if (cables && coverage >= GLOBAL_COVERAGE && allContinents && settled.size > 0) {
        this.globalAt = years;
        events.push({
          kind: 'global',
          text: `Generation is planetary: ${(t.capacity / 1000).toFixed(1)} TW across ${lit.size} continent${lit.size === 1 ? '' : 's'}, reaching ${Math.round(coverage * 100)}% of the ${this.species}.`,
        });
      }
    }
    return events;
  }
}
