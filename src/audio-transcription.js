const CJK_OR_PUNCT_END = /[一-鿿　-〿＀-￯]$/;
const CJK_OR_PUNCT_START = /^[一-鿿　-〿＀-￯]/;
const LIST_MARKER_END = /(?:^|\n)(?:[-*]|\d+\.) $/;

function needsSpace(before, after) {
  if (CJK_OR_PUNCT_END.test(before) || CJK_OR_PUNCT_START.test(after)) return false;
  if (LIST_MARKER_END.test(before)) return false;
  if (before.endsWith('\n')) return false;
  return true;
}

export function appendFinalTranscript(current, next) {
  const clean = String(next || '').trim();
  if (!clean) return current;
  if (!current.trim()) return clean;
  return `${current.trimEnd()}${needsSpace(current, clean) ? ' ' : ''}${clean}`;
}

const GLOBAL_STANDARD_ENDPOINT_RE = /^https:\/\/[a-z0-9-]+\.api\.cognitive\.microsoft\.com\/?$/i;

export async function fetchAzureSpeechSession({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is not available');
  const res = await fetchImpl('/api/transcribe', {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`语音识别连接失败: ${res.status}`);

  const data = await res.json();
  if (data.provider !== 'azure-speech') {
    throw new Error('语音识别连接返回异常: 不支持的提供商');
  }
  if (!data.token || !data.region) {
    throw new Error('语音识别连接返回异常: 缺少必要参数');
  }
  return {
    provider: data.provider,
    token: data.token,
    cloud: data.cloud || 'global',
    region: data.region,
    endpoint: data.endpoint || `https://${data.region}.api.cognitive.microsoft.com/`,
    language: data.language || 'zh-CN',
    candidateLanguages: data.candidateLanguages || [],
    features: data.features || {},
  };
}

function createSpeechConfig(sdk, session) {
  let config;
  if (session.cloud === 'global' && GLOBAL_STANDARD_ENDPOINT_RE.test(session.endpoint)) {
    config = sdk.SpeechConfig.fromAuthorizationToken(session.token, session.region);
  } else {
    config = sdk.SpeechConfig.fromEndpoint(new URL(session.endpoint), '');
    config.authorizationToken = session.token;
  }
  config.speechRecognitionLanguage = session.language;

  if (session.features.trueText) {
    config.setProperty('SpeechServiceResponse_PostProcessingOption', 'TrueText');
  }
  return config;
}

export function createRealtimeTranscriber({
  fetchSession = fetchAzureSpeechSession,
  speechSdk = null,
  onTranscript = () => {},
  onInterim = () => {},
  onStatus = () => {},
  onError = () => {},
  now = () => Date.now(),
} = {}) {
  let recognizer = null;
  let running = false;
  let tokenRefreshTimer = null;
  let currentSession = null;
  let sdk = speechSdk;
  let errorCount = 0;

  function clearTokenRefresh() {
    if (tokenRefreshTimer) {
      clearInterval(tokenRefreshTimer);
      tokenRefreshTimer = null;
    }
  }

  function startTokenRefresh(getRecognizer) {
    clearTokenRefresh();
    tokenRefreshTimer = setInterval(async () => {
      try {
        const fresh = await fetchSession();
        const rec = getRecognizer();
        if (rec) rec.authorizationToken = fresh.token;
      } catch {
        // token refresh failures are non-fatal; the existing token may still be valid
      }
    }, 8.5 * 60 * 1000);
  }

  async function start() {
    if (running) return;
    running = true;
    errorCount = 0;
    onStatus('connecting');

    try {
      currentSession = await fetchSession();
    } catch (err) {
      running = false;
      onStatus('stopped');
      throw new Error(`语音识别连接失败: ${err.message}`);
    }

    if (!sdk) {
      try {
        sdk = await import('microsoft-cognitiveservices-speech-sdk');
      } catch (err) {
        running = false;
        onStatus('stopped');
        throw new Error(`语音识别SDK加载失败: ${err.message}`);
      }
    }

    const sdkRef = sdk;
    const config = createSpeechConfig(sdkRef, currentSession);
    const audioConfig = sdkRef.AudioConfig.fromDefaultMicrophoneInput();

    const { candidateLanguages, features } = currentSession;
    if (features.languageIdentification === 'AtStart' && candidateLanguages.length > 1) {
      const autoDetectConfig = sdkRef.AutoDetectSourceLanguageConfig.fromLanguages(candidateLanguages);
      recognizer = sdkRef.SpeechRecognizer.FromConfig(config, autoDetectConfig, audioConfig);
    } else {
      recognizer = new sdkRef.SpeechRecognizer(config, audioConfig);
    }

    recognizer.recognizing = (_s, e) => {
      if (e.result.reason === sdkRef.ResultReason.RecognizingSpeech) {
        onInterim(e.result.text);
      }
    };

    recognizer.recognized = (_s, e) => {
      if (e.result.reason === sdkRef.ResultReason.RecognizedSpeech) {
        onTranscript(e.result.text, { resultType: 'final' });
      }
    };

    recognizer.canceled = (_s, e) => {
      const details = e.errorDetails || sdkRef.CancellationReason[e.reason] || '未知错误';
      errorCount += 1;
      onError(new Error(`语音识别取消: ${details}`));
      running = false;
      clearTokenRefresh();
      onStatus('stopped');
    };

    recognizer.sessionStopped = () => {
      running = false;
      clearTokenRefresh();
      onStatus('stopped');
    };

    return new Promise((resolve, reject) => {
      recognizer.startContinuousRecognitionAsync(
        () => {
          onStatus('listening');
          startTokenRefresh(() => recognizer);
          resolve();
        },
        (err) => {
          running = false;
          recognizer?.close?.();
          recognizer = null;
          onStatus('stopped');
          reject(new Error(`语音识别启动失败: ${err}`));
        },
      );
    });
  }

  function stop({ cancel = false } = {}) {
    if (!recognizer) {
      running = false;
      clearTokenRefresh();
      return Promise.resolve({ errorCount });
    }

    const rec = recognizer;
    recognizer = null;
    running = false;
    clearTokenRefresh();

    if (cancel) {
      onStatus('cancelled');
      return new Promise((resolve) => {
        rec.stopContinuousRecognitionAsync(
          () => { rec.close(); resolve({ errorCount }); },
          () => { rec.close(); resolve({ errorCount }); },
        );
      });
    }

    onStatus('finishing');
    return new Promise((resolve) => {
      rec.stopContinuousRecognitionAsync(
        () => {
          onStatus('stopped');
          rec.close();
          resolve({ errorCount });
        },
        (err) => {
          errorCount += 1;
          onError(new Error(`语音识别停止失败: ${err}`));
          onStatus('stopped');
          rec.close();
          resolve({ errorCount });
        },
      );
    });
  }

  function isRunning() {
    return running;
  }

  return { start, stop, isRunning };
}
