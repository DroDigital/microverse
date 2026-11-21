import { test } from 'node:test';
import assert from 'node:assert/strict';
import { page, bundle } from '../scripts/build.js';

test('the web bundle is one parseable script with every module scoped', () => {
  const js = bundle();
  assert.doesNotThrow(() => new Function(js));
  for (const id of ['src/microverse.js', 'src/temporal-field.js', 'src/void.js', 'web/app.js']) {
    assert.ok(js.includes(`__defs[${JSON.stringify(id)}]`), `missing ${id}`);
  }
  assert.ok(!/^\s*(import|export)\s/m.test(js), 'no ES module syntax left behind');
});

test('the built page is a complete document; the fragment is body-only', () => {
  const full = page();
  assert.ok(full.startsWith('<!doctype html>'));
  assert.ok(full.includes('<title>Microverse</title>'));
  const fragment = page({ fragment: true });
  assert.ok(!fragment.includes('<!doctype'));
  assert.ok(fragment.startsWith('<title>Microverse</title>'));
});
