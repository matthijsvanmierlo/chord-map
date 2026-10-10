import { icon } from '../ui/dom.js';
import { updateMeta } from '../state/store.js';

export default {
  title: () => 'Help',
  render(el) {
    el.innerHTML = `
      <h1 class="page-title mb-3">Help</h1>
      <div class="row g-4">
        <div class="col-lg-7">
          <section class="surface p-3 mb-4" aria-labelledby="h-start">
            <h2 class="h5" id="h-start">${icon('rocket-takeoff')} Getting started</h2>
            <ol>
              <li><strong>Choose your instrument</strong> in the top bar. Diagrams, tab and playback follow it. Each song remembers its own instrument, capo and tuning.</li>
              <li><strong>Explore</strong> progressions by style. Open one to see chord diagrams, standard notation and tablature, change the key, and press <em>Listen</em>.</li>
              <li><strong>Save as my song</strong> to make an editable copy, or build from scratch in <em>My Songs → New song</em>.</li>
              <li><strong>Practise</strong>: big diagrams for the current and next chord, a highlighted bar in the notation, metronome, count-in, looping a section and a speed trainer.</li>
              <li><strong>Back up</strong> from <a href="#/settings#backup">Settings</a>, then import the file in any other browser.</li>
            </ol>
          </section>

          <section class="surface p-3 mb-4" aria-labelledby="h-edit">
            <h2 class="h5" id="h-edit">${icon('pencil-square')} Editing songs</h2>
            <ul>
              <li>Click a chord to open the chord panel: type a symbol, tap a chord from the key's <em>diatonic palette</em>, change its beats, browse shapes with ◀ ▶ (the chosen shape is locked), and hear it.</li>
              <li>Each bar shows its beat count (e.g. <code>4/4</code>); it turns orange if it doesn't match the time signature. Use <em>Split beats evenly</em> in the bar menu to fix it.</li>
              <li>Reorder bars by dragging the grip or with the bar menu (<em>Move earlier/later</em>). Sections can be renamed, repeated (×2, ×3…), moved, duplicated.</li>
              <li><em>Arrangement</em> lets you reuse sections in a play order, e.g. Verse → Chorus → Verse → Chorus.</li>
              <li><em>Transpose</em> moves every chord by a semitone; changing the key asks whether to move the chords too.</li>
              <li>Everything saves automatically. <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redo.</li>
            </ul>
          </section>

          <section class="surface p-3 mb-4" aria-labelledby="h-text">
            <h2 class="h5" id="h-text">${icon('fonts')} Typing chords as text</h2>
            <p>Switch on <em>Type as text</em> in the editor or use <em>Paste chords</em> in My Songs.</p>
            <table class="table table-sm">
              <thead><tr><th scope="col">You type</th><th scope="col">Means</th></tr></thead>
              <tbody>
                <tr><td><code>Am | F | C | G</code></td><td>four bars, one chord each</td></tr>
                <tr><td><code>Dm7 G7 | Cmaj7</code></td><td>two chords share a bar (beats split evenly)</td></tr>
                <tr><td><code>C . . G7</code></td><td><code>.</code> holds a chord one more beat → C for 3 beats, G7 for 1</td></tr>
                <tr><td><code>%</code></td><td>repeat the previous bar</td></tr>
                <tr><td><code>N.C.</code></td><td>no chord (rest)</td></tr>
                <tr><td><code>ii7 V7 | I</code></td><td>Roman numerals (tick “I'm typing Roman numerals”)</td></tr>
                <tr><td><code>Chorus:</code></td><td>(when pasting) starts a new section</td></tr>
              </tbody>
            </table>
            <p class="small mb-0">Chord symbols understood include: <code>C Cm Cdim Caug Csus2 Csus4 C5 C6 Cm6 C6/9 C7 Cmaj7 CΔ7 Cm7 C-7 Cm7b5 Cø C°7 CmMaj7 C7sus4 Cadd9 C9 Cmaj9 Cm9 C11 C13 C7b9 C7#9 C7#5 C7#11 C7b13 C7alt C/E</code>. Roman numerals are always relative to the major scale of the key, so minor-key progressions are written <code>i bVI bIII bVII</code>.</p>
          </section>
        </div>
        <div class="col-lg-5">
          <section class="surface p-3 mb-4 kbd-list" aria-labelledby="h-keys">
            <h2 class="h5" id="h-keys">${icon('keyboard')} Keyboard shortcuts</h2>
            <dl class="row mb-0 small">
              <dt class="col-6"><kbd>Space</kbd></dt><dd class="col-6">Start / stop (Practice)</dd>
              <dt class="col-6"><kbd>←</kbd> <kbd>→</kbd></dt><dd class="col-6">Step through chords (Practice, stopped)</dd>
              <dt class="col-6"><kbd>+</kbd> <kbd>−</kbd></dt><dd class="col-6">Tempo ±5 (Practice)</dd>
              <dt class="col-6"><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd class="col-6">Undo (Editor)</dd>
              <dt class="col-6"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></dt><dd class="col-6">Redo (Editor)</dd>
              <dt class="col-6"><kbd>Tab</kbd></dt><dd class="col-6">Every control is reachable by keyboard</dd>
            </dl>
          </section>

          <section class="surface p-3 mb-4" aria-labelledby="h-export">
            <h2 class="h5" id="h-export">${icon('box-arrow-up')} Export formats</h2>
            <ul class="small mb-0">
              <li><strong>Print / PDF</strong> — a clean sheet with diagrams, staff and tab. Choose “Save as PDF” in the print dialog.</li>
              <li><strong>PNG / SVG</strong> — an image of the whole sheet.</li>
              <li><strong>MusicXML</strong> — open in MuseScore, Guitar Pro, Sibelius, Finale or Dorico (chord symbols + notation + TAB).</li>
              <li><strong>ChordPro</strong> — plain-text songbook format used by many apps; can be imported back.</li>
              <li><strong>Song file (.json)</strong> — exact copy of one song for re-import.</li>
              <li><strong>Backup (.json)</strong> — everything (Settings → Backup); import it in another browser to move your data.</li>
            </ul>
          </section>

          <section class="surface p-3 mb-4" aria-labelledby="h-reading">
            <h2 class="h5" id="h-reading">${icon('book')} Reading the diagrams</h2>
            <ul class="small mb-0">
              <li>Vertical lines are strings (lowest-pitched/chin-side string on the left; mirrored in left-handed mode). Horizontal lines are frets; the thick line is the nut.</li>
              <li><strong>○</strong> open string, <strong>×</strong> don't play, numbers are fingers (1 index … 4 pinky), a bar shape is a barre. “5fr” means the top row is the 5th fret.</li>
              <li>Guitar notation is written an octave higher than it sounds (the small 8 under the treble clef).</li>
              <li>With a capo, shapes are shown relative to the capo; notation and playback are at concert pitch.</li>
            </ul>
          </section>

          <section class="surface p-3" aria-labelledby="h-privacy">
            <h2 class="h5" id="h-privacy">${icon('shield-lock')} Privacy</h2>
            <p class="small mb-2">No accounts, no tracking, no server. Your data is stored in this browser's local storage and only leaves it when you export a file. Clearing site data removes it — keep backups.</p>
            <button class="btn btn-sm btn-outline-secondary" type="button" id="show-tour">${icon('lightbulb')} Show the quick-start card again</button>
          </section>
        </div>
      </div>`;
    const btn = el.querySelector('#show-tour');
    const fn = () => { updateMeta({ tourDone: false }); location.hash = '#/'; };
    btn.addEventListener('click', fn);
    return () => btn.removeEventListener('click', fn);
  },
};
