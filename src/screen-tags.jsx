// screen-tags.jsx — Tag/category browse with cloud.

import React, { useMemo } from 'react';
import { TOKENS, PERSONAS } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { BrushTitle, Tag } from './components.jsx';

export function TagsScreen({ notes, onBack, onPickTag }) {
  const T = TOKENS, I = ICONS;
  const persona = PERSONAS.yan;

  const cats = useMemo(() => {
    const counts = {};
    notes.forEach((n) => (n.tags || []).forEach((t) => {
      if (!counts[t.label]) counts[t.label] = { count: 0, color: t.color };
      counts[t.label].count++;
    }));
    return Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([label, v]) => ({ label, count: v.count, color: v.color }));
  }, [notes]);

  const top6 = cats.slice(0, 6);
  const rest = cats.slice(6);

  return (
    <div className="screen paper">
      <div style={{ padding: 'calc(10px + var(--safe-top)) 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="icon-btn" onClick={onBack} aria-label="返回"><I.back size={22} /></button>
        <BrushTitle size={22}>标签</BrushTitle>
        <div style={{ width: 40 }} />
      </div>

      <div className="scroll" style={{ flex: 1, padding: '8px 20px 20px' }}>
        {cats.length === 0 ? (
          <div style={{
            background: 'var(--paper-light)', border: `1px dashed var(--fold)`,
            borderRadius: 14, padding: '40px 20px', textAlign: 'center',
            fontFamily: T.fontSerif, color: 'var(--ink-mute)',
          }}>
            还没有标签 — 写下笔记，{persona.name}会自动为你打标签。
          </div>
        ) : (
          <>
            {/* AI suggestion */}
            {top6[0] && (
              <div style={{
                background: 'rgba(184,68,58,.06)',
                border: `1px solid rgba(184,68,58,.18)`,
                borderRadius: 12, padding: '10px 12px', marginBottom: 16,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <I.sparkle size={14} stroke={persona.color} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 12, color: 'var(--ink-soft)', fontFamily: T.fontSerif, lineHeight: 1.6 }}>
                  {persona.name}发现你最常想到 <b style={{ color: persona.color }}>「{top6[0].label}」</b>，已写 {top6[0].count} 条。
                </div>
              </div>
            )}

            {/* Big cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              {top6.map((c) => (
                <div key={c.label} onClick={() => onPickTag(c.label)} style={{
                  background: 'var(--paper-light)', border: `1px solid var(--fold)`,
                  borderRadius: 14, padding: 14, position: 'relative', overflow: 'hidden',
                  minHeight: 110, cursor: 'pointer',
                }}>
                  <div style={{
                    position: 'absolute', top: -10, right: -10, width: 56, height: 56,
                    borderRadius: '50%', background: `var(--${c.color}-tint)`, opacity: .8,
                  }} />
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      fontFamily: T.fontSerif, fontSize: 22, fontWeight: 700,
                      color: `var(--${c.color})`, marginBottom: 4,
                    }}>{c.label}</div>
                    <div className="mono" style={{
                      fontSize: 11, color: 'var(--ink-mute)',
                    }}>{c.count} 条</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tag cloud */}
            {rest.length > 0 && (
              <div>
                <div style={{
                  fontSize: 11, color: 'var(--ink-mute)',
                  letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10,
                }}>其他 · 共 {rest.length} 个</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {rest.map((c) => (
                    <span key={c.label} onClick={() => onPickTag(c.label)} style={{ cursor: 'pointer' }}>
                      <Tag label={`${c.label} ${c.count}`} color={c.color} size="sm" />
                    </span>
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

