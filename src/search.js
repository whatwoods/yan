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

export function addNoteToIndex(note) {
  if (!searchIndex) return;
  try {
    searchIndex.add({ id: note.id, title: note.title || '', body: note.body || '' });
  } catch (e) {
    console.warn('[search] 添加索引失败:', e);
  }
}

export function updateNoteInIndex(note) {
  if (!searchIndex) return;
  try {
    searchIndex.discard(note.id);
    searchIndex.add({ id: note.id, title: note.title || '', body: note.body || '' });
  } catch (e) {
    console.warn('[search] 更新索引失败:', e);
  }
}

export function removeNoteFromIndex(id) {
  if (!searchIndex) return;
  try {
    searchIndex.discard(id);
  } catch (e) {
    console.warn('[search] 删除索引失败:', e);
  }
}
