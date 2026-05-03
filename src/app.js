// app.js — main React shell, routing, global state.

function App() {
  const { useState, useEffect, useMemo, useCallback } = React;
  const [notes, setNotes] = useState(() => window.Store.loadNotes());
  const [settings, setSettings] = useState(() => window.Store.loadSettings());
  const [route, setRoute] = useState(() => window.Store.isFirstRun() ? 'onboard' : 'capture');
  const [openNoteId, setOpenNoteId] = useState(null);
  const [filterTag, setFilterTag] = useState(null);

  const persona = window.PERSONAS[settings.persona] || window.PERSONAS.yan;

  // Apply font choice via CSS var
  useEffect(() => {
    const T = window.TOKENS;
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

  // Persist settings on change
  useEffect(() => { window.Store.saveSettings(settings); }, [settings]);

  // ── Note actions ─────────────────────────────────────────
  const saveNewNote = useCallback((draft) => {
    const body = draft.body || '';
    const note = {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      kind: draft.kind || 'text',
      title: window.autoTitle(body),
      body,
      photo: draft.photo || null,
      duration: draft.duration || null,
      tags: settings.autoTag ? window.autoTags(body) : [],
      summary: '', // will fill async
      people: window.extractPeople(body),
      createdAt: Date.now(),
      pinned: false,
    };
    setNotes((prev) => {
      const next = [note, ...prev];
      window.Store.saveNotes(next);
      return next;
    });

    // Simulate background AI: refine summary after a short delay
    setTimeout(() => {
      setNotes((prev) => {
        const idx = prev.findIndex((n) => n.id === note.id);
        if (idx === -1) return prev;
        const updated = { ...prev[idx], summary: window.autoSummary(body) };
        const next = [...prev]; next[idx] = updated;
        window.Store.saveNotes(next);
        return next;
      });
      window.showToast?.(`${persona.name}已识其要意`);
    }, 900);

    window.showToast?.('已收');
  }, [settings.autoTag, persona.name]);

  const updateNote = useCallback((id, patch) => {
    setNotes((prev) => {
      const next = prev.map((n) => n.id === id ? { ...n, ...patch } : n);
      window.Store.saveNotes(next);
      return next;
    });
  }, []);

  const deleteNote = useCallback((id) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      window.Store.saveNotes(next);
      return next;
    });
    window.showToast?.('已删');
  }, []);

  // ── Routing helpers ──────────────────────────────────────
  const openNote = (id) => { setOpenNoteId(id); setRoute('detail'); };
  const closeNote = () => { setOpenNoteId(null); setRoute('list'); };
  const goSearch = () => setRoute('search');
  const goTags = () => setRoute('tags');

  // Browser back button support (a tiny popstate dance)
  useEffect(() => {
    const onPop = () => {
      if (route === 'detail' || route === 'search' || route === 'tags') {
        setRoute(route === 'detail' ? 'list' : 'list');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [route]);

  // ── Settings actions ─────────────────────────────────────
  const onResetSeed = () => {
    if (!confirm('用示例数据覆盖当前所有笔记？')) return;
    localStorage.removeItem('biji.notes.v1');
    const fresh = window.Store.loadNotes();
    setNotes(fresh);
    window.showToast?.('已重置');
  };
  const onClearAll = () => {
    if (!confirm('清空全部笔记？此操作不可撤销。')) return;
    window.Store.saveNotes([]);
    setNotes([]);
    window.showToast?.('已清空');
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

  // ── Render ───────────────────────────────────────────────
  const openNote_ = useMemo(() => notes.find((n) => n.id === openNoteId), [notes, openNoteId]);

  // First-run takeover
  if (route === 'onboard') {
    return (
      <window.ToastHost>
        <div className="app">
          <window.OnboardingScreen persona={persona} onStart={() => {
            window.Store.markRun();
            setRoute('capture');
          }} />
        </div>
      </window.ToastHost>
    );
  }

  // Tag filter is just a hint passed to ListScreen as initialFilter
  const listInitialFilter = filterTag;

  return (
    <window.ToastHost>
      <div className="app">
        {route === 'capture' && (
          <window.CaptureScreen
            notes={notes}
            onSave={saveNewNote}
            onOpenNote={openNote}
            persona={persona}
          />
        )}
        {route === 'list' && (
          <window.ListScreen
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
          <window.DetailScreen
            note={openNote_}
            allNotes={notes}
            onBack={() => setRoute('list')}
            onUpdate={updateNote}
            onDelete={deleteNote}
            persona={persona}
          />
        )}
        {route === 'yan' && (
          <window.YanScreen notes={notes} persona={persona} />
        )}
        {route === 'settings' && (
          <window.SettingsScreen
            settings={settings}
            persona={persona}
            totalNotes={notes.length}
            onChange={setSettings}
            onResetSeed={onResetSeed}
            onClearAll={onClearAll}
            onExport={onExport}
          />
        )}
        {route === 'search' && (
          <window.SearchScreen
            notes={notes}
            onBack={() => setRoute('list')}
            onOpenNote={openNote}
            persona={persona}
          />
        )}
        {route === 'tags' && (
          <window.TagsScreen
            notes={notes}
            onBack={() => setRoute('list')}
            persona={persona}
            onPickTag={(label) => {
              setFilterTag(label);
              setRoute('list');
            }}
          />
        )}

        {/* Bottom nav — hidden on detail/search/tags/onboard */}
        {['capture', 'list', 'yan', 'settings'].includes(route) && (
          <window.BottomNav active={route} onChange={(k) => {
            if (k === route) return;
            setOpenNoteId(null);
            setFilterTag(null);
            setRoute(k);
          }} />
        )}
      </div>
    </window.ToastHost>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
