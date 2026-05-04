// ai-tagger.js — AI tagging, auto-tagging, people extraction, and askYan chat.

import { formatRelative } from './tokens.jsx';
import { classifyNote, extractTagsAndPeople, generateSummary } from './ai.js';
import { TAG_DICT, PEOPLE_HINT } from './tag-colors.js';

// ── Rule-based tagger ────────────────────────────────────────

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

/**
 * Run AI classify/tag/summarize pipeline on a note.
 * Returns a patch object or null (caller should fall back to rule-based).
 */
export async function processNoteWithAI(note, categories) {
  try {
    const [category, tagResult, summary] = await Promise.all([
      classifyNote(note.body, categories),
      extractTagsAndPeople(note.body, [], [], categories),
      generateSummary(note.body),
    ]);
    return {
      category: category || note.category || '想法',
      tags: tagResult.tags.length ? tagResult.tags.map(t => ({ label: t, color: 'ink' })) : note.tags,
      people: tagResult.people.length ? tagResult.people : note.people,
      summary: summary || note.summary,
      ai: summary ? { summary, generated_at: new Date().toISOString(), model: 'ai' } : note.ai,
    };
  } catch (e) {
    console.warn('[store] AI处理失败:', e);
    return null;
  }
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
