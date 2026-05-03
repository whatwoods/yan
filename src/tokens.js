// tokens.js — exported palette & helpers (CSS vars are in styles.css)

const TOKENS = {
  paper: '#f4ede1', paperDeep: '#ebe1d0', paperLight: '#faf5ea', fold: '#e0d4bd',
  ink: '#1f1a14', inkSoft: '#3a322a', inkMute: '#7a6f5f', inkFade: '#a89e8c',
  seal: '#b8443a', bamboo: '#5b7a5a', ochre: '#c89342', indigo: '#3d5a7c', plum: '#8b4a5e',
  sealTint: '#f3dcd3', bambooTint: '#dde6d8', ochreTint: '#f1e2c4', indigoTint: '#d4dce8', plumTint: '#ead7dd',
  fontSerif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", Georgia, serif',
  fontSans:  '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, system-ui, sans-serif',
  fontBrush: '"ZCOOL XiaoWei", "Noto Serif SC", serif',
  fontMono:  '"JetBrains Mono", "SF Mono", Menlo, monospace',
};

const PERSONAS = {
  yan:    { mark: '砚', name: '砚',   color: '#b8443a', desc: '安静的小印章', tone: '简短' },
  zhi:    { mark: '知', name: '知',   color: '#3d5a7c', desc: '一位老学究',   tone: '考究' },
  ming:   { mark: '茗', name: '茗',   color: '#5b7a5a', desc: '泡茶的友人',   tone: '温和' },
  monkey: { mark: '猴', name: '小猴', color: '#c89342', desc: '好奇的助手',   tone: '活泼' },
};

window.TOKENS = TOKENS;
window.PERSONAS = PERSONAS;

// Format helpers
window.formatRelative = function (ts) {
  const now = Date.now();
  const d = new Date(ts);
  const diff = now - ts;
  const sameDay = (a, b) => {
    const A = new Date(a), B = new Date(b);
    return A.getFullYear() === B.getFullYear() && A.getMonth() === B.getMonth() && A.getDate() === B.getDate();
  };
  if (diff < 60_000) return '刚才';
  if (sameDay(ts, now)) return d.toTimeString().slice(0, 5);
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  if (sameDay(ts, yest)) return '昨天';
  if (diff < 7 * 86_400_000) return ['日','一','二','三','四','五','六'][d.getDay()] + '曜';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

window.dayLabel = function (ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return '今日';
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  if (sameDay(d, yest)) return '昨日';
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

window.timeLabel = function (ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

window.fullDate = function (ts) {
  const d = new Date(ts);
  return `${d.getFullYear()} · ${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getDate()).padStart(2, '0')} — ${window.timeLabel(ts)}`;
};
