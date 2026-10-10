import { describe, test, eq, ok } from './harness.js';
import { sanitizeSong, sanitizeState, newSong, SCHEMA_VERSION } from '../js/state/schema.js';
import { buildBackup, parseImport, mergeSongs, previewMerge } from '../js/export/backup.js';
import { transposeSong, timeline } from '../js/music/song.js';

describe('schema & backup', () => {
  test('sanitize clamps and fills defaults', () => {
    const { song } = sanitizeSong({ title: 'x', tempo: 9999, timeSignature: [3, 5], key: { tonic: 'Q' }, sections: [{ bars: [{ chords: [{ symbol: 'Am', beats: 99 }] }] }] });
    eq(song.tempo, 400); eq(song.timeSignature, [3, 4]); eq(song.key.tonic, 'C'); eq(song.sections[0].bars[0].chords[0].beats, 32);
    ok(song.id && song.sections[0].id && song.sections[0].bars[0].id);
  });
  test('rejects non-songs', () => {
    let threw = false; try { sanitizeSong('hi'); } catch { threw = true; } ok(threw);
  });
  test('backup round-trip is lossless', () => {
    const s1 = newSong({ title: 'One' }), s2 = newSong({ title: 'Two', tags: ['a'] });
    const state = sanitizeState({ songs: [s1, s2], settings: { theme: 'dark', favorites: ['x'] } });
    const text = JSON.stringify(buildBackup({ ...state, meta: state.meta }));
    const back = parseImport(text);
    eq(back.kind, 'backup'); eq(back.songs, [s1, s2]); eq(back.settings.theme, 'dark'); eq(back.settings.favorites, ['x']);
  });
  test('import errors', () => {
    let msg = ''; try { parseImport('{nope'); } catch (e) { msg = e.message; } ok(/JSON/.test(msg));
    msg = ''; try { parseImport(JSON.stringify({ app: 'other', songs: [] })); } catch (e) { msg = e.message; } ok(/different app/.test(msg));
    msg = ''; try { parseImport(JSON.stringify({ schemaVersion: SCHEMA_VERSION + 5, songs: [] })); } catch (e) { msg = e.message; } ok(/newer/.test(msg));
  });
  test('merge strategies', () => {
    const a = newSong({ title: 'A', updatedAt: '2024-01-01T00:00:00.000Z' });
    const a2 = { ...a, title: 'A newer', updatedAt: '2025-01-01T00:00:00.000Z' };
    eq(previewMerge([a], [a2]).newer, 1);
    eq(mergeSongs([a], [a2], 'newest')[0].title, 'A newer');
    eq(mergeSongs([a], [a2], 'both').length, 2);
  });
  test('transpose & timeline', () => {
    const s = newSong({ key: { tonic: 'C', mode: 'major' }, sections: [{ name: 'V', repeat: 2, bars: [{ chords: [{ symbol: 'Dm7', beats: 2 }, { symbol: 'G7', beats: 2 }] }] }] });
    const t = transposeSong(s, 'Eb');
    eq(t.sections[0].bars[0].chords.map((c) => c.symbol), ['Fm7', 'Bb7']);
    const tl = timeline(s);
    eq(tl.events.length, 4); eq(tl.totalBeats, 8); eq(tl.events[3].start, 6);
  });
});
