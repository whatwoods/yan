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

export async function generateCuratorSuggestions(notes, categories = []) {
  const stats = gatherTagStats(notes);
  const rejected = (await getMeta('curatorRejected')) || [];
  const categoryNames = categories.map(c => c.name);

  const statsText = Object.entries(stats)
    .map(([tag, s]) => {
      const coTop = Object.entries(s.coTags).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([k, v]) => `${k}(${v})`).join('、');
      return `#${tag}: ${s.count}次, 最后使用${s.lastUsed}${coTop ? ', 常共现: ' + coTop : ''}`;
    }).join('\n');

  const result = await chatCompletion('curator', [
    { role: 'system', content: `你是标签整理器，只输出合法 JSON 数组。\n示例：[{"type":"merge","from":["AI","人工智能"],"to":"AI","reason":"含义重复"}]\n每项：{"type":"类型","from":["原标签"],"to":"新标签","reason":"一句话原因"}\n\n类型五种：\n- merge：含义重复，合并（from 可多个）\n- rename：表述不准，改名（from 只一个）\n- archive：使用极少且不会再用，归档（to 留空）\n- split：一个标签混了多种含义，拆分（to 用数组给出拆法）\n- new：有明显缺失的标签，建议新增（from 留空数组）\n\n硬规则：\n- 不要把分类名当标签建议（分类是另一套体系）\n- from 里的标签必须存在于统计中\n- 不要重复已拒绝的建议\n- 最多 8 条建议，没有就返回空数组` },
    { role: 'user', content: `分类名（不要当标签）：${categoryNames.join('、') || '无'}\n\n标签统计与共现：\n${statsText || '（暂无标签）'}\n\n已拒绝的 key：${rejected.join('、') || '无'}` },
  ], { temperature: 0.2, maxTokens: 600, jsonMode: true });

  try {
    return result ? JSON.parse(result) : [];
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
