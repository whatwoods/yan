import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendFinalTranscript,
  createRealtimeTranscriber,
  fetchAzureSpeechSession,
} from '../src/audio-transcription.js';

// ---------------------------------------------------------------------------
// Fake Azure Speech SDK — mirrors the real SDK's API shape
// ---------------------------------------------------------------------------

const ResultReason = { RecognizedSpeech: 3, NoMatch: 2, Canceled: 4, RecognizingSpeech: 1 };
const CancellationReason = { Error: 1, EndOfStream: 2, CancelledByUser: 3 };

class FakeSpeechRecognizer {
  constructor(config, audioConfig) {
    this.config = config;
    this.audioConfig = audioConfig;
    this.authorizationToken = config?.authorizationToken || '';
    this.recognizing = null;
    this.recognized = null;
    this.canceled = null;
    this.sessionStopped = null;
    this._closed = false;
  }

  startContinuousRecognitionAsync(successCb, errorCb) {
    try { successCb(); } catch { errorCb('start failed'); }
  }

  stopContinuousRecognitionAsync(successCb, errorCb) {
    try { successCb(); } catch { errorCb('stop failed'); }
  }

  close() {
    this._closed = true;
  }
}

const FakeAutoDetectSourceLanguageConfig = {
  fromLanguages: (langs) => ({ languages: langs }),
};

const FakeSpeechConfig = {
  fromAuthorizationToken: (token, region) => ({
    speechRecognitionLanguage: '',
    authorizationToken: token,
    region,
    _properties: {},
    setProperty(key, value) { this._properties[key] = value; },
  }),
  fromEndpoint: (url, key) => ({
    speechRecognitionLanguage: '',
    authorizationToken: '',
    _properties: {},
    setProperty(key, value) { this._properties[key] = value; },
  }),
};

const FakeAudioConfig = {
  fromDefaultMicrophoneInput: () => ({ source: 'microphone' }),
};

const fakeSpeechSdk = {
  ResultReason,
  CancellationReason,
  SpeechConfig: FakeSpeechConfig,
  AudioConfig: FakeAudioConfig,
  AutoDetectSourceLanguageConfig: FakeAutoDetectSourceLanguageConfig,
  SpeechRecognizer: Object.assign(
    (config, audioConfig) => new FakeSpeechRecognizer(config, audioConfig),
    { FromConfig: (config, autoDetect, audio) => new FakeSpeechRecognizer(config, audio) },
  ),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_PAYLOAD = {
  provider: 'azure-speech',
  token: 'test-token',
  cloud: 'global',
  region: 'eastasia',
  endpoint: 'https://eastasia.api.cognitive.microsoft.com/',
  language: 'zh-CN',
  candidateLanguages: ['zh-CN', 'en-US'],
  features: { trueText: true, languageIdentification: 'AtStart' },
  expiresInSeconds: 540,
};

function makeFetchSession(overrides = {}) {
  return async () => ({ ...SESSION_PAYLOAD, ...overrides });
}

// ---------------------------------------------------------------------------
// fetchAzureSpeechSession
// ---------------------------------------------------------------------------

test('fetchAzureSpeechSession requests a same-origin Azure speech session', async () => {
  let request;
  const session = await fetchAzureSpeechSession({
    fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json(SESSION_PAYLOAD);
    },
  });

  assert.equal(request.url, '/api/transcribe');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.headers.accept, 'application/json');
  assert.equal(session.provider, 'azure-speech');
  assert.equal(session.token, 'test-token');
  assert.equal(session.cloud, 'global');
  assert.equal(session.region, 'eastasia');
  assert.equal(session.endpoint, 'https://eastasia.api.cognitive.microsoft.com/');
  assert.equal(session.language, 'zh-CN');
  assert.deepEqual(session.candidateLanguages, ['zh-CN', 'en-US']);
  assert.deepEqual(session.features, { trueText: true, languageIdentification: 'AtStart' });
});

test('fetchAzureSpeechSession reports connection failures', async () => {
  await assert.rejects(
    fetchAzureSpeechSession({
      fetchImpl: async () => Response.json({ error: 'failed' }, { status: 503 }),
    }),
    /语音识别连接失败: 503/,
  );
});

// ---------------------------------------------------------------------------
// createRealtimeTranscriber
// ---------------------------------------------------------------------------

test('createRealtimeTranscriber starts and stops Azure recognizer', async () => {
  const transcripts = [];
  const interimTexts = [];
  const statuses = [];
  let capturedRecognizer = null;

  const originalFromConfig = fakeSpeechSdk.SpeechRecognizer.FromConfig;
  fakeSpeechSdk.SpeechRecognizer.FromConfig = (config, autoDetect, audio) => {
    const rec = new FakeSpeechRecognizer(config, audio);
    capturedRecognizer = rec;
    return rec;
  };

  try {
    const transcriber = createRealtimeTranscriber({
      fetchSession: makeFetchSession(),
      speechSdk: fakeSpeechSdk,
      onTranscript: (text) => transcripts.push(text),
      onInterim: (text) => interimTexts.push(text),
      onStatus: (s) => statuses.push(s),
    });

    await transcriber.start();

    assert.ok(capturedRecognizer, 'recognizer should be created');
    assert.equal(capturedRecognizer.authorizationToken, 'test-token');
    assert.deepEqual(statuses, ['connecting', 'listening']);

    // Simulate interim result
    capturedRecognizer.recognizing(null, {
      result: { reason: ResultReason.RecognizingSpeech, text: '你好世' },
    });
    assert.deepEqual(interimTexts, ['你好世']);

    // Simulate final result
    capturedRecognizer.recognized(null, {
      result: { reason: ResultReason.RecognizedSpeech, text: '你好世界' },
    });
    assert.deepEqual(transcripts, ['你好世界']);

    const stopResult = await transcriber.stop();
    assert.deepEqual(stopResult, { errorCount: 0 });
    assert.deepEqual(statuses, ['connecting', 'listening', 'finishing', 'stopped']);
    assert.equal(capturedRecognizer._closed, true);
  } finally {
    fakeSpeechSdk.SpeechRecognizer.FromConfig = originalFromConfig;
  }
});

test('createRealtimeTranscriber handles cancel', async () => {
  const statuses = [];
  let capturedRecognizer = null;

  const originalFromConfig = fakeSpeechSdk.SpeechRecognizer.FromConfig;
  fakeSpeechSdk.SpeechRecognizer.FromConfig = (config, autoDetect, audio) => {
    const rec = new FakeSpeechRecognizer(config, audio);
    capturedRecognizer = rec;
    return rec;
  };

  try {
    const transcriber = createRealtimeTranscriber({
      fetchSession: makeFetchSession(),
      speechSdk: fakeSpeechSdk,
      onStatus: (s) => statuses.push(s),
    });

    await transcriber.start();
    assert.deepEqual(statuses, ['connecting', 'listening']);

    const stopResult = await transcriber.stop({ cancel: true });
    assert.deepEqual(stopResult, { errorCount: 0 });
    assert.ok(statuses.includes('cancelled'), 'should emit cancelled status');
    assert.equal(capturedRecognizer._closed, true);
  } finally {
    fakeSpeechSdk.SpeechRecognizer.FromConfig = originalFromConfig;
  }
});

test('createRealtimeTranscriber throws on session fetch failure', async () => {
  const statuses = [];

  const transcriber = createRealtimeTranscriber({
    fetchSession: async () => { throw new Error('network down'); },
    speechSdk: fakeSpeechSdk,
    onStatus: (s) => statuses.push(s),
  });

  await assert.rejects(transcriber.start(), /语音识别连接失败: network down/);

  assert.ok(statuses.includes('stopped'));
  assert.equal(transcriber.isRunning(), false);
});

test('createRealtimeTranscriber throws and closes recognizer on start failure', async () => {
  const statuses = [];
  let capturedRecognizer = null;

  class StartFailRecognizer extends FakeSpeechRecognizer {
    startContinuousRecognitionAsync(_successCb, errorCb) {
      errorCb('start failed');
    }
  }

  const originalFromConfig = fakeSpeechSdk.SpeechRecognizer.FromConfig;
  fakeSpeechSdk.SpeechRecognizer.FromConfig = (config, autoDetect, audio) => {
    const rec = new StartFailRecognizer(config, audio);
    capturedRecognizer = rec;
    return rec;
  };

  try {
    const transcriber = createRealtimeTranscriber({
      fetchSession: makeFetchSession(),
      speechSdk: fakeSpeechSdk,
      onStatus: (s) => statuses.push(s),
    });

    await assert.rejects(transcriber.start(), /语音识别启动失败: start failed/);
    assert.equal(capturedRecognizer._closed, true);
    assert.deepEqual(statuses, ['connecting', 'stopped']);
    assert.equal(transcriber.isRunning(), false);
  } finally {
    fakeSpeechSdk.SpeechRecognizer.FromConfig = originalFromConfig;
  }
});

test('createRealtimeTranscriber counts runtime cancellation errors', async () => {
  const errors = [];
  let capturedRecognizer = null;

  const originalFromConfig = fakeSpeechSdk.SpeechRecognizer.FromConfig;
  fakeSpeechSdk.SpeechRecognizer.FromConfig = (config, autoDetect, audio) => {
    const rec = new FakeSpeechRecognizer(config, audio);
    capturedRecognizer = rec;
    return rec;
  };

  try {
    const transcriber = createRealtimeTranscriber({
      fetchSession: makeFetchSession(),
      speechSdk: fakeSpeechSdk,
      onError: (err) => errors.push(err),
    });

    await transcriber.start();
    capturedRecognizer.canceled(null, {
      reason: CancellationReason.Error,
      errorDetails: 'network lost',
    });

    const result = await transcriber.stop();
    assert.equal(result.errorCount, 1);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /network lost/);
  } finally {
    fakeSpeechSdk.SpeechRecognizer.FromConfig = originalFromConfig;
  }
});

// ---------------------------------------------------------------------------
// appendFinalTranscript
// ---------------------------------------------------------------------------

test('appendFinalTranscript joins text with appropriate spacing', () => {
  assert.equal(appendFinalTranscript('', 'hello'), 'hello');
  assert.equal(appendFinalTranscript('hello', 'world'), 'hello world');
  assert.equal(appendFinalTranscript('你好', '世界'), '你好世界');
  assert.equal(appendFinalTranscript('hello', '你好'), 'hello你好');
  assert.equal(appendFinalTranscript('你好', 'hello'), '你好hello');
});
