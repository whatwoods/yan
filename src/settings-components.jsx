// settings-components.jsx — Reusable UI primitives for settings screens.

import React from 'react';
import { TOKENS } from './tokens.jsx';
import { ICONS } from './icons.jsx';

// ── Section ───────────────────────────────────────────────────

// ── SubScrHead (sub-page header with back) ──────────────────

export function SubScrHead({ title, onBack, right }) {
  const T = TOKENS;
  const I = ICONS;
  return (
    <div className="scr-head" style={{ paddingBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="icon-btn" onClick={onBack} aria-label="返回" style={{ marginLeft: -6 }}>
          <I.back size={22} />
        </button>
        <span style={{ fontFamily: T.fontSerif, fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>
          {title}
        </span>
      </div>
      {right && <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{right}</div>}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────

export function Section({ title, children }) {
  const T = TOKENS;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '.1em',
        textTransform: 'uppercase', padding: '0 4px 8px', fontFamily: T.fontSerif,
      }}>{title}</div>
      <div className="card settings-section" style={{ padding: 0, borderRadius: 14, overflow: 'hidden' }}>
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
