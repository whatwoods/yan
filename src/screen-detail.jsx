// screen-detail.jsx — Single note detail with AI summary & tags.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { TOKENS, PERSONAS, formatRelative, fullDate } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { SealStamp, Tag, showToast, FullscreenTextEditor, useAutoNumber } from './components.jsx';
import { autoTitle, autoSummary, autoTags, Store } from './store.jsx';
import { useHorizontalSwipe } from './gestures.js';
import { organizeBody, isAIConfigured, getModelAssignment, getModelGroupAssignment, generateSummary, getAIConfig } from './ai.js';

export function DetailScreen({ note, allNotes, onBack, onUpdate, onDelete, onPrev, onNext, prevNote, nextNote }) {
  const T = TOKENS, I = ICONS;
  const persona = PERSONAS.yan;

  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note?.body || '');
  const [showMore, setShowMore] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isFullEditor, setFullEditor] = useState(false);
  const [showFirstHint, setShowFirstHint] = useState(false);
  const stageRef = useRef(null);
  const screenRef = useRef(null);
  const firstHintShownRef = useRef(false);
  const handleAutoNumber = useAutoNumber(body, setBody);

  // AI organize state
  const [organizeSheet, setOrganizeSheet] = useState(null); // { tier, status, result, tab }
  const [aiConfigured, setAiConfigured] = useState(false);
  const organizeAbortRef = useRef(null);

  useHorizontalSwipe(screenRef, {
    onPrev,
    onNext,
    enabled: !editing && !isFullEditor && !showCatPicker && !organizeSheet,
    threshold: 0.3,
    // Drive page-edge peek opacity via CSS variables on the stage container,
    // avoiding React re-renders on every drag frame.
    onProgress: (dx, dir) => {
      const stage = stageRef.current;
      if (!stage) return;
      const w = window.innerWidth;
      const peek = Math.min(1, Math.abs(dx) / (w * 0.4));
      stage.style.setProperty('--peek-next', dir === 'next' ? String(peek) : '0');
      stage.style.setProperty('--peek-prev', dir === 'prev' ? String(peek) : '0');
    },
  });

  useEffect(() => {
    Store.getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([getAIConfig(), getModelAssignment(), getModelGroupAssignment()])
      .then(([config, assignment, groupAssignment]) => setAiConfigured(isAIConfigured(config, assignment, groupAssignment)))
      .catch(() => {});
  }, []);

  // Reset scroll position when navigating between notes via swipe.
  useEffect(() => {
    if (screenRef.current) screenRef.current.scrollTop = 0;
  }, [note.id]);

  // First-time swipe hint — shows once per browser, only if there's somewhere to flip to.
  useEffect(() => {
    if (firstHintShownRef.current) return;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('hint-detail-swipe')) return;
    if (!prevNote && !nextNote) return;
    firstHintShownRef.current = true;
    setShowFirstHint(true);
    const t = setTimeout(() => {
      setShowFirstHint(false);
      try { localStorage.setItem('hint-detail-swipe', '1'); } catch {}
    }, 3000);
    return () => clearTimeout(t);
  }, [prevNote, nextNote]);

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

  // AI organize handlers
  const handleOrganize = useCallback(async (tier) => {
    const noteBody = note?.body?.trim();
    if (!noteBody) {
      showToast('笔记无内容');
      return;
    }
    const config = await getAIConfig();
    const assignment = await getModelAssignment();
    const groupAssignment = await getModelGroupAssignment();
    if (!isAIConfigured(config, assignment, groupAssignment)) {
      showToast('请先在设置里配 AI');
      return;
    }

    // Abort any in-flight request before starting a new one
    organizeAbortRef.current?.abort();
    setOrganizeSheet({ tier, status: 'loading', result: null, tab: 'organized' });
    const ctrl = new AbortController();
    organizeAbortRef.current = ctrl;

    try {
      const result = await organizeBody(noteBody, tier, { signal: ctrl.signal });
      if (result.skipped) {
        setOrganizeSheet({ tier, status: 'ready', result: { text: noteBody, skipped: true, reason: result.reason }, tab: 'organized' });
      } else {
        setOrganizeSheet({ tier, status: 'ready', result, tab: 'organized' });
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        setOrganizeSheet(null);
        return;
      }
      setOrganizeSheet({ tier, status: 'error', result: null, tab: 'organized' });
    }
  }, [note]);

  // Cleanup: abort pending request on unmount
  useEffect(() => () => organizeAbortRef.current?.abort(), []);

  const handleOrganizeClose = useCallback(() => {
    organizeAbortRef.current?.abort();
    setOrganizeSheet(null);
  }, []);

  const handleOrganizeRegenerate = useCallback(() => {
    if (organizeSheet) handleOrganize(organizeSheet.tier);
  }, [organizeSheet, handleOrganize]);

  const handleOrganizeApply = useCallback(() => {
    if (!organizeSheet?.result?.text) return;
    // Skipped state: no side effects, just close
    if (organizeSheet.result.skipped) {
      setOrganizeSheet(null);
      return;
    }
    const oldBody = note.body;
    const newBody = organizeSheet.result.text;
    const patch = { body: newBody };
    if (!note.organized) {
      patch.organized = {
        tier: organizeSheet.tier,
        at: new Date().toISOString(),
        model: organizeSheet.result.model || 'unknown',
        original: oldBody,
      };
    } else {
      patch.organized = {
        ...note.organized,
        tier: organizeSheet.tier,
        at: new Date().toISOString(),
        model: organizeSheet.result.model || 'unknown',
      };
    }
    onUpdate(note.id, patch);
    setOrganizeSheet(null);
    showToast('已采用整理版');
    // Re-generate summary async
    // Re-generate summary async
    generateSummary(newBody).then(summary => {
      if (summary) onUpdate(note.id, {
        summary,
        ai: { ...(note.ai || {}), summary, generated_at: new Date().toISOString() },
      });
    }).catch(() => {});
  }, [note, organizeSheet, onUpdate]);

  const handleRestoreOriginal = useCallback(() => {
    if (!note.organized?.original) return;
    onUpdate(note.id, {
      body: note.organized.original,
      organized: null,
    });
    showToast('已还原');
  }, [note, onUpdate]);

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
    <div ref={stageRef} className="screen paper page-stage" style={{ touchAction: 'pan-y' }}>
      {/* Page-edge peeks — show prev/next note titles during swipe */}
      {prevNote && (
        <div className="page-peek prev" aria-hidden="true">
          上一条 · {prevNote.title}
        </div>
      )}
      {nextNote && (
        <div className="page-peek next" aria-hidden="true">
          下一条 · {nextNote.title}
        </div>
      )}

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
              <OrganizeMenuItems
                note={note}
                onOrganize={(tier) => { handleOrganize(tier); setShowMore(false); }}
                onRestore={() => { handleRestoreOriginal(); setShowMore(false); }}
                disabled={!!organizeSheet}
                aiConfigured={aiConfigured}
              />
              <button onClick={() => { handleDelete(); setShowMore(false); }} style={{ ...menuItem(T), color: 'var(--seal)' }}>
                <I.trash size={14} /> 删除
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={screenRef}
        className="scroll page-leaf"
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
              onKeyDown={handleAutoNumber}
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
      {showFirstHint && (
        <div className="first-hint" aria-hidden="true">
          {prevNote ? '←' : ''} 翻页 {nextNote ? '→' : ''}
        </div>
      )}

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

      {/* Organize sheet */}
      {organizeSheet && (
        <OrganizeSheet
          tier={organizeSheet.tier}
          status={organizeSheet.status}
          result={organizeSheet.result}
          tab={organizeSheet.tab}
          noteBody={note.body}
          onClose={handleOrganizeClose}
          onTabChange={(tab) => setOrganizeSheet(prev => prev ? { ...prev, tab } : null)}
          onRegenerate={handleOrganizeRegenerate}
          onApply={handleOrganizeApply}
        />
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

function OrganizeMenuItems({ note, onOrganize, onRestore, disabled, aiConfigured }) {
  const T = TOKENS, I = ICONS;
  const hasBody = note?.body?.trim();
  const hasOrganized = !!note?.organized;
  const canOrganize = hasBody && aiConfigured && !disabled;

  return (
    <>
      <button
        onClick={() => canOrganize && onOrganize('organize')}
        disabled={!canOrganize}
        style={{
          ...menuItem(T),
          opacity: canOrganize ? 1 : 0.4,
          cursor: canOrganize ? 'pointer' : 'default',
        }}
      >
        <I.sparkle size={14} /> AI 整理
      </button>
      <button
        onClick={() => canOrganize && onOrganize('restructure')}
        disabled={!canOrganize}
        style={{
          ...menuItem(T),
          opacity: canOrganize ? 1 : 0.4,
          cursor: canOrganize ? 'pointer' : 'default',
        }}
      >
        <I.sparkle size={14} /> AI 重构
      </button>
      {hasOrganized && (
        <button onClick={onRestore} style={menuItem(T)}>
          <I.back size={14} /> 还原原文
        </button>
      )}
    </>
  );
}

function OrganizeSheet({ tier, status, result, tab, noteBody, onClose, onTabChange, onRegenerate, onApply }) {
  const T = TOKENS, I = ICONS;
  const tierLabel = tier === 'restructure' ? 'AI 重构' : 'AI 整理';

  return (
    <>
      <div className="sheet-mask" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={tierLabel}
        style={{ height: 'auto', maxHeight: '60vh', display: 'flex', flexDirection: 'column' }}>
        <div className="sheet-grip" />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px 12px', borderBottom: `1px solid var(--fold)`,
        }}>
          <span style={{
            fontSize: 14, fontWeight: 600, color: 'var(--ink)',
            fontFamily: T.fontSerif,
          }}>{tierLabel}</span>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <I.close size={18} />
          </button>
        </div>

        {/* Segmented toggle */}
        {status === 'ready' && !result?.skipped && (
          <div style={{
            display: 'flex', padding: '12px 24px', gap: 2,
            background: 'var(--paper-light)', borderBottom: `1px solid var(--fold)`,
          }}>
            <button
              onClick={() => onTabChange('organized')}
              style={{
                flex: 1, padding: '8px 0', border: 'none', borderRadius: '8px 0 0 8px',
                background: tab === 'organized' ? 'var(--ink)' : 'transparent',
                color: tab === 'organized' ? 'var(--paper)' : 'var(--ink-soft)',
                fontFamily: T.fontSerif, fontSize: 13, cursor: 'pointer',
              }}
            >整理版</button>
            <button
              onClick={() => onTabChange('original')}
              style={{
                flex: 1, padding: '8px 0', border: 'none', borderRadius: '0 8px 8px 0',
                background: tab === 'original' ? 'var(--ink)' : 'transparent',
                color: tab === 'original' ? 'var(--paper)' : 'var(--ink-soft)',
                fontFamily: T.fontSerif, fontSize: 13, cursor: 'pointer',
              }}
            >原文</button>
          </div>
        )}

        {/* Body */}
        <div style={{
          flex: 1, overflow: 'auto', padding: '16px 24px',
          maxHeight: '60vh',
        }}>
          {status === 'loading' && (
            <div style={{
              textAlign: 'center', padding: '40px 0',
              color: 'var(--ink-mute)', fontFamily: T.fontSerif,
            }}>
              <div style={{ marginBottom: 8 }}>砚正在整理…</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                <span className="dot-pulse" style={{ animationDelay: '0s' }}>·</span>
                <span className="dot-pulse" style={{ animationDelay: '0.2s' }}>·</span>
                <span className="dot-pulse" style={{ animationDelay: '0.4s' }}>·</span>
              </div>
            </div>
          )}
          {status === 'error' && (
            <div style={{
              textAlign: 'center', padding: '40px 0',
              color: 'var(--seal)', fontFamily: T.fontSerif,
            }}>
              整理失败 · 请检查网络或 AI 配置
            </div>
          )}
          {status === 'ready' && result?.skipped && (
            <>
              <div style={{
                textAlign: 'center', padding: '10px 0',
                color: 'var(--ink-mute)', fontFamily: T.fontSerif, fontSize: 13,
              }}>
                {result?.reason === 'clean' ? '砚觉得已经足够干净了' : '内容已足够简短，无需整理'}
              </div>
              <div className="md-body"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(marked.parse(noteBody || '')),
                }}
                style={{
                  fontFamily: T.fontSerif, fontSize: 15, lineHeight: 1.8,
                  color: 'var(--ink-soft)',
                }}
              />
            </>
          )}
          {status === 'ready' && !result?.skipped && (
            <div className="md-body"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  marked.parse(tab === 'organized' ? (result?.text || '') : (noteBody || ''))
                ),
              }}
              style={{
                fontFamily: T.fontSerif, fontSize: 15, lineHeight: 1.8,
                color: 'var(--ink-soft)',
              }}
            />
          )}
        </div>

        {/* Footer */}
        {status === 'error' && (
          <div style={{
            display: 'flex', gap: 10, justifyContent: 'flex-end',
            padding: '12px 24px', borderTop: `1px solid var(--fold)`,
          }}>
            <button className="btn-ghost" onClick={onClose}>关闭</button>
            <button className="btn-primary" onClick={onRegenerate}>重试</button>
          </div>
        )}
        {status === 'ready' && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center',
            padding: '12px 24px', borderTop: `1px solid var(--fold)`,
          }}>
            <button className="icon-btn" onClick={onRegenerate} aria-label="重新生成"
              style={{ color: 'var(--ink-mute)' }}>
              <I.refresh size={18} />
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn-ghost" onClick={onClose}>取消</button>
            <button className="btn-primary" onClick={onApply}>采用</button>
          </div>
        )}
      </div>
    </>
  );
}
