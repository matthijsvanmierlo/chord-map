// Hash router (GitHub Pages friendly). Routes map to lazily imported views.
// A view module exports default { title, render(el, ctx) → cleanup? }.
const routes = [
  { pattern: /^$/, view: 'home', nav: '' },
  { pattern: /^explore$/, view: 'explore', nav: 'explore' },
  { pattern: /^progression\/([\w-]+)$/, view: 'progression', nav: 'explore', params: ['id'] },
  { pattern: /^songs$/, view: 'songs', nav: 'songs' },
  { pattern: /^song\/([\w-]+)$/, view: 'editor', nav: 'songs', params: ['id'] },
  { pattern: /^practice$/, view: 'practice', nav: 'practice' },
  { pattern: /^practice\/([\w-]+)$/, view: 'practice', nav: 'practice', params: ['id'] },
  { pattern: /^chords$/, view: 'chords', nav: 'chords' },
  { pattern: /^settings$/, view: 'settings', nav: 'settings' },
  { pattern: /^help$/, view: 'help', nav: 'help' },
  { pattern: /^print\/([\w-]+)$/, view: 'print', nav: '', params: ['id'] },
  { pattern: /^shared$/, view: 'sharedSong', nav: 'songs' },
  { pattern: /^setlist\/([\w-]+)$/, view: 'setlist', nav: 'songs', params: ['id'] },
  { pattern: /^stage\/setlist\/([\w-]+)$/, view: 'stage', nav: 'practice', params: ['setlistId'] },
  { pattern: /^stage\/([\w-]+)$/, view: 'stage', nav: 'practice', params: ['id'] },
  { pattern: /^train$/, view: 'train', nav: 'train' },
  { pattern: /^print\/setlist\/([\w-]+)$/, view: 'print', nav: '', params: ['setlistId'] },
];

let cleanup = null;
let renderToken = 0;
const beforeLeaveHooks = new Set();

export function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [pathPart, queryPart = ''] = raw.split('?');
  const [path, anchor = ''] = pathPart.split('#');
  return { path: path.replace(/\/+$/, ''), query: Object.fromEntries(new URLSearchParams(queryPart)), anchor };
}

export function navigate(path, { replace = false } = {}) {
  const h = '#/' + path.replace(/^#?\/?/, '');
  if (replace) history.replaceState(null, '', h); else location.hash = h;
  if (replace) render();
}

/** Update the query string without re-rendering (for filters). */
export function setQuery(query) {
  const { path } = parseHash();
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString();
  history.replaceState(null, '', `#/${path}${qs ? '?' + qs : ''}`);
}

export function onBeforeLeave(fn) {
  beforeLeaveHooks.add(fn);
  return () => beforeLeaveHooks.delete(fn);
}

async function render() {
  const token = ++renderToken;
  const { path, query, anchor } = parseHash();
  const route = routes.find((r) => r.pattern.test(path));
  const el = document.getElementById('view');
  for (const fn of beforeLeaveHooks) { try { fn(); } catch (e) { console.error(e); } }
  beforeLeaveHooks.clear();
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;

  document.querySelectorAll('[data-nav]').forEach((a) => {
    const active = route && a.dataset.nav === route.nav;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  // close the mobile menu after navigating
  const nav = document.getElementById('nav-links');
  if (nav?.classList.contains('show')) window.bootstrap?.Collapse.getOrCreateInstance(nav).hide();

  if (!route) {
    el.innerHTML = `<div class="empty-state"><i class="bi bi-signpost-split" aria-hidden="true"></i><h1 class="h3 mt-3">Page not found</h1><p><a href="#/">Go to the home page</a></p></div>`;
    document.title = 'Not found · Fretboard Progressions';
    return;
  }
  const params = {};
  const m = path.match(route.pattern);
  (route.params || []).forEach((p, i) => { params[p] = m[i + 1]; });
  try {
    const mod = await import(`./views/${route.view}.js`);
    if (token !== renderToken) return;
    el.innerHTML = '';
    const view = mod.default;
    cleanup = await view.render(el, { params, query, anchor });
    if (token !== renderToken) return;
    const h1 = el.querySelector('h1');
    document.title = `${view.title?.(params) || h1?.textContent?.trim() || 'Home'} · Fretboard Progressions`;
    // move focus to the page heading for screen-reader & keyboard users
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
    else window.scrollTo(0, 0);
    if (h1 && renderToken > 1) { h1.tabIndex = -1; h1.focus({ preventScroll: !!anchor }); }
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="alert alert-danger" role="alert"><h1 class="h5">Something went wrong</h1><p class="mb-0">${String(e.message).replace(/</g, '&lt;')}</p></div>`;
  }
}

export function rerender() { render(); }

export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}
