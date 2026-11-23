import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/rng.js';
import { TemporalField } from '../src/temporal-field.js';
import { hexagonRegion, wrappedHexGrid } from '../src/hex.js';
import { VoidLattice } from '../src/void.js';
import { Planet } from '../src/planet.js';

test('rng is deterministic per seed and stays in [0, 1)', () => {
  const a = new Rng('x');
  const b = new Rng('x');
  const c = new Rng('y');
  const seqA = Array.from({ length: 100 }, () => a.float());
  const seqB = Array.from({ length: 100 }, () => b.float());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, Array.from({ length: 100 }, () => c.float()));
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
});

test('temporal field slews toward its target without overshooting', () => {
  const f = new TemporalField({ dilation: 1, slew: 2 });
  f.setTarget(10);
  const seen = [];
  for (let i = 0; i < 6; i++) seen.push(f.tick());
  assert.deepEqual(seen, [1, 2, 4, 8, 10, 10]);
  assert.equal(f.interiorYears, 35);
  f.setTarget(3);
  f.tick();
  assert.equal(f.dilation, 5);
  f.tick();
  assert.equal(f.dilation, 3);
  assert.ok(f.settled);
  assert.equal(f.exteriorSeconds, 8 / 60);
});

test('temporal field rejects a slew that could not change the rate', () => {
  assert.throws(() => new TemporalField({ slew: 1 }), RangeError);
});

test('hexagon region has 3R(R+1)+1 cells and symmetric adjacency', () => {
  for (const radius of [1, 4, 9]) {
    const g = hexagonRegion(radius);
    assert.equal(g.size, 3 * radius * (radius + 1) + 1);
    g.neighbors.forEach((nb, i) => nb.forEach((j) => assert.ok(g.neighbors[j].includes(i))));
    const centre = g.indexOf(0, 0);
    assert.equal(g.neighbors[centre].length, 6);
    assert.equal(g.within(centre, 2).length, radius >= 2 ? 19 : 7);
  }
});

test('planet grid wraps east-west but not across the poles', () => {
  const g = wrappedHexGrid(12, 8);
  g.neighbors.forEach((nb, i) => {
    assert.equal(new Set(nb).size, nb.length);
    nb.forEach((j) => assert.ok(g.neighbors[j].includes(i), `${i} <-> ${j}`));
    const edgeRow = g.row[i] === 0 || g.row[i] === 7;
    assert.equal(nb.length, edgeRow ? 4 : 6);
  });
  const westEdge = 2 * 12; // row 2, column 0
  assert.ok(g.neighbors[westEdge].includes(2 * 12 + 11));
});

test('void conserves matter through condensation and accretion', () => {
  const v = new VoidLattice(new Rng('conserve'), { radius: 12 });
  const total = v.totalMass;
  let ticks = 0;
  while (!v.settled && ticks++ < 2000) {
    v.step(5e6);
    const dust = v.mass.reduce((a, b) => a + b, 0);
    const bodies = v.bodies.reduce((a, b) => a + b.mass, 0);
    assert.ok(Math.abs(dust + bodies - total) < 1e-6 * total);
  }
  assert.ok(v.settled);
  assert.ok(v.bodies[0].mass / total >= 0.45, 'the star holds the ignition share');
});

test('habitable systems put the planet in the habitable zone', () => {
  let found = 0;
  for (let s = 0; s < 6; s++) {
    const v = new VoidLattice(new Rng(`hz${s}`));
    while (!v.settled) v.step(1e7);
    const sys = v.resolveSystem();
    if (!sys) continue;
    found += 1;
    const ratio = sys.planet.orbitCells / sys.habitableZoneCells;
    assert.ok(ratio > Math.exp(-0.3) - 1e-9 && ratio < Math.exp(0.3) + 1e-9);
    assert.ok(sys.planet.mass < sys.star.mass * 0.08);
  }
  assert.ok(found >= 3, `only ${found} of 6 voids made a habitable system`);
});

test('planet cools, then rains', () => {
  const p = new Planet(new Rng('rain'), { equilibriumK: 255 });
  const landShare = p.land.reduce((a, b) => a + b, 0) / p.size;
  assert.ok(landShare > 0.3 && landShare < 0.4);
  assert.ok(p.continents.length >= 1);
  assert.equal(p.oceansFormed, false);
  let rained = 0;
  for (let t = 0; t < 200 && !rained; t++) rained = p.step(1e7) ? p.age : 0;
  assert.ok(rained > 0, 'oceans formed');
  assert.ok(p.meanSurfaceK < 373);
});
