const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
};

const DEFAULT_XFYUN_IAT_ENDPOINT = 'wss://iat-api.xfyun.cn/v2/iat';
const DEFAULT_BUSINESS = Object.freeze({
  language: 'zh_cn',
  domain: 'iat',
  accent: 'mandarin',
  eos: 10000,
  ptt: 1,
  nunum: 1,
  rlang: 'zh-cn',
});

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

function textToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64(bytes);
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function hmacSha256Base64(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return bytesToBase64(new Uint8Array(signature));
}

function firstEnv(env, names) {
  for (const name of names) {
    if (env?.[name]) return env[name];
  }
  return '';
}

export function readXfyunIatConfig(env = {}) {
  return {
    appId: firstEnv(env, ['XFYUN_IAT_APP_ID', 'XFYUN_APP_ID']),
    apiKey: firstEnv(env, ['XFYUN_IAT_API_KEY', 'XFYUN_API_KEY']),
    apiSecret: firstEnv(env, ['XFYUN_IAT_API_SECRET', 'XFYUN_API_SECRET']),
    endpoint: firstEnv(env, ['XFYUN_IAT_ENDPOINT']) || DEFAULT_XFYUN_IAT_ENDPOINT,
  };
}

function assertValidEndpoint(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
    throw new Error('XFYUN_IAT_ENDPOINT must use ws or wss');
  }
  return url;
}

export async function createXfyunIatWebSocketUrl({
  apiKey,
  apiSecret,
  endpoint = DEFAULT_XFYUN_IAT_ENDPOINT,
  now = new Date(),
} = {}) {
  if (!apiKey || !apiSecret) throw new Error('语音识别服务密钥未配置');

  const url = assertValidEndpoint(endpoint);
  const host = url.host;
  const date = now.toUTCString();
  const requestLine = `GET ${url.pathname || '/'} HTTP/1.1`;
  const signatureOrigin = `host: ${host}\ndate: ${date}\n${requestLine}`;
  const signature = await hmacSha256Base64(apiSecret, signatureOrigin);
  const authorizationOrigin = `api_key="${apiKey}",algorithm="hmac-sha256",headers="host date request-line",signature="${signature}"`;

  url.search = '';
  url.searchParams.set('authorization', textToBase64(authorizationOrigin));
  url.searchParams.set('date', date);
  url.searchParams.set('host', host);
  return url.toString();
}

export async function createXfyunIatSessionPayload(env = {}, options = {}) {
  const config = readXfyunIatConfig(env);
  if (!config.appId || !config.apiKey || !config.apiSecret) {
    throw new Error('语音识别服务凭据未配置');
  }

  return {
    provider: 'xfyun-iat',
    url: await createXfyunIatWebSocketUrl({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      endpoint: config.endpoint,
      now: options.now || new Date(),
    }),
    appId: config.appId,
    business: DEFAULT_BUSINESS,
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
    return json(await createXfyunIatSessionPayload(env));
  } catch (error) {
    return json({
      error: '语音识别连接失败',
      detail: error.message,
    }, { status: 503 });
  }
}
