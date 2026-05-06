const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
};

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

const GLOBAL_ENDPOINT_TEMPLATE = 'https://{region}.api.cognitive.microsoft.com/';
const GLOBAL_TOKEN_ENDPOINT_TEMPLATE = 'https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken';
const CHINA_TOKEN_ENDPOINT_TEMPLATE = 'https://{region}.api.cognitive.azure.cn/sts/v1.0/issueToken';
const AZURE_CHINA_REGIONS = new Set(['chinaeast2', 'chinanorth2', 'chinanorth3']);
const MAX_CANDIDATE_LANGUAGES = 4;

export async function createAzureSpeechSessionPayload(env = {}) {
  const key = env.AZURE_SPEECH_KEY;
  const region = env.AZURE_SPEECH_REGION;
  const cloud = env.AZURE_SPEECH_CLOUD || 'azure-china';

  if (!key || !region) {
    throw new Error('语音识别服务凭据未配置');
  }

  if (cloud !== 'azure-china' && cloud !== 'global') {
    throw new Error('AZURE_SPEECH_CLOUD 只支持 azure-china 或 global');
  }

  if (cloud === 'azure-china' && !AZURE_CHINA_REGIONS.has(region)) {
    throw new Error('Azure 中国区仅支持 chinaeast2、chinanorth2、chinanorth3');
  }

  if (cloud === 'azure-china' && !env.AZURE_SPEECH_ENDPOINT) {
    throw new Error('Azure 中国区必须配置 AZURE_SPEECH_ENDPOINT');
  }

  const endpoint = env.AZURE_SPEECH_ENDPOINT
    || GLOBAL_ENDPOINT_TEMPLATE.replace('{region}', region);
  const language = env.AZURE_SPEECH_LANGUAGE || 'zh-CN';
  const candidateLanguages = (env.AZURE_SPEECH_CANDIDATE_LANGUAGES || 'zh-CN,en-US')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const trueText = env.AZURE_SPEECH_TRUE_TEXT !== '0';

  if (candidateLanguages.length > MAX_CANDIDATE_LANGUAGES) {
    throw new Error(`候选语言数量不能超过 ${MAX_CANDIDATE_LANGUAGES} 个（当前 ${candidateLanguages.length} 个）`);
  }

  const tokenTemplate = cloud === 'azure-china'
    ? CHINA_TOKEN_ENDPOINT_TEMPLATE
    : GLOBAL_TOKEN_ENDPOINT_TEMPLATE;
  const tokenUrl = tokenTemplate.replace('{region}', region);
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key },
  });

  if (!tokenRes.ok) {
    throw new Error(`获取语音识别令牌失败 (${tokenRes.status})`);
  }

  const token = await tokenRes.text();

  return {
    provider: 'azure-speech',
    token,
    cloud,
    region,
    endpoint,
    language,
    candidateLanguages,
    features: {
      trueText,
      languageIdentification: 'AtStart',
    },
    expiresInSeconds: 540,
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    return json(await createAzureSpeechSessionPayload(env));
  } catch (error) {
    return json({
      error: '语音识别连接失败',
      detail: error.message,
    }, { status: 503 });
  }
}
