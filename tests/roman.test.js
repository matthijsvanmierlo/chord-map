import { describe, test, eq } from './harness.js';
import { romanToChord, chordToRoman, parseBarText, barsToText, splitEvenly } from '../js/music/roman.js';

describe('roman numerals', () => {
  test('diatonic', () => {
    eq(['ii7', 'V7', 'Imaj7'].map((r) => romanToChord(r, 'C')), ['Dm7', 'G7', 'Cmaj7']);
    eq(['I', 'IV', 'V', 'vi'].map((r) => romanToChord(r, 'G')), ['G', 'C', 'D', 'Em']);
    eq(romanToChord('vii°', 'C'), 'Bdim');
    eq(romanToChord('iiø7', 'A'), 'Bm7b5');
    eq(romanToChord('#iv°7', 'C'), 'F#dim7');
  });
  test('borrowed & minor', () => {
    eq(['i', 'bVI', 'bIII', 'bVII'].map((r) => romanToChord(r, 'A')), ['Am', 'F', 'C', 'G']);
    eq(['i', 'bVII', 'bVI', 'V'].map((r) => romanToChord(r, 'E')), ['Em', 'D', 'C', 'B']);
    eq(romanToChord('bII7', 'C'), 'Db7');
    eq(romanToChord('bVII', 'F'), 'Eb');
  });
  test('secondary & slash', () => {
    eq(romanToChord('V7/V', 'C'), 'D7');
    eq(romanToChord('V7/ii', 'F'), 'D7');
    eq(romanToChord('V7/vi', 'F'), 'A7');
    eq(romanToChord('viiø7/V', 'C'), 'F#m7b5');
    eq(romanToChord('I/3', 'C'), 'C/E');
    eq(romanToChord('i/b7', 'A'), 'Am/G');
    eq(romanToChord('V+', 'C'), 'Gaug');
    eq(romanToChord('foo', 'C'), null);
  });
  test('chord → roman', () => {
    eq(chordToRoman('Dm7', 'C'), 'ii7');
    eq(chordToRoman('Bm7b5', 'C'), 'viiø7');
    eq(chordToRoman('Bb', 'C'), 'bVII');
    eq(chordToRoman('C/E', 'C'), 'I/3');
    eq(chordToRoman('F#dim7', 'C'), '#iv°7');
    eq(chordToRoman('Ab', 'C'), 'bVI');
  });
  test('round trip all keys', () => {
    for (const k of ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']) {
      for (const r of ['I', 'ii7', 'iii', 'IV', 'V7', 'vi', 'viiø7', 'bVII', 'bIII', 'bVI', 'iv']) {
        const sym = romanToChord(r, k);
        eq(romanToChord(chordToRoman(sym, k), k), sym, `${r} in ${k}:`);
        if (!['Db', 'Gb'].includes(k)) eq(chordToRoman(sym, k), r, `${r} in ${k}:`);
      }
    }
  });
  test('bar grammar', () => {
    eq(splitEvenly(4, 3), [2, 1, 1]);
    const { bars, errors } = parseBarText('Dm7 G7 | Cmaj7 | % | Am . . D7 | N.C.', { beatsPerBar: 4 });
    eq(errors, []);
    eq(bars.map((b) => b.chords.map((c) => `${c.symbol}:${c.beats}`)), [['Dm7:2', 'G7:2'], ['Cmaj7:4'], ['Cmaj7:4'], ['Am:3', 'D7:1'], ['N.C.:4']]);
    eq(barsToText(bars, { beatsPerBar: 4 }), 'Dm7 G7 | Cmaj7 | Cmaj7 | Am . . D7 | N.C.');
    const r = parseBarText('ii7 V7 | I', { roman: true, keyTonic: 'Bb' });
    eq(r.bars[0].chords[0].symbol, 'Cm7');
    eq(parseBarText('Cx | G', {}).errors.length, 1);
  });
});
