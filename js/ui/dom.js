// Small DOM helpers.

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Delegated event listener. Returns an unsubscribe function. */
export function on(root, type, selector, handler, opts) {
  const fn = (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) handler(e, t);
  };
  root.addEventListener(type, fn, opts);
  return () => root.removeEventListener(type, fn, opts);
}

/** Trigger a browser download of text/blob content. */
export function download(filename, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Read a File as text. */
export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function slugify(s) {
  return String(s || 'untitled').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60) || 'untitled';
}

export function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Announce a message to screen readers via the global live region. */
export function announce(msg) {
  const r = document.getElementById('live-region');
  if (!r) return;
  r.textContent = '';
  setTimeout(() => { r.textContent = msg; }, 30);
}

export function icon(name, extra = '') {
  return `<i class="bi bi-${name} ${extra}" aria-hidden="true"></i>`;
}
