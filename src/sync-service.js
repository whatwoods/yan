import { SecretsStore } from './crypto.js';
import { enqueueSync, getMeta, setMeta } from './db.js';
import { initWebDAV, syncAll } from './sync.js';
import { mergeDeletedNotes } from './sync-protocol.js';

export const AUTO_SYNC_DELAY_MS = 5000;

let timer = null;
let running = false;
let rerunRequested = false;
let autoSyncSource = null;

function sameData(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export async function markDataForSync(kind) {
  const modified = new Date().toISOString();
  const dirty = (await getMeta('syncDirty')) || {};
  dirty[kind] = modified;
  await setMeta('syncDirty', dirty);
  await setMeta(`${kind}Modified`, modified);
}

export async function recordPermanentDelete(noteOrId) {
  const id = typeof noteOrId === 'string' ? noteOrId : noteOrId?.id;
  if (!id) return;

  const deleted_at = new Date().toISOString();
  const current = await getMeta('deletedNotes');
  await setMeta('deletedNotes', mergeDeletedNotes(current, [{ id, deleted_at }]));
  await enqueueSync({ action: 'delete', note_id: id, deleted_at });
  await markDataForSync('notes');
}

async function resolveWebDAVConfig() {
  const saved = await getMeta('webdavConfig');
  if (!saved?.server || !saved?.username) return null;

  let password = saved.password || '';
  if (!password) {
    if (await SecretsStore.isSetup()) {
      if (!SecretsStore.isUnlocked()) return null;
      password = SecretsStore.get('webdavPassword') || '';
    }
  }
  if (!password) return null;
  return { ...saved, password };
}

export async function runAutoSyncNow() {
  if (running) {
    rerunRequested = true;
    return null;
  }

  const config = await resolveWebDAVConfig();
  if (!config || !autoSyncSource) return null;

  running = true;
  try {
    initWebDAV(config);

    const settings = autoSyncSource.loadSettings();
    const categories = await autoSyncSource.getCategories();
    const result = await syncAll(autoSyncSource.getAllCachedNotes(), {
      categories,
      preferences: settings,
    });

    autoSyncSource.applySyncResult(result);
    if (!result.error) {
      await setMeta('lastSync', new Date().toISOString());
      await setMeta('syncDirty', {});
    }
    return result;
  } finally {
    running = false;
    if (rerunRequested) {
      rerunRequested = false;
      scheduleAutoSync();
    }
  }
}

export function scheduleAutoSync(delay = AUTO_SYNC_DELAY_MS) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    runAutoSyncNow().catch((error) => {
      console.warn('[sync] 自动同步失败:', error.message);
    });
  }, delay);
}

export async function markAndScheduleSync(kind, { previous, next } = {}) {
  if (previous !== undefined && next !== undefined && sameData(previous, next)) return;
  await markDataForSync(kind);
  scheduleAutoSync();
}

export function configureAutoSyncSource(source) {
  autoSyncSource = source;
}
