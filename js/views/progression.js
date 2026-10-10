import { getPreset } from '../data/presets/index.js';
import { getSettings, updateSettings, saveSong, subscribe, toggleFavorite } from '../state/store.js';
import { presetToSong } from '../music/song.js';
import { renderLeadSheet } from '../render/leadSheet.js';
import { player } from '../audio/player.js';
import { escapeHtml, icon, on, debounce } from '../ui/dom.js';
import { navigate, setQuery } from '../router.js';
import { toast } from '../ui/feedback.js';
import { exportMenuHTML, runExport } from '../ui/exportMenu.js';
import { currentTuning, styleInfo, difficultyBadge, keyOptions, notFound } from './shared.js';
import { keyLabel } from '../music/theory.js';

export function displayControlsHTML(settings) {
  const n = settings.notation;
  return `<div class="d-flex flex-wrap gap-3 align-items-center">
    <div class="btn-group btn-group-sm" role="group" aria-label="Chord labels">
      ${[['chords', 'Chords'], ['roman', 'Numerals'], ['both', 'Both']].map(([v, l]) => `
        <input type="radio" class="btn-check" name="disp" id="disp-${v}" value="${v}" ${settings.chordDisplay === v ? 'checked' : ''}>
        <label class="btn btn-outline-primary" for="disp-${v}">${l}</label>`).join('')}
    </div>
    <fieldset class="d-flex flex-wrap gap-3 small">
      <legend class="visually-hidden">Show</legend>
      ${[['diagrams', 'Diagrams'], ['staff', 'Staff'], ['tab', 'TAB']].map(([k, l]) => `
        <div class="form-check form-switch mb-0">
          <input class="form-check-input" type="checkbox" role="switch" id="show-${k}" data-show="${k}" ${n[k] ? 'checked' : ''}>
          <label class="form-check-label" for="show-${k}">${l}</label>
        </div>`).join('')}
    </fieldset>
  </div>`;
}

/** Wire the display controls; returns unsubscribe. */
export function bindDisplayControls(el) {
  const a = on(el, 'change', 'input[name="disp"]', (e) => updateSettings({ chordDisplay: e.target.value }));
  const b = on(el, 'change', '[data-show]', (e, t) => updateSettings({ notation: { ...getSettings().notation, [t.dataset.show]: t.checked } }));
  return () => { a(); b(); };
}

export default {
  title: (p) => getPreset(p.id)?.name || 'Progression',
  render(el, { params, query }) {
    const preset = getPreset(params.id);
    if (!preset) {
      el.innerHTML = notFound('question-circle', 'Progression not found', 'It may have been renamed.', '<a class="btn btn-primary" href="#/explore">Back to Explore</a>');
      return null;
    }
    let tonic = query.key || preset.defaultKey.tonic;
    const st = styleInfo(preset.style);
    const songFor = () => presetToSong(preset, { tonic, instrumentId: getSettings().instrumentId });
    let song = songFor();

    el.innerHTML = `
      <nav aria-label="Breadcrumb"><ol class="breadcrumb small">
        <li class="breadcrumb-item"><a href="#/explore">Explore</a></li>
        <li class="breadcrumb-item"><a href="#/explore?style=${st.id}">${escapeHtml(st.name)}</a></li>
        <li class="breadcrumb-item active" aria-current="page">${escapeHtml(preset.name)}</li>
      </ol></nav>
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h1 class="page-title mb-1">${escapeHtml(preset.name)}</h1>
          <p class="mb-0 d-flex flex-wrap gap-3 align-items-center">
            <span class="badge badge-style">${icon(st.icon)} ${escapeHtml(st.name)}</span>
            ${difficultyBadge(preset.difficulty)}
            <span class="small text-body-secondary">${preset.timeSignature.join('/')} · ${preset.tempo} bpm${preset.swing ? ' · swing' : ''}</span>
          </p>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-primary" type="button" data-act="play">${icon('play-fill')} <span>Listen</span></button>
          <a class="btn btn-outline-primary" data-act="practice" href="#/practice?preset=${preset.id}&key=${encodeURIComponent(tonic)}">${icon('bullseye')} Practise</a>
          <button class="btn btn-outline-primary" type="button" data-act="save">${icon('plus-lg')} Save as my song</button>
          <button class="btn btn-outline-secondary" type="button" data-act="fav" aria-pressed="false"></button>
          ${exportMenuHTML()}
        </div>
      </div>

      <div class="row g-4">
        <div class="col-lg-8 order-2 order-lg-1">
          <div class="surface p-3 mb-3 d-flex flex-wrap gap-3 align-items-center">
            <div class="d-flex align-items-center gap-2">
              <label for="key-sel" class="small fw-semibold">Key</label>
              <select id="key-sel" class="form-select form-select-sm" style="width:auto">${keyOptions(tonic)}</select>
              <span class="small text-body-secondary" id="key-label"></span>
            </div>
            ${displayControlsHTML(getSettings())}
          </div>
          <div class="surface p-3" id="sheet"></div>
        </div>
        <aside class="col-lg-4 order-1 order-lg-2">
          <div class="surface p-3">
            <h2 class="h6 eyebrow">About</h2>
            <p>${escapeHtml(preset.description)}</p>
            <h2 class="h6 eyebrow">Why it works</h2>
            <p>${escapeHtml(preset.theory)}</p>
            ${preset.practiceTip ? `<h2 class="h6 eyebrow">Practice tip</h2><p>${escapeHtml(preset.practiceTip)}</p>` : ''}
            ${preset.examples?.length ? `<h2 class="h6 eyebrow">Heard in</h2><ul class="mb-0">${preset.examples.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : ''}
            ${preset.tags?.length ? `<p class="mt-3 mb-0">${preset.tags.map((t) => `<a class="badge text-bg-light border me-1 text-decoration-none" href="#/explore?q=${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join('')}</p>` : ''}
            <p class="small text-body-secondary mt-3 mb-0">${icon('hand-index')} Tip: click a chord diagram to hear it.</p>
          </div>
        </aside>
      </div>`;

    const sheet = el.querySelector('#sheet');
    const favBtn = el.querySelector('[data-act="fav"]');
    function drawFav() {
      const fav = getSettings().favorites.includes(preset.id);
      favBtn.setAttribute('aria-pressed', String(fav));
      favBtn.innerHTML = `${icon(fav ? 'star-fill' : 'star', fav ? 'text-warning' : '')} <span>${fav ? 'Favourited' : 'Favourite'}</span>`;
    }
    function draw() {
      song = songFor();
      el.querySelector('#key-label').textContent = keyLabel(song.key);
      renderLeadSheet(sheet, song, { tuning: currentTuning(), settings: getSettings(), interactive: true });
      el.querySelector('[data-act="practice"]').setAttribute('href', `#/practice?preset=${preset.id}&key=${encodeURIComponent(tonic)}`);
      drawFav();
    }
    const playBtn = el.querySelector('[data-act="play"]');
    const setPlayBtn = (playing) => { playBtn.innerHTML = `${icon(playing ? 'stop-fill' : 'play-fill')} <span>${playing ? 'Stop' : 'Listen'}</span>`; };

    const offs = [bindDisplayControls(el)];
    offs.push(on(el, 'change', '#key-sel', (e) => { tonic = e.target.value; setQuery({ key: tonic }); player.stop(); draw(); }));
    offs.push(on(el, 'click', '[data-chord]', (e, t) => player.previewChord(t.dataset.chord, currentTuning(), { voicingId: t.dataset.voicing || null })));
    offs.push(on(el, 'click', '[data-export]', (e, t) => runExport(t.dataset.export, {
      song, tuning: currentTuning(), sheetEl: sheet.querySelector('.lead-sheet'),
      printHref: `#/print/preset?id=${preset.id}&key=${encodeURIComponent(tonic)}`, smooth: getSettings().smoothVoicing,
    })));
    offs.push(on(el, 'click', '[data-act]', async (e, t) => {
      const act = t.dataset.act;
      if (act === 'play') {
        if (player.playing) { player.stop(); return; }
        if (!player.available) { toast('Audio library is not available.', { type: 'warning' }); return; }
        if (await player.load(song, currentTuning(), { loop: true, countIn: false, metronome: false, smooth: getSettings().smoothVoicing })) player.play();
      } else if (act === 'save') {
        const s = saveSong(songFor(), { touch: false });
        toast(`Saved “${s.title}” to My Songs`, { action: { label: 'Open editor', run: () => navigate(`song/${s.id}`) } });
      } else if (act === 'fav') {
        toggleFavorite(preset.id);
        drawFav();
      }
    }));
    offs.push(player.on((type, d) => { if (type === 'state') setPlayBtn(d.playing); }));
    const redraw = debounce(draw, 50);
    offs.push(subscribe((s, reason) => { if (reason === 'settings') redraw(); }));
    let lastW = sheet.clientWidth;
    const resizeCheck = new ResizeObserver(() => { if (Math.abs(sheet.clientWidth - lastW) > 40) { lastW = sheet.clientWidth; redraw(); } });
    resizeCheck.observe(sheet);
    draw();
    return () => { offs.forEach((o) => o()); resizeCheck.disconnect(); player.stop(); };
  },
};
