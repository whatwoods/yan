// ai.js — BYOK multi-provider AI service with task-level model assignment.
// All calls go through chatCompletion() which reads config from IndexedDB.

import { getMeta } from './db.js';
import { SecretsStore } from './crypto.js';

export const PROVIDERS = [
  { id: 'modelscope', name: '魔搭 ModelScope', endpoint: 'https://api-inference.modelscope.cn/v1' },
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1' },
  { id: 'moonshot', name: 'Moonshot Kimi', endpoint: 'https://api.moonshot.cn/v1' },
  { id: 'zhipu', name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'qwen', name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'minimax', name: 'MiniMax', endpoint: 'https://api.minimax.chat/v1' },
  { id: 'xiaomi', name: '小米', endpoint: 'https://token-plan-cn.xiaomimimo.com/v1' },
  { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1' },
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1' },
];

export async function getAIConfig() {
  const config = (await getMeta('aiConfig')) || { provider: null, apiKey: null, endpoint: null, models: [], defaultModel: '' };
  // If master password is set, API key is stored encrypted — use SecretsStore
  const secretKey = SecretsStore.get('apiKey');
  if (secretKey) config.apiKey = secretKey;
  return config;
}

export async function getModelAssignment() {
  return (await getMeta('modelAssignment')) || {
    classify: '', tag: '', summarize: '', insight: '', ask: '', curator: '',
  };
}

export async function fetchModels(endpoint, apiKey) {
  try {
    const res = await fetch(`${endpoint}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return (data.data || []).map(m => m.id).sort();
  } catch {
    return [];
  }
}

export async function chatCompletion(task, messages, { temperature = 0.3, maxTokens = 500 } = {}) {
  const config = await getAIConfig();
  const assignment = await getModelAssignment();
  if (!config.apiKey || !config.endpoint) return null;

  const model = assignment[task] || config.defaultModel || '';
  if (!model) return null;

  try {
    const res = await fetch(`${config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

export async function classifyNote(body, categories) {
  const catNames = categories.map(c => c.name).join('、');
  const result = await chatCompletion('classify', [
    { role: 'system', content: '你是笔记分类器。只回复分类名，不要其他内容。' },
    { role: 'user', content: `从以下分类中选择最适合的一个，只回复分类名：${catNames}\n\n笔记：${body.slice(0, 200)}` },
  ], { temperature: 0.1, maxTokens: 20 });
  if (result && categories.some(c => c.name === result.trim())) return result.trim();
  return null;
}

export async function extractTagsAndPeople(body) {
  const result = await chatCompletion('tag', [
    { role: 'system', content: '你是笔记标签和人名提取器。只回复 JSON，不要其他内容。' },
    { role: 'user', content: `提取标签（最多5个）和人名。回复 JSON：{"tags":["标签1"],"people":["人名1"]}\n\n笔记：${body.slice(0, 300)}` },
  ], { temperature: 0.2, maxTokens: 100 });
  try {
    const parsed = JSON.parse(result);
    return { tags: parsed.tags || [], people: parsed.people || [] };
  } catch {
    return { tags: [], people: [] };
  }
}

export async function generateSummary(body) {
  const result = await chatCompletion('summarize', [
    { role: 'system', content: '用一句话（不超过20字）概括笔记核心。只回复摘要。' },
    { role: 'user', content: body.slice(0, 300) },
  ], { temperature: 0.3, maxTokens: 50 });
  return result?.trim() || null;
}

export async function generateInsight(monthNotes, monthLabel) {
  const notesContext = monthNotes.slice(0, 30).map((n, i) => {
    const tags = (n.tags || []).map(t => t.label).join(',');
    const date = new Date(n.createdAt || n.created).toLocaleDateString('zh-CN');
    return `${i + 1}. [${date}] ${n.title || '(无题)'} #${tags} ${n.body?.slice(0, 60) || ''}`;
  }).join('\n');

  const result = await chatCompletion('insight', [
    { role: 'system', content: '你是笔记洞察分析师。用简洁中文总结本月笔记，100字以内。包括：主题趋势、思维模式、值得关注的点。语气温暖、有洞察力。' },
    { role: 'user', content: `${monthLabel}共 ${monthNotes.length} 条笔记：\n${notesContext}` },
  ], { temperature: 0.5, maxTokens: 200 });
  return result?.trim() || null;
}
