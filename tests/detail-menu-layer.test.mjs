import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const detailSource = readFileSync(new URL('../src/screen-detail.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const iconsSource = readFileSync(new URL('../src/icons.jsx', import.meta.url), 'utf8');

test('detail top actions sit above the note body stacking context', () => {
  assert.match(detailSource, /className="detail-head"/);

  const headRule = cssSource.match(/\.detail-head\s*\{(?<body>[^}]+)\}/);
  assert.ok(headRule, 'styles.css should define .detail-head');

  assert.match(headRule.groups.body, /position\s*:\s*relative/);

  const zIndex = Number(headRule.groups.body.match(/z-index\s*:\s*(\d+)/)?.[1]);
  assert.ok(zIndex >= 30, 'detail header must outrank .paper child content');
});

test('detail screen only references icons exported by ICONS', () => {
  const refs = [...detailSource.matchAll(/<I\.([A-Za-z][A-Za-z0-9_]*)\b/g)].map((m) => m[1]);
  const exported = new Set([...iconsSource.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:/gm)].map((m) => m[1]));
  const missing = refs.filter((name) => !exported.has(name));
  assert.deepEqual(missing, []);
});

test('organize skipped state does not render the original note or apply action', () => {
  const skippedStart = detailSource.indexOf("status === 'ready' && result?.skipped");
  const normalStart = detailSource.indexOf("status === 'ready' && !result?.skipped", skippedStart);
  assert.ok(skippedStart >= 0, 'screen-detail should render a skipped organize state');
  assert.ok(normalStart > skippedStart, 'normal organize result should follow skipped state');

  const skippedBlock = detailSource.slice(skippedStart, normalStart);
  assert.doesNotMatch(skippedBlock, /noteBody/);
  assert.doesNotMatch(skippedBlock, /marked\.parse/);
  assert.doesNotMatch(detailSource, /\{status === 'ready' && \(/);
  assert.match(detailSource, /status === 'ready' && !result\?\.skipped[\s\S]*?<button className="btn-primary" onClick=\{onApply\}>采用<\/button>/);
});
