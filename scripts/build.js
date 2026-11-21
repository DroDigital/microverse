#!/usr/bin/env node
// Bundle the engine and the web app into one self-contained HTML file.
//
// Each ES module becomes a function scope in a small registry, so modules
// keep their own top-level names. No dependencies, no transpiling.
//
//   node scripts/build.js            -> dist/microverse.html (full document)
//   node scripts/build.js --fragment -> body-only page for hosts that add their own <html>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'web/app.js';

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';\s*$/;
const EXPORT_DECL_RE = /^export\s+(?:const|let|class|function)\s+([A-Za-z_$][\w$]*)/;

function resolve(fromFile, spec) {
  return join(dirname(fromFile), spec).replace(/\\/g, '/');
}

function moduleId(path) {
  return path.replace(/^\.?\/?/, '');
}

// Depth-first load so dependencies come before dependants.
function collect(path, seen = new Map()) {
  if (seen.has(path)) return seen;
  const source = readFileSync(join(root, path), 'utf8');
  const deps = [];
  const lines = source.split('\n').map((line) => {
    const m = line.match(IMPORT_RE);
    if (m) {
      const dep = resolve(path, m[2]);
      deps.push(dep);
      const names = m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/\s+as\s+/, ': '));
      return `const { ${names.join(', ')} } = __require(${JSON.stringify(moduleId(dep))});`;
    }
    if (/^import\s/.test(line)) throw new Error(`${path}: unsupported import form: ${line}`);
    if (/^export\s+(\*|\{|default)/.test(line)) throw new Error(`${path}: unsupported export form: ${line}`);
    return line;
  });
  const exports = [];
  const body = lines.map((line) => {
    const m = line.match(EXPORT_DECL_RE);
    if (!m) return line;
    exports.push(m[1]);
    return line.replace(/^export\s+/, '');
  });
  for (const dep of deps) collect(dep, seen);
  seen.set(path, { body: body.join('\n'), exports });
  return seen;
}

export function bundle() {
  const modules = collect(ENTRY);
  const parts = ['(() => {', '"use strict";', 'const __defs = {}, __cache = {};',
    'const __require = (id) => __cache[id] || (__cache[id] = __defs[id]());'];
  for (const [path, { body, exports }] of modules) {
    parts.push(`__defs[${JSON.stringify(moduleId(path))}] = () => {\n${body}\nreturn { ${exports.join(', ')} };\n};`);
  }
  parts.push(`__require(${JSON.stringify(moduleId(ENTRY))});`, '})();');
  return parts.join('\n');
}

export function page({ fragment = false } = {}) {
  const template = readFileSync(join(root, 'web/template.html'), 'utf8');
  const script = bundle().replace(/<\/script/gi, '<\\/script');
  const body = template.replace('<!-- BUNDLE -->', () => `<script>\n${script}\n</script>`);
  if (fragment) return body;
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

if (process.argv[1] && basename(process.argv[1]) === 'build.js') {
  const fragment = process.argv.includes('--fragment');
  const outArg = process.argv.indexOf('--out');
  const out = outArg > 0 ? process.argv[outArg + 1] : join(root, 'dist', fragment ? 'microverse.fragment.html' : 'microverse.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page({ fragment }));
  console.log(`wrote ${out}`);
}
