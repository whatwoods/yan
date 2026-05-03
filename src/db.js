// db.js — IndexedDB wrapper for biji-v1.
// Uses the `idb` package for a clean async/await API over IndexedDB.

import { openDB } from 'idb';

const DB_NAME = 'biji-v1';
const DB_VERSION = 1;

let _dbPromise = null;

/**
 * Open (or return cached) database handle.
 * Runs the upgrade callback on first open or version bump.
 */
export function getDB() {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // ── notes store ──────────────────────────────────────
        if (!db.objectStoreNames.contains('notes')) {
          const notes = db.createObjectStore('notes', { keyPath: 'id' });
          notes.createIndex('category', 'category');
          notes.createIndex('created', 'created');
          notes.createIndex('modified', 'modified');
          notes.createIndex('pinned', 'pinned');
          notes.createIndex('deleted_at', 'deleted_at');
        }

        // ── meta store (key-value, no keyPath) ───────────────
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }

        // ── sync_queue store ─────────────────────────────────
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      },
    });
  }
  return _dbPromise;
}

// ── Notes CRUD ───────────────────────────────────────────────

/**
 * Return every note (including soft-deleted ones).
 * Usually you want getVisibleNotes() instead.
 */
export async function getAllNotes() {
  const db = await getDB();
  return db.getAll('notes');
}

/**
 * Return a single note by id, or undefined.
 */
export async function getNote(id) {
  const db = await getDB();
  return db.get('notes', id);
}

/**
 * Put (create or update) a single note.
 */
export async function putNote(note) {
  const db = await getDB();
  return db.put('notes', note);
}

/**
 * Delete a note record permanently.
 * Prefer softDelete (set deleted_at) for user-facing deletes.
 */
export async function deleteNote(id) {
  const db = await getDB();
  return db.delete('notes', id);
}

/**
 * Return notes whose category matches, excluding soft-deleted.
 */
export async function getNotesByCategory(category) {
  const db = await getDB();
  const all = await db.getAllFromIndex('notes', 'category', category);
  return all.filter((n) => !n.deleted_at);
}

/**
 * Return notes created within the last N months, excluding soft-deleted.
 * @param {number} months — how many months back
 */
export async function getRecentNotes(months = 6) {
  const db = await getDB();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffISO = cutoff.toISOString();

  const all = await db.getAll('notes');
  return all.filter(
    (n) => !n.deleted_at && n.created >= cutoffISO
  );
}

// ── Meta (key-value) ─────────────────────────────────────────

/**
 * Read a single meta value by key. Returns undefined if missing.
 */
export async function getMeta(key) {
  const db = await getDB();
  return db.get('meta', key);
}

/**
 * Write a single meta value.
 */
export async function setMeta(key, value) {
  const db = await getDB();
  return db.put('meta', value, key);
}

// ── Sync queue ───────────────────────────────────────────────

/**
 * Enqueue a sync action (e.g. { type: 'upsert', noteId: '...', data: {...} }).
 */
export async function enqueueSync(action) {
  const db = await getDB();
  return db.add('sync_queue', { ...action, enqueuedAt: new Date().toISOString() });
}

/**
 * Return all queued sync actions (ordered by autoIncrement id).
 */
export async function getSyncQueue() {
  const db = await getDB();
  return db.getAll('sync_queue');
}

/**
 * Clear the entire sync queue (after a successful sync).
 */
export async function clearSyncQueue() {
  const db = await getDB();
  const tx = db.transaction('sync_queue', 'readwrite');
  await tx.objectStore('sync_queue').clear();
  await tx.done;
}

// ── Device fingerprint ───────────────────────────────────────

/**
 * Return a short device fingerprint, cached in localStorage.
 * Used to generate unique note IDs when multiple devices share a DB.
 */
export function getDeviceFingerprint() {
  let fp = localStorage.getItem('biji.deviceFingerprint');
  if (!fp) {
    fp = Math.random().toString(36).slice(2, 5);
    localStorage.setItem('biji.deviceFingerprint', fp);
  }
  return fp;
}
