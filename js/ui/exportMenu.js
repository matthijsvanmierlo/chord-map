// Export dropdown shared by the progression, editor and practice views.
import { download, slugify, icon } from './dom.js';
import { toChordPro } from '../export/chordpro.js';
import { toMusicXML } from '../export/musicxml.js';
import { buildSongFile } from '../export/backup.js';
import { downloadSVG, downloadPNG } from '../export/image.js';
import { toast } from './feedback.js';

export function exportMenuHTML(id = 'export-menu') {
  return `<div class="dropdown">
    <button class="btn btn-outline-secondary dropdown-toggle" type="button" id="${id}" data-bs-toggle="dropdown" aria-expanded="false">${icon('box-arrow-up')} Export</button>
    <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="${id}">
      <li><button class="dropdown-item" type="button" data-export="print">${icon('printer')} Print / Save as PDF</button></li>
      <li><button class="dropdown-item" type="button" data-export="png">${icon('file-earmark-image')} Image (PNG)</button></li>
      <li><button class="dropdown-item" type="button" data-export="svg">${icon('filetype-svg')} Vector image (SVG)</button></li>
      <li><hr class="dropdown-divider"></li>
      <li><button class="dropdown-item" type="button" data-export="musicxml">${icon('music-note-list')} MusicXML (MuseScore, Guitar Pro…)</button></li>
      <li><button class="dropdown-item" type="button" data-export="chordpro">${icon('file-earmark-text')} ChordPro (.cho)</button></li>
      <li><button class="dropdown-item" type="button" data-export="json">${icon('filetype-json')} Song file (.json, re-importable)</button></li>
    </ul>
  </div>`;
}

/**
 * @param {string} kind
 * @param {{song:object, tuning:object, sheetEl:HTMLElement|null, printHref:string, smooth?:boolean}} ctx
 */
export async function runExport(kind, { song, tuning, sheetEl, printHref, smooth = false }) {
  const base = slugify(song.title);
  try {
    switch (kind) {
      case 'print': window.open(printHref, '_blank', 'noopener'); break;
      case 'png':
        if (!sheetEl) throw new Error('Nothing rendered to export');
        await downloadPNG(sheetEl, song);
        break;
      case 'svg':
        if (!sheetEl) throw new Error('Nothing rendered to export');
        downloadSVG(sheetEl, song);
        break;
      case 'musicxml': download(`${base}.musicxml`, toMusicXML(song, tuning, { smooth }), 'application/vnd.recordare.musicxml+xml'); break;
      case 'chordpro': download(`${base}.cho`, toChordPro(song), 'text/plain'); break;
      case 'json': download(`${base}.song.json`, JSON.stringify(buildSongFile(song), null, 2), 'application/json'); break;
      default: return;
    }
    if (kind !== 'print') toast(`Exported ${kind.toUpperCase()}`, { type: 'success', delay: 2500 });
  } catch (e) {
    toast(`Export failed: ${e.message}`, { type: 'danger' });
  }
}
