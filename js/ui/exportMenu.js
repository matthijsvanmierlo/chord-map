// Export dropdown shared by the progression, editor and practice views.
import { download, slugify, icon, escapeHtml } from './dom.js';
import { toChordPro } from '../export/chordpro.js';
import { toMusicXML } from '../export/musicxml.js';
import { buildSongFile } from '../export/backup.js';
import { downloadSVG, downloadPNG } from '../export/image.js';
import { toast, dialog } from './feedback.js';
import { toMidi } from '../export/midi.js';
import { shareUrl, shareSupported, SHARE_URL_WARN_LENGTH } from '../export/shareLink.js';

export function exportMenuHTML(id = 'export-menu') {
  return `<div class="dropdown">
    <button class="btn btn-outline-secondary dropdown-toggle" type="button" id="${id}" data-bs-toggle="dropdown" aria-expanded="false">${icon('box-arrow-up')} Export</button>
    <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="${id}">
      <li><button class="dropdown-item" type="button" data-export="print">${icon('printer')} Print / Save as PDF</button></li>
      <li><button class="dropdown-item" type="button" data-export="png">${icon('file-earmark-image')} Image (PNG)</button></li>
      <li><button class="dropdown-item" type="button" data-export="svg">${icon('filetype-svg')} Vector image (SVG)</button></li>
      <li><hr class="dropdown-divider"></li>
      <li><button class="dropdown-item" type="button" data-export="share">${icon('link-45deg')} Copy share link</button></li>
      <li><hr class="dropdown-divider"></li>
      <li><button class="dropdown-item" type="button" data-export="musicxml">${icon('music-note-list')} MusicXML (MuseScore, Guitar Pro…)</button></li>
      <li><button class="dropdown-item" type="button" data-export="midi">${icon('file-earmark-music')} MIDI (.mid, with backing band)</button></li>
      <li><button class="dropdown-item" type="button" data-export="chordpro">${icon('file-earmark-text')} ChordPro (.cho)</button></li>
      <li><button class="dropdown-item" type="button" data-export="json">${icon('filetype-json')} Song file (.json, re-importable)</button></li>
    </ul>
  </div>`;
}

/** Copy a share link (or show it for manual copying). */
async function shareLink(song) {
  if (!shareSupported()) { toast('Share links need a newer browser (CompressionStream).', { type: 'warning' }); return; }
  const url = await shareUrl(song);
  const long = url.length > SHARE_URL_WARN_LENGTH;
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch { /* clipboard blocked */ }
  if (copied && !long) {
    toast('Share link copied — paste it anywhere. Opening it shows this song and lets the recipient save it.', { type: 'success', delay: 6000 });
    return;
  }
  await dialog({
    title: 'Share link',
    body: `${long ? `<p class="text-warning-emphasis small">This song is large (${url.length.toLocaleString()} characters). Some apps cut long links — if it doesn't open, export a song file (.json) instead.</p>` : ''}
      <label class="form-label" for="share-url">${copied ? 'Copied to your clipboard:' : 'Copy this link:'}</label>
      <textarea id="share-url" class="form-control font-monospace small" rows="4" readonly>${escapeHtml(url)}</textarea>
      ${navigator.share ? '<button type="button" class="btn btn-outline-primary btn-sm mt-2" id="native-share">Share…</button>' : ''}`,
    buttons: [{ label: 'Done', value: true, variant: 'primary' }],
    onShown: (d) => {
      const ta = d.querySelector('#share-url'); ta.focus(); ta.select();
      d.querySelector('#native-share')?.addEventListener('click', () => navigator.share({ title: song.title, url }).catch(() => {}));
    },
  });
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
      case 'midi': download(`${base}.mid`, new Blob([toMidi(song, tuning, { smooth })], { type: 'audio/midi' }), 'audio/midi'); break;
      case 'share': await shareLink(song); return;
      case 'json': download(`${base}.song.json`, JSON.stringify(buildSongFile(song), null, 2), 'application/json'); break;
      default: return;
    }
    if (kind !== 'print') toast(`Exported ${kind.toUpperCase()}`, { type: 'success', delay: 2500 });
  } catch (e) {
    toast(`Export failed: ${e.message}`, { type: 'danger' });
  }
}
