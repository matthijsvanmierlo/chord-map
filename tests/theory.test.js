import { describe, test, eq } from './harness.js';
import { transposeNote, scaleNotes, keySignatureCount, relativeMajor, vexKeySignature, midiOf, spellMidi, intervalBetween } from '../js/music/theory.js';

describe('theory', () => {
  test('transpose keeps letter spelling', () => {
    eq(transposeNote('C', [3, 3]), 'Eb');
    eq(transposeNote('Bb', [3, 4]), 'D');
    eq(transposeNote('F#', [7, 11]), 'E#');
    eq(transposeNote('E', [-3, -4]), 'C');
    eq(transposeNote('A', [-6, -9]), 'C');
  });
  test('scales', () => {
    eq(scaleNotes('F', 'major'), ['F', 'G', 'A', 'Bb', 'C', 'D', 'E']);
    eq(scaleNotes('E', 'minor'), ['E', 'F#', 'G', 'A', 'B', 'C', 'D']);
    eq(scaleNotes('D', 'dorian'), ['D', 'E', 'F', 'G', 'A', 'B', 'C']);
    eq(scaleNotes('Db', 'major'), ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C']);
  });
  test('key signatures', () => {
    eq(keySignatureCount('A', 'major'), 3);
    eq(keySignatureCount('C', 'minor'), -3);
    eq(relativeMajor('A', 'minor'), 'C');
    eq(relativeMajor('E', 'phrygian'), 'C');
    eq(vexKeySignature('D', 'mixolydian'), 'G');
    eq(vexKeySignature('G#', 'major'), 'Ab');
  });
  test('midi', () => {
    eq(midiOf('E2'), 40); eq(midiOf('A4'), 69); eq(midiOf('Cb4'), 59);
    eq(spellMidi(60, 'B#').octave, 3);
    eq(spellMidi(59, 'Cb').octave, 4);
    eq(intervalBetween('C', 'Eb'), [3, 3]);
  });
});
