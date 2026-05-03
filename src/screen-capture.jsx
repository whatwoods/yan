// screen-capture.jsx — Home screen. Default omnibox (per chat: 全能输入).
// Three states: idle (small bar) → text (expanded textarea) → recording (live waveform inline).

import React, { useState, useEffect, useRef } from 'react';
import { TOKENS, formatRelative } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { SealStamp, BrushTitle, Tag, showToast } from './components.jsx';

export function CaptureScreen({ notes, onSave, onOpenNote, persona }) {
  const T = TOKENS, I = ICONS;

  const [mode, setMode] = useState('idle');
  const [text, setText] = useState('');
  const [recTick, setRecTick] = useState(0);
  const [interim, setInterim] = useState('');
  const [photoData, setPhotoData] = useState(null);
  const [recordingStart, setRecordingStart] = useState(0);

  const taRef = useRef(null);
  const recRef = useRef(null);
  const photoInputRef = useRef(null);
  const filePickerRef = useRef(null);

  // ── Recording (Web Speech API for transcription, MediaRecorder fallback). ───
  useEffect(() => {
    if (mode !== 'recording') return;
    const id = setInterval(() => setRecTick((x) => x + 1), 100);
    return () => clearInterval(id);
  }, [mode]);

  function startRecording() {
    setMode('recording');
    setRecordingStart(Date.now());
    setInterim('');

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const r = new SR();
      r.lang = 'zh-CN';
      r.interimResults = true;
      r.continuous = true;
      r.onresult = (e) => {
        let final = '';
        let interimT = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const tr = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += tr;
          else interimT += tr;
        }
        if (final) setText((t) => (t + final).trimStart());
        setInterim(interimT);
      };
      r.onerror = () => {};
      r.onend = () => {};
      try { r.start(); } catch {}
      recRef.current = r;
    } else {
      // No speech API — show a "录音中" placeholder, user types/edits after stop.
      showToast('此浏览器无语音识别 · 已记录时长');
    }
  }

  function stopRecording() {
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
      recRef.current = null;
    }
    setInterim('');
    setMode(text.trim() ? 'text' : 'idle');
    setTimeout(() => taRef.current?.focus(), 50);
  }

  function cancelRecording() {
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
      recRef.current = null;
    }
    setInterim('');
    setMode('idle');
  }

  function expandToText() {
    setMode('text');
    setTimeout(() => taRef.current?.focus(), 30);
  }

  function handlePhoto(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoData(ev.target.result);
      expandToText();
    };
    reader.readAsDataURL(f);
  }

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setText((t) => (t ? t + '\n' : '') + `[附件] ${f.name} · ${(f.size / 1024).toFixed(1)} KB`);
    expandToText();
  }

  function save() {
    const body = (text + (interim ? ' ' + interim : '')).trim();
    if (!body && !photoData) return;
    const dur = recordingStart && mode === 'recording'
      ? formatDuration(Date.now() - recordingStart) : null;
    const kind = photoData ? 'photo' : (dur ? 'voice' : 'text');
    onSave({
      kind,
      body,
      photo: photoData,
      duration: dur,
    });
    setText('');
    setInterim('');
    setPhotoData(null);
    setMode('idle');
    cancelRecording();
  }

  // Waveform bars (driven by tick)
  const bars = Array.from({ length: 22 }, (_, i) => {
    const phase = (recTick / 4 + i * 0.7);
    return 4 + Math.abs(Math.sin(phase) * 16) + Math.abs(Math.cos(phase * 1.3) * 6);
  });

  const recent = notes.slice(0, 3);
  const greeting = greetingByHour();

  return (
    <div className="screen paper">
      <div className="scr-head">
        <div>
          <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginBottom: 2, fontFamily: T.fontSerif }}>
            {greeting} · {dateLine()}
          </div>
          <BrushTitle size={26}>记一笔</BrushTitle>
        </div>
        <SealStamp size={36} text={persona.mark} color={persona.color} />
      </div>

      {/* Recent capsules */}
      <div className="scroll" style={{ flex: 1, padding: '4px 20px 0' }}>
        <div style={{ fontSize: 11, color: 'var(--ink-fade)', letterSpacing: '.12em', textTransform: 'uppercase', margin: '14px 0 8px', fontFamily: T.fontSans }}>
          方才记下
        </div>
        {recent.length === 0 && (
          <div style={{
            background: 'var(--paper-light)', border: `1px dashed var(--fold)`,
            borderRadius: 14, padding: '20px 16px', textAlign: 'center',
            fontFamily: T.fontSerif, color: 'var(--ink-mute)', fontSize: 14,
          }}>
            还没有笔记。<br />
            <span style={{ color: 'var(--seal)' }}>从写下第一笔开始 ↓</span>
          </div>
        )}
        {recent.map((n) => (
          <div key={n.id} onClick={() => onOpenNote(n.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', background: 'var(--paper-light)',
            border: `1px solid var(--fold)`, borderRadius: 12,
            marginBottom: 8, cursor: 'pointer',
          }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-fade)', width: 40, flexShrink: 0 }}>
              {formatRelative(n.createdAt)}
            </span>
            <span style={{
              flex: 1, fontFamily: T.fontSerif, fontSize: 14, color: 'var(--ink-soft)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {n.title}
            </span>
            {n.tags?.[0] && <Tag label={n.tags[0].label} color={n.tags[0].color} size="sm" />}
          </div>
        ))}
      </div>

      {/* Suggestion chips when idle */}
      {mode === 'idle' && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 20px 0', flexWrap: 'wrap' }}>
          {['一个想法', '今天读到的', '待办', '关于某人'].map((s) => (
            <button key={s} className="btn-ghost" onClick={() => { setText(''); expandToText(); }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Omnibox */}
      <div style={{
        margin: '14px 16px 0',
        background: 'var(--paper-light)',
        border: `1px solid ${mode === 'recording' ? 'var(--seal)' : 'var(--fold)'}`,
        borderRadius: mode === 'idle' ? 999 : 22,
        padding: mode === 'idle' ? '6px 6px 6px 18px' : '12px 12px 10px',
        boxShadow: 'var(--shadow)',
        transition: 'border-radius .2s, padding .2s, border-color .2s',
      }}>
        {mode === 'idle' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div onClick={expandToText}
              style={{ flex: 1, fontFamily: T.fontSerif, fontSize: 15, color: 'var(--ink-fade)', padding: '8px 0' }}>
              此处落笔…
            </div>
            <button className="icon-btn" onClick={() => photoInputRef.current?.click()} aria-label="拍照">
              <I.camera size={20} />
            </button>
            <button onClick={startRecording} aria-label="录音"
              style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'var(--seal)', color: '#fff', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(184,68,58,.32)',
              }}>
              <I.mic size={18} />
            </button>
          </div>
        )}

        {mode === 'text' && (
          <>
            {photoData && (
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <img src={photoData} alt="附图"
                  style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 12, border: `1px solid var(--fold)` }} />
                <button onClick={() => setPhotoData(null)} aria-label="移除照片"
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 24, height: 24, borderRadius: 12,
                    background: 'rgba(0,0,0,.55)', color: '#fff', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                  }}>
                  <I.close size={14} />
                </button>
              </div>
            )}
            <textarea
              ref={taRef}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="此处落笔…"
              style={{
                width: '100%', minHeight: 92, border: 'none', outline: 'none',
                background: 'transparent', resize: 'none',
                fontFamily: T.fontSerif, fontSize: 16, color: 'var(--ink)',
                lineHeight: 1.65, padding: '4px 4px 8px',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="icon-btn" onClick={() => { setText(''); setPhotoData(null); setMode('idle'); }} aria-label="折叠">
                <I.close size={18} />
              </button>
              <button className="icon-btn" onClick={() => photoInputRef.current?.click()} aria-label="加图">
                <I.camera size={20} />
              </button>
              <button className="icon-btn" onClick={() => filePickerRef.current?.click()} aria-label="附件">
                <I.clip size={20} />
              </button>
              <span style={{
                marginLeft: 4, fontSize: 11, color: 'var(--ink-fade)',
                fontFamily: T.fontMono,
              }}>{text.length} 字</span>
              <div style={{ flex: 1 }} />
              <button className="icon-btn" onClick={startRecording} aria-label="语音">
                <I.mic size={20} />
              </button>
              <button onClick={save} disabled={!text.trim() && !photoData}
                style={{
                  padding: '8px 18px', borderRadius: 999,
                  background: (text.trim() || photoData) ? 'var(--ink)' : 'var(--ink-fade)',
                  color: 'var(--paper)', border: 'none', cursor: 'pointer',
                  fontFamily: T.fontSerif, fontSize: 14, letterSpacing: '.04em',
                  transition: 'background .15s',
                }}>
                收
              </button>
            </div>
          </>
        )}

        {mode === 'recording' && (
          <>
            <div style={{
              minHeight: 92, padding: '4px 4px 10px',
              fontFamily: T.fontSerif, fontSize: 16, color: 'var(--ink-soft)', lineHeight: 1.65,
            }}>
              {text && <span style={{ color: 'var(--ink)' }}>{text}</span>}
              {interim && <span style={{ color: 'var(--ink-fade)' }}>{(text ? ' ' : '') + interim}</span>}
              {!text && !interim && <span style={{ color: 'var(--ink-fade)' }}>正在听你说…</span>}
              <span style={{
                display: 'inline-block', width: 6, height: 16, background: 'var(--seal)',
                marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s infinite',
              }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="icon-btn" onClick={cancelRecording} aria-label="取消">
                <I.close size={18} />
              </button>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, height: 28 }}>
                {bars.map((h, i) => (
                  <span key={i} style={{
                    width: 2.5, height: h, background: 'var(--seal)', borderRadius: 1, opacity: .85,
                  }} />
                ))}
              </div>
              <span className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)', minWidth: 36 }}>
                {formatDuration(recordingStart ? Date.now() - recordingStart : 0)}
              </span>
              <button onClick={stopRecording} aria-label="停止"
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'var(--seal)', color: '#fff', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}>
                <span style={{ width: 12, height: 12, background: '#fff', borderRadius: 2 }} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Hint line */}
      <div style={{
        textAlign: 'center', padding: '10px 20px 14px',
        fontSize: 11, color: 'var(--ink-fade)', fontFamily: T.fontSans,
      }}>
        自动保存 · 砚会在后台为你识其要意
      </div>

      {/* Hidden file inputs */}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
        onChange={handlePhoto} style={{ display: 'none' }} />
      <input ref={filePickerRef} type="file" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  );
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 5) return '夜深';
  if (h < 11) return '早安';
  if (h < 14) return '午安';
  if (h < 18) return '下午好';
  if (h < 22) return '晚安';
  return '夜晚';
}

function dateLine() {
  const d = new Date();
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  const wd = '日一二三四五六'[d.getDay()];
  return `${md} · 周${wd}`;
}

