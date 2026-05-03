// screen-trash.jsx — Trash (回收站) screen for soft-deleted notes.

import React, { useState, useMemo } from 'react';
import { TOKENS, formatRelative } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { ScrHead, showToast } from './components.jsx';
import { Store } from './store.jsx';

export function TrashScreen({ onBack, onRefresh }) {
  const T = TOKENS, I = ICONS;

  const [deleted, setDeleted] = useState(() =>
    Store.getAllNotesWithDeleted().filter((n) => n.deleted_at)
  );

  function refresh() {
    setDeleted(Store.getAllNotesWithDeleted().filter((n) => n.deleted_at));
  }

  async function handleRestore(id) {
    await Store.restore(id);
    refresh();
    onRefresh?.();
    showToast('已还原');
  }

  async function handlePermanentDelete(id) {
    if (!window.confirm('永久删除此笔记？此操作不可撤销。')) return;
    await Store.permanentDelete(id);
    refresh();
    onRefresh?.();
    showToast('已永久删除');
  }

  return (
    <div className="screen paper">
      <ScrHead title="回收站" right={
        <button className="icon-btn" onClick={onBack} aria-label="返回">
          <I.back size={22} />
        </button>
      } />

      <div className="scroll" style={{ flex: 1, padding: '0 20px 30px' }}>
        {deleted.length === 0 && (
          <div style={{
            background: 'var(--paper-light)', border: `1px dashed var(--fold)`,
            borderRadius: 14, padding: '40px 20px', textAlign: 'center',
            fontFamily: T.fontSerif, color: 'var(--ink-mute)', marginTop: 30,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: .5 }}>回收</div>
            <div style={{ fontSize: 16 }}>回收站是空的</div>
            <div style={{ fontSize: 13, color: 'var(--ink-fade)', marginTop: 6 }}>
              删除的笔记会在这里保留 30 天
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: deleted.length > 0 ? 12 : 0 }}>
          {deleted.map((note) => (
            <div key={note.id} style={{
              background: 'var(--paper-light)',
              border: `1px solid var(--fold)`,
              borderRadius: 14, padding: 14,
            }}>
              <div style={{
                fontFamily: T.fontSerif, fontSize: 15, fontWeight: 600,
                color: 'var(--ink)', marginBottom: 4,
              }}>{note.title || '无题'}</div>
              {note.body && (
                <div style={{
                  fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 8,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>{note.body}</div>
              )}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 8,
              }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-fade)' }}>
                  删除于 {formatRelative(new Date(note.deleted_at).getTime())}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleRestore(note.id)} style={{
                    background: 'transparent', border: `1px solid var(--bamboo)`,
                    color: 'var(--bamboo)', padding: '5px 12px', borderRadius: 999,
                    fontSize: 12, fontFamily: T.fontSerif, cursor: 'pointer',
                  }}>还原</button>
                  <button onClick={() => handlePermanentDelete(note.id)} style={{
                    background: 'transparent', border: `1px solid var(--seal)`,
                    color: 'var(--seal)', padding: '5px 12px', borderRadius: 999,
                    fontSize: 12, fontFamily: T.fontSerif, cursor: 'pointer',
                  }}>永久删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {deleted.length > 0 && (
          <div style={{
            textAlign: 'center', padding: '20px 0 10px',
            fontSize: 11, color: 'var(--ink-fade)', fontFamily: T.fontSerif,
          }}>
            已删除的笔记将在 30 天后自动清理
          </div>
        )}
      </div>
    </div>
  );
}
