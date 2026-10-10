// Print view: clean sheet music, then opens the browser print dialog
// (choose "Save as PDF" to get a PDF).
import { getSong, getSettings } from '../state/store.js';
import { getPreset } from '../data/presets/index.js';
import { presetToSong } from '../music/song.js';
import { getTuning } from '../music/tunings.js';
import { renderLeadSheet } from '../render/leadSheet.js';
import { icon } from '../ui/dom.js';
import { notFound } from './shared.js';

export default {
  title: () => 'Print',
  render(el, { params, query }) {
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
