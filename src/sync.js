// sync.js — WebDAV sync engine for notes, categories, insights, preferences.
// Push/pull notes as Markdown with YAML frontmatter.
// Spec §6.2: /yan/notes/, /yan/categories.json, /yan/insights/, /yan/preferences.md, /yan/trash/

import { serialize, deserialize, getNotePath, getTrashPath, getAttachmentPath } from './note-format.js';
import { putNote, getMeta, setMeta, getSyncQueue, clearSyncQueue, enqueueSync } from './db.js';
import {
  SYNC_DELETIONS_FILE,
  SYNC_INDEX_FILE,
  chooseVersionedDocument,
  createRemoteIndex,
  mergeDeletedNotes,
  shouldKeepRemoteNote,
  unwrapVersionedDocument,
  wrapVersionedDocument,
} from './sync-protocol.js';

// ── Lightweight WebDAV client (fetch-based, no Node polyfills) ──

class WebDAVClient {
  constructor(server, { username, password, proxyBase }) {
    this.server = server.replace(/\/+$/, '');
    this.auth = 'Basic ' + btoa(unescape(encodeURIComponent(username + ':' + password)));
    this.proxyBase = proxyBase || '';
    this._createdDirs = new Set();
  }

  async _request(method, path, { body, headers: extraHeaders } = {}) {
    const headers = { Authorization: this.auth, ...extraHeaders };
    if (body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'text/plain; charset=utf-8';
    }
    const baseUrl = this.proxyBase || this.server;
    const resp = await fetch(baseUrl + encodeURI(path), { method, headers, body });
    if (!resp.ok) {
      throw new Error(`WebDAV ${method} ${path} failed: ${resp.status} ${resp.statusText}`);
    }
    return resp;
  }

  async getDirectoryContents(path) {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:allprop/>
</D:propfind>`;
    const resp = await this._request('PROPFIND', path, {
      body,
      headers: { Depth: '1' },
    });
    const text = await resp.text();
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    // Use localName queries to handle DAV namespace prefixes (d:response, D:response, etc.)
    const responses = [...doc.querySelectorAll('*')].filter(el => el.localName === 'response');
    const results = [];
    for (const item of responses) {
      const hrefEl = [...item.querySelectorAll('*')].find(el => el.localName === 'href');
      if (!hrefEl) continue;
      const href = decodeURIComponent(hrefEl.textContent.trim());
      // Normalize absolute hrefs to server-relative paths
      let normalizedHref = href;
      if (href.startsWith('http://') || href.startsWith('https://')) {
        try { normalizedHref = new URL(href).pathname; } catch {}
      } else if (href.startsWith(this.server)) {
        normalizedHref = href.slice(this.server.length);
      }
      // Skip the directory itself
      if (normalizedHref === path || normalizedHref === path + '/') continue;
      const isCollection = [...item.querySelectorAll('*')].some(
        el => el.localName === 'collection'
      );
      const sizeEl = [...item.querySelectorAll('*')].find(
        el => el.localName === 'getcontentlength'
      );
      const size = sizeEl ? parseInt(sizeEl.textContent, 10) || 0 : 0;
      // Extract basename from href
      const trimmed = normalizedHref.endsWith('/') ? normalizedHref.slice(0, -1) : normalizedHref;
      const basename = trimmed.substring(trimmed.lastIndexOf('/') + 1);
      results.push({
        filename: normalizedHref,
        basename,
        type: isCollection ? 'directory' : 'file',
        size,
      });
    }
    return results;
  }

  async getFileContents(path, { format } = {}) {
    const resp = await this._request('GET', path);
    return format === 'text' ? resp.text() : resp.arrayBuffer();
  }

  async putFileContents(path, content, { overwrite, contentType } = {}) {
    const headers = {};
    if (!overwrite) headers['If-None-Match'] = '*';
    if (contentType) headers['Content-Type'] = contentType;
    await this._request('PUT', path, { body: content, headers });
  }

  async deleteFile(path) {
    const baseUrl = this.proxyBase || this.server;
    const resp = await fetch(baseUrl + encodeURI(path), {
      method: 'DELETE',
      headers: { Authorization: this.auth },
    });
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`WebDAV DELETE ${path} failed: ${resp.status} ${resp.statusText}`);
    }
  }

  async createDirectory(path, { recursive } = {}) {
    if (recursive) {
      const parts = path.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current += '/' + part;
        if (this._createdDirs.has(current)) continue;
        try {
          await this._mkcol(current);
          this._createdDirs.add(current);
        } catch {}
      }
    } else {
      if (!this._createdDirs.has(path)) {
        await this._mkcol(path);
        this._createdDirs.add(path);
      }
    }
  }

  async _mkcol(path) {
    const baseUrl = this.proxyBase || this.server;
    const resp = await fetch(baseUrl + encodeURI(path), { method: 'MKCOL', headers: { Authorization: this.auth } });
    // 405 = already exists, that's fine
    if (!resp.ok && resp.status !== 405) {
      throw new Error(`WebDAV MKCOL ${path} failed: ${resp.status} ${resp.statusText}`);
    }
  }
}

function createClient(server, opts) {
  // Build proxy base: /dav/<encoded-server> for same-origin forwarding (avoids CORS)
  // Works in dev (Vite middleware) and production (any reverse proxy that handles /dav/*)
  const proxyBase = '/dav/' + encodeURIComponent(server.replace(/\/+$/, ''));
  return new WebDAVClient(server, { ...opts, proxyBase });
}

let client = null;
let rootPath = '/yan';

function root(sub = '') {
  return rootPath + sub;
}

async function readJsonFile(path) {
  const data = await client.getFileContents(path, { format: 'text' });
  return JSON.parse(data);
}

async function writeJsonFile(path, value) {
  const dir = path.substring(0, path.lastIndexOf('/'));
  if (dir) {
    try { await client.createDirectory(dir, { recursive: true }); } catch {}
  }
  await client.putFileContents(path, JSON.stringify(value, null, 2), {
    overwrite: true,
    contentType: 'application/json; charset=utf-8',
  });
}

/**
 * Initialize the WebDAV client with connection config.
 * @param {{ server: string, username: string, password: string, rootPath?: string }} config
 */
export function initWebDAV(config) {
  rootPath = (config.rootPath || '/yan').replace(/\/+$/, '') || '/yan';
  client = createClient(config.server, {
    username: config.username,
    password: config.password,
  });
}

/**
 * Test a WebDAV connection without modifying the active client.
 * @param {{ server: string, username: string, password: string }} config
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function testConnection(config) {
  try {
    const c = createClient(config.server, {
      username: config.username,
      password: config.password,
    });
    // Read test: PROPFIND server root (always exists)
    await c.getDirectoryContents('/');
    // Write test: PUT + DELETE a probe file in configured rootPath
    const testRoot = (config.rootPath || '/yan').replace(/\/+$/, '') || '/yan';
    try { await c.createDirectory(testRoot, { recursive: true }); } catch {}
    const probePath = testRoot + '/.yan-probe-' + Date.now();
    await c.putFileContents(probePath, 'probe', { overwrite: true });
    try { await c.deleteFile(probePath); } catch {}
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Push a single note to WebDAV as Markdown.
 * @param {object} note
 */
export async function pushNote(note) {
  if (!client) return;
  const md = serialize(note);
  const path = note.deleted_at ? getTrashPath(note.id, rootPath) : getNotePath(note.id, rootPath);
  // Ensure parent directory exists
  const dir = path.substring(0, path.lastIndexOf('/'));
  try { await client.createDirectory(dir, { recursive: true }); } catch {}
  await client.putFileContents(path, md, { overwrite: true });
  // Delete the old path to maintain tombstone semantics
  if (note.deleted_at) {
    try { await client.deleteFile(getNotePath(note.id, rootPath)); } catch {}
  } else {
    try { await client.deleteFile(getTrashPath(note.id, rootPath)); } catch {}
  }

  // Upload photo attachment if present as data URL
  if (note.photo && note.photo.startsWith('data:')) {
    try {
      const photoPath = getAttachmentPath(note.id, 'photo-1.jpg', rootPath);
      const photoDir = photoPath.substring(0, photoPath.lastIndexOf('/'));
      try { await client.createDirectory(photoDir, { recursive: true }); } catch {}
      const base64Data = note.photo.split(',')[1];
      const mimeMatch = note.photo.match(/^data:([^;]+);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      await client.putFileContents(photoPath, bytes.buffer, { overwrite: true, contentType: mime });
    } catch (e) {
      console.warn('[sync] 上传照片失败:', e.message);
    }
  }
}

export async function pullRemoteIndex() {
  if (!client) return null;
  try {
    return await readJsonFile(root(SYNC_INDEX_FILE));
  } catch {
    return null;
  }
}

export async function pushRemoteIndex(notes) {
  if (!client) return;
  await writeJsonFile(root(SYNC_INDEX_FILE), createRemoteIndex(notes, rootPath));
}

export async function pullDeletedNotes() {
  if (!client) return [];
  try {
    const doc = await readJsonFile(root(SYNC_DELETIONS_FILE));
    return mergeDeletedNotes(doc);
  } catch {
    return [];
  }
}

export async function pushDeletedNotes(deletedNotes) {
  if (!client) return;
  await writeJsonFile(root(SYNC_DELETIONS_FILE), {
    version: 1,
    modified: new Date().toISOString(),
    deleted: mergeDeletedNotes(deletedNotes),
  });
}

async function deleteRemoteNoteFiles(id) {
  try { await client.deleteFile(getNotePath(id, rootPath)); } catch {}
  try { await client.deleteFile(getTrashPath(id, rootPath)); } catch {}
}

async function readNoteFile(path) {
  const md = await client.getFileContents(path, { format: 'text' });
  const note = deserialize(md, path);
  // Download photo attachment if frontmatter references a filename
  if (note.photo && !note.photo.startsWith('data:') && note.photo.includes('.')) {
    try {
      const photoPath = getAttachmentPath(note.id, note.photo, rootPath);
      const photoBuf = await client.getFileContents(photoPath);
      const ext = note.photo.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const bytes = new Uint8Array(photoBuf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      note.photo = `data:${mime};base64,${btoa(binary)}`;
    } catch (e) {
      console.warn('[sync] 下载照片失败:', e.message);
      note.photo = null;
    }
  }
  return note;
}

/**
 * Pull notes from a single month directory, downloading photo attachments.
 */
async function pullMonthNotes(dirPath) {
  const results = [];
  try {
    const contents = await client.getDirectoryContents(dirPath);
    for (const file of (Array.isArray(contents) ? contents : [])) {
      if (file.filename.endsWith('.md')) {
        try {
          results.push(await readNoteFile(file.filename));
        } catch (e) { console.warn('[sync] 读取笔记失败:', e.message); }
      }
    }
  } catch {} // dir doesn't exist, skip
  return results;
}

async function pullIndexedNotes(remoteIndex, deletedNotes, { trash = false } = {}) {
  const entries = Object.values(remoteIndex?.notes || {}).filter((entry) => {
    return trash ? Boolean(entry.deleted_at) : !entry.deleted_at;
  });
  const pulled = [];
  for (const entry of entries) {
    try {
      const note = await readNoteFile(entry.path);
      if (shouldKeepRemoteNote(note, deletedNotes)) {
        pulled.push(note);
      } else {
        await deleteRemoteNoteFiles(note.id);
      }
    } catch (e) {
      console.warn('[sync] 读取索引笔记失败:', e.message);
    }
  }
  return pulled;
}

async function pullAllNotesByDirectory(deletedNotes = []) {
  const monthPaths = [];
  try {
    const years = await client.getDirectoryContents(root('/notes'));
    for (const year of years.filter((item) => item.type === 'directory')) {
      try {
        const months = await client.getDirectoryContents(year.filename);
        for (const month of months.filter((item) => item.type === 'directory')) {
          monthPaths.push(month.filename.replace(/\/+$/, ''));
        }
      } catch {}
    }
  } catch {
    return null;
  }

  const monthResults = await Promise.all(monthPaths.map(p => pullMonthNotes(p)));
  return filterDeletedRemoteNotes(monthResults.flat(), deletedNotes);
}

async function filterDeletedRemoteNotes(notes, deletedNotes) {
  const kept = [];
  for (const note of notes) {
    if (shouldKeepRemoteNote(note, deletedNotes)) kept.push(note);
    else await deleteRemoteNoteFiles(note.id);
  }
  return kept;
}

/**
 * Pull notes from WebDAV for the last N months (in parallel).
 * @param {number} months — how many months back to scan
 * @returns {Promise<object[]>} array of deserialized notes
 */
export async function pullNotes(months = 6, remoteIndex = null, deletedNotes = []) {
  if (!client) return [];
  if (remoteIndex?.notes) {
    return pullIndexedNotes(remoteIndex, deletedNotes, { trash: false });
  }
  const fullTreeNotes = await pullAllNotesByDirectory(deletedNotes);
  if (fullTreeNotes) return fullTreeNotes;

  const now = new Date();
  const monthPaths = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    monthPaths.push(root(`/notes/${year}/${month}`));
  }
  const monthResults = await Promise.all(monthPaths.map(p => pullMonthNotes(p)));
  return filterDeletedRemoteNotes(monthResults.flat(), deletedNotes);
}

/**
 * Pull soft-deleted notes from WebDAV trash directory.
 * @returns {Promise<object[]>} array of deserialized notes from /yan/trash/
 */
export async function pullTrashNotes(remoteIndex = null, deletedNotes = []) {
  if (!client) return [];
  if (remoteIndex?.notes) {
    return pullIndexedNotes(remoteIndex, deletedNotes, { trash: true });
  }
  const pulled = [];
  try {
    const contents = await client.getDirectoryContents(root('/trash'));
    for (const file of (Array.isArray(contents) ? contents : [])) {
      if (file.filename.endsWith('.md')) {
        try {
          const note = await readNoteFile(file.filename);
          if (shouldKeepRemoteNote(note, deletedNotes)) pulled.push(note);
          else await deleteRemoteNoteFiles(note.id);
        } catch (e) { console.warn('[sync] 读取回收站笔记失败:', e.message); }
      }
    }
  } catch {} // dir doesn't exist, skip
  return pulled;
}

// ── Non-note data sync (spec §6.2) ────────────────────────────

/**
 * Push categories to /yan/categories.json
 */
export async function pushCategories(categories) {
  if (!client) return;
  try { await client.createDirectory(rootPath, { recursive: true }); } catch {}
  const modified = (await getMeta('categoriesModified')) || new Date(0).toISOString();
  await writeJsonFile(root('/categories.json'), wrapVersionedDocument(categories, modified));
}

/**
 * Pull categories from /yan/categories.json
 * @returns {Promise<object[]|null>}
 */
export async function pullCategories() {
  if (!client) return null;
  try {
    const data = await readJsonFile(root('/categories.json'));
    return unwrapVersionedDocument(data).data;
  } catch (e) {
    console.warn('[sync] 读取分类失败:', e.message);
    return null;
  }
}

async function pullCategoriesDocument() {
  if (!client) return null;
  try {
    return unwrapVersionedDocument(await readJsonFile(root('/categories.json')));
  } catch {
    return null;
  }
}

/**
 * Push an insight to /yan/insights/<year>-<month>.md
 */
export async function pushInsight(yearMonth, text) {
  if (!client) return;
  try { await client.createDirectory(root('/insights'), { recursive: true }); } catch {}
  const modified = (await getMeta(`insightModified:${yearMonth}`)) || new Date().toISOString();
  await writeJsonFile(root(`/insights/${yearMonth}.json`), wrapVersionedDocument(text, modified));
  await client.putFileContents(root(`/insights/${yearMonth}.md`), text, { overwrite: true });
}

/**
 * Pull all insights from /yan/insights/
 * @returns {Promise<Map<string, string>>} yearMonth → text
 */
export async function pullInsights() {
  if (!client) return new Map();
  const result = new Map();
  try {
    const contents = await client.getDirectoryContents(root('/insights'));
    for (const file of (Array.isArray(contents) ? contents : [])) {
      if (file.filename.endsWith('.md')) {
        try {
          const text = await client.getFileContents(file.filename, { format: 'text' });
          const name = file.basename.replace(/\.md$/, '');
          result.set(name, text);
        } catch (e) { console.warn('[sync] 读取洞察失败:', e.message); }
      }
      if (file.filename.endsWith('.json')) {
        try {
          const doc = unwrapVersionedDocument(JSON.parse(await client.getFileContents(file.filename, { format: 'text' })));
          const name = file.basename.replace(/\.json$/, '');
          result.set(name, doc.data);
        } catch (e) { console.warn('[sync] 读取洞察失败:', e.message); }
      }
    }
  } catch {} // dir doesn't exist
  return result;
}

/**
 * Push preferences to /yan/preferences.md
 */
export async function pushPreferences(prefs) {
  if (!client) return;
  try { await client.createDirectory(rootPath, { recursive: true }); } catch {}
  const modified = (await getMeta('preferencesModified')) || new Date(0).toISOString();
  await writeJsonFile(root('/preferences.json'), wrapVersionedDocument(prefs, modified));
  await client.putFileContents(root('/preferences.md'), JSON.stringify(prefs, null, 2), { overwrite: true });
}

/**
 * Pull preferences from /yan/preferences.md
 * @returns {Promise<object|null>}
 */
export async function pullPreferences() {
  if (!client) return null;
  try {
    const data = await readJsonFile(root('/preferences.json'));
    return unwrapVersionedDocument(data).data;
  } catch (e) {
    try {
      const data = await client.getFileContents(root('/preferences.md'), { format: 'text' });
      return JSON.parse(data);
    } catch (fallbackError) {
      console.warn('[sync] 读取偏好失败:', fallbackError.message || e.message);
      return null;
    }
  }
}

async function pullPreferencesDocument() {
  if (!client) return null;
  try {
    return unwrapVersionedDocument(await readJsonFile(root('/preferences.json')));
  } catch {
    try {
      return unwrapVersionedDocument(JSON.parse(await client.getFileContents(root('/preferences.md'), { format: 'text' })));
    } catch {
      return null;
    }
  }
}

/**
 * Push a conflict copy to /yan/conflicts/<id>.md
 */
export async function pushConflict(note, variant = 'note') {
  if (!client) return;
  try { await client.createDirectory(root('/conflicts'), { recursive: true }); } catch {}
  const md = serialize(note);
  await client.putFileContents(root(`/conflicts/${variant}-${note.modified || Date.now()}-${note.id}.md`), md, { overwrite: true });
}

// ── Main sync ─────────────────────────────────────────────────

/**
 * Full bidirectional sync: push local changes, pull remote changes,
 * detect conflicts. Also syncs categories, insights, preferences, trash.
 *
 * @param {object[]} localNotes — all local notes (including soft-deleted)
 * @param {object} [extra] — { categories, insights, preferences }
 * @returns {Promise<{ synced: number, conflicts: Array<{ local: object, remote: object }>, error?: string }>}
 */
export async function syncAll(localNotes, extra = {}) {
  if (!client) return { synced: 0, conflicts: [], upserted: [] };

  const failCount = (await getMeta('syncFailCount')) || 0;

  try {
    // ── Notes sync ───────────────────────────────────────────
    const remoteIndex = await pullRemoteIndex();
    const localDeletedNotes = mergeDeletedNotes(await getMeta('deletedNotes'));
    const remoteDeletedNotes = await pullDeletedNotes();
    const deletedNotes = mergeDeletedNotes(localDeletedNotes, remoteDeletedNotes);
    const remoteNotes = await pullNotes(6, remoteIndex, deletedNotes);
    const trashNotes = await pullTrashNotes(remoteIndex, deletedNotes);
    // Notes take precedence over trash — build map with trash first,
    // then overwrite with active notes
    const remoteMap = new Map();
    for (const n of trashNotes) remoteMap.set(n.id, n);
    for (const n of remoteNotes) remoteMap.set(n.id, n);
    const conflicts = [];
    const upserted = [];

    for (const local of localNotes) {
      if (!shouldKeepRemoteNote(local, deletedNotes)) {
        await deleteRemoteNoteFiles(local.id);
        remoteMap.delete(local.id);
        continue;
      }
      const remote = remoteMap.get(local.id);
      if (!remote) {
        await pushNote(local);
      } else {
        const localMod = new Date(local.modified).getTime();
        const remoteMod = new Date(remote.modified).getTime();
        if (localMod > remoteMod) {
          await pushNote(local);
        } else if (remoteMod > localMod) {
          const lastSynced = await getMeta(`synced:${local.id}`);
          if (lastSynced && localMod > new Date(lastSynced).getTime()) {
            // Conflict: save both versions
            conflicts.push({ local, remote });
            await pushConflict(local, 'local');
            await pushConflict(remote, 'remote');
          } else {
            await putNote(remote);
            upserted.push(remote);
          }
        }
      }
      remoteMap.delete(local.id);
    }

    // New remote notes not in local
    for (const [, remote] of remoteMap) {
      if (shouldKeepRemoteNote(remote, deletedNotes)) {
        await putNote(remote);
        upserted.push(remote);
      } else {
        await deleteRemoteNoteFiles(remote.id);
      }
    }

    // Drain sync queue
    const queue = await getSyncQueue();
    const failedQueueItems = [];
    for (const item of queue) {
      try {
        if (item.action === 'upsert' && item.data) {
          await pushNote(item.data);
        } else if (item.action === 'delete' && item.note_id) {
          await deleteRemoteNoteFiles(item.note_id);
        }
      } catch (e) {
        console.warn('[sync] 队列推送失败:', e.message);
        failedQueueItems.push(item);
      }
    }
    await clearSyncQueue();
    for (const item of failedQueueItems) {
      await enqueueSync({ action: item.action, note_id: item.note_id, data: item.data });
    }

    // ── Non-note data sync ───────────────────────────────────
    // Categories: versioned last-writer-wins document
    if (extra.categories) {
      const localCats = wrapVersionedDocument(
        extra.categories,
        (await getMeta('categoriesModified')) || new Date(0).toISOString(),
      );
      const remoteCats = await pullCategoriesDocument();
      const chosenCats = chooseVersionedDocument(localCats, remoteCats);
      if (chosenCats === localCats) {
        await pushCategories(extra.categories);
      } else if (chosenCats) {
        await setMeta('categories', chosenCats.data);
        await setMeta('categoriesModified', chosenCats.modified);
      }
    } else {
      const remoteCats = await pullCategoriesDocument();
      if (remoteCats) {
        await setMeta('categories', remoteCats.data);
        await setMeta('categoriesModified', remoteCats.modified);
      }
    }

    // Insights: push local, pull remote
    if (extra.insights) {
      for (const [ym, text] of extra.insights) {
        await pushInsight(ym, text);
      }
    }

    // Preferences: versioned last-writer-wins document
    if (extra.preferences) {
      const localPrefs = wrapVersionedDocument(
        extra.preferences,
        (await getMeta('preferencesModified')) || new Date(0).toISOString(),
      );
      const remotePrefs = await pullPreferencesDocument();
      const chosenPrefs = chooseVersionedDocument(localPrefs, remotePrefs);
      if (chosenPrefs === localPrefs) {
        await pushPreferences(extra.preferences);
      } else if (chosenPrefs) {
        await setMeta('settings', chosenPrefs.data);
        await setMeta('preferencesModified', chosenPrefs.modified);
      }
    }

    await pushDeletedNotes(deletedNotes);
    await setMeta('deletedNotes', deletedNotes);

    const finalNotes = new Map();
    for (const note of [...localNotes, ...upserted]) {
      if (shouldKeepRemoteNote(note, deletedNotes)) finalNotes.set(note.id, note);
    }
    for (const conflict of conflicts) finalNotes.delete(conflict.local.id);
    await pushRemoteIndex([...finalNotes.values()]);

    // Record sync timestamps
    await setMeta('lastSync', new Date().toISOString());
    // Record synced baseline only for successfully pushed/accepted notes
    for (const local of localNotes) {
      const isConflict = conflicts.some(c => c.local.id === local.id);
      if (!isConflict) {
        await setMeta(`synced:${local.id}`, local.modified);
      }
    }
    // Record baseline for upserted remote notes too
    for (const remote of upserted) {
      await setMeta(`synced:${remote.id}`, remote.modified);
    }

    // Store conflict count for UI
    await setMeta('conflictCount', conflicts.length);
    await setMeta('syncFailCount', 0);
    await setMeta('syncStatus', 'synced');

    return { synced: remoteNotes.length + trashNotes.length, conflicts, upserted };
  } catch (err) {
    const newCount = failCount + 1;
    await setMeta('syncFailCount', newCount);

    if (newCount >= 3) {
      await setMeta('syncStatus', 'error');
      return { synced: 0, conflicts: [], upserted: [], error: '连续失败 · 请检查 WebDAV 配置' };
    } else {
      await setMeta('syncStatus', 'pending');
      return { synced: 0, conflicts: [], upserted: [], error: err.message };
    }
  }
}
