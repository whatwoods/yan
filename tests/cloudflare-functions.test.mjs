import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveWebDAVTarget } from '../functions/dav/[[path]].js';
import {
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

test('Transcription function returns an Azure China speech token session', async () => {
  const originalFetch = globalThis.fetch;
  let tokenRequest;
  globalThis.fetch = async (url, init) => {
    if (typeof url === 'string' && url.includes('api.cognitive.azure.cn/sts/')) {
      tokenRequest = { url, init };
      return new Response('fake-azure-token', { status: 200 });
    }
    return originalFetch(url, init);
  };

  try {
    const response = await transcribe({
      request: new Request('https://notes.example.com/api/transcribe', {
        method: 'GET',
      }),
      env: {
        AZURE_SPEECH_KEY: 'test-key',
        AZURE_SPEECH_CLOUD: 'azure-china',
        AZURE_SPEECH_REGION: 'chinaeast2',
        AZURE_SPEECH_ENDPOINT: 'https://chinaeast2.api.cognitive.azure.cn/',
      },
    });

    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.provider, 'azure-speech');
    assert.equal(data.token, 'fake-azure-token');
    assert.equal(data.cloud, 'azure-china');
    assert.equal(data.region, 'chinaeast2');
    assert.equal(data.endpoint, 'https://chinaeast2.api.cognitive.azure.cn/');
    assert.equal(data.language, 'zh-CN');
    assert.deepEqual(data.candidateLanguages, ['zh-CN', 'en-US']);
    assert.deepEqual(data.features, { trueText: true, languageIdentification: 'AtStart' });
    assert.equal(data.expiresInSeconds, 540);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(tokenRequest.url, 'https://chinaeast2.api.cognitive.azure.cn/sts/v1.0/issueToken');
    assert.equal(tokenRequest.init.method, 'POST');
    assert.equal(tokenRequest.init.headers['Ocp-Apim-Subscription-Key'], 'test-key');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Transcription function supports global Azure speech token sessions', async () => {
  const originalFetch = globalThis.fetch;
  let tokenUrl;
  globalThis.fetch = async (url) => {
    tokenUrl = url;
    return new Response('global-token', { status: 200 });
  };

  try {
    const response = await transcribe({
      request: new Request('https://notes.example.com/api/transcribe', {
        method: 'GET',
      }),
      env: {
        AZURE_SPEECH_KEY: 'test-key',
        AZURE_SPEECH_CLOUD: 'global',
        AZURE_SPEECH_REGION: 'eastasia',
      },
    });

    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.cloud, 'global');
    assert.equal(data.region, 'eastasia');
    assert.equal(data.endpoint, 'https://eastasia.api.cognitive.microsoft.com/');
    assert.equal(tokenUrl, 'https://eastasia.api.cognitive.microsoft.com/sts/v1.0/issueToken');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Transcription function returns 503 when credentials are missing', async () => {
  const response = await transcribe({
    request: new Request('https://notes.example.com/api/transcribe', {
      method: 'GET',
    }),
    env: {},
  });

  const data = await response.json();
  assert.equal(response.status, 503);
  assert.equal(data.error, '语音识别连接失败');
  assert.match(data.detail, /凭据未配置/);
});

test('Transcription function rejects Azure China sessions without endpoint', async () => {
  const response = await transcribe({
    request: new Request('https://notes.example.com/api/transcribe', {
      method: 'GET',
    }),
    env: {
      AZURE_SPEECH_KEY: 'test-key',
      AZURE_SPEECH_REGION: 'chinaeast2',
    },
  });

  const data = await response.json();
  assert.equal(response.status, 503);
  assert.match(data.detail, /AZURE_SPEECH_ENDPOINT/);
});

test('Transcription function rejects unsupported Azure China regions', async () => {
  const response = await transcribe({
    request: new Request('https://notes.example.com/api/transcribe', {
      method: 'GET',
    }),
    env: {
      AZURE_SPEECH_KEY: 'test-key',
      AZURE_SPEECH_REGION: 'eastasia',
      AZURE_SPEECH_ENDPOINT: 'https://eastasia.api.cognitive.azure.cn/',
    },
  });

  const data = await response.json();
  assert.equal(response.status, 503);
  assert.match(data.detail, /chinaeast2、chinanorth2、chinanorth3/);
});

test('Transcription function rejects non-GET methods', async () => {
  const response = await transcribe({
    request: new Request('https://notes.example.com/api/transcribe', {
      method: 'POST',
    }),
    env: {},
  });

  const data = await response.json();
  assert.equal(response.status, 405);
  assert.equal(data.error, 'Method not allowed');
});
