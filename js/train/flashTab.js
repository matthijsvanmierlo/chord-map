// Train → Chord-shape flashcards with Leitner spaced repetition.
import { getState, getSettings, updateFlashcard, logPractice } from '../state/store.js';
import { getTuning } from '../music/tunings.js';
import { resolveVoicing } from '../music/voicingEngine.js';
import { chordDiagramSVG } from '../render/chordDiagram.js';
import { prettyChord, describeChord, parseChord } from '../music/chordParser.js';
import { uniqueChords } from '../music/song.js';
import { player } from '../audio/player.js';
import { escapeHtml, icon, on, announce } from '../ui/dom.js';
import { rateCard, dueCards } from './stats.js';

const DECKS = {
  open: { name: 'Open chords', chords: ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'F', 'G7', 'C7', 'D7', 'A7', 'E7', 'B7'] },
  barre: { name: 'Barre chords', chords: ['F', 'Fm', 'Bb', 'Bbm', 'B', 'Bm', 'C#m', 'F#m', 'G#m', 'Eb', 'Ab', 'Cm'] },
  sevenths: { name: 'Seventh chords', chords: ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5', 'Dmaj7', 'Gmaj7', 'Amaj7', 'Bm7', 'F#m7'] },
  jazz: { name: 'Jazz colours', chords: ['C6', 'Cmaj9', 'Dm9', 'G13', 'G7b9', 'Cdim7', 'F#m7b5', 'Bb7', 'Eb7', 'A7#9', 'D9', 'Fm6'] },
};

export function mountFlash(host) {
  const tuning = getTuning(getSettings().instrumentId);
  const songs = getState().songs;
  let deckId = 'open';
  let direction = 'name';
  let queue = [];
  let current = null;
  let revealed = false;
  let stats = { good: 0, total: 0 };
  const started = performance.now();

  host.innerHTML = `
    <div class="surface p-3 mb-3 d-flex flex-wrap gap-3 align-items-end">
      <div><label class="form-label small mb-0" for="fc-deck">Deck</label>
        <select id="fc-deck" class="form-select">
          ${Object.entries(DECKS).map(([k, d]) => `<option value="${k}">${d.name}</option>`).join('')}
          ${songs.length ? `<optgroup label="From a song">${songs.map((s) => `<option value="song:${escapeHtml(s.id)}">${escapeHtml(s.title)}</option>`).join('')}</optgroup>` : ''}
        </select></div>
      <div><label class="form-label small mb-0" for="fc-dir">Show</label>
        <select id="fc-dir" class="form-select"><option value="name">Chord name → find the shape</option><option value="shape">Shape → name the chord</option></select></div>
      <div class="ms-auto small text-end" id="fc-progress" aria-live="polite"></div>
    </div>
    <div class="surface p-3">
      <div class="flashcard" id="fc-card" aria-live="polite"></div>
      <div class="d-flex flex-wrap justify-content-center gap-2 mt-3" id="fc-actions"></div>
      <p class="small text-body-secondary text-center mt-3 mb-0">Cards you know well come back less often (spaced repetition). Keys: <kbd>Space</kbd> reveal · <kbd>1</kbd> again · <kbd>2</kbd> hard · <kbd>3</kbd> good</p>
    </div>`;
  const $ = (s) => host.querySelector(s);

  const deckChords = () => (deckId.startsWith('song:')
    ? uniqueChords(songs.find((s) => s.id === deckId.slice(5)) || { sections: [] }).map((c) => c.symbol)
    : DECKS[deckId].chords).filter((c) => parseChord(c) && !parseChord(c).nc);
  const keyOf = (sym) => `${tuning.id}|${sym}`;

  function buildQueue() {
    const chords = deckChords();
    const keys = dueCards(chords.map(keyOf), getState().flashcards);
    queue = keys.map((k) => k.slice(tuning.id.length + 1));
    next();
  }

  function next() {
    current = queue.shift() || null;
    revealed = false;
    draw();
  }

  function diagram(sym) {
    return chordDiagramSVG(sym, resolveVoicing(sym, tuning), tuning, { width: 180, leftHanded: getSettings().leftHanded, showName: false });
  }

  function draw() {
    const total = deckChords().length;
    $('#fc-progress').innerHTML = `${stats.good}/${stats.total} good this session · ${queue.length + (current ? 1 : 0)} of ${total} due`;
    if (!current) {
      $('#fc-card').innerHTML = `<div>${icon('check2-circle', 'fs-1 text-brand')}<p class="fs-5 mt-2 mb-1">All caught up for this deck!</p><p class="small text-body-secondary mb-0">Come back later — or pick another deck.</p></div>`;
      $('#fc-actions').innerHTML = `<button class="btn btn-outline-primary" type="button" data-act="restart">${icon('arrow-repeat')} Review all anyway</button>`;
      return;
    }
    const front = direction === 'name'
      ? `<div class="flashcard-name">${escapeHtml(prettyChord(current))}</div><div class="small text-body-secondary">${escapeHtml(describeChord(current))} — play it, then reveal</div>`
      : `<div>${diagram(current)}</div><div class="small text-body-secondary">Which chord is this?</div>`;
    const back = direction === 'name'
      ? `<div class="flashcard-name fs-3">${escapeHtml(prettyChord(current))}</div>${diagram(current)}`
      : `<div>${diagram(current)}</div><div class="flashcard-name">${escapeHtml(prettyChord(current))}</div>`;
    $('#fc-card').innerHTML = revealed ? back : front;
    $('#fc-actions').innerHTML = revealed
      ? `<button class="btn btn-outline-secondary" type="button" data-act="hear">${icon('volume-up')} Hear</button>
         <button class="btn btn-outline-danger" type="button" data-rate="again" aria-keyshortcuts="1">Again</button>
         <button class="btn btn-outline-warning" type="button" data-rate="hard" aria-keyshortcuts="2">Hard</button>
         <button class="btn btn-success" type="button" data-rate="good" aria-keyshortcuts="3">Good</button>`
      : `<button class="btn btn-primary btn-lg" type="button" data-act="reveal" aria-keyshortcuts="Space">${icon('eye')} Reveal</button>`;
  }

  function reveal() {
    if (!current || revealed) return;
    revealed = true;
    draw();
    player.previewChord(current, tuning);
    host.querySelector('[data-rate="good"]')?.focus();
  }

  function rate(r) {
    if (!current || !revealed) return;
    const k = keyOf(current);
    updateFlashcard(k, rateCard(getState().flashcards[k], r));
    stats.total++;
    if (r === 'good') stats.good++;
    if (r === 'again') queue.push(current); // see it again this session
    announce(r === 'good' ? 'Good' : r === 'hard' ? 'Hard' : 'Again');
    next();
    host.querySelector('[data-act="reveal"]')?.focus();
  }

  const onKey = (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (e.key === ' ' && !revealed) { e.preventDefault(); reveal(); }
    else if (revealed && ['1', '2', '3'].includes(e.key)) rate(['again', 'hard', 'good'][Number(e.key) - 1]);
  };
  document.addEventListener('keydown', onKey);
  const offs = [
    on(host, 'change', '#fc-deck', (e) => { deckId = e.target.value; buildQueue(); }),
    on(host, 'change', '#fc-dir', (e) => { direction = e.target.value; draw(); }),
    on(host, 'click', '[data-act]', (e, t) => {
      if (t.dataset.act === 'reveal') reveal();
      if (t.dataset.act === 'hear') player.previewChord(current, tuning);
      if (t.dataset.act === 'restart') { queue = deckChords(); next(); }
    }),
    on(host, 'click', '[data-rate]', (e, t) => rate(t.dataset.rate)),
  ];
  buildQueue();
  return () => {
    document.removeEventListener('keydown', onKey);
    offs.forEach((o) => o());
    if (stats.total) logPractice({ kind: 'flashcard', ref: deckId, score: stats.good, total: stats.total, seconds: Math.round((performance.now() - started) / 1000) });
  };
}
