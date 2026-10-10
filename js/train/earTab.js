// Train → Ear training: chord qualities, diatonic progressions, cadences.
import { getSettings, logPractice } from '../state/store.js';
import { getTuning } from '../music/tunings.js';
import { romanToChord, prettyRoman } from '../music/roman.js';
import { newSong, newSection, newBar } from '../state/schema.js';
import { player } from '../audio/player.js';
import { escapeHtml, icon, on, announce } from '../ui/dom.js';

const QUALITIES = [
  { id: '', name: 'Major' }, { id: 'm', name: 'Minor' }, { id: '7', name: 'Dominant 7' }, { id: 'maj7', name: 'Major 7' },
  { id: 'm7', name: 'Minor 7' }, { id: 'dim', name: 'Diminished' }, { id: 'aug', name: 'Augmented' }, { id: 'sus4', name: 'Sus4' },
];
const LEVELS = {
  easy: { name: 'I · IV · V', set: ['I', 'IV', 'V'] },
  pop: { name: 'I · IV · V · vi', set: ['I', 'IV', 'V', 'vi'] },
  full: { name: 'I · ii · iii · IV · V · vi', set: ['I', 'ii', 'iii', 'IV', 'V', 'vi'] },
};
const CADENCES = [
  { id: 'authentic', name: 'Authentic (V → I)', romans: ['V7', 'I'], why: 'The strongest ending: the dominant resolves home.' },
  { id: 'plagal', name: 'Plagal (IV → I)', romans: ['IV', 'I'], why: 'The soft “Amen” ending.' },
  { id: 'deceptive', name: 'Deceptive (V → vi)', romans: ['V7', 'vi'], why: 'Sets up home, then side-steps to the relative minor.' },
  { id: 'half', name: 'Half (→ V)', romans: ['ii', 'V'], why: 'Stops on the dominant — sounds like a question.' },
];
const KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb'];
const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'B', 'Eb', 'F#', 'Ab', 'C#'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function songOf(key, romans, tempo = 84) {
  return newSong({
    key: { tonic: key, mode: 'major' }, tempo, strumPatternId: 'whole', groove: 'none',
    sections: [newSection('Q', romans.map((r) => newBar([{ symbol: romanToChord(r, key), beats: 4, voicingId: null }])))],
  });
}

export function mountEar(host) {
  const tuning = getTuning(getSettings().instrumentId);
  let mode = 'quality';
  let enabled = new Set(['', 'm', '7', 'maj7', 'm7']);
  let level = 'pop';
  let q = null;
  let answered = false;
  const score = { quality: [0, 0], progression: [0, 0], cadence: [0, 0] };
  let streak = 0;
  const started = performance.now();

  host.innerHTML = `
    <div class="surface p-3 mb-3">
      <div class="d-flex flex-wrap gap-3 align-items-end">
        <div><label class="form-label small mb-0" for="ear-mode">Exercise</label>
          <select id="ear-mode" class="form-select"><option value="quality">Chord quality</option><option value="progression">Progressions</option><option value="cadence">Cadences</option></select></div>
        <div id="ear-opts"></div>
        <div class="ms-auto text-end small" id="ear-score" aria-live="polite"></div>
      </div>
    </div>
    <div class="surface p-3 text-center">
      <p class="lead mb-2" id="ear-prompt"></p>
      <div class="d-flex justify-content-center gap-2 mb-3">
        <button class="btn btn-primary btn-lg" type="button" data-act="play">${icon('volume-up-fill')} <span>Play</span></button>
        <button class="btn btn-outline-primary btn-lg" type="button" data-act="next">${icon('arrow-right')} Next question</button>
      </div>
      <div id="ear-answers" class="d-flex flex-wrap justify-content-center gap-2"></div>
      <div id="ear-feedback" class="mt-3 fs-5" aria-live="assertive"></div>
    </div>`;
  const $ = (s) => host.querySelector(s);

  function drawOpts() {
    $('#ear-opts').innerHTML = mode === 'quality'
      ? `<fieldset class="d-flex flex-wrap gap-2"><legend class="form-label small mb-0 w-100">Include</legend>${QUALITIES.map((x) => `<div class="form-check form-check-inline mb-0"><input class="form-check-input" type="checkbox" id="eq-${x.id || 'maj'}" data-q="${x.id}" ${enabled.has(x.id) ? 'checked' : ''}><label class="form-check-label small" for="eq-${x.id || 'maj'}">${x.name}</label></div>`).join('')}</fieldset>`
      : mode === 'progression'
        ? `<label class="form-label small mb-0" for="ear-level">Chords used</label><select id="ear-level" class="form-select">${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}" ${k === level ? 'selected' : ''}>${l.name}</option>`).join('')}</select>`
        : '';
  }

  function drawScore() {
    const [c, t] = score[mode];
    $('#ear-score').innerHTML = `<strong>${c}/${t}</strong> correct${t ? ` (${Math.round((100 * c) / t)}%)` : ''} · streak ${streak}`;
  }

  function newQuestion(autoplay = true) {
    answered = false;
    $('#ear-feedback').textContent = '';
    if (mode === 'quality') {
      const pool = QUALITIES.filter((x) => enabled.has(x.id));
      const quality = pick(pool.length >= 2 ? pool : QUALITIES.slice(0, 2));
      q = { kind: 'quality', symbol: pick(ROOTS) + quality.id, answer: quality.id };
      $('#ear-prompt').textContent = 'What kind of chord is this?';
      $('#ear-answers').innerHTML = (pool.length >= 2 ? pool : QUALITIES.slice(0, 2)).map((x) => `<button type="button" class="btn btn-outline-secondary quiz-option" data-answer="${x.id}">${x.name}</button>`).join('');
    } else if (mode === 'progression') {
      const set = LEVELS[level].set;
      const romans = ['I'];
      while (romans.length < 4) { const r = pick(set); if (r !== romans[romans.length - 1]) romans.push(r); }
      q = { kind: 'progression', key: pick(KEYS), romans };
      $('#ear-prompt').innerHTML = `The first chord is <strong>I</strong>. Name chords 2, 3 and 4.`;
      $('#ear-answers').innerHTML = [1, 2, 3].map((i) => `<div><label class="form-label small mb-0" for="ear-p${i}">Chord ${i + 1}</label>
        <select class="form-select" id="ear-p${i}" data-pos="${i}"><option value="">?</option>${set.map((r) => `<option value="${r}">${prettyRoman(r)}</option>`).join('')}</select></div>`).join('')
        + `<div class="align-self-end"><button type="button" class="btn btn-primary" data-act="check">Check</button></div>`;
    } else {
      const cad = pick(CADENCES);
      q = { kind: 'cadence', key: pick(KEYS), cadence: cad };
      $('#ear-prompt').textContent = 'Which cadence ends this phrase? (The first chord is the home chord, I.)';
      $('#ear-answers').innerHTML = CADENCES.map((c) => `<button type="button" class="btn btn-outline-secondary quiz-option" data-answer="${c.id}">${c.name}</button>`).join('');
    }
    if (autoplay) play();
  }

  async function play() {
    if (!q) return;
    if (q.kind === 'quality') { player.previewChord(q.symbol, tuning); return; }
    const romans = q.kind === 'progression' ? q.romans : ['I', ...q.cadence.romans];
    if (await player.load(songOf(q.key, romans), tuning, { loop: false, countIn: false, metronome: false, band: false })) player.play();
  }

  function mark(correct, detail) {
    if (answered) return;
    answered = true;
    score[mode][1]++;
    if (correct) { score[mode][0]++; streak++; } else streak = 0;
    $('#ear-feedback').innerHTML = `<span class="${correct ? 'text-success-emphasis' : 'text-danger'}">${icon(correct ? 'check-circle-fill' : 'x-circle-fill')} ${correct ? 'Correct!' : 'Not quite.'}</span> ${detail}`;
    drawScore();
  }

  const offs = [
    on(host, 'change', '#ear-mode', (e) => { mode = e.target.value; drawOpts(); drawScore(); newQuestion(); }),
    on(host, 'change', '[data-q]', (e, t) => { if (t.checked) enabled.add(t.dataset.q); else enabled.delete(t.dataset.q); }),
    on(host, 'change', '#ear-level', (e) => { level = e.target.value; newQuestion(); }),
    on(host, 'click', '[data-act]', (e, t) => {
      if (t.dataset.act === 'play') play();
      if (t.dataset.act === 'next') newQuestion();
      if (t.dataset.act === 'check' && q?.kind === 'progression') {
        const picks = [1, 2, 3].map((i) => $(`#ear-p${i}`).value);
        const ok = picks.every((p, k) => p === q.romans[k + 1]);
        const chords = q.romans.map((r) => `${prettyRoman(r)} (${romanToChord(r, q.key)})`).join(' → ');
        mark(ok, `It was ${escapeHtml(chords)} in ${escapeHtml(q.key)}.`);
        [1, 2, 3].forEach((i) => $(`#ear-p${i}`).classList.add(picks[i - 1] === q.romans[i] ? 'is-valid' : 'is-invalid'));
      }
    }),
    on(host, 'click', '[data-answer]', (e, t) => {
      if (!q || answered) return;
      const ans = t.dataset.answer;
      if (q.kind === 'quality') {
        const right = QUALITIES.find((x) => x.id === q.answer);
        mark(ans === q.answer, `It was <strong>${escapeHtml(right.name)}</strong> (${escapeHtml(q.symbol)}).`);
        host.querySelectorAll('[data-answer]').forEach((b) => b.classList.toggle('btn-success', b.dataset.answer === q.answer));
      } else {
        mark(ans === q.cadence.id, `It was <strong>${escapeHtml(q.cadence.name)}</strong> — ${escapeHtml(q.cadence.why)}`);
        host.querySelectorAll('[data-answer]').forEach((b) => b.classList.toggle('btn-success', b.dataset.answer === q.cadence.id));
      }
      announce($('#ear-feedback').textContent);
    }),
  ];
  drawOpts();
  drawScore();
  newQuestion(false); // no sound until the user asks (autoplay rules)
  host.earForTest = { get question() { return q; } };
  return () => {
    player.stop();
    offs.forEach((o) => o());
    const secs = Math.round((performance.now() - started) / 1000);
    for (const [m, [c, t]] of Object.entries(score)) if (t) logPractice({ kind: 'quiz', ref: m, score: c, total: t, seconds: Math.round(secs * t / Math.max(1, Object.values(score).reduce((s, x) => s + x[1], 0))) });
  };
}
