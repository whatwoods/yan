// screen-list.jsx — Timeline of all notes, grouped by day, with filter chips and search trigger.

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { TOKENS, dayLabel, timeLabel } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { SealStamp, Tag, KindBadge, ScrHead, showToast } from './components.jsx';
import { Store } from './store.jsx';
import { getMeta, setMeta } from './db.js';
import { initWebDAV, syncAll } from './sync.js';

// ── Simple virtual list for 100+ notes ────────────────────────
const VIRTUAL_THRESHOLD = 100;
const ITEM_H_COMFY = 110;
const ITEM_H_COMPACT = 80;
const HEADER_H = 36;
const BUFFER = 6;

function useVirtualList(flatItems, containerRef, itemHeight, disabled) {
  const [range, setRange] = useState({ start: 0, end: 30 });
  const rafRef = useRef(null);
  const prevRangeRef = useRef({ start: 0, end: 30 });

  useEffect(() => {
    if (disabled) return;
    const el = containerRef.current;
    if (!el) return;

    const calcRange = () => {
      const scrollTop = el.scrollTop;
      const viewH = el.clientHeight;
      const start = Math.max(0, Math.floor(scrollTop / itemHeight) - BUFFER);
      const end = Math.min(flatItems.length, Math.ceil((scrollTop + viewH) / itemHeight) + BUFFER);
      const prev = prevRangeRef.current;
      if (start !== prev.start || end !== prev.end) {
        prevRangeRef.current = { start, end };
        setRange({ start, end });
      }
    };

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(calcRange);
    };

    calcRange(); // initial
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [disabled, flatItems.length, itemHeight, containerRef]);

  return disabled ? null : range;
}

function ListScreen({ notes, onOpenNote, onSearch, density = 'comfy', onDensityChange, onCompose, onTags, onCategories, initialFilter }) {
  const T = TOKENS, I = ICONS;

  const [filter, setFilter] = useState(initialFilter || '全部');
  const [catFilter, setCatFilter] = useState('全部');
  const [showMenu, setShowMenu] = useState(false);
  const [categories, setCategories] = useState([]);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [syncing, setSyncing] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);
  const scrollRef = useRef(null);
  const pullRef = useRef({ startY: 0, pulling: false });

  useEffect(() => { setFilter(initialFilter || '全部'); }, [initialFilter]);

  // Load sync status on mount
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const [status, conflicts] = await Promise.all([
          getMeta('syncStatus'),
          getMeta('conflictCount'),
        ]);
        if (status) setSyncStatus(status);
        if (conflicts) setConflictCount(conflicts);
      } catch {}
    };
    loadStatus();
  }, []);

  // Sync handler (defined before pull-to-refresh so it can be referenced)
  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const savedWebdav = await getMeta('webdavConfig');
      if (savedWebdav?.server && savedWebdav?.username) {
        initWebDAV(savedWebdav);
        const allNotes = Store.getAllCachedNotes();
        const cats = categories.length ? categories : await Store.getCategories();
        const result = await syncAll(allNotes, { categories: cats });
        if (result.error) {
          showToast('同步失败 · 请检查 WebDAV 配置');
        } else {
          await setMeta('lastSync', new Date().toISOString());
          Store.applySyncResult(result);
          showToast('已同步');
          if (result.conflicts.length > 0) {
            setConflictCount(result.conflicts.length);
          }
        }
      } else {
        showToast('请先配置 WebDAV');
      }
    } catch {
      showToast('同步失败 · 请检查 WebDAV 配置');
    } finally {
      setSyncing(false);
      const [status, conflicts] = await Promise.all([getMeta('syncStatus'), getMeta('conflictCount')]);
      if (status) setSyncStatus(status);
      if (conflicts) setConflictCount(conflicts);
    }
  }, [syncing]);

  // Pull-to-refresh
  const handleTouchStart = useCallback((e) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      pullRef.current.startY = e.touches[0].clientY;
      pullRef.current.pulling = true;
      pullRef.current.pullDist = 0;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!pullRef.current.pulling) return;
    pullRef.current.pullDist = e.touches[0].clientY - pullRef.current.startY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!pullRef.current.pulling) return;
    const dist = pullRef.current.pullDist || 0;
    pullRef.current.pulling = false;
    pullRef.current.pullDist = 0;
    if (dist > 80) {
      handleSync();
    }
  }, [handleSync]);

  // Sync status indicator component
  const SyncIcon = useMemo(() => {
    if (syncing) {
      return <span style={{ fontSize: 12, color: 'var(--ink-mute)', animation: 'spin 1s linear infinite' }}>&#8635;</span>;
    }
    if (syncStatus === 'error') {
      return (
        <button className="icon-btn" onClick={() => showToast('同步失败 · 请检查 WebDAV 配置')} aria-label="同步错误"
          style={{ width: 28, height: 28, color: 'var(--seal)' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>!</span>
        </button>
      );
    }
    if (syncStatus === 'pending') {
      return <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ochre)', display: 'inline-block' }} />;
    }
    return <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bamboo)', display: 'inline-block' }} />;
  }, [syncStatus, syncing]);

  // Load categories from Store on mount
  useEffect(() => {
    Store.getCategories().then(setCategories).catch(() => {});
  }, []);

  // Category name → hex lookup map
  const catMap = useMemo(() => {
    const m = new Map();
    categories.forEach(c => m.set(c.name, c.hex));
    return m;
  }, [categories]);

  const allTags = useMemo(() => {
    const counts = {};
    notes.forEach((n) => (n.tags || []).forEach((t) => {
      counts[t.label] = { count: (counts[t.label]?.count || 0) + 1, color: t.color };
    }));
    const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
    return {
      tags: sorted.slice(0, 8).map(([label, v]) => ({ label, color: v.color })),
      hasMore: sorted.length > 8,
    };
  }, [notes]);

  const filtered = useMemo(() => {
    let out = notes;
    if (catFilter !== '全部') {
      out = out.filter((n) => n.category === catFilter);
    }
    if (filter !== '全部') {
      out = out.filter((n) => (n.tags || []).some((t) => t.label === filter));
    }
    return out;
  }, [notes, catFilter, filter]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((n) => {
      const key = dayLabel(n.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(n);
    });
    return [...map.entries()];
  }, [filtered]);

  const pad = density === 'compact' ? 10 : 14;
  const gap = density === 'compact' ? 8 : 12;
  const itemH = density === 'compact' ? ITEM_H_COMPACT : ITEM_H_COMFY;

  // Pinned at the very top
  const pinned = filtered.filter((n) => n.pinned);
  const useVirtual = filtered.length > VIRTUAL_THRESHOLD;

  // Flatten grouped items for virtual scrolling
  const flatItems = useMemo(() => {
    if (!useVirtual) return [];
    const items = [];
    if (pinned.length > 0) {
      items.push({ type: 'header', dayKey: '钉住', count: pinned.length });
      pinned.forEach((n) => items.push({ type: 'note', note: n, pad }));
    }
    grouped.forEach(([dayKey, dayItems]) => {
      const remain = dayItems.filter((n) => !n.pinned);
      if (remain.length === 0) return;
      items.push({ type: 'header', dayKey, count: remain.length });
      remain.forEach((n) => items.push({ type: 'note', note: n, pad }));
    });
    return items;
  }, [pinned, grouped, useVirtual, pad]);

  const virtualRange = useVirtualList(flatItems, scrollRef, itemH, !useVirtual);

  return (
    <div className="screen paper">
      <ScrHead title="笔记本" right={
        <>
          <button className="icon-btn" onClick={onSearch} aria-label="搜索"><I.search size={20} /></button>
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" onClick={() => setShowMenu(!showMenu)} aria-label="更多"><I.more size={20} /></button>
            {showMenu && (
              <div style={{
                position: 'absolute', top: 44, right: 0,
                background: 'var(--paper-light)', border: `1px solid var(--fold)`,
                borderRadius: 12, padding: 6, boxShadow: 'var(--shadow-deep)',
                zIndex: 20, minWidth: 180,
              }}>
                <button onClick={() => { handleSync(); setShowMenu(false); }} style={{
                  background: 'transparent', border: 'none',
                  padding: '8px 12px', borderRadius: 8,
                  fontFamily: T.fontSerif, fontSize: 13, color: 'var(--ink)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}>
                  <span style={{ fontSize: 14, animation: syncing ? 'spin 1s linear infinite' : undefined }}>&#8635;</span> 同步
                </button>
                <button onClick={() => { onCategories?.(); setShowMenu(false); }} style={{
                  background: 'transparent', border: 'none',
                  padding: '8px 12px', borderRadius: 8,
                  fontFamily: T.fontSerif, fontSize: 13, color: 'var(--ink)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}>
                  <I.grid size={14} /> 分类管理
                </button>
                <button onClick={() => { onTags?.(); setShowMenu(false); }} style={{
                  background: 'transparent', border: 'none',
                  padding: '8px 12px', borderRadius: 8,
                  fontFamily: T.fontSerif, fontSize: 13, color: 'var(--ink)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}>
                  <I.tag size={14} /> 标签管理
                </button>
                <button onClick={() => { onDensityChange?.(density === 'compact' ? 'comfy' : 'compact'); setShowMenu(false); }} style={{
                  background: 'transparent', border: 'none',
                  padding: '8px 12px', borderRadius: 8,
                  fontFamily: T.fontSerif, fontSize: 13, color: 'var(--ink)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}>
                  <I.book size={14} /> 卡片密度：{density === 'compact' ? '紧凑' : '舒适'}
                </button>
              </div>
            )}
          </div>
          {showMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setShowMenu(false)} />}
        </>
      } />

      {/* Conflict banner */}
      {conflictCount > 0 && (
        <div style={{
          margin: '0 20px 8px', padding: '8px 12px',
          background: 'rgba(200,147,66,.1)', border: '1px solid rgba(200,147,66,.25)',
          borderRadius: 10, fontSize: 12, color: 'var(--ochre)',
          fontFamily: T.fontSerif, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontWeight: 600 }}>{conflictCount} 条冲突</span>
          <span style={{ color: 'var(--ink-mute)' }}>已保存到 /yan/conflicts/</span>
          <button onClick={() => setConflictCount(0)} style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: 'var(--ink-fade)', cursor: 'pointer', fontSize: 14,
          }}>×</button>
        </div>
      )}

      {/* Category tabs */}
      {categories.length > 0 && (
        <div className="category-tabs">
          {[{ name: '全部', hex: null }, ...categories].map((cat) => {
            const active = cat.name === catFilter;
            return (
              <button key={cat.name} className={`category-tab ${active ? 'active' : ''}`}
                onClick={() => setCatFilter(cat.name)}
                style={cat.hex ? {
                  color: cat.hex,
                  borderColor: active ? cat.hex : 'var(--fold)',
                  background: active ? cat.hex + '18' : 'transparent',
                } : {
                  color: active ? 'var(--ink)' : 'var(--ink-soft)',
                  borderColor: active ? 'var(--ink)' : 'var(--fold)',
                  background: active ? 'var(--ink)' : 'transparent',
                }}>
                {cat.hex && <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: cat.hex, flexShrink: 0,
                }} />}
                {active && cat.name === '全部' ? (
                  <span style={{ color: 'var(--paper)' }}>{cat.name}</span>
                ) : cat.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter pills */}
      <div className="scroll" style={{
        flexDirection: 'row', display: 'flex', overflowX: 'auto', overflowY: 'hidden',
        padding: '2px 20px 12px', gap: 6, flexShrink: 0,
      }}>
        {[{ label: '全部', color: null }, ...allTags.tags].map(({ label, color }) => {
          const active = label === filter;
          return (
            <button key={label} onClick={() => setFilter(label)} style={{
              border: `1px solid ${active ? 'var(--ink)' : 'var(--fold)'}`,
              background: active ? 'var(--ink)' : 'transparent',
              color: active ? 'var(--paper)' : 'var(--ink-soft)',
              padding: '5px 14px', borderRadius: 999, fontSize: 13,
              fontFamily: T.fontSerif, whiteSpace: 'nowrap', flexShrink: 0,
              cursor: 'pointer',
            }}>{label}</button>
          );
        })}
        {allTags.hasMore && (
          <button onClick={onTags} style={{
            border: '1px solid var(--fold)',
            background: 'transparent',
            color: 'var(--ink-fade)',
            padding: '5px 14px', borderRadius: 999, fontSize: 13,
            fontFamily: T.fontSerif, whiteSpace: 'nowrap', flexShrink: 0,
            cursor: 'pointer',
          }}>更多</button>
        )}
      </div>

      {/* Notes — virtual scroll for 100+ items, normal render otherwise */}
      <div ref={scrollRef} className="scroll" style={{ flex: 1, padding: '0 20px 88px' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}>
        {filtered.length === 0 && (
          <div role="status" style={{
            background: 'var(--paper-light)', border: `1px dashed var(--fold)`,
            borderRadius: 14, padding: '40px 20px', textAlign: 'center',
            fontFamily: T.fontSerif, color: 'var(--ink-mute)',
            marginTop: 30,
          }}>
            <SealStamp size={50} rotate={-6} />
            {(filter !== '全部' || catFilter !== '全部') ? (
              <>
                <div style={{ marginTop: 16, fontSize: 16 }}>没有找到匹配的笔记</div>
                <button onClick={() => { setFilter('全部'); setCatFilter('全部'); }} style={{
                  marginTop: 12, background: 'var(--ink)', color: 'var(--paper)',
                  border: 'none', borderRadius: 999, padding: '6px 20px', fontSize: 13,
                  fontFamily: T.fontSerif, cursor: 'pointer',
                }}>清除筛选</button>
              </>
            ) : (
              <>
                <div style={{ marginTop: 16, fontSize: 16 }}>这里空空如也</div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ink-fade)' }}>去「记」页落下第一笔</div>
              </>
            )}
          </div>
        )}

        {useVirtual && virtualRange ? (
          // Virtual scrolling for large lists
          <div style={{ height: flatItems.length * itemH, position: 'relative' }}>
            {flatItems.slice(virtualRange.start, virtualRange.end).map((item, i) => {
              const idx = virtualRange.start + i;
              const top = idx * itemH;
              if (item.type === 'header') {
                return (
                  <div key={`h-${item.dayKey}`} style={{
                    position: 'absolute', top, left: 0, right: 0, height: HEADER_H,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--ink-mute)', fontFamily: T.fontSerif }}>{item.dayKey}</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--fold)' }} />
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-fade)' }}>{item.count} 条</span>
                  </div>
                );
              }
              return (
                <div key={item.note.id} style={{ position: 'absolute', top, left: 0, right: 0, height: itemH, paddingTop: item.type === 'header' ? 0 : 2, paddingBottom: 2 }}>
                  <NoteCard note={item.note} pad={item.pad} catColor={catMap.get(item.note.category)} onOpen={() => onOpenNote(item.note.id)} virtualMode />
                </div>
              );
            })}
          </div>
        ) : (
          // Normal render for smaller lists
          <>
            {pinned.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 12, color: 'var(--ink-mute)', fontFamily: T.fontSerif,
                  padding: '8px 0', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <I.pin size={14} stroke="var(--seal)" />
                  <span style={{ fontWeight: 600 }}>钉住</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--fold)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap }}>
                  {pinned.map((it) => <NoteCard key={it.id} note={it} pad={pad} catColor={catMap.get(it.category)} onOpen={() => onOpenNote(it.id)} />)}
                </div>
              </div>
            )}
            {grouped.map(([dayKey, items]) => {
              const remain = items.filter((n) => !n.pinned);
              if (remain.length === 0 && pinned.length > 0) return null;
              return (
                <div key={dayKey} style={{ marginBottom: 24 }}>
                  <div style={{
                    fontSize: 12, color: 'var(--ink-mute)', fontFamily: T.fontSerif,
                    padding: '8px 0', display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <span style={{ fontWeight: 600 }}>{dayKey}</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--fold)' }} />
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-fade)' }}>{remain.length} 条</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap }}>
                    {remain.map((it) => <NoteCard key={it.id} note={it} pad={pad} catColor={catMap.get(it.category)} onOpen={() => onOpenNote(it.id)} />)}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* FAB */}
      <button onClick={onCompose} aria-label="新建笔记"
        style={{
          position: 'absolute', right: 20, bottom: 24,
          width: 58, height: 58, borderRadius: '50%',
          background: 'var(--seal)', color: '#fff', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(184,68,58,.38)',
        }}>
        <I.pen size={22} />
      </button>
    </div>
  );
}

const NoteCard = React.memo(function NoteCard({ note, pad, catColor, onOpen, virtualMode }) {
  const T = TOKENS;
  return (
    <button onClick={onOpen} style={{
      background: 'var(--paper-light)',
      border: `1px solid var(--fold)`,
      borderRadius: 14, padding: pad,
      cursor: 'pointer',
      transition: 'transform .12s, box-shadow .12s',
      position: 'relative',
      paddingLeft: catColor ? pad + 6 : pad,
      textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit',
    }}
    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.99)'; }}
    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}>
      {catColor && <div className="category-bar" style={{ background: catColor }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <KindBadge kind={note.kind} dur={note.duration} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-fade)' }}>
          {timeLabel(note.createdAt)}
        </span>
        {note.pinned && <span style={{ fontSize: 11, color: 'var(--seal)' }}>· 钉</span>}
      </div>
      <div style={{
        fontFamily: T.fontSerif, fontSize: 15, fontWeight: 600,
        color: 'var(--ink)', marginBottom: 4,
      }}>{note.title}</div>
      {note.body && (
        <div style={{
          fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 8,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{note.body}</div>
      )}
      {note.photo && !virtualMode && (
        <div style={{
          height: 120, borderRadius: 10, marginBottom: 8,
          backgroundImage: `url(${note.photo})`, backgroundSize: 'cover', backgroundPosition: 'center',
          border: `1px solid var(--fold)`,
        }} />
      )}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(note.tags || []).slice(0, 3).map((t, i) => (
          <Tag key={t.label + i} label={t.label} color={t.color} size="sm" />
        ))}
      </div>
    </button>
  );
});

export { ListScreen };
