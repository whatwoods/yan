import assert from 'node:assert/strict';
import test from 'node:test';

import { downloadElementLongScreenshot, screenshotFileName } from '../src/export-screenshot.js';

function createFakeDocument() {
  const appended = [];
  const documentRef = {
    documentElement: {},
    body: {
      appendChild(node) {
        appended.push(node);
      },
    },
    createElement(tag) {
      assert.equal(tag, 'a');
      return {
        href: '',
        download: '',
        clicked: false,
        removed: false,
        click() {
          this.clicked = true;
        },
        remove() {
          this.removed = true;
        },
      };
    },
    defaultView: {
      devicePixelRatio: 3,
      getComputedStyle() {
        return {
          getPropertyValue(name) {
            return name === '--paper' ? '#f4ede1' : '';
          },
        };
      },
    },
  };

  return { documentRef, appended };
}

test('screenshotFileName sanitizes file names and uses png extension', () => {
  const fileName = screenshotFileName('砚/知:测*试?', new Date('2026-05-03T12:00:00Z'));

  assert.equal(fileName, '砚知测试-洞察长图-2026-05-03.png');
});

test('downloadElementLongScreenshot captures the full scroll area and downloads a png', async () => {
  const { documentRef, appended } = createFakeDocument();
  const revoked = [];
  const element = {
    ownerDocument: documentRef,
    dataset: {},
    scrollTop: 48,
    scrollWidth: 320,
    scrollHeight: 980,
    getBoundingClientRect() {
      return { width: 300, height: 520 };
    },
  };
  let capturedOptions;

  await downloadElementLongScreenshot(element, {
    personaName: '砚',
    now: new Date('2026-05-03T12:00:00Z'),
    documentRef,
    urlRef: {
      createObjectURL(blob) {
        assert.equal(blob.kind, 'blob');
        return 'blob:shot';
      },
      revokeObjectURL(url) {
        revoked.push(url);
      },
    },
    html2canvasImpl: async (node, options) => {
      assert.equal(node, element);
      capturedOptions = options;
      options.onclone({
        querySelector(selector) {
          assert.match(selector, /^\[data-export-shot="/);
          return { style: {}, scrollTop: 10 };
        },
      });
      return {
        toBlob(callback, type) {
          assert.equal(type, 'image/png');
          callback({ kind: 'blob' });
        },
      };
    },
    revokeDelay: 0,
  });

  assert.equal(capturedOptions.width, 320);
  assert.equal(capturedOptions.height, 980);
  assert.equal(capturedOptions.windowWidth, 320);
  assert.equal(capturedOptions.windowHeight, 980);
  assert.equal(capturedOptions.scale, 2);
  assert.equal(capturedOptions.backgroundColor, '#f4ede1');
  assert.equal(appended.length, 1);
  assert.equal(appended[0].href, 'blob:shot');
  assert.equal(appended[0].download, '砚-洞察长图-2026-05-03.png');
  assert.equal(appended[0].clicked, true);
  assert.equal(appended[0].removed, true);
  assert.deepEqual(revoked, ['blob:shot']);
  assert.equal(element.scrollTop, 48);
  assert.deepEqual(element.dataset, {});
});

test('downloadElementLongScreenshot rejects missing export content', async () => {
  await assert.rejects(
    () => downloadElementLongScreenshot(null, { html2canvasImpl: async () => ({}) }),
    /没有可导出的内容/,
  );
});
