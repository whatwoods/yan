// store.jsx — IndexedDB-backed notes + settings, plus client-side AI tagging.
// Migrated from localStorage to IndexedDB (biji-v1) on first run.

import { formatRelative } from './tokens.jsx';
import {
  getAllNotes, putNote, deleteNote as dbDeleteNote,
  getMeta, setMeta,
} from './db.js';
import { migrate } from './migrate.js';
import { generateId } from './note-format.js';

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
  const HOUR = 3_600_000, DAY = 86_400_000;
  const ts = (offset) => new Date(now.getTime() - offset).toISOString();
  const ct = (offset) => now.getTime() - offset; // backward-compat createdAt

  return [
    {
      id: generateId('s01'), kind: 'text',
      created: ts(HOUR), modified: ts(HOUR),
      title: '关于"快速记"的几个想法',
      body: '晚饭后又重新想了一遍首屏。觉得之前那版有个核心问题：把"功能"和"内容"放在一起，反而稀释了"快速记"的紧迫感。\n\n新的方案——首屏只做一件事，就是写。文字作为基础底色，语音、拍照、贴附件作为悬浮的圆形按钮，分布在输入框之下。\n\n关键是节奏：用户从"想记"到"开始记"应该不超过 1 秒。',
      category: '工作',
      tags: [{ label: '工作', color: 'indigo' }, { label: '产品', color: 'bamboo' }, { label: '首屏', color: 'ochre' }, { label: '决策', color: 'ink' }],
      summary: '建议把输入框作为视觉中心，三种输入方式以悬浮按钮承载。',
      ai: null,
      people: ['阿宁'],
      attachments: [],
      deleted_at: null,
      pinned: true,
      // backward compat
      createdAt: ct(HOUR),
      photo: null,
      duration: null,
    },
    {
      id: generateId('s02'), kind: 'voice',
      created: ts(4 * HOUR), modified: ts(4 * HOUR),
      title: '与阿宁的电话',
      body: '聊到她要去杭州，可推荐几间安静的茶馆。她说工作上遇到瓶颈，想换个城市待几天。提醒她带《长物志》，路上看刚好。',
      category: '生活',
      tags: [{ label: '人', color: 'plum' }, { label: '阿宁', color: 'plum' }],
      summary: '阿宁要去杭州 · 推荐茶馆 · 带书',
      ai: null,
      people: ['阿宁'],
      attachments: [],
      deleted_at: null,
      pinned: false,
      createdAt: ct(4 * HOUR),
      photo: null,
      duration: '4:12',
    },
    {
      id: generateId('s03'), kind: 'text',
      created: ts(8 * HOUR), modified: ts(8 * HOUR),
      title: '咖啡馆窗边读到的句子',
      body: '"庭院深深深几许"——欧阳修\n\n这句话第一次在课本上读到时没什么感觉，今天在这家临河的小店里再读，忽然就懂了。',
      category: '学习',
      tags: [{ label: '阅读', color: 'bamboo' }, { label: '摘抄', color: 'ochre' }],
      summary: '欧阳修「庭院深深深几许」 · 重读有感',
      ai: null,
      people: [],
      attachments: [],
      deleted_at: null,
      pinned: false,
      createdAt: ct(8 * HOUR),
      photo: null,
      duration: null,
    },
    {
      id: generateId('s04'), kind: 'text',
      created: ts(DAY + 2 * HOUR), modified: ts(DAY + 2 * HOUR),
      title: '健身计划调整',
      body: '改成一三五早晨跑步，二四力量训练。周末休息或徒步。\n\n睡眠也得调，晚上 11 点前必须躺下。',
      category: '生活',
      tags: [{ label: '身体', color: 'seal' }, { label: '待办', color: 'seal' }],
      summary: '一三五跑步 / 二四力量 / 周末徒步 / 11 点睡',
      ai: null,
      people: [],
      attachments: [],
      deleted_at: null,
      pinned: false,
      createdAt: ct(DAY + 2 * HOUR),
      photo: null,
      duration: null,
    },
    {
      id: generateId('s05'), kind: 'text',
      created: ts(DAY + 9 * HOUR), modified: ts(DAY + 9 * HOUR),
      title: '苏堤的春景',
      body: '风很大，柳絮像下雪。沿着堤一路走到了苏小小墓。回程在断桥边的小馆吃了片儿川。',
      category: '生活',
      tags: [{ label: '旅行', color: 'ochre' }, { label: '感受', color: 'plum' }],
      summary: '苏堤 · 苏小小墓 · 片儿川',
      ai: null,
      people: [],
      attachments: [],
      deleted_at: null,
      pinned: false,
      createdAt: ct(DAY + 9 * HOUR),
      photo: null,
      duration: null,
    },
    {
      id: generateId('s06'), kind: 'text',
      created: ts(2 * DAY), modified: ts(2 * DAY),
      title: '产品评审 · 把"快速记"放在 C 位',
      body: '团队对首屏分歧挺大。结论：把"快速记"作为唯一首屏入口，导航缩到三栏 + 设置。',
      category: '工作',
      tags: [{ label: '工作', color: 'indigo' }, { label: '决策', color: 'ink' }],
      summary: '首屏 = 快速记 · 三栏 + 设置',
      ai: null,
      people: [],
      attachments: [],
      deleted_at: null,
      pinned: false,
      createdAt: ct(2 * DAY),
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

    // 4. Initialize default categories if not present
    const cats = await getMeta('categories');
    if (!cats) {
      await setMeta('categories', DEFAULT_CATEGORIES);
    }

    // 4. Load settings (from IndexedDB meta, falling back to localStorage)
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

    await putNote(fullNote);
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

    await putNote(updated);
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
