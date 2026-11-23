// The experiment: tessellate a void, wrap it in a temporal field, and run it
// until a planet inside develops intelligent life. Then introduce that life
// to electricity and keep the field running until they generate it on a
// planetary scale.

import { Rng } from './rng.js';
import { TemporalField } from './temporal-field.js';
import { VoidLattice } from './void.js';
import { Planet } from './planet.js';
import { Biosphere, SAPIENCE_LEVEL } from './biosphere.js';
import { Civilization, SOURCES } from './civilization.js';
import { worldName, speciesName, placeName } from './names.js';
import { formatYears, formatPower, formatPeople } from './format.js';

export const PHASES = [
  { id: 'void', label: 'Cosmogenesis' },
  { id: 'cooling', label: 'Planet cooling' },
  { id: 'abiogenesis', label: 'Awaiting life' },
  { id: 'evolution', label: 'Evolution' },
  { id: 'awakening', label: 'Awakening' },
  { id: 'civilization', label: 'Civilization' },
  { id: 'electrification', label: 'Electrification' },
  { id: 'global', label: 'Planetary grid' },
];

const CONTACT_ERA = 4; // auto-introduction waits for printing and clockwork
const MAX_VOID_ATTEMPTS = 40;

export class Microverse {
  constructor({
    seed = 'spark',
    autoIntroduce = true,
    voidRadius = 18,
    planetWidth = 48,
    planetHeight = 26,
  } = {}) {
    this.seed = String(seed);
    this.rng = new Rng(this.seed);
    this.names = new Rng(`${this.seed}:names`);
    this.autoIntroduce = autoIntroduce;
    this.options = { voidRadius, planetWidth, planetHeight };
    this.field = new TemporalField({ dilation: 1, slew: 1.25, max: 3e7 });
    this.events = [];
    this.history = [];
    this.phase = 'void';
    this.voidAttempts = 0;
    this.void = null;
    this.system = null;
    this.planet = null;
    this.biosphere = null;
    this.civ = null;
    this.species = null;
    this.pendingContact = null;
    this.newVoid();
  }

  get tick() {
    return this.field.ticks;
  }

  get years() {
    return this.field.interiorYears;
  }

  get done() {
    return this.phase === 'global';
  }

  get canIntroduce() {
    return this.phase === 'civilization' && this.pendingContact === null;
  }

  log(kind, text, extra = {}) {
    const entry = { tick: this.tick, years: this.years, phase: this.phase, kind, text, ...extra };
    this.events.push(entry);
    return entry;
  }

  newVoid() {
    this.voidAttempts += 1;
    if (this.voidAttempts > MAX_VOID_ATTEMPTS) throw new Error('no habitable system after many voids');
    this.void = new VoidLattice(this.rng, { radius: this.options.voidRadius });
    const verb = this.voidAttempts === 1 ? 'Tessellated' : 'Re-tessellated';
    this.log('tessellation', `${verb} a void of ${this.void.grid.size} hexagonal cells inside the temporal field.`);
  }

  // Ask the field for the time rate this phase needs.
  regulateField() {
    const f = this.field;
    switch (this.phase) {
      case 'void':
      case 'cooling':
      case 'abiogenesis':
        f.setTarget(1e7);
        break;
      case 'evolution': {
        const c = this.biosphere.maxComplexity;
        f.setTarget(c < 2 ? 2e7 : c < 4.5 ? 8e6 : c < 5.6 ? 2e6 : 5e5);
        break;
      }
      case 'awakening':
      case 'civilization':
        f.setTarget(this.pendingContact !== null ? 1 : 300);
        break;
      default:
        f.setTarget(1);
    }
  }

  step() {
    this.regulateField();
    const dt = this.field.tick();
    switch (this.phase) {
      case 'void':
        this.stepVoid(dt);
        break;
      case 'cooling':
        if (this.planet.step(dt)) {
          this.phase = 'abiogenesis';
          this.biosphere = new Biosphere(this.rng, this.planet);
          this.log('oceans', `${this.planet.name}'s crust cools below boiling. The first rains fill the basins.`);
        }
        break;
      case 'abiogenesis':
      case 'evolution':
        this.planet.step(dt);
        this.stepBiosphere(dt);
        break;
      case 'awakening':
        this.planet.step(dt);
        this.biosphere.step(dt);
        if (this.field.dilation <= 500) this.awaken();
        break;
      default:
        this.stepCivilization(dt);
    }
    this.record();
    return this.phase;
  }

  stepVoid(dt) {
    const v = this.void;
    const before = v.stage;
    v.step(dt);
    if (before === 'condensation' && v.stage !== 'condensation') {
      this.log('condensation', `Matter has condensed into ${v.bodies.length} clumps.`);
    }
    if (!v.settled) return;
    const system = v.resolveSystem();
    if (!system) {
      this.log('collapse', `The void settled into ${v.bodies.length} bodies with nothing rocky in a habitable orbit.`);
      this.newVoid();
      return;
    }
    this.system = system;
    const name = worldName(this.names);
    this.planet = new Planet(this.rng, {
      width: this.options.planetWidth,
      height: this.options.planetHeight,
      equilibriumK: system.planet.equilibriumK,
      name,
    });
    this.phase = 'cooling';
    const s = system.star;
    const p = system.planet;
    this.log('ignition', `A ${s.solarMasses.toFixed(2)} solar-mass star ignites at the heart of the void (luminosity ${s.luminosity.toFixed(2)}).`);
    this.log('planet', `${name} coalesces ${p.distanceAU.toFixed(2)} AU out, inside the habitable zone: ${p.earthMasses.toFixed(1)} Earth masses, molten, ${this.planet.continents.length} future continents.`);
  }

  stepBiosphere(dt) {
    for (const e of this.biosphere.step(dt)) {
      switch (e.kind) {
        case 'abiogenesis':
          this.phase = 'evolution';
          this.log('life', e.text, { cell: e.cell });
          break;
        case 'extinction':
          this.phase = 'abiogenesis';
          this.log('extinction', e.text);
          break;
        case 'sapience':
          this.phase = 'awakening';
          this.species = speciesName(this.names);
          this.awakeningCell = e.cell;
          this.log('tool-use', `A lineage in the ${this.biosphere.describe(e.cell)} starts shaping tools. The field brakes hard.`, { cell: e.cell });
          break;
        default:
          this.log(e.kind, e.text, { cell: e.cell, radius: e.radius });
      }
    }
  }

  awaken() {
    // The most capable land population at the moment the field settles.
    const b = this.biosphere;
    let origin = this.awakeningCell;
    for (let i = 0; i < this.planet.size; i++) {
      if (this.planet.land[i] && b.complexity[i] >= SAPIENCE_LEVEL && b.biomass[i] > b.biomass[origin]) origin = i;
    }
    if (!this.planet.land[origin]) origin = this.awakeningCell;
    this.civ = new Civilization(this.rng, this.planet, b, { species: this.species, origin });
    this.phase = 'civilization';
    this.log('sapience', `Intelligent life: the ${this.species} of ${this.planet.name} light their first fires.`, { cell: origin });
  }

  // Introduce electricity. In auto mode this happens once the species has
  // printing and clockwork; otherwise call it yourself (optionally at a chosen cell).
  // The field brakes to one year per tick first, so the transition is seen
  // year by year.
  introduceElectricity(cell = null) {
    if (!this.canIntroduce) return false;
    this.pendingContact = cell === null ? -1 : cell;
    this.log('intervention', `The field brakes to real time for first contact.`);
    return true;
  }

  stepCivilization(dt) {
    const civ = this.civ;
    if (this.phase === 'civilization') {
      if (this.pendingContact === null && this.autoIntroduce && civ.era >= CONTACT_ERA) {
        this.introduceElectricity();
      }
      if (this.pendingContact !== null && this.field.dilation <= 1) {
        const requested = this.pendingContact >= 0 ? this.pendingContact : null;
        civ.introduceElectricity(requested, this.years);
        this.pendingContact = null;
        this.phase = 'electrification';
        const place = placeName(this.names);
        const where = requested === civ.contactCell ? `the ${this.species} settlement of ${place}` : `${place}, the largest settlement of the ${this.species}`;
        this.log('contact', `Electricity is introduced at ${where}: a coil, a magnet, a lamp that glows when the crank turns.`, { cell: civ.contactCell });
      }
    }
    for (const e of civ.step(dt, this.years)) {
      this.log(e.kind, e.text, { cell: e.cell });
      if (e.kind === 'global') this.phase = 'global';
    }
  }

  record() {
    const t = this.civ ? this.civ.totals() : null;
    this.history.push({
      tick: this.tick,
      years: this.years,
      phase: this.phase,
      dilation: this.field.dilation,
      complexity: this.biosphere ? this.biosphere.maxComplexity : 0,
      living: this.biosphere ? this.biosphere.livingCells : 0,
      population: t ? t.population : 0,
      capacity: t ? t.capacity : 0,
    });
  }

  // Run until `until(this)` is true or the tick budget runs out.
  run({ until = (m) => m.done, maxTicks = 20000 } = {}) {
    while (!until(this) && this.tick < maxTicks) this.step();
    return this;
  }

  report() {
    const r = {
      seed: this.seed,
      phase: this.phase,
      ticks: this.tick,
      exteriorSeconds: this.field.exteriorSeconds,
      interiorYears: this.years,
      voidAttempts: this.voidAttempts,
      events: this.events,
    };
    if (this.system) r.system = { star: this.system.star, planet: { name: this.planet.name, ...this.system.planet, continents: this.planet.continents.length } };
    if (this.civ) {
      const t = this.civ.totals();
      r.civilization = {
        species: this.species,
        population: t.population,
        electrifiedShare: t.population ? t.served / t.population : 0,
        capacityGW: t.capacity,
        bySourceGW: Object.fromEntries(SOURCES.map((s, k) => [s, t.bySource[k]])),
        continentsSettled: this.civ.continentsSettled(),
        electricityIntroducedAt: this.civ.introducedAt,
        planetaryGridAt: this.civ.globalAt,
      };
    }
    return r;
  }

  summary() {
    const r = this.report();
    const lines = [];
    lines.push(`Seed "${r.seed}": ${r.ticks} ticks (${r.exteriorSeconds.toFixed(1)} s outside), ${formatYears(r.interiorYears)} inside.`);
    if (r.civilization) {
      const c = r.civilization;
      lines.push(`${c.species}: ${formatPeople(c.population)}, ${Math.round(c.electrifiedShare * 100)}% electrified, generating ${formatPower(c.capacityGW)}.`);
    }
    return lines.join('\n');
  }
}
