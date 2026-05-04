// components.jsx — Shared visual primitives: SealStamp, BrushTitle, Tag, BottomNav, Toast, KindBadge.

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
        <button key={k}
          className={`nav-btn ${k === active ? 'active' : ''}`}
          onClick={() => onChange(k)} aria-label={label}>
          <span className="nav-icon">
            <Ico size={22} />
            <span className={`nav-icon-fill${k === 'settings' || k === 'yan' ? ' center-hole' : ''}`}><Ico size={22} fill="currentColor" stroke="currentColor" sw={1.2} /></span>
          </span>
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

export function FullscreenTextEditor({
  title = '全屏编辑',
  meta,
  value,
  onChange,
  onClose,
  onSave,
  saveLabel = '收',
  saveDisabled = false,
  placeholder = '此处落笔…',
}) {
  const I = ICONS;
  const taRef = useRef(null);
  const handleAutoNumber = useAutoNumber(value, onChange);

  useEffect(() => {
    const id = setTimeout(() => taRef.current?.focus({ preventScroll: true }), 80);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !saveDisabled) onSave();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onSave, saveDisabled]);

  return (
    <div className="full-editor-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="full-editor-panel paper">
        <div className="full-editor-head">
          <button className="icon-btn" onClick={onClose} aria-label="退出全屏">
            <I.collapse size={20} />
          </button>
          <div className="full-editor-title">
            <strong>{title}</strong>
            {meta && <span>{meta}</span>}
          </div>
          <button className="btn-primary" onClick={onSave} disabled={saveDisabled}>
            {saveLabel}
          </button>
        </div>
        <textarea
          ref={taRef}
          className="full-editor-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleAutoNumber}
          placeholder={placeholder}
        />
      </div>
    </div>
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

// ── useAutoNumber — auto-continue numbered lists on Enter ─────
const NUMBER_RE = /^(\d+)\.\s/;

export function useAutoNumber(value, setValue) {
  return useMemo(() => (e) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const ta = e.target;
    const { selectionStart: pos, value: cur } = ta;
    const lineStart = cur.lastIndexOf('\n', pos - 1) + 1;
    const line = cur.slice(lineStart, pos);
    const m = line.match(NUMBER_RE);
    if (!m) return;
    e.preventDefault();
    const n = parseInt(m[1], 10);
    const indent = line.slice(0, m[0].length);
    const content = line.slice(m[0].length);
    if (!content.trim()) {
      // Empty item → remove number, break out of list
      const next = cur.slice(0, lineStart) + '\n' + cur.slice(pos);
      setValue(next);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = lineStart + 1; });
      return;
    }
    const nextNum = indent.replace(/\d+/, String(n + 1));
    const insert = '\n' + nextNum;
    const next = cur.slice(0, pos) + insert + cur.slice(pos);
    setValue(next);
    requestAnimationFrame(() => { const c = pos + insert.length; ta.selectionStart = ta.selectionEnd = c; });
  }, [value, setValue]);
}
