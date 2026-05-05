import assert from 'node:assert/strict';
import test from 'node:test';
import { deserialize, serialize } from '../src/note-format.js';

test('deserialize reads Obsidian-style block scalars in frontmatter', () => {
  const note = deserialize(`---
id: 2026-05-note
created: 2026-05-04T01:02:03.000Z
modified: 2026-05-04T01:03:03.000Z
kind: text
category: 工作
tags:
  - 产品
  - "客户: A"
ai:
  summary: |
    第一行
    第二行
  generated_at: 2026-05-04T01:04:03.000Z
  model: test-model
---
# 标题

正文`);

  assert.equal(note.summary, '第一行\n第二行\n');
  assert.equal(note.ai.summary, '第一行\n第二行\n');
  assert.deepEqual(note.tags.map((tag) => tag.label), ['产品', '客户: A']);
  assert.equal(note.body, '# 标题\n\n正文');
  assert.equal(note.createdAt, Date.parse('2026-05-04T01:02:03.000Z'));
});

test('serialize round-trips YAML strings with apostrophes and multiline values', () => {
  const source = {
    id: '2026-05-note',
    created: '2026-05-04T01:02:03.000Z',
    modified: '2026-05-04T01:03:03.000Z',
    kind: 'text',
    category: "客户: Bob's team",
    tags: [{ label: "Bob's idea", color: 'ink' }],
    people: ["O'Connor"],
    pinned: true,
    body: '第一段\n\n第二段',
    ai: {
      summary: '第一行\n第二行',
      generated_at: '2026-05-04T01:04:03.000Z',
      model: 'test-model',
    },
  };

  const parsed = deserialize(serialize(source));

  assert.equal(parsed.category, source.category);
  assert.deepEqual(parsed.tags.map((tag) => tag.label), ["Bob's idea"]);
  assert.deepEqual(parsed.people, ["O'Connor"]);
  assert.equal(parsed.summary, source.ai.summary);
  assert.equal(parsed.body, source.body);
});
