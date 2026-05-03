// components.jsx — Shared visual primitives: SealStamp, BrushTitle, Tag, BottomNav, Toast, KindBadge.

import React, { useState, useCallback, useEffect } from 'react';
import { ICONS } from './icons.jsx';

export function SealStamp({ text = '砚', size = 36, rotate = -6, color }) {
  return (
    <div className="stamp" style={{
      width: size, height: size, fontSize: size * 0.5,
      transform: `rotate(${rotate}deg)`,
      background: color || 'var(--seal)',
      flexShrink: 0,
    }}>{text}</div>
  );
}

export function BrushTitle({ children, size = 26, color, style }) {
  return (
    <h1 className="brush" style={{ fontSize: size, color: color || 'var(--ink)', ...style }}>{children}</h1>
  );
}

export function Tag({ label, color = 'ink', size = 'md', onClick, style }) {
  return (
    <span
      className={`tag ${color} ${size === 'sm' ? 'sm' : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', ...style }}
    >
      <span className="hash">#</span>{label}
    </span>
  );
}

export function KindBadge({ kind, dur }) {
  const I = ICONS;
  const map = {
    text:  { icon: <I.pen size={11} />,    cls: 'ink',    label: '文字' },
    voice: { icon: <I.mic size={11} />,    cls: 'bamboo', label: dur || '语音' },
    photo: { icon: <I.camera size={11} />, cls: 'ochre',  label: '照片' },
    link:  { icon: <I.clip size={11} />,   cls: 'indigo', label: '链接' },
  }[kind] || { icon: <I.pen size={11} />, cls: 'ink', label: '文字' };
  return (
    <span className={`tag ${map.cls} sm`} style={{ paddingLeft: 6, paddingRight: 6 }}>
      {map.icon}<span style={{ marginLeft: 2 }}>{map.label}</span>
    </span>
  );
}

export function BottomNav({ active, onChange }) {
  const I = ICONS;
  const items = [
    ['capture',  '记', I.pen],
    ['list',     '本', I.book],
    ['yan',      '砚', I.sparkle],
    ['settings', '设', I.settings],
  ];
  return (
    <div className="nav">
      {items.map(([k, label, Ico]) => (
        <button key={k} className={`nav-btn ${k === active ? 'active' : ''}`}
          onClick={() => onChange(k)} aria-label={label}>
          <Ico size={22} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

// Toast — call showToast('text') or window.showToast('text').
export function showToast(text) {
  if (typeof window.showToast === 'function') {
    window.showToast(text);
  }
}

export function ToastHost({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((text) => {
    setMsg(text);
    setTimeout(() => setMsg((m) => (m === text ? null : m)), 1800);
  }, []);
  useEffect(() => { window.showToast = show; }, [show]);
  return (
    <>
      {children}
      {msg && <div className="toast" role="status" aria-live="polite">{msg}</div>}
    </>
  );
}

// Header used across screens
export function ScrHead({ title, right, brushSize = 26, sub }) {
  return (
    <div className="scr-head">
      <div>
        {sub && <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginBottom: 2 }}>{sub}</div>}
        <BrushTitle size={brushSize}>{title}</BrushTitle>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{right}</div>
    </div>
  );
}
