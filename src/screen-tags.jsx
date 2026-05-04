// screen-tags.jsx — Tag management page: search, browse by frequency, find merge candidates.

import React, { useMemo, useState } from 'react';
import { TOKENS, PERSONAS } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { BrushTitle, Tag } from './components.jsx';

function findMergeCandidates(tags) {
  const candidates = [];
  const seen = new Set();
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const a = tags[i], b = tags[j];
      const key = a.label + '|' + b.label;
      if (seen.has(key)) continue;
      // Prefix match or Levenshtein-like: one contains the other
      if (a.label.includes(b.label) || b.label.includes(a.label)) {
        seen.add(key);
        candidates.push({ from: b, to: a, reason: '名称相似' });
      }
    }
  }
  return candidates.slice(0, 5);
}

export function TagsScreen({ notes, onBack, onPickTag }) {
  const T = TOKENS, I = ICONS;
  const persona = PERSONAS.yan;
  const [search, setSearch] = useState('');

  // Build tag stats with last-used time
  const tagStats = useMemo(() => {
    const stats = {}; // label → { count, color, lastUsed }
    notes.forEach((n) => {
      const ts = n.createdAt || n.created || 0;
      (n.tags || []).forEach((t) => {
        if (!stats[t.label]) stats[t.label] = { count: 0, color: t.color, lastUsed: 0 };
        stats[t.label].count++;
        if (ts > stats[t.label].lastUsed) stats[t.label].lastUsed = ts;
      });
    });
    return stats;
  }, [notes]);

  const allTags = useMemo(() => {
    return Object.entries(tagStats)
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [tagStats]);

  const totalCount = allTags.length;

  // Filter by search
  const searchLower = search.toLowerCase();
  const filteredTags = searchLower
    ? allTags.filter(t => t.label.toLowerCase().includes(searchLower))
    : allTags;

  // Group filtered tags
  const highTags = filteredTags.filter(t => t.count >= 3);
  const lowTags = filteredTags.filter(t => t.count < 3);

  // Recent tags (top 6 by last used, from filtered)
  const recentTags = useMemo(() => {
    return [...filteredTags]
      .filter(t => t.lastUsed > 0)
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, 6);
  }, [filteredTags]);

  // Merge candidates
  const mergeCandidates = useMemo(() => {
    if (searchLower) return [];
    return findMergeCandidates(allTags);
  }, [allTags, searchLower]);

  return (
    <div className="screen paper">
      <div style={{ padding: 'calc(10px + var(--safe-top)) 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="icon-btn" onClick={onBack} aria-label="返回"><I.back size={22} /></button>
        <BrushTitle size={22}>标签管理</BrushTitle>
        <div style={{ width: 40 }} />
      </div>

      {/* Search */}
      <div style={{ padding: '0 20px 12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--paper-light)', border: `1px solid var(--fold)`,
          borderRadius: 10, padding: '8px 12px',
        }}>
          <I.search size={16} stroke="var(--ink-fade)" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索标签"
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontFamily: T.fontSerif, fontSize: 13, color: 'var(--ink)',
              outline: 'none',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--ink-fade)', fontSize: 14, padding: 0, lineHeight: 1,
            }}>×</button>
          )}
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, padding: '0 20px 20px' }}>
        {totalCount === 0 ? (
          <div style={{
            background: 'var(--paper-light)', border: `1px dashed var(--fold)`,
            borderRadius: 14, padding: '40px 20px', textAlign: 'center',
            fontFamily: T.fontSerif, color: 'var(--ink-mute)',
          }}>
            还没有标签 — 写下笔记，{persona.name}会自动为你打标签。
          </div>
        ) : filteredTags.length === 0 ? (
          <div style={{
            background: 'var(--paper-light)', border: `1px dashed var(--fold)`,
            borderRadius: 14, padding: '40px 20px', textAlign: 'center',
            fontFamily: T.fontSerif, color: 'var(--ink-mute)',
          }}>
            没有找到匹配的标签
          </div>
        ) : (
          <>
            {/* Summary */}
            {!search && (
              <div style={{
                fontSize: 12, color: 'var(--ink-mute)', fontFamily: T.fontSerif,
                marginBottom: 16, lineHeight: 1.6,
              }}>
                共 {totalCount} 个标签，{notes.length} 条笔记
              </div>
            )}

            {/* Recent tags */}
            {!search && recentTags.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 11, color: 'var(--ink-mute)',
                  letterSpacing: '.1em', marginBottom: 8,
                }}>最近使用</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {recentTags.map(t => (
                    <span key={t.label} onClick={() => onPickTag(t.label)} style={{ cursor: 'pointer' }}>
                      <Tag label={`${t.label} ${t.count}`} color={t.color} size="sm" />
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* High frequency tags */}
            {highTags.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 11, color: 'var(--ink-mute)',
                  letterSpacing: '.1em', marginBottom: 8,
                }}>
                  {search ? `匹配结果 · ${highTags.length}` : `高频标签 · ${highTags.length}`}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {highTags.map(t => (
                    <button key={t.label} onClick={() => onPickTag(t.label)} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: 'var(--paper-light)', border: `1px solid var(--fold)`,
                      borderRadius: 10, padding: '10px 12px',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      fontFamily: T.fontSerif, fontSize: 14, color: 'var(--ink-soft)',
                    }}>
                      <Tag label={t.label} color={t.color} size="sm" />
                      <span style={{ flex: 1 }} />
                      <span className="mono" style={{ fontSize: 12, color: 'var(--ink-fade)' }}>{t.count} 条</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Low frequency tags */}
            {lowTags.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 11, color: 'var(--ink-mute)',
                  letterSpacing: '.1em', marginBottom: 8,
                }}>
                  {search ? `匹配结果 · ${lowTags.length}` : `低频标签 · ${lowTags.length}`}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {lowTags.map(t => (
                    <span key={t.label} onClick={() => onPickTag(t.label)} style={{ cursor: 'pointer' }}>
                      <Tag label={`${t.label} ${t.count}`} color={t.color} size="sm" />
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Merge suggestions */}
            {!search && mergeCandidates.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 11, color: 'var(--ink-mute)',
                  letterSpacing: '.1em', marginBottom: 8,
                }}>
                  <I.sparkle size={12} /> 整理建议
                </div>
                <div style={{
                  background: 'rgba(184,68,58,.04)',
                  border: `1px solid rgba(184,68,58,.12)`,
                  borderRadius: 12, padding: '10px 12px',
                }}>
                  {mergeCandidates.map((m, i) => (
                    <div key={i} style={{
                      fontSize: 12, color: 'var(--ink-soft)', fontFamily: T.fontSerif,
                      lineHeight: 1.7, padding: '4px 0',
                      borderBottom: i < mergeCandidates.length - 1 ? '1px solid var(--fold)' : 'none',
                    }}>
                      <span style={{ opacity: .6 }}>「{m.from.label}」</span>
                      <span style={{ color: 'var(--ink-fade)', margin: '0 4px' }}>→</span>
                      <span style={{ color: persona.color, fontWeight: 600 }}>「{m.to.label}」</span>
                      <span style={{ color: 'var(--ink-fade)', marginLeft: 6, fontSize: 11 }}>{m.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
