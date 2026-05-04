import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import viteConfig, { resolveWebDAVProxyRequest } from '../vite.config.js';

const serviceWorkerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function flattenPlugins(plugins = []) {
  return plugins.flat(Infinity).filter(Boolean);
}

test('Vite installs the WebDAV proxy through plugin hooks', () => {
  assert.equal(viteConfig.server?.middleware, undefined);

  const plugin = flattenPlugins(viteConfig.plugins).find((item) => item.name === 'yan-webdav-proxy');

  assert.ok(plugin, 'vite.config.js should install the yan-webdav-proxy plugin');
  assert.equal(typeof plugin.configureServer, 'function');
  assert.equal(typeof plugin.configurePreviewServer, 'function');
});

test('WebDAV proxy resolver preserves provider base paths', () => {
  const resolved = resolveWebDAVProxyRequest(
    '/dav/https%3A%2F%2Fdav.jianguoyun.com%2Fdav/yan/notes/2026/05'
  );

  assert.equal(resolved.targetUrl.protocol, 'https:');
  assert.equal(resolved.targetUrl.hostname, 'dav.jianguoyun.com');
  assert.equal(resolved.requestPath, '/dav/yan/notes/2026/05');
});

test('service worker bypasses WebDAV proxy traffic', () => {
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\('\/dav\/'\)/);
});
