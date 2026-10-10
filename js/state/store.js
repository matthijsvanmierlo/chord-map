// Application store: single source of truth, pub/sub, persisted to localStorage.
import { sanitizeState, SCHEMA_VERSION, APP_ID, newSong } from './schema.js';
import { setCustomTunings } from '../music/tunings.js';

const STORAGE_KEY = `${APP_ID}:v1`;
const listeners = new Set();
let state = { songs: [], settings: null, meta: null };
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
  state = { songs: r.songs, settings: r.settings, meta: r.meta };
  setCustomTunings(state.settings.customTunings);
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || e.newValue == null) return;
    try {
      const fresh = sanitizeState(JSON.parse(e.newValue));
      state = { songs: fresh.songs, settings: fresh.settings, meta: fresh.meta };
      setCustomTunings(state.settings.customTunings);
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
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, songs: state.songs, settings: state.settings, meta: state.meta };
}

// ---------- mutations ----------

export function updateSettings(patch) {
  state = { ...state, settings: { ...state.settings, ...patch } };
  if ('customTunings' in patch) setCustomTunings(state.settings.customTunings);
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
  state = { ...state, songs: state.songs.filter((s) => s.id !== id) };
  if (state.meta.lastSongId === id) state.meta = { ...state.meta, lastSongId: null };
  scheduleSave();
  emit('songs');
  return song;
}

/** Replace everything (used by import "replace" and reset). */
export function replaceAll({ songs, settings, meta }) {
  state = { songs: songs ?? [], settings: settings ?? state.settings, meta: meta ?? state.meta };
  setCustomTunings(state.settings.customTunings);
  flush();
  emit('replaced');
}

export function toggleFavorite(presetId) {
  const favs = new Set(state.settings.favorites);
  if (favs.has(presetId)) favs.delete(presetId); else favs.add(presetId);
  updateSettings({ favorites: [...favs] });
  return favs.has(presetId);
}

/** Approximate bytes used by our key. */
export function storageBytes() {
  try { return (localStorage.getItem(STORAGE_KEY) || '').length * 2; } catch { return 0; }
}

export { STORAGE_KEY };
