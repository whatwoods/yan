export const XFYUN_IAT_SAMPLE_RATE = 16000;
export const XFYUN_IAT_FRAME_BYTES = 1280;
export const XFYUN_IAT_AUDIO_FORMAT = 'audio/L16;rate=16000';
export const XFYUN_IAT_ENDPOINT = 'wss://iat-api.xfyun.cn/v2/iat';

export const DEFAULT_XFYUN_IAT_BUSINESS = Object.freeze({
  language: 'zh_cn',
  domain: 'iat',
  accent: 'mandarin',
  eos: 10000,
  ptt: 1,
  nunum: 1,
  rlang: 'zh-cn',
});

function getGlobalScope() {
  if (typeof window !== 'undefined') return window;
  return globalThis;
}

function toUint8Array(bytes) {
  if (!bytes) return new Uint8Array();
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
}

export function bytesToBase64(bytes) {
  const raw = toUint8Array(bytes);
  if (typeof btoa === 'function') {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < raw.length; i += chunkSize) {
      binary += String.fromCharCode(...raw.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') return Buffer.from(raw).toString('base64');
  throw new Error('No base64 encoder is available');
}

function sampleToInt16(sample) {
  const clamped = Math.max(-1, Math.min(1, sample || 0));
  return clamped < 0
    ? Math.round(clamped * 0x8000)
    : Math.floor(clamped * 0x7fff);
}

export function downsampleTo16BitPCM(input, inputSampleRate, outputSampleRate = XFYUN_IAT_SAMPLE_RATE) {
  if (!input?.length) return new Uint8Array();
  if (!inputSampleRate || inputSampleRate <= outputSampleRate) {
    const output = new Uint8Array(input.length * 2);
    const view = new DataView(output.buffer);
    input.forEach((sample, index) => view.setInt16(index * 2, sampleToInt16(sample), true));
    return output;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Uint8Array(outputLength * 2);
  const view = new DataView(output.buffer);
  let inputOffset = 0;

  for (let outputOffset = 0; outputOffset < outputLength; outputOffset += 1) {
    const nextInputOffset = Math.min(input.length, Math.round((outputOffset + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let i = inputOffset; i < nextInputOffset; i += 1) {
      sum += input[i];
      count += 1;
    }
    view.setInt16(outputOffset * 2, sampleToInt16(sum / Math.max(1, count)), true);
    inputOffset = nextInputOffset;
  }

  return output;
}

export function buildXfyunIatFrame({
  status,
  appId,
  business = DEFAULT_XFYUN_IAT_BUSINESS,
  audio = new Uint8Array(),
} = {}) {
  const frame = {
    data: {
      status,
      format: XFYUN_IAT_AUDIO_FORMAT,
      encoding: 'raw',
      audio: bytesToBase64(audio),
    },
  };

  if (status === 0) {
    frame.common = { app_id: appId };
    frame.business = business;
  }

  return JSON.stringify(frame);
}

export async function fetchXfyunIatSession({ fetchImpl = getGlobalScope().fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is not available');
  const res = await fetchImpl('/api/transcribe', {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`语音识别连接失败: ${res.status}`);

  const data = await res.json();
  if (data.provider !== 'xfyun-iat' || !data.url || !data.appId) {
    throw new Error('语音识别连接返回异常');
  }
  return {
    provider: data.provider,
    url: data.url,
    appId: data.appId,
    business: data.business || DEFAULT_XFYUN_IAT_BUSINESS,
  };
}

export function extractXfyunTranscriptText(message) {
  const result = message?.data?.result;
  if (!result?.ws) return '';
  return result.ws
    .map((word) => word.cw?.[0]?.w || '')
    .join('')
    .trim();
}

function concatBytes(left, right) {
  const a = toUint8Array(left);
  const b = toUint8Array(right);
  if (!a.length) return b;
  if (!b.length) return a;
  const combined = new Uint8Array(a.length + b.length);
  combined.set(a, 0);
  combined.set(b, a.length);
  return combined;
}

export async function createBrowserPcmAudioInput({
  onPcm,
  mediaDevices = getGlobalScope().navigator?.mediaDevices,
  AudioContextImpl = getGlobalScope().AudioContext || getGlobalScope().webkitAudioContext,
  inputBufferSize = 4096,
  outputSampleRate = XFYUN_IAT_SAMPLE_RATE,
} = {}) {
  if (typeof onPcm !== 'function') throw new Error('PCM callback is required');
  if (!mediaDevices?.getUserMedia) throw new Error('Microphone capture is not available');
  if (!AudioContextImpl) throw new Error('Web Audio is not available');

  const stream = await mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const audioContext = new AudioContextImpl();
  await audioContext.resume?.();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(inputBufferSize, 1, 1);

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const pcm = downsampleTo16BitPCM(input, audioContext.sampleRate, outputSampleRate);
    if (pcm.length) onPcm(pcm);
    event.outputBuffer?.getChannelData?.(0)?.fill?.(0);
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return {
    async stop() {
      processor.disconnect?.();
      source.disconnect?.();
      stream.getTracks?.().forEach((track) => track.stop());
      await audioContext.close?.();
    },
  };
}

export function createXfyunRealtimeTranscriber({
  getSession = fetchXfyunIatSession,
  WebSocketImpl = getGlobalScope().WebSocket,
  createAudioInput = createBrowserPcmAudioInput,
  frameBytes = XFYUN_IAT_FRAME_BYTES,
  closeTimeoutMs = 3000,
  onTranscript = () => {},
  onStatus = () => {},
  onError = () => {},
  setTimeoutImpl = getGlobalScope().setTimeout?.bind(getGlobalScope()),
  clearTimeoutImpl = getGlobalScope().clearTimeout?.bind(getGlobalScope()),
} = {}) {
  if (typeof getSession !== 'function') throw new Error('Session factory is required');
  if (!WebSocketImpl) throw new Error('WebSocket is not available');

  let socket = null;
  let session = null;
  let audioInput = null;
  let running = false;
  let firstFrameSent = false;
  let pcmBuffer = new Uint8Array();
  let errorCount = 0;
  const closeWaiters = new Set();
  const socketOpenState = WebSocketImpl.OPEN ?? 1;
  const socketClosedState = WebSocketImpl.CLOSED ?? 3;

  function isSocketOpen() {
    return socket?.readyState === socketOpenState;
  }

  function notifyClose() {
    closeWaiters.forEach((resolve) => resolve());
    closeWaiters.clear();
  }

  function sendFrame(status, audio) {
    if (!isSocketOpen()) return;
    socket.send(buildXfyunIatFrame({
      status,
      appId: session.appId,
      business: session.business || DEFAULT_XFYUN_IAT_BUSINESS,
      audio,
    }));
    if (status === 0) firstFrameSent = true;
  }

  function flushPcm({ force = false } = {}) {
    if (!running && !force) return;
    while (pcmBuffer.length >= frameBytes) {
      const chunk = pcmBuffer.subarray(0, frameBytes);
      pcmBuffer = pcmBuffer.subarray(frameBytes);
      sendFrame(firstFrameSent ? 1 : 0, chunk);
    }
    if (force && pcmBuffer.length) {
      sendFrame(firstFrameSent ? 1 : 0, pcmBuffer);
      pcmBuffer = new Uint8Array();
    }
  }

  function handleMessage(payload) {
    let message;
    try {
      message = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.data);
    } catch (error) {
      errorCount += 1;
      onError(error);
      return;
    }

    if (message.code && message.code !== 0) {
      errorCount += 1;
      onError(new Error(`语音识别服务错误: ${message.code}`));
      return;
    }

    const transcript = extractXfyunTranscriptText(message);
    if (transcript) onTranscript(transcript);
    if (message.data?.status === 2) {
      socket?.close?.(1000, 'done');
    }
  }

  function waitForSocketOpen() {
    return new Promise((resolve, reject) => {
      if (isSocketOpen()) {
        resolve();
        return;
      }
      socket.onopen = () => resolve();
      socket.onerror = (event) => {
        errorCount += 1;
        reject(new Error(event?.message || '语音识别连接失败'));
      };
    });
  }

  function waitForSocketClose(timeoutMs) {
    return new Promise((resolve) => {
      if (!socket || socket.readyState === socketClosedState) {
        resolve();
        return;
      }
      const finish = () => {
        if (timer) clearTimeoutImpl?.(timer);
        resolve();
      };
      const timer = setTimeoutImpl?.(() => {
        closeWaiters.delete(finish);
        socket?.close?.(1000, 'timeout');
        resolve();
      }, timeoutMs);
      closeWaiters.add(finish);
    });
  }

  async function cleanupAudio() {
    const current = audioInput;
    audioInput = null;
    await current?.stop?.();
  }

  return {
    async start() {
      if (running) return;
      running = true;
      firstFrameSent = false;
      pcmBuffer = new Uint8Array();
      errorCount = 0;
      onStatus('connecting');

      try {
        session = await getSession();
        socket = new WebSocketImpl(session.url);
        socket.onmessage = (event) => handleMessage(event.data);
        socket.onclose = notifyClose;
        await waitForSocketOpen();
        socket.onerror = (event) => {
          errorCount += 1;
          onError(new Error(event?.message || '语音识别连接失败'));
        };

        if (!running) {
          socket.close?.(1000, 'cancelled');
          return;
        }

        audioInput = await createAudioInput({
          sampleRate: XFYUN_IAT_SAMPLE_RATE,
          onPcm: (pcm) => {
            pcmBuffer = concatBytes(pcmBuffer, pcm);
            flushPcm();
          },
        });
        onStatus('listening');
      } catch (error) {
        running = false;
        await cleanupAudio();
        socket?.close?.(1000, 'failed');
        throw error;
      }
    },

    async stop({ cancel = false } = {}) {
      running = false;
      await cleanupAudio();

      if (socket && isSocketOpen()) {
        if (cancel) {
          pcmBuffer = new Uint8Array();
          socket.close?.(1000, 'cancelled');
        } else {
          onStatus('finishing');
          flushPcm({ force: true });
          if (!firstFrameSent) sendFrame(0, new Uint8Array());
          sendFrame(2, new Uint8Array());
          await waitForSocketClose(closeTimeoutMs);
        }
      }

      if (!cancel && socket && socket.readyState !== socketClosedState) {
        socket.close?.(1000, 'stopped');
      }

      onStatus(cancel ? 'cancelled' : 'stopped');
      return { errorCount };
    },

    isRunning() {
      return running;
    },
  };
}
