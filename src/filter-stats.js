// filter-stats.js — 计算分类计数、标签计数、分类内标签计数

/**
 * 生成完整的筛选统计信息
 * @param {Array} notes - 所有笔记
 * @param {Array} categories - 分类列表 [{ name, hex, color }]
 * @returns {{ catCounts, globalTagCounts, tagsByCat, recentTags }}
 */
export function buildFilterStats(notes, categories) {
  const catCounts = new Map();       // category name → count
  const globalTagCounts = {};        // tag label → { count, color }
  const tagsByCat = new Map();       // category name → { label → { count, color } }
  const tagLastUsed = {};            // tag label → latest timestamp

  for (const n of notes) {
    // 分类计数
    if (n.category) {
      catCounts.set(n.category, (catCounts.get(n.category) || 0) + 1);
    }

    // 标签统计
    const cat = n.category || '__uncat';
    if (!tagsByCat.has(cat)) tagsByCat.set(cat, {});

    for (const t of (n.tags || [])) {
      // 全局
      if (!globalTagCounts[t.label]) globalTagCounts[t.label] = { count: 0, color: t.color };
      globalTagCounts[t.label].count++;

      // 分类内
      const catTags = tagsByCat.get(cat);
      if (!catTags[t.label]) catTags[t.label] = { count: 0, color: t.color };
      catTags[t.label].count++;

      // 最近使用
      const ts = n.createdAt || n.created || 0;
      if (!tagLastUsed[t.label] || ts > tagLastUsed[t.label]) {
        tagLastUsed[t.label] = ts;
      }
    }
  }

  // 确保所有分类都有计数（包括 0）
  for (const c of categories) {
    if (!catCounts.has(c.name)) catCounts.set(c.name, 0);
  }

  // 排序：按笔记数降序
  const sortedCatEntries = [...catCounts.entries()].sort((a, b) => b[1] - a[1]);

  // 全局标签排序
  const sortedGlobalTags = Object.entries(globalTagCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([label, v]) => ({ label, color: v.color, count: v.count }));

  // 最近使用的标签（按时间倒序）
  const recentTagLabels = Object.entries(tagLastUsed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label]) => label);

  const recentTags = recentTagLabels.map(label => ({
    label,
    color: globalTagCounts[label]?.color,
    count: globalTagCounts[label]?.count || 0,
  }));

  return {
    sortedCatEntries,
    sortedGlobalTags,
    globalTagCounts,  // raw: label → { count, color }
    tagsByCat,
    recentTags,
  };
}

/**
 * 获取某个分类下的标签（排序后）
 */
export function getTagsForCategory(catName, tagsByCat, globalTagCounts) {
  if (!catName || catName === '全部') {
    // 全局高频标签
    return Object.entries(globalTagCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 4)
      .map(([label, v]) => ({ label, color: v.color, count: v.count }));
  }
  const catTags = tagsByCat.get(catName);
  if (!catTags) return [];
  return Object.entries(catTags)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4)
    .map(([label, v]) => ({ label, color: v.color, count: v.count }));
}
