import assert from 'node:assert/strict';
import test from 'node:test';

import { isAIConfigured, testAIAvailability } from '../src/ai.js';

test('testAIAvailability posts a minimal chat completion with the resolved task model', async () => {
  let request;
  const result = await testAIAvailability({
    config: {
      endpoint: 'https://example.test/v1/',
      apiKey: 'sk-test',
      defaultModel: 'default-model',
    },
    assignment: { ask: 'ask-model' },
    groupAssignment: {},
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return Response.json({
        choices: [{ message: { content: '可用' } }],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, 'ask-model');
  assert.equal(request.url, 'https://example.test/v1/chat/completions');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.Authorization, 'Bearer sk-test');
  assert.equal(request.body.model, 'ask-model');
  assert.equal(request.body.max_tokens, 128);
});

test('testAIAvailability accepts OpenAI-compatible content array responses', async () => {
  const result = await testAIAvailability({
    config: {
      endpoint: 'https://example.test/v1',
      apiKey: 'sk-test',
      defaultModel: 'array-model',
    },
    assignment: {},
    groupAssignment: {},
    fetchImpl: async () => Response.json({
      choices: [{
        message: {
          content: [{ type: 'text', text: '可用' }],
        },
      }],
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.sample, '可用');
});

test('testAIAvailability reports truncated empty responses with finish reason', async () => {
  const result = await testAIAvailability({
    config: {
      endpoint: 'https://example.test/v1',
      apiKey: 'sk-test',
      defaultModel: 'reasoning-model',
    },
    assignment: {},
    groupAssignment: {},
    fetchImpl: async () => Response.json({
      choices: [{
        finish_reason: 'length',
        message: { content: '', reasoning_content: '我需要回答可用' },
      }],
    }),
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /输出被截断/);
});

test('testAIAvailability reports missing usable model before making a request', async () => {
  let called = false;
  const result = await testAIAvailability({
    config: {
      endpoint: 'https://example.test/v1',
      apiKey: 'sk-test',
      defaultModel: '',
    },
    assignment: {},
    groupAssignment: {},
    fetchImpl: async () => {
      called = true;
      return Response.json({});
    },
  });

  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, '未设置可用模型');
});

test('isAIConfigured treats group-level model assignment as configured', () => {
  assert.equal(
    isAIConfigured(
      { endpoint: 'https://example.test/v1', apiKey: 'sk-test', defaultModel: '' },
      {},
      { normal: 'normal-model' },
    ),
    true,
  );
});
