// Data schema, defaults, validation/sanitising and migrations.
// Everything that enters storage (incl. imports) passes through here, so a
// malformed file can never corrupt saved data.
import { parseChord } from '../music/chordParser.js';
import { parseNote, MODES } from '../music/theory.js';
import { validTuning } from '../music/tunings.js';

export const APP_ID = 'fretboard-progressions';
export const SCHEMA_VERSION = 2;

/** Max practice-log entries kept individually; older ones are folded into totals. */
export const PRACTICE_LOG_LIMIT = 5000;

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
    notation: { diagrams: true, staff: true, tab: true, lyrics: true },
    smoothVoicing: false,
    volume: 70,                    // 0–100
    metronome: true,
    countIn: true,
    announceChords: true,
    localLibsOnly: false,
    customTunings: [],
    customPatterns: [],
    favorites: [],
    voicing: defaultVoicingPrefs(),
    metronomeSubdivision: 1,       // clicks per beat: 1 | 2 | 3 | 4
    mix: { chords: 80, bass: 70, drums: 60, click: 70 },
  };
}

/** Chord-shape preferences (global in settings, optional per-song override). */
export function defaultVoicingPrefs() {
  return { minFret: 0, maxFret: 15, preferOpen: true, style: 'any', avoidBarre: false, maxStretch: 4 };
}

export const VOICING_STYLES = ['any', 'triads', 'shell', 'drop2', 'drop3'];
export const PRACTICE_KINDS = ['practice', 'drill', 'quiz', 'flashcard'];
const PATTERN_TOKENS = new Set(['D', 'U', 'd', 'B', 'b', '1', '2', '3', '4', '.']);

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
      const bar2 = { id: uid(bar?.id), chords };
      const lyric = str(bar?.lyric, 500).replace(/[\r\n]+/g, ' ');
      if (lyric.trim()) bar2.lyric = lyric;
      return bar2;
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
    groove: /^[\w-]{1,40}$/.test(raw.groove || '') ? raw.groove : 'none',
    voicingPrefs: raw.voicingPrefs && typeof raw.voicingPrefs === 'object' ? sanitizeVoicingPrefs(raw.voicingPrefs) : null,
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
  out.customPatterns = (Array.isArray(raw.customPatterns) ? raw.customPatterns : []).map(sanitizePattern).filter(Boolean).slice(0, 100);
  out.voicing = sanitizeVoicingPrefs(raw.voicing);
  out.metronomeSubdivision = [1, 2, 3, 4].includes(raw.metronomeSubdivision) ? raw.metronomeSubdivision : 1;
  out.mix = { ...d.mix };
  if (raw.mix && typeof raw.mix === 'object') for (const k of Object.keys(d.mix)) out.mix[k] = clamp(raw.mix[k], 0, 100, d.mix[k]);
  return out;
}

export function sanitizeVoicingPrefs(raw) {
  const d = defaultVoicingPrefs();
  if (!raw || typeof raw !== 'object') return d;
  const minFret = clamp(raw.minFret, 0, 20, d.minFret);
  return {
    minFret,
    maxFret: Math.max(minFret + 3, clamp(raw.maxFret, 3, 24, d.maxFret)),
    preferOpen: typeof raw.preferOpen === 'boolean' ? raw.preferOpen : d.preferOpen,
    style: VOICING_STYLES.includes(raw.style) ? raw.style : d.style,
    avoidBarre: !!raw.avoidBarre,
    maxStretch: clamp(raw.maxStretch, 2, 5, d.maxStretch),
  };
}

/** Custom strum pattern: same shape as built-ins in data/strumPatterns.js. Returns null if invalid. */
export function sanitizePattern(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.slots !== 'string') return null;
  const tokens = raw.slots.trim().split(/\s+/).slice(0, 64);
  if (!tokens.length || !tokens.every((t) => PATTERN_TOKENS.has(t))) return null;
  const meter = Array.isArray(raw.meter) && raw.meter.length === 2
    ? [clamp(raw.meter[0], 1, 16, 4), [2, 4, 8, 16].includes(Number(raw.meter[1])) ? Number(raw.meter[1]) : 4]
    : null;
  return {
    id: /^custom-[\w-]{1,60}$/.test(raw.id || '') ? raw.id : `custom-${newId().slice(0, 8)}`,
    name: str(raw.name, 60, 'My pattern').trim() || 'My pattern',
    meter,
    perBeat: clamp(raw.perBeat, 1, 4, 2),
    slots: tokens.join(' '),
    swing: !!raw.swing,
    custom: true,
  };
}

export function newSetlist(name = 'New setlist', songIds = []) {
  const now = new Date().toISOString();
  return { id: newId(), name, songIds, createdAt: now, updatedAt: now };
}

export function sanitizeSetlist(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const now = new Date().toISOString();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : newId(),
    name: str(raw.name, 120, 'Setlist').trim() || 'Setlist',
    songIds: [...new Set((Array.isArray(raw.songIds) ? raw.songIds : []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 80)))].slice(0, 500),
    createdAt: isoOr(raw.createdAt, now),
    updatedAt: isoOr(raw.updatedAt, now),
  };
}

export function sanitizePracticeEntry(raw) {
  if (!raw || typeof raw !== 'object' || !PRACTICE_KINDS.includes(raw.kind)) return null;
  const date = isoOr(raw.date, null);
  if (!date) return null;
  const e = {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : newId(),
    kind: raw.kind,
    ref: str(raw.ref, 120),
    date,
    seconds: clamp(raw.seconds, 0, 24 * 3600, 0),
  };
  if (raw.tempoStart != null) e.tempoStart = clamp(raw.tempoStart, 20, 400, 90);
  if (raw.tempoEnd != null) e.tempoEnd = clamp(raw.tempoEnd, 20, 400, 90);
  if (raw.score != null && Number.isFinite(Number(raw.score))) e.score = Math.max(0, Math.min(100000, Math.round(Number(raw.score))));
  if (raw.total != null && Number.isFinite(Number(raw.total))) e.total = Math.max(0, Math.min(100000, Math.round(Number(raw.total))));
  if (typeof raw.detail === 'string' && raw.detail) e.detail = raw.detail.slice(0, 200);
  return e;
}

export function defaultPracticeTotals() {
  return { seconds: 0, entries: 0, byRef: {} };
}

function sanitizeTotals(raw) {
  const d = defaultPracticeTotals();
  if (!raw || typeof raw !== 'object') return d;
  const byRef = {};
  if (raw.byRef && typeof raw.byRef === 'object') {
    for (const [k, v] of Object.entries(raw.byRef).slice(0, 5000)) byRef[String(k).slice(0, 120)] = clamp(v, 0, 1e9, 0);
  }
  return { seconds: clamp(raw.seconds, 0, 1e9, 0), entries: clamp(raw.entries, 0, 1e9, 0), byRef };
}

/** Keep the newest PRACTICE_LOG_LIMIT entries; fold older ones into totals. */
export function capPracticeLog(log, totals) {
  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length <= PRACTICE_LOG_LIMIT) return { practiceLog: sorted, practiceTotals: totals };
  const old = sorted.slice(0, sorted.length - PRACTICE_LOG_LIMIT);
  const t = { seconds: totals.seconds, entries: totals.entries, byRef: { ...totals.byRef } };
  for (const e of old) {
    t.seconds += e.seconds;
    t.entries += 1;
    if (e.ref) t.byRef[e.ref] = (t.byRef[e.ref] || 0) + e.seconds;
  }
  return { practiceLog: sorted.slice(-PRACTICE_LOG_LIMIT), practiceTotals: t };
}

/** Flashcard Leitner state: { cardKey: { box: 1–5, due: ISO date } }. */
export function sanitizeFlashcards(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw).slice(0, 5000)) {
    if (!v || typeof v !== 'object') continue;
    out[String(k).slice(0, 120)] = { box: clamp(v.box, 1, 5, 1), due: isoOr(v.due, new Date(0).toISOString()) };
  }
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
  if (v < 2) {
    // v2 adds setlists, practice log, flashcards, grooves, lyrics, voicing prefs and custom
    // strum patterns. All are optional with defaults, so v1 data needs no transformation —
    // the sanitizers fill them in. Future steps transform here: if (v < 3) { … }
    data = { ...data, setlists: data.setlists || [], practiceLog: data.practiceLog || [], flashcards: data.flashcards || {} };
  }
  return { ...data, schemaVersion: SCHEMA_VERSION };
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
  const setlists = (Array.isArray(data.setlists) ? data.setlists : []).map(sanitizeSetlist).filter(Boolean).slice(0, 500);
  const log = (Array.isArray(data.practiceLog) ? data.practiceLog : []).map(sanitizePracticeEntry).filter(Boolean);
  const { practiceLog, practiceTotals } = capPracticeLog(log, sanitizeTotals(data.practiceTotals));
  return {
    songs, settings: sanitizeSettings(data.settings), meta: sanitizeMeta(data.meta),
    setlists, practiceLog, practiceTotals, flashcards: sanitizeFlashcards(data.flashcards), warnings,
  };
}
