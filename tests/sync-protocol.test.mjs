import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRemoteIndex,
  mergeDeletedNotes,
  shouldKeepRemoteNote,
  wrapVersionedDocument,
  chooseVersionedDocument,
} from '../src/sync-protocol.js';

test('createRemoteIndex records every active and trashed note path', () => {
  const index = createRemoteIndex([
    { id: '2025-01-old', modified: '2025-01-02T00:00:00.000Z', deleted_at: null },
    { id: '2026-05-trash', modified: '2026-05-02T00:00:00.000Z', deleted_at: '2026-05-03T00:00:00.000Z' },
  ], '/yan');

  assert.deepEqual(index.version, 1);
  assert.equal(index.notes['2025-01-old'].path, '/yan/notes/2025/01/2025-01-old.md');
  assert.equal(index.notes['2025-01-old'].deleted_at, null);
  assert.equal(index.notes['2026-05-trash'].path, '/yan/trash/2026-05-trash.md');
  assert.equal(index.notes['2026-05-trash'].deleted_at, '2026-05-03T00:00:00.000Z');
});

test('mergeDeletedNotes keeps the newest tombstone for each note id', () => {
  const merged = mergeDeletedNotes([
    { id: 'a', deleted_at: '2026-05-01T00:00:00.000Z' },
    { id: 'b', deleted_at: '2026-05-02T00:00:00.000Z' },
  ], [
    { id: 'a', deleted_at: '2026-05-03T00:00:00.000Z' },
  ]);

  assert.deepEqual(merged, [
    { id: 'a', deleted_at: '2026-05-03T00:00:00.000Z' },
    { id: 'b', deleted_at: '2026-05-02T00:00:00.000Z' },
  ]);
});

test('shouldKeepRemoteNote rejects remote notes older than a permanent deletion tombstone', () => {
  const tombstones = [{ id: 'deleted', deleted_at: '2026-05-05T08:00:00.000Z' }];

  assert.equal(
    shouldKeepRemoteNote({ id: 'deleted', modified: '2026-05-04T08:00:00.000Z' }, tombstones),
    false,
  );
  assert.equal(
    shouldKeepRemoteNote({ id: 'deleted', modified: '2026-05-06T08:00:00.000Z' }, tombstones),
    true,
  );
});

test('versioned documents pick the newest modified payload', () => {
  const local = wrapVersionedDocument(['本地'], '2026-05-05T08:00:00.000Z');
  const remote = wrapVersionedDocument(['远端'], '2026-05-04T08:00:00.000Z');

  assert.deepEqual(chooseVersionedDocument(local, remote).data, ['本地']);
  assert.deepEqual(chooseVersionedDocument(null, remote).data, ['远端']);
});
