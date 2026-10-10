import { describe, test, eq, ok } from './harness.js';
import { parseChord, prettyChord, transposeChord } from '../js/music/chordParser.js';

const notes = (s) => parseChord(s).tones.map((t) => t.name);

describe('chord parser', () => {
  test('triads', () => {
    eq(notes('C'), ['C', 'E', 'G']);
    eq(notes('Am'), ['A', 'C', 'E']);
    eq(notes('Bdim'), ['B', 'D', 'F']);
    eq(notes('Caug'), ['C', 'E', 'G#']);
    eq(notes('C+'), ['C', 'E', 'G#']);
    eq(notes('Dsus4'), ['D', 'G', 'A']);
    eq(notes('Dsus2'), ['D', 'E', 'A']);
    eq(notes('E5'), ['E', 'B']);
  });
  test('sevenths', () => {
    eq(notes('G7'), ['G', 'B', 'D', 'F']);
    eq(notes('Cmaj7'), ['C', 'E', 'G', 'B']);
    eq(notes('CΔ7'), ['C', 'E', 'G', 'B']);
    eq(notes('CM7'), ['C', 'E', 'G', 'B']);
    eq(notes('Dm7'), ['D', 'F', 'A', 'C']);
    eq(notes('D-7'), ['D', 'F', 'A', 'C']);
    eq(notes('Bm7b5'), ['B', 'D', 'F', 'A']);
    eq(notes('Bø'), ['B', 'D', 'F', 'A']);
    eq(notes('Bdim7'), ['B', 'D', 'F', 'Ab']);
    eq(notes('B°7'), ['B', 'D', 'F', 'Ab']);
    eq(notes('CmMaj7'), ['C', 'Eb', 'G', 'B']);
    eq(notes('Cm(maj7)'), ['C', 'Eb', 'G', 'B']);
    eq(notes('G7sus4'), ['G', 'C', 'D', 'F']);
    eq(notes('Bbm7b5'), ['Bb', 'Db', 'Fb', 'Ab']);
  });
  test('sixths, adds, extensions', () => {
    eq(notes('C6'), ['C', 'E', 'G', 'A']);
    eq(notes('Am6'), ['A', 'C', 'E', 'F#']);
    eq(notes('C6/9'), ['C', 'E', 'G', 'A', 'D']);
    eq(notes('C69'), ['C', 'E', 'G', 'A', 'D']);
    eq(notes('Cadd9'), ['C', 'E', 'G', 'D']);
    eq(notes('G9'), ['G', 'B', 'D', 'F', 'A']);
    eq(notes('Fmaj9'), ['F', 'A', 'C', 'E', 'G']);
    eq(notes('Dm9'), ['D', 'F', 'A', 'C', 'E']);
    eq(notes('G13'), ['G', 'B', 'D', 'F', 'A', 'E']);
    eq(notes('Am11'), ['A', 'C', 'E', 'G', 'B', 'D']);
  });
  test('alterations', () => {
    eq(notes('G7b9'), ['G', 'B', 'D', 'F', 'Ab']);
    eq(notes('E7#9'), ['E', 'G#', 'B', 'D', 'F##'].map((n) => (n === 'F##' ? 'G' : n)));
    eq(notes('C7#5'), ['C', 'E', 'G#', 'Bb']);
    eq(notes('C7b5'), ['C', 'E', 'Gb', 'Bb']);
    eq(notes('F7#11'), ['F', 'A', 'C', 'Eb', 'B']);
    eq(notes('G7alt'), ['G', 'B', 'F', 'Ab', 'A#', 'Eb']);
    eq(notes('C9#11'), ['C', 'E', 'G', 'Bb', 'D', 'F#']);
    eq(notes('A13b9'), ['A', 'C#', 'E', 'G', 'Bb', 'F#']);
  });
  test('slash chords & N.C.', () => {
    const c = parseChord('C/E');
    eq([c.root, c.bass, c.bassPc], ['C', 'E', 4]);
    eq(parseChord('D/F#').bass, 'F#');
    eq(notes('C6/9'), ['C', 'E', 'G', 'A', 'D']);
    ok(parseChord('N.C.').nc);
  });
  test('invalid symbols return null', () => {
    eq(parseChord('H7'), null);
    eq(parseChord('Cfoo'), null);
    eq(parseChord(''), null);
  });
  test('pretty & transpose', () => {
    eq(prettyChord('Bbm7b5'), 'B♭m7♭5');
    eq(prettyChord('F#7#9'), 'F♯7♯9');
    eq(transposeChord('Dm7', [4, 5]), 'Gm7');
    eq(transposeChord('C/E', [2, 2]), 'D/F#');
  });
});
