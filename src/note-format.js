// note-format.js — Markdown frontmatter serialization for notes.
// Lightweight custom YAML frontmatter parser (replaces gray-matter).
// Frontmatter spec: tags as bare strings, ai as {summary, generated_at, model}.

// Tag label → color map (for reconstructing {label, color} objects on deserialize)
const TAG_COLORS = {
  '工作': 'indigo', '产品': 'bamboo', '阅读': 'bamboo', '人': 'plum',
  '身体': 'seal', '旅行': 'ochre', '想法': 'ink', '待办': 'seal',
  '摘抄': 'ochre', '感受': 'plum', '学习': 'indigo', '钱': 'ochre',
};

// ── ID generation ────────────────────────────────────────────

export function generateId() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-${crypto.randomUUID()}`;
}

// ── Path helpers (with traversal protection) ─────────────────

function sanitizeId(id) {
  // Only allow alphanumeric, dash, dot — prevent path traversal
  return String(id).replace(/[^a-zA-Z0-9\-\.]/g, '');
}

export function getNotePath(id) {
  const safe = sanitizeId(id);
  const year = safe.slice(0, 4);
  const month = safe.slice(5, 7);
  return `/biji/notes/${year}/${month}/${safe}.md`;
}

export function getAttachmentPath(noteId, filename) {
  return `/biji/attachments/${sanitizeId(noteId)}/${sanitizeId(filename)}`;
}

// ── Serialize ────────────────────────────────────────────────

/**
 * Convert a note to Markdown with YAML frontmatter per spec §6.1.
 * - tags: bare string array (Obsidian-compatible)
 * - ai: {summary, generated_at, model} or omitted
 * - No redundant title/deleted_at fields
 */
export function serialize(note) {
  const fm = {
    id: note.id,
    created: note.created,
    modified: note.modified,
    kind: note.kind || 'text',
    category: note.category || '',
    tags: (note.tags || []).map(t => typeof t === 'string' ? t : t.label),
    people: note.people || [],
    pinned: note.pinned || false,
    attachments: note.attachments || [],
  };

  // Only include ai block if it has content
  if (note.ai?.summary) {
    fm.ai = { summary: note.ai.summary, generated_at: note.ai.generated_at, model: note.ai.model || 'unknown' };
  }

  return toYAML(fm) + '\n' + (note.body || '');
}

// ── Deserialize ──────────────────────────────────────────────

/**
 * Parse Markdown with frontmatter back to a note object.
 * Converts bare string tags back to {label, color} for UI use.
 */
export function deserialize(md, filePath) {
  const { data, content } = parseFrontmatter(md);

  // Convert bare string tags to {label, color} objects
  const tags = (data.tags || []).map(t => {
    if (typeof t === 'string') return { label: t, color: TAG_COLORS[t] || 'ink' };
    return t; // already an object (legacy)
  });

  return {
    id: data.id || (filePath ? filePathToId(filePath) : ''),
    created: data.created || new Date().toISOString(),
    modified: data.modified || data.created || new Date().toISOString(),
    kind: data.kind || 'text',
    category: data.category || '',
    tags,
    people: data.people || [],
    pinned: data.pinned || false,
    title: data.title || '',
    body: content.trim(),
    summary: data.ai?.summary || data.summary || '',
    ai: data.ai || null,
    attachments: data.attachments || [],
    deleted_at: data.deleted_at || null,
  };
}

function filePathToId(filePath) {
  const basename = filePath.split('/').pop() || '';
  return basename.replace(/\.md$/, '');
}

// ── Custom YAML frontmatter parser ───────────────────────────

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { data: {}, content: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { data: {}, content: text };
  const yaml = text.slice(4, end);
  const content = text.slice(end + 4).replace(/^\n/, '');
  const data = parseSimpleYAML(yaml);
  return { data, content };
}

function parseSimpleYAML(yaml) {
  const result = {};
  let currentKey = null;
  let currentArray = null;
  let currentNested = null;

  for (const line of yaml.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);

    // Indented array item: "  - value"
    if (indent > 0 && /^\s*-\s/.test(line)) {
      if (currentKey) {
        if (!currentArray) {
          currentArray = [];
          result[currentKey] = currentArray;
        }
        currentArray.push(parseYAMLValue(line.replace(/^\s*-\s*/, '')));
      }
      continue;
    }

    // Indented key-value: "  key: value" (nested object or convert array to object)
    if (indent > 0 && currentKey) {
      const subMatch = line.match(/^\s+(\w+):\s*(.*)/);
      if (subMatch) {
        // If current key defaulted to empty array, convert to nested object
        if (currentNested === null) {
          currentNested = {};
          result[currentKey] = currentNested;
          currentArray = null;
        }
        currentNested[subMatch[1]] = parseYAMLValue(subMatch[2].trim());
      }
      continue;
    }

    // Top-level key-value
    const match = line.match(/^(\w+):\s*(.*)/);
    if (match) {
      currentKey = match[1];
      const val = match[2].trim();
      currentArray = null;
      currentNested = null;

      if (val === '' || val === '[]') {
        // Empty — could be start of array or nested object; default to array
        currentArray = [];
        result[currentKey] = currentArray;
      } else {
        result[currentKey] = parseYAMLValue(val);
      }
    }
  }
  return result;
}

function parseYAMLValue(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~' || val === '') return null;
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  // Remove surrounding quotes
  if ((val.startsWith("'") && val.endsWith("'")) ||
      (val.startsWith('"') && val.endsWith('"'))) {
    return val.slice(1, -1);
  }
  return val;
}

// ── Simple YAML serializer ───────────────────────────────────

function toYAML(data) {
  const lines = ['---'];
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of val) {
          lines.push(`  - ${formatYAMLScalar(item)}`);
        }
      }
    } else if (typeof val === 'object') {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(val)) {
        if (v === undefined || v === null) continue;
        lines.push(`  ${k}: ${formatYAMLScalar(v)}`);
      }
    } else {
      lines.push(`${key}: ${formatYAMLScalar(val)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function formatYAMLScalar(val) {
  if (typeof val === 'boolean' || typeof val === 'number') return String(val);
  if (val === null || val === undefined) return 'null';
  const s = String(val);
  // Quote strings that could be misinterpreted or contain special chars
  if (s === '' || /^[{[\-*?:,#&!|>'"%@`]/.test(s) ||
      /^[\d.-]/.test(s) || /[?:]\s/.test(s) || s.includes('\n')) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return s;
}
