// Import flow shared by My Songs and Settings: JSON backups / song files,
// ChordPro files and plain-text chord charts. Validates fully before writing.
import { parseImport, previewMerge, mergeSongs, mergeSetlists, mergePracticeLog, mergeFlashcards } from '../export/backup.js';
import { fromChordPro } from '../export/chordpro.js';
import { fromMusicXML } from '../export/musicxmlImport.js';
import { parseBarText } from '../music/roman.js';
import { parseChord } from '../music/chordParser.js';
import { newSong, newSection, newBar } from '../state/schema.js';
import { getState, replaceAll, saveSong, updateSettings } from '../state/store.js';
import { readFileText, escapeHtml } from './dom.js';
import { dialog, toast } from './feedback.js';

/** Plain chord chart ("Am | F | C | G" or one chord per line) → song. */
export function songFromPlainText(text, { title = 'Pasted progression', beatsPerBar = 4 } = {}) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sections = [];
  let current = { name: 'Verse', text: [] };
  for (const line of lines) {
    const header = line.match(/^\[?([A-Za-z][\w\s-]{0,30}?)\]?:$/) || line.match(/^\[([A-Za-z][\w\s-]{0,30})\]$/);
    if (header && !parseChord(header[1])) {
      if (current.text.length) sections.push(current);
      current = { name: header[1].trim(), text: [] };
      continue;
    }
    current.text.push(line.includes('|') ? line : line.split(/\s+/).join(' | '));
  }
  if (current.text.length) sections.push(current);
  const errors = [];
  const secs = sections.map((s) => {
    const r = parseBarText(s.text.join(' | '), { beatsPerBar });
    errors.push(...r.errors);
    return newSection(s.name, r.bars.map((b) => newBar(b.chords.map((c) => ({ ...c, voicingId: null })))));
  }).filter((s) => s.bars.length);
  if (!secs.length) throw new Error(errors[0] || 'No chords found.');
  const first = parseChord(secs[0].bars[0].chords[0].symbol);
  const key = first && !first.nc ? { tonic: first.root, mode: /^m(?!aj)/.test(first.suffix) ? 'minor' : 'major' } : { tonic: 'C', mode: 'major' };
  return { song: newSong({ title, key, sections: secs }), errors };
}

async function importJson(text, name) {
  const data = parseImport(text);
  const existing = getState().songs;
  const p = previewMerge(existing, data.songs);
  const isBackup = data.kind === 'backup';
  const body = `
    <p>File <strong>${escapeHtml(name)}</strong> contains <strong>${p.total}</strong> song${p.total === 1 ? '' : 's'}${data.setlists.length ? `, ${data.setlists.length} setlist${data.setlists.length === 1 ? '' : 's'}` : ''}${data.practiceLog.length ? `, ${data.practiceLog.length} practice-log entr${data.practiceLog.length === 1 ? 'y' : 'ies'}` : ''}${isBackup ? ' and app settings' : ''}.</p>
    <ul class="small">
      <li>${p.added} new</li>
      ${p.newer ? `<li>${p.newer} newer than your copy</li>` : ''}
      ${p.older ? `<li>${p.older} older than your copy</li>` : ''}
      ${p.same ? `<li>${p.same} identical to your copy</li>` : ''}
    </ul>
    ${data.warnings.length ? `<details class="small mb-2"><summary>${data.warnings.length} note(s)</summary><ul>${data.warnings.slice(0, 20).map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></details>` : ''}
    <fieldset>
      <legend class="h6">How should it be imported?</legend>
      <div class="form-check"><input class="form-check-input" type="radio" name="imp" id="imp-newest" value="newest" checked>
        <label class="form-check-label" for="imp-newest"><strong>Merge</strong> — add new songs; where the same song exists keep the newest version</label></div>
      <div class="form-check"><input class="form-check-input" type="radio" name="imp" id="imp-both" value="both">
        <label class="form-check-label" for="imp-both"><strong>Merge, keep both</strong> — duplicates are added as copies</label></div>
      ${isBackup ? `<div class="form-check"><input class="form-check-input" type="radio" name="imp" id="imp-replace" value="replace">
        <label class="form-check-label" for="imp-replace"><strong>Replace everything</strong> — your current ${existing.length} song(s) and settings are discarded</label></div>
      <div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="imp-settings">
        <label class="form-check-label" for="imp-settings">Also import settings (theme, instrument, custom tunings, favourites)</label></div>` : ''}
    </fieldset>`;
  const choice = await dialog({
    title: isBackup ? 'Import backup' : 'Import songs',
    body,
    buttons: [{ label: 'Cancel', value: null }, { label: 'Import', value: 'go', variant: 'primary' }],
    collect: (el) => ({ mode: el.querySelector('input[name="imp"]:checked').value, settings: !!el.querySelector('#imp-settings')?.checked }),
  });
  if (!choice) return 0;
  if (choice.mode === 'replace') {
    replaceAll({
      songs: data.songs, settings: data.settings, meta: { ...getState().meta, lastSongId: null },
      setlists: data.setlists, practiceLog: data.practiceLog, practiceTotals: data.practiceTotals, flashcards: data.flashcards,
    });
    toast(`Replaced all data: ${data.songs.length} songs`, { type: 'success' });
    return data.songs.length;
  }
  const merged = mergeSongs(existing, data.songs, choice.mode);
  const st = getState();
  replaceAll({
    songs: merged,
    settings: choice.settings && data.settings ? data.settings : st.settings,
    meta: st.meta,
    setlists: mergeSetlists(st.setlists, data.setlists),
    ...mergePracticeLog(st.practiceLog, data.practiceLog, st.practiceTotals),
    flashcards: mergeFlashcards(st.flashcards, data.flashcards),
  });
  if (choice.settings && data.settings) updateSettings({});
  toast(`Imported ${p.total} song${p.total === 1 ? '' : 's'}`, { type: 'success' });
  return p.total;
}

function looksLikeJson(text) {
  if (!/^\s*[[{]/.test(text)) return false;
  try { JSON.parse(text); return true; } catch { return false; }
}

/** Import one or more files. Returns number of songs imported. */
export async function importFiles(files) {
  let count = 0;
  for (const file of files) {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('File is larger than 10 MB.');
      const name = file.name || 'file';
      if (/\.mxl$/i.test(name)) {
        const { song, warnings } = await fromMusicXML(new Uint8Array(await file.arrayBuffer()));
        saveSong(song, { touch: false });
        count++;
        toast(`Imported “${song.title}” from MusicXML${warnings.length ? ` (${warnings.length} note(s))` : ''}`);
        continue;
      }
      const text = await readFileText(file);
      if (/\.(musicxml|xml)$/i.test(name) || /<score-(partwise|timewise)/.test(text.slice(0, 2000))) {
        const { song, warnings } = await fromMusicXML(text);
        saveSong(song, { touch: false });
        count++;
        toast(`Imported “${song.title}” from MusicXML${warnings.length ? ` (${warnings.length} note(s))` : ''}`);
        continue;
      }
      if (/\.json$/i.test(name) || looksLikeJson(text)) {
        count += await importJson(text, name);
      } else if (/\{(title|t|start_of|soc|sov)\b|\[[A-G]/.test(text)) {
        const { song, errors } = fromChordPro(text);
        saveSong(song, { touch: false });
        count++;
        toast(`Imported “${song.title}”${errors.length ? ` (${errors.length} unrecognised chord(s) skipped)` : ''}`);
      } else {
        const { song, errors } = songFromPlainText(text, { title: name.replace(/\.\w+$/, '') });
        saveSong(song, { touch: false });
        count++;
        toast(`Imported “${song.title}”${errors.length ? ` (${errors.length} unrecognised chord(s) skipped)` : ''}`);
      }
    } catch (e) {
      toast(`Couldn't import ${file.name}: ${e.message}`, { type: 'danger', delay: 9000 });
    }
  }
  return count;
}

/** Wire a drop zone element for drag-and-drop import. */
export function bindDropZone(zone, onDone) {
  const over = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
  const leave = () => zone.classList.remove('dragover');
  const drop = async (e) => {
    e.preventDefault();
    leave();
    if (e.dataTransfer?.files?.length) { await importFiles([...e.dataTransfer.files]); onDone?.(); }
  };
  zone.addEventListener('dragover', over);
  zone.addEventListener('dragleave', leave);
  zone.addEventListener('drop', drop);
  return () => { zone.removeEventListener('dragover', over); zone.removeEventListener('dragleave', leave); zone.removeEventListener('drop', drop); };
}
