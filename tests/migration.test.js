import { describe, test, eq, ok } from './harness.js';
import {
  SCHEMA_VERSION, PRACTICE_LOG_LIMIT, sanitizeState, sanitizeSong, sanitizeSettings, sanitizePattern,
  sanitizeSetlist, sanitizePracticeEntry, sanitizeVoicingPrefs, capPracticeLog, defaultPracticeTotals, newSong, migrate,
} from '../js/state/schema.js';
import { buildBackup, parseImport, mergeSetlists, mergePracticeLog, mergeFlashcards } from '../js/export/backup.js';

// A backup exactly as v1 of the app wrote it.
const V1_BACKUP = {
  app: 'fretboard-progressions', kind: 'backup', schemaVersion: 1, exportedAt: '2026-10-10T12:00:00.000Z',
  settings: { theme: 'dark', instrumentId: 'ukulele-standard', favorites: ['jazz-ii-v-i-major'], customTunings: [] },
  meta: { tourDone: true },
  songs: [{
    id: 'old-1', schemaVersion: 1, title: 'Old song', key: { tonic: 'G', mode: 'major' }, timeSignature: [4, 4], tempo: 100,
    instrumentId: 'guitar-standard', capo: 0, strumPatternId: 'folk',
    sections: [{ id: 's1', name: 'Verse', repeat: 1, bars: [{ id: 'b1', chords: [{ symbol: 'G', beats: 4, voicingId: null }] }] }],
    form: [], createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
  }],
};

describe('schema v2 & migration', () => {
  test('current schema version is 2', () => eq(SCHEMA_VERSION, 2));
  test('v1 backup imports with v2 defaults', () => {
    const r = parseImport(JSON.stringify(V1_BACKUP));
    eq(r.kind, 'backup');
    eq(r.songs.length, 1);
    const s = r.songs[0];
    eq([s.schemaVersion, s.groove, s.voicingPrefs, s.title], [2, 'none', null, 'Old song']);
    eq(r.settings.theme, 'dark');
    eq(r.settings.favorites, ['jazz-ii-v-i-major']);
    eq(r.settings.voicing.style, 'any');
    eq(r.settings.mix, { chords: 80, bass: 70, drums: 60, click: 70 });
    eq(r.settings.metronomeSubdivision, 1);
    eq([r.setlists, r.practiceLog, r.flashcards], [[], [], {}]);
  });
  test('migrate stamps the current version and rejects newer files', () => {
    eq(migrate({ schemaVersion: 1 }).schemaVersion, 2);
    let msg = ''; try { migrate({ schemaVersion: 99 }); } catch (e) { msg = e.message; }
    ok(/newer version/.test(msg));
  });
  test('song: lyric, groove and voicing prefs are sanitised', () => {
    const { song } = sanitizeSong({ title: 'x', groove: 'bad groove!', voicingPrefs: { minFret: 50, maxFret: 1, style: 'nope', maxStretch: 99 },
      sections: [{ bars: [{ chords: [{ symbol: 'C', beats: 4 }], lyric: 'Hello\nworld' + 'x'.repeat(600) }, { chords: [], lyric: '   ' }] }] });
    eq(song.groove, 'none');
    eq(song.voicingPrefs, { minFret: 20, maxFret: 23, preferOpen: true, style: 'any', avoidBarre: false, maxStretch: 5 });
    eq(song.sections[0].bars[0].lyric.length, 500);
    ok(!song.sections[0].bars[0].lyric.includes('\n'));
    ok(!('lyric' in song.sections[0].bars[1]), 'blank lyric dropped');
    eq(sanitizeSong({ sections: [], groove: 'jazz-swing' }).song.groove, 'jazz-swing');
  });
  test('settings: patterns, voicing, mix, subdivision', () => {
    const st = sanitizeSettings({
      customPatterns: [{ name: 'Mine', perBeat: 2, slots: 'D . D U', meter: [4, 4] }, { slots: 'D X' }, 'junk'],
      voicing: { style: 'drop2', avoidBarre: 1 }, mix: { bass: 500, drums: -3 }, metronomeSubdivision: 3,
    });
    eq(st.customPatterns.length, 1);
    ok(st.customPatterns[0].id.startsWith('custom-') && st.customPatterns[0].custom);
    eq([st.voicing.style, st.voicing.avoidBarre], ['drop2', true]);
    eq(st.mix, { chords: 80, bass: 100, drums: 0, click: 70 });
    eq(st.metronomeSubdivision, 3);
    eq(sanitizePattern({ slots: '' }), null);
    eq(sanitizeVoicingPrefs(null).maxFret, 15);
  });
  test('setlists and practice entries', () => {
    const l = sanitizeSetlist({ name: '  Gig  ', songIds: ['a', 'b', 'a', 3] });
    eq([l.name, l.songIds], ['Gig', ['a', 'b']]);
    eq(sanitizePracticeEntry({ kind: 'nope', date: '2026-01-01T00:00:00Z' }), null);
    eq(sanitizePracticeEntry({ kind: 'drill', date: 'not a date' }), null);
    const e = sanitizePracticeEntry({ kind: 'drill', date: '2026-01-01T00:00:00.000Z', seconds: 60, score: 42.4, ref: 'C|G' });
    eq([e.seconds, e.score, e.ref], [60, 42, 'C|G']);
  });
  test('practice log is capped and old entries folded into totals', () => {
    const n = PRACTICE_LOG_LIMIT + 3;
    const log = Array.from({ length: n }, (_, i) => ({ id: `e${i}`, kind: 'practice', ref: i < 3 ? 'old-song' : 'x', date: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(), seconds: 10 }));
    const r = capPracticeLog(log, defaultPracticeTotals());
    eq(r.practiceLog.length, PRACTICE_LOG_LIMIT);
    eq(r.practiceLog[0].id, 'e3');
    eq([r.practiceTotals.seconds, r.practiceTotals.entries, r.practiceTotals.byRef['old-song']], [30, 3, 30]);
  });
  test('v2 backup round-trip keeps setlists, log and flashcards', () => {
    const song = newSong({ title: 'A' });
    const state = sanitizeState({
      songs: [song], settings: {},
      setlists: [{ id: 'L1', name: 'Gig', songIds: [song.id] }],
      practiceLog: [{ id: 'p1', kind: 'practice', ref: song.id, date: '2026-10-01T10:00:00.000Z', seconds: 300, tempoStart: 80, tempoEnd: 96 }],
      flashcards: { 'guitar-standard|C': { box: 3, due: '2026-10-12T00:00:00.000Z' } },
    });
    const back = parseImport(JSON.stringify(buildBackup(state)));
    eq(back.setlists, state.setlists);
    eq(back.practiceLog, state.practiceLog);
    eq(back.flashcards, state.flashcards);
    eq(back.songs, [song]);
  });
  test('merge helpers', () => {
    const a = { id: 'L', name: 'old', songIds: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const b = { ...a, name: 'new', updatedAt: '2026-02-01T00:00:00.000Z' };
    eq(mergeSetlists([a], [b])[0].name, 'new');
    eq(mergeSetlists([b], [a])[0].name, 'new');
    const e1 = { id: '1', kind: 'quiz', ref: '', date: '2026-01-01T00:00:00.000Z', seconds: 1 };
    const e2 = { ...e1, id: '2', date: '2026-01-02T00:00:00.000Z' };
    eq(mergePracticeLog([e1], [e1, e2], defaultPracticeTotals()).practiceLog.map((e) => e.id), ['1', '2']);
    eq(mergeFlashcards({ k: { box: 2, due: 'x' } }, { k: { box: 4, due: 'y' }, j: { box: 1, due: 'z' } }), { k: { box: 4, due: 'y' }, j: { box: 1, due: 'z' } });
  });
});
