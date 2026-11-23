#!/usr/bin/env node
// Run a microverse headless and print its history.
//
//   node bin/microverse.js [--seed NAME] [--after YEARS] [--all-impacts] [--json]

import { Microverse } from '../src/microverse.js';
import { SOURCES } from '../src/civilization.js';
import { formatYears, formatShortYears, formatPower, formatPeople } from '../src/format.js';

function parseArgs(argv) {
  const opts = { seed: 'spark', after: 0, json: false, allImpacts: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') opts.seed = argv[++i];
    else if (a === '--after') opts.after = Number(argv[++i]);
    else if (a === '--json') opts.json = true;
    else if (a === '--all-impacts') opts.allImpacts = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`unknown option ${a}`);
  }
  if (!(opts.after >= 0)) throw new Error('--after takes a number of years');
  return opts;
}

const HELP = `Usage: microverse [--seed NAME] [--after YEARS] [--all-impacts] [--json]

  --seed NAME     seed for the void's vacuum fluctuations (default "spark")
  --after YEARS   keep the field running this many years after the grid goes planetary
  --all-impacts   list small impacts too, not only the ones that leave a mark
  --json          print the full report as JSON`;

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n\n${HELP}`);
    process.exit(2);
  }
  if (opts.help) {
    console.log(HELP);
    return;
  }

  const m = new Microverse({ seed: opts.seed });
  m.run();
  if (!m.done) {
    console.error(`Seed "${opts.seed}" did not reach a planetary grid within the tick budget (stopped in phase ${m.phase}).`);
    process.exit(1);
  }
  if (opts.after > 0) {
    const stop = m.years + opts.after;
    m.run({ until: (x) => x.years >= stop, maxTicks: m.tick + Math.ceil(opts.after) + 10 });
  }

  const report = m.report();
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { star, planet } = report.system;
  const c = report.civilization;
  console.log(`MICROVERSE  seed "${report.seed}"`);
  console.log(`Field ran ${report.ticks} ticks: ${report.exteriorSeconds.toFixed(1)} seconds outside, ${formatYears(report.interiorYears)} inside.\n`);
  // Timestamps count from the void, then from the first fires (+), then from
  // the moment electricity was introduced (year N).
  const fires = report.events.find((e) => e.kind === 'sapience');
  const contact = report.events.find((e) => e.kind === 'contact');
  for (const e of report.events) {
    if (e.kind === 'impact' && !opts.allImpacts && e.radius < 4) continue;
    let when = formatShortYears(e.years);
    if (contact && e.years > contact.years) when = `year ${Math.round(e.years - contact.years)}`;
    else if (fires && e.years > fires.years) when = `+${formatShortYears(e.years - fires.years)}`;
    console.log(`${when.padStart(11)}  ${e.text}`);
  }
  const since = (y) => (report.interiorYears - y < 1 ? 'this year' : `${formatYears(report.interiorYears - y)} ago`);
  console.log(`
Star       ${star.solarMasses.toFixed(2)} solar masses, ${star.luminosity.toFixed(2)} L(sun)
Planet     ${planet.name}: ${planet.earthMasses.toFixed(1)} Earth masses at ${planet.distanceAU.toFixed(2)} AU, ${planet.continents} continents
Species    ${c.species}: ${formatPeople(c.population)} on ${c.continentsSettled} continents
Contact    electricity introduced ${since(c.electricityIntroducedAt)}
Grid       went planetary ${since(c.planetaryGridAt)}; ${Math.round(c.electrifiedShare * 100)}% of the population connected
Generation ${formatPower(c.capacityGW)}`);
  const total = c.capacityGW || 1;
  for (const s of SOURCES) {
    const gw = c.bySourceGW[s];
    if (gw <= 0) continue;
    const bar = '█'.repeat(Math.round((gw / total) * 30));
    console.log(`  ${s.padEnd(11)}${formatPower(gw).padStart(10)}  ${bar}`);
  }
}

main();
