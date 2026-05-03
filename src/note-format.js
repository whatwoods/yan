// note-format.js — Markdown frontmatter serialization for notes.
// Uses `gray-matter` for YAML frontmatter parse/stringify.

import matter from 'gray-matter';

// ── ID generation ────────────────────────────────────────────

/**
 * Generate a note ID in the format: YYYY-MM-DD-HHMM-<3char>
 * @param {string} deviceFingerprint — 3-char device identifier (or any short string)
 */
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

// ── Path helpers ─────────────────────────────────────────────

/**
 * Derive a file-system path for a note from its id.
 * e.g. "2026-05-03-1742-a3f" → "/biji/notes/2026/05/2026-05-03-1742-a3f.md"
 * @param {string} id
 */
export function getNotePath(id) {
  // id starts with YYYY-MM-DD
  const year = id.slice(0, 4);
  const month = id.slice(5, 7);
  return `/biji/notes/${year}/${month}/${id}.md`;
}

/**
 * Derive a file-system path for an attachment.
 * @param {string} noteId
 * @param {string} filename
 */
export function getAttachmentPath(noteId, filename) {
  return `/biji/attachments/${noteId}/${filename}`;
}

// ── Serialize ────────────────────────────────────────────────

/**
 * Convert a note object to a Markdown string with YAML frontmatter.
 *
 * Frontmatter fields: id, created, modified, kind, category, tags, people,
 * pinned, summary, ai, attachments, deleted_at
 * Body: the note's body text (Markdown).
 *
 * @param {object} note
 * @returns {string} Markdown with YAML frontmatter
 */
export function serialize(note) {
  const frontmatter = {
    id: note.id,
    created: note.created,
    modified: note.modified,
    kind: note.kind || 'text',
    category: note.category || '',
    tags: note.tags || [],
    people: note.people || [],
    pinned: note.pinned || false,
    title: note.title || '',
    summary: note.summary || '',
    ai: note.ai || null,
    attachments: note.attachments || [],
    deleted_at: note.deleted_at || null,
  };

  // gray-matter.stringify(body, data)
  return matter.stringify(note.body || '', frontmatter);
}

// ── Deserialize ──────────────────────────────────────────────

/**
 * Parse a Markdown string with YAML frontmatter back into a note object.
 * If filePath is provided, it is used to extract the id when the frontmatter
 * doesn't contain one.
 *
 * @param {string} md — raw Markdown (with optional frontmatter)
 * @param {string} [filePath] — e.g. "/biji/notes/2026/05/2026-05-03-1742-a3f.md"
 * @returns {object} note
 */
export function deserialize(md, filePath) {
  const { data, content } = matter(md);

  const note = {
    id: data.id || (filePath ? filePathToId(filePath) : ''),
    created: data.created || new Date().toISOString(),
    modified: data.modified || data.created || new Date().toISOString(),
    kind: data.kind || 'text',
    category: data.category || '',
    tags: data.tags || [],
    people: data.people || [],
    pinned: data.pinned || false,
    title: data.title || '',
    body: content.trim(),
    summary: data.summary || '',
    ai: data.ai || null,
    attachments: data.attachments || [],
    deleted_at: data.deleted_at || null,
  };

  return note;
}

/**
 * Extract the note id from a file path like "/biji/notes/2026/05/2026-05-03-1742-a3f.md"
 */
function filePathToId(filePath) {
  const basename = filePath.split('/').pop() || '';
  return basename.replace(/\.md$/, '');
}
