// screen-settings.js — Settings page with persona, theme, data sections.

function SettingsScreen({ settings, onChange, onResetSeed, persona, onExport, onClearAll, totalNotes }) {
  const T = window.TOKENS, I = window.ICONS;
  const PERSONAS = window.PERSONAS;
  const { useState } = React;

  const [showPersona, setShowPersona] = useState(false);
  const [showFont, setShowFont] = useState(false);

  return (
    <div className="screen paper">
      <ScrHead title="设置" />

      <div className="scroll" style={{ flex: 1, padding: '0 20px 30px' }}>
        {/* Profile */}
        <div className="card" style={{
          borderRadius: 14, padding: 14, marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'var(--ochre)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: T.fontSerif, fontSize: 22, fontWeight: 600,
            transform: 'rotate(-3deg)',
          }}>本</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.fontSerif, fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>
              本地笔记
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
              {totalNotes} 篇 · 全部存于此设备
            </div>
          </div>
          <div style={{
            background: 'var(--paper-deep)', padding: '4px 8px', borderRadius: 6,
            fontSize: 11, color: 'var(--ink-mute)',
          }} className="mono">离线</div>
        </div>

        <Section title={`${persona.name} · AI 助手`}>
          <Row icon={persona.mark} accent={persona.color} label="人格"
            value={persona.desc} onClick={() => setShowPersona(true)} />
          <Row icon={<I.sparkle size={14} />} label="自动识别打标签"
            value={settings.autoTag ? '开' : '关'}
            onClick={() => onChange({ ...settings, autoTag: !settings.autoTag })} />
          <Row icon={<I.bolt size={14} />} label="云端模型"
            value="本地（离线）" last />
        </Section>

        <Section title="外观">
          <Row icon={<I.pen size={14} />} label="字体"
            value={({ serif: '思源宋体', sans: '思源黑体', kai: '楷体' })[settings.font] || '思源宋体'}
            onClick={() => setShowFont(true)} />
          <Row icon={<I.book size={14} />} label="卡片密度"
            value={settings.density === 'compact' ? '紧凑' : '舒适'}
            onClick={() => onChange({ ...settings, density: settings.density === 'compact' ? 'comfy' : 'compact' })} last />
        </Section>

        <Section title="数据">
          <Row icon={<I.clip size={14} />} label="导出全部笔记"
            value="Markdown" onClick={onExport} />
          <Row icon={<I.bolt size={14} />} label="重置示例数据"
            value="覆盖" onClick={onResetSeed} />
          <Row icon={<I.trash size={14} />} label="清空所有数据"
            value="谨慎" accent="#a13a30"
            onClick={onClearAll} last />
        </Section>

        <div style={{
          textAlign: 'center', padding: '20px 0 10px',
          fontFamily: T.fontMono, fontSize: 11, color: 'var(--ink-fade)',
        }}>笔记 v1.0 · 一本会思考的本子</div>
      </div>

      {showPersona && (
        <PersonaSheet current={settings.persona} onPick={(p) => {
          onChange({ ...settings, persona: p });
          setShowPersona(false);
        }} onClose={() => setShowPersona(false)} />
      )}
      {showFont && (
        <FontSheet current={settings.font} onPick={(f) => {
          onChange({ ...settings, font: f });
          setShowFont(false);
        }} onClose={() => setShowFont(false)} />
      )}
    </div>
  );
}

function Section({ title, children }) {
  const T = window.TOKENS;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '.1em',
        textTransform: 'uppercase', padding: '0 4px 8px', fontFamily: T.fontSerif,
      }}>{title}</div>
      <div className="card" style={{ padding: 0, borderRadius: 14, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ icon, label, value, last, onClick, accent }) {
  const T = window.TOKENS;
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      borderBottom: last ? 'none' : `1px solid var(--fold)`,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: accent || 'var(--paper-deep)',
        color: accent ? '#fff' : 'var(--ink-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: T.fontSerif, fontSize: 14, fontWeight: 600,
        flexShrink: 0,
      }}>{icon}</div>
      <span style={{
        flex: 1, fontFamily: T.fontSerif, fontSize: 14, color: 'var(--ink)',
      }}>{label}</span>
      {value !== undefined && (
        <span style={{ fontSize: 12, color: 'var(--ink-mute)', fontFamily: T.fontSerif }}>{value}</span>
      )}
      {onClick && <span style={{ color: 'var(--ink-fade)', fontSize: 14 }}>›</span>}
    </div>
  );
}

function PersonaSheet({ current, onPick, onClose }) {
  const T = window.TOKENS;
  const PERSONAS = window.PERSONAS;
  return (
    <>
      <div className="sheet-mask" onClick={onClose} />
      <div className="sheet" style={{ height: 'auto', maxHeight: '70%' }}>
        <div className="sheet-grip" />
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{
            fontSize: 12, color: 'var(--ink-mute)',
            letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14,
            fontFamily: T.fontSerif,
          }}>选一个砚的样子</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(PERSONAS).map(([id, p]) => (
              <button key={id} onClick={() => onPick(id)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: 12, borderRadius: 14,
                background: current === id ? 'var(--paper-deep)' : 'var(--paper-light)',
                border: `1.5px solid ${current === id ? p.color : 'var(--fold)'}`,
                cursor: 'pointer', textAlign: 'left',
              }}>
                <SealStamp size={42} text={p.mark} color={p.color} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.fontBrush, fontSize: 18, color: 'var(--ink)' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 2 }}>
                    {p.desc} · {p.tone}
                  </div>
                </div>
                {current === id && (
                  <div style={{ color: p.color, fontSize: 14, fontWeight: 600 }}>选</div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function FontSheet({ current, onPick, onClose }) {
  const T = window.TOKENS;
  const fonts = [
    ['serif', '思源宋体', T.fontSerif, '经典 · 端庄'],
    ['sans',  '思源黑体', T.fontSans,  '现代 · 清晰'],
    ['kai',   '楷体',     '"Kaiti SC", "STKaiti", serif', '手写 · 温柔'],
  ];
  return (
    <>
      <div className="sheet-mask" onClick={onClose} />
      <div className="sheet" style={{ height: 'auto', maxHeight: '70%' }}>
        <div className="sheet-grip" />
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{
            fontSize: 12, color: 'var(--ink-mute)',
            letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14,
            fontFamily: T.fontSerif,
          }}>字体</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fonts.map(([id, name, ff, hint]) => (
              <button key={id} onClick={() => onPick(id)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 12,
                background: current === id ? 'var(--paper-deep)' : 'var(--paper-light)',
                border: `1.5px solid ${current === id ? 'var(--seal)' : 'var(--fold)'}`,
                cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: ff, fontSize: 18, color: 'var(--ink)' }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 2, fontFamily: T.fontSans }}>
                    {hint}
                  </div>
                </div>
                {current === id && <span style={{ color: 'var(--seal)', fontWeight: 600 }}>选</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

window.SettingsScreen = SettingsScreen;
