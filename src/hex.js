// Spatial tessellation. The void is a hexagon of hexagons in axial
// coordinates; the planet surface is an offset hex grid that wraps east-west
// so it behaves like a globe projected onto a cylinder.

const SQRT3 = Math.sqrt(3);

export const AXIAL_DIRECTIONS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

export function axialDistance(q1, r1, q2, r2) {
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function axialToPixel(q, r, size) {
  return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r };
}

// A hexagonal region of hex cells, `radius` rings around a centre cell.
export function hexagonRegion(radius) {
  const cells = [];
  const index = new Map();
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      index.set(`${q},${r}`, cells.length);
      cells.push({ q, r });
    }
  }
  const neighbors = cells.map(({ q, r }) => {
    const out = [];
    for (const [dq, dr] of AXIAL_DIRECTIONS) {
      const j = index.get(`${q + dq},${r + dr}`);
      if (j !== undefined) out.push(j);
    }
    return out;
  });
  // Cells within `k` steps, with their distances, for kernel sums.
  const within = (i, k) => {
    const { q, r } = cells[i];
    const out = [];
    for (let dq = -k; dq <= k; dq++) {
      for (let dr = Math.max(-k, -dq - k); dr <= Math.min(k, -dq + k); dr++) {
        const j = index.get(`${q + dq},${r + dr}`);
        if (j !== undefined) out.push([j, axialDistance(0, 0, dq, dr)]);
      }
    }
    return out;
  };
  return {
    kind: 'hexagon',
    radius,
    size: cells.length,
    cells,
    neighbors,
    within,
    indexOf: (q, r) => index.get(`${q},${r}`),
    isBoundary: (i) => neighbors[i].length < 6,
  };
}

// Offset ("odd-r") hex grid, `width` columns by `height` rows, wrapping in x.
const ODD_R = [
  [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]], // even rows
  [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]], // odd rows
];

export function wrappedHexGrid(width, height) {
  const size = width * height;
  const col = new Int16Array(size);
  const row = new Int16Array(size);
  const neighbors = new Array(size);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const i = r * width + c;
      col[i] = c;
      row[i] = r;
      const out = [];
      for (const [dc, dr] of ODD_R[r & 1]) {
        const rr = r + dr;
        if (rr < 0 || rr >= height) continue;
        const cc = (c + dc + width) % width;
        out.push(rr * width + cc);
      }
      neighbors[i] = out;
    }
  }
  return {
    kind: 'wrapped',
    width,
    height,
    size,
    col,
    row,
    neighbors,
    // Latitude in radians, -pi/2 (south pole) .. +pi/2 (north pole).
    latitude: (i) => (0.5 - (row[i] + 0.5) / height) * Math.PI,
    // Longitude in radians, 0 .. 2pi.
    longitude: (i) => ((col[i] + 0.5 * (row[i] & 1)) / width) * 2 * Math.PI,
  };
}

// Breadth-first rings out from `start`, up to `maxSteps`, optionally only
// walking through cells that satisfy `passable`.
export function bfs(grid, start, maxSteps, passable = () => true) {
  const dist = new Map([[start, 0]]);
  let frontier = [start];
  for (let step = 1; step <= maxSteps && frontier.length; step++) {
    const next = [];
    for (const i of frontier) {
      for (const j of grid.neighbors[i]) {
        if (dist.has(j) || !passable(j)) continue;
        dist.set(j, step);
        next.push(j);
      }
    }
    frontier = next;
  }
  return dist;
}

// Connected components over cells where `member(i)` is true.
export function components(grid, member) {
  const label = new Int32Array(grid.size).fill(-1);
  const groups = [];
  for (let i = 0; i < grid.size; i++) {
    if (label[i] !== -1 || !member(i)) continue;
    const id = groups.length;
    const cells = [i];
    label[i] = id;
    for (let k = 0; k < cells.length; k++) {
      for (const j of grid.neighbors[cells[k]]) {
        if (label[j] === -1 && member(j)) {
          label[j] = id;
          cells.push(j);
        }
      }
    }
    groups.push(cells);
  }
  return { label, groups };
}
