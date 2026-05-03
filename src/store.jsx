// store.jsx — localStorage-backed notes + settings, plus client-side AI tagging.

import { formatRelative } from './tokens.jsx';

const STORAGE_NOTES = 'biji.notes.v1';
const STORAGE_SETTINGS = 'biji.settings.v1';
const STORAGE_FIRST_RUN = 'biji.firstRun.v1';

// ── Tag dictionary — used by the local "AI" tagger ────────────────
// Each tag is a category that maps to triggering keywords.
// In a production app this would be replaced by an Anthropic API call;
// here we approximate with a dictionary so the UX still feels alive offline.
const TAG_DICT = [
  { label: '工作',   color: 'indigo', kws: ['会议','项目','需求','复盘','上线','排期','okr','汇报','上司','同事','工位','加班','任务','schedule','deadline'] },
  { label: '产品',   color: 'bamboo', kws: ['产品','设计','原型','线框','用户','流程','首屏','按钮','交互','体验','ux','ui','feature','需求'] },
  { label: '阅读',   color: 'bamboo', kws: ['书','读','章','页','作者','读到','摘抄','金句','《','》','novel','chapter'] },
  { label: '人',     color: 'plum',   kws: ['朋友','同事','家人','妈','爸','她','他','哥','姐','妹','弟','聊到','约','见','聚'] },
  { label: '身体',   color: 'seal',   kws: ['跑步','健身','睡眠','失眠','吃','喝','胃','头疼','感冒','瑜伽','力量','重量','减脂','体重','workout'] },
  { label: '旅行',   color: 'ochre',  kws: ['旅行','出差','机票','酒店','景点','导航','地图','杭州','北京','上海','京都','东京','日本','美国'] },
  { label: '想法',   color: 'ink',    kws: ['想到','突然','觉得','或许','也许','也许','idea','灵感','念头','一闪'] },
  { label: '待办',   color: 'seal',   kws: ['todo','todo:','待办','要做','别忘','记得','下午','明天','周五','周末','下周','下月','买'] },
  { label: '摘抄',   color: 'ochre',  kws: ['"','"','「','」','——','——','引用','quote'] },
  { label: '感受',   color: 'plum',   kws: ['开心','难过','焦虑','紧张','压力','放松','害怕','喜欢','讨厌','感觉','心情','emo'] },
  { label: '学习',   color: 'indigo', kws: ['学','课','视频','教程','笔记','单词','英语','日语','算法','数学','物理','course'] },
  { label: '钱',     color: 'ochre',  kws: ['花','买','钱','工资','收入','支出','账单','理财','股票','基金','投资'] },
];

const PEOPLE_HINT = /([一-龥])(姐|哥|弟|妹|姨|叔|爸|妈|总|先生|女士)|@([一-龥\w]+)/g;

export function autoTags(body) {
  const text = (body || '').toLowerCase();
  const found = [];
  for (const t of TAG_DICT) {
    if (t.kws.some((k) => text.includes(k.toLowerCase()))) {
      found.push({ label: t.label, color: t.color });
    }
    if (found.length >= 4) break;
  }
  if (found.length === 0) found.push({ label: '随手', color: 'ink' });
  return found;
}

export function autoTitle(body) {
  if (!body) return '无字';
  const firstLine = body.trim().split(/\n/)[0];
  if (firstLine.length <= 18) return firstLine;
  // Try to break at the first natural break.
  const trimmed = firstLine.slice(0, 18).replace(/[，。、：；,.!?]\s*$/, '');
  return trimmed + '…';
}

export function autoSummary(body) {
  if (!body) return '';
  const compact = body.replace(/\s+/g, ' ').trim();
  if (compact.length <= 32) return compact;
  return compact.slice(0, 32) + '…';
}

export function extractPeople(body) {
  const set = new Set();
  let m;
  PEOPLE_HINT.lastIndex = 0;
  while ((m = PEOPLE_HINT.exec(body)) !== null) {
    if (m[3]) set.add(m[3]);
    else if (m[1] && m[2]) set.add(m[1] + m[2]);
  }
  return [...set];
}

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── seed notes for fresh installs (so the app feels alive) ──────────
function seedNotes() {
  const now = Date.now();
  const HOUR = 3_600_000, DAY = 86_400_000;
  return [
    {
      id: 's1', kind: 'text',
      title: '关于"快速记"的几个想法',
      body: '晚饭后又重新想了一遍首屏。觉得之前那版有个核心问题：把"功能"和"内容"放在一起，反而稀释了"快速记"的紧迫感。\n\n新的方案——首屏只做一件事，就是写。文字作为基础底色，语音、拍照、贴附件作为悬浮的圆形按钮，分布在输入框之下。\n\n关键是节奏：用户从"想记"到"开始记"应该不超过 1 秒。',
      tags: [{ label: '工作', color: 'indigo' }, { label: '产品', color: 'bamboo' }, { label: '首屏', color: 'ochre' }, { label: '决策', color: 'ink' }],
      summary: '建议把输入框作为视觉中心，三种输入方式以悬浮按钮承载。',
      people: ['阿宁'],
      createdAt: now - HOUR,
      pinned: true,
    },
    {
      id: 's2', kind: 'voice',
      title: '与阿宁的电话',
      body: '聊到她要去杭州，可推荐几间安静的茶馆。她说工作上遇到瓶颈，想换个城市待几天。提醒她带《长物志》，路上看刚好。',
      tags: [{ label: '人', color: 'plum' }, { label: '阿宁', color: 'plum' }],
      summary: '阿宁要去杭州 · 推荐茶馆 · 带书',
      people: ['阿宁'],
      duration: '4:12',
      createdAt: now - 4 * HOUR,
    },
    {
      id: 's3', kind: 'text',
      title: '咖啡馆窗边读到的句子',
      body: '"庭院深深深几许"——欧阳修\n\n这句话第一次在课本上读到时没什么感觉，今天在这家临河的小店里再读，忽然就懂了。',
      tags: [{ label: '阅读', color: 'bamboo' }, { label: '摘抄', color: 'ochre' }],
      summary: '欧阳修「庭院深深深几许」 · 重读有感',
      people: [],
      createdAt: now - 8 * HOUR,
    },
    {
      id: 's4', kind: 'text',
      title: '健身计划调整',
      body: '改成一三五早晨跑步，二四力量训练。周末休息或徒步。\n\n睡眠也得调，晚上 11 点前必须躺下。',
      tags: [{ label: '身体', color: 'seal' }, { label: '待办', color: 'seal' }],
      summary: '一三五跑步 / 二四力量 / 周末徒步 / 11 点睡',
      people: [],
      createdAt: now - DAY - 2 * HOUR,
    },
    {
      id: 's5', kind: 'text',
      title: '苏堤的春景',
      body: '风很大，柳絮像下雪。沿着堤一路走到了苏小小墓。回程在断桥边的小馆吃了片儿川。',
      tags: [{ label: '旅行', color: 'ochre' }, { label: '感受', color: 'plum' }],
      summary: '苏堤 · 苏小小墓 · 片儿川',
      people: [],
      createdAt: now - DAY - 9 * HOUR,
    },
    {
      id: 's6', kind: 'text',
      title: '产品评审 · 把"快速记"放在 C 位',
      body: '团队对首屏分歧挺大。结论：把"快速记"作为唯一首屏入口，导航缩到三栏 + 设置。',
      tags: [{ label: '工作', color: 'indigo' }, { label: '决策', color: 'ink' }],
      summary: '首屏 = 快速记 · 三栏 + 设置',
      people: [],
      createdAt: now - 2 * DAY,
    },
  ];
}

export const Store = {
  // ── notes ─────────────────────────────────────────
  loadNotes() {
    const stored = loadJSON(STORAGE_NOTES, null);
    if (stored && Array.isArray(stored)) return stored;
    const seeded = seedNotes();
    saveJSON(STORAGE_NOTES, seeded);
    return seeded;
  },
  saveNotes(arr) { saveJSON(STORAGE_NOTES, arr); },
  addNote(note) {
    const all = Store.loadNotes();
    all.unshift(note);
    Store.saveNotes(all);
    return all;
  },
  updateNote(id, patch) {
    const all = Store.loadNotes();
    const idx = all.findIndex((n) => n.id === id);
    if (idx === -1) return all;
    all[idx] = { ...all[idx], ...patch };
    Store.saveNotes(all);
    return all;
  },
  deleteNote(id) {
    const all = Store.loadNotes().filter((n) => n.id !== id);
    Store.saveNotes(all);
    return all;
  },

  // ── settings ──────────────────────────────────────
  loadSettings() {
    return loadJSON(STORAGE_SETTINGS, {
      persona: 'yan',
      theme: 'paper',
      font: 'serif',
      autoTag: true,
      density: 'comfy',
    });
  },
  saveSettings(s) { saveJSON(STORAGE_SETTINGS, s); },

  // ── first-run ─────────────────────────────────────
  isFirstRun() { return loadJSON(STORAGE_FIRST_RUN, true); },
  markRun() { saveJSON(STORAGE_FIRST_RUN, false); },
};

// ── chat with 砚 — generates plausible responses based on memory ─────
export function askYan(question, notes) {
  const q = question.toLowerCase();
  const matched = notes.filter((n) => {
    const hay = (n.title + ' ' + n.body + ' ' + (n.tags || []).map(t => t.label).join(' ')).toLowerCase();
    return q.split(/\s+/).filter(Boolean).some((w) => hay.includes(w)) ||
      (n.tags || []).some((t) => q.includes(t.label));
  }).slice(0, 6);

  if (matched.length === 0) {
    return {
      text: '翻完了 ' + notes.length + ' 篇笔记，没找到与此特别相关的。要不你先记一笔，让我有所凭依？',
      refs: [],
    };
  }
  const tagCounts = {};
  matched.forEach((n) => (n.tags || []).forEach((t) => {
    tagCounts[t.label] = (tagCounts[t.label] || 0) + 1;
  }));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const tagLine = topTags.length ? `多与 ${topTags.map(([l]) => `「${l}」`).join('、')} 有关。` : '';

  return {
    text: `翻了你的 ${notes.length} 篇笔记，找到 ${matched.length} 条相关的。${tagLine}最近一次是${formatRelative(matched[0].createdAt)}：「${matched[0].title}」。`,
    refs: matched.map((n) => ({ id: n.id, title: n.title, when: formatRelative(n.createdAt) })),
  };
}
