// screen-list.jsx — Timeline of all notes, grouped by day, with filter chips and search trigger.

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { TOKENS, dayLabel, timeLabel } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { SealStamp, Tag, KindBadge, ScrHead, showToast, PopoverMenu } from './components.jsx';
import { Store } from './store.jsx';
import { getMeta, setMeta } from './db.js';
import { useSwipeActions, useLongPress } from './gestures.js';
import { buildFilterStats, getTagsForCategory } from './filter-stats.js';

// ── Simple virtual list for 100+ notes ────────────────────────
const VIRTUAL_THRESHOLD = 100;
const ITEM_H_COMFY = 110;
const ITEM_H_COMPACT = 80;
const HEADER_H = 36;
const BUFFER = 6;

const TOP_CAT_COUNT = 5;
const CONTEXT_TAG_COUNT = 6;

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

// ── Filter drawer (bottom sheet) ──────────────────────────────
function FilterDrawer({ open, onClose, categories, catFilter, onCatChange, tagFilter, onTagChange, sortedCatEntries, contextTags, globalTagCounts, tagsByCat }) {
  const T = TOKENS, I = ICONS;
  const [search, setSearch] = useState('');
  const drawerRef = useRef(null);

  // All tags for current category context
  const allContextTags = useMemo(() => {
    if (!catFilter || catFilter === '全部') {
      return Object.entries(globalTagCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([label, v]) => ({ label, color: v.color, count: v.count }));
    }
    const catTags = tagsByCat.get(catFilter);
    if (!catTags) return [];
    return Object.entries(catTags)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([label, v]) => ({ label, color: v.color, count: v.count }));
  }, [catFilter, globalTagCounts, tagsByCat]);

  if (!open) return null;

  const searchLower = search.toLowerCase();
  const filteredCats = sortedCatEntries.filter(([name]) =>
    !search || name.toLowerCase().includes(searchLower)
  );

  const filteredTags = searchLower
    ? allContextTags.filter(t => t.label.toLowerCase().includes(searchLower))
    : allContextTags;

  const highTags = filteredTags.filter(t => t.count >= 3);
  const lowTags = filteredTags.filter(t => t.count < 3);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(31,26,20,.35)',
      }} />
      <div ref={drawerRef} className="scroll" style={{
        position: 'relative', zIndex: 1,
        background: 'var(--paper-light)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        maxHeight: '75vh', overflow: 'auto',
        padding: '0 0 calc(20px + var(--safe-bottom))',
        boxShadow: '0 -8px 32px rgba(31,26,20,.18)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--fold)' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 20px 12px',
        }}>
          <span style={{ fontFamily: T.fontSerif, fontSize: 16, fontWeight: 600 }}>筛选</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ink-mute)', fontSize: 13, fontFamily: T.fontSerif,
          }}>完成</button>
        </div>

        {/* Search */}
        <div style={{ padding: '0 20px 12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--paper)', border: `1px solid var(--fold)`,
            borderRadius: 10, padding: '8px 12px',
          }}>
            <I.search size={16} stroke="var(--ink-fade)" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索分类或标签"
              style={{
                flex: 1, border: 'none', background: 'transparent',
                fontFamily: T.fontSerif, fontSize: 13, color: 'var(--ink)',
                outline: 'none',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--ink-fade)', fontSize: 14, padding: 0, lineHeight: 1,
              }}>×</button>
            )}
          </div>
        </div>

        {/* Categories */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{
            fontSize: 11, color: 'var(--ink-mute)',
            letterSpacing: '.1em', marginBottom: 8,
          }}>分类</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredCats.map(([name, count]) => {
              const cat = categories.find(c => c.name === name);
              const active = name === catFilter;
              return (
                <button key={name} onClick={() => { onCatChange(name); }} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: active ? (cat?.hex ? cat.hex + '14' : 'var(--ink)' + '0e') : 'transparent',
                  border: `1px solid ${active ? (cat?.hex || 'var(--ink)') : 'transparent'}`,
                  borderRadius: 10, padding: '10px 12px',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  fontFamily: T.fontSerif, fontSize: 14,
                  color: active ? (cat?.hex || 'var(--ink)') : 'var(--ink-soft)',
                }}>
                  {cat?.hex && <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: cat.hex, flexShrink: 0,
                  }} />}
                  <span style={{ flex: 1, fontWeight: active ? 600 : 400 }}>{name}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--ink-fade)' }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tags */}
        <div style={{ padding: '0 20px 8px' }}>
          <div style={{
            fontSize: 11, color: 'var(--ink-mute)',
            letterSpacing: '.1em', marginBottom: 8,
          }}>
            标签 {catFilter !== '全部' && <span style={{ opacity: .6 }}>· {catFilter} 下</span>}
          </div>

          {highTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: lowTags.length > 0 ? 12 : 0 }}>
              {highTags.map(t => {
                const active = t.label === tagFilter;
                return (
                  <button key={t.label} onClick={() => onTagChange(active ? '全部' : t.label)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    border: `1px solid ${active ? 'var(--ink)' : 'var(--fold)'}`,
                    background: active ? 'var(--ink)' : 'transparent',
                    color: active ? 'var(--paper)' : 'var(--ink-soft)',
                    padding: '5px 12px', borderRadius: 999, fontSize: 13,
                    fontFamily: T.fontSerif, cursor: 'pointer',
                  }}>
                    <span style={{ opacity: .5, fontSize: 11 }}>#</span>
                    {t.label}
                    <span className="mono" style={{ fontSize: 11, opacity: .6 }}>{t.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {lowTags.length > 0 && (
            <details>
              <summary style={{
                fontSize: 12, color: 'var(--ink-fade)', cursor: 'pointer',
                fontFamily: T.fontSerif, marginBottom: 8,
              }}>低频标签 · {lowTags.length} 个</summary>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {lowTags.map(t => {
                  const active = t.label === tagFilter;
                  return (
                    <button key={t.label} onClick={() => onTagChange(active ? '全部' : t.label)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      border: `1px solid ${active ? 'var(--ink)' : 'var(--fold)'}`,
                      background: active ? 'var(--ink)' : 'transparent',
                      color: active ? 'var(--paper)' : 'var(--ink-soft)',
                      padding: '5px 12px', borderRadius: 999, fontSize: 13,
                      fontFamily: T.fontSerif, cursor: 'pointer',
                    }}>
                      <span style={{ opacity: .5, fontSize: 11 }}>#</span>
                      {t.label}
                      <span className="mono" style={{ fontSize: 11, opacity: .6 }}>{t.count}</span>
                    </button>
                  );
                })}
              </div>
            </details>
          )}

          {highTags.length === 0 && lowTags.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink-fade)', fontFamily: T.fontSerif, padding: '8px 0' }}>
              {search ? '没有匹配的标签' : '暂无标签'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ListScreen({ notes, onOpenNote, onSearch, density = 'comfy', onDensityChange, onCompose, onTags, onCategories, initialFilter, onUpdate, onDelete }) {
  const T = TOKENS, I = ICONS;

  const [filter, setFilter] = useState(initialFilter || '全部');
  const [catFilter, setCatFilter] = useState('全部');
  const [showMenu, setShowMenu] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [categories, setCategories] = useState([]);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [syncing, setSyncing] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);
  const [openSwipeId, setOpenSwipeId] = useState(null);
  const [actionMenu, setActionMenu] = useState(null);
  const scrollRef = useRef(null);
  const pullRef = useRef({ startY: 0, pulling: false });

  // Close any open swipe when scrolling
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => { if (openSwipeId) setOpenSwipeId(null); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [openSwipeId]);

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
        const { initWebDAV, syncAll } = await import('./sync.js');
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

  // Build filter statistics
  const { sortedCatEntries, sortedGlobalTags, globalTagCounts, tagsByCat } = useMemo(
    () => buildFilterStats(notes, categories),
    [notes, categories]
  );

  // Context-aware tags for the tag row
  const contextTags = useMemo(
    () => getTagsForCategory(catFilter, tagsByCat, globalTagCounts),
    [catFilter, tagsByCat, globalTagCounts]
  );

  // Top N categories for the row (excluding "全部")
  const topCats = useMemo(() => {
    return sortedCatEntries.slice(0, TOP_CAT_COUNT);
  }, [sortedCatEntries]);

  const hasMoreCats = sortedCatEntries.length > TOP_CAT_COUNT;

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

  const hasActiveFilter = catFilter !== '全部' || filter !== '全部';

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

      {/* Category tabs — top 5 + 更多 */}
      {categories.length > 0 && (
        <div className="category-tabs">
          <button
            className={`category-tab ${catFilter === '全部' ? 'active' : ''}`}
            onClick={() => { setCatFilter('全部'); }}
            style={{
              color: catFilter === '全部' ? 'var(--ink)' : 'var(--ink-soft)',
              borderColor: catFilter === '全部' ? 'var(--ink)' : 'var(--fold)',
              background: catFilter === '全部' ? 'var(--ink)' : 'transparent',
            }}>
            {catFilter === '全部' ? <span style={{ color: 'var(--paper)' }}>全部</span> : '全部'}
            <span className="mono" style={{ fontSize: 11, opacity: .6 }}>{notes.length}</span>
          </button>
          {topCats.map(([name, count]) => {
            const cat = categories.find(c => c.name === name);
            const active = name === catFilter;
            return (
              <button key={name} className={`category-tab ${active ? 'active' : ''}`}
                onClick={() => setCatFilter(name)}
                style={cat?.hex ? {
                  color: cat.hex,
                  borderColor: active ? cat.hex : 'var(--fold)',
                  background: active ? cat.hex + '18' : 'transparent',
                } : {
                  color: active ? 'var(--ink)' : 'var(--ink-soft)',
                  borderColor: active ? 'var(--ink)' : 'var(--fold)',
                  background: active ? 'var(--ink)' : 'transparent',
                }}>
                {cat?.hex && <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: cat.hex, flexShrink: 0,
                }} />}
                {active && cat?.hex ? (
                  <>
                    <span>{name}</span>
                    <span className="mono" style={{ fontSize: 11, opacity: .7 }}>{count}</span>
                  </>
                ) : (
                  <>
                    {name}
                    <span className="mono" style={{ fontSize: 11, opacity: .6 }}>{count}</span>
                  </>
                )}
              </button>
            );
          })}
          {hasMoreCats && (
            <button className="category-tab" onClick={() => setShowDrawer(true)} style={{
              color: 'var(--ink-fade)',
              borderColor: 'var(--fold)',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <I.filter size={13} /> 更多
            </button>
          )}
        </div>
      )}

      {/* Context-aware tag pills */}
      {contextTags.length > 0 && (
        <div className="scroll" style={{
          flexDirection: 'row', display: 'flex', overflowX: 'auto', overflowY: 'hidden',
          padding: '2px 20px 10px', gap: 6, flexShrink: 0,
        }}>
          {contextTags.map(({ label, color, count }) => {
            const active = label === filter;
            return (
              <button key={label} onClick={() => setFilter(active ? '全部' : label)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                border: `1px solid ${active ? 'var(--ink)' : 'var(--fold)'}`,
                background: active ? 'var(--ink)' : 'transparent',
                color: active ? 'var(--paper)' : 'var(--ink-soft)',
                padding: '5px 12px', borderRadius: 999, fontSize: 13,
                fontFamily: T.fontSerif, whiteSpace: 'nowrap', flexShrink: 0,
                cursor: 'pointer',
              }}>
                <span style={{ opacity: .5, fontSize: 11 }}>#</span>
                {label}
                <span className="mono" style={{ fontSize: 11, opacity: .6 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filter state bar */}
      {hasActiveFilter && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 20px 8px', flexShrink: 0,
          fontFamily: T.fontSerif, fontSize: 13, color: 'var(--ink-mute)',
        }}>
          {catFilter !== '全部' && (
            <>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'var(--paper-light)', border: `1px solid var(--fold)`,
                borderRadius: 8, padding: '3px 10px', fontSize: 12,
              }}>
                {catMap.get(catFilter) && <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: catMap.get(catFilter), flexShrink: 0,
                }} />}
                {catFilter}
                <button onClick={() => setCatFilter('全部')} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--ink-fade)', fontSize: 14, padding: 0, lineHeight: 1, marginLeft: 2,
                }}>×</button>
              </span>
              {filter !== '全部' && <span style={{ color: 'var(--ink-fade)', fontSize: 12 }}>/</span>}
            </>
          )}
          {filter !== '全部' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'var(--paper-light)', border: `1px solid var(--fold)`,
              borderRadius: 8, padding: '3px 10px', fontSize: 12,
            }}>
              #{filter}
              <button onClick={() => setFilter('全部')} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--ink-fade)', fontSize: 14, padding: 0, lineHeight: 1, marginLeft: 2,
              }}>×</button>
            </span>
          )}
          <button onClick={() => { setFilter('全部'); setCatFilter('全部'); }} style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: 'var(--ink-fade)', cursor: 'pointer', fontSize: 12,
            fontFamily: T.fontSerif,
          }}>清除</button>
        </div>
      )}

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
            {hasActiveFilter ? (
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
                  <NoteCard note={item.note} pad={item.pad} catColor={catMap.get(item.note.category)} onOpen={() => onOpenNote(item.note.id)} virtualMode openSwipeId={openSwipeId} onSwipeChange={(id, open) => setOpenSwipeId(open ? id : null)} onUpdate={onUpdate} onDelete={onDelete} onLongPress={setActionMenu} />
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
                  {pinned.map((it) => <NoteCard key={it.id} note={it} pad={pad} catColor={catMap.get(it.category)} onOpen={() => onOpenNote(it.id)} openSwipeId={openSwipeId} onSwipeChange={(id, open) => setOpenSwipeId(open ? id : null)} onUpdate={onUpdate} onDelete={onDelete} onLongPress={setActionMenu} />)}
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
                    {remain.map((it) => <NoteCard key={it.id} note={it} pad={pad} catColor={catMap.get(it.category)} onOpen={() => onOpenNote(it.id)} openSwipeId={openSwipeId} onSwipeChange={(id, open) => setOpenSwipeId(open ? id : null)} onUpdate={onUpdate} onDelete={onDelete} onLongPress={setActionMenu} />)}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* PopoverMenu */}
      {actionMenu && (
        <PopoverMenu
          x={actionMenu.x}
          y={actionMenu.y}
          items={[
            {
              icon: <I.pin size={16} fill={actionMenu.note.pinned ? 'currentColor' : 'none'} />,
              label: actionMenu.note.pinned ? '取消钉住' : '钉住',
              onSelect: () => onUpdate?.(actionMenu.note.id, { pinned: !actionMenu.note.pinned }),
            },
            {
              icon: <I.pen size={16} />,
              label: '复制',
              onSelect: async () => {
                if (actionMenu.note?.body) {
                  try { await navigator.clipboard.writeText(actionMenu.note.body); showToast('已复制'); }
                  catch { showToast('复制失败'); }
                }
              },
            },
            ...(navigator.share ? [{
              icon: <I.globe size={16} />,
              label: '分享',
              onSelect: () => {
                navigator.share({ title: actionMenu.note.title, text: actionMenu.note.body }).catch(() => {});
              },
            }] : []),
            {
              icon: <I.trash size={16} />,
              label: '删除',
              danger: true,
              onSelect: () => onDelete?.(actionMenu.note.id),
            },
          ]}
          onClose={() => setActionMenu(null)}
        />
      )}

      {/* Filter drawer */}
      <FilterDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        categories={categories}
        catFilter={catFilter}
        onCatChange={(cat) => { setCatFilter(cat); setShowDrawer(false); }}
        tagFilter={filter}
        onTagChange={(tag) => { setFilter(tag); }}
        sortedCatEntries={sortedCatEntries}
        contextTags={contextTags}
        globalTagCounts={globalTagCounts}
        tagsByCat={tagsByCat}
      />

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

const NoteCard = React.memo(function NoteCard({ note, pad, catColor, onOpen, virtualMode, openSwipeId, onSwipeChange, onUpdate, onDelete, onLongPress }) {
  const T = TOKENS;
  const cardRef = useRef(null);
  const isOpen = openSwipeId === note.id;
  const recentSwipeRef = useRef(false);

  const { reset, isSwiping } = useSwipeActions(cardRef, {
    onDelete: () => onDelete?.(note.id),
    onPin: () => onUpdate?.(note.id, { pinned: !note.pinned }),
    isOpen,
    onOpenChange: (open) => {
      onSwipeChange?.(note.id, open);
      recentSwipeRef.current = true;
      setTimeout(() => { recentSwipeRef.current = false; }, 250);
    },
    maxSwipe: 100,
    threshold: 60,
    deleteThreshold: true,
  });

  const { isLongPressFired } = useLongPress(cardRef, (e) => {
    const t = e.touches?.[0] || e;
    onLongPress?.({ x: t.clientX, y: t.clientY, note });
  }, { delay: 500, moveTolerance: 10 });

  // Close this swipe when another card opens
  useEffect(() => {
    if (!isOpen && openSwipeId !== null) {
      reset();
    }
  }, [openSwipeId, isOpen]);

  const handleClick = () => {
    if (recentSwipeRef.current || isLongPressFired()) return;
    if (isOpen) { reset(); return; }
    onOpen();
  };

  const tags = note.tags || [];
  const maxTags = 2;
  const visibleTags = tags.slice(0, maxTags);
  const extraCount = tags.length - maxTags;

  return (
    <div className="swipe-row" style={{ position: 'relative', overflow: 'hidden', borderRadius: 14 }}>
      <div className="swipe-actions" style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 100,
        display: 'flex', alignItems: 'stretch',
      }}>
        <button onClick={(e) => { e.stopPropagation(); onUpdate?.(note.id, { pinned: !note.pinned }); reset(); }}
          className="swipe-btn pin">
          <ICONS.pin size={18} fill={note.pinned ? 'currentColor' : 'none'} />
          <span>{note.pinned ? '取钉' : '钉住'}</span>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete?.(note.id); }}
          className="swipe-btn danger">
          <ICONS.trash size={18} />
          <span>删除</span>
        </button>
      </div>
      <button ref={cardRef} onClick={handleClick} className="swipe-card" style={{
        background: 'var(--paper-light)',
        border: `1px solid var(--fold)`,
        borderRadius: 14, padding: pad,
        cursor: 'pointer',
        transition: 'transform .25s cubic-bezier(.2,.8,.2,1)',
        position: 'relative',
        paddingLeft: catColor ? pad + 6 : pad,
        textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit',
        willChange: 'transform',
      }}>
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
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {visibleTags.map((t, i) => (
              <Tag key={t.label + i} label={t.label} color={t.color} size="sm" />
            ))}
            {extraCount > 0 && (
              <span style={{
                fontSize: 11, color: 'var(--ink-fade)',
                fontFamily: T.fontSerif, whiteSpace: 'nowrap',
              }}>+{extraCount}</span>
            )}
          </div>
        )}
      </button>
    </div>
  );
});

export { ListScreen };
