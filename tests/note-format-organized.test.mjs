import assert from 'node:assert/strict';
import test from 'node:test';
import { deserialize, serialize } from '../src/note-format.js';

test('deserialize reads ai.organized from frontmatter', () => {
  const note = deserialize(`---
id: 2026-05-note
created: 2026-05-04T01:02:03.000Z
modified: 2026-05-04T01:03:03.000Z
kind: voice
category: 工作
tags:
  - 产品
ai:
  summary: 今天确认了首屏架构。
  generated_at: '2026-05-05T10:35:00.000Z'
  model: deepseek-chat
  organized:
    tier: restructure
    at: '2026-05-05T10:42:00.000Z'
    model: deepseek-chat
    original: |
      呃今天那个我又重新想了一下
      首屏的事情……
---
# 今日决定
- 首屏改为……`);

  assert.equal(note.organized.tier, 'restructure');
  assert.equal(note.organized.at, '2026-05-05T10:42:00.000Z');
  assert.equal(note.organized.model, 'deepseek-chat');
  assert.ok(note.organized.original.includes('呃今天那个'));
  assert.equal(note.body, '# 今日决定\n- 首屏改为……');
});

test('serialize includes ai.organized in frontmatter', () => {
  const source = {
    id: '2026-05-note',
    created: '2026-05-04T01:02:03.000Z',
    modified: '2026-05-04T01:03:03.000Z',
    kind: 'voice',
    category: '工作',
    tags: [{ label: '产品', color: 'ink' }],
    people: [],
    pinned: false,
    body: '# 今日决定\n- 首屏改为……',
    ai: {
      summary: '今天确认了首屏架构。',
      generated_at: '2026-05-05T10:35:00.000Z',
      model: 'deepseek-chat',
    },
    organized: {
      tier: 'restructure',
      at: '2026-05-05T10:42:00.000Z',
      model: 'deepseek-chat',
      original: '呃今天那个我又重新想了一下\n首屏的事情……',
    },
  };

  const md = serialize(source);
  assert.ok(md.includes('organized:'));
  assert.ok(md.includes('tier: restructure'));
  assert.ok(md.includes('original:'));
  assert.ok(md.includes('呃今天那个'));

  const parsed = deserialize(md);
  assert.equal(parsed.organized.tier, 'restructure');
  assert.equal(parsed.organized.model, 'deepseek-chat');
  assert.ok(parsed.organized.original.includes('呃今天那个'));
});

test('serialize omits ai block when no summary and no organized', () => {
  const source = {
    id: '2026-05-note',
    created: '2026-05-04T01:02:03.000Z',
    modified: '2026-05-04T01:03:03.000Z',
    kind: 'text',
    category: '',
    tags: [],
    people: [],
    pinned: false,
    body: '纯文本笔记',
  };

  const md = serialize(source);
  assert.ok(!md.includes('ai:'));
  assert.ok(!md.includes('organized:'));
});

test('serialize includes ai block with only organized (no summary)', () => {
  const source = {
    id: '2026-05-note',
    created: '2026-05-04T01:02:03.000Z',
    modified: '2026-05-04T01:03:03.000Z',
    kind: 'voice',
    category: '',
    tags: [],
    people: [],
    pinned: false,
    body: '整理后的正文',
    organized: {
      tier: 'organize',
      at: '2026-05-05T10:42:00.000Z',
      model: 'deepseek-chat',
      original: '原始正文',
    },
  };

  const md = serialize(source);
  assert.ok(md.includes('ai:'));
  assert.ok(md.includes('organized:'));
  assert.ok(md.includes('tier: organize'));
  assert.ok(!md.includes('summary:'));

  const parsed = deserialize(md);
  assert.equal(parsed.organized.tier, 'organize');
  assert.equal(parsed.summary, '');
});

test('round-trip preserves organized.original multiline content', () => {
  const original = `呃今天那个我又重新想了一下
首屏的事情，我觉得还是
用那种懒加载的方式比较好
就是先加载一个骨架屏
然后数据到了再渲染`;

  const source = {
    id: '2026-05-note',
    created: '2026-05-04T01:02:03.000Z',
    modified: '2026-05-04T01:03:03.000Z',
    kind: 'voice',
    category: '',
    tags: [],
    people: [],
    pinned: false,
    body: '整理后的正文',
    ai: {
      summary: '测试摘要',
      generated_at: '2026-05-05T10:35:00.000Z',
      model: 'deepseek-chat',
    },
    organized: {
      tier: 'organize',
      at: '2026-05-05T10:42:00.000Z',
      model: 'deepseek-chat',
      original,
    },
  };

  const parsed = deserialize(serialize(source));
  assert.equal(parsed.organized.original, original);
});

test('deserialize handles note without organized field', () => {
  const note = deserialize(`---
id: 2026-05-note
created: 2026-05-04T01:02:03.000Z
modified: 2026-05-04T01:03:03.000Z
kind: text
category: 工作
tags:
  - 产品
ai:
  summary: 测试摘要
  generated_at: '2026-05-05T10:35:00.000Z'
  model: deepseek-chat
---
正文`);

  assert.equal(note.organized, null);
  assert.equal(note.summary, '测试摘要');
});
