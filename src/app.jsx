// app.jsx — main React shell, routing, global state.

import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense, useSyncExternalStore } from 'react';
import { TOKENS, PERSONAS } from './tokens.jsx';
import { Store, autoTitle, autoTags, autoSummary, extractPeople, processNoteWithAI } from './store.jsx';
import { ToastHost, BottomNav, showToast } from './components.jsx';
import { CaptureScreen } from './screen-capture.jsx';
import { getAIConfig, getModelAssignment, isAIConfigured } from './ai.js';

const ListScreen = React.lazy(() => import('./screen-list.jsx').then(m => ({ default: m.ListScreen })));
const DetailScreen = React.lazy(() => import('./screen-detail.jsx').then(m => ({ default: m.DetailScreen })));
const YanScreen = React.lazy(() => import('./screen-yan.jsx').then(m => ({ default: m.YanScreen })));
const SettingsScreen = React.lazy(() => import('./screen-settings.jsx').then(m => ({ default: m.SettingsScreen })));
const SearchScreen = React.lazy(() => import('./screen-search.jsx').then(m => ({ default: m.SearchScreen })));
const TagsScreen = React.lazy(() => import('./screen-tags.jsx').then(m => ({ default: m.TagsScreen })));
const TrashScreen = React.lazy(() => import('./screen-trash.jsx').then(m => ({ default: m.TrashScreen })));
const AISettingsScreen = React.lazy(() => import('./screen-settings-ai.jsx').then(m => ({ default: m.AISettingsScreen })));
const SyncSettingsScreen = React.lazy(() => import('./screen-settings-sync.jsx').then(m => ({ default: m.SyncSettingsScreen })));
const CategoriesSettingsScreen = React.lazy(() => import('./screen-settings-categories.jsx').then(m => ({ default: m.CategoriesSettingsScreen })));

export function App() {
  const notes = useSyncExternalStore(Store.subscribe, Store.getNotes);
  const persona = PERSONAS.yan;
  const [settings, setSettings] = useState(() => Store.loadSettings());
  const [route, setRoute] = useState('capture');
  const [showSetupHint, setShowSetupHint] = useState(() => Store.isFirstRun());
  const [aiConfigured, setAiConfigured] = useState(false);
  const [openNoteId, setOpenNoteId] = useState(null);
  const [filterTag, setFilterTag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoExpandInput, setAutoExpandInput] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const appRef = useRef(null);

  // ── Keyboard-aware viewport height ─────────────────────────
  useEffect(() => {
    const el = appRef.current;
    if (!el || !window.visualViewport) return;
    const update = () => {
      el.style.setProperty('--app-height', window.visualViewport.height + 'px');
    };
    update();
    window.visualViewport.addEventListener('resize', update);
    window.visualViewport.addEventListener('scroll', update);
    return () => {
      window.visualViewport.removeEventListener('resize', update);
      window.visualViewport.removeEventListener('scroll', update);
    };
  }, []);

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ── Initialize Store (IndexedDB + migration) on mount ─────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Store.init();
        if (cancelled) return;
        const [aiConfig, assignment] = await Promise.all([getAIConfig(), getModelAssignment()]);
        if (cancelled) return;
        const ready = isAIConfigured(aiConfig, assignment);
        setSettings(Store.loadSettings());
        setAiConfigured(ready);
        if (ready) {
          Store.markRun();
          setShowSetupHint(false);
        }
      } catch (err) {
        console.error('Store.init() failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist settings on change (debounced via effect)
  useEffect(() => {
    if (!loading) Store.saveSettings(settings);
  }, [settings, loading]);

  // ── Note actions ─────────────────────────────────────────
  const saveNewNote = useCallback(async (draft) => {
    const body = draft.body || '';
    if (showSetupHint) { Store.markRun(); setShowSetupHint(false); }
    const note = {
      kind: draft.kind || 'text',
      title: autoTitle(body),
      body,
      tags: settings.autoTag ? autoTags(body) : [],
      summary: '',
      people: extractPeople(body),
      pinned: false,
      // backward compat fields for screens
      photo: draft.photo || null,
      duration: draft.duration || null,
      createdAt: Date.now(),
    };

    const addedNote = await Store.addNote(note);
    showToast('已收');

    // AI processing with 1.5s debounce
    setTimeout(async () => {
      const categories = await Store.getCategories();
      let aiResult = null;
      if (aiConfigured) {
        aiResult = await processNoteWithAI(addedNote, categories, Store.getNotes());
      }
      if (aiResult) {
        const patch = settings.autoTag ? aiResult : { ...aiResult, tags: addedNote.tags || [] };
        await Store.updateNote(addedNote.id, patch);
      } else {
        // Rule-based fallback
        await Store.updateNote(addedNote.id, {
          category: addedNote.category || '想法',
          tags: settings.autoTag ? autoTags(body) : (addedNote.tags || []),
          summary: autoSummary(body),
          people: extractPeople(body),
        });
      }

      showToast('砚已识其要意');
    }, 1500);
  }, [aiConfigured, settings.autoTag, showSetupHint]);

  const updateNote = useCallback(async (id, patch) => {
    await Store.updateNote(id, patch);
  }, []);

  const deleteNote = useCallback(async (id) => {
    await Store.softDelete(id);
    showToast('已移入回收站');
  }, []);

  // ── Routing helpers ──────────────────────────────────────
  const openNote = (id) => { setOpenNoteId(id); setRoute('detail'); };
  const closeNote = () => { setOpenNoteId(null); setFilterTag(null); skipPushRef.current = true; setRoute('list'); };
  const goSearch = () => setRoute('search');
  const goTags = () => setRoute('tags');

  // ── Browser back button support ───────────────────────────
  const skipPushRef = useRef(false);
  const MAIN_ROUTES = ['capture', 'list', 'yan', 'settings'];

  // Push history entry when navigating to a sub-page
  useEffect(() => {
    if (skipPushRef.current) { skipPushRef.current = false; return; }
    if (!MAIN_ROUTES.includes(route)) {
      history.pushState({ route }, '');
    }
  }, [route]);

  // Handle Android/browser back button
  useEffect(() => {
    const onPop = (e) => {
      if (MAIN_ROUTES.includes(route)) return;
      const target = route === 'detail' ? 'list' : route === 'trash' ? 'settings'
        : route.startsWith('settings-') ? 'settings' : 'list';
      skipPushRef.current = true;
      setRoute(target);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [route]);

  // ── Settings actions ─────────────────────────────────────
  const onResetSeed = async () => {
    if (!confirm('用示例数据覆盖当前所有笔记？')) return;
    const all = Store.getAllCachedNotes();
    await Store.batch(async () => {
      for (const n of all) {
        await Store.permanentDelete(n.id);
      }
      await Store.init();
    });
    showToast('已重置');
  };
  const onClearAll = async () => {
    if (!confirm('清空全部笔记？此操作不可撤销。')) return;
    const all = Store.getAllCachedNotes();
    await Store.batch(async () => {
      for (const n of all) {
        await Store.permanentDelete(n.id);
      }
    });
    showToast('已清空');
  };
  const onExport = () => {
    const md = notes.map((n) => {
      const date = new Date(n.createdAt).toISOString().slice(0, 16).replace('T', ' ');
      const tagLine = (n.tags || []).map((t) => `#${t.label}`).join(' ');
      return `# ${n.title}\n\n_${date} · ${n.kind}_  ${tagLine ? '\n\n' + tagLine : ''}\n\n${n.body}\n`;
    }).join('\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `笔记-导出-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleAIConfigChange = useCallback((config, assignment) => {
    const ready = isAIConfigured(config, assignment);
    setAiConfigured(ready);
    if (ready) {
      Store.markRun();
      setShowSetupHint(false);
    }
  }, []);

  // ── Derived state (must be before any early returns) ──────
  const openNote_ = useMemo(() => notes.find((n) => n.id === openNoteId), [notes, openNoteId]);

  // Compute prev/next notes (and their navigation callbacks) for swipe navigation.
  // Pass full note objects so the detail screen can show title peeks during drag.
  const { onPrev, onNext, prevNote, nextNote } = useMemo(() => {
    if (!openNoteId || !notes.length) {
      return { onPrev: null, onNext: null, prevNote: null, nextNote: null };
    }
    const idx = notes.findIndex(n => n.id === openNoteId);
    const prev = idx > 0 ? notes[idx - 1] : null;
    const next = idx < notes.length - 1 ? notes[idx + 1] : null;
    return {
      onPrev: prev ? () => setOpenNoteId(prev.id) : null,
      onNext: next ? () => setOpenNoteId(next.id) : null,
      prevNote: prev,
      nextNote: next,
    };
  }, [notes, openNoteId]);

  // ── Loading screen ───────────────────────────────────────
  if (loading) {
    return (
      <ToastHost>
        <div className="app" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', fontFamily: TOKENS.fontSerif,
        }}>
          <div style={{ textAlign: 'center', color: 'var(--ink-mute)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>砚</div>
            <div style={{ fontSize: 13 }}>正在开启笔记…</div>
          </div>
        </div>
      </ToastHost>
    );
  }

  // Tag filter is just a hint passed to ListScreen as initialFilter
  const listInitialFilter = filterTag;

  return (
    <ToastHost>
      <div className="app" ref={appRef}>
        {route === 'capture' && (
          <CaptureScreen
            notes={notes}
            onSave={saveNewNote}
            onOpenNote={openNote}
            showSetupHint={showSetupHint && !aiConfigured}
            onDismissSetup={() => { Store.markRun(); setShowSetupHint(false); }}
            onGoSettings={() => { Store.markRun(); setShowSetupHint(false); setRoute('settings-ai'); }}
            autoExpand={autoExpandInput}
            onAutoExpanded={() => setAutoExpandInput(false)}
          />
        )}
        <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--font-serif)', color: 'var(--ink-mute)' }}>加载中…</div>}>
          {route === 'list' && (
            <ListScreen
              notes={notes}
              initialFilter={listInitialFilter}
              density={settings.density}
              onDensityChange={(d) => setSettings({ ...settings, density: d })}
              onOpenNote={openNote}
              onSearch={goSearch}
              onTags={goTags}
              onCategories={() => setRoute('settings-categories')}
              onCompose={() => { setAutoExpandInput(true); setRoute('capture'); }}
              onUpdate={updateNote}
              onDelete={deleteNote}
            />
          )}
          {route === 'detail' && openNote_ && (
            <DetailScreen
              note={openNote_}
              allNotes={notes}
              onBack={closeNote}
              onUpdate={updateNote}
              onDelete={deleteNote}
              onPrev={onPrev}
              onNext={onNext}
              prevNote={prevNote}
              nextNote={nextNote}
            />
          )}
          {route === 'yan' && (
            <YanScreen
              notes={notes}
              persona={persona}
              onNavigate={setRoute}
            />
          )}
          {route === 'settings' && (
            <SettingsScreen
              settings={settings}
              totalNotes={notes.length}
              onChange={setSettings}
              onResetSeed={onResetSeed}
              onClearAll={onClearAll}
              onExport={onExport}
              onNavigate={setRoute}
              installPrompt={installPrompt}
              onAIConfigChange={handleAIConfigChange}
            />
          )}
          {route === 'search' && (
            <SearchScreen
              notes={notes}
              onBack={() => { setFilterTag(null); setRoute('list'); }}
              onOpenNote={openNote}
            />
          )}
          {route === 'tags' && (
            <TagsScreen
              notes={notes}
              onBack={() => { setFilterTag(null); setRoute('list'); }}
              onPickTag={(label) => {
                setFilterTag(label);
                setRoute('list');
              }}
            />
          )}
          {route === 'trash' && (
            <TrashScreen
              onBack={() => setRoute('settings')}
            />
          )}
          {route === 'settings-ai' && (
            <AISettingsScreen
              onBack={() => setRoute('settings')}
              settings={settings}
              onSettingsChange={setSettings}
              onAIConfigChange={handleAIConfigChange}
            />
          )}
          {route === 'settings-sync' && (
            <SyncSettingsScreen
              onBack={() => setRoute('settings')}
              settings={settings}
            />
          )}
          {route === 'settings-categories' && (
            <CategoriesSettingsScreen
              onBack={() => setRoute('settings')}
            />
          )}
        </Suspense>

        {/* Bottom nav — hidden on detail/search/tags/onboard */}
        {['capture', 'list', 'yan', 'settings'].includes(route) && (
          <BottomNav active={route} onChange={(k) => {
            if (k === route) return;
            setOpenNoteId(null);
            setFilterTag(null);
            skipPushRef.current = true;
            setRoute(k);
          }} />
        )}
      </div>
    </ToastHost>
  );
}
