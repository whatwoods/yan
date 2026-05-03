// store.jsx — IndexedDB-backed notes + settings, plus client-side AI tagging.
// Migrated from localStorage to IndexedDB (biji-v1) on first run.

import MiniSearch from 'minisearch';
import { formatRelative } from './tokens.jsx';
import {
  getAllNotes, putNote, deleteNote as dbDeleteNote,
  getMeta, setMeta,
  enqueueSync, getSyncQueue, clearSyncQueue,
} from './db.js';
import { migrate } from './migrate.js';

// ── MiniSearch full-text index ────────────────────────────────
let searchIndex = null;

export function buildSearchIndex(notes) {
  searchIndex = new MiniSearch({
    fields: ['title', 'body'],
    storeFields: ['id', 'title'],
    searchOptions: { boost: { title: 3 }, prefix: true },
  });
  searchIndex.addAll(notes.map((n) => ({ id: n.id, title: n.title, body: n.body || '' })));
}

export function searchNotes(query) {
  if (!searchIndex || !query?.trim()) return [];
  try {
    return searchIndex.search(query.trim()).map((r) => r.id);
  } catch {
    return [];
  }
}

export function rebuildSearchIndex() {
  searchIndex = null;
  buildSearchIndex(Store.getNotes());
}
import { generateId } from './note-format.js';
import { classifyNote, extractTagsAndPeople, generateSummary } from './ai.js';

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

// ── Tag dictionary — used by the local "AI" tagger ────────────
// Each tag is a category that maps to triggering keywords.
// In a production app this would be replaced by an Anthropic API call;
// here we approximate with a dictionary so the UX still feels alive offline.
const TAG_DICT = [
  { label: '工作',   color: 'indigo', kws: ['会议','项目','需求','复盘','上线','排期','okr','汇报','上司','同事','工位','加班','任务','schedule','deadline'] },
  { label: '产品',   color: 'bamboo', kws: ['产品','设计','原型','线框','用户','流程','首屏','按钮','交互','体验','ux','ui','feature','需求'] },
  { label: '阅读',   color: 'bamboo', kws: ['书','读','章','页','作者','读到','摘抄','金句','《','》','novel','chapter'] },
  { label: '人',     color: 'plum',   kws: ['朋友','同事','家人','妈','爸','她','他','哥','姐','妹','弟','聊到','约','见','聚'] },
  { label: '身体',   color: 'seal',   kws: ['跑步','健身','睡眠','失眠','吃','喝','胃','头疼','感冒','瑜伽','力量','重量','减脂','体重','workout'] },
  { label: '旅行',   color: 'ochre',  kws: ['旅行','出差','机票','酒店','景点','导航','地图','杭州','北京','上海','京都','东京','日本','美国'] },
  { label: '想法',   color: 'ink',    kws: ['想到','突然','觉得','或许','也许','也许','idea','灵感','念头','一闪'] },
  { label: '待办',   color: 'seal',   kws: ['todo','todo:','待办','要做','别忘','记得','下午','明天','周五','周末','下周','下月','买'] },
  { label: '摘抄',   color: 'ochre',  kws: ['"','"','「','」','——','——','引用','quote'] },
  { label: '感受',   color: 'plum',   kws: ['开心','难过','焦虑','紧张','压力','放松','害怕','喜欢','讨厌','感觉','心情','emo'] },
  { label: '学习',   color: 'indigo', kws: ['学','课','视频','教程','笔记','单词','英语','日语','算法','数学','物理','course'] },
  { label: '钱',     color: 'ochre',  kws: ['花','买','钱','工资','收入','支出','账单','理财','股票','基金','投资'] },
];

const PEOPLE_HINT = /([一-龥])(姐|哥|弟|妹|姨|叔|爸|妈|总|先生|女士)|@([一-龥\w]+)/g;

// ── AI tagging functions (unchanged) ─────────────────────────

export function autoTags(body) {
  const text = (body || '').toLowerCase();
  const found = [];
  for (const t of TAG_DICT) {
    if (t.kws.some((k) => text.includes(k.toLowerCase()))) {
      found.push({ label: t.label, color: t.color });
    }
    if (found.length >= 4) break;
  }
  if (found.length === 0) found.push({ label: '随手', color: 'ink' });
  return found;
}

export function autoTitle(body) {
  if (!body) return '无字';
  const firstLine = body.trim().split(/\n/)[0];
  if (firstLine.length <= 18) return firstLine;
  // Try to break at the first natural break.
  const trimmed = firstLine.slice(0, 18).replace(/[，。、：；,.!?]\s*$/, '');
  return trimmed + '…';
}

export function autoSummary(body) {
  if (!body) return '';
  const compact = body.replace(/\s+/g, ' ').trim();
  if (compact.length <= 32) return compact;
  return compact.slice(0, 32) + '…';
}

export function extractPeople(body) {
  const set = new Set();
  let m;
  PEOPLE_HINT.lastIndex = 0;
  while ((m = PEOPLE_HINT.exec(body)) !== null) {
    if (m[3]) set.add(m[3]);
    else if (m[1] && m[2]) set.add(m[1] + m[2]);
  }
  return [...set];
}

/**
 * Run AI classify/tag/summarize pipeline on a note.
 * Returns a patch object or null (caller should fall back to rule-based).
 */
export async function processNoteWithAI(note, categories) {
  try {
    const [category, tagResult, summary] = await Promise.all([
      classifyNote(note.body, categories),
      extractTagsAndPeople(note.body),
      generateSummary(note.body),
    ]);
    return {
      category: category || note.category || '想法',
      tags: tagResult.tags.length ? tagResult.tags.map(t => ({ label: t, color: 'ink' })) : note.tags,
      people: tagResult.people.length ? tagResult.people : note.people,
      summary: summary || note.summary,
      ai: summary ? { summary, generated_at: new Date().toISOString(), model: 'ai' } : note.ai,
    };
  } catch {
    return null;
  }
}

// ── localStorage helpers (for first-run flag only) ───────────

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
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
      id: generateId('s01'), kind: 'text',
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
            } catch {
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
      } catch {}
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
      id: note.id || generateId(getDeviceFingerprint()),
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
    return updated;
  },

  async deleteNote(id) {
    // Hard delete
    await dbDeleteNote(id);
    Store._notes = Store._notes.filter((n) => n.id !== id);
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
        persona: 'yan', theme: 'paper', font: 'serif', autoTag: true, density: 'comfy',
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

function getDeviceFingerprint() {
  let fp = localStorage.getItem('biji.deviceFingerprint');
  if (!fp) {
    fp = Math.random().toString(36).slice(2, 5);
    localStorage.setItem('biji.deviceFingerprint', fp);
  }
  return fp;
}

function guessCategoryFromTags(tags) {
  if (!tags || tags.length === 0) return '想法';
  const TAG_TO_CATEGORY = {
    '工作': '工作', '产品': '工作', '首屏': '工作', '决策': '工作',
    '阅读': '学习', '学习': '学习',
    '人': '生活', '身体': '生活', '旅行': '生活', '生活': '生活',
    '待办': '生活', '钱': '生活', '摘抄': '生活',
    '想法': '想法', '感受': '想法', '随手': '想法',
    'AI': 'AI', '开发': '开发', '收藏': '收藏',
  };
  for (const t of tags) {
    const cat = TAG_TO_CATEGORY[t.label || t];
    if (cat) return cat;
  }
  return '想法';
}

// ── chat with 砚 — generates plausible responses based on memory ─────
export function askYan(question, notes) {
  const q = question.toLowerCase();
  const matched = notes.filter((n) => {
    const hay = (n.title + ' ' + n.body + ' ' + (n.tags || []).map(t => t.label).join(' ')).toLowerCase();
    return q.split(/\s+/).filter(Boolean).some((w) => hay.includes(w)) ||
      (n.tags || []).some((t) => q.includes(t.label));
  }).slice(0, 6);

  if (matched.length === 0) {
    return {
      text: '翻完了 ' + notes.length + ' 篇笔记，没找到与此特别相关的。要不你先记一笔，让我有所凭依？',
      refs: [],
    };
  }
  const tagCounts = {};
  matched.forEach((n) => (n.tags || []).forEach((t) => {
    tagCounts[t.label] = (tagCounts[t.label] || 0) + 1;
  }));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const tagLine = topTags.length ? `多与 ${topTags.map(([l]) => `「${l}」`).join('、')} 有关。` : '';

  return {
    text: `翻了你的 ${notes.length} 篇笔记，找到 ${matched.length} 条相关的。${tagLine}最近一次是${formatRelative(matched[0].createdAt)}：「${matched[0].title}」。`,
    refs: matched.map((n) => ({ id: n.id, title: n.title, when: formatRelative(n.createdAt) })),
  };
}
