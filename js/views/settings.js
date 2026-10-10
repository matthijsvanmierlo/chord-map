import { getState, getSettings, updateSettings, updateMeta, replaceAll, storageBytes, isStorageAvailable } from '../state/store.js';
import { defaultSettings, defaultMeta, defaultPracticeTotals, newId } from '../state/schema.js';
import { buildBackup, backupFilename } from '../export/backup.js';
import { importFiles, bindDropZone } from '../ui/importer.js';
import { validTuning } from '../music/tunings.js';
import { midiOf, prettyAcc } from '../music/theory.js';
import { escapeHtml, icon, on, download, formatDate } from '../ui/dom.js';
import { toast, confirmDialog, dialog } from '../ui/feedback.js';
import { fillInstrumentSelect, mixerHTML, subdivisionOptions } from './shared.js';
import { editPattern } from '../ui/patternEditor.js';
import { voicingPrefsFormHTML, readVoicingPrefsForm } from '../ui/voicingPrefsForm.js';
import { defaultVoicingPrefs } from '../state/schema.js';
import { patternLabel } from '../data/strumPatterns.js';

const NOTE_OPTIONS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function tuningRowHTML(note = 'E', octave = 2, i = 0) {
  return `<div class="d-flex gap-1 align-items-center mb-1" data-string-row>
    <span class="small text-body-secondary" style="width:4.5rem">String ${i + 1}</span>
    <select class="form-select form-select-sm" style="width:5rem" aria-label="String ${i + 1} note">${NOTE_OPTIONS.map((n) => `<option ${n === note ? 'selected' : ''} value="${n}">${prettyAcc(n)}</option>`).join('')}</select>
    <select class="form-select form-select-sm" style="width:4.5rem" aria-label="String ${i + 1} octave">${[1, 2, 3, 4, 5].map((o) => `<option ${o === octave ? 'selected' : ''}>${o}</option>`).join('')}</select>
  </div>`;
}

export default {
  title: () => 'Settings',
  render(el) {
    const s = getSettings();
    el.innerHTML = `
      <h1 class="page-title mb-3">Settings</h1>
      <div class="row g-4">
        <div class="col-lg-6">
          <section class="surface p-3 mb-4" aria-labelledby="h-display">
            <h2 class="h5" id="h-display">${icon('palette')} Display</h2>
            <fieldset class="mb-3">
              <legend class="form-label fw-semibold small">Theme</legend>
              ${[['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `
                <div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="theme" id="th-${v}" value="${v}" ${s.theme === v ? 'checked' : ''}><label class="form-check-label" for="th-${v}">${l}</label></div>`).join('')}
            </fieldset>
            <fieldset class="mb-3">
              <legend class="form-label fw-semibold small">Chord labels</legend>
              ${[['chords', 'Chord names (Dm7)'], ['roman', 'Roman numerals (ii7)'], ['both', 'Both']].map(([v, l]) => `
                <div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="disp" id="d-${v}" value="${v}" ${s.chordDisplay === v ? 'checked' : ''}><label class="form-check-label" for="d-${v}">${l}</label></div>`).join('')}
            </fieldset>
            <fieldset class="mb-3">
              <legend class="form-label fw-semibold small">Show on sheets</legend>
              ${[['diagrams', 'Chord diagrams'], ['staff', 'Standard notation'], ['tab', 'Tablature'], ['lyrics', 'Lyrics (chords above words)']].map(([k, l]) => `
                <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="n-${k}" data-notation="${k}" ${s.notation[k] ? 'checked' : ''}><label class="form-check-label" for="n-${k}">${l}</label></div>`).join('')}
            </fieldset>
            <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="o-left" data-bool="leftHanded" ${s.leftHanded ? 'checked' : ''}><label class="form-check-label" for="o-left">Left-handed chord diagrams (mirrored)</label></div>
            <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="o-smooth" data-bool="smoothVoicing" ${s.smoothVoicing ? 'checked' : ''}><label class="form-check-label" for="o-smooth">Smooth voice leading (choose shapes close to the previous chord)</label></div>
          </section>

          <section class="surface p-3 mb-4" aria-labelledby="h-inst">
            <h2 class="h5" id="h-inst">${icon('music-note-list')} Instrument</h2>
            <label class="form-label small fw-semibold" for="def-inst">Default instrument / tuning</label>
            <select id="def-inst" class="form-select mb-3"></select>
            <h3 class="h6">Chord shapes</h3>
            <p class="small text-body-secondary mb-2">Which shapes to show first everywhere (each song can override this in its editor).</p>
            ${voicingPrefsFormHTML(s.voicing, 'gvp')}
            <button class="btn btn-link btn-sm px-0 mb-3" type="button" data-act="reset-shapes">Reset to defaults</button>
            <h3 class="h6">Custom tunings</h3>
            <ul class="list-unstyled" id="custom-list"></ul>
            <button class="btn btn-outline-primary btn-sm" type="button" data-act="add-tuning">${icon('plus-lg')} Create custom tuning</button>
          </section>

          <section class="surface p-3 mb-4" aria-labelledby="h-audio">
            <h2 class="h5" id="h-audio">${icon('volume-up')} Sound & practice</h2>
            <label for="vol" class="form-label small fw-semibold">Volume</label>
            <input type="range" class="form-range" id="vol" min="0" max="100" value="${s.volume}">
            <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="o-metro" data-bool="metronome" ${s.metronome ? 'checked' : ''}><label class="form-check-label" for="o-metro">Metronome on by default</label></div>
            <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="o-countin" data-bool="countIn" ${s.countIn ? 'checked' : ''}><label class="form-check-label" for="o-countin">Count-in bar by default</label></div>
            <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="o-announce" data-bool="announceChords" ${s.announceChords ? 'checked' : ''}><label class="form-check-label" for="o-announce">Announce chord changes to screen readers during practice</label></div>
            <label class="form-label small fw-semibold mt-2" for="o-sub">Metronome clicks</label>
            <select id="o-sub" class="form-select form-select-sm mb-3" style="max-width: 14rem">${subdivisionOptions(s.metronomeSubdivision)}</select>
            <h3 class="h6">Mixer</h3>
            ${mixerHTML(s.mix, 'set-mix')}
          </section>

          <section class="surface p-3 mb-4" aria-labelledby="h-patterns">
            <h2 class="h5" id="h-patterns">${icon('grid-3x2-gap')} Strum patterns</h2>
            <p class="small text-body-secondary">Make your own strumming or picking patterns. They appear in every song's pattern menu.</p>
            <ul class="list-unstyled" id="pattern-list"></ul>
            <button class="btn btn-outline-primary btn-sm" type="button" data-act="add-pattern">${icon('plus-lg')} Create pattern</button>
          </section>
        </div>

        <div class="col-lg-6">
          <section class="surface p-3 mb-4" id="backup" aria-labelledby="h-backup">
            <h2 class="h5" id="h-backup">${icon('cloud-arrow-down')} Backup & move to another browser</h2>
            <p class="small">Everything is stored only in this browser. Export a backup file to keep your work safe or to move it to another computer/browser, then import it there.</p>
            <p class="small text-body-secondary mb-2" id="backup-info"></p>
            <div class="d-flex flex-wrap gap-2 mb-3">
              <button class="btn btn-primary" type="button" data-act="export">${icon('download')} Export all data (.json)</button>
              <button class="btn btn-outline-primary" type="button" data-pick-file="imp-file">${icon('upload')} Import…</button>
              <input id="imp-file" type="file" class="d-none" tabindex="-1" aria-hidden="true" accept=".json,.cho,.chopro,.chordpro,.txt,.musicxml,.xml,.mxl,application/json,text/plain" multiple>
            </div>
            <div class="dropzone small text-body-secondary" id="drop">${icon('cloud-arrow-up')} …or drop a backup file here. You'll see a preview and can merge or replace.</div>
          </section>

          <section class="surface p-3 mb-4" aria-labelledby="h-storage">
            <h2 class="h5" id="h-storage">${icon('hdd')} Storage & libraries</h2>
            <p class="small mb-2" id="storage-info"></p>
            <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" role="switch" id="o-local" data-bool="localLibsOnly" ${s.localLibsOnly ? 'checked' : ''}><label class="form-check-label" for="o-local">Load libraries from this site only (no CDN). Takes effect on reload.</label></div>
            <p class="small text-body-secondary mb-0" id="lib-info"></p>
          </section>

          <section class="surface p-3 mb-4 border-danger-subtle" aria-labelledby="h-danger">
            <h2 class="h5 text-danger" id="h-danger">${icon('exclamation-triangle')} Reset</h2>
            <p class="small">Delete all songs and settings from this browser. Export a backup first if you might want them back.</p>
            <button class="btn btn-outline-danger" type="button" data-act="reset">${icon('trash')} Delete all data…</button>
          </section>
        </div>
      </div>`;

    const $ = (q) => el.querySelector(q);

    function drawInfo() {
      const st = getState();
      $('#backup-info').textContent = `${st.songs.length} song(s), ${st.setlists.length} setlist(s), ${st.practiceLog.length} practice-log entr${st.practiceLog.length === 1 ? 'y' : 'ies'}. Last backup: ${st.meta.lastBackupAt ? formatDate(st.meta.lastBackupAt) : 'never'}.`;
      const kb = (storageBytes() / 1024).toFixed(1);
      $('#storage-info').textContent = isStorageAvailable() ? `Using about ${kb} KB of browser storage (typical limit ≈ 5 MB).` : 'Browser storage is unavailable in this window — changes will not be kept.';
      const rep = window.VENDOR_REPORT || {};
      $('#lib-info').textContent = `Libraries loaded: ${Object.entries(rep).map(([k, v]) => `${k} (${v})`).join(', ') || 'unknown'}.`;
      fillInstrumentSelect($('#def-inst'), getSettings().instrumentId);
      const pats = getSettings().customPatterns;
      $('#pattern-list').innerHTML = pats.length ? pats.map((p) => `<li class="d-flex flex-wrap justify-content-between align-items-center gap-2 border-bottom py-1">
          <span><strong>${escapeHtml(p.name)}</strong> <span class="small text-body-secondary">${p.meter ? p.meter.join('/') : 'any meter'}</span><br><span class="font-monospace small">${escapeHtml(patternLabel(p))}</span></span>
          <span class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" type="button" data-edit-pattern="${escapeHtml(p.id)}" aria-label="Edit ${escapeHtml(p.name)}">${icon('pencil')}</button>
            <button class="btn btn-outline-danger" type="button" data-del-pattern="${escapeHtml(p.id)}" aria-label="Delete ${escapeHtml(p.name)}">${icon('trash')}</button>
          </span></li>`).join('')
        : '<li class="small text-body-secondary">No custom patterns yet.</li>';
      const customs = getSettings().customTunings;
      $('#custom-list').innerHTML = customs.length ? customs.map((t) => `<li class="d-flex justify-content-between align-items-center border-bottom py-1">
          <span>${escapeHtml(t.name)} <span class="small text-body-secondary">${t.strings.map((x) => escapeHtml(prettyAcc(x))).join(' ')}</span></span>
          <button class="btn btn-sm btn-outline-danger" type="button" data-del-tuning="${escapeHtml(t.id)}" aria-label="Delete ${escapeHtml(t.name)}">${icon('trash')}</button></li>`).join('')
        : '<li class="small text-body-secondary">None yet. Create one for open tunings, 7-string guitar, tenor guitar, mandolin-family fretted instruments, etc.</li>';
    }

    async function addTuning() {
      const presetStrings = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
      const rows = (strings) => strings.map((x, i) => { const m = x.match(/^([A-G][b#]?)(\d)$/); return tuningRowHTML(m[1], Number(m[2]), i); }).join('');
      const result = await dialog({
        title: 'Create custom tuning',
        body: `<label class="form-label small" for="t-name">Name</label>
          <input id="t-name" class="form-control mb-2" placeholder="e.g. Open C (CGCGCE)" maxlength="60">
          <div class="row g-2 mb-2">
            <div class="col"><label class="form-label small" for="t-inst">Instrument</label>
              <select id="t-inst" class="form-select form-select-sm"><option value="guitar">Guitar</option><option value="ukulele">Ukulele</option><option value="other">Other</option></select></div>
            <div class="col"><label class="form-label small" for="t-count">Strings</label>
              <select id="t-count" class="form-select form-select-sm">${[3, 4, 5, 6, 7, 8].map((n) => `<option ${n === 6 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          </div>
          <p class="small text-body-secondary mb-1">From the string closest to your chin (lowest on guitar) to the furthest.</p>
          <div id="t-rows">${rows(presetStrings)}</div>
          <div id="t-err" class="text-danger small" aria-live="polite"></div>`,
        buttons: [{ label: 'Cancel', value: null }, { label: 'Save tuning', value: 'save', variant: 'primary' }],
        onShown: (d) => {
          d.querySelector('#t-name').focus();
          d.querySelector('#t-count').addEventListener('change', (e) => {
            const n = Number(e.target.value);
            const cur = [...d.querySelectorAll('[data-string-row]')].map((r) => { const [a, b] = r.querySelectorAll('select'); return a.value + b.value; });
            const strings = Array.from({ length: n }, (_, i) => cur[i] || 'E4');
            d.querySelector('#t-rows').innerHTML = rows(strings);
          });
        },
        collect: (d) => {
          const strings = [...d.querySelectorAll('[data-string-row]')].map((r) => { const [a, b] = r.querySelectorAll('select'); return a.value + b.value; });
          const name = d.querySelector('#t-name').value.trim() || `Custom (${strings.map((x) => x.replace(/\d/, '')).join('')})`;
          const t = { id: 'custom-' + newId().slice(0, 8), name, instrument: d.querySelector('#t-inst').value, strings, frets: 15 };
          if (!validTuning(t) || strings.some((x) => midiOf(x) === null)) { d.querySelector('#t-err').textContent = 'Please check the string notes.'; return false; }
          return t;
        },
      });
      if (!result) return;
      updateSettings({ customTunings: [...getSettings().customTunings, result] });
      toast(`Tuning “${result.name}” saved`);
      drawInfo();
    }

    const offs = [];
    offs.push(on(el, 'change', '[data-vp-form="gvp"] [data-vp]', () => updateSettings({ voicing: readVoicingPrefsForm(el, 'gvp') })));
    offs.push(on(el, 'change', '#o-sub', (e) => updateSettings({ metronomeSubdivision: Number(e.target.value) })));
    offs.push(on(el, 'change', '[data-mix]', (e, t) => updateSettings({ mix: { ...getSettings().mix, [t.dataset.mix]: Number(t.value) } })));
    offs.push(on(el, 'input', '[data-mix]', (e, t) => t.setAttribute('aria-valuetext', `${t.value} percent`)));
    const savePattern = (p) => {
      const list = getSettings().customPatterns.filter((x) => x.id !== p.id);
      updateSettings({ customPatterns: [...list, p] });
      toast(`Pattern “${p.name}” saved`);
      drawInfo();
    };
    offs.push(on(el, 'click', '[data-edit-pattern]', async (e, t) => {
      const cur = getSettings().customPatterns.find((x) => x.id === t.dataset.editPattern);
      const p = await editPattern(cur, { instrumentId: getSettings().instrumentId });
      if (p) savePattern(p);
    }));
    offs.push(on(el, 'click', '[data-del-pattern]', async (e, t) => {
      const cur = getSettings().customPatterns.find((x) => x.id === t.dataset.delPattern);
      if (!(await confirmDialog('Delete pattern?', `Delete “${cur.name}”? Songs using it will fall back to quarter-note strums.`, { confirmLabel: 'Delete', danger: true }))) return;
      updateSettings({ customPatterns: getSettings().customPatterns.filter((x) => x.id !== cur.id) });
      drawInfo();
      el.querySelector('[data-act="add-pattern"]').focus();
    }));
    offs.push(on(el, 'change', 'input[name="theme"]', (e) => updateSettings({ theme: e.target.value })));
    offs.push(on(el, 'change', 'input[name="disp"]', (e) => updateSettings({ chordDisplay: e.target.value })));
    offs.push(on(el, 'change', '[data-notation]', (e, t) => updateSettings({ notation: { ...getSettings().notation, [t.dataset.notation]: t.checked } })));
    offs.push(on(el, 'change', '[data-bool]', (e, t) => updateSettings({ [t.dataset.bool]: t.checked })));
    offs.push(on(el, 'change', '#def-inst', (e) => updateSettings({ instrumentId: e.target.value })));
    offs.push(on(el, 'change', '#vol', (e) => updateSettings({ volume: Number(e.target.value) })));
    offs.push(on(el, 'click', '[data-pick-file]', (e, t) => el.querySelector(`#${t.dataset.pickFile}`).click()));
    offs.push(on(el, 'change', '#imp-file', async (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) { await importFiles(f); drawInfo(); } }));
    offs.push(on(el, 'click', '[data-del-tuning]', async (e, t) => {
      const id = t.dataset.delTuning;
      const tn = getSettings().customTunings.find((x) => x.id === id);
      if (!(await confirmDialog('Delete tuning?', `Delete “${tn.name}”? Songs using it will fall back to standard guitar.`, { confirmLabel: 'Delete', danger: true }))) return;
      const patch = { customTunings: getSettings().customTunings.filter((x) => x.id !== id) };
      if (getSettings().instrumentId === id) patch.instrumentId = 'guitar-standard';
      updateSettings(patch);
      drawInfo();
    }));
    offs.push(on(el, 'click', '[data-act]', async (e, t) => {
      const act = t.dataset.act;
      if (act === 'export') {
        download(backupFilename(), JSON.stringify(buildBackup(getState()), null, 2), 'application/json');
        updateMeta({ lastBackupAt: new Date().toISOString() });
        document.getElementById('b-backup')?.remove();
        toast('Backup downloaded. Keep it somewhere safe (e.g. cloud drive).');
        drawInfo();
      } else if (act === 'add-tuning') addTuning();
      else if (act === 'reset-shapes') {
        updateSettings({ voicing: defaultVoicingPrefs() });
        el.querySelector('[data-vp-form="gvp"]').outerHTML = voicingPrefsFormHTML(defaultVoicingPrefs(), 'gvp');
        toast('Shape preferences reset', { type: 'info', delay: 2000 });
      }
      else if (act === 'add-pattern') {
        const p = await editPattern(null, { instrumentId: getSettings().instrumentId });
        if (p) savePattern(p);
      }
      else if (act === 'reset') {
        if (!(await confirmDialog('Delete all data?', `This permanently deletes ${getState().songs.length} song(s), favourites, custom tunings and settings from this browser.`, { confirmLabel: 'Continue', danger: true }))) return;
        const typed = await dialog({
          title: 'Are you sure?',
          body: '<label class="form-label" for="confirm-del">Type <strong>DELETE</strong> to confirm.</label><input id="confirm-del" class="form-control" autocomplete="off">',
          buttons: [{ label: 'Cancel', value: null }, { label: 'Delete everything', value: 'x', variant: 'danger' }],
          onShown: (d) => d.querySelector('#confirm-del').focus(),
          collect: (d) => d.querySelector('#confirm-del').value.trim() === 'DELETE' || false,
        });
        if (!typed) return;
        replaceAll({ songs: [], settings: defaultSettings(), meta: defaultMeta(), setlists: [], practiceLog: [], practiceTotals: defaultPracticeTotals(), flashcards: {} });
        toast('All data deleted.', { type: 'info' });
        location.hash = '#/';
      }
    }));
    offs.push(bindDropZone($('#drop'), drawInfo));
    drawInfo();
    return () => offs.forEach((o) => o());
  },
};

