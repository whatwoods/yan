const INVALID_FILE_CHARS = /[\\/:*?"<>|]/g;

export function screenshotFileName(personaName, date = new Date()) {
  const safeName = String(personaName || '洞察')
    .replace(INVALID_FILE_CHARS, '')
    .trim() || '洞察';
  return `${safeName}-洞察长图-${date.toISOString().slice(0, 10)}.png`;
}

async function loadHtml2Canvas(html2canvasImpl) {
  if (html2canvasImpl) return html2canvasImpl;
  const mod = await import('html2canvas');
  return mod.default || mod;
}

function getElementSize(element) {
  const rect = element.getBoundingClientRect?.() || {};
  return {
    width: Math.ceil(element.scrollWidth || rect.width || 1),
    height: Math.ceil(element.scrollHeight || rect.height || 1),
  };
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('截图生成失败'));
    }, 'image/png');
  });
}

export async function downloadElementLongScreenshot(element, options = {}) {
  if (!element) throw new Error('没有可导出的内容');

  const documentRef = options.documentRef || element.ownerDocument || globalThis.document;
  const windowRef = options.windowRef || documentRef?.defaultView || globalThis.window;
  const urlRef = options.urlRef || globalThis.URL;
  if (!documentRef?.createElement || !documentRef.body || !urlRef?.createObjectURL) {
    throw new Error('当前环境不支持导出长图');
  }

  const html2canvasImpl = await loadHtml2Canvas(options.html2canvasImpl);
  const { width, height } = getElementSize(element);
  const marker = `shot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const originalScrollTop = element.scrollTop || 0;
  const scale = options.scale || Math.min(Math.max(windowRef?.devicePixelRatio || 1, 1), 2);
  const computedStyle = windowRef?.getComputedStyle?.(documentRef.documentElement);
  const backgroundColor = options.backgroundColor
    || computedStyle?.getPropertyValue('--paper')?.trim()
    || '#f4ede1';

  element.dataset.exportShot = marker;

  try {
    const canvas = await html2canvasImpl(element, {
      backgroundColor,
      scale,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      useCORS: true,
      onclone(clonedDocument) {
        const cloned = clonedDocument.querySelector?.(`[data-export-shot="${marker}"]`);
        if (!cloned) return;
        cloned.style.height = `${height}px`;
        cloned.style.maxHeight = 'none';
        cloned.style.overflow = 'visible';
        cloned.style.paddingBottom = '24px';
        cloned.scrollTop = 0;
      },
    });
    const blob = await canvasToPngBlob(canvas);
    const url = urlRef.createObjectURL(blob);
    const anchor = documentRef.createElement('a');
    anchor.href = url;
    anchor.download = screenshotFileName(options.personaName, options.now || new Date());
    documentRef.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    if (options.revokeDelay === 0) {
      urlRef.revokeObjectURL?.(url);
    } else {
      setTimeout(() => urlRef.revokeObjectURL?.(url), options.revokeDelay ?? 1000);
    }
  } finally {
    element.scrollTop = originalScrollTop;
    delete element.dataset.exportShot;
  }
}
