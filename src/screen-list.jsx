// screen-list.jsx — Timeline of all notes, grouped by day, with filter chips and search trigger.

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { TOKENS, dayLabel, timeLabel } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { SealStamp, Tag, KindBadge, ScrHead, showToast } from './components.jsx';
import { Store } from './store.jsx';
import { getMeta, setMeta } from './db.js';
import { initWebDAV, syncAll } from './sync.js';

function ListScreen({ notes, onOpenNote, onSearch, density = 'comfy', onCompose, onTags, initialFilter }) {
  const T = TOKENS, I = ICONS;

  const [filter, setFilter] = useState(initialFilter || '全部');
  const [catFilter, setCatFilter] = useState('全部');
  const [categories, setCategories] = useState([]);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [syncing, setSyncing] = useState(false);
  const scrollRef = useRef(null);
  const pullRef = useRef({ startY: 0, pulling: false });

  useEffect(() => { if (initialFilter) setFilter(initialFilter); }, [initialFilter]);

  // Load sync status on mount and periodically
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const status = await getMeta('syncStatus');
        if (status) setSyncStatus(status);
      } catch {}
    };
    loadStatus();
    const interval = setInterval(loadStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Pull-to-refresh
  const handleTouchStart = useCallback((e) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      pullRef.current.startY = e.touches[0].clientY;
      pullRef.current.pulling = true;
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!pullRef.current.pulling) return;
    pullRef.current.pulling = false;
  }, []);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const settings = Store.loadSettings?.() || {};
      const savedWebdav = await getMeta('webdavConfig');
      if (savedWebdav?.server && savedWebdav?.username) {
        initWebDAV(savedWebdav);
        const allNotes = Store.getAllCachedNotes();
        const result = await syncAll(allNotes);
        if (result.error) {
          showToast('同步失败 · 请检查 WebDAV 配置');
        } else {
          await setMeta('lastSync', new Date().toISOString());
          showToast('已同步');
        }
      } else {
        showToast('请先配置 WebDAV');
      }
    } catch {
      showToast('同步失败 · 请检查 WebDAV 配置');
    } finally {
      setSyncing(false);
      const status = await getMeta('syncStatus');
      if (status) setSyncStatus(status);
    }
  }, [syncing]);

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

  const allTags = useMemo(() => {
    const counts = {};
    notes.forEach((n) => (n.tags || []).forEach((t) => {
      counts[t.label] = { count: (counts[t.label]?.count || 0) + 1, color: t.color };
    }));
    return Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([label, v]) => ({ label, color: v.color }));
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

  // Pinned at the very top
  const pinned = filtered.filter((n) => n.pinned);

  return (
    <div className="screen paper">
      <ScrHead title="笔记本" right={
        <>
          {SyncIcon}
          <button className="icon-btn" onClick={onSearch} aria-label="搜索"><I.search size={20} /></button>
          <button className="icon-btn" onClick={onTags} aria-label="标签"><I.tag size={20} /></button>
        </>
      } />

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
        {[{ label: '全部', color: null }, ...allTags].map(({ label, color }) => {
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
      </div>

      {/* Notes */}
      <div ref={scrollRef} className="scroll" style={{ flex: 1, padding: '0 20px 88px' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}>
        {filtered.length === 0 && (
          <div style={{
            background: 'var(--paper-light)', border: `1px dashed var(--fold)`,
            borderRadius: 14, padding: '40px 20px', textAlign: 'center',
            fontFamily: T.fontSerif, color: 'var(--ink-mute)',
            marginTop: 30,
          }}>
            <SealStamp size={50} rotate={-6} />
            <div style={{ marginTop: 16, fontSize: 16 }}>这里空空如也</div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ink-fade)' }}>去「记」页落下第一笔</div>
          </div>
        )}

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
              {pinned.map((it) => <NoteCard key={it.id} note={it} pad={pad} catColor={categories.find(c => c.name === it.category)?.hex} onOpen={() => onOpenNote(it.id)} />)}
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
                {remain.map((it) => <NoteCard key={it.id} note={it} pad={pad} catColor={categories.find(c => c.name === it.category)?.hex} onOpen={() => onOpenNote(it.id)} />)}
              </div>
            </div>
          );
        })}
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

function NoteCard({ note, pad, catColor, onOpen }) {
  const T = TOKENS;
  return (
    <div onClick={onOpen} style={{
      background: 'var(--paper-light)',
      border: `1px solid var(--fold)`,
      borderRadius: 14, padding: pad,
      cursor: 'pointer',
      transition: 'transform .12s, box-shadow .12s',
      position: 'relative',
      paddingLeft: catColor ? pad + 6 : pad,
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
      {note.photo && (
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
    </div>
  );
}

export { ListScreen };
