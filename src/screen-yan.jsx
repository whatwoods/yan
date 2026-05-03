// screen-yan.jsx — 砚: insights main + chat overlay (FAB).

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { TOKENS } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { SealStamp, BrushTitle, Tag } from './components.jsx';
import { askYan } from './store.jsx';
import { generateInsight, getAIConfig, getModelAssignment } from './ai.js';
import { getMeta, setMeta } from './db.js';
import { Store } from './store.jsx';
import { generateCuratorSuggestions, shouldRunCurator, markCuratorRun, applyCuratorSuggestion, rejectCuratorSuggestion } from './curator.js';
import { askYanRAG } from './rag.js';

export function YanScreen({ notes, persona }) {
  const T = TOKENS, I = ICONS;
  const [chatOpen, setChatOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [existingTags, setExistingTags] = useState([]);

  useEffect(() => {
    Store.getCategories().then(setCategories).catch(() => {});
    const counts = {};
    notes.forEach(n => (n.tags || []).forEach(t => {
      const label = typeof t === 'string' ? t : t.label;
      counts[label] = (counts[label] || 0) + 1;
    }));
    setExistingTags(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k));
  }, [notes]);

  return (
    <div className="screen paper">
      {/* Header */}
      <div className="scr-head" style={{ paddingBottom: 12, borderBottom: `1px solid var(--fold)`, background: 'var(--paper-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SealStamp size={36} text={persona.mark} color={persona.color} />
          <div>
            <BrushTitle size={24}>{persona.name}</BrushTitle>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 2 }}>
              已读你 {notes.length} 篇笔记 · {persona.desc}
            </div>
          </div>
        </div>
        <button className="icon-btn" aria-label="更多"><I.more size={20} /></button>
      </div>

      <YanInsightBody notes={notes} persona={persona} categories={categories} existingTags={existingTags} />

      {/* FAB to open chat */}
      {!chatOpen && (
        <button onClick={() => setChatOpen(true)} aria-label="问砚"
          style={{
            position: 'absolute', right: 20, bottom: 22,
            padding: '12px 20px 12px 16px',
            borderRadius: 999,
            background: persona.color, color: '#fff',
            border: 'none', display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(184,68,58,.38)',
            fontFamily: T.fontSerif, fontSize: 15, fontWeight: 700, letterSpacing: '.04em',
          }}>
          <I.chat size={18} />
          <span>问{persona.name}</span>
        </button>
      )}

      {/* Chat sheet */}
      {chatOpen && (
        <>
          <div className="sheet-mask" onClick={() => setChatOpen(false)} />
          <div className="sheet" style={{ height: '88%' }}>
            <div className="sheet-grip" />
            <div style={{
              padding: '0 16px 10px',
              borderBottom: `1px solid var(--fold)`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <SealStamp size={28} text={persona.mark} color={persona.color} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.fontSerif, fontSize: 16, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1 }}>
                  问{persona.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
                  翻你的记忆库 · {notes.length} 篇
                </div>
              </div>
              <button className="icon-btn" onClick={() => setChatOpen(false)} aria-label="关闭">
                <I.close size={20} />
              </button>
            </div>
            <YanChatBody notes={notes} persona={persona} categories={categories} existingTags={existingTags} />
          </div>
        </>
      )}
    </div>
  );
}

function YanInsightBody({ notes, persona, categories }) {
  const T = TOKENS, I = ICONS;

  const stats = useMemo(() => computeStats(notes), [notes]);

  // Monthly AI insight state
  const now = new Date();
  const insightKey = `insight:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const monthNotes = useMemo(() => {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return notes.filter(n => n.createdAt >= monthStart);
  }, [notes]);

  const [aiInsight, setAiInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState(false);
  const [aiReady, setAiReady] = useState(false);

  // Load persisted insight and check AI config on mount
  useEffect(() => {
    (async () => {
      const [saved, config] = await Promise.all([
        getMeta(insightKey),
        getAIConfig(),
      ]);
      if (saved) setAiInsight(saved);
      const assignment = await getModelAssignment();
      setAiReady(!!(config.apiKey && config.endpoint && (config.defaultModel || assignment?.ask)));
    })();
  }, [insightKey]);

  const handleGenerateInsight = useCallback(async () => {
    if (monthNotes.length === 0) return;
    setInsightLoading(true);
    setInsightError(false);
    try {
      const text = await generateInsight(monthNotes, monthLabel);
      if (text) {
        const insight = { text, generated_at: new Date().toISOString(), noteCount: monthNotes.length };
        await setMeta(insightKey, insight);
        setAiInsight(insight);
      } else {
        setInsightError(true);
      }
    } catch {
      setInsightError(true);
    } finally {
      setInsightLoading(false);
    }
  }, [monthNotes, monthLabel, insightKey]);

  // Curator state
  const [curatorSuggestions, setCuratorSuggestions] = useState([]);
  const [curatorLoading, setCuratorLoading] = useState(false);

  // Check if curator should run on mount or when notes change
  useEffect(() => {
    (async () => {
      if (!aiReady) return;
      const shouldRun = await shouldRunCurator(notes);
      if (!shouldRun) return;
      setCuratorLoading(true);
      try {
        const suggestions = await generateCuratorSuggestions(notes, categories);
        setCuratorSuggestions(suggestions);
        await markCuratorRun(notes);
      } catch {
        // silent fail
      } finally {
        setCuratorLoading(false);
      }
    })();
  }, [notes, aiReady]);

  const handleApplyCurator = useCallback(async (suggestion) => {
    await applyCuratorSuggestion(suggestion, notes, async (id, patch) => {
      // updateFn is called for each note that needs updating
      // The parent will refresh notes from store
      const { Store } = await import('./store.jsx');
      await Store.updateNote(id, patch);
    });
    setCuratorSuggestions(prev => prev.filter(s => s !== suggestion));
    // Trigger a page-level refresh by dispatching a custom event
    window.dispatchEvent(new CustomEvent('notes-updated'));
  }, [notes]);

  const handleRejectCurator = useCallback(async (suggestion) => {
    await rejectCuratorSuggestion(suggestion);
    setCuratorSuggestions(prev => prev.filter(s => s !== suggestion));
  }, []);

  return (
    <div className="scroll" style={{ flex: 1, padding: '14px 16px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="mono" style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
          本月 · {stats.monthLabel}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-fade)' }}>
          {stats.monthCount} 条 · {stats.delta}
        </span>
      </div>

      {/* Big seal-stamp summary */}
      <div className="card" style={{ borderRadius: 16, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <SealStamp size={28} rotate={-5} text={persona.mark} color={persona.color} />
          <div style={{
            fontSize: 11, color: persona.color, fontWeight: 600,
            letterSpacing: '.1em', paddingTop: 4,
          }}>{persona.name} · 本月小结</div>
        </div>
        <div style={{
          fontFamily: T.fontSerif, fontSize: 17, fontWeight: 700, color: 'var(--ink)',
          lineHeight: 1.7, marginBottom: 8,
        }}>
          你这个月写下 <span style={{ color: persona.color }}>{stats.monthCount}</span> 条。
          {stats.topTag && <> 最常想的是 <mark>{stats.topTag}</mark>。</>}
          {stats.topPerson && <> 最常提的人是 <mark style={{ background: 'var(--plum-tint)', color: 'var(--plum)' }}>{stats.topPerson}</mark>。</>}
        </div>
        <div style={{
          fontSize: 12, color: 'var(--ink-mute)',
          fontFamily: T.fontSerif, lineHeight: 1.6,
        }}>
          「{stats.peakHour}」是你思考最活跃的时段。
        </div>
      </div>

      {/* AI Insight card */}
      {aiReady && (
        <div className="card" style={{ borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>{persona.mark}</span>
              <span style={{
                fontSize: 11, color: persona.color, fontWeight: 600,
                letterSpacing: '.08em',
              }}>AI 洞察</span>
            </div>
            <button
              onClick={handleGenerateInsight}
              disabled={insightLoading}
              style={{
                border: 'none', background: 'var(--paper-deep)',
                borderRadius: 6, padding: '3px 10px',
                fontSize: 11, color: aiInsight ? 'var(--ink-mute)' : persona.color,
                cursor: insightLoading ? 'default' : 'pointer',
                fontFamily: T.fontSerif,
              }}
            >
              {insightLoading ? '思考中...' : aiInsight ? '重新生成' : '生成洞察'}
            </button>
          </div>
          {aiInsight ? (
            <div style={{
              fontFamily: T.fontSerif, fontSize: 14,
              color: 'var(--ink-soft)', lineHeight: 1.7,
            }}>
              {aiInsight.text}
            </div>
          ) : !insightLoading ? (
            <div style={{
              fontSize: 12, color: insightError ? 'var(--seal)' : 'var(--ink-fade)',
              fontFamily: T.fontSerif, lineHeight: 1.6,
            }}>
              {insightError
                ? '上次生成失败 · 点击上方按钮重试'
                : monthNotes.length > 0
                  ? `本月有 ${monthNotes.length} 条笔记，点击上方按钮让 ${persona.name} 为你总结。`
                  : '本月还没有笔记。'}
            </div>
          ) : null}
          {aiInsight?.generated_at && (
            <div style={{
              fontSize: 10, color: 'var(--ink-fade)',
              marginTop: 8, fontFamily: T.fontMono,
            }}>
              {new Date(aiInsight.generated_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      )}

      {/* Curator suggestions */}
      {aiReady && (curatorLoading || curatorSuggestions.length > 0) && (
        <div className="card" style={{ borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 14 }}>{persona.mark}</span>
            <span style={{
              fontSize: 11, color: persona.color, fontWeight: 600,
              letterSpacing: '.08em',
            }}>
              {curatorLoading ? '正在整理标签...' : `砚整理了 ${curatorSuggestions.length} 条建议`}
            </span>
          </div>
          {curatorLoading && (
            <div style={{ fontSize: 12, color: 'var(--ink-fade)', fontFamily: T.fontSerif }}>
              正在分析标签使用情况…
            </div>
          )}
          {!curatorLoading && curatorSuggestions.map((s, i) => {
            const typeIcons = { merge: '⊕', rename: '✎', archive: '◻', new: '＋' };
            const typeLabels = { merge: '合并', rename: '重命名', archive: '归档', new: '新增' };
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 0',
                borderTop: i > 0 ? '1px solid var(--fold)' : 'none',
              }}>
                <span style={{ fontSize: 16, color: persona.color, lineHeight: 1.2, paddingTop: 1 }}>
                  {typeIcons[s.type] || '•'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 13, color: 'var(--ink)',
                    fontFamily: T.fontSerif, lineHeight: 1.5,
                  }}>
                    {s.type === 'merge' || s.type === 'rename' ? (
                      <>
                        {s.from.map(f => <span key={f} style={{ color: 'var(--seal)' }}>#{f}</span>).reduce((prev, curr) => [prev, ' + ', curr])}
                        {' '}→ <span style={{ color: 'var(--bamboo)' }}>#{s.to}</span>
                        {' '}<span style={{ color: 'var(--ink-mute)', fontSize: 12 }}>({typeLabels[s.type]})</span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--ink-soft)' }}>{s.from?.join('、') || ''} ({typeLabels[s.type]})</span>
                    )}
                  </div>
                  {s.reason && (
                    <div style={{ fontSize: 11, color: 'var(--ink-fade)', fontFamily: T.fontSerif, marginTop: 2 }}>
                      {s.reason}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => handleApplyCurator(s)} style={{
                    border: 'none', background: persona.color, color: '#fff',
                    borderRadius: 6, padding: '3px 10px', fontSize: 11,
                    cursor: 'pointer', fontFamily: T.fontSerif,
                  }}>应用</button>
                  <button onClick={() => handleRejectCurator(s)} style={{
                    border: '1px solid var(--fold)', background: 'transparent',
                    borderRadius: 6, padding: '3px 10px', fontSize: 11,
                    color: 'var(--ink-mute)', cursor: 'pointer', fontFamily: T.fontSerif,
                  }}>忽略</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {[
          [String(stats.total), '总条数', 'var(--ink)'],
          [String(stats.tagCount), '已用标签', 'var(--bamboo)'],
          [stats.totalDuration, '录音时长', 'var(--indigo)'],
          [stats.delta, '比上月', 'var(--seal)'],
        ].map(([n, l, c]) => (
          <div key={l} className="card" style={{ borderRadius: 12, padding: 12 }}>
            <div style={{
              fontFamily: T.fontSerif, fontSize: 24,
              color: c, fontWeight: 600, lineHeight: 1,
            }}>{n}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div className="card" style={{ borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{
          fontSize: 11, color: 'var(--ink-mute)',
          letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8,
        }}>记录节奏 · 近 4 周</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {stats.heatmap.map((v, i) => (
            <div key={i} style={{
              aspectRatio: '1', borderRadius: 3,
              background: v === 0 ? 'var(--paper-deep)' : `rgba(184,68,58,${0.18 + Math.min(v / 4, 1) * 0.62})`,
            }} title={`${v} 条`} />
          ))}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 6, fontSize: 10, color: 'var(--ink-fade)',
        }} className="mono">
          <span>4 周前</span><span>本周</span>
        </div>
      </div>

      {/* Top tags */}
      <div className="card" style={{ borderRadius: 12, padding: 12 }}>
        <div style={{
          fontSize: 11, color: 'var(--ink-mute)',
          letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10,
        }}>常思之事</div>
        {stats.topTags.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--ink-fade)', fontFamily: T.fontSerif, padding: '8px 0' }}>
            还没有常思之事。
          </div>
        )}
        {stats.topTags.map(({ label, count, color }) => {
          const pct = stats.topTags[0].count ? count / stats.topTags[0].count : 0;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Tag label={label} color={color} size="sm" />
              <div style={{
                flex: 1, height: 4, background: 'var(--paper-deep)',
                borderRadius: 2, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct * 100}%`, height: '100%',
                  background: `var(--${color})`,
                  transition: 'width .4s',
                }} />
              </div>
              <span className="mono" style={{ fontSize: 12, color: 'var(--ink-mute)', width: 24, textAlign: 'right' }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YanChatBody({ notes, persona, categories, existingTags }) {
  const T = TOKENS, I = ICONS;
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: `你好，我是${persona.name}。我已经翻完你的 ${notes.length} 篇笔记，可以问我任何关于过往的事。`,
      tags: [],
    },
  ]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  function send() {
    const q = draft.trim();
    if (!q || thinking) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setDraft('');
    setThinking(true);
    (async () => {
      try {
        const aiConfig = await getAIConfig();
        let result;
        if (aiConfig.apiKey) {
          result = await askYanRAG(q, notes, categories, existingTags);
        } else {
          result = askYan(q, notes);
        }
        setMessages((m) => [...m, { role: 'assistant', text: result.text, refs: result.refs }]);
      } catch {
        // Fall back to rule-based askYan when AI fails
        try {
          const fallback = askYan(q, notes);
          setMessages((m) => [...m, { role: 'assistant', text: fallback.text + '（离线回答）', refs: fallback.refs }]);
        } catch {
          setMessages((m) => [...m, {
            role: 'assistant',
            text: 'AI 连接失败，请检查网络和 API 配置。',
            error: true,
          }]);
        }
      } finally {
        setThinking(false);
      }
    })();
  }

  return (
    <>
      <div ref={scrollRef} className="scroll" style={{
        flex: 1, padding: '16px 16px 8px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {messages.map((m, i) => m.role === 'user' ? (
          <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '80%' }}>
            <div style={{
              background: 'var(--ink)', color: 'var(--paper)',
              padding: '10px 14px', borderRadius: '18px 18px 4px 18px',
              fontFamily: T.fontSerif, fontSize: 14, lineHeight: 1.55,
            }}>{m.text}</div>
          </div>
        ) : (
          <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
            <div style={{
              background: m.error ? 'rgba(184,68,58,.08)' : 'var(--paper-light)',
              color: m.error ? 'var(--seal)' : 'var(--ink-soft)',
              border: `1px solid ${m.error ? 'rgba(184,68,58,.25)' : 'var(--fold)'}`,
              padding: '12px 14px', borderRadius: '18px 18px 18px 4px',
              fontFamily: T.fontSerif, fontSize: 14, lineHeight: 1.65,
            }}>{m.text}</div>
            {m.refs?.length > 0 && (
              <div style={{ marginTop: 6, paddingLeft: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {m.refs.map((r) => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 12, color: 'var(--ink-mute)',
                    fontFamily: T.fontSerif,
                  }}>
                    <span className="mono" style={{ fontSize: 10, color: persona.color, width: 16 }}>
                      {r.index}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--ink-fade)', width: 40 }}>
                      {r.when}
                    </span>
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {thinking && (
          <div style={{ alignSelf: 'flex-start' }}>
            <div style={{
              background: 'var(--paper-light)', border: `1px solid var(--fold)`,
              padding: '10px 14px', borderRadius: '18px 18px 18px 4px',
              display: 'flex', gap: 4, alignItems: 'center',
            }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: persona.color,
                  animation: `pulse 1s ${i * 0.15}s infinite`, opacity: .7,
                }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '8px 12px 12px',
        borderTop: `1px solid var(--fold)`, background: 'var(--paper-light)',
      }}>
        <div style={{
          background: 'var(--paper)', border: `1px solid var(--fold)`,
          borderRadius: 22, padding: '6px 8px',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={`问${persona.name}一下…`}
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontFamily: T.fontSerif, fontSize: 14, color: 'var(--ink)',
              outline: 'none', padding: '8px 10px',
            }} />
          <button onClick={send} disabled={!draft.trim() || thinking}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: draft.trim() ? persona.color : 'var(--ink-fade)', color: '#fff',
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: draft.trim() ? 'pointer' : 'default',
              transition: 'background .15s',
            }}>
            <I.send size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

function computeStats(notes) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

  const monthNotes = notes.filter((n) => n.createdAt >= monthStart);
  const lastMonthNotes = notes.filter((n) => n.createdAt >= lastMonthStart && n.createdAt < monthStart);

  // Tag counts
  const tagCounts = {};
  monthNotes.forEach((n) => (n.tags || []).forEach((t) => {
    if (!tagCounts[t.label]) tagCounts[t.label] = { count: 0, color: t.color };
    tagCounts[t.label].count++;
  }));
  const topTags = Object.entries(tagCounts)
    .map(([label, v]) => ({ label, count: v.count, color: v.color }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // People
  const peopleCounts = {};
  monthNotes.forEach((n) => (n.people || []).forEach((p) => {
    peopleCounts[p] = (peopleCounts[p] || 0) + 1;
  }));
  const topPerson = Object.entries(peopleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Peak hour
  const hourBuckets = Array(4).fill(0); // 0-6, 6-12, 12-18, 18-24
  monthNotes.forEach((n) => {
    const h = new Date(n.createdAt).getHours();
    hourBuckets[Math.floor(h / 6)]++;
  });
  const peakIdx = hourBuckets.indexOf(Math.max(...hourBuckets));
  const peakHour = ['深夜', '清晨', '午间', '晚饭后'][peakIdx];

  // Heatmap — 4 weeks × 7 days = 28 cells
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const heat = Array(28).fill(0);
  notes.forEach((n) => {
    const d = new Date(n.createdAt); d.setHours(0, 0, 0, 0);
    const diff = Math.floor((today - d) / 86_400_000);
    if (diff >= 0 && diff < 28) heat[27 - diff]++;
  });

  // Voice duration
  let totalSec = 0;
  monthNotes.forEach((n) => {
    if (n.duration) {
      const [m, s] = n.duration.split(':').map(Number);
      totalSec += (m || 0) * 60 + (s || 0);
    }
  });
  const totalDuration = totalSec
    ? `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`
    : '—';

  // Delta
  let delta = '—';
  if (lastMonthNotes.length === 0) {
    delta = monthNotes.length > 0 ? '新月' : '—';
  } else {
    const pct = Math.round((monthNotes.length - lastMonthNotes.length) / lastMonthNotes.length * 100);
    delta = (pct >= 0 ? '+' : '') + pct + '%';
  }

  return {
    monthLabel: `${now.getMonth() + 1}月`,
    monthCount: monthNotes.length,
    total: notes.length,
    tagCount: Object.keys(tagCounts).length,
    totalDuration,
    delta,
    topTag: topTags[0]?.label || null,
    topPerson,
    peakHour,
    heatmap: heat,
    topTags,
  };
}

