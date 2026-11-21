// Browser console for the microverse: draws the void and the planet on a
// canvas and keeps the field readouts, phase track and log up to date.

import { Microverse, PHASES } from '../src/microverse.js';
import { SOURCES, ERAS, ELECTRIC_ERAS } from '../src/civilization.js';
import { MILESTONES } from '../src/biosphere.js';
import { axialToPixel } from '../src/hex.js';
import { TICKS_PER_SECOND } from '../src/temporal-field.js';
import { formatYears, formatShortYears, formatPower, formatPeople } from '../src/format.js';

const SQRT3 = Math.sqrt(3);
const SEEDS = ['spark', 'ember', 'lattice', 'halcyon', 'tessera', 'vesper', 'umbra', 'cinder', 'kiln', 'ozone', 'argent', 'loom', 'marrow', 'quill', 'basalt', 'nimbus'];
const KEY_EVENTS = new Set(['ignition', 'planet', 'oceans', 'life', 'sapience', 'contact', 'global']);
const HEX_CORNERS = Array.from({ length: 6 }, (_, k) => {
  const a = (Math.PI / 180) * (60 * k - 30);
  return [Math.cos(a), Math.sin(a)];
});
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const ctx = canvas.getContext('2d');

// ---------------------------------------------------------------- colours

let colors = {};
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const rgb = (c, alpha = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (name) => cs.getPropertyValue(name).trim();
  const names = ['scene', 'scene-ink', 'scene-dust', 'scene-star', 'scene-field', 'scene-ocean-deep', 'scene-ocean',
    'scene-land-low', 'scene-land-high', 'scene-peak', 'scene-ice', 'scene-molten', 'scene-rock', 'scene-life',
    'scene-mind', 'scene-people', 'scene-light', 'src-hydro', 'src-combustion', 'src-wind', 'src-solar'];
  colors = { css: {} };
  for (const n of names) {
    const v = get(`--${n}`) || '#888888';
    colors.css[n] = v;
    colors[n] = hexToRgb(v);
  }
  colors.css.accent = get('--accent');
  colors.css.muted = get('--muted');
  colors.css.line = get('--line');
  colors.font = getComputedStyle(document.body).fontFamily;
}

// ---------------------------------------------------------------- state

const state = {
  m: null,
  running: true,
  speed: 1,
  view: 'auto',
  lonOffset: 0,
  hover: -1,
  logged: 0,
  flashes: [],
  frame: 0,
  layout: null,
  pointer: null,
  cablePairs: null,
};

function newRun(seed) {
  state.m = new Microverse({ seed, autoIntroduce: $('auto').checked });
  state.logged = 0;
  state.flashes = [];
  state.hover = -1;
  state.lonOffset = 0;
  state.cablePairs = null;
  $('log').replaceChildren();
  $('seed').value = seed;
  updatePanel();
}

// ---------------------------------------------------------------- drawing

function fillHex(x, y, r, color) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const [cx, cy] = HEX_CORNERS[k];
    if (k === 0) ctx.moveTo(x + cx * r, y + cy * r);
    else ctx.lineTo(x + cx * r, y + cy * r);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function glow(x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgb(color, alpha));
  g.addColorStop(1, rgb(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function currentView() {
  if (state.view === 'planet' && state.m.planet) return 'planet';
  if (state.view === 'void') return 'void';
  return state.m.planet ? 'planet' : 'void';
}

function render(now) {
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = colors.css.scene;
  ctx.fillRect(0, 0, W, H);
  if (currentView() === 'void') drawVoid(now);
  else drawPlanet(now);
}

function drawVoid(now) {
  const m = state.m;
  const v = m.void;
  const W = canvas.width, H = canvas.height;
  const R = v.grid.radius;
  const size = Math.min(W / (SQRT3 * (2 * R + 1) + 1.5), H / (3 * R + 3.2)) * 0.94;
  const ox = W / 2, oy = H / 2;
  state.layout = { kind: 'void', size, ox, oy };

  // The field boundary.
  const t = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now / 900);
  const boundary = SQRT3 * size * (R + 0.85);
  ctx.save();
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k;
    const x = ox + Math.cos(a) * boundary, y = oy + Math.sin(a) * boundary;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const tint = ctx.createRadialGradient(ox, oy, boundary * 0.2, ox, oy, boundary);
  tint.addColorStop(0, rgb(colors['scene-field'], 0));
  tint.addColorStop(1, rgb(colors['scene-field'], 0.12 + 0.06 * t));
  ctx.fillStyle = tint;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, size * 0.18);
  ctx.strokeStyle = rgb(colors['scene-field'], 0.55 + 0.35 * t);
  ctx.shadowColor = colors.css['scene-field'];
  ctx.shadowBlur = size * 1.2;
  ctx.stroke();
  ctx.restore();

  // Dust.
  for (let i = 0; i < v.grid.size; i++) {
    const { q, r } = v.grid.cells[i];
    const p = axialToPixel(q, r, size);
    const b = clamp01(Math.log1p(v.mass[i]) / Math.log1p(9));
    const c = mix(colors.scene, colors['scene-dust'], 0.12 + 0.88 * b);
    fillHex(ox + p.x, oy + p.y, size * 0.93, rgb(b > 0.75 ? mix(c, colors['scene-ink'], (b - 0.75) * 2) : c));
  }

  // Bodies.
  const sys = m.system && m.void === v ? m.system : null;
  const starBody = v.stage === 'ignited' ? v.bodies[0] : null;
  if (sys) {
    const s = axialToPixel(sys.star.q, sys.star.r, size);
    const hz = sys.habitableZoneCells * SQRT3 * size;
    ctx.beginPath();
    ctx.arc(ox + s.x, oy + s.y, hz * Math.exp(0.3), 0, Math.PI * 2);
    ctx.arc(ox + s.x, oy + s.y, hz * Math.exp(-0.3), 0, Math.PI * 2, true);
    ctx.fillStyle = rgb(colors['scene-life'], 0.08);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ox + s.x, oy + s.y, sys.planet.orbitCells * SQRT3 * size, 0, Math.PI * 2);
    ctx.strokeStyle = rgb(colors['scene-ink'], 0.35);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const body of v.bodies) {
    const p = axialToPixel(body.q, body.r, size);
    const x = ox + p.x, y = oy + p.y;
    const r = size * (0.45 + 0.22 * Math.sqrt(body.mass) / 3);
    if (body === starBody) {
      glow(x, y, size * 9, colors['scene-star'], 0.35);
      glow(x, y, size * 3.2, colors['scene-star'], 0.9);
      fillHex(x, y, size * 1.1, rgb(mix(colors['scene-star'], [255, 255, 255], 0.6)));
    } else {
      glow(x, y, r * 2.2, colors['scene-dust'], 0.5);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = rgb(mix(colors['scene-dust'], colors['scene-ink'], 0.6));
      ctx.fill();
    }
    if (sys && body.id === sys.planet.id) {
      ctx.beginPath();
      ctx.arc(x, y, r + size * 1.2, 0, Math.PI * 2);
      ctx.strokeStyle = rgb(colors['scene-life'], 0.95);
      ctx.lineWidth = Math.max(1.5, size * 0.2);
      ctx.stroke();
      ctx.font = `${Math.max(11, size * 1.5) | 0}px ${colors.font}`;
      ctx.fillStyle = colors.css['scene-ink'];
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.planet.name, x + r + size * 2, y);
    }
  }

  const stage = { condensation: 'condensing', accretion: 'accreting', ignited: 'star lit' }[v.stage];
  $('caption-left').textContent = `Void · ${v.grid.size.toLocaleString('en-US')} hex cells · ${stage}${m.voidAttempts > 1 ? ` · attempt ${m.voidAttempts}` : ''}`;
  $('caption-right').textContent = v.bodies.length ? `${v.bodies.length} bodies · largest ${(v.largestShare * 100).toFixed(0)}% of matter` : '';
}

function planetLayout(p) {
  const W = canvas.width, H = canvas.height;
  const g = p.grid;
  const size = Math.min(W / (SQRT3 * g.width), (H - 8) / (1.5 * (g.height - 1) + 2));
  const mapW = SQRT3 * size * g.width;
  const mapH = size * (1.5 * (g.height - 1) + 2);
  return { kind: 'planet', size, ox: (W - mapW) / 2, oy: (H - mapH) / 2, mapW };
}

function cellCentre(L, g, i) {
  const col = (((g.col[i] + state.lonOffset) % g.width) + g.width) % g.width;
  return [L.ox + SQRT3 * L.size * (col + 0.5 + 0.5 * (g.row[i] & 1)), L.oy + L.size * (1 + 1.5 * g.row[i])];
}

function terrainColor(p, i) {
  if (!p.oceansFormed) {
    const heat = clamp01(p.residualHeatK / 700);
    const crust = mix(colors['scene-rock'], colors['scene-molten'], heat * (0.55 + 0.45 * clamp01(0.5 - p.elevation[i] / 8)));
    return crust;
  }
  const temp = p.temperature(i);
  if (p.land[i]) {
    const e = p.elevation[i] / 6;
    let c = e < 0.55 ? mix(colors['scene-land-low'], colors['scene-land-high'], e / 0.55)
      : mix(colors['scene-land-high'], colors['scene-peak'], (e - 0.55) / 0.45);
    if (temp < 262) c = mix(c, colors['scene-ice'], clamp01((262 - temp) / 14));
    return c;
  }
  if (p.isIce(i)) return mix(colors['scene-ice'], colors['scene-ocean'], 0.2);
  return mix(colors['scene-ocean'], colors['scene-ocean-deep'], clamp01(-p.elevation[i] / 4));
}

function drawPlanet(now) {
  const m = state.m;
  const p = m.planet;
  const g = p.grid;
  const b = m.biosphere;
  const civ = m.civ;
  const L = planetLayout(p);
  state.layout = L;
  const electric = civ && civ.electrified;
  const sun = reduceMotion ? 1.2 : now / 4000;
  const dayness = (i) => (electric ? Math.cos(g.longitude(i) - sun) : 1);
  const r = L.size * 1.02;

  ctx.save();
  ctx.beginPath();
  ctx.rect(L.ox, 0, L.mapW, canvas.height);
  ctx.clip();

  for (let i = 0; i < g.size; i++) {
    let c = terrainColor(p, i);
    if (b && b.biomass[i] > 0) {
      const life = mix(colors['scene-life'], colors['scene-mind'], clamp01(b.complexity[i] / 6) ** 1.5);
      c = mix(c, life, b.biomass[i] * (civ ? 0.18 : p.land[i] ? 0.45 : 0.25));
    }
    if (civ && civ.population[i] > 0) {
      c = mix(c, colors['scene-people'], Math.min(0.45, 0.08 + 0.07 * Math.log10(1 + civ.population[i] * 100)));
    }
    if (electric) {
      const d = dayness(i);
      c = scale(c, 0.3 + 0.7 * clamp01(0.5 + d * 1.6));
    }
    const [x, y] = cellCentre(L, g, i);
    fillHex(x, y, r, rgb(c));
    // The globe wraps: a cell hanging off the east edge shows again in the west.
    if (x + (SQRT3 * L.size) / 2 > L.ox + L.mapW) fillHex(x - L.mapW, y, r, rgb(c));
  }

  if (civ) drawCivilization(L, g, civ, dayness, now);
  drawFlashes(L, g, now);

  if (state.hover >= 0 && state.hover < g.size) {
    const [x, y] = cellCentre(L, g, state.hover);
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const [cx, cy] = HEX_CORNERS[k];
      if (k === 0) ctx.moveTo(x + cx * r, y + cy * r);
      else ctx.lineTo(x + cx * r, y + cy * r);
    }
    ctx.closePath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.css['scene-ink'];
    ctx.stroke();
  }
  ctx.restore();

  const what = !p.oceansFormed ? `molten · ${Math.round(p.meanSurfaceK)} K surface`
    : electric ? 'night side shows the grid'
    : civ ? `${formatPeople(civ.totals().population)} ${m.species}`
    : b && b.alive ? `life in ${b.livingCells.toLocaleString('en-US')} cells`
    : 'sterile oceans';
  $('caption-left').textContent = `${p.name} · ${g.width}×${g.height} hex globe · ${what}`;
  $('caption-right').textContent = state.hover >= 0 ? describeCell(state.hover) : 'Drag to turn the globe';
}

function drawCivilization(L, g, civ, dayness, now) {
  const p = state.m.planet;
  const lit = (i) => civ.capacity[i] > 0 && civ.population[i] > 0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Transmission lines: a tree grown outward from the first lamp, so the
  // network reads as trunk lines and branches rather than a mesh.
  if (civ.electrified && civ.electricLevel >= 2) {
    ctx.strokeStyle = rgb(colors['scene-light'], 0.32);
    ctx.lineWidth = Math.max(1, L.size * 0.1);
    ctx.beginPath();
    for (const [i, j] of gridTree(g, civ, lit)) {
      const [x1, y1] = cellCentre(L, g, i);
      const [x2, y2] = cellCentre(L, g, j);
      if (Math.abs(x2 - x1) > L.mapW / 2) continue;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
  // Undersea cables, one per pair of connected continents.
  if (civ.electrified && civ.electricLevel >= 3) {
    if (!state.cablePairs) state.cablePairs = cablePairs(civ, p);
    ctx.strokeStyle = rgb(colors['scene-light'], 0.7);
    ctx.lineWidth = Math.max(1, L.size * 0.12);
    ctx.setLineDash([L.size * 0.5, L.size * 0.4]);
    for (const [i, j] of state.cablePairs) {
      if (!lit(i) || !lit(j)) continue;
      const [x1, y1] = cellCentre(L, g, i);
      let [x2, y2] = cellCentre(L, g, j);
      if (x2 - x1 > L.mapW / 2) x2 -= L.mapW;
      if (x1 - x2 > L.mapW / 2) x2 += L.mapW;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // City lights.
  for (let i = 0; i < g.size; i++) {
    if (!lit(i)) continue;
    const [x, y] = cellCentre(L, g, i);
    const night = clamp01(0.5 - dayness(i) * 1.6);
    const strength = clamp01(Math.log10(1 + civ.capacity[i]) / 2.5);
    glow(x, y, L.size * (0.55 + 0.6 * strength), colors['scene-light'], (0.08 + 0.5 * night) * (0.3 + 0.7 * strength));
  }
  ctx.restore();

  // Where the first lamp was lit, and where the first fires were.
  const marker = civ.contactCell ?? state.m.awakeningCell;
  if (marker != null) {
    const [x, y] = cellCentre(L, g, marker);
    const pulse = reduceMotion ? 0.5 : (now / 1400) % 1;
    ctx.beginPath();
    ctx.arc(x, y, L.size * (1.2 + 2.2 * pulse), 0, Math.PI * 2);
    ctx.strokeStyle = rgb(civ.contactCell != null ? colors['scene-light'] : colors['scene-people'], 0.9 * (1 - pulse));
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// Breadth-first spanning forest over electrified cells, rooted at the
// contact site where possible. Returns [child, parent] pairs.
function gridTree(g, civ, lit) {
  const parent = new Int32Array(g.size).fill(-2);
  const edges = [];
  const roots = civ.contactCell != null && lit(civ.contactCell) ? [civ.contactCell] : [];
  for (let i = 0; i < g.size; i++) roots.push(i);
  for (const root of roots) {
    if (parent[root] !== -2 || !lit(root)) continue;
    parent[root] = -1;
    const queue = [root];
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      for (const j of g.neighbors[i]) {
        if (parent[j] !== -2 || !lit(j)) continue;
        parent[j] = i;
        edges.push([j, i]);
        queue.push(j);
      }
    }
  }
  return edges;
}

function cablePairs(civ, planet) {
  const best = new Map();
  for (const [i, lanes] of civ.seaLanes) {
    for (const j of lanes) {
      const a = planet.continentOf[i], b = planet.continentOf[j];
      if (a < 0 || b < 0) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!best.has(key)) best.set(key, [i, j]);
    }
  }
  return [...best.values()];
}

function drawFlashes(L, g, now) {
  state.flashes = state.flashes.filter((f) => now - f.start < f.duration);
  for (const f of state.flashes) {
    const t = clamp01((now - f.start) / f.duration);
    const [x, y] = cellCentre(L, g, f.cell);
    ctx.beginPath();
    ctx.arc(x, y, L.size * (1 + (f.radius + 2) * 1.6 * t), 0, Math.PI * 2);
    ctx.strokeStyle = rgb(f.color, 1 - t);
    ctx.lineWidth = Math.max(2, L.size * 0.3 * (1 - t));
    ctx.stroke();
    if (f.cells) {
      for (const c of f.cells) {
        const [cx, cy] = cellCentre(L, g, c);
        fillHex(cx, cy, L.size, rgb(f.color, 0.55 * (1 - t)));
      }
    }
  }
}

function describeCell(i) {
  const m = state.m;
  const p = m.planet;
  const lat = (p.grid.latitude(i) * 180) / Math.PI;
  const parts = [`${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'}`, `${Math.round(p.temperature(i) - 273.15)} °C`];
  parts.push(p.land[i] ? `${p.elevation[i].toFixed(1)} km` : p.oceansFormed ? 'ocean' : 'basin');
  const b = m.biosphere;
  if (b && b.biomass[i] > 0 && !m.civ) {
    const level = Math.min(MILESTONES.length - 1, Math.floor(b.complexity[i]));
    parts.push(MILESTONES[level]);
  }
  const civ = m.civ;
  if (civ && civ.population[i] > 0) {
    parts.push(formatPeople(civ.population[i]));
    if (civ.capacity[i] > 0) parts.push(formatPower(civ.capacity[i]));
  }
  return parts.join(' · ');
}

// ---------------------------------------------------------------- panel

function renderPhases() {
  const list = $('phases');
  list.replaceChildren(...PHASES.map((p, k) => {
    const li = document.createElement('li');
    li.dataset.phase = p.id;
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = String(k + 1);
    li.append(n, p.label);
    return li;
  }));
}

const sentence = (name) => {
  const s = name.replace(/^a /, '');
  return s[0].toUpperCase() + s.slice(1);
};

function row(dt, dd) {
  const a = document.createElement('dt');
  a.textContent = dt;
  const b = document.createElement('dd');
  b.textContent = dd;
  return [a, b];
}

function formatOutside(seconds) {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const min = Math.floor(seconds / 60);
  return `${min} min ${Math.floor(seconds % 60)} s`;
}

function readoutRows(m) {
  const rows = [];
  const v = m.void;
  if (m.phase === 'void') {
    rows.push(['Stage', { condensation: 'Condensation', accretion: 'Accretion', ignited: 'Ignition' }[v.stage]]);
    rows.push(['Bodies', v.bodies.length ? String(v.bodies.length) : '—']);
    rows.push(['Matter moving', `${(Math.min(1, v.flow) * 100).toFixed(1)}%`]);
    if (v.mergers) rows.push(['Mergers', String(v.mergers)]);
    return rows;
  }
  const s = m.system;
  const p = m.planet;
  if (m.phase === 'cooling' || m.phase === 'abiogenesis') {
    rows.push(['Star', `${s.star.solarMasses.toFixed(2)} M☉ · ${s.star.luminosity.toFixed(2)} L☉`]);
    rows.push(['Orbit', `${s.planet.distanceAU.toFixed(2)} AU`]);
    rows.push(['Surface', `${Math.round(p.meanSurfaceK)} K`]);
    rows.push(['Oceans', p.oceansFormed ? 'Yes' : 'Not yet']);
    return rows;
  }
  const b = m.biosphere;
  if (m.phase === 'evolution' || m.phase === 'awakening') {
    rows.push(['Most complex', b.milestone >= 0 ? MILESTONES[Math.min(b.milestone, MILESTONES.length - 1)] : '—']);
    rows.push(['Complexity', `${b.maxComplexity.toFixed(2)} / 6`]);
    rows.push(['Living cells', `${Math.round((b.livingCells / p.size) * 100)}%`]);
    rows.push(['Impacts', String(b.impacts)]);
    return rows;
  }
  const civ = m.civ;
  const t = civ.totals();
  rows.push(['Species', m.species]);
  rows.push(['Population', formatPeople(t.population)]);
  rows.push(['Continents', `${civ.continentsSettled()} of ${p.continents.length}`]);
  if (!civ.electrified) {
    rows.push(['Age', sentence(ERAS[civ.era].name)]);
    rows.push(['Since first fires', formatYears(civ.yearsSinceSapience)]);
  } else {
    rows.push(['Age', sentence(ELECTRIC_ERAS[Math.floor(civ.electricLevel)].name)]);
    rows.push(['Connected', `${Math.round((t.population ? t.served / t.population : 0) * 100)}%`]);
    rows.push(['Generating', formatPower(t.capacity)]);
  }
  return rows;
}

function updatePower(m) {
  const civ = m.civ;
  const box = $('power');
  if (!civ || !civ.electrified) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const t = civ.totals();
  const total = t.bySource.reduce((a, b) => a + b, 0);
  $('mix').replaceChildren(...SOURCES.map((s, k) => {
    const span = document.createElement('span');
    span.style.width = `${total ? (t.bySource[k] / total) * 100 : 0}%`;
    span.style.background = colors.css[`src-${s}`];
    span.title = `${s}: ${formatPower(t.bySource[k])}`;
    return span;
  }));
  $('mix-legend').replaceChildren(...SOURCES.filter((s, k) => t.bySource[k] > 0).map((s) => {
    const k = SOURCES.indexOf(s);
    const item = document.createElement('span');
    const sw = document.createElement('i');
    sw.style.background = colors.css[`src-${s}`];
    item.append(sw, `${s} ${total ? Math.round((t.bySource[k] / total) * 100) : 0}%`);
    return item;
  }));
  drawSpark(m);
}

function drawSpark(m) {
  const c = $('spark');
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
  if (!w || !h) return;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const s = c.getContext('2d');
  s.clearRect(0, 0, w, h);
  const start = m.civ.introducedAt;
  const pts = m.history.filter((x) => x.years >= start);
  if (pts.length < 2) return;
  const maxY = Math.max(...pts.map((x) => x.capacity)) || 1;
  const span = pts[pts.length - 1].years - start || 1;
  const pad = 4 * dpr;
  const X = (x) => pad + ((x.years - start) / span) * (w - 2 * pad);
  const Y = (x) => h - pad - (x.capacity / maxY) * (h - 2 * pad - 10 * dpr);
  s.strokeStyle = colors.css.line;
  s.lineWidth = dpr;
  s.beginPath();
  s.moveTo(pad, h - pad);
  s.lineTo(w - pad, h - pad);
  s.stroke();
  s.beginPath();
  s.moveTo(X(pts[0]), h - pad);
  for (const x of pts) s.lineTo(X(x), Y(x));
  s.lineTo(X(pts[pts.length - 1]), h - pad);
  s.closePath();
  s.globalAlpha = 0.18;
  s.fillStyle = colors.css.accent;
  s.fill();
  s.globalAlpha = 1;
  s.beginPath();
  pts.forEach((x, k) => (k ? s.lineTo(X(x), Y(x)) : s.moveTo(X(x), Y(x))));
  s.strokeStyle = colors.css.accent;
  s.lineWidth = 1.5 * dpr;
  s.stroke();
  const last = pts[pts.length - 1];
  s.beginPath();
  s.arc(X(last), Y(last), 2.5 * dpr, 0, Math.PI * 2);
  s.fillStyle = colors.css.accent;
  s.fill();
  s.fillStyle = colors.css.muted;
  s.font = `${10 * dpr}px ${colors.font}`;
  s.textBaseline = 'top';
  s.textAlign = 'left';
  s.fillText(`${formatPower(maxY)} peak · ${Math.round(span)} years since contact`, pad, 0);
}

function updatePanel() {
  const m = state.m;
  const f = m.field;
  const yps = f.dilation * TICKS_PER_SECOND;
  const rate = $('rate');
  rate.firstChild.nodeValue = `${formatShortYears(yps)} `;
  rate.lastChild.textContent = 'per second';
  const pos = (d) => `${clamp01(Math.log10(Math.max(1, d * TICKS_PER_SECOND)) / 9) * 100}%`;
  $('meter-fill').style.width = pos(f.dilation);
  $('meter-target').style.left = pos(f.target);
  $('outside').textContent = formatOutside(f.exteriorSeconds);
  $('inside').textContent = formatYears(f.interiorYears);
  $('field-status').textContent = !state.running ? 'Paused'
    : f.dilation < f.target ? `Accelerating toward ${formatShortYears(f.target * TICKS_PER_SECOND)} per second`
    : f.dilation > f.target ? `Braking toward ${formatShortYears(f.target * TICKS_PER_SECOND)} per second`
    : m.done ? 'Holding at real time. The grid keeps growing.' : 'Holding steady';

  const current = PHASES.findIndex((p) => p.id === m.phase);
  for (const li of $('phases').children) {
    const k = PHASES.findIndex((p) => p.id === li.dataset.phase);
    li.className = k < current ? 'done' : k === current ? 'current' : '';
    if (k === current) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  }

  $('readout').replaceChildren(...readoutRows(m).flatMap(([a, b]) => row(a, b)));
  updatePower(m);

  const btn = $('introduce');
  btn.disabled = !m.canIntroduce;
  btn.classList.toggle('ready', m.canIntroduce);
  const civ = m.civ;
  let hint;
  if (!civ) hint = 'Available once the planet has a civilization.';
  else if (m.pendingContact !== null) hint = 'Braking the field to real time for contact…';
  else if (civ.electrified) hint = `Introduced ${formatYears(m.years - civ.introducedAt)} ago. The flash on the map marks the spot.`;
  else if (m.autoIntroduce) hint = `Contact happens on its own once the ${m.species} have printing and clockwork. Click a settlement on the planet to pick the site yourself.`;
  else hint = `Click a settlement on the planet to pick the site, or press the button to start at the largest one.`;
  $('hint').textContent = hint;

  appendLog(m);
}

function appendLog(m) {
  const list = $('log');
  const sapience = m.events.find((e) => e.kind === 'sapience');
  const contact = m.events.find((e) => e.kind === 'contact');
  while (state.logged < m.events.length) {
    const e = m.events[state.logged++];
    const li = document.createElement('li');
    if (KEY_EVENTS.has(e.kind)) li.className = 'key';
    const time = document.createElement('time');
    if (contact && e.years > contact.years) {
      time.textContent = `year ${Math.round(e.years - contact.years)}`;
      time.title = 'Years after electricity was introduced';
    } else if (sapience && e.years > sapience.years) {
      time.textContent = `+${formatShortYears(e.years - sapience.years)}`;
      time.title = 'Years after the first fires';
    } else {
      time.textContent = formatShortYears(e.years);
    }
    const text = document.createElement('span');
    text.textContent = e.text;
    li.append(time, text);
    list.prepend(li);
  }
}

// Watch new events for things worth flashing on the map.
function collectFlashes(m, from, now) {
  for (let k = from; k < m.events.length; k++) {
    const e = m.events[k];
    if (e.kind === 'impact' && e.cell != null) {
      state.flashes.push({ cell: e.cell, radius: e.radius, cells: e.cells, start: now, duration: 1400, color: colors['scene-molten'] });
    } else if ((e.kind === 'contact' || e.kind === 'sapience' || e.kind === 'life') && e.cell != null) {
      state.flashes.push({ cell: e.cell, radius: 3, start: now, duration: 2200, color: e.kind === 'contact' ? colors['scene-light'] : e.kind === 'life' ? colors['scene-life'] : colors['scene-people'] });
    }
  }
}

// ---------------------------------------------------------------- loop & input

function loop(now) {
  const m = state.m;
  if (state.running) {
    const before = m.events.length;
    for (let k = 0; k < state.speed; k++) m.step();
    collectFlashes(m, before, now);
  }
  render(now);
  if (state.frame++ % 5 === 0) updatePanel();
  requestAnimationFrame(loop);
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function cellAt(clientX, clientY) {
  const L = state.layout;
  const m = state.m;
  if (!L || L.kind !== 'planet' || !m.planet) return -1;
  const rect = canvas.getBoundingClientRect();
  const dpr = canvas.width / rect.width;
  const x = (clientX - rect.left) * dpr, y = (clientY - rect.top) * dpr;
  const g = m.planet.grid;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < g.size; i++) {
    const [cx, cy] = cellCentre(L, g, i);
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD <= (L.size * 1.1) ** 2 ? best : -1;
}

function setPressed(groupSelector, attr, value) {
  for (const b of document.querySelectorAll(groupSelector)) b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
}

function setRunning(running) {
  state.running = running;
  const t = $('toggle');
  t.textContent = running ? 'Pause' : 'Run';
  t.setAttribute('aria-label', running ? 'Pause' : 'Run');
  updatePanel();
}

function wire() {
  $('toggle').addEventListener('click', () => setRunning(!state.running));
  for (const b of document.querySelectorAll('[data-speed]')) {
    b.addEventListener('click', () => {
      state.speed = Number(b.dataset.speed);
      setPressed('[data-speed]', 'speed', b.dataset.speed);
    });
  }
  for (const b of document.querySelectorAll('[data-view]')) {
    b.addEventListener('click', () => {
      state.view = b.dataset.view;
      setPressed('[data-view]', 'view', b.dataset.view);
    });
  }
  $('restart').addEventListener('click', () => newRun($('seed').value.trim() || 'spark'));
  $('seed').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') newRun($('seed').value.trim() || 'spark');
  });
  $('fresh').addEventListener('click', () => {
    const word = SEEDS[Math.floor(Math.random() * SEEDS.length)];
    newRun(`${word}-${Math.floor(Math.random() * 900 + 100)}`);
  });
  $('auto').addEventListener('change', () => {
    state.m.autoIntroduce = $('auto').checked;
    updatePanel();
  });
  $('introduce').addEventListener('click', () => {
    state.m.introduceElectricity();
    updatePanel();
  });

  canvas.addEventListener('pointerdown', (e) => {
    state.pointer = { x: e.clientX, start: e.clientX, offset: state.lonOffset, id: e.pointerId };
  });
  canvas.addEventListener('pointermove', (e) => {
    const L = state.layout;
    if (state.pointer && L && L.kind === 'planet') {
      const rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / rect.width;
      const dx = (e.clientX - state.pointer.start) * dpr;
      if (Math.abs(e.clientX - state.pointer.start) > 4) {
        state.pointer.dragging = true;
        canvas.setPointerCapture?.(state.pointer.id);
      }
      if (state.pointer.dragging) state.lonOffset = state.pointer.offset + dx / (SQRT3 * L.size);
    }
    state.hover = cellAt(e.clientX, e.clientY);
  });
  const end = (e) => {
    const p = state.pointer;
    state.pointer = null;
    if (!p || p.dragging) return;
    const cell = cellAt(e.clientX, e.clientY);
    const m = state.m;
    if (cell >= 0 && m.canIntroduce && m.civ.population[cell] > 0) {
      m.introduceElectricity(cell);
      updatePanel();
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => (state.pointer = null));
  canvas.addEventListener('pointerleave', () => {
    if (!state.pointer) state.hover = -1;
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      setRunning(!state.running);
    }
  });

  new ResizeObserver(resize).observe(canvas);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

// A console hook for poking at the running simulation from devtools.
window.microverse = {
  get sim() {
    return state.m;
  },
  fastForward(until = (m) => m.done, maxTicks = 20000) {
    const before = state.m.events.length;
    state.m.run({ until, maxTicks: state.m.tick + maxTicks });
    collectFlashes(state.m, before, performance.now());
    updatePanel();
    return state.m.phase;
  },
};

readColors();
renderPhases();
wire();
newRun('spark');
resize();
requestAnimationFrame(loop);
