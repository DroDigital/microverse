# microverse

Put a spatially tessellated void inside a modified temporal field and run it
until a planet develops intelligent life. Then introduce that life to
electricity and watch them generate it on a global scale.

It's a deterministic, dependency-free simulation (plain JavaScript, Node 18+)
with a command-line runner and a browser console that draws the whole thing.

```bash
npm run sim                      # run seed "spark" and print its history
npm run sim -- --seed ember --after 200
npm test
npm run build                    # writes dist/microverse.html; open it in a browser
```

## What happens inside

The experiment runs through eight phases. The temporal field speeds up or
slows down for each one, because nothing interesting happens on the same
timescale twice.

| Phase | What the simulation does | Field rate (years per tick) |
| --- | --- | --- |
| Cosmogenesis | A hexagon of ~1,000 hex cells gets near-uniform matter plus a faint protostellar overdensity. Matter slides down a softened potential into clumps, the clumps fall together and merge, and the first body to hold 45% of the void's matter ignites as a star. A rocky body in the star's habitable zone becomes the planet. Voids with no such planet are re-tessellated. | 10 million |
| Planet cooling | The planet gets fractal continents on a 48×26 hex globe that wraps east-west, a latitude and altitude climate, and a molten crust that cools until the first rains fill the basins. | 10 million |
| Awaiting life | Each warm ocean cell has a small chance per year of self-replicating chemistry. | 10 million |
| Evolution | Populations spread, out-compete simpler neighbours and drift up a complexity ladder: nucleated cells, multicellular life, nervous systems, life on land, large brains. Impacts (frequent early, rarer later) sterilize regions and can cause impact winters. | 20 million down to 0.5 million as complexity climbs |
| Awakening | A land lineage starts making tools. The field brakes hard so the species' history can be followed in centuries rather than eons. | braking to 300 |
| Civilization | The species spreads, farms, builds cities and sails between continents, then stalls at a pre-electric ceiling. | 300 |
| Electrification | Contact: the field brakes to one year per tick and electricity is introduced at their largest settlement (or wherever you click). Know-how spreads overland and along sea lanes. Each settlement builds capacity toward demand from what its land offers: hydro from steep wet terrain, combustion from fossil fuel laid down by billions of years of buried biomass, then wind and solar. Steamships reach the remaining continents and undersea cables tie the grids together. | 1 |
| Planetary grid | Reached when every liveable continent has generation, at least 90% of the population is connected, and the grids are cable-linked. The field holds at real time and the grid keeps growing; fossil fuel runs down and renewables take over. | 1 |

The field never changes rate instantly. It slews by at most a factor of 1.25
per tick, so time visibly accelerates and brakes. One tick is 1/60 of a second
on the field's outside clock.

Everything random flows through one seeded generator, so a seed always replays
the same history. Across 200 test seeds, every run reached a planetary grid,
after a median of about 1,470 ticks (about 25 seconds of outside time) and 4 to
11 billion years of inside time.

## Command line

```
node bin/microverse.js [--seed NAME] [--after YEARS] [--all-impacts] [--json]
```

`--after` keeps the field running for that many years after the grid goes
planetary. `--json` prints the full report, including every event.

## Browser console

`npm run build` bundles the engine and the UI into one self-contained file,
`dist/microverse.html`. It shows the void, then the planet, along with the
field's rate and clocks, the phase track, live readouts and a log. Drag the
map to turn the globe. Turn off **Automatic** under First contact to choose
when electricity is introduced, then click a settlement to choose where.
From devtools, `microverse.sim` is the running simulation and
`microverse.fastForward(m => m.done)` skips ahead.

## Using the engine

```js
import { Microverse } from './src/index.js';

const m = new Microverse({ seed: 'ember', autoIntroduce: false });
m.run({ until: (x) => x.phase === 'civilization' && x.civ.era >= 4 });
m.introduceElectricity();          // or introduceElectricity(cellIndex)
m.run();                           // until the grid is planetary
console.log(m.summary());
console.log(m.report().civilization);
```

## Layout

```
src/rng.js              seeded random numbers
src/hex.js              hexagonal regions, wrapped hex globes, search helpers
src/temporal-field.js   the time-dilation field
src/void.js             condensation, accretion, star and planet
src/planet.js           terrain, climate, cooling, continents
src/biosphere.js        abiogenesis, evolution, impacts, sapience
src/civilization.js     settlement, technology, electrification, the grid
src/microverse.js       the phase machine that ties it together
bin/microverse.js       command-line runner
web/                    browser console (template and app)
scripts/build.js        bundles web/ and src/ into one HTML file
test/                   node:test suites
```
