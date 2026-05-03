// settings-security.jsx — Master password and unlock sheet components.

import React, { useState } from 'react';
import { TOKENS } from './tokens.jsx';
import { showToast } from './components.jsx';
import { inputStyle } from './settings-components.jsx';

// ── Master password sheet ──────────────────────────────────────

export function MasterPasswordSheet({ isChange, onSubmit, onClose }) {
  const T = TOKENS;
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (pw.length < 8) {
      showToast('密码至少 8 位');
      return;
    }
    if (pw !== pw2) {
      showToast('两次密码不一致');
      return;
    }
    setSubmitting(true);
    await onSubmit(pw);
    setSubmitting(false);
  }

  return (
    <>
      <div className="sheet-mask" onClick={onClose} />
      <div className="sheet" style={{ height: 'auto', maxHeight: '60%' }}>
        <div className="sheet-grip" />
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{
            fontSize: 12, color: 'var(--ink-mute)',
            letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14,
            fontFamily: T.fontSerif,
          }}>{isChange ? '修改主密码' : '设置主密码'}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14, fontFamily: T.fontSerif, lineHeight: 1.6 }}>
            主密码用于加密你的 API 密钥等敏感信息。密码本身不会被存储，请牢记。
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>新密码（至少 8 位）</div>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="输入密码"
              style={inputStyle(T)}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>确认密码</div>
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="再次输入"
              style={inputStyle(T)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={onClose}>取消</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '...' : '确定'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Unlock sheet ───────────────────────────────────────────────

export function UnlockSheet({ onSubmit, onClose }) {
  const T = TOKENS;
  const [pw, setPw] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!pw) return;
    setSubmitting(true);
    await onSubmit(pw);
    setSubmitting(false);
  }

  return (
    <>
      <div className="sheet-mask" onClick={onClose} />
      <div className="sheet" style={{ height: 'auto', maxHeight: '50%' }}>
        <div className="sheet-grip" />
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{
            fontSize: 12, color: 'var(--ink-mute)',
            letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14,
            fontFamily: T.fontSerif,
          }}>解锁密钥</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14, fontFamily: T.fontSerif, lineHeight: 1.6 }}>
            输入主密码以解密 API 密钥。
          </div>
          <div style={{ marginBottom: 18 }}>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="主密码"
              style={inputStyle(T)}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={onClose}>取消</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '...' : '解锁'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
