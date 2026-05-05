import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chatCompletion,
  getOrganizeMaxTokens,
  isAIConfigured,
  testAIAvailability,
} from '../src/ai.js';

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

test('AI organize uses a wide uncapped completion budget for reasoning models', () => {
  assert.equal(getOrganizeMaxTokens('短内容', 'organize'), 65_536);
  assert.equal(getOrganizeMaxTokens('短内容', 'restructure'), 65_536);
  assert.equal(getOrganizeMaxTokens('x'.repeat(20_000), 'organize'), 65_536);
  assert.equal(getOrganizeMaxTokens('x'.repeat(20_000), 'restructure'), 65_536);
});

test('chatCompletion can surface provider error details for foreground AI actions', async () => {
  await assert.rejects(
    chatCompletion('organize', [{ role: 'user', content: '请整理这段笔记' }], {
      config: {
        endpoint: 'https://example.test/v1',
        apiKey: 'sk-test',
        defaultModel: '',
      },
      assignment: {},
      groupAssignment: { normal: 'normal-model' },
      fetchImpl: async () => new Response(JSON.stringify({
        error: { message: 'max_tokens is too large' },
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
      throwOnError: true,
    }),
    /HTTP 400: max_tokens is too large/,
  );
});

test('chatCompletion explains reasoning-only responses for foreground AI actions', async () => {
  await assert.rejects(
    chatCompletion('organize', [{ role: 'user', content: '请整理这段笔记' }], {
      config: {
        endpoint: 'https://example.test/v1',
        apiKey: 'sk-test',
        defaultModel: '',
      },
      assignment: {},
      groupAssignment: { normal: 'reasoning-model' },
      fetchImpl: async () => Response.json({
        choices: [{
          message: {
            content: '',
            reasoning_content: '我需要先分析这段笔记',
          },
        }],
      }),
      throwOnError: true,
    }),
    /只返回了思考内容/,
  );
});

test('chatCompletion explains truncated reasoning responses for foreground AI actions', async () => {
  await assert.rejects(
    chatCompletion('organize', [{ role: 'user', content: '请整理这段笔记' }], {
      config: {
        endpoint: 'https://example.test/v1',
        apiKey: 'sk-test',
        defaultModel: '',
      },
      assignment: {},
      groupAssignment: { normal: 'reasoning-model' },
      fetchImpl: async () => Response.json({
        choices: [{
          finish_reason: 'length',
          message: {
            content: '',
            reasoning_content: '我需要先分析这段笔记',
          },
        }],
      }),
      throwOnError: true,
    }),
    /思考链过长/,
  );
});
