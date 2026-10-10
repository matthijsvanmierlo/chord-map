// Song / progression editor.
import { songPrefs } from '../music/voicingPrefs.js';
import { getSong, saveSong, deleteSong, createSong, getSettings, updateMeta, subscribe, flush } from '../state/store.js';
import { newSection, newBar, newId } from '../state/schema.js';
import { History } from '../state/history.js';
import { getTuning, allTunings } from '../music/tunings.js';
import { parseChord } from '../music/chordParser.js';
import { transposeSong, barBeats, diatonicChords } from '../music/song.js';
import { parseBarText, barsToText, splitEvenly } from '../music/roman.js';
import { chordLabel } from '../render/notation.js';
import { renderLeadSheet } from '../render/leadSheet.js';
import { allPatterns } from '../data/strumPatterns.js';
import { GROOVES, getGroove } from '../data/grooves.js';
import { createTapTempo } from '../ui/tapTempo.js';
import { voicingPrefsFormHTML, readVoicingPrefsForm } from '../ui/voicingPrefsForm.js';
import { STYLE_LABELS } from '../music/voicingPrefs.js';
import { suggestCapo } from '../music/capo.js';
import { reharmSuggestions } from '../music/reharm.js';
import { songHasLyrics } from '../music/lyrics.js';
import { prettyChord } from '../music/chordParser.js';
import { STYLES } from '../data/presets/index.js';
import { openChordEditor } from '../ui/chordEditor.js';
import { exportMenuHTML, runExport } from '../ui/exportMenu.js';
import { toast, confirmDialog, dialog } from '../ui/feedback.js';
import { escapeHtml, icon, on, debounce, announce } from '../ui/dom.js';
import { navigate, onBeforeLeave } from '../router.js';
import { player } from '../audio/player.js';
import { keyOptions, modeOptions, notFound, fillInstrumentSelect } from './shared.js';
import { displayControlsHTML, bindDisplayControls } from './progression.js';
import { pcOf, keyLabel } from '../music/theory.js';

const METERS = ['2/4', '3/4', '4/4', '5/4', '6/4', '6/8', '7/8', '9/8', '12/8'];
const MAJOR_TONIC_BY_PC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_TONIC_BY_PC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/** Re-fit bars that exactly filled the old meter to the new one. */
function refitBars(song, newNum) {
  const oldNum = song.timeSignature[0];
  return song.sections.map((sec) => ({
    ...sec,
    bars: sec.bars.map((bar) => {
      if (barBeats(bar) !== oldNum || !bar.chords.length) return bar;
      const beats = bar.chords.length === 1 ? [newNum] : splitEvenly(newNum, bar.chords.length);
      return { ...bar, chords: bar.chords.map((c, i) => ({ ...c, beats: beats[i] ?? 1 })) };
    }),
  }));
}

export default {
  title: (p) => getSong(p.id)?.title || 'Editor',
  render(el, { params }) {
    let song = getSong(params.id);
    if (!song) {
      el.innerHTML = notFound('file-earmark-x', 'Song not found', 'It may have been deleted, or it lives in another browser. Import a backup to bring it here.', '<a class="btn btn-primary" href="#/songs">Go to My Songs</a>');
      return null;
    }
    updateMeta({ lastSongId: song.id });
    const history = new History();
    let textMode = false;
    let lyricsMode = songHasLyrics(song);
    let focusKey = null;

    const tuning = () => getTuning(song.instrumentId);

    el.innerHTML = `
      <nav aria-label="Breadcrumb"><ol class="breadcrumb small mb-2">
        <li class="breadcrumb-item"><a href="#/songs">My Songs</a></li>
        <li class="breadcrumb-item active" aria-current="page" id="crumb-title"></li>
      </ol></nav>
      <h1 class="visually-hidden" id="page-h1"></h1>
      <div class="row g-2 align-items-end mb-3">
        <div class="col-12 col-md-7">
          <label for="f-title" class="form-label small mb-0 text-body-secondary">Title</label>
          <input id="f-title" class="form-control form-control-lg fw-bold" maxlength="200">
        </div>
        <div class="col-12 col-md-5">
          <label for="f-artist" class="form-label small mb-0 text-body-secondary">Artist / source (optional)</label>
          <input id="f-artist" class="form-control form-control-lg" maxlength="200">
        </div>
      </div>

      <div class="surface p-3 mb-3">
        <div class="row g-2">
          <div class="col-6 col-md-2"><label class="form-label small mb-1" for="f-tonic">Key</label><select id="f-tonic" class="form-select form-select-sm"></select></div>
          <div class="col-6 col-md-2"><label class="form-label small mb-1" for="f-mode">Mode</label><select id="f-mode" class="form-select form-select-sm"></select></div>
          <div class="col-4 col-md-1"><label class="form-label small mb-1" for="f-meter">Time</label><select id="f-meter" class="form-select form-select-sm">${METERS.map((m) => `<option>${m}</option>`).join('')}</select></div>
          <div class="col-8 col-md-2"><label class="form-label small mb-1" for="f-tempo">Tempo (bpm)</label>
            <div class="input-group input-group-sm"><input id="f-tempo" type="number" min="20" max="400" class="form-control">
            <button class="btn btn-outline-secondary" type="button" data-act="tap" title="Tap repeatedly to set the tempo">Tap</button></div></div>
          <div class="col-4 col-md-1"><label class="form-label small mb-1" for="f-capo">Capo</label><select id="f-capo" class="form-select form-select-sm">${Array.from({ length: 13 }, (_, i) => `<option value="${i}">${i || 'None'}</option>`).join('')}</select></div>
          <div class="col-12 col-md-4"><label class="form-label small mb-1" for="f-instrument">Instrument</label><select id="f-instrument" class="form-select form-select-sm"></select></div>
          <div class="col-6 col-md-3"><label class="form-label small mb-1" for="f-pattern">Strum pattern</label><select id="f-pattern" class="form-select form-select-sm"></select></div>
          <div class="col-6 col-md-3"><label class="form-label small mb-1" for="f-groove">Backing band</label><select id="f-groove" class="form-select form-select-sm">${GROOVES.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('')}</select></div>
          <div class="col-4 col-md-2 d-flex align-items-end"><div class="form-check form-switch mb-1"><input class="form-check-input" type="checkbox" role="switch" id="f-swing"><label class="form-check-label small" for="f-swing">Swing feel</label></div></div>
          <div class="col-4 col-md-2 d-flex align-items-end"><button class="btn btn-sm btn-outline-secondary w-100" type="button" data-act="shapes" id="shapes-btn">${icon('sliders')} Shapes</button></div>
          <div class="col-4 col-md-2 d-flex align-items-end"><button class="btn btn-sm btn-outline-secondary w-100" type="button" data-act="capo-suggest">${icon('magic')} Capo helper</button></div>
        </div>
      </div>

      <div class="editor-toolbar d-flex flex-wrap gap-2 align-items-center mb-3" role="toolbar" aria-label="Editor tools">
        <div class="btn-group" role="group" aria-label="History">
          <button class="btn btn-outline-secondary" type="button" data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon('arrow-counterclockwise')}</button>
          <button class="btn btn-outline-secondary" type="button" data-act="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon('arrow-clockwise')}</button>
        </div>
        <div class="btn-group" role="group" aria-label="Transpose">
          <button class="btn btn-outline-secondary" type="button" data-act="transpose" data-step="-1" title="Transpose down a semitone">${icon('dash')}<span class="visually-hidden">Transpose down</span></button>
          <span class="btn btn-outline-secondary disabled small" aria-hidden="true">Transpose</span>
          <button class="btn btn-outline-secondary" type="button" data-act="transpose" data-step="1" title="Transpose up a semitone">${icon('plus')}<span class="visually-hidden">Transpose up</span></button>
        </div>
        <button class="btn btn-outline-secondary" type="button" data-act="textmode" aria-pressed="false">${icon('fonts')} <span>Type as text</span></button>
        <button class="btn btn-outline-secondary ${lyricsMode ? 'active' : ''}" type="button" data-act="lyrics" aria-pressed="${lyricsMode}">${icon('chat-quote')} <span>Lyrics</span></button>
        <button class="btn btn-primary" type="button" data-act="play">${icon('play-fill')} <span>Play</span></button>
        <a class="btn btn-outline-primary" href="#/practice/${escapeHtml(song.id)}">${icon('bullseye')} Practise</a>
        ${exportMenuHTML('editor-export')}
        <div class="dropdown">
          <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">${icon('three-dots')} More</button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><button class="dropdown-item" type="button" data-act="duplicate">${icon('copy')} Duplicate song</button></li>
            <li><button class="dropdown-item text-danger" type="button" data-act="delete">${icon('trash')} Delete song</button></li>
          </ul>
        </div>
        <span class="save-indicator ms-auto" id="save-ind" aria-live="polite"></span>
      </div>

      <div id="sections"></div>
      <button class="btn btn-outline-primary mt-2 mb-4" type="button" data-act="add-section">${icon('plus-lg')} Add section</button>

      <section class="surface p-3 mb-4" aria-labelledby="form-h">
        <h2 class="h6" id="form-h">${icon('list-ol')} Arrangement (play order)</h2>
        <p class="small text-body-secondary mb-2">Leave empty to play sections top to bottom. Add sections to repeat them, e.g. Verse → Chorus → Verse → Chorus.</p>
        <div id="form-list" class="d-flex flex-wrap gap-2 align-items-center"></div>
      </section>

      <div class="row g-3 mb-4">
        <div class="col-md-8">
          <label class="form-label fw-semibold" for="f-notes">Practice notes</label>
          <textarea id="f-notes" class="form-control" rows="3" maxlength="10000" placeholder="Fingering reminders, where it's from, goals…"></textarea>
        </div>
        <div class="col-md-4">
          <label class="form-label fw-semibold" for="f-style">Style</label>
          <select id="f-style" class="form-select mb-2"><option value="">—</option>${STYLES.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select>
          <label class="form-label fw-semibold" for="f-tags">Tags</label>
          <input id="f-tags" class="form-control" placeholder="comma, separated">
        </div>
      </div>

      <section aria-labelledby="preview-h">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h2 class="h5 mb-0" id="preview-h">Sheet preview</h2>
          ${displayControlsHTML(getSettings())}
        </div>
        <div class="surface p-3" id="preview"></div>
      </section>`;

    const sectionsEl = el.querySelector('#sections');
    const previewEl = el.querySelector('#preview');
    const $ = (s) => el.querySelector(s);
    const saveInd = $('#save-ind');
    let sortables = [];

    // ---------- state changes ----------
    function commit(mutator, { label = '', redraw = true } = {}) {
      history.push(song);
      const next = structuredClone(song);
      mutator(next);
      song = saveSong(next);
      saveInd.innerHTML = `${icon('check2')} Saved`;
      if (label) announce(label);
      if (redraw) drawAll();
      else schedulePreview();
    }
    function restore(snapshot, label) {
      if (!snapshot) return;
      song = saveSong(snapshot);
      announce(label);
      drawAll();
    }

    // ---------- drawing ----------
    function drawMeta() {
      $('#crumb-title').textContent = song.title;
      $('#page-h1').textContent = `Edit: ${song.title}`;
      if (document.activeElement !== $('#f-title')) $('#f-title').value = song.title;
      if (document.activeElement !== $('#f-artist')) $('#f-artist').value = song.artist;
      $('#f-tonic').innerHTML = keyOptions(song.key.tonic);
      if (![...$('#f-tonic').options].some((o) => o.value === song.key.tonic)) $('#f-tonic').insertAdjacentHTML('afterbegin', `<option selected>${escapeHtml(song.key.tonic)}</option>`);
      $('#f-mode').innerHTML = modeOptions(song.key.mode);
      $('#f-meter').value = song.timeSignature.join('/');
      if (document.activeElement !== $('#f-tempo')) $('#f-tempo').value = song.tempo;
      $('#f-capo').value = String(song.capo);
      fillInstrumentSelect($('#f-instrument'), song.instrumentId);
      if (!allTunings().some((t) => t.id === song.instrumentId)) $('#f-instrument').insertAdjacentHTML('afterbegin', `<option selected value="${escapeHtml(song.instrumentId)}">Unknown tuning (${escapeHtml(song.instrumentId)}) — using standard guitar</option>`);
      $('#f-pattern').innerHTML = allPatterns().map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.custom ? ' (custom)' : ''}</option>`).join('');
      $('#f-pattern').value = song.strumPatternId;
      if ($('#f-pattern').value !== song.strumPatternId) $('#f-pattern').insertAdjacentHTML('afterbegin', `<option selected value="${escapeHtml(song.strumPatternId)}">Missing pattern — using quarter notes</option>`);
      $('#f-groove').value = getGroove(song.groove).id;
      $('#shapes-btn').innerHTML = `${icon('sliders')} ${song.voicingPrefs ? escapeHtml(song.voicingPrefs.style === 'any' ? 'Custom shapes' : STYLE_LABELS[song.voicingPrefs.style].replace(/ \(.*\)/, '')) : 'Shapes'}`;
      $('#shapes-btn').setAttribute('aria-label', `Chord shape preferences for this song: ${song.voicingPrefs ? 'custom' : 'app default'}`);
      $('#f-swing').checked = song.swing;
      if (document.activeElement !== $('#f-notes')) $('#f-notes').value = song.notes;
      $('#f-style').value = song.style || '';
      if (document.activeElement !== $('#f-tags')) $('#f-tags').value = song.tags.join(', ');
      $('[data-act="undo"]').disabled = !history.canUndo();
      $('[data-act="redo"]').disabled = !history.canRedo();
    }

    function chordPill(sec, bar, c, ci) {
      const valid = parseChord(c.symbol);
      const display = getSettings().chordDisplay;
      const label = valid ? chordLabel(c.symbol, song.key, display === 'both' ? 'chords' : display) : c.symbol;
      const sub = display === 'both' && valid ? chordLabel(c.symbol, song.key, 'roman') + ' · ' : '';
      return `<button type="button" class="chord-pill ${valid ? '' : 'invalid'}" data-edit="${sec.id}|${bar.id}|${ci}" data-key="pill-${bar.id}-${ci}"
        aria-label="${escapeHtml(`${label}, ${c.beats} beat${c.beats > 1 ? 's' : ''}${valid ? '' : ', unrecognised chord'}${c.voicingId ? ', shape locked' : ''}. Edit`)}">
        ${escapeHtml(label)}${c.voicingId ? ` ${icon('lock-fill', 'small opacity-50')}` : ''}<small>${escapeHtml(sub)}${c.beats} beat${c.beats > 1 ? 's' : ''}</small></button>`;
    }

    function barTile(sec, bar, bi) {
      const per = song.timeSignature[0];
      const total = barBeats(bar);
      const warn = total !== per;
      return `<div class="bar-tile ${warn ? 'warn' : ''}" data-bar="${bar.id}">
        <div class="bar-num">
          <span><button type="button" class="drag-handle" aria-hidden="true" tabindex="-1" title="Drag to move">${icon('grip-vertical')}</button>Bar ${bi + 1}</span>
          <span class="${warn ? 'text-warning-emphasis fw-semibold' : ''}" ${warn ? `title="This bar has ${total} beats but the time signature has ${per}"` : ''}>${total}/${per}</span>
          <div class="dropdown">
            <button class="btn btn-sm py-0 px-1" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Bar ${bi + 1} options" data-key="barmenu-${bar.id}">${icon('three-dots-vertical')}</button>
            <ul class="dropdown-menu">
              <li><button class="dropdown-item" type="button" data-bar-act="add-chord" data-sec="${sec.id}" data-bar-id="${bar.id}">${icon('plus')} Add chord to bar</button></li>
              <li><button class="dropdown-item" type="button" data-bar-act="fill" data-sec="${sec.id}" data-bar-id="${bar.id}">${icon('arrows-expand')} Split beats evenly</button></li>
              <li><button class="dropdown-item" type="button" data-bar-act="dup" data-sec="${sec.id}" data-bar-id="${bar.id}">${icon('copy')} Duplicate bar</button></li>
              <li><button class="dropdown-item" type="button" data-bar-act="left" data-sec="${sec.id}" data-bar-id="${bar.id}" ${bi === 0 ? 'disabled' : ''}>${icon('arrow-left')} Move earlier</button></li>
              <li><button class="dropdown-item" type="button" data-bar-act="right" data-sec="${sec.id}" data-bar-id="${bar.id}" ${bi === sec.bars.length - 1 ? 'disabled' : ''}>${icon('arrow-right')} Move later</button></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item text-danger" type="button" data-bar-act="delete" data-sec="${sec.id}" data-bar-id="${bar.id}">${icon('trash')} Delete bar</button></li>
            </ul>
          </div>
        </div>
        <div class="bar-chords">
          ${bar.chords.map((c, ci) => chordPill(sec, bar, c, ci)).join('')}
          ${bar.chords.length < 8 ? `<button type="button" class="btn btn-sm btn-link px-1" data-bar-act="add-chord" data-sec="${sec.id}" data-bar-id="${bar.id}" aria-label="Add chord to bar ${bi + 1}" data-key="addchord-${bar.id}">${icon('plus-circle')}</button>` : ''}
        </div>
        ${lyricsMode ? `<label class="visually-hidden" for="ly-${bar.id}">Lyrics for bar ${bi + 1}${bar.chords.length > 1 ? ' (type ^ where the next chord starts)' : ''}</label>
          <input id="ly-${bar.id}" class="form-control form-control-sm bar-lyric" data-lyric="${sec.id}|${bar.id}" data-key="ly-${bar.id}" maxlength="500"
            placeholder="${bar.chords.length > 1 ? 'Words… ^ next chord' : 'Words…'}" value="${escapeHtml(bar.lyric || '')}">` : ''}
      </div>`;
    }

    function drawSections() {
      sortables.forEach((s) => s.destroy());
      sortables = [];
      const per = song.timeSignature[0];
      sectionsEl.innerHTML = song.sections.map((sec, si) => `
        <section class="card section-card mb-3" data-section="${sec.id}" aria-labelledby="sec-name-${sec.id}">
          <div class="card-header d-flex flex-wrap align-items-center gap-2">
            <button type="button" class="drag-handle section-handle" aria-hidden="true" tabindex="-1" title="Drag to reorder">${icon('grip-vertical')}</button>
            <label class="visually-hidden" for="sec-name-${sec.id}">Section name</label>
            <input id="sec-name-${sec.id}" class="form-control form-control-sm fw-semibold" style="max-width: 14rem" value="${escapeHtml(sec.name)}" data-sec-name="${sec.id}" list="section-names" maxlength="60">
            <label class="small text-body-secondary" for="sec-rep-${sec.id}">Play</label>
            <select id="sec-rep-${sec.id}" class="form-select form-select-sm" style="width:auto" data-sec-repeat="${sec.id}">
              ${Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}" ${sec.repeat === i + 1 ? 'selected' : ''}>×${i + 1}</option>`).join('')}
            </select>
            <span class="small text-body-secondary">${sec.bars.length} bar${sec.bars.length === 1 ? '' : 's'}</span>
            <div class="ms-auto btn-group btn-group-sm" role="group" aria-label="Section ${escapeHtml(sec.name)} actions">
              <button class="btn btn-outline-secondary" type="button" data-sec-act="up" data-sec="${sec.id}" ${si === 0 ? 'disabled' : ''} aria-label="Move section up">${icon('arrow-up')}</button>
              <button class="btn btn-outline-secondary" type="button" data-sec-act="down" data-sec="${sec.id}" ${si === song.sections.length - 1 ? 'disabled' : ''} aria-label="Move section down">${icon('arrow-down')}</button>
              <button class="btn btn-outline-secondary" type="button" data-sec-act="dup" data-sec="${sec.id}" aria-label="Duplicate section">${icon('copy')}</button>
              <button class="btn btn-outline-danger" type="button" data-sec-act="delete" data-sec="${sec.id}" aria-label="Delete section">${icon('trash')}</button>
            </div>
          </div>
          <div class="card-body">
            ${textMode ? `
              <label class="form-label small" for="sec-text-${sec.id}">Chords as text — bars separated by <kbd>|</kbd>, <kbd>.</kbd> adds a beat, <kbd>%</kbd> repeats a bar</label>
              <textarea id="sec-text-${sec.id}" class="form-control font-monospace" rows="3" data-sec-text="${sec.id}" spellcheck="false">${escapeHtml(barsToText(sec.bars, { beatsPerBar: per }))}</textarea>
              <div class="d-flex flex-wrap gap-2 align-items-center mt-2">
                <button class="btn btn-sm btn-primary" type="button" data-sec-act="apply-text" data-sec="${sec.id}">Apply</button>
                <div class="form-check form-check-inline small mb-0">
                  <input class="form-check-input" type="checkbox" id="sec-roman-${sec.id}" data-sec-roman="${sec.id}">
                  <label class="form-check-label" for="sec-roman-${sec.id}">I'm typing Roman numerals (ii7 V7 I)</label>
                </div>
                <span class="small" data-sec-errors="${sec.id}" aria-live="polite"></span>
              </div>` : `
              <div class="bar-grid" data-bars="${sec.id}">
                ${sec.bars.map((bar, bi) => barTile(sec, bar, bi)).join('')}
                <button type="button" class="add-bar" data-sec-act="add-bar" data-sec="${sec.id}" data-key="addbar-${sec.id}">${icon('plus-lg')} Add bar</button>
              </div>
              ${!sec.bars.length ? `<p class="small text-body-secondary mt-2 mb-0">Empty section — add a bar, or switch on <em>Type as text</em> and paste something like <code>Am | F | C | G</code>.</p>` : ''}
              <div class="mt-2 d-flex flex-wrap gap-1 align-items-center">
                <span class="small text-body-secondary me-1">Quick add bar:</span>
                ${diatonicChords(song.key).map((d) => d.triad ? `<button type="button" class="btn btn-sm btn-outline-primary py-0" data-quick="${escapeHtml(d.triad)}" data-sec="${sec.id}" title="${escapeHtml(d.roman)}">${escapeHtml(chordLabel(d.triad, song.key, 'chords'))}</button>` : '').join('')}
              </div>`}
          </div>
        </section>`).join('') + `<datalist id="section-names">${['Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Bridge', 'Solo', 'Outro', 'A', 'B', 'Head', 'Turnaround'].map((n) => `<option value="${n}">`).join('')}</datalist>`;

      if (window.Sortable && !textMode) {
        sectionsEl.querySelectorAll('[data-bars]').forEach((grid) => {
          sortables.push(window.Sortable.create(grid, {
            animation: 150, handle: '.drag-handle', draggable: '.bar-tile', group: 'bars',
            onEnd: () => {
              const order = {};
              sectionsEl.querySelectorAll('[data-bars]').forEach((g) => { order[g.dataset.bars] = [...g.querySelectorAll('.bar-tile')].map((b) => b.dataset.bar); });
              commit((s) => {
                const all = new Map(s.sections.flatMap((x) => x.bars.map((b) => [b.id, b])));
                s.sections.forEach((x) => { x.bars = (order[x.id] || []).map((id) => all.get(id)).filter(Boolean); });
              }, { label: 'Bar moved' });
            },
          }));
        });
        sortables.push(window.Sortable.create(sectionsEl, {
          animation: 150, handle: '.section-handle', draggable: '.section-card',
          onEnd: () => {
            const ids = [...sectionsEl.querySelectorAll('.section-card')].map((s) => s.dataset.section);
            commit((s) => { s.sections.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); }, { label: 'Section moved' });
          },
        }));
      }
    }

    function drawForm() {
      const byId = new Map(song.sections.map((s) => [s.id, s]));
      const list = $('#form-list');
      list.innerHTML = (song.form.length ? song.form.map((id, i) => `
          <span class="badge rounded-pill text-bg-light border d-inline-flex align-items-center gap-1 fs-6 fw-normal">
            ${i + 1}. ${escapeHtml(byId.get(id)?.name || '?')}
            <button type="button" class="btn btn-sm p-0 border-0" data-form-act="left" data-i="${i}" aria-label="Move ${escapeHtml(byId.get(id)?.name)} earlier" ${i === 0 ? 'disabled' : ''}>${icon('chevron-left')}</button>
            <button type="button" class="btn btn-sm p-0 border-0" data-form-act="right" data-i="${i}" aria-label="Move ${escapeHtml(byId.get(id)?.name)} later" ${i === song.form.length - 1 ? 'disabled' : ''}>${icon('chevron-right')}</button>
            <button type="button" class="btn btn-sm p-0 border-0" data-form-act="remove" data-i="${i}" aria-label="Remove ${escapeHtml(byId.get(id)?.name)} from arrangement">${icon('x')}</button>
          </span>`).join(`<span aria-hidden="true">→</span>`) : '<span class="small text-body-secondary">Top to bottom</span>')
        + `<div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">${icon('plus')} Add to arrangement</button>
            <ul class="dropdown-menu">${song.sections.map((s) => `<li><button class="dropdown-item" type="button" data-form-add="${s.id}">${escapeHtml(s.name)}</button></li>`).join('')}</ul>
          </div>
          ${song.form.length ? `<button type="button" class="btn btn-sm btn-link" data-form-act="clear">Clear</button>` : ''}`;
    }

    let previewTimer;
    function schedulePreview() {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(drawPreview, 300);
    }
    function drawPreview() {
      try {
        renderLeadSheet(previewEl, song, { tuning: tuning(), settings: getSettings(), interactive: true });
      } catch (e) {
        console.error(e);
        previewEl.innerHTML = `<p class="text-danger small">Preview failed: ${escapeHtml(e.message)}</p>`;
      }
    }

    function drawAll() {
      const active = document.activeElement?.dataset?.key || focusKey;
      drawMeta();
      drawSections();
      drawForm();
      schedulePreview();
      if (active) {
        const t = el.querySelector(`[data-key="${CSS.escape(active)}"]`);
        if (t) t.focus();
      }
      focusKey = null;
    }

    // ---------- helpers ----------
    const findSec = (s, id) => s.sections.find((x) => x.id === id);
    const findBar = (s, secId, barId) => findSec(s, secId)?.bars.find((b) => b.id === barId);

    function editChord(secId, barId, ci, { isNew = false } = {}) {
      const bar = findBar(song, secId, barId);
      if (!bar) return;
      const c = bar.chords[ci];
      const barNo = findSec(song, secId).bars.indexOf(bar) + 1;
      let pushed = false;
      openChordEditor({
        chord: c, song, tuning: tuning(), settings: getSettings(),
        title: `${findSec(song, secId).name} · bar ${barNo}${isNew ? ' · new chord' : ''}`,
        onChange: (nc) => {
          if (!pushed) { history.push(song); pushed = true; }
          const next = structuredClone(song);
          const b = findBar(next, secId, barId);
          if (b?.chords[ci]) b.chords[ci] = nc;
          song = saveSong(next);
          saveInd.innerHTML = `${icon('check2')} Saved`;
          drawMeta();
          drawSections();
          schedulePreview();
        },
        ideas: () => reharmSuggestions(song, secId, barId, ci),
        onApplyIdea: (idea) => {
          const next = idea.apply(song);
          commit((s) => { s.sections = next.sections; }, { label: `Applied ${idea.label}` });
          toast(`Applied: ${idea.label}`, { type: 'success', action: { label: 'Undo', run: () => restore(history.undo(song), 'Undone') } });
        },
        onRemove: () => commit((s) => {
          const b = findBar(s, secId, barId);
          b.chords.splice(ci, 1);
          if (!b.chords.length) findSec(s, secId).bars = findSec(s, secId).bars.filter((x) => x.id !== barId);
        }, { label: 'Chord removed' }),
        onClose: () => {
          const t = el.querySelector(`[data-key="pill-${barId}-${ci}"]`) || el.querySelector(`[data-key="addchord-${barId}"]`) || el.querySelector(`[data-key="addbar-${secId}"]`);
          t?.focus();
        },
      });
    }

    function addBar(secId, symbol = null) {
      const per = song.timeSignature[0];
      const sec = findSec(song, secId);
      const last = sec.bars[sec.bars.length - 1]?.chords.slice(-1)[0];
      const sym = symbol || last?.symbol || diatonicChords(song.key)[0].triad;
      const bar = newBar([{ symbol: sym, beats: per, voicingId: null }]);
      commit((s) => { findSec(s, secId).bars.push(bar); }, { label: `Bar added: ${sym}` });
      return bar;
    }

    function transposeBy(step) {
      const pc = (pcOf(song.key.tonic) + step + 12) % 12;
      const minorish = ['minor', 'harmonicMinor', 'dorian', 'phrygian', 'locrian'].includes(song.key.mode);
      const tonic = (minorish ? MINOR_TONIC_BY_PC : MAJOR_TONIC_BY_PC)[pc];
      commit((s) => Object.assign(s, transposeSong(s, tonic)), { label: `Transposed to ${tonic}` });
      toast(`Transposed to ${keyLabel(song.key)}`, { type: 'info', delay: 2000 });
    }

    // ---------- events ----------
    const offs = [bindDisplayControls(el)];
    const metaInput = (sel, fn, opts) => offs.push(on(el, 'change', sel, (e) => commit((s) => fn(s, e.target), opts)));
    offs.push(on(el, 'input', '#f-title', debounce((e) => commit((s) => { s.title = e.target.value.trim() || 'Untitled'; }, { redraw: false }), 400)));
    offs.push(on(el, 'input', '#f-artist', debounce((e) => commit((s) => { s.artist = e.target.value; }, { redraw: false }), 400)));
    offs.push(on(el, 'input', '#f-notes', debounce((e) => commit((s) => { s.notes = e.target.value; }, { redraw: false }), 600)));
    offs.push(on(el, 'change', '#f-title', () => { $('#crumb-title').textContent = song.title; }));
    metaInput('#f-tags', (s, t) => { s.tags = t.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 30); }, { redraw: false });
    metaInput('#f-style', (s, t) => { s.style = t.value; }, { redraw: false });
    metaInput('#f-tempo', (s, t) => { s.tempo = Math.max(20, Math.min(400, Number(t.value) || s.tempo)); });
    metaInput('#f-capo', (s, t) => { s.capo = Number(t.value); });
    metaInput('#f-instrument', (s, t) => { s.instrumentId = t.value; s.sections.forEach((x) => x.bars.forEach((b) => b.chords.forEach((c) => { c.voicingId = null; }))); });
    metaInput('#f-pattern', (s, t) => { s.strumPatternId = t.value; });
    metaInput('#f-swing', (s, t) => { s.swing = t.checked; });
    metaInput('#f-groove', (s, t) => { s.groove = t.value; });
    const tapper = createTapTempo();
    let tapTimer = null;
    metaInput('#f-mode', (s, t) => { s.key = { ...s.key, mode: t.value }; });
    offs.push(on(el, 'change', '#f-meter', (e) => {
      const [num, den] = e.target.value.split('/').map(Number);
      commit((s) => { s.sections = refitBars(s, num); s.timeSignature = [num, den]; }, { label: `Time signature ${num}/${den}` });
    }));
    offs.push(on(el, 'change', '#f-tonic', async (e) => {
      const tonic = e.target.value;
      if (!song.sections.some((s) => s.bars.length)) { commit((s) => { s.key = { ...s.key, tonic }; }); return; }
      const choice = await dialog({
        title: 'Change key',
        body: `<p>Move the chords to <strong>${escapeHtml(tonic)}</strong> too?</p><p class="small text-body-secondary mb-0">Transposing keeps the same progression (same Roman numerals). Keeping the chords only changes the key signature and numeral labels.</p>`,
        buttons: [{ label: 'Cancel', value: null }, { label: 'Keep chords', value: 'keep', variant: 'outline-primary' }, { label: 'Transpose chords', value: 'transpose', variant: 'primary' }],
      });
      if (choice === 'transpose') commit((s) => Object.assign(s, transposeSong(s, tonic)), { label: `Transposed to ${tonic}` });
      else if (choice === 'keep') commit((s) => { s.key = { ...s.key, tonic }; });
      else drawMeta();
    }));

    offs.push(on(el, 'click', '[data-edit]', (e, t) => {
      const [secId, barId, ci] = t.dataset.edit.split('|');
      editChord(secId, barId, Number(ci));
    }));
    offs.push(on(el, 'click', '[data-quick]', (e, t) => addBar(t.dataset.sec, t.dataset.quick)));
    offs.push(on(el, 'click', '[data-bar-act]', (e, t) => {
      const { sec: secId, barId } = t.dataset;
      const act = t.dataset.barAct;
      if (act === 'add-chord') {
        const bar = findBar(song, secId, barId);
        const per = song.timeSignature[0];
        const n = bar.chords.length + 1;
        const beats = splitEvenly(per, n);
        const last = bar.chords[bar.chords.length - 1];
        commit((s) => {
          const b = findBar(s, secId, barId);
          b.chords.push({ symbol: last?.symbol || song.key.tonic, beats: 1, voicingId: null });
          if (barBeats(bar) === per) b.chords.forEach((c, i) => { c.beats = beats[i]; });
        }, { label: 'Chord added' });
        editChord(secId, barId, n - 1, { isNew: true });
      } else if (act === 'fill') {
        commit((s) => {
          const b = findBar(s, secId, barId);
          const beats = splitEvenly(song.timeSignature[0], b.chords.length);
          b.chords.forEach((c, i) => { c.beats = beats[i]; });
        }, { label: 'Beats split evenly' });
      } else if (act === 'dup') {
        commit((s) => {
          const sec = findSec(s, secId);
          const i = sec.bars.findIndex((b) => b.id === barId);
          sec.bars.splice(i + 1, 0, { ...structuredClone(sec.bars[i]), id: newId() });
        }, { label: 'Bar duplicated' });
      } else if (act === 'left' || act === 'right') {
        focusKey = `barmenu-${barId}`;
        commit((s) => {
          const sec = findSec(s, secId);
          const i = sec.bars.findIndex((b) => b.id === barId);
          const j = act === 'left' ? i - 1 : i + 1;
          if (j < 0 || j >= sec.bars.length) return;
          [sec.bars[i], sec.bars[j]] = [sec.bars[j], sec.bars[i]];
        }, { label: `Bar moved ${act === 'left' ? 'earlier' : 'later'}` });
      } else if (act === 'delete') {
        focusKey = `addbar-${secId}`;
        commit((s) => { const sec = findSec(s, secId); sec.bars = sec.bars.filter((b) => b.id !== barId); }, { label: 'Bar deleted' });
        toast('Bar deleted', { type: 'info', action: { label: 'Undo', run: () => restore(history.undo(song), 'Undone') } });
      }
    }));
    offs.push(on(el, 'click', '[data-sec-act]', async (e, t) => {
      const secId = t.dataset.sec;
      const act = t.dataset.secAct;
      if (act === 'add-bar') {
        const bar = addBar(secId);
        editChord(secId, bar.id, 0, { isNew: true });
      } else if (act === 'up' || act === 'down') {
        commit((s) => {
          const i = s.sections.findIndex((x) => x.id === secId);
          const j = act === 'up' ? i - 1 : i + 1;
          [s.sections[i], s.sections[j]] = [s.sections[j], s.sections[i]];
        }, { label: `Section moved ${act}` });
        el.querySelector(`[data-sec-act="${act}"][data-sec="${secId}"]:not(:disabled)`)?.focus();
      } else if (act === 'dup') {
        commit((s) => {
          const i = s.sections.findIndex((x) => x.id === secId);
          const copy = structuredClone(s.sections[i]);
          copy.id = newId(); copy.name += ' (copy)';
          copy.bars.forEach((b) => { b.id = newId(); });
          s.sections.splice(i + 1, 0, copy);
        }, { label: 'Section duplicated' });
      } else if (act === 'delete') {
        const sec = findSec(song, secId);
        if (song.sections.length === 1) { toast('A song needs at least one section.', { type: 'warning' }); return; }
        if (sec.bars.length && !(await confirmDialog('Delete section?', `Delete “${sec.name}” and its ${sec.bars.length} bar(s)? You can undo this.`, { confirmLabel: 'Delete', danger: true }))) return;
        commit((s) => { s.sections = s.sections.filter((x) => x.id !== secId); s.form = s.form.filter((id) => id !== secId); }, { label: 'Section deleted' });
      } else if (act === 'apply-text') {
        const ta = el.querySelector(`[data-sec-text="${secId}"]`);
        const roman = el.querySelector(`[data-sec-roman="${secId}"]`).checked;
        const { bars, errors } = parseBarText(ta.value, { beatsPerBar: song.timeSignature[0], roman, keyTonic: song.key.tonic });
        const errEl = el.querySelector(`[data-sec-errors="${secId}"]`);
        if (errors.length) { errEl.innerHTML = `<span class="text-danger">${icon('exclamation-circle')} ${escapeHtml(errors.join('; '))}</span>`; return; }
        commit((s) => { findSec(s, secId).bars = bars.map((b) => newBar(b.chords.map((c) => ({ ...c, voicingId: null })))); }, { label: `${bars.length} bars applied` });
        el.querySelector(`[data-sec-errors="${secId}"]`).innerHTML = `<span class="text-success">${icon('check2')} Applied ${bars.length} bars</span>`;
      }
    }));
    offs.push(on(el, 'change', '[data-lyric]', (e, t) => {
      const [secId, barId] = t.dataset.lyric.split('|');
      commit((s) => {
        const bar = findBar(s, secId, barId);
        const v = t.value.replace(/[\r\n]+/g, ' ').slice(0, 500);
        if (v.trim()) bar.lyric = v; else delete bar.lyric;
      }, { redraw: false });
    }));
    offs.push(on(el, 'change', '[data-sec-name]', (e, t) => commit((s) => { findSec(s, t.dataset.secName).name = t.value.trim() || 'Section'; }, { redraw: false })));
    offs.push(on(el, 'change', '[data-sec-repeat]', (e, t) => commit((s) => { findSec(s, t.dataset.secRepeat).repeat = Number(t.value); }, { redraw: false })));
    offs.push(on(el, 'click', '[data-form-add]', (e, t) => commit((s) => {
      if (!s.form.length) s.form = s.sections.map((x) => x.id);
      s.form.push(t.dataset.formAdd);
    }, { label: 'Added to arrangement' })));
    offs.push(on(el, 'click', '[data-form-act]', (e, t) => {
      const i = Number(t.dataset.i);
      const act = t.dataset.formAct;
      commit((s) => {
        if (act === 'clear') s.form = [];
        if (act === 'remove') s.form.splice(i, 1);
        if (act === 'left' && i > 0) [s.form[i - 1], s.form[i]] = [s.form[i], s.form[i - 1]];
        if (act === 'right' && i < s.form.length - 1) [s.form[i + 1], s.form[i]] = [s.form[i], s.form[i + 1]];
      }, { label: 'Arrangement updated' });
    }));
    offs.push(on(el, 'click', '[data-chord]', (e, t) => player.previewChord(t.dataset.chord, tuning(), { capo: song.capo, voicingId: t.dataset.voicing || null, prefs: songPrefs(song) })));
    offs.push(on(el, 'click', '[data-export]', (e, t) => runExport(t.dataset.export, {
      song, tuning: tuning(), sheetEl: previewEl.querySelector('.lead-sheet'), printHref: `#/print/${song.id}`, smooth: getSettings().smoothVoicing,
    })));
    const playBtn = $('[data-act="play"]');
    offs.push(player.on((type, d) => {
      if (type === 'state') playBtn.innerHTML = `${icon(d.playing ? 'stop-fill' : 'play-fill')} <span>${d.playing ? 'Stop' : 'Play'}</span>`;
    }));
    offs.push(on(el, 'click', '[data-act]', async (e, t) => {
      const act = t.dataset.act;
      if (act === 'tap') {
        const bpm = tapper.tap();
        if (bpm) {
          $('#f-tempo').value = bpm;
          announce(`${bpm} beats per minute`);
          clearTimeout(tapTimer);
          tapTimer = setTimeout(() => commit((s) => { s.tempo = bpm; }, { label: `Tempo ${bpm}` }), 1500);
        }
      }
      if (act === 'shapes') {
        const res = await dialog({
          title: 'Chord shapes for this song',
          body: `<div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" role="switch" id="vp-default" ${song.voicingPrefs ? '' : 'checked'}>
              <label class="form-check-label" for="vp-default">Use my default shape preferences (Settings)</label></div>
            <fieldset id="vp-fields" ${song.voicingPrefs ? '' : 'disabled'}><legend class="visually-hidden">Custom shape preferences</legend>
            ${voicingPrefsFormHTML(song.voicingPrefs || getSettings().voicing, 'svp')}</fieldset>
            <p class="small text-body-secondary mt-3 mb-0">Shapes you locked on individual chords are kept. If no shape matches, the usual shapes are shown instead.</p>`,
          buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', value: 'ok', variant: 'primary' }],
          onShown: (d) => d.querySelector('#vp-default').addEventListener('change', (e) => { d.querySelector('#vp-fields').disabled = e.target.checked; }),
          collect: (d) => ({ prefs: d.querySelector('#vp-default').checked ? null : readVoicingPrefsForm(d, 'svp') }),
        });
        if (res) commit((s) => { s.voicingPrefs = res.prefs; }, { label: 'Shape preferences updated' });
      }
      if (act === 'capo-suggest') {
        const ranked = suggestCapo(song, tuning()).slice(0, 6);
        if (!ranked.length) { toast('Add some chords first.', { type: 'info' }); return; }
        const pick = await dialog({
          title: 'Capo helper',
          body: `<p class="small">Positions ranked by how many easy open shapes they give you. The song keeps sounding in ${escapeHtml(keyLabel(song.key))}.</p>
            <fieldset><legend class="visually-hidden">Capo position</legend>
            ${ranked.map((r, i) => `<div class="form-check border-bottom py-2">
              <input class="form-check-input" type="radio" name="capo-pick" id="cp-${r.capo}" value="${r.capo}" ${i === 0 ? 'checked' : ''}>
              <label class="form-check-label w-100" for="cp-${r.capo}"><strong>${r.capo ? `Capo ${r.capo}` : 'No capo'}</strong> — play in <strong>${escapeHtml(prettyChord(r.shapeKey))}</strong> shapes
                ${r.capo === song.capo ? '<span class="badge text-bg-secondary ms-1">current</span>' : ''}
                <span class="d-block small text-body-secondary">${r.shapes.map((x) => `${escapeHtml(prettyChord(x.shape))}${x.open ? '' : '*'}`).join(' · ')} — ${r.openCount}/${r.shapes.length} open shapes</span></label></div>`).join('')}
            </fieldset><p class="small text-body-secondary mt-2 mb-0">* barre or higher-position shape</p>`,
          buttons: [{ label: 'Cancel', value: null }, { label: 'Use this capo', value: 'ok', variant: 'primary' }],
          collect: (d) => Number(d.querySelector('input[name="capo-pick"]:checked').value),
        });
        if (pick !== null && pick !== undefined) commit((s) => { s.capo = pick; s.sections.forEach((x) => x.bars.forEach((b) => b.chords.forEach((c) => { c.voicingId = null; }))); }, { label: pick ? `Capo ${pick}` : 'No capo' });
      }
      if (act === 'undo') restore(history.undo(song), 'Undone');
      if (act === 'redo') restore(history.redo(song), 'Redone');
      if (act === 'transpose') transposeBy(Number(t.dataset.step));
      if (act === 'lyrics') {
        lyricsMode = !lyricsMode;
        t.setAttribute('aria-pressed', String(lyricsMode));
        t.classList.toggle('active', lyricsMode);
        drawSections();
        if (lyricsMode) el.querySelector('[data-lyric]')?.focus();
      }
      if (act === 'textmode') {
        textMode = !textMode;
        t.setAttribute('aria-pressed', String(textMode));
        t.classList.toggle('active', textMode);
        drawSections();
      }
      if (act === 'add-section') {
        const names = song.sections.map((s) => s.name);
        const name = ['Verse', 'Chorus', 'Bridge', 'Outro'].find((n) => !names.includes(n)) || `Section ${song.sections.length + 1}`;
        const sec = newSection(name);
        commit((s) => { s.sections.push(sec); }, { label: `${name} added` });
        el.querySelector(`#sec-name-${CSS.escape(sec.id)}`)?.focus();
      }
      if (act === 'play') {
        if (player.playing) { player.stop(); return; }
        if (!player.available) { toast('Audio library is not available.', { type: 'warning' }); return; }
        const s = getSettings();
        if (await player.load(song, tuning(), { loop: false, countIn: s.countIn, metronome: s.metronome, subdivision: s.metronomeSubdivision, smooth: s.smoothVoicing })) player.play();
      }
      if (act === 'duplicate') {
        const copy = createSong({ ...structuredClone(song), id: undefined, title: `${song.title} (copy)`, createdAt: undefined, updatedAt: undefined });
        toast('Song duplicated', { action: { label: 'Open copy', run: () => navigate(`song/${copy.id}`) } });
      }
      if (act === 'delete') {
        if (!(await confirmDialog('Delete song?', `Delete “${song.title}” permanently from this browser?`, { confirmLabel: 'Delete', danger: true }))) return;
        const removed = deleteSong(song.id);
        navigate('songs');
        toast(`Deleted “${removed.title}”`, { type: 'info', action: { label: 'Undo', run: () => { saveSong(removed, { touch: false }); navigate(`song/${removed.id}`); } } });
      }
    }));
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); restore(e.shiftKey ? history.redo(song) : history.undo(song), e.shiftKey ? 'Redone' : 'Undone'); }
      else if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); restore(history.redo(song), 'Redone'); }
    };
    document.addEventListener('keydown', onKey);
    offs.push(subscribe((s, reason) => { if (reason === 'settings') { drawSections(); schedulePreview(); } }));
    let lastW = previewEl.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(previewEl.clientWidth - lastW) > 40) { lastW = previewEl.clientWidth; schedulePreview(); } });
    ro.observe(previewEl);
    onBeforeLeave(() => flush());

    drawAll();
    return () => {
      offs.forEach((o) => o());
      document.removeEventListener('keydown', onKey);
      sortables.forEach((s) => s.destroy());
      ro.disconnect();
      clearTimeout(previewTimer);
      player.stop();
      document.getElementById('chord-editor') && window.bootstrap?.Offcanvas.getInstance(document.getElementById('chord-editor'))?.hide();
    };
  },
};
