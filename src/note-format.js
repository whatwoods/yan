// note-format.js — Markdown frontmatter serialization for notes.
// Frontmatter spec: tags as bare strings, ai as {summary, generated_at, model}.

import YAML from 'yaml';
export { generateId } from './note-id.js';

// Tag label → color map (for reconstructing {label, color} objects on deserialize)
const TAG_COLORS = {
  '工作': 'indigo', '产品': 'bamboo', '阅读': 'bamboo', '人': 'plum',
  '身体': 'seal', '旅行': 'ochre', '想法': 'ink', '待办': 'seal',
  '摘抄': 'ochre', '感受': 'plum', '学习': 'indigo', '钱': 'ochre',
};

// ── Path helpers (with traversal protection) ─────────────────

function sanitizeId(id) {
  // Only allow alphanumeric, dash, dot — prevent path traversal
  return String(id).replace(/[^a-zA-Z0-9\-\.]/g, '');
}

export function getNotePath(id, root = '/yan') {
  const safe = sanitizeId(id);
  const year = safe.slice(0, 4);
  const month = safe.slice(5, 7);
  return `${root}/notes/${year}/${month}/${safe}.md`;
}

export function getTrashPath(noteId, root = '/yan') {
  const safe = sanitizeId(noteId);
  return `${root}/trash/${safe}.md`;
}

export function getAttachmentPath(noteId, filename, root = '/yan') {
  return `${root}/attachments/${sanitizeId(noteId)}/${sanitizeId(filename)}`;
}

// ── Photo helpers ────────────────────────────────────────────

function extractPhotoFilename(photo) {
  if (!photo) return null;
  if (!photo.startsWith('data:')) return photo;
  return 'photo-1.jpg';
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
    photo: extractPhotoFilename(note.photo),
  };

  if (fm.photo && !fm.attachments.includes(fm.photo)) {
    fm.attachments = [...fm.attachments, fm.photo];
  }

  // Only include deleted_at if note is soft-deleted
  if (note.deleted_at) {
    fm.deleted_at = note.deleted_at;
  }

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
  const now = new Date().toISOString();
  const created = data.created || now;
  const modified = data.modified || created;
  const createdAt = Date.parse(created);

  // Defensive: if tags is a string (e.g. inline array parse failure), wrap in array
  if (typeof data.tags === 'string') data.tags = [data.tags];

  // Convert bare string tags to {label, color} objects
  const tags = (data.tags || []).map(t => {
    if (typeof t === 'string') return { label: t, color: TAG_COLORS[t] || 'ink' };
    return t; // already an object (legacy)
  });

  return {
    id: data.id || (filePath ? filePathToId(filePath) : ''),
    created,
    modified,
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
    photo: data.photo || null,
    deleted_at: data.deleted_at || null,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };
}

function filePathToId(filePath) {
  const basename = filePath.split('/').pop() || '';
  return basename.replace(/\.md$/, '');
}

// ── YAML frontmatter parser ──────────────────────────────────

function parseFrontmatter(text) {
  const match = String(text).match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) return { data: {}, content: text };

  const parsed = YAML.parse(match[1]) || {};
  const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  return { data, content: match[2] || '' };
}

// ── YAML serializer ──────────────────────────────────────────

function toYAML(data) {
  const compact = Object.fromEntries(
    Object.entries(data).filter(([, val]) => val !== undefined && val !== null),
  );
  return `---\n${YAML.stringify(compact, { lineWidth: 0 }).trimEnd()}\n---`;
}
