import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRANSCRIBE_CHUNK_MS,
  createChunkedTranscriber,
  shouldFallbackFromSpeechRecognitionError,
  transcribeViaWorkersAI,
} from '../src/audio-transcription.js';

class FakeBlob {
  constructor(parts = [], options = {}) {
    this.parts = parts;
    this.type = options.type || '';
    this.size = parts.reduce((total, part) => total + (part?.size ?? String(part).length), 0);
  }
}

class FakeMediaRecorder {
  static instances = [];

  constructor(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  emit(value) {
    this.ondataavailable?.({ data: { value, size: String(value).length } });
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

test('transcribeViaWorkersAI posts audio to the same-origin transcription endpoint', async () => {
  let request;
  const text = await transcribeViaWorkersAI(new Blob(['abc'], { type: 'audio/webm' }), {
    fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json({ text: '第一段' });
    },
  });

  assert.equal(text, '第一段');
  assert.equal(request.url, '/api/transcribe');
  assert.equal(request.init.method, 'POST');
  assert.ok(request.init.body instanceof FormData);
});

test('speech recognition capability failures trigger recorder fallback', () => {
  assert.equal(shouldFallbackFromSpeechRecognitionError('network'), true);
  assert.equal(shouldFallbackFromSpeechRecognitionError('service-not-allowed'), true);
  assert.equal(shouldFallbackFromSpeechRecognitionError('language-not-supported'), true);
  assert.equal(shouldFallbackFromSpeechRecognitionError('no-speech'), false);
  assert.equal(shouldFallbackFromSpeechRecognitionError('aborted'), false);
});

test('createChunkedTranscriber records independent chunks and transcribes them in order', async () => {
  const originalBlob = globalThis.Blob;
  globalThis.Blob = FakeBlob;
  FakeMediaRecorder.instances = [];

  const timers = [];
  const transcripts = [];
  const statuses = [];
  const stoppedTracks = [];
  const stream = {
    getTracks() {
      return [{ stop: () => stoppedTracks.push('mic') }];
    },
  };

  const transcriber = createChunkedTranscriber({
    stream,
    MediaRecorderImpl: FakeMediaRecorder,
    chunkMs: TRANSCRIBE_CHUNK_MS,
    setTimeoutImpl(fn, delay) {
      timers.push({ fn, delay });
      return timers.length;
    },
    clearTimeoutImpl() {},
    transcribe: async (blob) => blob.parts.map((part) => part.value).join('+'),
    onTranscript: (text) => transcripts.push(text),
    onStatus: (status) => statuses.push(status),
  });

  try {
    transcriber.start();
    assert.equal(timers[0].delay, TRANSCRIBE_CHUNK_MS);
    FakeMediaRecorder.instances[0].emit('a');
    timers[0].fn();
    assert.equal(FakeMediaRecorder.instances.length, 2);

    FakeMediaRecorder.instances[1].emit('b');
    const result = await transcriber.stop();

    assert.deepEqual(transcripts, ['a', 'b']);
    assert.deepEqual(stoppedTracks, ['mic']);
    assert.equal(result.errorCount, 0);
    assert.ok(statuses.includes('transcribing'));
  } finally {
    globalThis.Blob = originalBlob;
  }
});

test('createChunkedTranscriber cancel stops recording without transcribing the current chunk', async () => {
  const originalBlob = globalThis.Blob;
  globalThis.Blob = FakeBlob;
  FakeMediaRecorder.instances = [];

  const stoppedTracks = [];
  const stream = {
    getTracks() {
      return [{ stop: () => stoppedTracks.push('mic') }];
    },
  };

  let transcribeCount = 0;
  const transcriber = createChunkedTranscriber({
    stream,
    MediaRecorderImpl: FakeMediaRecorder,
    setTimeoutImpl() {
      return 1;
    },
    clearTimeoutImpl() {},
    transcribe: async () => {
      transcribeCount += 1;
      return 'should-not-run';
    },
  });

  try {
    transcriber.start();
    FakeMediaRecorder.instances[0].emit('discard me');
    await transcriber.stop({ cancel: true });

    assert.equal(transcribeCount, 0);
    assert.deepEqual(stoppedTracks, ['mic']);
  } finally {
    globalThis.Blob = originalBlob;
  }
});

test('createChunkedTranscriber cancel ignores already pending chunk results', async () => {
  const originalBlob = globalThis.Blob;
  globalThis.Blob = FakeBlob;
  FakeMediaRecorder.instances = [];

  const timers = [];
  const transcripts = [];
  let resolveTranscribe;
  const stream = {
    getTracks() {
      return [{ stop() {} }];
    },
  };

  const transcriber = createChunkedTranscriber({
    stream,
    MediaRecorderImpl: FakeMediaRecorder,
    setTimeoutImpl(fn) {
      timers.push(fn);
      return timers.length;
    },
    clearTimeoutImpl() {},
    transcribe: async () => new Promise((resolve) => {
      resolveTranscribe = resolve;
    }),
    onTranscript: (text) => transcripts.push(text),
  });

  try {
    transcriber.start();
    FakeMediaRecorder.instances[0].emit('pending');
    timers[0]();
    await transcriber.stop({ cancel: true });

    resolveTranscribe('late text');
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(transcripts, []);
  } finally {
    globalThis.Blob = originalBlob;
  }
});
