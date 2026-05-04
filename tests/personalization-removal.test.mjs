import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/app.jsx', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../src/screen-settings.jsx', import.meta.url), 'utf8');
const settingsComponentsSource = readFileSync(new URL('../src/settings-components.jsx', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('../src/store.jsx', import.meta.url), 'utf8');
const yanSource = readFileSync(new URL('../src/screen-yan.jsx', import.meta.url), 'utf8');

test('settings no longer exposes persona or font customization', () => {
  assert.doesNotMatch(settingsSource, /label="人格"/);
  assert.doesNotMatch(settingsSource, /label="字体"/);
  assert.doesNotMatch(settingsSource, /PersonaSheet/);
  assert.doesNotMatch(settingsSource, /FontSheet/);
  assert.doesNotMatch(settingsComponentsSource, /export function PersonaSheet/);
  assert.doesNotMatch(settingsComponentsSource, /export function FontSheet/);
});

test('yan screen no longer includes persona switching controls', () => {
  assert.doesNotMatch(yanSource, /PERSONAS/);
  assert.doesNotMatch(yanSource, /onPersonaChange/);
  assert.doesNotMatch(yanSource, /personaKey/);
});

test('app shell uses the fixed yan persona and does not apply font settings', () => {
  assert.match(appSource, /const persona = PERSONAS\.yan/);
  assert.doesNotMatch(appSource, /settings\.persona/);
  assert.doesNotMatch(appSource, /settings\.font/);
  assert.doesNotMatch(appSource, /onPersonaChange/);
});

test('default persisted settings do not include removed personalization keys', () => {
  assert.doesNotMatch(storeSource, /persona:\s*['"]/);
  assert.doesNotMatch(storeSource, /font:\s*['"]/);
});
