import { describe, test, eq, ok } from './harness.js';
import { toChordPro, fromChordPro } from '../js/export/chordpro.js';
import { toMusicXML } from '../js/export/musicxml.js';
import { newSong } from '../js/state/schema.js';
import { presetToSong } from '../js/music/song.js';
import { PRESETS } from '../js/data/presets/index.js';
import { getTuning } from '../js/music/tunings.js';

const song = newSong({ title: 'Test & Song', artist: 'Me', key: { tonic: 'F', mode: 'major' }, tempo: 100,
  sections: [{ name: 'Verse', repeat: 2, bars: [{ chords: [{ symbol: 'Gm7', beats: 2 }, { symbol: 'C7', beats: 2 }] }, { chords: [{ symbol: 'Fmaj7', beats: 3 }, { symbol: 'D7b9', beats: 1 }] }] },
    { name: 'Chorus', repeat: 1, bars: [{ chords: [{ symbol: 'Bb/D', beats: 4 }] }, { chords: [{ symbol: 'N.C.', beats: 4 }] }] }] });

const chordsOf = (s) => s.sections.map((x) => x.bars.map((b) => b.chords.map((c) => `${c.symbol}:${c.beats}`)));

describe('exports', () => {
  test('ChordPro round-trip', () => {
    const text = toChordPro(song);
    ok(text.includes('{title: Test & Song}'));
    const { song: back, errors } = fromChordPro(text);
    eq(errors, []);
    eq(back.title, 'Test & Song'); eq(back.key, { tonic: 'F', mode: 'major' }); eq(back.tempo, 100);
    eq(chordsOf(back), chordsOf(song));
    eq(back.sections.map((s) => [s.name, s.repeat]), [['Verse', 2], ['Chorus', 1]]);
  });
  test('ChordPro inline lyrics import', () => {
    const { song: s } = fromChordPro('{t: Hi}\n[G]Hello there [C]friend\n[D]bye');
    eq(chordsOf(s), [[['G:4'], ['C:4'], ['D:4']]]);
  });
  test('MusicXML is well-formed and complete', () => {
    for (const t of ['guitar-standard', 'ukulele-standard']) {
      const xml = toMusicXML(song, getTuning(t));
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      ok(!doc.querySelector('parsererror'), 'parse error');
      eq(doc.querySelectorAll('measure').length, 4);
      eq(doc.querySelectorAll('harmony').length, 6);
      ok(doc.querySelector('repeat[direction="backward"][times="2"]'));
      // each measure's staff-1 durations sum to the bar
      doc.querySelectorAll('measure').forEach((m) => {
        let sum = 0;
        m.querySelectorAll('note').forEach((n) => { if (n.querySelector('staff').textContent === '1' && !n.querySelector('chord')) sum += Number(n.querySelector('duration').textContent); });
        eq(sum, 16, `measure ${m.getAttribute('number')}`);
      });
    }
  });
  test('MusicXML for every preset parses', () => {
    for (const p of PRESETS) {
      const xml = toMusicXML(presetToSong(p), getTuning('guitar-standard'));
      ok(!new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror'), p.id);
    }
  });
});
