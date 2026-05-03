// search.js — MiniSearch full-text index setup and search.

import MiniSearch from 'minisearch';

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
  } catch (e) {
    console.warn('[store] 搜索失败:', e);
    return [];
  }
}

export function rebuildSearchIndex(notes) {
  searchIndex = null;
  buildSearchIndex(notes);
}
