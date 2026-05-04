// screen-detail.jsx — Single note detail with AI summary & tags.

import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { TOKENS, formatRelative, fullDate } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { SealStamp, Tag, showToast, FullscreenTextEditor } from './components.jsx';
import { autoTitle, autoSummary, autoTags, Store } from './store.jsx';

export function DetailScreen({ note, allNotes, onBack, onUpdate, onDelete, persona }) {
  const T = TOKENS, I = ICONS;

  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note?.body || '');
  const [showMore, setShowMore] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isFullEditor, setFullEditor] = useState(false);

  useEffect(() => {
    Store.getCategories().then(setCategories).catch(() => {});
  }, []);

  if (!note) return null;

  const related = allNotes
    .filter((n) => n.id !== note.id && n.tags?.some((t) => note.tags?.some((mt) => mt.label === t.label)))
    .slice(0, 3);

  const charCount = (note.body || '').length;

  function saveEdit() {
    onUpdate(note.id, {
      body,
      title: autoTitle(body),
      summary: autoSummary(body),
      tags: autoTags(body),
    });
    setFullEditor(false);
    setEditing(false);
    showToast('已收');
  }

  function togglePin() {
    onUpdate(note.id, { pinned: !note.pinned });
    showToast(note.pinned ? '取下' : '钉住');
  }

  function handleDelete() {
    if (window.confirm('丢进回收？')) {
      onDelete(note.id);
      onBack();
    }
  }

  return (
    <div className="screen paper">
      {/* Top bar */}
      <div
        className="detail-head"
        aria-hidden={isFullEditor ? 'true' : undefined}
        style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}
      >
        <button className="icon-btn" onClick={onBack} aria-label="返回"><I.back size={22} /></button>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', position: 'relative' }}>
          <button className="icon-btn" onClick={togglePin} aria-label="钉住"
            style={{ color: note.pinned ? 'var(--seal)' : 'var(--ink-soft)' }}>
            <I.pin size={20} />
          </button>
          <button className="icon-btn" onClick={() => setShowMore(!showMore)} aria-label="更多">
            <I.more size={20} />
          </button>
          {showMore && (
            <div style={{
              position: 'absolute', top: 44, right: 0,
              background: 'var(--paper-light)', border: `1px solid var(--fold)`,
              borderRadius: 12, padding: 6, boxShadow: 'var(--shadow-deep)',
              zIndex: 20, minWidth: 130,
              display: 'flex', flexDirection: 'column',
            }}>
              <button onClick={() => { setEditing(true); setShowMore(false); }} style={menuItem(T)}>
                <I.pen size={14} /> 编辑
              </button>
              <button onClick={() => { handleDelete(); setShowMore(false); }} style={{ ...menuItem(T), color: 'var(--seal)' }}>
                <I.trash size={14} /> 删除
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className="scroll"
        aria-hidden={isFullEditor ? 'true' : undefined}
        style={{ flex: 1, padding: '4px 24px 24px' }}
      >
        {/* Meta */}
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-fade)', marginBottom: 8, letterSpacing: '.06em' }}>
          {fullDate(note.createdAt)} · {kindLabel(note.kind)}
          {charCount ? ` · ${charCount} 字` : ''}
          {note.duration ? ` · ${note.duration}` : ''}
        </div>

        {/* Category badge */}
        {(() => {
          const cat = categories.find((c) => c.name === note.category);
          if (!cat) return null;
          return (
            <div onClick={() => setShowCatPicker(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 999, marginBottom: 12,
              background: cat.hex + '18', border: `1px solid ${cat.hex}40`,
              cursor: 'pointer', fontSize: 12, fontFamily: T.fontSerif,
              color: cat.hex, fontWeight: 600,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: cat.hex }} />
              {cat.name}
            </div>
          );
        })()}

        {/* Title */}
        <h1 style={{
          fontFamily: T.fontSerif, fontSize: 24, fontWeight: 600, color: 'var(--ink)',
          margin: '0 0 6px', lineHeight: 1.3,
        }}>{note.title}</h1>

        {/* Photo (if any) */}
        {note.photo && (
          <div style={{
            margin: '12px 0',
            borderRadius: 14,
            border: `1px solid var(--fold)`,
            overflow: 'hidden',
          }}>
            <img src={note.photo} alt="" style={{ width: '100%', display: 'block' }} />
          </div>
        )}

        {/* AI summary */}
        {note.summary && (
          <div style={{
            background: 'rgba(184,68,58,.06)',
            border: `1px solid rgba(184,68,58,.18)`,
            borderRadius: 12, padding: '10px 12px',
            marginTop: 12, marginBottom: 16,
            display: 'flex', gap: 10, alignItems: 'flex-start',
            animation: 'fadeup .35s ease',
          }}>
            <SealStamp size={26} rotate={-4} text={persona.mark} color={persona.color} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: persona.color, fontWeight: 600, letterSpacing: '.08em', marginBottom: 3 }}>
                {persona.name} · 一句话
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6, fontFamily: T.fontSerif }}>
                {note.summary}
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        {editing ? (
          <div>
            <textarea
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="detail-editor-textarea"
              style={{
                width: '100%', border: `1px solid var(--fold)`,
                background: 'var(--paper-light)', borderRadius: 12, padding: 14,
                fontFamily: T.fontSerif, fontSize: 16, color: 'var(--ink)',
                lineHeight: 1.85, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="icon-btn" onClick={() => setFullEditor(true)} aria-label="全屏编辑">
                <I.expand size={19} />
              </button>
              <span className="mono" style={{ marginRight: 'auto', fontSize: 11, color: 'var(--ink-fade)' }}>
                {body.length} 字
              </span>
              <button className="btn-ghost" onClick={() => { setBody(note.body); setEditing(false); }}>取消</button>
              <button className="btn-primary" onClick={saveEdit}>收</button>
            </div>
          </div>
        ) : (
          <div onClick={() => setEditing(true)} className="md-body"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.body ? marked.parse(note.body) : '<span style="color:var(--ink-fade)">（无字 · 点此编辑）</span>') }}
            style={{
              fontFamily: T.fontSerif, fontSize: 16, lineHeight: 1.9, color: 'var(--ink-soft)',
              paddingBottom: 16, borderBottom: `1px dashed var(--fold)`,
              cursor: 'text',
            }}
          />
        )}

        {/* AI tags section */}
        <div style={{ paddingTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <I.sparkle size={14} stroke={persona.color} />
            <span style={{
              fontSize: 11, color: persona.color, fontWeight: 600,
              letterSpacing: '.1em', textTransform: 'uppercase',
            }}>{persona.name} 为你识别</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {note.tags?.length > 0 && (
              <Field label="分类与标签">
                {note.tags.map((t, i) => <Tag key={i} label={t.label} color={t.color} size="sm" />)}
              </Field>
            )}
            {note.people?.length > 0 && (
              <Field label="提到的人">
                {note.people.map((p, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontFamily: T.fontSerif, color: 'var(--ink-soft)', fontSize: 13,
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'var(--plum-tint)', color: 'var(--plum)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 600,
                    }}>{p[0]}</span>
                    @{p}
                  </span>
                ))}
              </Field>
            )}
          </div>

          {related.length > 0 && (
            <div style={{
              marginTop: 18, padding: 12,
              background: 'var(--paper-light)', border: `1px solid var(--fold)`,
              borderRadius: 12,
            }}>
              <div style={{
                fontSize: 11, color: 'var(--ink-mute)', marginBottom: 8,
                letterSpacing: '.08em', textTransform: 'uppercase',
              }}>相关笔记</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {related.map((n) => (
                  <div key={n.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13, fontFamily: T.fontSerif, color: 'var(--ink-soft)',
                  }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-fade)', width: 60 }}>
                      {formatRelative(n.createdAt)}
                    </span>
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {n.title}
                    </span>
                    <span style={{ color: 'var(--ink-fade)' }}>›</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {isFullEditor && (
        <FullscreenTextEditor
          title="编辑笔记"
          meta={`${body.length} 字`}
          value={body}
          onChange={setBody}
          onClose={() => setFullEditor(false)}
          onSave={saveEdit}
        />
      )}

      {/* Category picker sheet */}
      {showCatPicker && (
        <>
          <div className="sheet-mask" onClick={() => setShowCatPicker(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="选择分类" style={{ height: 'auto', maxHeight: '60%' }}>
            <div className="sheet-grip" />
            <div style={{ padding: '0 24px 24px' }}>
              <div style={{
                fontSize: 12, color: 'var(--ink-mute)',
                letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14,
                fontFamily: T.fontSerif,
              }}>选择分类</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {categories.map((cat) => (
                  <button key={cat.name} onClick={() => {
                    onUpdate(note.id, { category: cat.name });
                    setShowCatPicker(false);
                    showToast('已归类');
                  }} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 12,
                    background: note.category === cat.name ? cat.hex + '18' : 'var(--paper-light)',
                    border: `1.5px solid ${note.category === cat.name ? cat.hex : 'var(--fold)'}`,
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: cat.hex, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 13, fontWeight: 600,
                      fontFamily: T.fontSerif,
                    }}>{cat.name[0]}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: T.fontSerif, fontSize: 15, color: 'var(--ink)' }}>
                        {cat.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 1 }}>
                        {cat.color}
                      </div>
                    </div>
                    {note.category === cat.name && (
                      <span style={{ color: cat.hex, fontSize: 14, fontWeight: 600 }}>选</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }) {
  const T = TOKENS;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 28 }}>
      <span style={{
        width: 80, fontSize: 11, color: 'var(--ink-mute)',
        fontFamily: T.fontSerif, flexShrink: 0, paddingTop: 4,
      }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {children}
      </div>
    </div>
  );
}

function kindLabel(k) {
  return ({ text: '文字', voice: '语音', photo: '照片', link: '链接' })[k] || '文字';
}

function menuItem(T) {
  return {
    background: 'transparent', border: 'none',
    padding: '8px 12px', borderRadius: 8,
    fontFamily: T.fontSerif, fontSize: 13, color: 'var(--ink)',
    display: 'flex', alignItems: 'center', gap: 8,
    cursor: 'pointer', textAlign: 'left',
  };
}
