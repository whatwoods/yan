// tag-colors.js — Tag dictionary, people hint pattern, and TAG_TO_CATEGORY mapping.
// Pure data constants used by ai-tagger.js and store.jsx.

// ── Tag dictionary — used by the local "AI" tagger ────────────
// Each tag is a category that maps to triggering keywords.
// In a production app this would be replaced by an Anthropic API call;
// here we approximate with a dictionary so the UX still feels alive offline.
export const TAG_DICT = [
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

export const PEOPLE_HINT = /([一-龥])(姐|哥|弟|妹|姨|叔|爸|妈|总|先生|女士)|@([一-龥\w]+)/g;

export const TAG_TO_CATEGORY = {
  '工作': '工作', '产品': '工作', '首屏': '工作', '决策': '工作',
  '阅读': '学习', '学习': '学习',
  '人': '生活', '身体': '生活', '旅行': '生活', '生活': '生活',
  '待办': '生活', '钱': '生活', '摘抄': '生活',
  '想法': '想法', '感受': '想法', '随手': '想法',
  'AI': 'AI', '开发': '开发', '收藏': '收藏',
  '阿宁': '生活',
};
