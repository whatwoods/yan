// rag.js — RAG Tier 1: structured query parsing + candidate filtering + answer generation.
// Used by the 砚 chat overlay to provide note-grounded answers with citations.

import { chatCompletion } from './ai.js';

export async function parseQuery(question) {
  const result = await chatCompletion('ask', [
    { role: 'system', content: '你是查询解析器。将用户问题解析为 JSON 查询条件。只回复 JSON。' },
    { role: 'user', content: `解析为 JSON：{"time_range":"2026-05","categories":[],"tags":[],"people":[],"free_text":"关键词"}

问题：${question}` },
  ], { temperature: 0.1, maxTokens: 100 });
  try {
    return result ? JSON.parse(result) : null;
  } catch {
    return null;
  }
}

export function filterCandidates(notes, query) {
  if (!query) return notes.slice(0, 50);

  return notes.filter(note => {
    if (query.time_range) {
      const noteMonth = (note.created || '').slice(0, 7);
      if (!noteMonth.startsWith(query.time_range.slice(0, 7))) return false;
    }
    if (query.categories?.length && !query.categories.includes(note.category)) return false;
    if (query.tags?.length) {
      const noteTags = (note.tags || []).map(t => typeof t === 'string' ? t : t.label);
      if (!noteTags.some(t => query.tags.includes(t))) return false;
    }
    if (query.people?.length && !(note.people || []).some(p => query.people.includes(p))) return false;
    if (query.free_text) {
      const hay = `${note.title} ${note.body} ${(note.tags || []).map(t => typeof t === 'string' ? t : t.label).join(' ')}`.toLowerCase();
      if (!hay.includes(query.free_text.toLowerCase())) return false;
    }
    return true;
  }).slice(0, 30);
}

export async function answerQuestion(question, candidates) {
  const context = candidates.map((n, i) =>
    `[${i + 1}] ${n.title}（${(n.created || '').slice(0, 10)}）标签：${(n.tags || []).map(t => typeof t === 'string' ? t : t.label).join('、')}\n摘要：${n.summary || ''}`
  ).join('\n\n');

  const answer = await chatCompletion('ask', [
    { role: 'system', content: '你是笔记助手"砚"。根据用户的笔记回答问题，引用相关笔记时标注 [编号]。' },
    { role: 'user', content: `基于以下笔记回答问题。\n\n笔记：\n${context}\n\n问题：${question}` },
  ], { temperature: 0.5, maxTokens: 800 });

  return {
    text: answer || '翻完了笔记，但没能找到与此特别相关的。',
    refs: candidates.slice(0, 6).map(n => ({
      id: n.id, title: n.title, when: (n.created || '').slice(0, 10),
    })),
  };
}

export async function askYanRAG(question, notes) {
  const query = await parseQuery(question);
  const candidates = filterCandidates(notes, query);
  return answerQuestion(question, candidates);
}
