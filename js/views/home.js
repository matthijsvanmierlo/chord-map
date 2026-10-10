import { getState, getSong, updateMeta, createSong } from '../state/store.js';
import { STYLES, PRESETS } from '../data/presets/index.js';
import { escapeHtml, icon, on, formatDate } from '../ui/dom.js';
import { navigate } from '../router.js';
import { getSettings } from '../state/store.js';

export default {
  title: () => 'Home',
  render(el) {
    const { songs, meta } = getState();
    const last = meta.lastSongId ? getSong(meta.lastSongId) : songs[0];
    const counts = Object.fromEntries(STYLES.map((s) => [s.id, PRESETS.filter((p) => p.style === s.id).length]));

    el.innerHTML = `
      <section class="hero mb-4">
        <p class="eyebrow mb-2">Guitar · Ukulele · ${PRESETS.length} progressions</p>
        <h1 class="mb-3">Learn the chord progressions behind the music you love.</h1>
        <p class="lead lead-soft mb-4" style="max-width: 46rem">Explore jazz, blues, classical, folk, pop and more. See every chord as a diagram, tab and standard notation, hear it played, then build and practise your own — all saved privately in this browser.</p>
        <div class="d-flex flex-wrap gap-2">
          <a class="btn btn-primary btn-lg" href="#/explore">${icon('compass')} Explore progressions</a>
          <button class="btn btn-outline-primary btn-lg" type="button" data-act="new">${icon('plus-lg')} Build your own</button>
        </div>
      </section>

      ${!meta.tourDone ? `
      <section class="card tour-card mb-4" aria-labelledby="tour-h">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <h2 class="h5" id="tour-h">${icon('lightbulb')} Quick start — three steps</h2>
            <button class="btn-close" type="button" data-act="dismiss-tour" aria-label="Hide quick start"></button>
          </div>
          <ol class="mb-0">
            <li><strong>Pick your instrument</strong> in the top bar (guitar, ukulele or a custom tuning). Every diagram updates instantly.</li>
            <li><strong>Explore</strong> a style, open a progression, change its key and press <em>Play</em>.</li>
            <li><strong>Save it as your song</strong> to edit chords, add sections, and practise with the metronome and speed trainer.</li>
          </ol>
        </div>
      </section>` : ''}

      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <a class="card card-hover action-card" href="#/explore">
            ${icon('compass')}<h2 class="h5 mt-2">Explore</h2>
            <p class="mb-0 lead-soft">Browse by style and difficulty, transpose to any key and listen.</p>
          </a>
        </div>
        <div class="col-md-4">
          <a class="card card-hover action-card" href="#/songs">
            ${icon('pencil-square')}<h2 class="h5 mt-2">Build</h2>
            <p class="mb-0 lead-soft">Type chords or tap them from the key's palette. Sections, repeats, voicings, undo.</p>
          </a>
        </div>
        <div class="col-md-4">
          ${last ? `<a class="card card-hover action-card" href="#/practice/${escapeHtml(last.id)}">
            ${icon('play-circle')}<h2 class="h5 mt-2">Continue practising</h2>
            <p class="mb-0 lead-soft"><strong>${escapeHtml(last.title)}</strong> · edited ${formatDate(last.updatedAt)}</p>
          </a>` : `<a class="card card-hover action-card" href="#/chords">
            ${icon('grid-3x3')}<h2 class="h5 mt-2">Chord dictionary</h2>
            <p class="mb-0 lead-soft">Every chord, every shape, for your tuning — with sound.</p>
          </a>`}
        </div>
      </div>

      <section aria-labelledby="styles-h">
        <h2 class="h4 mb-3" id="styles-h">Browse by style</h2>
        <div class="style-chip-grid">
          ${STYLES.map((s) => `<a class="card card-hover style-tile" href="#/explore?style=${s.id}">${icon(s.icon)}<span><strong>${escapeHtml(s.name)}</strong><br><span class="small text-body-secondary">${counts[s.id]} progressions</span></span></a>`).join('')}
        </div>
      </section>`;

    const off = on(el, 'click', '[data-act]', (e, t) => {
      if (t.dataset.act === 'dismiss-tour') { updateMeta({ tourDone: true }); t.closest('.tour-card').remove(); }
      if (t.dataset.act === 'new') {
        const s = createSong({ title: 'My progression', instrumentId: getSettings().instrumentId });
        navigate(`song/${s.id}`);
      }
    });
    return off;
  },
};
