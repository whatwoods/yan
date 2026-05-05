import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveWebDAVTarget } from '../functions/dav/[[path]].js';
import { onRequest as transcribe } from '../functions/api/transcribe.js';

test('Cloudflare WebDAV function resolves encoded server and provider base path', () => {
  const target = resolveWebDAVTarget(
    'https://notes.example.com/dav/https%3A%2F%2Fdav.jianguoyun.com%2Fdav/yan/notes/2026/05',
  );

  assert.equal(target.toString(), 'https://dav.jianguoyun.com/dav/yan/notes/2026/05');
});

test('Cloudflare WebDAV function rejects local proxy targets', () => {
  const target = resolveWebDAVTarget(
    'https://notes.example.com/dav/https%3A%2F%2Flocalhost%2Fdav/yan',
  );

  assert.equal(target, null);
});

test('Cloudflare Workers AI transcription function runs the whisper model', async () => {
  let call;
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }), 'recording.webm');

  const response = await transcribe({
    request: new Request('https://notes.example.com/api/transcribe', {
      method: 'POST',
      body: form,
    }),
    env: {
      AI: {
        async run(model, input) {
          call = { model, input };
          return { text: '测试转写' };
        },
      },
    },
  });

  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.text, '测试转写');
  assert.equal(data.provider, 'cloudflare-workers-ai');
  assert.equal(call.model, '@cf/openai/whisper-large-v3-turbo');
  assert.equal(call.input.audio, 'AQID');
  assert.equal(call.input.language, 'zh');
  assert.equal(call.input.vad_filter, true);
  assert.equal(call.input.condition_on_previous_text, false);
});
