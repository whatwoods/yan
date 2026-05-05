import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_XFYUN_IAT_BUSINESS,
  XFYUN_IAT_FRAME_BYTES,
  buildXfyunIatFrame,
  createXfyunRealtimeTranscriber,
  downsampleTo16BitPCM,
  extractXfyunTranscriptText,
  fetchXfyunIatSession,
} from '../src/audio-transcription.js';

class FakeWebSocket {
  static instances = [];
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  emit(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code: 1000 });
  }
}

test('fetchXfyunIatSession requests a same-origin signed websocket session', async () => {
  let request;
  const session = await fetchXfyunIatSession({
    fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json({
        provider: 'xfyun-iat',
        url: 'wss://iat-api.xfyun.cn/v2/iat?authorization=abc',
        appId: 'app123',
        business: DEFAULT_XFYUN_IAT_BUSINESS,
      });
    },
  });

  assert.equal(request.url, '/api/transcribe');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.headers.accept, 'application/json');
  assert.equal(session.provider, 'xfyun-iat');
  assert.equal(session.appId, 'app123');
  assert.match(session.url, /^wss:\/\/iat-api\.xfyun\.cn\/v2\/iat/);
});

test('fetchXfyunIatSession reports connection failures without provider-specific wording', async () => {
  await assert.rejects(
    fetchXfyunIatSession({
      fetchImpl: async () => Response.json({ error: 'failed' }, { status: 503 }),
    }),
    /语音识别连接失败: 503/,
  );
});

test('buildXfyunIatFrame sends app and business fields only on the first frame', () => {
  const first = JSON.parse(buildXfyunIatFrame({
    status: 0,
    appId: 'app123',
    business: DEFAULT_XFYUN_IAT_BUSINESS,
    audio: new Uint8Array([1, 2, 3, 4]),
  }));
  const next = JSON.parse(buildXfyunIatFrame({
    status: 1,
    appId: 'app123',
    business: DEFAULT_XFYUN_IAT_BUSINESS,
    audio: new Uint8Array([5, 6]),
  }));

  assert.deepEqual(first.common, { app_id: 'app123' });
  assert.deepEqual(first.business, DEFAULT_XFYUN_IAT_BUSINESS);
  assert.equal(first.data.status, 0);
  assert.equal(first.data.format, 'audio/L16;rate=16000');
  assert.equal(first.data.encoding, 'raw');
  assert.equal(first.data.audio, 'AQIDBA==');

  assert.equal(next.common, undefined);
  assert.equal(next.business, undefined);
  assert.equal(next.data.status, 1);
  assert.equal(next.data.audio, 'BQY=');
});

test('downsampleTo16BitPCM returns 16 kHz signed little-endian pcm', () => {
  const pcm = downsampleTo16BitPCM(
    Float32Array.from([-1, -0.5, 0, 0.5, 1]),
    32000,
    16000,
  );
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);

  assert.equal(pcm.byteLength, 4);
  assert.equal(view.getInt16(0, true), -24576);
  assert.equal(view.getInt16(2, true), 8191);
});

test('extractXfyunTranscriptText reads websocket recognition words', () => {
  const text = extractXfyunTranscriptText({
    code: 0,
    data: {
      result: {
        ws: [
          { cw: [{ w: '今天' }] },
          { cw: [{ w: '开会' }] },
          { cw: [{ w: '。' }] },
        ],
      },
    },
  });

  assert.equal(text, '今天开会。');
});

test('createXfyunRealtimeTranscriber streams pcm frames and appends returned text', async () => {
  FakeWebSocket.instances = [];
  let emitPcm;
  let audioStopped = false;
  const transcripts = [];
  const statuses = [];

  const transcriber = createXfyunRealtimeTranscriber({
    getSession: async () => ({
      provider: 'xfyun-iat',
      url: 'wss://iat-api.xfyun.cn/v2/iat?authorization=abc',
      appId: 'app123',
      business: DEFAULT_XFYUN_IAT_BUSINESS,
    }),
    WebSocketImpl: FakeWebSocket,
    closeTimeoutMs: 1,
    createAudioInput: async ({ onPcm }) => {
      emitPcm = onPcm;
      return {
        stop: async () => {
          audioStopped = true;
        },
      };
    },
    onTranscript: (text) => transcripts.push(text),
    onStatus: (status) => statuses.push(status),
  });

  const startPromise = transcriber.start();
  await Promise.resolve();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  await startPromise;

  emitPcm(new Uint8Array(XFYUN_IAT_FRAME_BYTES + 2).fill(7));
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].data.status, 0);

  socket.emit({
    code: 0,
    data: {
      status: 1,
      result: { ws: [{ cw: [{ w: '你好' }] }] },
    },
  });
  assert.deepEqual(transcripts, ['你好']);

  await transcriber.stop();

  assert.equal(audioStopped, true);
  assert.equal(socket.sent.at(-1).data.status, 2);
  assert.deepEqual(statuses, ['connecting', 'listening', 'finishing', 'stopped']);
});
