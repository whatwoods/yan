// app.jsx — main React shell, routing, global state.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TOKENS, PERSONAS } from './tokens.jsx';
import { Store, autoTitle, autoTags, autoSummary, extractPeople, processNoteWithAI } from './store.jsx';
import { ToastHost, BottomNav, showToast } from './components.jsx';
import { CaptureScreen } from './screen-capture.jsx';
import { ListScreen } from './screen-list.jsx';
import { DetailScreen } from './screen-detail.jsx';
import { YanScreen } from './screen-yan.jsx';
import { SettingsScreen } from './screen-settings.jsx';
import { OnboardingScreen } from './screen-onboard.jsx';
import { SearchScreen } from './screen-search.jsx';
import { TagsScreen } from './screen-tags.jsx';
import { TrashScreen } from './screen-trash.jsx';

export function App() {
  const [notes, setNotes] = useState([]);
  const [settings, setSettings] = useState(() => Store.loadSettings());
  const [route, setRoute] = useState(() => Store.isFirstRun() ? 'onboard' : 'capture');
  const [openNoteId, setOpenNoteId] = useState(null);
  const [filterTag, setFilterTag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [installPrompt, setInstallPrompt] = useState(null);

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const persona = PERSONAS[settings.persona] || PERSONAS.yan;

  // ── Initialize Store (IndexedDB + migration) on mount ─────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Store.init();
        if (cancelled) return;
        setNotes(Store.getNotes());
        setSettings(Store.loadSettings());
      } catch (err) {
        console.error('Store.init() failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Apply font choice via CSS var
  useEffect(() => {
    const T = TOKENS;
    const fontMap = {
      serif: T.fontSerif,
      sans: T.fontSans,
      kai: '"Kaiti SC", "STKaiti", "Noto Serif SC", serif',
    };
    document.body.style.fontFamily = fontMap[settings.font] || T.fontSans;
    document.documentElement.style.setProperty('--font-body', fontMap[settings.font] || T.fontSerif);
  }, [settings.font]);

  // Apply persona color globally (for accent)
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', persona.color);
  }, [persona.color]);

  // Persist settings on change (debounced via effect)
  useEffect(() => {
    if (!loading) Store.saveSettings(settings);
  }, [settings, loading]);

  // ── Note actions ─────────────────────────────────────────
  const saveNewNote = useCallback(async (draft) => {
    const body = draft.body || '';
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
    setNotes(Store.getNotes());
    showToast('已收');

    // AI processing with 1.5s debounce
    setTimeout(async () => {
      const categories = await Store.getCategories();
      const aiResult = await processNoteWithAI(addedNote, categories);
      if (aiResult) {
        await Store.updateNote(addedNote.id, aiResult);
      } else {
        // Rule-based fallback
        await Store.updateNote(addedNote.id, {
          category: addedNote.category || '想法',
          tags: autoTags(body),
          summary: autoSummary(body),
          people: extractPeople(body),
        });
      }
      setNotes(Store.getNotes());
      showToast(`${persona.name}已识其要意`);
    }, 1500);
  }, [settings.autoTag, persona.name]);

  const updateNote = useCallback(async (id, patch) => {
    await Store.updateNote(id, patch);
    setNotes(Store.getNotes());
  }, []);

  const deleteNote = useCallback(async (id) => {
    await Store.softDelete(id);
    setNotes(Store.getNotes());
    showToast('已移入回收站');
  }, []);

  // ── Routing helpers ──────────────────────────────────────
  const openNote = (id) => { setOpenNoteId(id); setRoute('detail'); };
  const closeNote = () => { setOpenNoteId(null); setRoute('list'); };
  const goSearch = () => setRoute('search');
  const goTags = () => setRoute('tags');

  // Browser back button support (a tiny popstate dance)
  useEffect(() => {
    const onPop = () => {
      if (route === 'detail' || route === 'search' || route === 'tags' || route === 'trash') {
        setRoute(route === 'detail' ? 'list' : route === 'trash' ? 'settings' : 'list');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [route]);

  // ── Settings actions ─────────────────────────────────────
  const onResetSeed = async () => {
    if (!confirm('用示例数据覆盖当前所有笔记？')) return;
    // Clear IndexedDB and re-seed
    const all = Store.getAllCachedNotes();
    for (const n of all) {
      await Store.permanentDelete(n.id);
    }
    await Store.init();
    setNotes(Store.getNotes());
    showToast('已重置');
  };
  const onClearAll = async () => {
    if (!confirm('清空全部笔记？此操作不可撤销。')) return;
    const all = Store.getAllCachedNotes();
    for (const n of all) {
      await Store.permanentDelete(n.id);
    }
    setNotes(Store.getNotes());
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

  // ── Render ───────────────────────────────────────────────
  const openNote_ = useMemo(() => notes.find((n) => n.id === openNoteId), [notes, openNoteId]);

  // First-run takeover
  if (route === 'onboard') {
    return (
      <ToastHost>
        <div className="app">
          <OnboardingScreen persona={persona} onStart={() => {
            Store.markRun();
            setRoute('capture');
          }} />
        </div>
      </ToastHost>
    );
  }

  // Tag filter is just a hint passed to ListScreen as initialFilter
  const listInitialFilter = filterTag;

  return (
    <ToastHost>
      <div className="app">
        {route === 'capture' && (
          <CaptureScreen
            notes={notes}
            onSave={saveNewNote}
            onOpenNote={openNote}
            persona={persona}
          />
        )}
        {route === 'list' && (
          <ListScreen
            notes={notes}
            initialFilter={listInitialFilter}
            density={settings.density}
            onOpenNote={openNote}
            onSearch={goSearch}
            onTags={goTags}
            onCompose={() => setRoute('capture')}
          />
        )}
        {route === 'detail' && openNote_ && (
          <DetailScreen
            note={openNote_}
            allNotes={notes}
            onBack={() => setRoute('list')}
            onUpdate={updateNote}
            onDelete={deleteNote}
            persona={persona}
          />
        )}
        {route === 'yan' && (
          <YanScreen notes={notes} persona={persona} />
        )}
        {route === 'settings' && (
          <SettingsScreen
            settings={settings}
            persona={persona}
            totalNotes={notes.length}
            onChange={setSettings}
            onResetSeed={onResetSeed}
            onClearAll={onClearAll}
            onExport={onExport}
            onNavigate={setRoute}
            installPrompt={installPrompt}
          />
        )}
        {route === 'search' && (
          <SearchScreen
            notes={notes}
            onBack={() => setRoute('list')}
            onOpenNote={openNote}
            persona={persona}
          />
        )}
        {route === 'tags' && (
          <TagsScreen
            notes={notes}
            onBack={() => setRoute('list')}
            persona={persona}
            onPickTag={(label) => {
              setFilterTag(label);
              setRoute('list');
            }}
          />
        )}
        {route === 'trash' && (
          <TrashScreen
            onBack={() => setRoute('settings')}
            onRefresh={() => setNotes(Store.getNotes())}
          />
        )}

        {/* Bottom nav — hidden on detail/search/tags/onboard */}
        {['capture', 'list', 'yan', 'settings'].includes(route) && (
          <BottomNav active={route} onChange={(k) => {
            if (k === route) return;
            setOpenNoteId(null);
            setFilterTag(null);
            setRoute(k);
          }} />
        )}
      </div>
    </ToastHost>
  );
}
