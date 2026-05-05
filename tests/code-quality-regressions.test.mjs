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
const cssSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('AI model fetch persists the normalized provider endpoint used for the request', () => {
  assert.match(aiSettingsSource, /const updated = \{ \.\.\.aiConfig, endpoint, models,/);
  assert.match(aiSettingsSource, /handleFetchModels/);
  assert.match(aiSettingsSource, /获取模型/);
});

test('AI settings exposes a real connection test separate from model fetching', () => {
  assert.match(aiSettingsSource, /testAIAvailability/);
  assert.match(aiSettingsSource, /handleAiAvailabilityTest/);
  assert.match(aiSettingsSource, /测试连接/);
  assert.doesNotMatch(aiSettingsSource, /测试可用性/);
  assert.match(aiSettingsSource, /task: 'ask'/);
});

test('AI settings hides the connection test until models are fetched', () => {
  assert.match(aiSettingsSource, /\{aiModels\.length > 0 && \(\s*<>\s*<Row icon=\{<I\.check size=\{14\} \/>\}\s+label=\{aiAvailabilityTesting \? '测试中\.\.\.' : '测试连接'\}/);
  assert.match(aiSettingsSource, /setAiModels\(\[\]\);\s+setAiAvailabilityResult\(null\);/);
});

test('AI settings icons distinguish provider, models, connection, and task semantics', () => {
  assert.match(aiSettingsSource, /icon=\{<I\.globe size=\{14\} \/>\} label="供应商"/);
  assert.match(aiSettingsSource, /icon=\{<I\.list size=\{14\} \/>\}\s+label=\{modelFetching \? '获取中\.\.\.' : '获取模型'\}/);
  assert.match(aiSettingsSource, /icon=\{<I\.check size=\{14\} \/>\}\s+label=\{aiAvailabilityTesting \? '测试中\.\.\.' : '测试连接'\}/);
  assert.match(aiSettingsSource, /icon=\{<I\.chip size=\{14\} \/>\} label="默认模型"/);
  assert.match(aiSettingsSource, /icon=\{<I\.tag size=\{14\} \/>\} label="自动识别打标签"/);
  assert.match(aiSettingsSource, /function taskIcon/);
  assert.match(aiSettingsSource, /icon=\{taskIcon\(task, I\)\}\s+label=\{TASK_LABELS\[task\] \|\| task\}/);
  assert.doesNotMatch(aiSettingsSource, /icon=\{<span[\s\S]*TASK_LABELS\[task\]/);
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
  assert.match(captureSource, /shouldFallbackFromSpeechRecognitionError/);
  assert.match(captureSource, /startRecorderFallback/);
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

test('home capture editor follows the mobile visual viewport when the keyboard opens', () => {
  assert.match(appSource, /visualViewport\.offsetTop/);
  assert.match(appSource, /visualViewport\.offsetLeft/);
  assert.match(appSource, /--app-offset-top/);
  assert.match(appSource, /requestAnimationFrame/);

  const appRule = cssSource.match(/\.app\s*\{(?<body>[^}]+)\}/);
  assert.ok(appRule, 'styles.css should define .app');
  assert.match(appRule.groups.body, /width\s*:\s*var\(--app-width/);
  assert.match(appRule.groups.body, /transform\s*:\s*translate3d\(var\(--app-offset-left/);

  assert.match(captureSource, /visualViewportHeight/);
  assert.match(captureSource, /window\.visualViewport\?\.height/);
  assert.doesNotMatch(captureSource, /window\.innerHeight \* 0\.42/);
  assert.match(captureSource, /minHeight:\s*0/);
});

test('desktop shell sizes the app to the framed root instead of the browser viewport', () => {
  const desktopRule = cssSource.match(/@media \(min-width:\s*720px\)\s*\{(?<body>[\s\S]+?)\n\}/);
  assert.ok(desktopRule, 'styles.css should define the desktop framing media query');

  assert.match(desktopRule.groups.body, /#root\s*\{[\s\S]*?width\s*:\s*420px/);

  const desktopAppRule = desktopRule.groups.body.match(/\.app\s*\{(?<body>[^}]+)\}/);
  assert.ok(desktopAppRule, 'desktop framing should override .app sizing');
  assert.match(desktopAppRule.groups.body, /width\s*:\s*100%/);
  assert.match(desktopAppRule.groups.body, /height\s*:\s*100%/);
  assert.match(desktopAppRule.groups.body, /transform\s*:\s*none/);
});
