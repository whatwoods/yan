export const TRANSCRIBE_CHUNK_MS = 4500;
const DEFAULT_MIME_TYPE = 'audio/webm;codecs=opus';

export async function transcribeViaWorkersAI(blob, { fetchImpl = fetch } = {}) {
  const form = new FormData();
  form.append('file', blob, 'recording.webm');
  const res = await fetchImpl('/api/transcribe', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Workers AI transcription failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data.text) {
    throw new Error('Workers AI transcription returned empty text');
  }
  return data.text.trim();
}

function createRecorder(MediaRecorderImpl, stream, mimeType) {
  try {
    return new MediaRecorderImpl(stream, { mimeType });
  } catch {
    return new MediaRecorderImpl(stream);
  }
}

export function createChunkedTranscriber({
  stream,
  MediaRecorderImpl = MediaRecorder,
  mimeType = DEFAULT_MIME_TYPE,
  chunkMs = TRANSCRIBE_CHUNK_MS,
  transcribe = transcribeViaWorkersAI,
  onTranscript = () => {},
  onStatus = () => {},
  onError = () => {},
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  if (!stream) throw new Error('Audio stream is required');

  let recorder = null;
  let timer = null;
  let running = false;
  let cancelling = false;
  let pending = Promise.resolve();
  let errorCount = 0;
  let sessionId = 0;

  function clearSegmentTimer() {
    if (timer) {
      clearTimeoutImpl(timer);
      timer = null;
    }
  }

  function enqueueTranscription(blob) {
    if (!blob?.size) return;
    const segmentSessionId = sessionId;
    onStatus('transcribing');
    pending = pending
      .then(async () => {
        const transcript = await transcribe(blob);
        if (transcript && segmentSessionId === sessionId) onTranscript(transcript);
      })
      .catch((error) => {
        if (segmentSessionId !== sessionId) return;
        errorCount += 1;
        onError(error);
      });
  }

  function startSegment() {
    if (!running) return;

    const chunks = [];
    const current = createRecorder(MediaRecorderImpl, stream, mimeType);
    recorder = current;

    current.ondataavailable = (event) => {
      if (event.data?.size > 0) chunks.push(event.data);
    };

    current.onstop = () => {
      clearSegmentTimer();
      if (recorder === current) recorder = null;
      if (!cancelling) enqueueTranscription(new Blob(chunks, { type: mimeType }));
      if (running) startSegment();
    };

    current.start();
    timer = setTimeoutImpl(() => {
      if (current.state !== 'inactive') current.stop();
    }, chunkMs);
  }

  function start() {
    if (running) return;
    running = true;
    cancelling = false;
    sessionId += 1;
    errorCount = 0;
    startSegment();
  }

  async function stop({ cancel = false } = {}) {
    running = false;
    cancelling = cancel;
    if (cancel) sessionId += 1;
    clearSegmentTimer();

    const current = recorder;
    if (current && current.state !== 'inactive') {
      await new Promise((resolve) => {
        const onstop = current.onstop;
        current.onstop = (event) => {
          try {
            onstop?.call(current, event);
          } finally {
            resolve();
          }
        };
        current.stop();
      });
    }

    stream.getTracks?.().forEach((track) => track.stop());

    if (!cancel) await pending;

    onStatus(cancel ? 'cancelled' : 'stopped');
    cancelling = false;
    return { errorCount };
  }

  return {
    start,
    stop,
    isRunning: () => running,
  };
}
