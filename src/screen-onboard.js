// screen-onboard.js — First launch welcome.

function OnboardingScreen({ onStart, persona }) {
  const T = window.TOKENS, I = window.ICONS;

  return (
    <div className="screen paper" style={{
      alignItems: 'center', justifyContent: 'center',
      padding: '60px 32px 32px',
      textAlign: 'center',
    }}>
      <div style={{ height: 30 }} />
      <SealStamp size={84} rotate={-6} text={persona.mark} color={persona.color} />

      <div style={{ marginTop: 28 }}>
        <div style={{
          fontFamily: T.fontBrush, fontSize: 38, color: 'var(--ink)',
          marginBottom: 10, letterSpacing: '.04em',
        }}>
          一本会思考的本子
        </div>
        <div style={{
          fontFamily: T.fontSerif, fontSize: 14, color: 'var(--ink-mute)',
          lineHeight: 1.8, maxWidth: 320,
        }}>
          你只管<span style={{ color: persona.color }}>写下</span>。<br />
          {persona.name}会记得每一笔，识其要意，<br />
          待你想找时——
        </div>
      </div>

      <div className="card" style={{
        marginTop: 28, borderRadius: 14, padding: '14px 18px',
        width: '100%', maxWidth: 320,
      }}>
        <div style={{
          fontSize: 11, color: persona.color, fontWeight: 600, letterSpacing: '.1em',
          marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
        }}>
          <I.sparkle size={12} stroke={persona.color} /> {persona.name}能为你做什么
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 9,
          fontFamily: T.fontSerif, fontSize: 13.5, color: 'var(--ink-soft)',
          lineHeight: 1.55,
        }}>
          <Bullet color={persona.color}>识读你的文字、语音、照片</Bullet>
          <Bullet color={persona.color}>提取标签、分类、相关人</Bullet>
          <Bullet color={persona.color}>用自然语言翻找过去的所有想法</Bullet>
          <Bullet color={persona.color}>每月给你一份「你在想什么」的小结</Bullet>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <button onClick={onStart}
        style={{
          width: '100%', maxWidth: 320,
          padding: '16px 0',
          background: persona.color, color: '#fff',
          border: 'none', borderRadius: 14, cursor: 'pointer',
          fontFamily: T.fontBrush, fontSize: 18, letterSpacing: '.1em',
          boxShadow: '0 8px 24px rgba(184,68,58,.32)',
          marginTop: 24, marginBottom: 12,
        }}>
        开始第一笔
      </button>

      <div className="mono" style={{ fontSize: 11, color: 'var(--ink-fade)' }}>
        全部数据保存于此设备
      </div>
    </div>
  );
}

function Bullet({ children, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left' }}>
      <span style={{
        width: 5, height: 5, background: color, borderRadius: '50%',
        marginTop: 9, flexShrink: 0,
      }} />
      <span>{children}</span>
    </div>
  );
}

window.OnboardingScreen = OnboardingScreen;
