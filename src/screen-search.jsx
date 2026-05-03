// screen-search.jsx — Search overlay with AI summary line.

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { TOKENS, formatRelative } from './tokens.jsx';
import { ICONS } from './icons.jsx';

export function SearchScreen({ notes, onBack, onOpenNote, persona }) {
  const T = TOKENS, I = ICONS;

  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const matched = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return notes.filter((n) => {
      const hay = (n.title + ' ' + n.body + ' ' + (n.tags || []).map((t) => t.label).join(' ')).toLowerCase();
      return hay.includes(query);
    });
  }, [notes, q]);

  // Hot suggestions when no query
  const suggestions = useMemo(() => {
    const tagCounts = {};
    notes.forEach((n) => (n.tags || []).forEach((t) => {
      tagCounts[t.label] = (tagCounts[t.label] || 0) + 1;
    }));
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label]) => label);
  }, [notes]);

  const aiLine = q.trim() && matched.length > 0
    ? `你提到 ${highlight(q)} 共 ${matched.length} 次。最近一次在 ${formatRelative(matched[0].createdAt)}。`
    : null;

  return (
    <div className="screen paper">
      <div style={{ padding: 'calc(8px + var(--safe-top)) 12px 10px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button className="icon-btn" onClick={onBack} aria-label="返回"><I.back size={22} /></button>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--paper-light)', border: `1px solid var(--fold)`,
          borderRadius: 999, padding: '8px 14px',
        }}>
          <I.search size={16} stroke="var(--ink-mute)" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="问砚一下，或自由检索…"
            style={{
              flex: 1, border: 'none', background: 'transparent', outline: 'none',
              fontFamily: T.fontSerif, fontSize: 15, color: 'var(--ink)',
            }} />
          {q && (
            <button onClick={() => setQ('')} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--ink-mute)', display: 'flex', padding: 0,
            }}>
              <I.close size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, padding: '8px 16px 20px' }}>
        {!q.trim() && (
          <>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              试试搜索
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {suggestions.map((s) => (
                <button key={s} className="btn-ghost" onClick={() => setQ(s)}>{s}</button>
              ))}
            </div>
          </>
        )}

        {aiLine && (
          <div style={{
            background: 'linear-gradient(180deg, var(--paper-light), var(--paper))',
            border: `1px solid var(--fold)`,
            borderRadius: 14, padding: '14px 16px', marginBottom: 16,
            animation: 'fadeup .25s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <I.sparkle size={14} stroke={persona.color} />
              <span style={{
                fontSize: 11, color: persona.color, fontWeight: 600, letterSpacing: '.12em',
              }}>{persona.name}说</span>
            </div>
            <div style={{
              fontFamily: T.fontSerif, fontSize: 14, color: 'var(--ink-soft)',
              lineHeight: 1.7,
            }}>{aiLine}</div>
          </div>
        )}

        {q.trim() && matched.length > 0 && (
          <div style={{
            fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '.1em',
            textTransform: 'uppercase', marginBottom: 10, padding: '0 4px',
          }}>
            相关笔记 · {matched.length} 条
          </div>
        )}

        {q.trim() && matched.length === 0 && (
          <div style={{
            background: 'var(--paper-light)', border: `1px dashed var(--fold)`,
            borderRadius: 14, padding: '40px 20px', textAlign: 'center',
            fontFamily: T.fontSerif, color: 'var(--ink-mute)',
          }}>
            未在此 {notes.length} 篇笔记中找到「{q}」。
          </div>
        )}

        {matched.map((it) => (
          <div key={it.id} onClick={() => onOpenNote(it.id)} style={{
            padding: '12px 14px', marginBottom: 8,
            background: 'var(--paper-light)', border: `1px solid var(--fold)`,
            borderRadius: 12, cursor: 'pointer',
          }}>
            <div className="mono" style={{
              display: 'flex', justifyContent: 'space-between',
              marginBottom: 4, fontSize: 11, color: 'var(--ink-fade)',
            }}>
              <span>{formatRelative(it.createdAt)}</span>
              <span>{(it.tags || []).slice(0, 2).map((t) => t.label).join(' · ')}</span>
            </div>
            <div style={{ fontFamily: T.fontSerif, fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>
              {highlightInText(it.title, q)}
            </div>
            <div style={{
              fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5,
              display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {highlightInText(it.body || '', q)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function highlight(s) { return `「${s}」`; }

function highlightInText(text, q) {
  if (!q.trim() || !text) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  const lower = q.toLowerCase();
  const parts = text.split(re);
  return parts.map((p, i) =>
    p && p.toLowerCase() === lower
      ? <mark key={i} style={{ background: 'var(--ochre-tint)', color: 'var(--ink)' }}>{p}</mark>
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

