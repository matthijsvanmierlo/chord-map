// Interactive fretboard / scale map panel: chord tones + a suggested scale
// across the neck, with note/interval labels and a text alternative.
import { parseChord, prettyChord } from '../music/chordParser.js';
import { scalesForChord, scaleOn, SCALES } from '../music/scales.js';
import { fretboardSVG, positionsText } from '../render/fretboard.js';
import { escapeHtml, on } from './dom.js';

let uid = 0;

/**
 * Mount a panel. Returns { update(props), destroy() }.
 * props: { symbol, key, style, tuning, capo, leftHanded, voicing }
 */
export function mountFretboardPanel(container, initial) {
  const id = `fbp${++uid}`;
  let props = { ...initial };
  let scaleId = 'auto';
  let labels = 'notes';
  let range = 'low';

  container.innerHTML = `
    <div class="fretboard-panel">
      <div class="d-flex flex-wrap gap-2 align-items-end mb-2">
        <div><label class="form-label small mb-0" for="${id}-scale">Scale over the chord</label>
          <select class="form-select form-select-sm" id="${id}-scale"></select></div>
        <div><label class="form-label small mb-0" for="${id}-labels">Labels</label>
          <select class="form-select form-select-sm" id="${id}-labels"><option value="notes">Note names</option><option value="intervals">Intervals</option></select></div>
        <div><label class="form-label small mb-0" for="${id}-range">Frets</label>
          <select class="form-select form-select-sm" id="${id}-range"><option value="low">0–12</option><option value="high">5–17</option><option value="all">0–15</option></select></div>
        <div class="form-check form-switch mb-1 ms-1"><input class="form-check-input" type="checkbox" role="switch" id="${id}-text"><label class="form-check-label small" for="${id}-text">Show as text</label></div>
      </div>
      <p class="small mb-1" id="${id}-why" aria-live="polite"></p>
      <div class="fb-legend mb-1" aria-hidden="true">
        <span><span class="fb-swatch root"></span>Root</span><span><span class="fb-swatch chord"></span>Chord tone</span>
        <span><span class="fb-swatch scale"></span>Scale note</span><span><span class="fb-swatch shape"></span>In the current shape</span>
      </div>
      <div class="fretboard-wrap" id="${id}-board"></div>
      <ul class="small mt-2 d-none" id="${id}-list"></ul>
    </div>`;
  const $ = (s) => container.querySelector(s);

  function draw() {
    const c = parseChord(props.symbol || '');
    const board = $(`#${id}-board`);
    if (!c || c.nc) {
      board.innerHTML = '<p class="small text-body-secondary mb-0">Pick a chord to see it on the fretboard.</p>';
      $(`#${id}-why`).textContent = '';
      $(`#${id}-list`).innerHTML = '';
      return;
    }
    const suggestions = scalesForChord(c.symbol, props.key, props.style);
    const sel = $(`#${id}-scale`);
    sel.innerHTML = `<option value="none">Chord tones only</option>
      <optgroup label="Suggested">${suggestions.map((s, i) => `<option value="${s.id}" ${i === 0 && scaleId === 'auto' ? 'selected' : ''}>${escapeHtml(s.title)}</option>`).join('')}</optgroup>
      <optgroup label="All scales">${Object.entries(SCALES).filter(([k]) => !suggestions.some((s) => s.id === k)).map(([k, s]) => `<option value="${k}">${escapeHtml(s.name)}</option>`).join('')}</optgroup>`;
    if (scaleId !== 'auto') sel.value = scaleId;
    const chosen = sel.value === 'none' ? null : scaleOn(c.root, sel.value);
    const info = suggestions.find((s) => s.id === sel.value);
    $(`#${id}-why`).innerHTML = chosen
      ? `<strong>${escapeHtml(prettyChord(c.symbol))}</strong> → <strong>${escapeHtml(chosen.title)}</strong>${info ? `: ${escapeHtml(info.why)}` : ''} <span class="text-body-secondary">(${chosen.notes.map(escapeHtml).join(' ')})</span>`
      : `<strong>${escapeHtml(prettyChord(c.symbol))}</strong>: ${c.tones.map((t) => escapeHtml(t.name)).join(' ')}`;

    const names = new Map(), ivl = new Map();
    if (chosen) chosen.pcs.forEach((pc, i) => { names.set(pc, chosen.notes[i]); ivl.set(pc, chosen.labels[i].replace('♭', 'b').replace('♯', '#')); });
    c.tones.forEach((t) => { names.set(t.pc, t.name); ivl.set(t.pc, t.deg === '1' ? 'R' : t.deg); });
    const maxF = Math.min(props.tuning.frets || 15, 24);
    const [from, to] = range === 'high' ? [Math.min(5, maxF - 5), Math.min(17, maxF)] : range === 'all' ? [0, Math.min(15, maxF)] : [0, Math.min(12, maxF)];
    const { svg, positions } = fretboardSVG({
      tuning: props.tuning, capo: props.capo || 0, fromFret: from, toFret: to, leftHanded: props.leftHanded,
      chordPcs: c.pcs, rootPc: c.rootPc, scalePcs: chosen ? chosen.pcs : [], names,
      labels: new Map([...ivl].map(([k, v]) => [k, v.replace(/b(?=\d)/, '♭').replace(/#(?=\d)/, '♯')])),
      showIntervals: labels === 'intervals', voicing: props.voicing,
      title: `${prettyChord(c.symbol)} on the fretboard`,
    });
    board.innerHTML = svg;
    const svgEl = board.querySelector('svg');
    svgEl.setAttribute('aria-label', `${prettyChord(c.symbol)} on the fretboard${chosen ? ` with ${chosen.title}` : ''}, frets ${from} to ${to}: ${positions.length} positions. Turn on “Show as text” for the full list.`);
    $(`#${id}-list`).innerHTML = positionsText(positions).map((l) => `<li>${escapeHtml(l)}</li>`).join('');
  }

  const offs = [
    on(container, 'change', `#${id}-scale`, (e) => { scaleId = e.target.value; draw(); }),
    on(container, 'change', `#${id}-labels`, (e) => { labels = e.target.value; draw(); }),
    on(container, 'change', `#${id}-range`, (e) => { range = e.target.value; draw(); }),
    on(container, 'change', `#${id}-text`, (e) => $(`#${id}-list`).classList.toggle('d-none', !e.target.checked)),
  ];
  draw();
  return {
    update(next) {
      const chordChanged = next.symbol && next.symbol !== props.symbol;
      props = { ...props, ...next };
      if (chordChanged) scaleId = 'auto';
      draw();
    },
    destroy() { offs.forEach((o) => o()); container.innerHTML = ''; },
  };
}

