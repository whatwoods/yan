// tokens.jsx — exported palette & helpers (CSS vars are in styles.css)

export const TOKENS = {
  paper: '#f4ede1', paperDeep: '#ebe1d0', paperLight: '#faf5ea', fold: '#e0d4bd',
  ink: '#1f1a14', inkSoft: '#3a322a', inkMute: '#7a6f5f', inkFade: '#a89e8c',
  seal: '#b8443a', bamboo: '#5b7a5a', ochre: '#c89342', indigo: '#3d5a7c', plum: '#8b4a5e',
  sealTint: '#f3dcd3', bambooTint: '#dde6d8', ochreTint: '#f1e2c4', indigoTint: '#d4dce8', plumTint: '#ead7dd',
  fontSerif: 'Georgia, "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
  fontSans:  '-apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  fontBrush: 'Georgia, "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
  fontMono:  '"SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
};

export const PERSONAS = {
  yan: { mark: '砚', name: '砚', color: '#b8443a', desc: '安静的小印章', tone: '简短' },
};

// Format helpers
export function formatRelative(ts) {
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
}

export function dayLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return '今日';
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  if (sameDay(d, yest)) return '昨日';
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export function timeLabel(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fullDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()} · ${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getDate()).padStart(2, '0')} — ${timeLabel(ts)}`;
}
