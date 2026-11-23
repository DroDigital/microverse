import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Microverse, PHASES } from '../src/microverse.js';
import { SAPIENCE_LEVEL } from '../src/biosphere.js';

const phaseIndex = (id) => PHASES.findIndex((p) => p.id === id);

test('a seeded microverse replays the same history', () => {
  const a = new Microverse({ seed: 'replay' }).run();
  const b = new Microverse({ seed: 'replay' }).run();
  assert.deepEqual(a.events, b.events);
  assert.equal(a.years, b.years);
});

for (const seed of ['spark', 'a', 'b', 'c', 'quiet', 'ember']) {
  test(`seed "${seed}" reaches intelligent life, then a planetary grid`, () => {
    const m = new Microverse({ seed }).run();
    assert.equal(m.phase, 'global', `stopped in ${m.phase}`);

    // Phases only move forward, except that life may die out and restart.
    let last = 0;
    for (const e of m.events) {
      const i = phaseIndex(e.phase);
      if (e.kind === 'extinction') last = phaseIndex('abiogenesis');
      assert.ok(i >= last, `${e.phase} after ${PHASES[last].id}`);
      last = i;
    }

    const kinds = m.events.map((e) => e.kind);
    const order = ['ignition', 'planet', 'oceans', 'life', 'sapience', 'contact', 'global'];
    const at = order.map((k) => kinds.lastIndexOf(k));
    at.forEach((idx, k) => assert.ok(idx >= 0, `missing ${order[k]}`));
    for (let k = 1; k < at.length; k++) assert.ok(at[k] > at[k - 1], `${order[k]} before ${order[k - 1]}`);

    const r = m.report();
    assert.ok(r.civilization.electrifiedShare >= 0.9);
    assert.ok(r.civilization.capacityGW > 0);
    assert.ok(r.civilization.planetaryGridAt > r.civilization.electricityIntroducedAt);
    assert.ok(m.biosphere.complexity[m.awakeningCell] >= SAPIENCE_LEVEL - 0.5);
  });
}

test('the field braked to one year per tick before contact', () => {
  const m = new Microverse({ seed: 'brake' }).run();
  const contact = m.events.find((e) => e.kind === 'contact');
  const tick = m.history.find((h) => h.tick === contact.tick);
  assert.ok(tick.dilation <= 1.25, `dilation at contact was ${tick.dilation}`);
  const evolving = m.history.filter((h) => h.phase === 'evolution');
  assert.ok(Math.max(...evolving.map((h) => h.dilation)) >= 1e6);
});

test('with auto-introduction off, the species waits for you', () => {
  const m = new Microverse({ seed: 'manual', autoIntroduce: false });
  m.run({ until: (x) => x.phase === 'civilization' && x.civ.era >= 4 });
  const waitUntil = m.tick + 400;
  m.run({ until: (x) => x.tick >= waitUntil, maxTicks: waitUntil });
  assert.equal(m.phase, 'civilization');
  assert.equal(m.civ.electrified, false);

  // Introduce it somewhere other than the capital.
  const capital = m.civ.capital();
  let cell = -1;
  for (let i = 0; i < m.planet.size; i++) {
    if (i !== capital && m.civ.population[i] > 0) {
      cell = i;
      break;
    }
  }
  assert.ok(cell >= 0);
  assert.equal(m.introduceElectricity(cell), true);
  assert.equal(m.introduceElectricity(cell), false, 'only once');
  m.run();
  assert.equal(m.phase, 'global');
  assert.equal(m.civ.contactCell, cell);
});
