// note-format.js — Markdown frontmatter serialization for notes.
// Uses `gray-matter` for YAML frontmatter parse/stringify.
// Frontmatter spec: tags as bare strings, ai as {summary, generated_at, model}.

import matter from 'gray-matter';

// Tag label → color map (for reconstructing {label, color} objects on deserialize)
const TAG_COLORS = {
  '工作': 'indigo', '产品': 'bamboo', '阅读': 'bamboo', '人': 'plum',
  '身体': 'seal', '旅行': 'ochre', '想法': 'ink', '待办': 'seal',
  '摘抄': 'ochre', '感受': 'plum', '学习': 'indigo', '钱': 'ochre',
};

// ── ID generation ────────────────────────────────────────────

export function generateId(deviceFingerprint = '000') {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const fp = (deviceFingerprint || '000').slice(0, 3);
  return `${yyyy}-${mm}-${dd}-${hh}${min}-${fp}`;
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

  return matter.stringify(note.body || '', fm);
}

// ── Deserialize ──────────────────────────────────────────────

/**
 * Parse Markdown with frontmatter back to a note object.
 * Converts bare string tags back to {label, color} for UI use.
 */
export function deserialize(md, filePath) {
  const { data, content } = matter(md);

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
