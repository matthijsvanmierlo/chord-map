// Application store: single source of truth, pub/sub, persisted to localStorage.
import { sanitizeState, SCHEMA_VERSION, APP_ID, newSong, newId, sanitizePracticeEntry, sanitizeSetlist, capPracticeLog, defaultPracticeTotals } from './schema.js';
import { setCustomTunings } from '../music/tunings.js';
import { setCustomPatterns } from '../data/strumPatterns.js';
import { setDefaultVoicingPrefs } from '../music/voicingEngine.js';

/** Push settings that other modules cache (tunings, patterns, shape prefs). */
function applySettingsSideEffects(settings) {
  setCustomTunings(settings.customTunings);
  setCustomPatterns(settings.customPatterns);
  setDefaultVoicingPrefs(settings.voicing);
}

const STORAGE_KEY = `${APP_ID}:v1`;
const listeners = new Set();
let state = { songs: [], settings: null, meta: null, setlists: [], practiceLog: [], practiceTotals: defaultPracticeTotals(), flashcards: {} };

const pick = (r) => ({ songs: r.songs, settings: r.settings, meta: r.meta, setlists: r.setlists, practiceLog: r.practiceLog, practiceTotals: r.practiceTotals, flashcards: r.flashcards });
let saveTimer = null;
let storageOk = true;
let lastSaveError = null;

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    storageOk = false;
    console.warn('localStorage unavailable', e);
    return null;
  }
}

/** Load persisted state (call once at boot). Returns sanitisation warnings. */
export function initStore() {
  const r = sanitizeState(readStorage() || {});
  state = pick(r);
  applySettingsSideEffects(state.settings);
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || e.newValue == null) return;
    try {
      const fresh = sanitizeState(JSON.parse(e.newValue));
      state = pick(fresh);
      applySettingsSideEffects(state.settings);
      emit('external');
    } catch { /* ignore malformed */ }
  });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  return r.warnings;
}

export function getState() { return state; }
export function getSettings() { return state.settings; }
export function isStorageAvailable() { return storageOk; }
export function getLastSaveError() { return lastSaveError; }

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(reason) {
  for (const fn of listeners) {
    try { fn(state, reason); } catch (e) { console.error(e); }
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}

/** Write state to localStorage immediately. */
export function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!storageOk) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
    lastSaveError = null;
    emit('saved');
    return true;
  } catch (e) {
    lastSaveError = e;
    emit('save-error');
    return false;
  }
}

export function serialize() {
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, ...state };
}

// ---------- mutations ----------

export function updateSettings(patch) {
  state = { ...state, settings: { ...state.settings, ...patch } };
  if ('customTunings' in patch || 'customPatterns' in patch || 'voicing' in patch) applySettingsSideEffects(state.settings);
  scheduleSave();
  emit('settings');
}

export function updateMeta(patch) {
  state = { ...state, meta: { ...state.meta, ...patch } };
  scheduleSave();
  emit('meta');
}

export function getSong(id) {
  return state.songs.find((s) => s.id === id) || null;
}

/** Insert or replace a song (bumps updatedAt). */
export function saveSong(song, { touch = true } = {}) {
  const s = touch ? { ...song, updatedAt: new Date().toISOString() } : song;
  const idx = state.songs.findIndex((x) => x.id === s.id);
  const songs = state.songs.slice();
  if (idx >= 0) songs[idx] = s; else songs.unshift(s);
  state = { ...state, songs };
  scheduleSave();
  emit('songs');
  return s;
}

export function createSong(partial) {
  return saveSong(newSong(partial), { touch: false });
}

export function deleteSong(id) {
  const song = getSong(id);
  state = {
    ...state,
    songs: state.songs.filter((s) => s.id !== id),
    setlists: state.setlists.map((l) => (l.songIds.includes(id) ? { ...l, songIds: l.songIds.filter((x) => x !== id) } : l)),
  };
  if (state.meta.lastSongId === id) state.meta = { ...state.meta, lastSongId: null };
  scheduleSave();
  emit('songs');
  return song;
}

/** Replace everything (used by import "replace"/"merge" and reset). Omitted slices are kept. */
export function replaceAll({ songs, settings, meta, setlists, practiceLog, practiceTotals, flashcards }) {
  state = {
    songs: songs ?? [],
    settings: settings ?? state.settings,
    meta: meta ?? state.meta,
    setlists: setlists ?? state.setlists,
    practiceLog: practiceLog ?? state.practiceLog,
    practiceTotals: practiceTotals ?? state.practiceTotals,
    flashcards: flashcards ?? state.flashcards,
  };
  applySettingsSideEffects(state.settings);
  flush();
  emit('replaced');
}

export function toggleFavorite(presetId) {
  const favs = new Set(state.settings.favorites);
  if (favs.has(presetId)) favs.delete(presetId); else favs.add(presetId);
  updateSettings({ favorites: [...favs] });
  return favs.has(presetId);
}

// ---------- setlists ----------

export function getSetlist(id) {
  return state.setlists.find((l) => l.id === id) || null;
}

/** Insert or replace a setlist (bumps updatedAt). */
export function saveSetlist(list) {
  const l = sanitizeSetlist({ ...list, updatedAt: new Date().toISOString() });
  const i = state.setlists.findIndex((x) => x.id === l.id);
  const setlists = state.setlists.slice();
  if (i >= 0) setlists[i] = l; else setlists.unshift(l);
  state = { ...state, setlists };
  scheduleSave();
  emit('setlists');
  return l;
}

export function deleteSetlist(id) {
  const removed = getSetlist(id);
  state = { ...state, setlists: state.setlists.filter((l) => l.id !== id) };
  scheduleSave();
  emit('setlists');
  return removed;
}

// ---------- practice log & flashcards ----------

/** Record a practice/drill/quiz/flashcard session. Returns the stored entry (or null if invalid). */
export function logPractice(entry) {
  const e = sanitizePracticeEntry({ id: newId(), date: new Date().toISOString(), ...entry });
  if (!e) return null;
  const capped = capPracticeLog([...state.practiceLog, e], state.practiceTotals);
  state = { ...state, ...capped };
  scheduleSave();
  emit('practice');
  return e;
}

export function updateFlashcard(key, { box, due }) {
  state = { ...state, flashcards: { ...state.flashcards, [key]: { box, due } } };
  scheduleSave();
  emit('flashcards');
}

/** Approximate bytes used by our key. */
export function storageBytes() {
  try { return (localStorage.getItem(STORAGE_KEY) || '').length * 2; } catch { return 0; }
}

export { STORAGE_KEY };
