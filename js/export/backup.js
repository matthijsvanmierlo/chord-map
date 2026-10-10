// Full-data backup (JSON) export / import with validation, preview and merge.
import { APP_ID, SCHEMA_VERSION, sanitizeState, sanitizeSong, migrate, newId, capPracticeLog } from '../state/schema.js';

/** Build the backup object for the current state. */
export function buildBackup(state) {
  return {
    app: APP_ID,
    kind: 'backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    meta: { tourDone: state.meta?.tourDone ?? false },
    songs: state.songs,
    setlists: state.setlists ?? [],
    practiceLog: state.practiceLog ?? [],
    practiceTotals: state.practiceTotals,
    flashcards: state.flashcards ?? {},
  };
}

export function buildSongFile(song) {
  return { app: APP_ID, kind: 'song', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), song };
}

/**
 * Parse an imported JSON text. Accepts a full backup, a single-song file, a
 * bare song object or an array of songs. Never touches stored data.
 * @returns {{kind:'backup'|'songs', songs:object[], settings:object|null, setlists:object[], practiceLog:object[], practiceTotals:object|null, flashcards:object, warnings:string[]}}
 */
export function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (!data || typeof data !== 'object') throw new Error('Unrecognised file contents.');
  if (data.app && data.app !== APP_ID) throw new Error(`This file belongs to a different app ("${String(data.app).slice(0, 40)}").`);
  migrate(data);

  if (data.kind === 'backup' || (Array.isArray(data.songs) && data.settings)) {
    const r = sanitizeState(data);
    return {
      kind: 'backup', songs: r.songs, settings: r.settings, setlists: r.setlists,
      practiceLog: r.practiceLog, practiceTotals: r.practiceTotals, flashcards: r.flashcards, warnings: r.warnings,
    };
  }
  if (data.kind === 'setlist') {
    const r = sanitizeState({ songs: data.songs, setlists: [data.setlist] });
    if (!r.songs.length && !r.setlists.length) throw new Error('This setlist file is empty.');
    return { kind: 'songs', songs: r.songs, settings: null, setlists: r.setlists, practiceLog: [], practiceTotals: null, flashcards: {}, warnings: r.warnings };
  }
  const raw = data.kind === 'song' ? [data.song] : Array.isArray(data) ? data : Array.isArray(data.songs) ? data.songs : [data];
  const songs = [];
  const warnings = [];
  for (const s of raw) {
    try {
      const r = sanitizeSong(s);
      songs.push(r.song);
      warnings.push(...r.warnings);
    } catch (e) {
      warnings.push(`Skipped an item: ${e.message}`);
    }
  }
  if (!songs.length) throw new Error('No songs or progressions found in this file.');
  return { kind: 'songs', songs, settings: null, setlists: [], practiceLog: [], practiceTotals: null, flashcards: {}, warnings };
}

/** Compare incoming songs with existing ones → summary for the preview dialog. */
export function previewMerge(existing, incoming) {
  const byId = new Map(existing.map((s) => [s.id, s]));
  let added = 0, newer = 0, older = 0, same = 0;
  for (const s of incoming) {
    const cur = byId.get(s.id);
    if (!cur) added++;
    else if (Date.parse(s.updatedAt) > Date.parse(cur.updatedAt)) newer++;
    else if (Date.parse(s.updatedAt) < Date.parse(cur.updatedAt)) older++;
    else same++;
  }
  return { added, newer, older, same, total: incoming.length };
}

/**
 * Merge incoming songs into existing.
 * strategy 'newest' — on id clash keep the most recently updated;
 * strategy 'both'   — on id clash keep both (incoming gets a new id).
 */
export function mergeSongs(existing, incoming, strategy = 'newest') {
  const out = existing.slice();
  const index = new Map(out.map((s, i) => [s.id, i]));
  for (const s of incoming) {
    if (!index.has(s.id)) {
      index.set(s.id, out.length);
      out.push(s);
      continue;
    }
    const i = index.get(s.id);
    if (strategy === 'both') {
      const copy = { ...s, id: newId(), title: `${s.title} (imported)` };
      out.push(copy);
    } else if (Date.parse(s.updatedAt) > Date.parse(out[i].updatedAt)) {
      out[i] = s;
    }
  }
  return out;
}

/** Merge setlists by id; the most recently updated copy wins. */
export function mergeSetlists(existing, incoming) {
  const map = new Map(existing.map((l) => [l.id, l]));
  for (const l of incoming) {
    const cur = map.get(l.id);
    if (!cur || Date.parse(l.updatedAt) > Date.parse(cur.updatedAt)) map.set(l.id, l);
  }
  return [...map.values()];
}

/** Union practice logs by entry id, then re-cap (keeps the existing archived totals). */
export function mergePracticeLog(existing, incoming, totals) {
  const ids = new Set(existing.map((e) => e.id));
  return capPracticeLog([...existing, ...incoming.filter((e) => !ids.has(e.id))], totals);
}

/** Merge flashcard progress: keep whichever card is further along (higher box). */
export function mergeFlashcards(existing, incoming) {
  const out = { ...existing };
  for (const [k, v] of Object.entries(incoming)) if (!out[k] || v.box > out[k].box) out[k] = v;
  return out;
}

export function backupFilename(date = new Date()) {
  const d = date.toISOString().slice(0, 10);
  return `fretboard-progressions-backup-${d}.json`;
}
