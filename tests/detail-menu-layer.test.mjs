import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const detailSource = readFileSync(new URL('../src/screen-detail.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('detail top actions sit above the note body stacking context', () => {
  assert.match(detailSource, /className="detail-head"/);

  const headRule = cssSource.match(/\.detail-head\s*\{(?<body>[^}]+)\}/);
  assert.ok(headRule, 'styles.css should define .detail-head');

  assert.match(headRule.groups.body, /position\s*:\s*relative/);

  const zIndex = Number(headRule.groups.body.match(/z-index\s*:\s*(\d+)/)?.[1]);
  assert.ok(zIndex >= 30, 'detail header must outrank .paper child content');
});
