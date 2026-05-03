// sync.js — WebDAV sync engine for notes.
// Push/pull notes as Markdown with YAML frontmatter.

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

/**
 * Full bidirectional sync: push local changes, pull remote changes,
 * detect conflicts. Returns sync summary.
 *
 * After 3 consecutive failures, sets meta.syncStatus = 'error'.
 * On success, sets meta.syncStatus = 'synced'.
 *
 * @param {object[]} localNotes — all local notes (including soft-deleted)
 * @returns {Promise<{ synced: number, conflicts: Array<{ local: object, remote: object }>, error?: string }>}
 */
export async function syncAll(localNotes) {
  if (!client) return { synced: 0, conflicts: [] };

  // Load consecutive failure count
  const failCount = (await getMeta('syncFailCount')) || 0;

  try {
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
            conflicts.push({ local, remote });
          } else {
            await putNote(remote);
          }
        }
      }
      remoteMap.delete(local.id);
    }

    for (const [, remote] of remoteMap) {
      await putNote(remote);
    }

    // Drain the sync queue (pending push actions)
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

    // Record sync timestamps
    await setMeta('lastSync', new Date().toISOString());
    for (const local of localNotes) {
      await setMeta(`synced:${local.id}`, new Date().toISOString());
    }

    // Reset failure count and set status to synced
    await setMeta('syncFailCount', 0);
    await setMeta('syncStatus', 'synced');

    return { synced: remoteNotes.length, conflicts };
  } catch (err) {
    // Increment failure count
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
