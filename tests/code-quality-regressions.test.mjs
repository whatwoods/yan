import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/app.jsx', import.meta.url), 'utf8');
const aiSettingsSource = readFileSync(new URL('../src/screen-settings-ai.jsx', import.meta.url), 'utf8');
const syncSettingsSource = readFileSync(new URL('../src/screen-settings-sync.jsx', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('../src/store.jsx', import.meta.url), 'utf8');
const syncSource = readFileSync(new URL('../src/sync.js', import.meta.url), 'utf8');
const captureSource = readFileSync(new URL('../src/screen-capture.jsx', import.meta.url), 'utf8');
const audioTranscriptionSource = readFileSync(new URL('../src/audio-transcription.js', import.meta.url), 'utf8');
const syncServiceSource = readFileSync(new URL('../src/sync-service.js', import.meta.url), 'utf8');

test('AI test persists the normalized provider endpoint used for the request', () => {
  assert.match(aiSettingsSource, /const updated = \{ \.\.\.aiConfig, endpoint, models,/);
});

test('WebDAV settings hydrate encrypted password when secrets are unlocked', () => {
  assert.match(syncSettingsSource, /SecretsStore\.get\('webdavPassword'\)/);
  assert.match(syncSettingsSource, /password: savedWebdav\.password \|\| SecretsStore\.get\('webdavPassword'\) \|\| ''/);
});

test('WebDAV conflicts are written as separate local and remote files', () => {
  assert.match(syncSource, /pushConflict\(local, 'local'\)/);
  assert.match(syncSource, /pushConflict\(remote, 'remote'\)/);
  assert.match(syncSource, /conflicts\/\$\{variant\}-\$\{note\.modified \|\| Date\.now\(\)\}-\$\{note\.id\}\.md/);
});

test('note writes do not update memory after IndexedDB persistence fails', () => {
  assert.doesNotMatch(storeSource, /catch \(err\) \{\s*console\.error\('putNote failed:', err\);\s*\}\s*Store\._notes\.unshift/s);
  assert.doesNotMatch(storeSource, /catch \(err\) \{\s*console\.error\('putNote failed:', err\);\s*\}\s*Store\._notes\[idx\] = updated/s);
});

test('background AI processing only runs when AI is configured', () => {
  assert.match(appSource, /if \(aiConfigured\) \{/);
  assert.match(appSource, /const patch = settings\.autoTag \? aiResult : \{ \.\.\.aiResult, tags: addedNote\.tags \|\| \[\] \};/);
});

test('audio fallback uses only the same-origin Workers AI transcription endpoint', () => {
  assert.match(captureSource, /createChunkedTranscriber/);
  assert.match(audioTranscriptionSource, /fetchImpl\('\/api\/transcribe'/);
  assert.doesNotMatch(captureSource, /\/v1\/audio\/transcriptions/);
  assert.doesNotMatch(audioTranscriptionSource, /\/v1\/audio\/transcriptions/);
  assert.doesNotMatch(captureSource, /transcribeViaOpenAICompatible/);
  assert.doesNotMatch(captureSource, /mediaRecorderRef|audioChunksRef/);
});

test('note mutations queue automatic WebDAV sync work', () => {
  assert.match(storeSource, /scheduleAutoSync/);
  assert.match(storeSource, /recordPermanentDelete/);
  assert.match(storeSource, /markDataForSync\('notes'\)/);
  assert.match(storeSource, /markAndScheduleSync\('categories'/);
  assert.match(storeSource, /markAndScheduleSync\('preferences'/);
  assert.match(syncServiceSource, /AUTO_SYNC_DELAY_MS = 5000/);
});

test('WebDAV sync keeps a remote index and permanent deletion tombstones', () => {
  assert.match(syncSource, /pullRemoteIndex/);
  assert.match(syncSource, /pullAllNotesByDirectory/);
  assert.match(syncSource, /pushRemoteIndex/);
  assert.match(syncSource, /pullDeletedNotes/);
  assert.match(syncSource, /pushDeletedNotes/);
  assert.match(syncSource, /shouldKeepRemoteNote/);
});
