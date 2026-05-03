// curator.js — Tag Curator: AI-powered tag merge/rename/archive suggestions.
// Runs periodically (every 7 days or 50+ new notes) to keep the tag taxonomy clean.

import { chatCompletion } from './ai.js';
import { getMeta, setMeta } from './db.js';

function gatherTagStats(notes) {
  const stats = {};
  for (const note of notes) {
    for (const tag of (note.tags || [])) {
      const label = typeof tag === 'string' ? tag : tag.label;
      if (!stats[label]) stats[label] = { count: 0, lastUsed: note.created, coTags: {} };
      stats[label].count++;
      if (note.created > stats[label].lastUsed) stats[label].lastUsed = note.created;
      for (const other of (note.tags || [])) {
        const otherLabel = typeof other === 'string' ? other : other.label;
        if (otherLabel !== label) {
          stats[label].coTags[otherLabel] = (stats[label].coTags[otherLabel] || 0) + 1;
        }
      }
    }
  }
  return stats;
}

export async function shouldRunCurator(notes) {
  const lastRun = await getMeta('lastCuratorRun');
  const lastNoteCount = (await getMeta('lastCuratorNoteCount')) || 0;
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  // Run if never run, or >7 days since last run, or note count grew by 50+
  if (!lastRun) return true;
  if (now - new Date(lastRun).getTime() > SEVEN_DAYS) return true;
  if (notes.length - lastNoteCount >= 50) return true;
  return false;
}

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

export async function markCuratorRun(notes) {
  await setMeta('lastCuratorRun', new Date().toISOString());
  await setMeta('lastCuratorNoteCount', notes.length);
}

export async function applyCuratorSuggestion(suggestion, notes, updateFn) {
  if (suggestion.type === 'merge' || suggestion.type === 'rename') {
    const newTag = suggestion.to;
    for (const note of notes) {
      const hasTag = (note.tags || []).some(t => {
        const label = typeof t === 'string' ? t : t.label;
        return suggestion.from.includes(label);
      });
      if (hasTag) {
        const newTags = (note.tags || []).map(t => {
          const label = typeof t === 'string' ? t : t.label;
          if (suggestion.from.includes(label)) {
            return typeof t === 'string' ? newTag : { ...t, label: newTag };
          }
          return t;
        });
        await updateFn(note.id, { tags: newTags });
      }
    }
  }
}

export async function rejectCuratorSuggestion(suggestion) {
  const rejected = (await getMeta('curatorRejected')) || [];
  rejected.push(`${suggestion.type}:${suggestion.from.join(',')}`);
  await setMeta('curatorRejected', rejected);
}
