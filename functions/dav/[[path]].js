const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, OPTIONS',
};

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'PROPFIND', 'MKCOL', 'OPTIONS']);

function joinProxyPath(basePath, restPath) {
  const base = basePath && basePath !== '/' ? basePath.replace(/\/+$/, '') : '';
  const rest = restPath || '/';
  const normalizedRest = rest.startsWith('/') ? rest : `/${rest}`;
  return `${base}${normalizedRest}` || '/';
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  if (host === '0.0.0.0' || host === '127.0.0.1' || host === '::1') return true;

  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;

  const [a, b] = ipv4.slice(1, 3).map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function isHostAllowed(hostname, env = {}) {
  const configured = (env.DAV_ALLOWED_HOSTS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (configured.length === 0) return !isPrivateHostname(hostname);

  const host = hostname.toLowerCase();
  return configured.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function resolveWebDAVTarget(rawUrl, env = {}) {
  const url = new URL(rawUrl);
  const match = url.pathname.match(/^\/dav\/([^/]+)(\/.*)?$/);
  if (!match) return null;

  let targetUrl;
  try {
    targetUrl = new URL(decodeURIComponent(match[1]));
  } catch {
    return null;
  }

  const allowInsecure = env.DAV_ALLOW_INSECURE_HTTP === '1';
  if (targetUrl.protocol !== 'https:' && !(allowInsecure && targetUrl.protocol === 'http:')) {
    return null;
  }

  if (!isHostAllowed(targetUrl.hostname, env)) return null;

  targetUrl.pathname = joinProxyPath(targetUrl.pathname, match[2] || '/');
  targetUrl.search = '';
  targetUrl.hash = '';
  return targetUrl;
}

function proxyHeaders(headers) {
  const next = new Headers();
  for (const [key, value] of headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    next.set(key, value);
  }
  return next;
}

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  headers.set('cache-control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response('Method not allowed', {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  const targetUrl = resolveWebDAVTarget(request.url, env);
  if (!targetUrl) {
    return new Response('Invalid WebDAV proxy target', {
      status: 400,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        ...CORS_HEADERS,
      },
    });
  }

  try {
    const upstreamRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: proxyHeaders(request.headers),
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
    const upstreamResponse = await fetch(upstreamRequest);
    return withCors(upstreamResponse);
  } catch (error) {
    return new Response(`WebDAV proxy error: ${error.message}`, {
      status: 502,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        ...CORS_HEADERS,
      },
    });
  }
}
