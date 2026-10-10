// Print view: clean sheet music, then opens the browser print dialog
// (choose "Save as PDF" to get a PDF).
import { getSong, getSettings, getSetlist } from '../state/store.js';
import { keyLabel } from '../music/theory.js';
import { escapeHtml, formatDate } from '../ui/dom.js';
import { getPreset } from '../data/presets/index.js';
import { presetToSong } from '../music/song.js';
import { getTuning } from '../music/tunings.js';
import { renderLeadSheet } from '../render/leadSheet.js';
import { icon } from '../ui/dom.js';
import { notFound } from './shared.js';

export default {
  title: () => 'Print',
  render(el, { params, query }) {
    if (params.setlistId) return renderSongbook(el, params.setlistId, query);
    let song = null;
    if (params.id === 'preset') {
      const p = getPreset(query.id);
      if (p) song = presetToSong(p, { tonic: query.key || p.defaultKey.tonic, instrumentId: getSettings().instrumentId });
    } else song = getSong(params.id);
    if (!song) {
      el.innerHTML = notFound('printer', 'Nothing to print', 'That song is not available in this browser.');
      return null;
    }
    el.innerHTML = `
      <div class="d-flex gap-2 mb-3 no-print">
        <button class="btn btn-primary" type="button" id="do-print">${icon('printer')} Print / Save as PDF</button>
        <button class="btn btn-outline-secondary" type="button" id="go-back">${icon('arrow-left')} Back</button>
        <span class="small text-body-secondary align-self-center">Tip: in the print dialog choose “Save as PDF”.</span>
      </div>
      <h1 class="visually-hidden">Print: ${song.title.replace(/</g, '&lt;')}</h1>
      <div id="sheet" style="max-width: 820px; margin: 0 auto"></div>`;
    renderLeadSheet(el.querySelector('#sheet'), song, { tuning: getTuning(song.instrumentId), settings: getSettings(), width: 780 });
    const doPrint = () => window.print();
    el.querySelector('#do-print').addEventListener('click', doPrint);
    el.querySelector('#go-back').addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = '#/')));
    const t = setTimeout(() => { if (!query.noprint) window.print(); }, 600);
    return () => clearTimeout(t);
  },
};

/** Whole setlist as one printable songbook: title page with contents, one song per page. */
function renderSongbook(el, id, query) {
  const list = getSetlist(id);
  const songs = list ? list.songIds.map(getSong).filter(Boolean) : [];
  if (!list || !songs.length) {
    el.innerHTML = notFound('printer', 'Nothing to print', list ? 'This setlist has no songs yet.' : 'That setlist is not available in this browser.');
    return null;
  }
  el.innerHTML = `
    <div class="d-flex gap-2 mb-3 no-print">
      <button class="btn btn-primary" type="button" id="do-print">${icon('printer')} Print / Save as PDF</button>
      <span class="small text-body-secondary align-self-center">${songs.length} songs · each starts on a new page.</span>
    </div>
    <div style="max-width: 820px; margin: 0 auto">
      <section class="songbook-cover">
        <h1 class="lead-sheet-title display-6 text-center mt-4">${escapeHtml(list.name)}</h1>
        <p class="text-center lead-sheet-meta">Songbook · ${formatDate(new Date().toISOString())}</p>
        <h2 class="h5 mt-4">Contents</h2>
        <ol class="songbook-toc">${songs.map((s) => `<li><strong>${escapeHtml(s.title)}</strong>${s.artist ? ` — ${escapeHtml(s.artist)}` : ''} <span class="text-body-secondary small">(${escapeHtml(keyLabel(s.key))}${s.capo ? `, capo ${s.capo}` : ''})</span></li>`).join('')}</ol>
      </section>
      ${songs.map((s, i) => `<section class="songbook-song" id="sb-${i}" aria-label="${escapeHtml(s.title)}"></section>`).join('')}
    </div>`;
  songs.forEach((s, i) => renderLeadSheet(el.querySelector(`#sb-${i}`), s, { tuning: getTuning(s.instrumentId), settings: getSettings(), width: 780 }));
  const doPrint = () => window.print();
  el.querySelector('#do-print').addEventListener('click', doPrint);
  const t = setTimeout(() => { if (!query.noprint) window.print(); }, 900);
  return () => clearTimeout(t);
}
