# 砚 v1.0 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将砚从 localStorage 原型升级为完整的 v1.0 PWA，包含 IndexedDB 数据层、WebDAV 同步、BYOK 多供应商 AI 集成、Tag Curator 和 RAG 问砚。

**Architecture:** 增量分层构建。先迁移到 Vite 构建系统，再逐层添加 M1 数据基建 → M2 AI 功能 → M3 打磨。每个 Task 完成后 app 均可运行。

**Tech Stack:** Vite + React 18 + JS（无 TS），idb，gray-matter，marked，webdav，minisearch

---

## 文件结构总览

### 新建文件
| 文件 | 职责 |
|---|---|
| `package.json` | npm 依赖与脚本 |
| `vite.config.js` | Vite 构建配置 |
| `index.html`（Vite 版） | 入口，改为 `<script type="module">` |
| `src/main.jsx` | React 入口，挂载 App |
| `src/db.js` | IndexedDB 封装（idb） |
| `src/note-format.js` | Markdown frontmatter 序列化/反序列化 |
| `src/sync.js` | WebDAV 同步引擎 |
| `src/crypto.js` | 主密码 + AES-GCM 加密 |
| `src/ai.js` | OpenAI 兼容 LLM 调用 |
| `src/curator.js` | Tag Curator 整理建议 |
| `src/rag.js` | RAG Tier 1 查询管线 |
| `src/migrate.js` | localStorage → IndexedDB 迁移 |
| `src/screen-trash.jsx` | 回收站界面 |
| `src/screen-setup.jsx` | WebDAV/AI/主密码设置向导 |

### 修改文件
| 文件 | 变更 |
|---|---|
| `src/app.js` → `src/app.jsx` | 改为 ES 模块导入，集成新 store |
| `src/store.js` → `src/store.jsx` | 重写为 IndexedDB 后端 |
| `src/tokens.js` → `src/tokens.jsx` | 改为 ES 模块导出 |
| `src/icons.js` → `src/icons.jsx` | 改为 ES 模块导出 |
| `src/components.js` → `src/components.jsx` | 改为 ES 模块导入 |
| `src/screen-*.js` → `.jsx` | 改为 ES 模块，适配新数据模型 |
| `styles.css` | 新增分类色条、同步状态、冲突提示样式 |
| `sw.js` | 更新缓存版本号 |
| `manifest.webmanifest` | 无需改动 |

---

## Phase 0: Vite 迁移

### Task 1: 初始化 Vite 项目

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Modify: `index.html`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "biji-yan",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "idb": "^8.0.0",
    "gray-matter": "^4.0.3",
    "marked": "^15.0.0",
    "webdav": "^5.7.0",
    "minisearch": "^7.1.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: 创建 vite.config.js**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
```

- [ ] **Step 3: 改写 index.html 为 Vite 入口**

将原 `index.html` 改为：
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#f4ede1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="笔记">
<meta name="mobile-web-app-capable" content="yes">
<meta name="description" content="一本会思考的本子 — 文字、语音、照片，砚为你识其要意。">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon.svg">
<title>笔记 · 一本会思考的本子</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;600;700&family=ZCOOL+XiaoWei&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div id="root">
  <div class="boot">
    <div class="boot-seal">砚</div>
    <div class="boot-text">研墨…</div>
  </div>
</div>
<script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 4: 安装依赖**

```bash
cd d:\App\Web\笔记App && npm install
```

- [ ] **Step 5: 提交**

```bash
git add package.json vite.config.js index.html package-lock.json node_modules/.package-lock.json
git commit -m "chore: scaffold Vite + npm dependencies"
```

---

### Task 2: 转换 tokens.js 和 icons.js 为 ES 模块

**Files:**
- Rename: `src/tokens.js` → `src/tokens.jsx`
- Rename: `src/icons.js` → `src/icons.jsx`

- [ ] **Step 1: 转换 tokens.js**

将 `src/tokens.js` 改为 ES 模块。移除所有 `window.X = X` 赋值，改为 `export`。

关键变更：
- 移除底部 `window.TOKENS = TOKENS;` 和 `window.PERSONAS = PERSONAS;`
- 在文件顶部/底部添加 `export { TOKENS, PERSONAS, formatRelative, dayLabel, timeLabel, fullDate }`
- 日期工具函数保留为具名导出

- [ ] **Step 2: 转换 icons.js**

同理：
- 移除 `window.ICONS = ICONS;`
- 添加 `export { ICONS };`
- 重命名为 `.jsx`

- [ ] **Step 3: 验证 dev server 启动**

```bash
npm run dev
```
此时会报错（因为 main.jsx 不存在），确认 Vite 本身能启动即可。

- [ ] **Step 4: 提交**

```bash
git add src/tokens.jsx src/icons.jsx
git rm src/tokens.js src/icons.js
git commit -m "refactor: convert tokens and icons to ES modules"
```

---

### Task 3: 转换 store.js 和 components.js 为 ES 模块

**Files:**
- Rename: `src/store.js` → `src/store.jsx`
- Rename: `src/components.js` → `src/components.jsx`

- [ ] **Step 1: 转换 store.js**

- 移除底部 `window.Store = Store; window.autoTags = ...` 等
- 添加导出：`export { Store, autoTags, autoTitle, autoSummary, extractPeople };`
- 在文件顶部从 `tokens.jsx` 导入需要的依赖（`formatRelative` 等）

- [ ] **Step 2: 转换 components.js**

- 移除 `window.X = X` 赋值
- 从 `tokens.jsx` 和 `icons.jsx` 导入 `TOKENS`、`ICONS`、`PERSONAS`
- 导出所有组件：`export { SealStamp, BrushTitle, Tag, KindBadge, BottomNav, ToastHost, showToast, ScrHead };`
- `showToast` 需要保持为全局可调用——导出后在 `main.jsx` 中挂到 `window.showToast`

- [ ] **Step 3: 提交**

```bash
git add src/store.jsx src/components.jsx
git rm src/store.js src/components.js
git commit -m "refactor: convert store and components to ES modules"
```

---

### Task 4: 转换所有 screen 文件为 ES 模块

**Files:**
- Rename: `src/screen-capture.js` → `src/screen-capture.jsx`
- Rename: `src/screen-list.js` → `src/screen-list.jsx`
- Rename: `src/screen-detail.js` → `src/screen-detail.jsx`
- Rename: `src/screen-yan.js` → `src/screen-yan.jsx`
- Rename: `src/screen-settings.js` → `src/screen-settings.jsx`
- Rename: `src/screen-onboard.js` → `src/screen-onboard.jsx`
- Rename: `src/screen-search.js` → `src/screen-search.jsx`
- Rename: `src/screen-tags.js` → `src/screen-tags.jsx`

- [ ] **Step 1: 转换每个 screen 文件**

每个文件的变更模式相同：
1. 移除 `window.X = X` 赋值
2. 在文件顶部添加 `import { TOKENS, PERSONAS, ... } from './tokens.jsx';`
3. 在文件顶部添加 `import { ICONS } from './icons.jsx';`
4. 在文件顶部添加 `import { Tag, SealStamp, ... } from './components.jsx';`
5. 移除文件内的 `const T = window.TOKENS; const I = window.ICONS;` 等（改为用导入的变量）
6. 添加具名导出：`export { CaptureScreen };` 等
7. `React` 的解构改为从 `import React, { useState, useEffect, ... } from 'react';`

- [ ] **Step 2: 创建 main.jsx 入口**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
```

- [ ] **Step 3: 转换 app.js 为 app.jsx**

- 添加所有 import 语句
- 移除 `window.X` 引用
- 导出 `App` 组件

- [ ] **Step 4: 验证 dev server 能渲染首页**

```bash
npm run dev
```
浏览器打开，确认能看到"砚"的开屏动画和主界面。

- [ ] **Step 5: 提交**

```bash
git add src/
git commit -m "refactor: convert all screens to ES modules, add main.jsx entry"
```

---

### Task 5: 清理旧文件，验证构建

**Files:**
- Delete: 原 `.js` 文件（已被 `.jsx` 替代）
- Modify: `sw.js`（更新缓存版本）
- Modify: `.gitignore`（添加 dist/、node_modules/）

- [ ] **Step 1: 确认 .gitignore 包含必要条目**

```
node_modules/
dist/
.DS_Store
design_extracted/
```

- [ ] **Step 2: 更新 sw.js 缓存版本号**

将 `biji-v1` 改为 `biji-v2`，更新预缓存文件列表（移除 CDN 脚本引用）。

- [ ] **Step 3: 运行构建确认无报错**

```bash
npm run build
```

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: complete Vite migration, update SW cache"
```

---

## Phase 1: M1 数据基建

### Task 6: IndexedDB 数据层 (db.js)

**Files:**
- Create: `src/db.js`

- [ ] **Step 1: 创建 db.js**

```js
import { openDB } from 'idb';

const DB_NAME = 'biji-v1';
const DB_VERSION = 1;

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // notes store
      if (!db.objectStoreNames.contains('notes')) {
        const store = db.createObjectStore('notes', { keyPath: 'id' });
        store.createIndex('category', 'category');
        store.createIndex('created', 'created');
        store.createIndex('modified', 'modified');
        store.createIndex('pinned', 'pinned');
        store.createIndex('deleted_at', 'deleted_at');
      }
      // meta store (key-value)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
      // sync queue
      if (!db.objectStoreNames.contains('sync_queue')) {
        const sq = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        sq.createIndex('note_id', 'note_id');
      }
    },
  });
}

// ── Notes CRUD ──
export async function getAllNotes() {
  const db = await getDB();
  return db.getAll('notes');
}

export async function getNote(id) {
  const db = await getDB();
  return db.get('notes', id);
}

export async function putNote(note) {
  const db = await getDB();
  await db.put('notes', note);
}

export async function deleteNote(id) {
  const db = await getDB();
  await db.delete('notes', id);
}

export async function getNotesByCategory(category) {
  const db = await getDB();
  return db.getAllFromIndex('notes', 'category', category);
}

export async function getRecentNotes(months = 6) {
  const db = await getDB();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffISO = cutoff.toISOString();
  const all = await db.getAll('notes');
  return all.filter(n => !n.deleted_at && n.created >= cutoffISO);
}

// ── Meta key-value ──
export async function getMeta(key) {
  const db = await getDB();
  return db.get('meta', key);
}

export async function setMeta(key, value) {
  const db = await getDB();
  await db.put('meta', value, key);
}

// ── Sync queue ──
export async function enqueueSync(action) {
  const db = await getDB();
  await db.add('sync_queue', { ...action, created: new Date().toISOString() });
}

export async function getSyncQueue() {
  const db = await getDB();
  return db.getAll('sync_queue');
}

export async function clearSyncQueue() {
  const db = await getDB();
  await db.clear('sync_queue');
}
```

- [ ] **Step 2: 提交**

```bash
git add src/db.js
git commit -m "feat: add IndexedDB data layer with notes, meta, sync_queue stores"
```

---

### Task 7: Markdown 格式序列化 (note-format.js)

**Files:**
- Create: `src/note-format.js`

- [ ] **Step 1: 创建 note-format.js**

```js
import matter from 'gray-matter';

/**
 * 将 note 对象序列化为 Markdown 字符串（含 YAML frontmatter）
 */
export function serialize(note) {
  const frontmatter = {
    id: note.id,
    created: note.created,
    modified: note.modified,
    kind: note.kind,
    category: note.category || '',
    tags: note.tags || [],
    people: note.people || [],
    pinned: note.pinned || false,
  };
  if (note.ai) {
    frontmatter.ai = note.ai;
  }
  if (note.attachments && note.attachments.length) {
    frontmatter.attachments = note.attachments;
  }
  if (note.deleted_at) {
    frontmatter.deleted_at = note.deleted_at;
  }

  return matter.stringify(note.body || '', frontmatter);
}

/**
 * 将 Markdown 字符串反序列化为 note 对象
 */
export function deserialize(md, filePath) {
  const { data, content } = matter(md);
  return {
    id: data.id || '',
    created: data.created || new Date().toISOString(),
    modified: data.modified || new Date().toISOString(),
    kind: data.kind || 'text',
    category: data.category || '',
    tags: data.tags || [],
    people: data.people || [],
    pinned: data.pinned || false,
    title: extractTitle(content),
    body: content.trim(),
    summary: data.ai?.summary || '',
    ai: data.ai || null,
    attachments: data.attachments || [],
    deleted_at: data.deleted_at || null,
  };
}

/**
 * 从正文提取标题（第一行前 18 字符）
 */
function extractTitle(body) {
  if (!body) return '无字';
  const firstLine = body.trim().split(/\n/)[0].replace(/^#+\s*/, '');
  if (firstLine.length <= 18) return firstLine;
  return firstLine.slice(0, 18).replace(/[，。、：；,.!?]\s*$/, '') + '…';
}

/**
 * 生成笔记 ID: YYYY-MM-DD-HHMM-<3char>
 */
export function generateId(deviceFingerprint) {
  const now = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fp = (deviceFingerprint || 'xxx').slice(0, 3);
  return `${date}-${time}-${fp}`;
}

/**
 * 获取 WebDAV 路径: /biji/notes/YYYY/MM/<id>.md
 */
export function getNotePath(id) {
  // id format: 2026-05-03-1742-a3f
  const parts = id.split('-');
  const year = parts[0];
  const month = parts[1];
  return `/biji/notes/${year}/${month}/${id}.md`;
}

/**
 * 获取附件路径: /biji/attachments/<id>/
 */
export function getAttachmentPath(id, filename) {
  return `/biji/attachments/${id}/${filename}`;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/note-format.js
git commit -m "feat: add Markdown frontmatter serialization/deserialization"
```

---

### Task 8: localStorage → IndexedDB 迁移 (migrate.js)

**Files:**
- Create: `src/migrate.js`

- [ ] **Step 1: 创建 migrate.js**

```js
import { getDB, putNote, setMeta, getMeta } from './db.js';
import { generateId } from './note-format.js';

const STORAGE_NOTES = 'biji.notes.v1';
const STORAGE_SETTINGS = 'biji.settings.v1';
const STORAGE_FIRST_RUN = 'biji.firstRun.v1';

// 分类映射：旧 tag → 新 category
const TAG_TO_CATEGORY = {
  '工作': '工作', '产品': '工作', '阅读': '学习', '学习': '学习',
  '人': '生活', '身体': '生活', '旅行': '生活', '生活': '生活',
  '想法': '想法', '感受': '想法', '待办': '生活', '摘抄': '收藏',
  'AI': 'AI', '开发': '开发', '收藏': '收藏',
};

function guessCategory(tags) {
  for (const t of (tags || [])) {
    if (TAG_TO_CATEGORY[t.label]) return TAG_TO_CATEGORY[t.label];
  }
  return '想法';
}

export async function migrateFromLocalStorage() {
  const already = await getMeta('migrated');
  if (already) return false;

  // 检查 localStorage 中是否有旧数据
  let oldNotes;
  try {
    oldNotes = JSON.parse(localStorage.getItem(STORAGE_NOTES) || 'null');
  } catch {
    oldNotes = null;
  }
  if (!oldNotes || !Array.isArray(oldNotes) || oldNotes.length === 0) {
    await setMeta('migrated', true);
    return false;
  }

  // 迁移每条笔记
  for (const old of oldNotes) {
    const now = new Date().toISOString();
    const note = {
      id: old.id.startsWith('s') ? generateId('mig') : old.id.replace(/^n_/, '').replace(/_/g, '-').slice(0, 17) + '-mig',
      created: old.createdAt ? new Date(old.createdAt).toISOString() : now,
      modified: now,
      kind: old.kind || 'text',
      category: guessCategory(old.tags),
      tags: (old.tags || []).map(t => t.label),
      people: old.people || [],
      pinned: old.pinned || false,
      title: old.title || '无字',
      body: old.body || '',
      summary: old.summary || '',
      ai: null,
      attachments: old.photo ? ['photo-1.jpg'] : [],
      deleted_at: null,
    };
    await putNote(note);
  }

  // 迁移设置
  try {
    const oldSettings = JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || 'null');
    if (oldSettings) {
      await setMeta('settings', oldSettings);
    }
  } catch {}

  // 标记已迁移
  await setMeta('migrated', true);

  // 清理 localStorage
  localStorage.removeItem(STORAGE_NOTES);
  localStorage.removeItem(STORAGE_SETTINGS);
  // 保留 STORAGE_FIRST_RUN 以维持首次运行状态

  return true;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/migrate.js
git commit -m "feat: add localStorage to IndexedDB migration"
```

---

### Task 9: 重写 store.jsx 为 IndexedDB 后端

**Files:**
- Modify: `src/store.jsx`

- [ ] **Step 1: 重写 store.jsx**

将 store 从 localStorage 改为 IndexedDB 后端。核心变更：

```jsx
import { getAllNotes, putNote, deleteNote as dbDeleteNote, getMeta, setMeta } from './db.js';
import { generateId, serialize, deserialize } from './note-format.js';
import { migrateFromLocalStorage } from './migrate.js';

// 保留规则版 AI 函数（作为 AI 不可用时的降级）
const TAG_DICT = [ /* 保持原有 TAG_DICT 不变 */ ];
const PEOPLE_HINT = /([一-龥])(姐|哥|弟|妹|姨|叔|爸|妈|总|先生|女士)|@([一-龥\w]+)/g;

export function autoTags(body) { /* 保持原有逻辑 */ }
export function autoTitle(body) { /* 保持原有逻辑 */ }
export function autoSummary(body) { /* 保持原有逻辑 */ }
export function extractPeople(body) { /* 保持原有逻辑 */ }

// 默认 7 大分类
export const DEFAULT_CATEGORIES = [
  { name: '学习', color: '竹青', hex: '#5b7a5a' },
  { name: '工作', color: '群青', hex: '#3d5a7c' },
  { name: '生活', color: '藤黄', hex: '#c89342' },
  { name: '想法', color: '梅紫', hex: '#8b4a5e' },
  { name: 'AI', color: '印章红', hex: '#b8443a' },
  { name: '开发', color: '茶色', hex: '#8b6f47' },
  { name: '收藏', color: '墨色', hex: '#1f1a14' },
];

// 默认设置
const DEFAULT_SETTINGS = {
  persona: 'yan',
  theme: 'paper',
  font: 'serif',
  autoTag: true,
  density: 'comfy',
};

// ── Store 对象（全部改为 async）──
export const Store = {
  _notes: [],       // 内存缓存
  _initialized: false,

  async init() {
    if (this._initialized) return;
    await migrateFromLocalStorage();
    this._notes = await getAllNotes();

    // 如果是空库，写入 seed 数据
    if (this._notes.length === 0) {
      const seeds = seedNotes();
      for (const n of seeds) await putNote(n);
      this._notes = seeds;
    }

    // 初始化默认分类
    const cats = await getMeta('categories');
    if (!cats) await setMeta('categories', DEFAULT_CATEGORIES);

    this._initialized = true;
  },

  getNotes() { return this._notes.filter(n => !n.deleted_at); },
  getAllNotesWithDeleted() { return [...this._notes]; },

  async addNote(draft, deviceFingerprint) {
    const now = new Date().toISOString();
    const note = {
      id: generateId(deviceFingerprint),
      created: now,
      modified: now,
      kind: draft.kind || 'text',
      category: draft.category || '',
      tags: draft.tags || [],
      people: draft.people || [],
      pinned: false,
      title: draft.title || autoTitle(draft.body),
      body: draft.body || '',
      summary: '',
      ai: null,
      attachments: draft.attachments || [],
      deleted_at: null,
    };
    await putNote(note);
    this._notes.unshift(note);
    return note;
  },

  async updateNote(id, patch) {
    const idx = this._notes.findIndex(n => n.id === id);
    if (idx === -1) return;
    const updated = { ...this._notes[idx], ...patch, modified: new Date().toISOString() };
    await putNote(updated);
    this._notes[idx] = updated;
    return updated;
  },

  async softDelete(id) {
    return this.updateNote(id, { deleted_at: new Date().toISOString() });
  },

  async restore(id) {
    return this.updateNote(id, { deleted_at: null });
  },

  async permanentDelete(id) {
    await dbDeleteNote(id);
    this._notes = this._notes.filter(n => n.id !== id);
  },

  // 设置
  async loadSettings() {
    const s = await getMeta('settings');
    return { ...DEFAULT_SETTINGS, ...(s || {}) };
  },
  async saveSettings(s) {
    await setMeta('settings', s);
  },

  // 首次运行
  async isFirstRun() {
    const v = await getMeta('firstRun');
    return v === undefined ? true : v;
  },
  async markRun() {
    await setMeta('firstRun', false);
  },

  // 分类
  async getCategories() {
    return (await getMeta('categories')) || DEFAULT_CATEGORIES;
  },
  async saveCategories(cats) {
    await setMeta('categories', cats);
  },

  // 设备指纹
  async getDeviceFingerprint() {
    let fp = await getMeta('deviceFingerprint');
    if (!fp) {
      fp = Math.random().toString(36).slice(2, 5);
      await setMeta('deviceFingerprint', fp);
    }
    return fp;
  },
};

function seedNotes() {
  const now = new Date().toISOString();
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  const nowMs = Date.now();
  const fp = 'sdx';
  return [
    {
      id: generateId(fp), kind: 'text',
      created: new Date(nowMs - HOUR).toISOString(), modified: now,
      category: '工作', tags: ['产品', '首屏', '决策'], people: ['阿宁'],
      pinned: true, title: '关于"快速记"的几个想法',
      body: '晚饭后又重新想了一遍首屏……',
      summary: '建议把输入框作为视觉中心，三种输入方式以悬浮按钮承载。',
      ai: null, attachments: [], deleted_at: null,
    },
    // ... 其余 5 条 seed 笔记同理转换
  ];
}
```

- [ ] **Step 2: 在 app.jsx 中适配 async Store**

App 组件需要在 mount 时调用 `Store.init()`，用 loading 状态处理初始化：

```jsx
const [ready, setReady] = useState(false);
useEffect(() => {
  Store.init().then(async () => {
    const s = await Store.loadSettings();
    setSettings(s);
    setNotes(Store.getNotes());
    setReady(true);
  });
}, []);
```

- [ ] **Step 3: 更新所有 screen 中的 notes 引用**

screen 组件不再从 props 接收 `notes`，而是从 `Store` 读取。或者保持 props 传递模式，在 App 中管理状态。

- [ ] **Step 4: 验证**

`npm run dev` → 首次打开应看到 seed 数据，刷新后数据仍在（IndexedDB）。

- [ ] **Step 5: 提交**

```bash
git add src/store.jsx src/app.jsx
git commit -m "feat: rewrite store to IndexedDB backend with async API"
```

---

### Task 10: 分类系统 UI 集成

**Files:**
- Modify: `src/screen-list.jsx`（分类 tab 筛选）
- Modify: `src/screen-detail.jsx`（分类色条显示）
- Modify: `src/screen-capture.jsx`（保存后显示分类）
- Modify: `styles.css`（分类色条样式）

- [ ] **Step 1: 在 screen-list.jsx 顶部添加分类 tab**

在 tag 筛选条上方添加一行分类 tab（横向滚动），点击切换分类筛选。每个 tab 使用对应分类的 hex 颜色。

- [ ] **Step 2: 在 NoteCard 左侧添加分类色条**

```jsx
<div className="note-card" style={{ borderLeft: `3px solid ${getCategoryHex(note.category)}` }}>
```

- [ ] **Step 3: 在 screen-detail.jsx 显示分类 badge**

在笔记元数据行显示分类名和对应颜色。

- [ ] **Step 4: 在 styles.css 中添加分类相关样式**

```css
.category-tab { /* 分类 tab 样式 */ }
.category-bar { /* 色条 */ }
.category-badge { /* 分类标签 */ }
```

- [ ] **Step 5: 提交**

```bash
git add src/screen-list.jsx src/screen-detail.jsx src/screen-capture.jsx styles.css
git commit -m "feat: integrate category system into list, detail, and capture screens"
```

---

### Task 11: 软删除回收站

**Files:**
- Create: `src/screen-trash.jsx`
- Modify: `src/app.jsx`（添加 trash 路由）
- Modify: `src/screen-settings.jsx`（添加回收站入口）

- [ ] **Step 1: 创建 screen-trash.jsx**

回收站界面：
- 列出 `deleted_at` 不为 null 的笔记
- 每条显示标题、删除日期、"还原"和"永久删除"按钮
- 空状态："回收站是空的"
- 顶部标题栏 + 返回按钮

- [ ] **Step 2: 在 app.jsx 添加 trash 路由**

添加 `route === 'trash'` 分支，渲染 `TrashScreen`。

- [ ] **Step 3: 在 settings 中添加回收站入口**

在"数据"section 添加"回收站"行，显示已删除笔记数量，点击跳转。

- [ ] **Step 4: 添加 30 天自动清理**

在 `Store.init()` 中添加：扫描 `deleted_at` 超过 30 天的笔记，执行 `permanentDelete`。

- [ ] **Step 5: 提交**

```bash
git add src/screen-trash.jsx src/app.jsx src/screen-settings.jsx src/store.jsx
git commit -m "feat: add soft-delete trash with 30-day auto-cleanup"
```

---

### Task 12: 加密模块 (crypto.js)

**Files:**
- Create: `src/crypto.js`

- [ ] **Step 1: 创建 crypto.js**

```js
/**
 * 主密码 → PBKDF2 → AES-GCM 加密/解密 API Keys
 */
const PBKDF2_ITERATIONS = 600000;
const ALGO = { name: 'AES-GCM', length: 256 };

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, ALGO, false, ['encrypt', 'decrypt']
  );
}

export async function encryptSecrets(data, password, salt) {
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data))
  );
  // 将 iv + ciphertext 合并为 base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptSecrets(encryptedBase64, password, salt) {
  try {
    const key = await deriveKey(password, salt);
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, key, ciphertext
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null; // 密码错误或数据损坏
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/crypto.js
git commit -m "feat: add master password encryption with PBKDF2 + AES-GCM"
```

---

### Task 13: WebDAV 同步引擎 (sync.js)

**Files:**
- Create: `src/sync.js`

- [ ] **Step 1: 创建 sync.js**

```js
import { createClient } from 'webdav';
import { serialize, deserialize, getNotePath } from './note-format.js';
import { putNote, getMeta, setMeta, enqueueSync, getSyncQueue, clearSyncQueue } from './db.js';

let client = null;

export function initWebDAV(config) {
  // config: { server, username, password, path: '/biji' }
  client = createClient(config.server, {
    username: config.username,
    password: config.password,
  });
}

export async function testConnection(config) {
  try {
    const c = createClient(config.server, {
      username: config.username,
      password: config.password,
    });
    await c.getDirectoryContents('/');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * 推送本地笔记到 WebDAV
 */
export async function pushNote(note) {
  if (!client) return;
  const md = serialize(note);
  const path = getNotePath(note.id);
  await client.putFileContents(path, md, { overwrite: true });
}

/**
 * 拉取远程笔记（近 N 个月）
 */
export async function pullNotes(months = 6) {
  if (!client) return [];
  const pulled = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dirPath = `/biji/notes/${year}/${month}`;
    try {
      const contents = await client.getDirectoryContents(dirPath);
      for (const file of contents) {
        if (file.filename.endsWith('.md')) {
          const md = await client.getFileContents(file.filename, { format: 'text' });
          const note = deserialize(md, file.filename);
          pulled.push(note);
        }
      }
    } catch {
      // 目录不存在，跳过
    }
  }
  return pulled;
}

/**
 * 同步：拉取远程 → 合并 → 推送本地
 */
export async function syncAll(localNotes) {
  if (!client) return { synced: 0, conflicts: [] };

  // 1. 拉取远程
  const remoteNotes = await pullNotes();
  const remoteMap = new Map(remoteNotes.map(n => [n.id, n]));

  // 2. 合并
  const conflicts = [];
  for (const local of localNotes) {
    const remote = remoteMap.get(local.id);
    if (!remote) {
      // 本地有，远程无 → 推送
      await pushNote(local);
    } else if (new Date(local.modified) > new Date(remote.modified)) {
      // 本地更新 → 推送
      await pushNote(local);
    } else if (new Date(remote.modified) > new Date(local.modified)) {
      // 远程更新 → 检查冲突
      if (new Date(local.modified) > new Date(await getMeta(`synced:${local.id}`) || 0)) {
        // 本地也有修改 → 冲突
        conflicts.push({ local, remote });
      } else {
        // 本地未改 → 用远程
        await putNote(remote);
      }
    }
    remoteMap.delete(local.id);
  }

  // 远程有，本地无 → 拉取
  for (const [, remote] of remoteMap) {
    await putNote(remote);
  }

  // 3. 处理同步队列
  const queue = await getSyncQueue();
  for (const item of queue) {
    try {
      if (item.action === 'push') {
        const note = localNotes.find(n => n.id === item.note_id);
        if (note) await pushNote(note);
      }
    } catch {}
  }
  await clearSyncQueue();

  // 记录同步时间
  await setMeta('lastSync', new Date().toISOString());

  return { synced: remoteNotes.length, conflicts };
}
```

- [ ] **Step 2: 提交**

```bash
git add src/sync.js
git commit -m "feat: add WebDAV sync engine with push/pull/conflict detection"
```

---

### Task 14: WebDAV / 加密 / 分类设置页面

**Files:**
- Modify: `src/screen-settings.jsx`
- Modify: `src/app.jsx`（添加 setup 路由）

- [ ] **Step 1: 扩展 screen-settings.jsx**

新增设置 section：

**AI 供应商:**
- 供应商下拉选择（10 个预设 + 自定义）
- Endpoint + API Key 输入框
- "测试连接" 按钮 → 调用 `GET /v1/models`
- 模型列表（连接成功后自动填充）

**WebDAV 同步:**
- 服务器 URL、用户名、密码
- "测试连接" 按钮
- 同步状态（上次同步时间、待同步数量）
- "立即同步" 按钮

**主密码:**
- 设置/修改主密码
- 密码强度提示

**大分类:**
- 列表展示 7 个分类（名称 + 颜色圆点）
- 点击编辑名称和颜色
- 添加/删除分类

- [ ] **Step 2: 创建 screen-setup.jsx**

首次配置向导（分步式）：
1. AI 供应商配置
2. WebDAV 配置
3. 主密码设置

- [ ] **Step 3: 在 app.jsx 中集成**

当 AI 未配置时，"砚"页顶部显示"砚还没活过来 · 去配 API Key"。

- [ ] **Step 4: 提交**

```bash
git add src/screen-settings.jsx src/screen-setup.jsx src/app.jsx
git commit -m "feat: expand settings with AI provider, WebDAV, master password, categories"
```

---

## Phase 2: M2 砚活过来

### Task 15: AI 服务模块 (ai.js)

**Files:**
- Create: `src/ai.js`

- [ ] **Step 1: 创建 ai.js**

```js
import { getMeta } from './db.js';

// 预设供应商
export const PROVIDERS = [
  { id: 'modelscope', name: '魔搭 ModelScope', endpoint: 'https://api-inference.modelscope.cn/v1' },
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1' },
  { id: 'moonshot', name: 'Moonshot Kimi', endpoint: 'https://api.moonshot.cn/v1' },
  { id: 'zhipu', name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'qwen', name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'minimax', name: 'MiniMax', endpoint: 'https://api.minimax.chat/v1' },
  { id: 'xiaomi', name: '小米', endpoint: 'https://token-plan-cn.xiaomimimo.com/v1' },
  { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1' },
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1' },
];

/**
 * 获取当前配置的 AI provider 和 key
 */
export async function getAIConfig() {
  return (await getMeta('aiConfig')) || { provider: null, apiKey: null, models: [] };
}

/**
 * 获取任务级模型分配
 */
export async function getModelAssignment() {
  return (await getMeta('modelAssignment')) || {
    classify: '', tag: '', summarize: '', insight: '', ask: '', curator: '',
  };
}

/**
 * 拉取模型列表
 */
export async function fetchModels(endpoint, apiKey) {
  try {
    const res = await fetch(`${endpoint}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return (data.data || []).map(m => m.id).sort();
  } catch (e) {
    return [];
  }
}

/**
 * 调用 Chat Completions
 */
export async function chatCompletion(task, messages, { temperature = 0.3, maxTokens = 500 } = {}) {
  const config = await getAIConfig();
  const assignment = await getModelAssignment();
  if (!config.apiKey || !config.endpoint) return null;

  const model = assignment[task] || config.defaultModel || 'gpt-4o-mini';
  try {
    const res = await fetch(`${config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

/**
 * 自动分类（封闭集）—— 从分类列表中选一个
 */
export async function classifyNote(body, categories) {
  const catNames = categories.map(c => c.name).join('、');
  const prompt = `从以下分类中选择最适合的一个，只回复分类名：${catNames}\n\n笔记内容：${body.slice(0, 200)}`;
  const result = await chatCompletion('classify', [
    { role: 'system', content: '你是一个笔记分类器。只回复分类名，不要其他内容。' },
    { role: 'user', content: prompt },
  ], { temperature: 0.1, maxTokens: 20 });
  if (result && categories.some(c => c.name === result.trim())) {
    return result.trim();
  }
  return null;
}

/**
 * 自动抽取标签和人名（开放集）
 */
export async function extractTagsAndPeople(body) {
  const prompt = `从以下笔记中提取标签（最多5个）和人名。回复 JSON 格式：{"tags":["标签1"],"people":["人名1"]}\n\n笔记：${body.slice(0, 300)}`;
  const result = await chatCompletion('tag', [
    { role: 'system', content: '你是笔记标签和人名提取器。只回复 JSON，不要其他内容。' },
    { role: 'user', content: prompt },
  ], { temperature: 0.2, maxTokens: 100 });
  try {
    const parsed = JSON.parse(result);
    return { tags: parsed.tags || [], people: parsed.people || [] };
  } catch {
    return { tags: [], people: [] };
  }
}

/**
 * 生成摘要
 */
export async function generateSummary(body) {
  const result = await chatCompletion('summarize', [
    { role: 'system', content: '用一句话（不超过20字）概括以下笔记的核心内容。只回复摘要。' },
    { role: 'user', content: body.slice(0, 300) },
  ], { temperature: 0.3, maxTokens: 50 });
  return result?.trim() || null;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/ai.js
git commit -m "feat: add BYOK multi-provider AI service with task-level model assignment"
```

---

### Task 16: 自动分类 + 标签 + 摘要管线

**Files:**
- Modify: `src/store.jsx`（保存后触发 AI）
- Modify: `src/app.jsx`（集成 AI 管线）

- [ ] **Step 1: 在 store.jsx 中添加 AI 管线方法**

```jsx
import { classifyNote, extractTagsAndPeople, generateSummary } from './ai.js';
import { autoTags as ruleAutoTags, autoSummary as ruleAutoSummary, extractPeople } from './store.jsx';

export async function processNoteWithAI(note, categories) {
  try {
    // 并行调用分类和标签抽取
    const [category, tagResult, summary] = await Promise.all([
      classifyNote(note.body, categories),
      extractTagsAndPeople(note.body),
      generateSummary(note.body),
    ]);
    return {
      category: category || guessCategory(note.tags),
      tags: tagResult.tags.length ? tagResult.tags : ruleAutoTags(note.body).map(t => t.label),
      people: tagResult.people,
      summary: summary || ruleAutoSummary(note.body),
      ai: { summary: summary || '', generated_at: new Date().toISOString(), model: 'configured' },
    };
  } catch {
    // 降级到规则版
    return {
      category: guessCategory(note.tags),
      tags: ruleAutoTags(note.body).map(t => t.label),
      people: extractPeople(note.body),
      summary: ruleAutoSummary(note.body),
      ai: null,
    };
  }
}
```

- [ ] **Step 2: 在 app.jsx 的 saveNewNote 中集成**

保存笔记后 1.5 秒防抖触发 AI 处理：

```jsx
const saveNewNote = useCallback(async (draft) => {
  const note = await Store.addNote(draft, deviceFingerprint);
  setNotes(Store.getNotes());
  window.showToast?.('已收');

  // AI 处理（1.5s 防抖）
  setTimeout(async () => {
    const categories = await Store.getCategories();
    const aiResult = await processNoteWithAI(note, categories);
    await Store.updateNote(note.id, aiResult);
    setNotes(Store.getNotes());
    window.showToast?.(`${persona.name}已识其要意`);
  }, 1500);
}, [persona.name, deviceFingerprint]);
```

- [ ] **Step 3: 验证**

配置 AI 后，保存笔记 → 1.5s 后分类/标签/摘要自动出现。未配置 AI 时降级到规则版。

- [ ] **Step 4: 提交**

```bash
git add src/store.jsx src/app.jsx
git commit -m "feat: integrate AI classify/tag/summarize pipeline with rule-based fallback"
```

---

### Task 17: 月度洞察

**Files:**
- Modify: `src/screen-yan.jsx`

- [ ] **Step 1: 在 screen-yan.jsx 中添加洞察生成**

在"砚"页面顶部添加月度洞察卡片：
- 显示当月笔记统计（数量、热门分类、热门标签、高峰时段）
- AI 生成的文字总结
- "重新生成"按钮

AI 调用：收集当月所有笔记的 `{title, summary, tags, category}` → 喂给 insight 模型 → 生成结构化总结。

- [ ] **Step 2: 洞察存储**

生成的洞察存储到 IndexedDB `meta` store（key: `insight:2026-05`），同时推送到 WebDAV `/biji/insights/2026-05.md`。

- [ ] **Step 3: 每月 1 号自动触发**

在 `Store.init()` 中检查：如果当月洞察不存在且日期为 1 号，后台生成。

- [ ] **Step 4: 提交**

```bash
git add src/screen-yan.jsx src/store.jsx
git commit -m "feat: add monthly AI insights with auto-generation"
```

---

### Task 18: Tag Curator 整理建议

**Files:**
- Create: `src/curator.js`
- Modify: `src/screen-yan.jsx`（展示 Curator 建议）

- [ ] **Step 1: 创建 curator.js**

```js
import { chatCompletion } from './ai.js';
import { getMeta, setMeta } from './db.js';

/**
 * 收集标签统计
 */
function gatherTagStats(notes) {
  const stats = {};
  for (const note of notes) {
    for (const tag of (note.tags || [])) {
      if (!stats[tag]) stats[tag] = { count: 0, lastUsed: note.created, coTags: {} };
      stats[tag].count++;
      if (note.created > stats[tag].lastUsed) stats[tag].lastUsed = note.created;
      for (const other of (note.tags || [])) {
        if (other !== tag) {
          stats[tag].coTags[other] = (stats[tag].coTags[other] || 0) + 1;
        }
      }
    }
  }
  return stats;
}

/**
 * 生成 Curator 建议
 */
export async function generateCuratorSuggestions(notes) {
  const stats = gatherTagStats(notes);
  const rejected = (await getMeta('curatorRejected')) || [];

  const statsText = Object.entries(stats)
    .map(([tag, s]) => `#${tag}: ${s.count}次, 最后使用${s.lastUsed}`)
    .join('\n');

  const prompt = `分析以下标签使用情况，给出整理建议。回复 JSON 数组：
[{"type":"merge|rename|archive|new","from":["原标签"],"to":"新标签","reason":"原因"}]

标签统计：
${statsText}

已拒绝的建议（不要重复）：${JSON.stringify(rejected)}`;

  const result = await chatCompletion('curator', [
    { role: 'system', content: '你是笔记标签整理助手。只回复 JSON 数组。' },
    { role: 'user', content: prompt },
  ], { temperature: 0.5, maxTokens: 500 });

  try {
    return JSON.parse(result);
  } catch {
    return [];
  }
}

/**
 * 应用 Curator 建议（批量更新笔记 frontmatter）
 */
export async function applyCuratorSuggestion(suggestion, notes, updateFn) {
  if (suggestion.type === 'merge' || suggestion.type === 'rename') {
    const newTag = suggestion.to;
    for (const note of notes) {
      if ((note.tags || []).some(t => suggestion.from.includes(t))) {
        const newTags = note.tags.map(t => suggestion.from.includes(t) ? newTag : t);
        await updateFn(note.id, { tags: [...new Set(newTags)] });
      }
    }
  }
}

export async function rejectCuratorSuggestion(suggestion) {
  const rejected = (await getMeta('curatorRejected')) || [];
  rejected.push(`${suggestion.type}:${suggestion.from.join(',')}`);
  await setMeta('curatorRejected', rejected);
}
```

- [ ] **Step 2: 在 screen-yan.jsx 中展示 Curator 建议**

在"砚"页面底部添加区域：
- "砚整理了 N 条建议" 提示
- 每条建议显示：类型、涉及标签、原因
- "应用" / "忽略" 按钮

- [ ] **Step 3: 触发逻辑**

在 `Store.init()` 中：检查距上次 Curator 运行是否 ≥7 天，或新增笔记 ≥50 条，后台运行。

- [ ] **Step 4: 提交**

```bash
git add src/curator.js src/screen-yan.jsx src/store.jsx
git commit -m "feat: add Tag Curator with merge/rename/archive suggestions"
```

---

### Task 19: 问砚 RAG Tier 1

**Files:**
- Create: `src/rag.js`
- Modify: `src/screen-yan.jsx`（替换旧 askYan）

- [ ] **Step 1: 创建 rag.js**

```js
import { chatCompletion } from './ai.js';

/**
 * Step 1: 查询解析 — 将自然语言转为结构化查询
 */
export async function parseQuery(question) {
  const prompt = `将以下问题解析为 JSON 查询条件：
{"time_range":"2026-05|2026-04|...","categories":["分类"],"tags":["标签"],"people":["人名"],"free_text":"关键词"}

问题：${question}`;

  const result = await chatCompletion('ask', [
    { role: 'system', content: '你是查询解析器。只回复 JSON。' },
    { role: 'user', content: prompt },
  ], { temperature: 0.1, maxTokens: 100 });

  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/**
 * Step 2: 在内存索引中过滤候选笔记
 */
export function filterCandidates(notes, query) {
  if (!query) return notes.slice(0, 50); // 降级：最近 50 条

  return notes.filter(note => {
    // 时间过滤
    if (query.time_range) {
      const noteMonth = note.created.slice(0, 7); // "2026-05"
      if (!noteMonth.startsWith(query.time_range.slice(0, 7))) return false;
    }
    // 分类过滤
    if (query.categories?.length && !query.categories.includes(note.category)) return false;
    // 标签过滤
    if (query.tags?.length && !(note.tags || []).some(t => query.tags.includes(t))) return false;
    // 人物过滤
    if (query.people?.length && !(note.people || []).some(p => query.people.includes(p))) return false;
    // 自由文本
    if (query.free_text) {
      const hay = `${note.title} ${note.body} ${(note.tags || []).join(' ')}`.toLowerCase();
      if (!hay.includes(query.free_text.toLowerCase())) return false;
    }
    return true;
  }).slice(0, 30);
}

/**
 * Step 3: 用强模型生成回答
 */
export async function answerQuestion(question, candidates) {
  const context = candidates.map((n, i) =>
    `[${i + 1}] ${n.title}（${n.created.slice(0, 10)}）标签：${(n.tags || []).join('、')}\n摘要：${n.summary}`
  ).join('\n\n');

  const prompt = `基于以下笔记回答问题。引用时标注 [编号]。

笔记：
${context}

问题：${question}`;

  const answer = await chatCompletion('ask', [
    { role: 'system', content: '你是笔记助手"砚"。根据用户的笔记回答问题，引用相关笔记。' },
    { role: 'user', content: prompt },
  ], { temperature: 0.5, maxTokens: 800 });

  return {
    text: answer || '翻完了笔记，但没能找到与此特别相关的。',
    refs: candidates.slice(0, 6).map(n => ({
      id: n.id, title: n.title, when: n.created.slice(0, 10),
    })),
  };
}

/**
 * 完整 RAG 流程
 */
export async function askYan(question, notes) {
  const query = await parseQuery(question);
  const candidates = filterCandidates(notes, query);
  return answerQuestion(question, candidates);
}
```

- [ ] **Step 2: 在 screen-yan.jsx 中替换旧 askYan**

将"问砚"聊天的 `window.askYan` 调用替换为 `import { askYan } from './rag.js'`。

- [ ] **Step 3: 提交**

```bash
git add src/rag.js src/screen-yan.jsx
git commit -m "feat: add RAG Tier 1 query pipeline with structured parsing"
```

---

## Phase 3: M3 打磨成型

### Task 20: 离线队列与错误恢复

**Files:**
- Modify: `src/store.jsx`
- Modify: `src/sync.js`

- [ ] **Step 1: 添加离线写入队列**

在 store 中，每次写入时如果同步失败，将操作加入 `sync_queue`。网络恢复时自动重试。

- [ ] **Step 2: 添加错误状态 UI**

在"本"页面顶部显示同步状态图标：
- 绿色：已同步
- 黄色：有待同步项
- 红色：3 次失败，提示用户检查

- [ ] **Step 3: 3 次失败后提示**

WebDAV 连续 3 次失败 → 弹出 toast "同步失败 · 请检查 WebDAV 配置"。

- [ ] **Step 4: 提交**

```bash
git add src/store.jsx src/sync.js src/screen-list.jsx
git commit -m "feat: add offline sync queue with auto-retry and error indicators"
```

---

### Task 21: 照片压缩与语音降级

**Files:**
- Modify: `src/screen-capture.jsx`

- [ ] **Step 1: 照片压缩**

上传前使用 Canvas API 压缩到长边 1920px、JPEG q=85：

```js
async function compressPhoto(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise(r => { img.onload = r; img.src = url; });
  const maxDim = 1920;
  let w = img.width, h = img.height;
  if (w > maxDim || h > maxDim) {
    const ratio = Math.min(maxDim / w, maxDim / h);
    w *= ratio; h *= ratio;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
}
```

- [ ] **Step 2: iOS 语音降级**

检测 `webkitSpeechRecognition` 不可用时：
- 录音按钮不灰掉，改为录制音频文件
- 录音结束后上传到 Whisper endpoint
- 如果供应商不支持 Whisper，提示"请用桌面/Android"

- [ ] **Step 3: 提交**

```bash
git add src/screen-capture.jsx
git commit -m "feat: add photo compression and iOS voice fallback"
```

---

### Task 22: 性能优化

**Files:**
- Modify: `src/store.jsx`
- Modify: `src/screen-list.jsx`

- [ ] **Step 1: 虚拟列表（1000+ 笔记）**

如果笔记数量 > 100，列表使用虚拟滚动（仅渲染可见区域）。

- [ ] **Step 2: 搜索索引**

使用 `minisearch` 构建内存全文索引，启动时从 IndexedDB 加载。

- [ ] **Step 3: 按需加载**

只加载近 6 个月笔记到内存，更早的按需加载。

- [ ] **Step 4: 提交**

```bash
git add src/store.jsx src/screen-list.jsx
git commit -m "perf: add virtual list, minisearch index, and lazy loading"
```

---

### Task 23: PWA 安装流与 Service Worker 更新

**Files:**
- Modify: `sw.js`
- Modify: `index.html`

- [ ] **Step 1: 更新 Service Worker**

更新缓存版本，移除旧 CDN 资源引用，添加新构建产物。

- [ ] **Step 2: 添加安装提示**

监听 `beforeinstallprompt` 事件，在合适时机显示"安装砚"按钮。

- [ ] **Step 3: 提交**

```bash
git add sw.js index.html
git commit -m "feat: update SW for Vite build, add PWA install prompt"
```

---

### Task 24: 移动端调优与 UI 微动

**Files:**
- Modify: `styles.css`
- Modify: 各 screen 文件

- [ ] **Step 1: 安全区域适配**

确保所有页面正确处理 `safe-area-inset-*`。

- [ ] **Step 2: 触摸反馈**

所有可点击元素添加 `:active` 状态和轻微缩放。

- [ ] **Step 3: 页面切换微动**

添加 route 切换时的 fade/slide 动画。

- [ ] **Step 4: 提交**

```bash
git add styles.css src/
git commit -m "polish: mobile safe areas, touch feedback, route transitions"
```

---

## 依赖关系图

```
Task 1 (Vite)
  └─ Task 2 (tokens/icons)
      └─ Task 3 (store/components)
          └─ Task 4 (screens + main.jsx)
              └─ Task 5 (cleanup)
                  └─ Task 6 (IndexedDB)
                      ├─ Task 7 (note-format)
                      ├─ Task 8 (migration)
                      └─ Task 9 (rewrite store)
                          └─ Task 10 (categories UI)
                          └─ Task 11 (trash)
                          └─ Task 12 (crypto)
                          └─ Task 13 (WebDAV sync)
                          └─ Task 14 (settings UI)
                              └─ Task 15 (AI service)
                                  ├─ Task 16 (auto pipeline)
                                  ├─ Task 17 (insights)
                                  ├─ Task 18 (curator)
                                  └─ Task 19 (RAG)
                                      └─ Task 20 (offline queue)
                                      └─ Task 21 (media)
                                      └─ Task 22 (perf)
                                      └─ Task 23 (PWA)
                                      └─ Task 24 (polish)
```

Tasks 6-8 可并行。Tasks 10-14 可并行。Tasks 16-19 可并行。Tasks 20-24 可并行。

---

_End of implementation plan._
