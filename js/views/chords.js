// Chord dictionary: any root + quality → all shapes for the current tuning.
import { getState, getSettings, subscribe, saveSong } from '../state/store.js';
import { parseChord, describeChord, prettyChord, SUFFIX_GROUPS } from '../music/chordParser.js';
import { chordDiagramSVG } from '../render/chordDiagram.js';
import { player } from '../audio/player.js';
import { escapeHtml, icon, on, debounce, announce } from '../ui/dom.js';
import { setQuery } from '../router.js';
import { toast, dialog } from '../ui/feedback.js';
import { newBar } from '../state/schema.js';
import { ROOT_CHOICES, prettyAcc } from '../music/theory.js';
import { currentTuning } from './shared.js';
import { getVoicingsInfo } from '../music/voicingEngine.js';
import { STYLE_LABELS } from '../music/voicingPrefs.js';
import { defaultVoicingPrefs } from '../state/schema.js';
import { mountFretboardPanel } from '../ui/fretboardPanel.js';

const SUFFIX_NAMES = { '': 'major', m: 'minor', '69': '6/9' };

export default {
  title: () => 'Chord dictionary',
  render(el, { query }) {
    let symbol = parseChord(query.c || '')?.symbol || 'C';
    let capo = 0;
    let filter = 'mine'; // all | mine | <style>
    let tab = query.tab === 'fretboard' ? 'fretboard' : 'shapes';
    let panel = null;

    el.innerHTML = `
      <h1 class="page-title mb-1">Chord dictionary</h1>
      <p class="lead-soft">Every shape for any chord on your instrument (${escapeHtml(currentTuning().name)}). Click a diagram to hear it.</p>
      <div class="surface p-3 mb-3">
        <div class="row g-2 align-items-end">
          <div class="col-sm-5 col-md-4">
            <label class="form-label small mb-1" for="c-sym">Type a chord</label>
            <input id="c-sym" class="form-control form-control-lg fw-bold" value="${escapeHtml(symbol)}" autocomplete="off" spellcheck="false" aria-describedby="c-desc">
          </div>
          <div class="col-6 col-sm-3 col-md-2">
            <label class="form-label small mb-1" for="c-capo">Capo</label>
            <select id="c-capo" class="form-select">${Array.from({ length: 10 }, (_, i) => `<option value="${i}">${i || 'None'}</option>`).join('')}</select>
          </div>
          <div class="col-6 col-sm-4 col-md-3">
            <label class="form-label small mb-1" for="c-filter">Show</label>
            <select id="c-filter" class="form-select">
              <option value="mine">My shape preferences</option>
              <option value="all">All shapes</option>
              ${Object.entries(STYLE_LABELS).filter(([k]) => k !== 'any').map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}
            </select>
          </div>
          <div class="col-12 col-md"><p id="c-desc" class="mb-2" aria-live="polite"></p></div>
        </div>
        <div class="mt-3" role="group" aria-label="Root">
          ${ROOT_CHOICES.map((r) => `<button type="button" class="btn btn-sm btn-outline-secondary m-1" data-root="${r}">${prettyAcc(r)}</button>`).join('')}
        </div>
        <div class="mt-2">
          ${SUFFIX_GROUPS.map((g) => `<div class="d-inline-block me-3 mt-1"><span class="small text-body-secondary me-1">${g.name}:</span>${g.items.map((s) => `<button type="button" class="btn btn-sm btn-outline-secondary m-1" data-suffix="${escapeHtml(s)}" title="${escapeHtml(SUFFIX_NAMES[s] || s)}">${escapeHtml((s === '' ? 'maj' : s === '69' ? '6/9' : s).replace(/b(?=\d)/g, '♭').replace(/#/g, '♯'))}</button>`).join('')}</div>`).join('')}
        </div>
      </div>
      <ul class="nav nav-tabs mb-3" role="tablist">
        <li class="nav-item" role="presentation"><button class="nav-link ${tab === 'shapes' ? 'active' : ''}" id="tab-shapes" data-tab="shapes" type="button" role="tab" aria-controls="pane-shapes" aria-selected="${tab === 'shapes'}">${icon('grid-3x3')} Shapes</button></li>
        <li class="nav-item" role="presentation"><button class="nav-link ${tab === 'fretboard' ? 'active' : ''}" id="tab-fretboard" data-tab="fretboard" type="button" role="tab" aria-controls="pane-fretboard" aria-selected="${tab === 'fretboard'}">${icon('distribute-horizontal')} Fretboard &amp; scales</button></li>
      </ul>
      <div id="pane-shapes" role="tabpanel" aria-labelledby="tab-shapes" ${tab === 'shapes' ? '' : 'hidden'}>
        <p class="small text-warning-emphasis d-none" id="c-relaxed">${icon('info-circle')} No shapes match that filter for this chord — showing all shapes instead.</p>
        <div class="voicing-grid" id="grid" aria-live="polite"></div>
      </div>
      <div id="pane-fretboard" role="tabpanel" aria-labelledby="tab-fretboard" ${tab === 'fretboard' ? '' : 'hidden'}>
        <div class="surface p-3" id="fb-host"></div>
      </div>`;

    const $ = (s) => el.querySelector(s);

    function draw() {
      const c = parseChord(symbol);
      const grid = $('#grid');
      const tuning = currentTuning();
      el.querySelector('.lead-soft').innerHTML = `Every shape for any chord on your instrument (${escapeHtml(tuning.name)}). Click a diagram to hear it.`;
      $('#c-sym').classList.toggle('is-invalid', !c);
      if (!c || c.nc) {
        $('#c-desc').innerHTML = `<span class="text-danger">Unrecognised chord. Try <code>Am7</code>, <code>F#m7b5</code>, <code>D/F#</code>.</span>`;
        grid.innerHTML = '';
        return;
      }
      $('#c-desc').innerHTML = `<strong>${escapeHtml(describeChord(symbol))}</strong> — ${c.tones.map((t) => `${escapeHtml(prettyAcc(t.name))} <span class="small text-body-secondary">(${escapeHtml(t.deg.replace('b', '♭').replace('#', '♯'))})</span>`).join(', ')}`;
      const prefs = filter === 'mine' ? undefined : filter === 'all' ? null : { ...defaultVoicingPrefs(), style: filter };
      const { list, relaxed } = getVoicingsInfo(symbol, tuning, { capo, limit: 36, prefs });
      $('#c-relaxed').classList.toggle('d-none', !relaxed);
      const fbProps = { symbol, key: null, style: '', tuning, capo, leftHanded: getSettings().leftHanded, voicing: list[0] || null };
      if (tab === 'fretboard') {
        if (!panel) panel = mountFretboardPanel($('#fb-host'), fbProps);
        else panel.update(fbProps);
      }
      grid.innerHTML = list.length ? list.map((v, i) => `
        <div class="text-center">
          <button type="button" class="diagram-button w-100" data-v="${escapeHtml(v.id)}" title="Play shape ${i + 1}">${chordDiagramSVG(symbol, v, tuning, { width: 120, leftHanded: getSettings().leftHanded, capo })}</button>
          <div class="small text-body-secondary">${v.curated ? 'Common shape' : `Fret ${v.baseFret}`}</div>
          <button type="button" class="btn btn-sm btn-link" data-add="${escapeHtml(v.id)}">${icon('plus')} Add to song</button>
        </div>`).join('') : '<p>No playable shape found for this tuning.</p>';
      announce(`${list.length} shapes for ${describeChord(symbol)}`);
    }

    function set(sym) {
      symbol = sym;
      $('#c-sym').value = sym;
      setQuery({ c: sym, tab: tab === 'fretboard' ? 'fretboard' : '' });
      draw();
    }

    const offs = [];
    offs.push(on(el, 'input', '#c-sym', debounce((e) => {
      const c = parseChord(e.target.value);
      symbol = c ? c.symbol : e.target.value;
      if (c) setQuery({ c: symbol });
      draw();
    }, 200)));
    offs.push(on(el, 'change', '#c-capo', (e) => { capo = Number(e.target.value); draw(); }));
    offs.push(on(el, 'change', '#c-filter', (e) => { filter = e.target.value; draw(); }));
    offs.push(on(el, 'click', '[data-tab]', (e, t) => {
      tab = t.dataset.tab;
      el.querySelectorAll('[data-tab]').forEach((b) => { const on2 = b.dataset.tab === tab; b.classList.toggle('active', on2); b.setAttribute('aria-selected', String(on2)); });
      $('#pane-shapes').hidden = tab !== 'shapes';
      $('#pane-fretboard').hidden = tab !== 'fretboard';
      setQuery({ c: symbol, tab: tab === 'fretboard' ? 'fretboard' : '' });
      draw();
    }));
    offs.push(on(el, 'keydown', '[role="tab"]', (e, t) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tabs = [...el.querySelectorAll('[role="tab"]')];
      const next = tabs[(tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      next.focus(); next.click();
    }));
    offs.push(on(el, 'click', '[data-root]', (e, t) => { const c = parseChord(symbol); set(t.dataset.root + (c && !c.nc ? c.suffix : '')); }));
    offs.push(on(el, 'click', '[data-suffix]', (e, t) => { const c = parseChord(symbol); set((c && !c.nc ? c.root : 'C') + t.dataset.suffix); }));
    offs.push(on(el, 'click', '[data-v]', (e, t) => player.previewChord(symbol, currentTuning(), { capo, voicingId: t.dataset.v })));
    offs.push(on(el, 'click', '[data-add]', async (e, t) => {
      const songs = getState().songs;
      if (!songs.length) { toast('Create a song first (My Songs → New song).', { type: 'info' }); return; }
      const id = await dialog({
        title: `Add ${prettyChord(symbol)} to a song`,
        body: `<label class="form-label" for="pick-song">Song</label><select id="pick-song" class="form-select">${songs.map((s) => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join('')}</select>
          <p class="small text-body-secondary mt-2 mb-0">It's added as a new bar at the end of the last section${capo ? '' : ', locked to this shape'}.</p>`,
        buttons: [{ label: 'Cancel', value: null }, { label: 'Add', value: 'ok', variant: 'primary' }],
        collect: (d) => d.querySelector('#pick-song').value,
      });
      if (!id) return;
      const song = structuredClone(songs.find((s) => s.id === id));
      const sec = song.sections[song.sections.length - 1];
      sec.bars.push(newBar([{ symbol, beats: song.timeSignature[0], voicingId: song.instrumentId === getSettings().instrumentId && !capo ? t.dataset.add : null }]));
      saveSong(song);
      toast(`Added ${prettyChord(symbol)} to “${song.title}”`);
    }));
    offs.push(subscribe((s, reason) => { if (reason === 'settings') draw(); }));
    draw();
    return () => { offs.forEach((o) => o()); panel?.destroy(); };
  },
};
