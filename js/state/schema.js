// Data schema, defaults, validation/sanitising and migrations.
// Everything that enters storage (incl. imports) passes through here, so a
// malformed file can never corrupt saved data.
import { parseChord } from '../music/chordParser.js';
import { parseNote, MODES } from '../music/theory.js';
import { validTuning } from '../music/tunings.js';

export const APP_ID = 'fretboard-progressions';
export const SCHEMA_VERSION = 1;

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function defaultSettings() {
  return {
    theme: 'auto',                 // auto | light | dark
    instrumentId: 'guitar-standard',
    leftHanded: false,
    chordDisplay: 'chords',        // chords | roman | both
    notation: { diagrams: true, staff: true, tab: true },
    smoothVoicing: false,
    volume: 70,                    // 0–100
    metronome: true,
    countIn: true,
    announceChords: true,
    localLibsOnly: false,
    customTunings: [],
    favorites: [],
  };
}

export function defaultMeta() {
  return { lastBackupAt: null, lastSongId: null, tourDone: false, createdAt: new Date().toISOString() };
}

export function newSection(name = 'Verse', bars = []) {
  return { id: newId(), name, repeat: 1, bars };
}

export function newBar(chords = []) {
  return { id: newId(), chords };
}

export function newSong(partial = {}) {
  const now = new Date().toISOString();
  const song = {
    id: newId(),
    schemaVersion: SCHEMA_VERSION,
    title: 'Untitled progression',
    artist: '',
    notes: '',
    tags: [],
    style: '',
    key: { tonic: 'C', mode: 'major' },
    timeSignature: [4, 4],
    tempo: 90,
    swing: false,
    instrumentId: 'guitar-standard',
    capo: 0,
    strumPatternId: 'quarters',
    sections: [newSection('Verse', [newBar([{ symbol: 'C', beats: 4, voicingId: null }])])],
    form: [],
    sourcePresetId: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
  return sanitizeSong(song).song;
}

const clamp = (n, lo, hi, d) => (Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Math.round(Number(n)))) : d);
const str = (v, max = 200, d = '') => (typeof v === 'string' ? v.slice(0, max) : d);
const isoOr = (v, d) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : d);

/**
 * Coerce an untrusted object into a valid Song. Throws only when it can't be
 * recognised as a song at all. Returns { song, warnings }.
 */
export function sanitizeSong(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a song object');
  if (!Array.isArray(raw.sections)) throw new Error('Song has no sections');
  const warnings = [];
  const now = new Date().toISOString();
  const tonic = parseNote(raw.key?.tonic) ? raw.key.tonic : 'C';
  const mode = MODES[raw.key?.mode] ? raw.key.mode : 'major';
  const tsNum = clamp(raw.timeSignature?.[0], 1, 16, 4);
  const tsDen = [2, 4, 8, 16].includes(Number(raw.timeSignature?.[1])) ? Number(raw.timeSignature[1]) : 4;

  const seenIds = new Set();
  const uid = (id) => {
    const v = typeof id === 'string' && id && !seenIds.has(id) ? id : newId();
    seenIds.add(v);
    return v;
  };

  const sections = raw.sections.slice(0, 100).map((sec, si) => {
    const bars = (Array.isArray(sec?.bars) ? sec.bars : []).slice(0, 500).map((bar) => {
      const chords = (Array.isArray(bar?.chords) ? bar.chords : []).slice(0, 16).map((c) => {
        const symbol = str(c?.symbol, 40, 'N.C.').trim() || 'N.C.';
        if (!parseChord(symbol)) warnings.push(`Unrecognised chord "${symbol}" kept as-is`);
        return {
          symbol,
          beats: clamp(c?.beats, 1, 32, 1),
          voicingId: typeof c?.voicingId === 'string' && c.voicingId.length < 80 ? c.voicingId : null,
        };
      });
      return { id: uid(bar?.id), chords };
    });
    return { id: uid(sec?.id), name: str(sec?.name, 60, `Section ${si + 1}`) || `Section ${si + 1}`, repeat: clamp(sec?.repeat, 1, 16, 1), bars };
  });
  if (!sections.length) sections.push(newSection('Verse'));
  const secIds = new Set(sections.map((s) => s.id));
  const form = (Array.isArray(raw.form) ? raw.form : []).filter((id) => secIds.has(id)).slice(0, 200);

  const song = {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : newId(),
    schemaVersion: SCHEMA_VERSION,
    title: str(raw.title, 200, 'Untitled').trim() || 'Untitled',
    artist: str(raw.artist, 200),
    notes: str(raw.notes, 10000),
    tags: (Array.isArray(raw.tags) ? raw.tags : []).filter((t) => typeof t === 'string').map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 30),
    style: str(raw.style, 40),
    key: { tonic, mode },
    timeSignature: [tsNum, tsDen],
    tempo: clamp(raw.tempo, 20, 400, 90),
    swing: !!raw.swing,
    instrumentId: str(raw.instrumentId, 80, 'guitar-standard') || 'guitar-standard',
    capo: clamp(raw.capo, 0, 12, 0),
    strumPatternId: str(raw.strumPatternId, 60, 'quarters') || 'quarters',
    sections,
    form,
    sourcePresetId: typeof raw.sourcePresetId === 'string' ? raw.sourcePresetId.slice(0, 80) : null,
    createdAt: isoOr(raw.createdAt, now),
    updatedAt: isoOr(raw.updatedAt, now),
  };
  return { song, warnings: [...new Set(warnings)] };
}

export function sanitizeSettings(raw) {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const out = { ...d };
  if (['auto', 'light', 'dark'].includes(raw.theme)) out.theme = raw.theme;
  if (typeof raw.instrumentId === 'string') out.instrumentId = raw.instrumentId.slice(0, 80);
  if (['chords', 'roman', 'both'].includes(raw.chordDisplay)) out.chordDisplay = raw.chordDisplay;
  for (const k of ['leftHanded', 'smoothVoicing', 'metronome', 'countIn', 'announceChords', 'localLibsOnly']) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  if (raw.notation && typeof raw.notation === 'object') {
    out.notation = { ...d.notation };
    for (const k of Object.keys(d.notation)) if (typeof raw.notation[k] === 'boolean') out.notation[k] = raw.notation[k];
  }
  out.volume = clamp(raw.volume, 0, 100, d.volume);
  out.customTunings = (Array.isArray(raw.customTunings) ? raw.customTunings : []).filter(validTuning).slice(0, 50)
    .map((t) => ({ id: String(t.id).slice(0, 80), name: String(t.name).slice(0, 80), instrument: ['guitar', 'ukulele', 'other'].includes(t.instrument) ? t.instrument : 'other', strings: t.strings.map(String), frets: clamp(t.frets, 5, 24, 15) }));
  out.favorites = (Array.isArray(raw.favorites) ? raw.favorites : []).filter((x) => typeof x === 'string').slice(0, 1000);
  return out;
}

export function sanitizeMeta(raw) {
  const d = defaultMeta();
  if (!raw || typeof raw !== 'object') return d;
  return {
    lastBackupAt: isoOr(raw.lastBackupAt, null),
    lastSongId: typeof raw.lastSongId === 'string' ? raw.lastSongId : null,
    tourDone: !!raw.tourDone,
    createdAt: isoOr(raw.createdAt, d.createdAt),
  };
}

/** Upgrade older data shapes in place. Add a step per future schema version. */
export function migrate(data) {
  const v = Number(data?.schemaVersion) || 1;
  if (v > SCHEMA_VERSION) throw new Error(`This file was made by a newer version of the app (schema ${v}). Please update the app.`);
  // v1 is current — future: if (v < 2) { ...transform...; data.schemaVersion = 2; }
  return data;
}

/** Full application state from untrusted stored/imported data. */
export function sanitizeState(raw) {
  const data = migrate(raw || {});
  const songs = [];
  const warnings = [];
  for (const s of Array.isArray(data.songs) ? data.songs : []) {
    try {
      const r = sanitizeSong(s);
      songs.push(r.song);
      warnings.push(...r.warnings.map((w) => `${r.song.title}: ${w}`));
    } catch (e) {
      warnings.push(`Skipped an invalid song (${e.message})`);
    }
  }
  return { songs, settings: sanitizeSettings(data.settings), meta: sanitizeMeta(data.meta), warnings };
}
