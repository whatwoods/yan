// migrate.js — Migrate data from localStorage to IndexedDB.
// Run once on app startup; sets meta.migrated = true so it won't repeat.

import { getDB, putNote, setMeta, getMeta } from './db.js';
import { generateId } from './note-id.js';
import { TAG_TO_CATEGORY } from './store.jsx';

const STORAGE_NOTES = 'yan.notes.v1';
const STORAGE_SETTINGS = 'yan.settings.v1';
const STORAGE_FIRST_RUN = 'yan.firstRun.v1';

function guessCategory(oldTags) {
  if (!oldTags || oldTags.length === 0) return '想法';
  // Pick the first tag that maps to a category
  for (const t of oldTags) {
    const cat = TAG_TO_CATEGORY[t.label];
    if (cat) return cat;
  }
  return '想法';
}

// ── Main migration ───────────────────────────────────────────

/**
 * Migrate localStorage data to IndexedDB.
 * Safe to call multiple times — skips if already migrated.
 */
export async function migrate() {
  // Already migrated?
  const done = await getMeta('migrated');
  if (done) return false;

  // Read old data from localStorage
  let oldNotes = [];
  try {
    oldNotes = JSON.parse(localStorage.getItem(STORAGE_NOTES) || '[]');
  } catch {
    oldNotes = [];
  }

  if (!Array.isArray(oldNotes)) oldNotes = [];

  // Convert and write each note
  for (const old of oldNotes) {
    const converted = convertNote(old);
    await putNote(converted);
  }

  // Migrate settings
  let oldSettings = null;
  try {
    oldSettings = JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || 'null');
  } catch {
    oldSettings = null;
  }
  if (oldSettings) {
    await setMeta('settings', oldSettings);
  }

  // Mark migration complete
  await setMeta('migrated', true);

  // Clear old localStorage copies
  try {
    localStorage.removeItem(STORAGE_NOTES);
    localStorage.removeItem(STORAGE_SETTINGS);
    // Keep STORAGE_FIRST_RUN so onboarding doesn't re-trigger
  } catch {}

  return true; // migration happened
}

// ── Note converter ───────────────────────────────────────────

function convertNote(old) {
  const createdISO = old.createdAt
    ? new Date(old.createdAt).toISOString()
    : new Date().toISOString();

  // Convert tags: keep as [{label, color}] for backward compat with screens
  const tags = (old.tags || []).map((t) => ({
    label: t.label || t,
    color: t.color || 'ink',
  }));

  const category = guessCategory(old.tags);

  return {
    // Keep old id if it exists; otherwise generate a new-format one
    id: old.id || generateId(),
    created: createdISO,
    modified: createdISO,
    kind: old.kind || 'text',
    category,
    tags,
    people: old.people || [],
    pinned: old.pinned || false,
    title: old.title || '',
    body: old.body || '',
    summary: old.summary || '',
    ai: null,
    attachments: old.photo ? ['photo-1.jpg'] : [],
    deleted_at: null,

    // Backward-compat fields so existing screens don't break
    createdAt: old.createdAt || Date.now(),
    photo: old.photo || null,
    duration: old.duration || null,
  };
}
