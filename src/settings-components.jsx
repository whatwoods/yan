// settings-components.jsx — Reusable UI primitives for settings screens.

import React from 'react';
import { TOKENS, PERSONAS } from './tokens.jsx';
import { SealStamp } from './components.jsx';

// ── Section ───────────────────────────────────────────────────

export function Section({ title, children }) {
  const T = TOKENS;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '.1em',
        textTransform: 'uppercase', padding: '0 4px 8px', fontFamily: T.fontSerif,
      }}>{title}</div>
      <div className="card" style={{ padding: 0, borderRadius: 14, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────

export function Row({ icon, label, value, last, onClick, accent }) {
  const T = TOKENS;
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      borderBottom: last ? 'none' : `1px solid var(--fold)`,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: accent || 'var(--paper-deep)',
        color: accent ? '#fff' : 'var(--ink-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: T.fontSerif, fontSize: 14, fontWeight: 600,
        flexShrink: 0,
      }}>{icon}</div>
      <span style={{
        flex: 1, fontFamily: T.fontSerif, fontSize: 14, color: 'var(--ink)',
      }}>{label}</span>
      {value !== undefined && (
        <span style={{ fontSize: 12, color: 'var(--ink-mute)', fontFamily: T.fontSerif }}>{value}</span>
      )}
      {onClick && <span style={{ color: 'var(--ink-fade)', fontSize: 14 }}>›</span>}
    </div>
  );
}

// ── inputStyle ────────────────────────────────────────────────

export function inputStyle(T) {
  return {
    width: '100%', border: `1px solid var(--fold)`, borderRadius: 8,
    padding: '8px 10px', fontSize: 13, fontFamily: T.fontMono,
    background: 'var(--paper-light)', color: 'var(--ink)', outline: 'none',
    boxSizing: 'border-box',
  };
}

// ── PickerSheet ───────────────────────────────────────────────

export function PickerSheet({ title, options, current, onSelect, onClose }) {
  const T = TOKENS;
  return (
    <>
      <div className="sheet-mask" onClick={onClose} />
      <div className="sheet" style={{ height: 'auto', maxHeight: '70%' }}>
        <div className="sheet-grip" />
        <div className="scroll" style={{ padding: '0 24px 24px' }}>
          <div style={{
            fontSize: 12, color: 'var(--ink-mute)',
            letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14,
            fontFamily: T.fontSerif,
          }}>{title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {options.map((opt) => (
              <button key={opt.value} onClick={() => onSelect(opt.value)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 12,
                background: current === opt.value ? 'var(--paper-deep)' : 'var(--paper-light)',
                border: `1.5px solid ${current === opt.value ? 'var(--seal)' : 'var(--fold)'}`,
                cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.fontSerif, fontSize: 14, color: 'var(--ink)' }}>
                    {opt.label}
                  </div>
                  {opt.hint && (
                    <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 1, fontFamily: T.fontMono }}>
                      {opt.hint}
                    </div>
                  )}
                </div>
                {current === opt.value && (
                  <span style={{ color: 'var(--seal)', fontSize: 14, fontWeight: 600 }}>选</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── PersonaSheet ──────────────────────────────────────────────

export function PersonaSheet({ current, onPick, onClose }) {
  const T = TOKENS;
  return (
    <>
      <div className="sheet-mask" onClick={onClose} />
      <div className="sheet" style={{ height: 'auto', maxHeight: '70%' }}>
        <div className="sheet-grip" />
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{
            fontSize: 12, color: 'var(--ink-mute)',
            letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14,
            fontFamily: T.fontSerif,
          }}>选一个砚的样子</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(PERSONAS).map(([id, p]) => (
              <button key={id} onClick={() => onPick(id)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: 12, borderRadius: 14,
                background: current === id ? 'var(--paper-deep)' : 'var(--paper-light)',
                border: `1.5px solid ${current === id ? p.color : 'var(--fold)'}`,
                cursor: 'pointer', textAlign: 'left',
              }}>
                <SealStamp size={42} text={p.mark} color={p.color} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.fontSerif, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 2 }}>
                    {p.desc} · {p.tone}
                  </div>
                </div>
                {current === id && (
                  <div style={{ color: p.color, fontSize: 14, fontWeight: 600 }}>选</div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── FontSheet ─────────────────────────────────────────────────

export function FontSheet({ current, onPick, onClose }) {
  const T = TOKENS;
  const fonts = [
    ['wenkai', '霞鹜文楷', T.fontSerif, '文艺 · 温润'],
    ['serif',  '思源宋体', '"Noto Serif SC", "Songti SC", serif', '经典 · 端庄'],
    ['sans',   '思源黑体', T.fontSans,  '现代 · 清晰'],
  ];
  return (
    <>
      <div className="sheet-mask" onClick={onClose} />
      <div className="sheet" style={{ height: 'auto', maxHeight: '70%' }}>
        <div className="sheet-grip" />
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{
            fontSize: 12, color: 'var(--ink-mute)',
            letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14,
            fontFamily: T.fontSerif,
          }}>字体</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fonts.map(([id, name, ff, hint]) => (
              <button key={id} onClick={() => onPick(id)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 12,
                background: current === id ? 'var(--paper-deep)' : 'var(--paper-light)',
                border: `1.5px solid ${current === id ? 'var(--seal)' : 'var(--fold)'}`,
                cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: ff, fontSize: 18, color: 'var(--ink)' }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 2, fontFamily: T.fontSans }}>
                    {hint}
                  </div>
                </div>
                {current === id && <span style={{ color: 'var(--seal)', fontWeight: 600 }}>选</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
