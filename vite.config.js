import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';
import https from 'node:https';
import { createAzureSpeechSessionPayload } from './functions/api/transcribe.js';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, PROPFIND, MKCOL, OPTIONS',
};

const API_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
  'cache-control': 'no-store',
};

function joinProxyPath(basePath, restPath) {
  const base = basePath && basePath !== '/' ? basePath.replace(/\/+$/, '') : '';
  const rest = restPath || '/';
  const normalizedRest = rest.startsWith('/') ? rest : `/${rest}`;
  return `${base}${normalizedRest}` || '/';
}

export function resolveWebDAVProxyRequest(rawUrl = '') {
  const match = rawUrl.match(/^\/dav\/([^/]+)(\/.*)?$/);
  if (!match) return null;

  let targetUrl;
  try {
    targetUrl = new URL(decodeURIComponent(match[1]));
  } catch {
    return null;
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return null;
  }

  return {
    targetUrl,
    requestPath: joinProxyPath(targetUrl.pathname, match[2] || '/'),
  };
}

function createWebDAVProxyMiddleware() {
  return (req, res, next) => {
    const resolved = resolveWebDAVProxyRequest(req.url || '');
    if (!resolved) {
      next();
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const { targetUrl, requestPath } = resolved;
    const transport = targetUrl.protocol === 'https:' ? https : http;
    const headers = {
      ...req.headers,
      host: targetUrl.host,
    };

    delete headers.connection;

    const proxyReq = transport.request({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      method: req.method,
      path: requestPath,
      headers,
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, {
        ...proxyRes.headers,
        ...CORS_HEADERS,
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (error) => {
      res.writeHead(502, {
        'content-type': 'text/plain; charset=utf-8',
        ...CORS_HEADERS,
      });
      res.end(`WebDAV proxy error: ${error.message}`);
    });

    req.pipe(proxyReq);
  };
}

function webdavProxyPlugin() {
  return {
    name: 'yan-webdav-proxy',
    configureServer(server) {
      server.middlewares.use(createWebDAVProxyMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createWebDAVProxyMiddleware());
    },
  };
}

function writeJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    ...API_CORS_HEADERS,
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(data));
}

function createAzureSpeechApiMiddleware(env = process.env) {
  return async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/api/transcribe') {
      next();
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, API_CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      writeJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    try {
      writeJson(res, 200, await createAzureSpeechSessionPayload(env));
    } catch (error) {
      writeJson(res, 503, {
        error: '语音识别连接失败',
        detail: error.message,
      });
    }
  };
}

function azureSpeechApiPlugin() {
  return {
    name: 'yan-azure-speech-api',
    configureServer(server) {
      server.middlewares.use(createAzureSpeechApiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createAzureSpeechApiMiddleware());
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), webdavProxyPlugin(), azureSpeechApiPlugin()],
});
