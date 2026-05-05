import { getAttachmentPath, getNotePath, getTrashPath } from './note-format.js';

export const SYNC_INDEX_FILE = '/index.json';
export const SYNC_DELETIONS_FILE = '/deletions.json';
export const VERSIONED_DOCUMENT_VERSION = 1;

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeRoot(rootPath = '/yan') {
  return (rootPath || '/yan').replace(/\/+$/, '') || '/yan';
}

export function createRemoteIndex(notes = [], rootPath = '/yan') {
  const root = normalizeRoot(rootPath);
  const entries = [...notes]
    .filter((note) => note?.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const index = {
    version: 1,
    generated_at: new Date().toISOString(),
    notes: {},
  };

  for (const note of entries) {
    const path = note.deleted_at ? getTrashPath(note.id, root) : getNotePath(note.id, root);
    index.notes[note.id] = {
      id: note.id,
      path,
      modified: note.modified || note.deleted_at || note.created || null,
      deleted_at: note.deleted_at || null,
      attachments: note.photo ? [getAttachmentPath(note.id, 'photo-1.jpg', root)] : [],
    };
  }

  return index;
}

export function normalizeDeletedNotes(value = []) {
  const items = Array.isArray(value?.deleted) ? value.deleted : value;
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item?.id && item?.deleted_at)
    .map((item) => ({
      id: String(item.id),
      deleted_at: item.deleted_at,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function mergeDeletedNotes(...sources) {
  const merged = new Map();
  for (const source of sources) {
    for (const item of normalizeDeletedNotes(source)) {
      const previous = merged.get(item.id);
      if (!previous || toTime(item.deleted_at) >= toTime(previous.deleted_at)) {
        merged.set(item.id, item);
      }
    }
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function shouldKeepRemoteNote(note, deletedNotes = []) {
  const tombstone = normalizeDeletedNotes(deletedNotes).find((item) => item.id === note?.id);
  if (!tombstone) return true;
  return toTime(note?.modified || note?.created) > toTime(tombstone.deleted_at);
}

export function wrapVersionedDocument(data, modified = new Date().toISOString()) {
  return {
    version: VERSIONED_DOCUMENT_VERSION,
    modified,
    data,
  };
}

export function unwrapVersionedDocument(value, fallbackModified = null) {
  if (value && typeof value === 'object' && Array.isArray(value.data) && value.modified) {
    return value;
  }
  if (value && typeof value === 'object' && value.data && value.modified) {
    return value;
  }
  return wrapVersionedDocument(value, fallbackModified || new Date(0).toISOString());
}

export function chooseVersionedDocument(local, remote) {
  if (!local) return remote || null;
  if (!remote) return local;
  return toTime(local.modified) >= toTime(remote.modified) ? local : remote;
}
