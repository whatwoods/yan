// note-id.js — Stable note ID generation shared by app and sync format code.

export function generateId() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-${crypto.randomUUID()}`;
}
