// store.jsx — IndexedDB-backed notes + settings.
// Migrated from localStorage to IndexedDB (biji-v1) on first run.

import {
  getAllNotes, putNote, deleteNote as dbDeleteNote,
  getMeta, setMeta,
  enqueueSync, getSyncQueue, clearSyncQueue,
  getDeviceFingerprint,
} from './db.js';
import { migrate } from './migrate.js';
import { generateId } from './note-format.js';

// Re-export from extracted modules so existing consumers keep working
export { buildSearchIndex, searchNotes, rebuildSearchIndex, addNoteToIndex, updateNoteInIndex, removeNoteFromIndex } from './search.js';
export { autoTags, autoTitle, autoSummary, extractPeople, processNoteWithAI, askYan } from './ai-tagger.js';
export { TAG_TO_CATEGORY } from './tag-colors.js';

import { buildSearchIndex, addNoteToIndex, updateNoteInIndex, removeNoteFromIndex } from './search.js';
import { TAG_TO_CATEGORY } from './tag-colors.js';

const STORAGE_FIRST_RUN = 'biji.firstRun.v1';

// ── Default categories ───────────────────────────────────────

export const DEFAULT_CATEGORIES = [
  { name: '学习', color: '竹青', hex: '#5b7a5a' },
  { name: '工作', color: '群青', hex: '#3d5a7c' },
  { name: '生活', color: '藤黄', hex: '#c89342' },
  { name: '想法', color: '梅紫', hex: '#8b4a5e' },
  { name: 'AI', color: '印章红', hex: '#b8443a' },
  { name: '开发', color: '茶色', hex: '#8b6f47' },
  { name: '收藏', color: '墨色', hex: '#1f1a14' },
];

// ── localStorage helpers (for first-run flag only) ───────────

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch (e) { console.warn('[store] 读取本地存储失败:', e); return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── Seed notes for fresh installs (new data model) ───────────

function seedNotes() {
  const now = new Date();
  const ts = new Date(now.getTime() - 3_600_000).toISOString();
  const ct = now.getTime() - 3_600_000;

  return [
    {
      id: generateId(), kind: 'text',
      created: ts, modified: ts,
      title: '欢迎使用砚',
      body: '砚是一本会自己整理的本子。记下即整理，不用管标签和分类。\n\n**怎么用：**\n\n1. 点底部「记」，随手写下任何想法\n2. 砚会自动分类、打标签、写摘要\n3. 在「本」页按分类和标签翻阅\n4. 点「砚」页的「问砚」，用自然语言搜笔记\n\n**进阶：**\n\n- 去「设置」配 AI 供应商，砚就能真正活过来\n- 配 WebDAV，笔记自动同步到你的网盘\n- 设主密码，让 API Key 在多设备间安全同步\n\n这条笔记可以删掉。去记你的第一笔吧。',
      category: '想法',
      tags: [{ label: '教程', color: 'ink' }],
      summary: '砚的使用指南',
      ai: null,
      people: [],
      attachments: [],
      deleted_at: null,
      pinned: true,
      createdAt: ct,
      photo: null,
      duration: null,
    },
  ];
}

// ── Store ────────────────────────────────────────────────────

export const Store = {
  _notes: [],     // in-memory cache
  _settings: null,

  // ── Init (call once on app mount) ────────────────────────
  async init() {
    // 1. Run migration from localStorage if needed
    await migrate();

    // 2. Load notes from IndexedDB
    const all = await getAllNotes();

    if (all.length === 0) {
      // Fresh install — seed demo notes
      const seeded = seedNotes();
      for (const n of seeded) {
        await putNote(n);
      }
      Store._notes = seeded.map((n) => ensureCompat(n));
    } else {
      Store._notes = all.map((n) => ensureCompat(n));
    }

    // 3. Auto-cleanup: permanently delete notes soft-deleted > 30 days ago
    const THIRTY_DAYS = 30 * 86_400_000;
    const cutoff = Date.now() - THIRTY_DAYS;
    const stale = Store._notes.filter(
      (n) => n.deleted_at && new Date(n.deleted_at).getTime() < cutoff
    );
    for (const n of stale) {
      await dbDeleteNote(n.id);
      Store._notes = Store._notes.filter((x) => x.id !== n.id);
    }

    // 4. Drain sync queue: retry any pending writes
    try {
      const queue = await getSyncQueue();
      if (queue.length > 0) {
        let allSucceeded = true;
        for (const item of queue) {
          if (item.action === 'upsert' && item.data) {
            try {
              await putNote(item.data);
            } catch (e) {
              console.warn('[store] 队列项恢复失败:', e);
              allSucceeded = false;
            }
          }
        }
        if (allSucceeded) {
          await clearSyncQueue();
          await setMeta('syncStatus', 'synced');
        }
      } else {
        // No pending queue — only set synced if not already in error state
        const currentStatus = await getMeta('syncStatus');
        if (!currentStatus) await setMeta('syncStatus', 'synced');
      }
    } catch (err) {
      console.error('Failed to drain sync queue:', err);
    }

    // 5. Initialize default categories if not present
    const cats = await getMeta('categories');
    if (!cats) {
      await setMeta('categories', DEFAULT_CATEGORIES);
    }

    // 6. Build full-text search index
    buildSearchIndex(Store._notes);

    // 7. Load settings (from IndexedDB meta, falling back to localStorage)
    let settings = await getMeta('settings');
    if (!settings) {
      // Try reading from localStorage (pre-migration or first load)
      try {
        settings = JSON.parse(localStorage.getItem('biji.settings.v1') || 'null');
      } catch (e) { console.warn('[store] 读取本地设置失败:', e); }
    }
    if (!settings) {
      settings = {
        persona: 'yan',
        theme: 'paper',
        font: 'serif',
        autoTag: true,
        density: 'comfy',
      };
    }
    Store._settings = settings;
    // Persist to IndexedDB for future reads
    await setMeta('settings', settings);

    return Store._notes;
  },

  // ── Notes (read from memory cache) ──────────────────────

  /**
   * Return non-deleted notes from the in-memory cache.
   * This is the primary read method — synchronous, fast.
   */
  getNotes() {
    return Store._notes.filter((n) => !n.deleted_at);
  },

  /**
   * Return ALL notes (including soft-deleted) from cache.
   */
  getAllCachedNotes() {
    return Store._notes;
  },

  /**
   * Return all notes including soft-deleted ones (alias for trash screen).
   */
  getAllNotesWithDeleted() {
    return Store._notes;
  },

  // ── Notes CRUD (async, writes to IndexedDB + cache) ─────

  async addNote(note) {
    const now = new Date().toISOString();
    const fullNote = {
      id: note.id || generateId(),
      created: note.created || now,
      modified: now,
      kind: note.kind || 'text',
      category: note.category || guessCategoryFromTags(note.tags),
      tags: note.tags || [],
      people: note.people || [],
      pinned: note.pinned || false,
      title: note.title || '',
      body: note.body || '',
      summary: note.summary || '',
      ai: note.ai || null,
      attachments: note.attachments || [],
      deleted_at: null,
      // backward compat
      createdAt: note.createdAt || Date.now(),
      photo: note.photo || null,
      duration: note.duration || null,
    };

    try {
      await putNote(fullNote);
    } catch (err) {
      console.error('putNote failed, enqueuing:', err);
      await enqueueSync({ action: 'upsert', note_id: fullNote.id, data: fullNote });
      await setMeta('syncStatus', 'pending');
    }
    Store._notes.unshift(fullNote);
    addNoteToIndex(fullNote);
    return fullNote;
  },

  async updateNote(id, patch) {
    const idx = Store._notes.findIndex((n) => n.id === id);
    if (idx === -1) return null;

    const updated = {
      ...Store._notes[idx],
      ...patch,
      modified: new Date().toISOString(),
    };
    // Sync backward-compat fields
    if (patch.created) updated.createdAt = new Date(patch.created).getTime();

    try {
      await putNote(updated);
    } catch (err) {
      console.error('putNote failed, enqueuing:', err);
      await enqueueSync({ action: 'upsert', note_id: id, data: updated });
      await setMeta('syncStatus', 'pending');
    }
    Store._notes[idx] = updated;
    updateNoteInIndex(updated);
    return updated;
  },

  async deleteNote(id) {
    // Hard delete
    await dbDeleteNote(id);
    Store._notes = Store._notes.filter((n) => n.id !== id);
    removeNoteFromIndex(id);
  },

  /**
   * Soft-delete: set deleted_at timestamp, keep in DB.
   */
  async softDelete(id) {
    return Store.updateNote(id, { deleted_at: new Date().toISOString() });
  },

  /**
   * Restore a soft-deleted note.
   */
  async restore(id) {
    return Store.updateNote(id, { deleted_at: null });
  },

  /**
   * Permanently remove a note from IndexedDB.
   */
  async permanentDelete(id) {
    return Store.deleteNote(id);
  },

  // ── Settings ────────────────────────────────────────────

  loadSettings() {
    // Synchronous fallback for initial render before init() completes
    if (Store._settings) return Store._settings;
    try {
      return JSON.parse(localStorage.getItem('biji.settings.v1') || 'null') || {
        persona: 'yan', theme: 'paper', font: 'wenkai', autoTag: true, density: 'comfy',
      };
    } catch {
      return { persona: 'yan', theme: 'paper', font: 'serif', autoTag: true, density: 'comfy' };
    }
  },

  async saveSettings(s) {
    Store._settings = s;
    await setMeta('settings', s);
  },

  // ── Categories ──────────────────────────────────────────

  async getCategories() {
    const cats = await getMeta('categories');
    return cats || DEFAULT_CATEGORIES;
  },

  async saveCategories(cats) {
    await setMeta('categories', cats);
  },

  // ── Device fingerprint ──────────────────────────────────

  getDeviceFingerprint,

  // ── First-run (kept in localStorage for simplicity) ─────

  isFirstRun() { return loadJSON(STORAGE_FIRST_RUN, true); },
  markRun() { saveJSON(STORAGE_FIRST_RUN, false); },
};

// ── Helpers ──────────────────────────────────────────────────

/**
 * Add backward-compat fields to a note so existing screens still work.
 * - createdAt (number) from created (ISO string)
 * - photo (data URL or null)
 * - duration (string or null)
 */
function ensureCompat(note) {
  if (note.createdAt === undefined) {
    note.createdAt = note.created ? new Date(note.created).getTime() : Date.now();
  }
  if (note.photo === undefined) {
    note.photo = null; // old photos were base64 data URLs, not recoverable from attachments
  }
  if (note.duration === undefined) {
    note.duration = null;
  }
  return note;
}

function guessCategoryFromTags(tags) {
  if (!tags || tags.length === 0) return '想法';
  for (const t of tags) {
    const cat = TAG_TO_CATEGORY[t.label || t];
    if (cat) return cat;
  }
  return '想法';
}
