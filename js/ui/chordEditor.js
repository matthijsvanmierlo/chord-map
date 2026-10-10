// Chord editing panel (Bootstrap offcanvas): type or tap a chord, set beats,
// pick a voicing, hear it.
import { songPrefs } from '../music/voicingPrefs.js';
import { parseChord, prettyChord, describeChord, SUFFIX_GROUPS } from '../music/chordParser.js';
import { getVoicings } from '../music/voicingEngine.js';
import { chordDiagramSVG } from '../render/chordDiagram.js';
import { diatonicChords, colourChords } from '../music/song.js';
import { chordToRoman, prettyRoman } from '../music/roman.js';
import { prettyAcc, keyPrefersFlats, FLAT_NAMES, SHARP_NAMES } from '../music/theory.js';
import { escapeHtml, icon, on, announce } from './dom.js';
import { player } from '../audio/player.js';
import { mountFretboardPanel } from './fretboardPanel.js';

const SUFFIX_LABEL = { '': 'maj', '69': '6/9' };

/**
 * Open the chord editor.
 * @param {{chord:{symbol:string,beats:number,voicingId:string|null}, song:object, tuning:object, settings:object, title?:string,
 *   onChange:(chord)=>void, onRemove?:()=>void, onClose?:()=>void,
 *   ideas?:()=>{id:string,label:string,explanation:string,chords:[string,number][]}[], onApplyIdea?:(idea)=>void}} opts
 */
export function openChordEditor(opts) {
  const { song, tuning, settings } = opts;
  let chord = { ...opts.chord };
  const flats = keyPrefersFlats(song.key.tonic, song.key.mode);
  const roots = flats ? FLAT_NAMES : SHARP_NAMES;
  let voicingIndex = 0;

  document.getElementById('chord-editor')?.remove();
  const el = document.createElement('div');
  el.className = 'offcanvas offcanvas-end';
  el.id = 'chord-editor';
  el.tabIndex = -1;
  el.style.setProperty('--bs-offcanvas-width', 'min(480px, 100vw)');
  el.setAttribute('aria-labelledby', 'ce-title');
  el.innerHTML = `
    <div class="offcanvas-header border-bottom">
      <h2 class="offcanvas-title h5" id="ce-title">${escapeHtml(opts.title || 'Edit chord')}</h2>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
    <div class="offcanvas-body">
      <div class="row g-2 align-items-end mb-2">
        <div class="col">
          <label class="form-label small fw-semibold mb-1" for="ce-symbol">Chord symbol</label>
          <input id="ce-symbol" class="form-control form-control-lg fw-bold" autocomplete="off" spellcheck="false" aria-describedby="ce-feedback" value="${escapeHtml(chord.symbol)}">
        </div>
        <div class="col-auto">
          <label class="form-label small fw-semibold mb-1" for="ce-beats">Beats</label>
          <div class="input-group input-group-lg" style="width: 9rem">
            <button class="btn btn-outline-secondary" type="button" data-beats="-1" aria-label="Fewer beats">−</button>
            <input id="ce-beats" class="form-control text-center" type="number" min="1" max="32" value="${chord.beats}">
            <button class="btn btn-outline-secondary" type="button" data-beats="1" aria-label="More beats">+</button>
          </div>
        </div>
      </div>
      <div id="ce-feedback" class="small mb-3" aria-live="polite"></div>

      <div class="d-flex align-items-center gap-3 mb-3 surface p-2">
        <div id="ce-diagram" class="flex-shrink-0"></div>
        <div class="flex-grow-1">
          <div class="voicing-carousel mb-2">
            <button class="btn btn-sm btn-outline-secondary" type="button" data-voicing="-1" aria-label="Previous shape">${icon('chevron-left')}</button>
            <span id="ce-vlabel" class="small text-nowrap" aria-live="polite"></span>
            <button class="btn btn-sm btn-outline-secondary" type="button" data-voicing="1" aria-label="Next shape">${icon('chevron-right')}</button>
          </div>
          <div class="form-check small">
            <input class="form-check-input" type="checkbox" id="ce-lock">
            <label class="form-check-label" for="ce-lock">Always use this shape</label>
          </div>
          <button class="btn btn-sm btn-primary mt-2" type="button" data-act="hear">${icon('volume-up')} Hear it</button>
        </div>
      </div>

      <h3 class="h6 mt-3">In the key of ${escapeHtml(prettyAcc(song.key.tonic))} <span class="text-body-secondary small fw-normal">(diatonic)</span></h3>
      <div class="d-flex flex-wrap gap-1 mb-2" id="ce-diatonic"></div>
      <div class="form-check form-switch small mb-2">
        <input class="form-check-input" type="checkbox" role="switch" id="ce-sevenths">
        <label class="form-check-label" for="ce-sevenths">Show seventh chords</label>
      </div>
      <h3 class="h6">Colour chords <span class="text-body-secondary small fw-normal">(secondary dominants, borrowed)</span></h3>
      <div class="d-flex flex-wrap gap-1 mb-3" id="ce-colour"></div>

      ${opts.ideas ? `<details class="mb-3" id="ce-ideas-d">
        <summary class="fw-semibold">${icon('lightbulb')} Reharmonisation ideas</summary>
        <div id="ce-ideas" class="mt-2" aria-live="polite"></div>
      </details>` : ''}
      <details class="mb-3" id="ce-fb-d">
        <summary class="fw-semibold">${icon('distribute-horizontal')} Fretboard &amp; scales</summary>
        <div id="ce-fb" class="mt-2"></div>
      </details>
      <details class="mb-3">
        <summary class="fw-semibold">Build any chord (root + quality)</summary>
        <div class="mt-2" role="group" aria-label="Root">
          ${roots.map((r) => `<button type="button" class="btn btn-sm btn-outline-secondary m-1" data-root="${r}">${prettyAcc(r)}</button>`).join('')}
        </div>
        ${SUFFIX_GROUPS.map((g) => `<div class="mt-2"><div class="small text-body-secondary">${g.name}</div>
          ${g.items.map((s) => `<button type="button" class="btn btn-sm btn-outline-secondary m-1" data-suffix="${escapeHtml(s)}">${escapeHtml(SUFFIX_LABEL[s] ?? s.replace(/b(?=\d)/g, '♭').replace(/#/g, '♯'))}</button>`).join('')}</div>`).join('')}
        <div class="mt-2 small">Slash bass:
          <select class="form-select form-select-sm d-inline-block w-auto" id="ce-bass" aria-label="Bass note">
            <option value="">none</option>${roots.map((r) => `<option value="${r}">${prettyAcc(r)}</option>`).join('')}
          </select>
        </div>
      </details>

      <div class="d-flex gap-2 border-top pt-3">
        ${opts.onRemove ? `<button type="button" class="btn btn-outline-danger" data-act="remove">${icon('trash')} Remove chord</button>` : ''}
        <button type="button" class="btn btn-primary ms-auto" data-bs-dismiss="offcanvas">Done</button>
      </div>
    </div>`;
  document.body.append(el);
  const oc = new window.bootstrap.Offcanvas(el);
  const input = el.querySelector('#ce-symbol');
  const beatsInput = el.querySelector('#ce-beats');

  function emit() { opts.onChange({ ...chord }); }

  function drawPalette() {
    const sev = el.querySelector('#ce-sevenths').checked;
    el.querySelector('#ce-diatonic').innerHTML = diatonicChords(song.key).map((d) => {
      const sym = sev ? d.seventh : d.triad;
      const rn = sev ? d.romanSeventh : d.roman;
      return sym ? `<button type="button" class="btn btn-sm btn-outline-primary palette-btn" data-pick="${escapeHtml(sym)}">${escapeHtml(prettyChord(sym))}<small>${escapeHtml(prettyRoman(rn))}</small></button>` : '';
    }).join('');
    el.querySelector('#ce-colour').innerHTML = colourChords(song.key).map((c) =>
      `<button type="button" class="btn btn-sm btn-outline-secondary palette-btn" data-pick="${escapeHtml(c.symbol)}">${escapeHtml(prettyChord(c.symbol))}<small>${escapeHtml(prettyRoman(c.roman))}</small></button>`).join('')
      + '<button type="button" class="btn btn-sm btn-outline-secondary palette-btn" data-pick="N.C.">N.C.<small>rest</small></button>';
  }

  let fbPanel = null;
  const fbProps = () => ({ symbol: chord.symbol, key: song.key, style: song.style, tuning, capo: song.capo, leftHanded: settings.leftHanded,
    voicing: getVoicings(chord.symbol, tuning, { capo: song.capo, prefs: songPrefs(song) })[voicingIndex] || null });

  function drawIdeas() {
    const host = el.querySelector('#ce-ideas');
    if (!host) return;
    const list = parseChord(chord.symbol) ? opts.ideas() : [];
    host.innerHTML = list.length ? `<ul class="list-unstyled mb-0">${list.map((idea, i) => `
      <li class="border-bottom py-2">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <strong class="me-auto">${escapeHtml(idea.label)}</strong>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-idea-hear="${i}" aria-label="Hear ${escapeHtml(idea.label)}">${icon('volume-up')}</button>
          <button type="button" class="btn btn-sm btn-outline-primary" data-idea-apply="${i}">Apply</button>
        </div>
        <div class="small text-body-secondary">${escapeHtml(idea.explanation)}</div>
      </li>`).join('')}</ul>` : '<p class="small text-body-secondary mb-0">No ideas for this chord here — try one that leads somewhere (e.g. a V7 before its I).</p>';
    host._ideas = list;
  }

  function drawPreview() {
    const c = parseChord(chord.symbol);
    drawIdeas();
    if (fbPanel) fbPanel.update(fbProps());
    const fb = el.querySelector('#ce-feedback');
    const diag = el.querySelector('#ce-diagram');
    const lock = el.querySelector('#ce-lock');
    input.classList.toggle('is-invalid', !c);
    if (!c) {
      fb.innerHTML = `<span class="text-danger">${icon('exclamation-circle')} Not a chord symbol I recognise. Try e.g. <code>Am7</code>, <code>F#m7b5</code>, <code>Bbmaj9</code>, <code>D/F#</code>, <code>G7#9</code>.</span>`;
      diag.innerHTML = '';
      el.querySelector('#ce-vlabel').textContent = '';
      return;
    }
    if (c.nc) {
      fb.textContent = 'No chord — silence for these beats.';
      diag.innerHTML = '';
      el.querySelector('#ce-vlabel').textContent = '';
      return;
    }
    fb.innerHTML = `<strong>${escapeHtml(describeChord(chord.symbol))}</strong> · ${escapeHtml(prettyRoman(chordToRoman(chord.symbol, song.key.tonic)))} in ${escapeHtml(prettyAcc(song.key.tonic))} · notes ${c.tones.map((t) => `<span class="${t.optional ? 'text-body-secondary' : ''}">${escapeHtml(prettyAcc(t.name))}</span>`).join(' ')}`;
    const list = getVoicings(chord.symbol, tuning, { capo: song.capo, prefs: songPrefs(song) });
    if (chord.voicingId) {
      const i = list.findIndex((v) => v.id === chord.voicingId);
      if (i >= 0) voicingIndex = i;
    }
    voicingIndex = Math.max(0, Math.min(voicingIndex, list.length - 1));
    const v = list[voicingIndex] || null;
    diag.innerHTML = chordDiagramSVG(chord.symbol, v, tuning, { width: 150, leftHanded: settings.leftHanded, capo: song.capo });
    el.querySelector('#ce-vlabel').textContent = list.length ? `Shape ${voicingIndex + 1} of ${list.length}` : 'No playable shape';
    lock.checked = !!chord.voicingId;
  }

  function setSymbol(sym, { fromInput = false } = {}) {
    chord.symbol = sym;
    chord.voicingId = null;
    voicingIndex = 0;
    if (!fromInput) input.value = sym;
    drawPreview();
    if (parseChord(sym)) emit();
  }

  const offs = [];
  offs.push(on(el, 'input', '#ce-symbol', () => {
    const p = parseChord(input.value);
    setSymbol(p ? p.symbol : input.value.trim(), { fromInput: true });
  }));
  offs.push(on(el, 'change', '#ce-beats', () => {
    chord.beats = Math.max(1, Math.min(32, Number(beatsInput.value) || 1));
    beatsInput.value = chord.beats;
    emit();
  }));
  offs.push(on(el, 'click', '[data-beats]', (e, t) => {
    chord.beats = Math.max(1, Math.min(32, chord.beats + Number(t.dataset.beats)));
    beatsInput.value = chord.beats;
    announce(`${chord.beats} beats`);
    emit();
  }));
  offs.push(on(el, 'click', '[data-pick]', (e, t) => {
    setSymbol(t.dataset.pick);
    player.previewChord(chord.symbol, tuning, { capo: song.capo, prefs: songPrefs(song) });
    announce(`${describeChord(chord.symbol)} selected`);
  }));
  offs.push(on(el, 'click', '[data-root]', (e, t) => {
    const c = parseChord(chord.symbol);
    setSymbol(t.dataset.root + (c && !c.nc ? c.suffix : '') + (c?.bass ? '/' + c.bass : ''));
  }));
  offs.push(on(el, 'click', '[data-suffix]', (e, t) => {
    const c = parseChord(chord.symbol);
    const root = c && !c.nc ? c.root : song.key.tonic;
    setSymbol(root + t.dataset.suffix + (c?.bass ? '/' + c.bass : ''));
  }));
  offs.push(on(el, 'change', '#ce-bass', (e) => {
    const c = parseChord(chord.symbol);
    if (!c || c.nc) return;
    const b = e.target.value;
    setSymbol(c.root + c.suffix + (b && b !== c.root ? '/' + b : ''));
  }));
  offs.push(on(el, 'click', '[data-voicing]', (e, t) => {
    const list = getVoicings(chord.symbol, tuning, { capo: song.capo, prefs: songPrefs(song) });
    if (!list.length) return;
    voicingIndex = (voicingIndex + Number(t.dataset.voicing) + list.length) % list.length;
    chord.voicingId = list[voicingIndex].id; // browsing a shape locks it
    drawPreview();
    emit();
    player.previewChord(chord.symbol, tuning, { capo: song.capo, voicingId: chord.voicingId, prefs: songPrefs(song) });
  }));
  offs.push(on(el, 'change', '#ce-lock', (e) => {
    const list = getVoicings(chord.symbol, tuning, { capo: song.capo, prefs: songPrefs(song) });
    chord.voicingId = e.target.checked && list[voicingIndex] ? list[voicingIndex].id : null;
    emit();
  }));
  offs.push(on(el, 'change', '#ce-sevenths', drawPalette));
  offs.push(on(el, 'click', '[data-act]', (e, t) => {
    if (t.dataset.act === 'hear') player.previewChord(chord.symbol, tuning, { capo: song.capo, voicingId: chord.voicingId, prefs: songPrefs(song) });
    if (t.dataset.act === 'remove') { opts.onRemove(); oc.hide(); }
  }));
  el.addEventListener('shown.bs.offcanvas', () => { input.focus(); input.select(); });
  offs.push(on(el, 'click', '[data-idea-hear]', (e, t) => {
    const idea = el.querySelector('#ce-ideas')._ideas[Number(t.dataset.ideaHear)];
    idea.chords.forEach(([sym], k) => setTimeout(() => player.previewChord(sym, tuning, { capo: song.capo, prefs: songPrefs(song) }), k * 750));
  }));
  offs.push(on(el, 'click', '[data-idea-apply]', (e, t) => {
    const idea = el.querySelector('#ce-ideas')._ideas[Number(t.dataset.ideaApply)];
    opts.onApplyIdea(idea);
    announce(`Applied: ${idea.label}`);
    oc.hide();
  }));
  el.querySelector('#ce-fb-d').addEventListener('toggle', (e) => {
    if (e.target.open && !fbPanel) fbPanel = mountFretboardPanel(el.querySelector('#ce-fb'), fbProps());
  });
  el.addEventListener('hidden.bs.offcanvas', () => {
    fbPanel?.destroy();
    offs.forEach((o) => o());
    el.remove();
    opts.onClose?.();
  });
  drawPalette();
  drawPreview();
  oc.show();
  return { close: () => oc.hide() };
}
