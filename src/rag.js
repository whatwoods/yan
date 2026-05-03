// rag.js — RAG Tier 1: structured query parsing + candidate filtering + answer generation.
// Used by the 砚 chat overlay to provide note-grounded answers with citations.

import { chatCompletion, YAN_PERSONA } from './ai.js';

export async function parseQuery(question, categories = [], existingTags = []) {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  const result = await chatCompletion('ask', [
    { role: 'system', content: `${YAN_PERSONA}\n你是查询解析器。将用户问题解析为 JSON 查询条件。只回复 JSON，不解释。\n\n字段：\n- time_range: "YYYY-MM" 或 "YYYY-MM~YYYY-MM"（时间段）\n- categories: 字符串数组（只用下面列出的分类名）\n- tags: 字符串数组（只用下面列出的标签）\n- people: 字符串数组\n- free_text: 关键词（用于全文匹配）\n\n时间映射示例：\n- "上个月" → 上一个月的 "YYYY-MM"\n- "最近" / "近期" → 最近 2 个月\n- "今年" → "2026-01~2026-05" 这样的范围\n- 没有时间意图就留 null` },
    { role: 'user', content: `今天：${today}，本月：${thisMonth}\n可用分类：${categories.map(c => c.name).join('、') || '无'}\n可用标签（前 30）：${existingTags.slice(0, 30).join('、') || '无'}\n\n问题：${question}` },
  ], { temperature: 0.1, maxTokens: 150, jsonMode: true });
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
      if (query.time_range.includes('~')) {
        const [start, end] = query.time_range.split('~');
        if (noteMonth < start || noteMonth > end) return false;
      } else {
        if (!noteMonth.startsWith(query.time_range.slice(0, 7))) return false;
      }
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
  const context = candidates.map((n, i) => {
    const tags = (n.tags || []).map(t => typeof t === 'string' ? t : t.label).join('、');
    const body = (n.body || '').slice(0, 200);
    return `[${i + 1}] ${n.title || '(无题)'}（${(n.created || '').slice(0, 10)}）${tags ? '#' + tags : ''}\n${n.summary || ''}${body ? '\n片段：' + body : ''}`;
  }).join('\n\n');

  const answer = await chatCompletion('ask', [
    { role: 'system', content: `${YAN_PERSONA}\n根据用户的笔记回答问题。\n\n引用规则：\n- 引用相关笔记时标注 [编号]\n- 每个结论必须有笔记依据\n- 笔记里没有的信息，直接说「这件事笔记里没看出来」，不要编造\n- 回答控制在 150 字以内，除非问题需要更详细的列举` },
    { role: 'user', content: `笔记：\n${context || '（无相关笔记）'}\n\n问题：${question}` },
  ], { temperature: 0.4, maxTokens: 600 });

  return {
    text: answer || '翻完了笔记，但没能找到与此特别相关的。',
    refs: candidates.slice(0, 6).map((n, i) => ({
      id: n.id, title: n.title, when: (n.created || '').slice(0, 10), index: i + 1,
    })),
  };
}

export async function askYanRAG(question, notes, categories = [], existingTags = []) {
  const query = await parseQuery(question, categories, existingTags);
  const candidates = filterCandidates(notes, query);
  return answerQuestion(question, candidates);
}
