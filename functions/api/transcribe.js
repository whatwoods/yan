const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const TRANSCRIBE_MODEL = '@cf/openai/whisper-large-v3-turbo';

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...(init.headers || {}),
    },
  });
}

async function readAudioFile(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file') || form.get('audio');
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('missing audio file');
    }
    return file;
  }

  const bytes = await request.arrayBuffer();
  return new Blob([bytes], {
    type: contentType || 'application/octet-stream',
  });
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (!env.AI || typeof env.AI.run !== 'function') {
    return json({ error: 'Cloudflare Workers AI binding AI is not configured' }, { status: 503 });
  }

  let file;
  try {
    file = await readAudioFile(request);
  } catch {
    return json({ error: 'Audio file is required' }, { status: 400 });
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return json({ error: 'Audio file is too large' }, { status: 413 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await env.AI.run(TRANSCRIBE_MODEL, {
      audio: bytesToBase64(bytes),
      language: 'zh',
      vad_filter: true,
      condition_on_previous_text: false,
    });

    return json({
      text: result.text || '',
      word_count: result.word_count,
      words: result.words,
      vtt: result.vtt,
      model: TRANSCRIBE_MODEL,
      provider: 'cloudflare-workers-ai',
    });
  } catch (error) {
    return json({
      error: 'Transcription failed',
      detail: error.message,
    }, { status: 502 });
  }
}
