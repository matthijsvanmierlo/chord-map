// Custom strum-pattern editor dialog: a keyboard-operable step grid.
import { PATTERN_TOKENS, TOKEN_NAMES, patternLabel } from '../data/strumPatterns.js';
import { sanitizePattern, newSong, newSection, newBar } from '../state/schema.js';
import { escapeHtml, icon, announce } from './dom.js';
import { dialog } from './feedback.js';
import { player } from '../audio/player.js';
import { getTuning } from '../music/tunings.js';

const METERS = [['4/4', [4, 4]], ['3/4', [3, 4]], ['2/4', [2, 4]], ['6/8', [6, 8]], ['12/8', [12, 8]], ['Any meter (repeats per beat)', null]];
const SYMBOL = { '.': '·', D: '↓', U: '↑', d: '✕', B: 'B', b: 'b', 1: '1', 2: '2', 3: '3', 4: '4' };

function stepLabel(i, perBeat, token) {
  const beat = Math.floor(i / perBeat) + 1;
  const sub = i % perBeat;
  const names = perBeat === 4 ? ['', 'e', 'and', 'a'] : perBeat === 3 ? ['', 'trip', 'let'] : ['', 'and'];
  const where = sub === 0 ? `beat ${beat}` : `beat ${beat} ${names[sub]}`;
  return `Step ${i + 1} (${where}): ${TOKEN_NAMES[token]}`;
}

/**
 * Open the editor. Resolves with a sanitised pattern object, or null if cancelled.
 * @param {object|null} existing pattern to edit
 * @param {{instrumentId:string}} ctx
 */
export function editPattern(existing, { instrumentId = 'guitar-standard' } = {}) {
  let meter = existing ? existing.meter : [4, 4];
  let perBeat = existing?.perBeat || 2;
  let tokens = existing ? existing.slots.split(/\s+/) : 'D . D U . U D U'.split(' ');
  let swing = !!existing?.swing;
  const stepsFor = () => (meter ? meter[0] : 1) * perBeat;
  const fit = () => {
    const n = stepsFor();
    tokens = Array.from({ length: n }, (_, i) => tokens[i] ?? '.');
  };
  fit();

  const gridHTML = () => `
    <div class="pattern-grid" role="toolbar" aria-label="Pattern steps. Use arrow keys to move; press D, U, X, B, Shift+B, 1–4 or period to set a step, Space to cycle." style="--steps:${tokens.length}">
      ${tokens.map((t, i) => `<button type="button" class="pattern-step ${i % perBeat === 0 ? 'on-beat' : ''}" data-step="${i}" tabindex="${i === 0 ? 0 : -1}" aria-label="${escapeHtml(stepLabel(i, perBeat, t))}">${SYMBOL[t]}</button>`).join('')}
    </div>
    <p class="small text-body-secondary mt-2 mb-0" id="pe-legend">↓ down · ↑ up · ✕ muted chop · B bass · b alternate bass · 1–4 single string (1 = highest) · · rest</p>`;

  return dialog({
    title: existing ? `Edit pattern “${existing.name}”` : 'New strum pattern',
    size: 'modal-lg',
    body: `
      <div class="row g-2 mb-3">
        <div class="col-sm-5"><label class="form-label small" for="pe-name">Name</label>
          <input id="pe-name" class="form-control" maxlength="60" value="${escapeHtml(existing?.name || 'My pattern')}"></div>
        <div class="col-6 col-sm-3"><label class="form-label small" for="pe-meter">Meter</label>
          <select id="pe-meter" class="form-select">${METERS.map(([l, m], i) => `<option value="${i}" ${JSON.stringify(m) === JSON.stringify(meter) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="col-6 col-sm-2"><label class="form-label small" for="pe-per">Steps per beat</label>
          <select id="pe-per" class="form-select">${[1, 2, 3, 4].map((n) => `<option ${n === perBeat ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="col-sm-2 d-flex align-items-end"><div class="form-check form-switch mb-2">
          <input class="form-check-input" type="checkbox" role="switch" id="pe-swing" ${swing ? 'checked' : ''}><label class="form-check-label small" for="pe-swing">Swing</label></div></div>
      </div>
      <div id="pe-grid"></div>
      <div class="d-flex flex-wrap gap-2 align-items-center mt-3">
        <button type="button" class="btn btn-sm btn-outline-primary" id="pe-play">${icon('play-fill')} Preview on G</button>
        <span class="small font-monospace" id="pe-preview" aria-live="polite"></span>
      </div>`,
    buttons: [{ label: 'Cancel', value: null }, { label: 'Save pattern', value: 'save', variant: 'primary' }],
    onShown: (el) => {
      const grid = el.querySelector('#pe-grid');
      let focusIdx = 0;
      const draw = (focus = false) => {
        grid.innerHTML = gridHTML();
        el.querySelector('#pe-preview').textContent = patternLabel({ slots: tokens.join(' ') });
        grid.querySelectorAll('.pattern-step').forEach((b) => { b.tabIndex = Number(b.dataset.step) === focusIdx ? 0 : -1; });
        if (focus) grid.querySelector(`[data-step="${focusIdx}"]`)?.focus();
      };
      const setTok = (i, t) => {
        tokens[i] = t;
        draw(true);
        announce(stepLabel(i, perBeat, t));
      };
      grid.addEventListener('click', (e) => {
        const b = e.target.closest('[data-step]');
        if (!b) return;
        focusIdx = Number(b.dataset.step);
        setTok(focusIdx, PATTERN_TOKENS[(PATTERN_TOKENS.indexOf(tokens[focusIdx]) + 1) % PATTERN_TOKENS.length]);
      });
      grid.addEventListener('keydown', (e) => {
        const b = e.target.closest('[data-step]');
        if (!b) return;
        const i = Number(b.dataset.step);
        const map = { d: 'D', u: 'U', x: 'd', '.': '.', 1: '1', 2: '2', 3: '3', 4: '4', Delete: '.', Backspace: '.' };
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          focusIdx = (i + (e.key === 'ArrowRight' ? 1 : -1) + tokens.length) % tokens.length;
          draw(true);
        } else if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          focusIdx = e.key === 'Home' ? 0 : tokens.length - 1;
          draw(true);
        } else if (e.key.toLowerCase() === 'b') {
          e.preventDefault(); focusIdx = i; setTok(i, e.shiftKey ? 'b' : 'B');
        } else if (map[e.key.toLowerCase()] !== undefined || map[e.key] !== undefined) {
          e.preventDefault(); focusIdx = i; setTok(i, map[e.key.toLowerCase()] ?? map[e.key]);
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault(); focusIdx = i; setTok(i, PATTERN_TOKENS[(PATTERN_TOKENS.indexOf(tokens[i]) + 1) % PATTERN_TOKENS.length]);
        }
      });
      el.querySelector('#pe-meter').addEventListener('change', (e) => { meter = METERS[Number(e.target.value)][1]; fit(); focusIdx = 0; draw(); });
      el.querySelector('#pe-per').addEventListener('change', (e) => {
        const old = perBeat; perBeat = Number(e.target.value);
        // keep on-beat steps when changing resolution
        const beats = meter ? meter[0] : 1;
        tokens = Array.from({ length: beats * perBeat }, (_, i) => (i % perBeat === 0 ? tokens[(i / perBeat) * old] ?? '.' : '.'));
        focusIdx = 0; draw();
      });
      el.querySelector('#pe-swing').addEventListener('change', (e) => { swing = e.target.checked; });
      el.querySelector('#pe-play').addEventListener('click', async () => {
        if (player.playing) { player.stop(); return; }
        const ts = meter || [4, 4];
        const song = newSong({ title: 'Preview', tempo: 90, timeSignature: ts, swing,
          sections: [newSection('P', [newBar([{ symbol: 'G', beats: ts[0], voicingId: null }]), newBar([{ symbol: 'C', beats: ts[0], voicingId: null }])])] });
        const pattern = sanitizePattern({ slots: tokens.join(' '), perBeat, meter, swing, name: 'preview' });
        if (await player.load(song, getTuning(instrumentId), { loop: false, countIn: false, metronome: true, band: false, pattern })) player.play();
      });
      el.addEventListener('hidden.bs.modal', () => player.stop());
      draw();
      el.querySelector('#pe-name').focus();
    },
    collect: (el) => {
      player.stop();
      const p = sanitizePattern({ id: existing?.id, name: el.querySelector('#pe-name').value, meter, perBeat, slots: tokens.join(' '), swing });
      if (!p || tokens.every((t) => t === '.')) { announce('Add at least one strum or note'); return false; }
      return p;
    },
  });
}
