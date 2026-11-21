// Cosmogenesis inside the tessellated void.
//
// Stage 1, condensation: every hex cell starts with a near-uniform scrap of
// matter (vacuum fluctuations). Each cell feels a softened potential from the
// matter around it and drains toward the steepest neighbouring well, so the
// void curdles into dozens of clumps.
//
// Stage 2, accretion: the clumps become bodies that fall toward one another
// a cell at a time and merge on contact, until one of them holds enough of
// the void's matter to ignite as a star. A rocky survivor in the star's
// habitable zone becomes the planet.

import { hexagonRegion, axialToPixel, AXIAL_DIRECTIONS } from './hex.js';

const KERNEL_RADIUS = 3;
const NUCLEUS_AMPLITUDE = 2.5; // peak extra matter per cell at the protostellar core
const NUCLEUS_SIGMA = 3.5; // core width, in cells
const NUCLEUS_OFFSET = 0.3; // how far from the centre the core may sit, as a share of the radius
const COLLAPSE_TAU = 120e6; // years for a cell to shed 63% of its matter downhill
const SETTLED_FLOW = 0.005; // condensation ends when less than this share of matter is still sliding downhill
const ACCRETION_TAU = 60e6; // years for a body under reference pull to move one cell
const IGNITION_SHARE = 0.45; // star ignites once one body holds this share of all matter
const MAX_AGE = 4e9;
const HZ_SCALE = 7.5; // habitable-zone distance, in cells, around a 1 L(sun) star
const HZ_TOLERANCE = 0.3; // accept |ln(d / d_hz)| up to this
const SOLAR_MASS = 400; // void mass units in one solar mass
const EARTH_MASS = 6; // void mass units in one Earth mass (the microverse is not to scale)

const cellDistance = (a, b) => {
  const pa = axialToPixel(a.q, a.r, 1);
  const pb = axialToPixel(b.q, b.r, 1);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) / Math.sqrt(3);
};

export class VoidLattice {
  constructor(rng, { radius = 18 } = {}) {
    this.rng = rng;
    this.grid = hexagonRegion(radius);
    const n = this.grid.size;
    this.mass = new Float64Array(n);
    // A faint overdensity somewhere near the middle seeds the collapse: the
    // protostellar core. Everywhere else is near-uniform noise.
    const centre = this.grid.cells[rng.int(this.grid.size)];
    const cq = Math.round(centre.q * NUCLEUS_OFFSET), cr = Math.round(centre.r * NUCLEUS_OFFSET);
    for (let i = 0; i < n; i++) {
      const { q, r } = this.grid.cells[i];
      const d = cellDistance({ q, r }, { q: cq, r: cr });
      const nucleus = NUCLEUS_AMPLITUDE * Math.exp(-(d * d) / (2 * NUCLEUS_SIGMA ** 2));
      this.mass[i] = Math.max(0, 1 + nucleus + 0.3 * rng.gaussian());
    }
    this.totalMass = this.mass.reduce((a, b) => a + b, 0);
    this.kernel = [];
    for (let i = 0; i < n; i++) {
      this.kernel.push(this.grid.within(i, KERNEL_RADIUS).map(([j, d]) => [j, 1 / (1 + d) ** 1.6]));
    }
    this.potential = new Float64Array(n);
    this.age = 0;
    this.flow = 1;
    this.stage = 'condensation';
    this.bodies = [];
    this.mergers = 0;
    this.system = null;
  }

  get settled() {
    return this.stage === 'ignited' || this.age >= MAX_AGE;
  }

  get largestShare() {
    return this.bodies.length ? this.bodies[0].mass / this.totalMass : 0;
  }

  step(dt) {
    if (this.stage === 'condensation') this.condense(dt);
    else if (this.stage === 'accretion') this.accrete(dt);
    this.age += dt;
  }

  condense(dt) {
    const { mass, potential, kernel, grid } = this;
    const n = grid.size;
    for (let i = 0; i < n; i++) {
      let p = 0;
      for (const [j, w] of kernel[i]) p += mass[j] * w;
      potential[i] = p;
    }
    const f = 1 - Math.exp(-dt / COLLAPSE_TAU);
    const next = Float64Array.from(mass);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      if (mass[i] <= 0) continue;
      let best = -1;
      let bestP = potential[i];
      for (const j of grid.neighbors[i]) {
        if (potential[j] > bestP) {
          bestP = potential[j];
          best = j;
        }
      }
      if (best < 0) continue;
      const flow = mass[i] * f;
      next[i] -= flow;
      next[best] += flow;
      moved += flow;
    }
    this.mass = next;
    this.flow = f > 0 ? moved / f / this.totalMass : 1;
    if (this.flow < SETTLED_FLOW) this.beginAccretion();
  }

  // Lift condensed clumps out of the dust field and treat them as bodies.
  beginAccretion() {
    const { grid, mass } = this;
    const dense = (i) => mass[i] > 0.6;
    const seen = new Uint8Array(grid.size);
    const bodies = [];
    for (let i = 0; i < grid.size; i++) {
      if (seen[i] || !dense(i)) continue;
      const cells = [i];
      seen[i] = 1;
      for (let k = 0; k < cells.length; k++) {
        for (const j of grid.neighbors[cells[k]]) {
          if (!seen[j] && dense(j)) {
            seen[j] = 1;
            cells.push(j);
          }
        }
      }
      let m = 0, core = cells[0];
      for (const c of cells) {
        m += mass[c];
        if (mass[c] > mass[core]) core = c;
      }
      if (m < 2) continue;
      for (const c of cells) mass[c] = 0;
      const { q, r } = grid.cells[core];
      bodies.push({ id: bodies.length, mass: m, q, r });
    }
    bodies.sort((a, b) => b.mass - a.mass);
    this.bodies = bodies;
    this.stage = 'accretion';
    if (this.largestShare >= IGNITION_SHARE) this.stage = 'ignited';
  }

  accrete(dt) {
    const { grid, rng } = this;
    const refPull = (this.totalMass / 40) / 16; // a typical clump four cells away
    for (const body of this.bodies) {
      if (body.merged) continue;
      let fx = 0, fy = 0;
      const p = axialToPixel(body.q, body.r, 1);
      for (const other of this.bodies) {
        if (other === body || other.merged) continue;
        const o = axialToPixel(other.q, other.r, 1);
        const dx = o.x - p.x, dy = o.y - p.y;
        const d2 = (dx * dx + dy * dy) / 3;
        const g = other.mass / d2 / Math.sqrt(d2);
        fx += g * dx;
        fy += g * dy;
      }
      const pull = Math.hypot(fx, fy);
      if (!rng.poisson(pull / refPull / ACCRETION_TAU, dt)) continue;
      // Step to the neighbouring cell that best follows the pull.
      let best = null, bestDot = 0;
      for (const [dq, dr] of AXIAL_DIRECTIONS) {
        if (grid.indexOf(body.q + dq, body.r + dr) === undefined) continue;
        const s = axialToPixel(dq, dr, 1);
        const dot = (s.x * fx + s.y * fy) / Math.hypot(s.x, s.y);
        if (dot > bestDot) {
          bestDot = dot;
          best = [dq, dr];
        }
      }
      if (!best) continue;
      body.q += best[0];
      body.r += best[1];
      // Merge on contact.
      for (const other of this.bodies) {
        if (other === body || other.merged) continue;
        if (cellDistance(body, other) <= 1.01) {
          const [big, small] = other.mass >= body.mass ? [other, body] : [body, other];
          big.mass += small.mass;
          small.merged = true;
          this.mergers += 1;
          break;
        }
      }
    }
    this.bodies = this.bodies.filter((b) => !b.merged).sort((a, b) => b.mass - a.mass);
    if (this.largestShare >= IGNITION_SHARE) this.stage = 'ignited';
  }

  // Pick the star and a habitable planet. Returns null if this void made none.
  resolveSystem() {
    if (this.bodies.length < 2) return null;
    const star = this.bodies[0];
    const solarMasses = star.mass / SOLAR_MASS;
    const luminosity = solarMasses ** 3.5;
    const hz = HZ_SCALE * Math.sqrt(luminosity);
    let best = null;
    for (const body of this.bodies.slice(1)) {
      if (body.mass > star.mass * 0.08) continue; // a companion star or gas giant
      const distance = cellDistance(star, body);
      const miss = Math.abs(Math.log(distance / hz));
      if (miss <= HZ_TOLERANCE && (!best || miss < best.miss)) best = { body, distance, miss };
    }
    if (!best) return null;
    const au = best.distance / HZ_SCALE;
    // Equilibrium temperature, scaled from Earth's 255 K at 1 AU around 1 L(sun).
    const equilibriumK = (255 * luminosity ** 0.25) / Math.sqrt(au);
    this.system = {
      star: { id: star.id, q: star.q, r: star.r, mass: star.mass, solarMasses, luminosity },
      planet: {
        id: best.body.id,
        q: best.body.q,
        r: best.body.r,
        mass: best.body.mass,
        earthMasses: best.body.mass / EARTH_MASS,
        distanceAU: au,
        orbitCells: best.distance,
        equilibriumK,
      },
      habitableZoneCells: hz,
      bodies: this.bodies.length,
    };
    return this.system;
  }
}
