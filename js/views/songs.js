import { getState, createSong, deleteSong, saveSong, subscribe, getSettings } from '../state/store.js';
import { escapeHtml, icon, on, debounce, formatDate, download } from '../ui/dom.js';
import { navigate } from '../router.js';
import { toast, confirmDialog, promptDialog } from '../ui/feedback.js';
import { importFiles, bindDropZone, songFromPlainText } from '../ui/importer.js';
import { uniqueChords } from '../music/song.js';
import { prettyChord } from '../music/chordParser.js';
import { keyLabel } from '../music/theory.js';
import { getTuning } from '../music/tunings.js';
import { buildBackup } from '../export/backup.js';
import { emptyState, styleInfo, startActionsHTML } from './shared.js';

export default {
  title: () => 'My Songs',
  render(el) {
    let q = '';
    let sort = 'updated';
    const selected = new Set();

    el.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h1 class="page-title mb-1">My Songs</h1>
          <p class="lead-soft mb-0">Your progressions and songs, saved in this browser.</p>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-primary" type="button" data-act="new">${icon('plus-lg')} New song</button>
          <button class="btn btn-outline-primary" type="button" data-act="paste">${icon('clipboard')} Paste chords</button>
          <button class="btn btn-outline-secondary" type="button" data-pick-file="import-file">${icon('upload')} Import</button>
          <input id="import-file" type="file" class="d-none" tabindex="-1" aria-hidden="true" accept=".json,.cho,.chopro,.chordpro,.crd,.pro,.txt,application/json,text/plain" multiple>
        </div>
      </div>
      <div class="surface p-3 mb-3 d-flex flex-wrap gap-2 align-items-center">
        <label class="visually-hidden" for="s-q">Search songs</label>
        <input id="s-q" type="search" class="form-control" style="max-width: 22rem" placeholder="Search title, artist, tag, chord…">
        <label class="small ms-md-auto" for="s-sort">Sort</label>
        <select id="s-sort" class="form-select" style="width: auto">
          <option value="updated">Recently edited</option>
          <option value="title">Title A–Z</option>
          <option value="created">Newest first</option>
        </select>
        <button class="btn btn-outline-secondary" type="button" data-act="export-selected" disabled>${icon('download')} Export selected (<span id="sel-count">0</span>)</button>
      </div>
      <div id="list"></div>
      <div class="dropzone mt-4 small text-body-secondary" id="drop">${icon('cloud-arrow-up')} Drop a backup (.json), ChordPro (.cho) or text chord chart here to import.</div>`;

    const list = el.querySelector('#list');

    function matches(s) {
      if (!q) return true;
      const hay = [s.title, s.artist, s.style, ...s.tags, ...uniqueChords(s).map((c) => c.symbol)].join(' ').toLowerCase();
      return hay.includes(q.toLowerCase());
    }

    function draw() {
      const songs = getState().songs.filter(matches).sort((a, b) => (
        sort === 'title' ? a.title.localeCompare(b.title)
          : sort === 'created' ? b.createdAt.localeCompare(a.createdAt)
            : b.updatedAt.localeCompare(a.updatedAt)));
      el.querySelector('#sel-count').textContent = selected.size;
      el.querySelector('[data-act="export-selected"]').disabled = !selected.size;
      if (!getState().songs.length) {
        list.innerHTML = emptyState('music-note-list', 'No songs yet', 'Start from a progression in Explore, build one from scratch, or paste a chord chart.', startActionsHTML());
        return;
      }
      if (!songs.length) { list.innerHTML = emptyState('search', 'No matches', 'Try a different search.'); return; }
      list.innerHTML = `<div class="row g-3">${songs.map((s) => {
        const chords = uniqueChords(s).map((c) => prettyChord(c.symbol));
        const bars = s.sections.reduce((n, x) => n + x.bars.length, 0);
        return `<div class="col-12 col-md-6 col-xl-4"><article class="card h-100 prog-card card-hover" aria-labelledby="st-${s.id}">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <h2 class="h5 card-title mb-1" id="st-${s.id}"><a href="#/song/${s.id}">${escapeHtml(s.title)}</a></h2>
              <div class="form-check" style="position:relative; z-index:2">
                <input class="form-check-input" type="checkbox" data-select="${s.id}" id="sel-${s.id}" ${selected.has(s.id) ? 'checked' : ''}>
                <label class="visually-hidden" for="sel-${s.id}">Select ${escapeHtml(s.title)}</label>
              </div>
            </div>
            ${s.artist ? `<p class="small fst-italic mb-1">${escapeHtml(s.artist)}</p>` : ''}
            <p class="small text-body-secondary mb-2">${escapeHtml(keyLabel(s.key))} · ${s.timeSignature.join('/')} · ${s.tempo} bpm · ${bars} bar${bars === 1 ? '' : 's'} · ${escapeHtml(getTuning(s.instrumentId).instrument === 'ukulele' ? 'Ukulele' : 'Guitar')}${s.style ? ` · ${escapeHtml(styleInfo(s.style).name)}` : ''}</p>
            <p class="chord-line small mb-2">${escapeHtml(chords.slice(0, 10).join('  '))}${chords.length > 10 ? ' …' : ''}</p>
            ${s.tags.length ? `<p class="mb-0">${s.tags.map((t) => `<span class="badge text-bg-light border me-1">#${escapeHtml(t)}</span>`).join('')}</p>` : ''}
          </div>
          <div class="card-footer d-flex flex-wrap gap-2 align-items-center">
            <a class="btn btn-sm btn-outline-primary" href="#/practice/${s.id}">${icon('bullseye')} Practise</a>
            <button class="btn btn-sm btn-outline-secondary" type="button" data-dup="${s.id}" aria-label="Duplicate ${escapeHtml(s.title)}">${icon('copy')}</button>
            <button class="btn btn-sm btn-outline-danger" type="button" data-del="${s.id}" aria-label="Delete ${escapeHtml(s.title)}">${icon('trash')}</button>
            <span class="small text-body-secondary ms-auto">Edited ${formatDate(s.updatedAt)}</span>
          </div>
        </article></div>`;
      }).join('')}</div>`;
    }

    const offs = [];
    offs.push(on(el, 'input', '#s-q', debounce((e) => { q = e.target.value.trim(); draw(); }, 150)));
    offs.push(on(el, 'change', '#s-sort', (e) => { sort = e.target.value; draw(); }));
    offs.push(on(el, 'change', '[data-select]', (e, t) => { if (t.checked) selected.add(t.dataset.select); else selected.delete(t.dataset.select); el.querySelector('#sel-count').textContent = selected.size; el.querySelector('[data-act="export-selected"]').disabled = !selected.size; }));
    offs.push(on(el, 'click', '[data-pick-file]', (e, t) => el.querySelector(`#${t.dataset.pickFile}`).click()));
    offs.push(on(el, 'change', '#import-file', async (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) { await importFiles(files); draw(); } }));
    offs.push(on(el, 'click', '[data-dup]', (e, t) => {
      const s = getState().songs.find((x) => x.id === t.dataset.dup);
      createSong({ ...structuredClone(s), id: undefined, title: `${s.title} (copy)`, createdAt: undefined, updatedAt: undefined });
      toast('Duplicated');
    }));
    offs.push(on(el, 'click', '[data-del]', async (e, t) => {
      const s = getState().songs.find((x) => x.id === t.dataset.del);
      if (!(await confirmDialog('Delete song?', `Delete “${s.title}” from this browser?`, { confirmLabel: 'Delete', danger: true }))) return;
      const removed = deleteSong(s.id);
      selected.delete(s.id);
      toast(`Deleted “${removed.title}”`, { type: 'info', action: { label: 'Undo', run: () => saveSong(removed, { touch: false }) } });
      el.querySelector('#s-q').focus();
    }));
    offs.push(on(el, 'click', '[data-act]', async (e, t) => {
      const act = t.dataset.act;
      if (act === 'new') {
        const s = createSong({ title: 'My progression', instrumentId: getSettings().instrumentId });
        navigate(`song/${s.id}`);
      } else if (act === 'paste') {
        const text = await promptDialog('Paste chords', 'Chord chart', '', {
          multiline: true,
          placeholder: 'Verse:\nAm | F | C | G\nChorus:\nF G | Em Am | Dm7 . G7 . | C',
          help: 'Bars separated by <kbd>|</kbd> (or one chord per bar on a line). Optional section headers like <code>Chorus:</code>. Use <kbd>.</kbd> to hold a chord an extra beat.',
        });
        if (!text) return;
        try {
          const { song, errors } = songFromPlainText(text);
          saveSong(song, { touch: false });
          if (errors.length) toast(`Skipped: ${errors.slice(0, 3).join('; ')}`, { type: 'warning' });
          navigate(`song/${song.id}`);
        } catch (err) { toast(err.message, { type: 'danger' }); }
      } else if (act === 'export-selected') {
        const songs = getState().songs.filter((s) => selected.has(s.id));
        const data = { ...buildBackup({ songs, settings: getState().settings, meta: getState().meta }), kind: 'songs', settings: undefined };
        download(`fretboard-songs-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
        toast(`Exported ${songs.length} song${songs.length === 1 ? '' : 's'}`);
      }
    }));
    offs.push(bindDropZone(el.querySelector('#drop'), draw));
    offs.push(subscribe((s, reason) => { if (reason === 'songs' || reason === 'replaced') draw(); }));
    draw();
    return () => offs.forEach((o) => o());
  },
};
