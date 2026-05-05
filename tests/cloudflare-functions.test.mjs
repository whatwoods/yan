import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveWebDAVTarget } from '../functions/dav/[[path]].js';
import {
  createXfyunIatWebSocketUrl,
  onRequest as transcribe,
} from '../functions/api/transcribe.js';

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

test('Cloudflare transcription function returns a signed Xunfei IAT websocket session', async () => {
  const response = await transcribe({
    request: new Request('https://notes.example.com/api/transcribe', {
      method: 'GET',
    }),
    env: {
      XFYUN_IAT_APP_ID: 'app123',
      XFYUN_IAT_API_KEY: 'key123',
      XFYUN_IAT_API_SECRET: 'secret123',
    },
  });

  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.provider, 'xfyun-iat');
  assert.equal(data.appId, 'app123');
  assert.equal(data.business.language, 'zh_cn');
  assert.match(data.url, /^wss:\/\/iat-api\.xfyun\.cn\/v2\/iat\?/);
  assert.match(data.url, /authorization=/);
  assert.match(data.url, /date=/);
  assert.match(data.url, /host=iat-api\.xfyun\.cn/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('createXfyunIatWebSocketUrl signs the fixed host date request-line string', async () => {
  const signedUrl = await createXfyunIatWebSocketUrl({
    apiKey: 'key123',
    apiSecret: 'secret123',
    now: new Date('2026-05-05T00:00:00Z'),
  });
  const url = new URL(signedUrl);
  const authorization = JSON.parse(
    Buffer.from(url.searchParams.get('authorization'), 'base64').toString('utf8')
      .replace(/^api_key="([^"]+)",algorithm="([^"]+)",headers="([^"]+)",signature="([^"]+)"$/, '{"api_key":"$1","algorithm":"$2","headers":"$3","signature":"$4"}')
  );

  assert.equal(url.hostname, 'iat-api.xfyun.cn');
  assert.equal(url.pathname, '/v2/iat');
  assert.equal(url.searchParams.get('date'), 'Tue, 05 May 2026 00:00:00 GMT');
  assert.equal(authorization.api_key, 'key123');
  assert.equal(authorization.algorithm, 'hmac-sha256');
  assert.equal(authorization.headers, 'host date request-line');
  assert.match(authorization.signature, /^[A-Za-z0-9+/]+={0,2}$/);
});
