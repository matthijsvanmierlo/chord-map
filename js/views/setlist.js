// One setlist: order songs for a gig or practice session, print a songbook.
import { getSetlist, saveSetlist, deleteSetlist, getState, getSong, subscribe } from '../state/store.js';
import { APP_ID, SCHEMA_VERSION } from '../state/schema.js';
import { escapeHtml, icon, on, download, slugify, announce } from '../ui/dom.js';
import { navigate } from '../router.js';
import { toast, confirmDialog, dialog } from '../ui/feedback.js';
import { keyLabel } from '../music/theory.js';
import { notFound } from './shared.js';

export function setlistFile(list) {
  return {
    app: APP_ID, kind: 'setlist', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    setlist: list, songs: list.songIds.map(getSong).filter(Boolean),
  };
}

export default {
  title: (p) => getSetlist(p.id)?.name || 'Setlist',
  render(el, { params }) {
    if (!getSetlist(params.id)) {
      el.innerHTML = notFound('list-ol', 'Setlist not found', 'It may have been deleted.', '<a class="btn btn-primary" href="#/songs?tab=setlists">Back to setlists</a>');
      return null;
    }
    let sortable = null;
    el.innerHTML = `
      <nav aria-label="Breadcrumb"><ol class="breadcrumb small mb-2">
        <li class="breadcrumb-item"><a href="#/songs?tab=setlists">Setlists</a></li>
        <li class="breadcrumb-item active" aria-current="page" id="crumb"></li>
      </ol></nav>
      <h1 class="visually-hidden" id="h1"></h1>
      <div class="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div class="flex-grow-1" style="min-width: 240px">
          <label class="form-label small mb-0 text-body-secondary" for="sl-name">Setlist name</label>
          <input id="sl-name" class="form-control form-control-lg fw-bold" maxlength="120">
        </div>
        <button class="btn btn-primary" type="button" data-act="add">${icon('plus-lg')} Add songs</button>
        <a class="btn btn-outline-primary" href="#/stage/setlist/${escapeHtml(params.id)}">${icon('display')} Stage mode</a>
        <a class="btn btn-outline-primary" id="print-link" href="#/print/setlist/${escapeHtml(params.id)}" target="_blank" rel="noopener">${icon('printer')} Print songbook</a>
        <div class="dropdown">
          <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">${icon('three-dots')} More</button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><button class="dropdown-item" type="button" data-act="export">${icon('download')} Export setlist (.json with songs)</button></li>
            <li><button class="dropdown-item text-danger" type="button" data-act="delete">${icon('trash')} Delete setlist</button></li>
          </ul>
        </div>
      </div>
      <p class="small text-body-secondary" id="sl-summary" aria-live="polite"></p>
      <ol class="list-group list-group-numbered mb-3" id="sl-list"></ol>`;
    const $ = (s) => el.querySelector(s);
    const list = () => getSetlist(params.id);

    function draw(focusSel = null) {
      const l = list();
      if (!l) return;
      $('#crumb').textContent = l.name;
      $('#h1').textContent = `Setlist: ${l.name}`;
      if (document.activeElement !== $('#sl-name')) $('#sl-name').value = l.name;
      const songs = l.songIds.map(getSong);
      const missing = songs.filter((s) => !s).length;
      $('#sl-summary').textContent = `${l.songIds.length - missing} song${l.songIds.length - missing === 1 ? '' : 's'}${missing ? ` (${missing} no longer in this browser)` : ''}`;
      sortable?.destroy();
      $('#sl-list').innerHTML = l.songIds.length ? l.songIds.map((id, i) => {
        const s = getSong(id);
        return `<li class="list-group-item d-flex flex-wrap align-items-center gap-2" data-id="${escapeHtml(id)}">
          <button type="button" class="drag-handle" aria-hidden="true" tabindex="-1" title="Drag to reorder">${icon('grip-vertical')}</button>
          <span class="me-auto">${s ? `<a href="#/song/${escapeHtml(id)}"><strong>${escapeHtml(s.title)}</strong></a> <span class="small text-body-secondary">${escapeHtml(keyLabel(s.key))} · ${s.tempo} bpm${s.capo ? ` · capo ${s.capo}` : ''}</span>` : '<em class="text-body-secondary">Missing song</em>'}</span>
          ${s ? `<a class="btn btn-sm btn-outline-primary" href="#/practice/${escapeHtml(id)}">${icon('bullseye')}<span class="visually-hidden">Practise ${escapeHtml(s.title)}</span></a>` : ''}
          <span class="btn-group btn-group-sm" role="group" aria-label="Move ${escapeHtml(s?.title || 'song')}">
            <button class="btn btn-outline-secondary" type="button" data-move="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${escapeHtml(s?.title || 'song')} up">${icon('arrow-up')}</button>
            <button class="btn btn-outline-secondary" type="button" data-move="1" data-i="${i}" ${i === l.songIds.length - 1 ? 'disabled' : ''} aria-label="Move ${escapeHtml(s?.title || 'song')} down">${icon('arrow-down')}</button>
          </span>
          <button class="btn btn-sm btn-outline-danger" type="button" data-remove="${i}" aria-label="Remove ${escapeHtml(s?.title || 'song')} from setlist">${icon('x-lg')}</button>
        </li>`;
      }).join('') : `<li class="list-group-item text-body-secondary">No songs yet — use <strong>Add songs</strong>.</li>`;
      if (window.Sortable && l.songIds.length > 1) {
        sortable = window.Sortable.create($('#sl-list'), {
          handle: '.drag-handle', animation: 150,
          onEnd: () => { saveSetlist({ ...list(), songIds: [...$('#sl-list').children].map((li) => li.dataset.id) }); announce('Order updated'); },
        });
      }
      if (focusSel) el.querySelector(focusSel)?.focus();
    }

    async function addSongs() {
      const l = list();
      const all = [...getState().songs].sort((a, b) => a.title.localeCompare(b.title));
      if (!all.length) { toast('You have no songs yet — save one from Explore first.', { type: 'info' }); return; }
      const ids = await dialog({
        title: `Add songs to “${l.name}”`,
        body: `<label class="visually-hidden" for="pick-q">Filter songs</label>
          <input id="pick-q" type="search" class="form-control mb-2" placeholder="Filter…">
          <fieldset><legend class="visually-hidden">Songs</legend><div id="pick-list" style="max-height: 50vh; overflow:auto">
          ${all.map((s) => `<div class="form-check" data-title="${escapeHtml(s.title.toLowerCase())}">
            <input class="form-check-input" type="checkbox" value="${escapeHtml(s.id)}" id="pk-${escapeHtml(s.id)}" ${l.songIds.includes(s.id) ? 'checked disabled' : ''}>
            <label class="form-check-label" for="pk-${escapeHtml(s.id)}">${escapeHtml(s.title)} <span class="small text-body-secondary">${escapeHtml(keyLabel(s.key))}</span>${l.songIds.includes(s.id) ? ' <span class="badge text-bg-secondary">already in</span>' : ''}</label>
          </div>`).join('')}</div></fieldset>`,
        buttons: [{ label: 'Cancel', value: null }, { label: 'Add selected', value: 'ok', variant: 'primary' }],
        onShown: (d) => {
          const q = d.querySelector('#pick-q');
          q.focus();
          q.addEventListener('input', () => d.querySelectorAll('[data-title]').forEach((r) => { r.hidden = !r.dataset.title.includes(q.value.toLowerCase()); }));
        },
        collect: (d) => [...d.querySelectorAll('#pick-list input:checked:not(:disabled)')].map((i) => i.value),
      });
      if (!ids?.length) return;
      saveSetlist({ ...list(), songIds: [...list().songIds, ...ids] });
      toast(`Added ${ids.length} song${ids.length === 1 ? '' : 's'}`);
    }

    const offs = [
      on(el, 'change', '#sl-name', (e) => saveSetlist({ ...list(), name: e.target.value.trim() || 'Setlist' })),
      on(el, 'click', '[data-move]', (e, t) => {
        const i = Number(t.dataset.i), j = i + Number(t.dataset.move);
        const ids = [...list().songIds];
        [ids[i], ids[j]] = [ids[j], ids[i]];
        saveSetlist({ ...list(), songIds: ids });
        draw(`[data-move="${t.dataset.move}"][data-i="${j}"]:not(:disabled)`);
        announce(`Moved to position ${j + 1}`);
      }),
      on(el, 'click', '[data-remove]', (e, t) => {
        const ids = [...list().songIds];
        const [removed] = ids.splice(Number(t.dataset.remove), 1);
        saveSetlist({ ...list(), songIds: ids });
        toast(`Removed “${getSong(removed)?.title || 'song'}” from the setlist`, { type: 'info', action: { label: 'Undo', run: () => { const r = [...list().songIds]; r.splice(Number(t.dataset.remove), 0, removed); saveSetlist({ ...list(), songIds: r }); } } });
        $('[data-act="add"]').focus();
      }),
      on(el, 'click', '[data-act]', async (e, t) => {
        const act = t.dataset.act;
        if (act === 'add') addSongs();
        if (act === 'export') {
          download(`${slugify(list().name)}.setlist.json`, JSON.stringify(setlistFile(list()), null, 2), 'application/json');
          toast('Setlist exported with its songs');
        }
        if (act === 'delete') {
          if (!(await confirmDialog('Delete setlist?', `Delete “${list().name}”? The songs themselves are kept.`, { confirmLabel: 'Delete', danger: true }))) return;
          const removed = deleteSetlist(params.id);
          navigate('songs?tab=setlists');
          toast(`Deleted “${removed.name}”`, { type: 'info', action: { label: 'Undo', run: () => saveSetlist(removed) } });
        }
      }),
      subscribe((s, reason) => { if (['setlists', 'songs', 'replaced', 'external'].includes(reason)) draw(); }),
    ];
    draw();
    return () => { offs.forEach((o) => o()); sortable?.destroy(); };
  },
};
