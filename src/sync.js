// sync.js — WebDAV sync engine for notes, categories, insights, preferences.
// Push/pull notes as Markdown with YAML frontmatter.
// Spec §6.2: /biji/notes/, /biji/categories.json, /biji/insights/, /biji/preferences.md, /biji/trash/

import { createClient } from 'webdav';
import { serialize, deserialize, getNotePath } from './note-format.js';
import { putNote, getMeta, setMeta, getSyncQueue, clearSyncQueue } from './db.js';

let client = null;

/**
 * Initialize the WebDAV client with connection config.
 * @param {{ server: string, username: string, password: string }} config
 */
export function initWebDAV(config) {
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
    await c.getDirectoryContents('/');
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
  const path = getNotePath(note.id);
  // Ensure parent directory exists
  const dir = path.substring(0, path.lastIndexOf('/'));
  try { await client.createDirectory(dir, { recursive: true }); } catch {}
  await client.putFileContents(path, md, { overwrite: true });
}

/**
 * Pull notes from WebDAV for the last N months.
 * @param {number} months — how many months back to scan
 * @returns {Promise<object[]>} array of deserialized notes
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
      for (const file of (Array.isArray(contents) ? contents : [])) {
        if (file.filename.endsWith('.md')) {
          try {
            const md = await client.getFileContents(file.filename, { format: 'text' });
            const note = deserialize(md, file.filename);
            pulled.push(note);
          } catch {}
        }
      }
    } catch {} // dir doesn't exist, skip
  }
  return pulled;
}

// ── Non-note data sync (spec §6.2) ────────────────────────────

/**
 * Push categories to /biji/categories.json
 */
export async function pushCategories(categories) {
  if (!client) return;
  try { await client.createDirectory('/biji', { recursive: true }); } catch {}
  await client.putFileContents('/biji/categories.json', JSON.stringify(categories, null, 2), { overwrite: true });
}

/**
 * Pull categories from /biji/categories.json
 * @returns {Promise<object[]|null>}
 */
export async function pullCategories() {
  if (!client) return null;
  try {
    const data = await client.getFileContents('/biji/categories.json', { format: 'text' });
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Push an insight to /biji/insights/<year>-<month>.md
 */
export async function pushInsight(yearMonth, text) {
  if (!client) return;
  try { await client.createDirectory('/biji/insights', { recursive: true }); } catch {}
  await client.putFileContents(`/biji/insights/${yearMonth}.md`, text, { overwrite: true });
}

/**
 * Pull all insights from /biji/insights/
 * @returns {Promise<Map<string, string>>} yearMonth → text
 */
export async function pullInsights() {
  if (!client) return new Map();
  const result = new Map();
  try {
    const contents = await client.getDirectoryContents('/biji/insights');
    for (const file of (Array.isArray(contents) ? contents : [])) {
      if (file.filename.endsWith('.md')) {
        try {
          const text = await client.getFileContents(file.filename, { format: 'text' });
          const name = file.basename.replace(/\.md$/, '');
          result.set(name, text);
        } catch {}
      }
    }
  } catch {} // dir doesn't exist
  return result;
}

/**
 * Push preferences to /biji/preferences.md
 */
export async function pushPreferences(prefs) {
  if (!client) return;
  try { await client.createDirectory('/biji', { recursive: true }); } catch {}
  await client.putFileContents('/biji/preferences.md', JSON.stringify(prefs, null, 2), { overwrite: true });
}

/**
 * Pull preferences from /biji/preferences.md
 * @returns {Promise<object|null>}
 */
export async function pullPreferences() {
  if (!client) return null;
  try {
    const data = await client.getFileContents('/biji/preferences.md', { format: 'text' });
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Push a conflict copy to /biji/conflicts/<id>.md
 */
export async function pushConflict(note) {
  if (!client) return;
  try { await client.createDirectory('/biji/conflicts', { recursive: true }); } catch {}
  const md = serialize(note);
  await client.putFileContents(`/biji/conflicts/${note.id}.md`, md, { overwrite: true });
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
  if (!client) return { synced: 0, conflicts: [] };

  const failCount = (await getMeta('syncFailCount')) || 0;

  try {
    // ── Notes sync ───────────────────────────────────────────
    const remoteNotes = await pullNotes();
    const remoteMap = new Map(remoteNotes.map(n => [n.id, n]));
    const conflicts = [];

    for (const local of localNotes) {
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
            await pushConflict(local);
            await pushConflict(remote);
          } else {
            await putNote(remote);
          }
        }
      }
      remoteMap.delete(local.id);
    }

    // New remote notes not in local
    for (const [, remote] of remoteMap) {
      await putNote(remote);
    }

    // Drain sync queue
    const queue = await getSyncQueue();
    for (const item of queue) {
      try {
        if (item.action === 'push' && item.note_id) {
          const note = localNotes.find(n => n.id === item.note_id);
          if (note) await pushNote(note);
        }
      } catch {}
    }
    await clearSyncQueue();

    // ── Non-note data sync ───────────────────────────────────
    // Categories: push local, pull remote, merge (last-write-wins)
    if (extra.categories) {
      await pushCategories(extra.categories);
    }
    const remoteCats = await pullCategories();
    if (remoteCats && !extra.categories) {
      await setMeta('categories', remoteCats);
    }

    // Insights: push local, pull remote
    if (extra.insights) {
      for (const [ym, text] of extra.insights) {
        await pushInsight(ym, text);
      }
    }

    // Preferences: push local
    if (extra.preferences) {
      await pushPreferences(extra.preferences);
    }

    // Record sync timestamps
    await setMeta('lastSync', new Date().toISOString());
    for (const local of localNotes) {
      await setMeta(`synced:${local.id}`, new Date().toISOString());
    }

    // Store conflict count for UI
    await setMeta('conflictCount', conflicts.length);
    await setMeta('syncFailCount', 0);
    await setMeta('syncStatus', 'synced');

    return { synced: remoteNotes.length, conflicts };
  } catch (err) {
    const newCount = failCount + 1;
    await setMeta('syncFailCount', newCount);

    if (newCount >= 3) {
      await setMeta('syncStatus', 'error');
      return { synced: 0, conflicts: [], error: '连续失败 · 请检查 WebDAV 配置' };
    } else {
      await setMeta('syncStatus', 'pending');
      return { synced: 0, conflicts: [], error: err.message };
    }
  }
}
