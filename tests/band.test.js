import { describe, test, eq, ok } from './harness.js';
import { GROOVES, arrangeBand, defaultGrooveFor, getGroove } from '../js/data/grooves.js';
import { newSong } from '../js/state/schema.js';
import { presetToSong, timeline } from '../js/music/song.js';
import { PRESETS } from '../js/data/presets/index.js';
import { parseChord } from '../js/music/chordParser.js';
import { mod12 } from '../js/music/theory.js';
import { toMidi } from '../js/export/midi.js';
import { getTuning } from '../js/music/tunings.js';
import { setCustomPatterns, getPattern, patternSteps, allPatterns } from '../js/data/strumPatterns.js';
import { sanitizePattern } from '../js/state/schema.js';
import { createTapTempo } from '../js/ui/tapTempo.js';

const song = (groove, bars, ts = [4, 4], extra = {}) => newSong({ groove, timeSignature: ts, ...extra,
  sections: [{ name: 'A', bars: bars.map((b) => ({ chords: b.map(([symbol, beats]) => ({ symbol, beats })) })) }] });
const count = (list, drum, from, to) => list.filter((d) => d.drum === drum && d.start >= from && d.start < to).length;

describe('grooves', () => {
  test('drum patterns match their meter', () => {
    for (const g of GROOVES.filter((x) => x.drums)) {
      for (const [drum, steps] of Object.entries(g.drums)) eq(steps.length, g.meter[0] * g.perBeat, `${g.id}.${drum}:`);
    }
  });
  test('rock bar: 3 kicks, 2 snares, 8 hats', () => {
    const { drums } = arrangeBand(song('rock', [[['E5', 4]], [['A5', 4]]]));
    eq([count(drums, 'kick', 0, 4), count(drums, 'snare', 0, 4), count(drums, 'hat', 0, 4)], [3, 2, 8]);
    eq(count(drums, 'hat', 4, 8), 8);
  });
  test('swing pushes off-beats to the triplet', () => {
    const { drums } = arrangeBand(song('swing', [[['Dm7', 4]]]));
    const ride = drums.filter((d) => d.drum === 'ride').map((d) => +d.start.toFixed(3));
    eq(ride, [0, 1, 1.667, 2, 3, 3.667]);
  });
  test('walking bass: one note per beat, starts on the root, approaches the next root by a half step', () => {
    const s = song('swing', [[['Dm7', 4]], [['G7', 4]], [['Cmaj7', 4]], [['A7', 4]]]);
    const { bass } = arrangeBand(s);
    eq(bass.length, 16);
    const roots = ['D', 'G', 'C', 'A'].map((n) => parseChord(n).rootPc);
    for (let bar = 0; bar < 4; bar++) {
      eq(mod12(bass[bar * 4].midi), roots[bar], `bar ${bar + 1} root:`);
      if (bar < 3) {
        const approach = bass[bar * 4 + 3].midi;
        const next = bass[(bar + 1) * 4].midi;
        ok(Math.min(...[-12, 0, 12].map((o) => Math.abs(approach - (next + o)))) === 1, `bar ${bar + 1} approach ${approach}→${next}`);
      }
    }
    ok(bass.every((n) => n.midi >= 23 && n.midi <= 48), 'bass out of range');
  });
  test('slash chords put the bass note in the bass', () => {
    const { bass } = arrangeBand(song('ballad', [[['C/E', 4]]]));
    eq(mod12(bass[0].midi), 4);
  });
  test('N.C. bars are silent for the bass', () => {
    const { bass } = arrangeBand(song('pop', [[['N.C.', 4]], [['C', 4]]]));
    ok(bass.every((n) => n.start >= 4));
  });
  test('meter mismatch falls back to a generic groove', () => {
    const { drums, groove } = arrangeBand(song('rock', [[['Am', 5]]], [5, 4]));
    eq(count(drums, 'hat', 0, 5), 5);
    eq(groove.perBeat, 1);
  });
  test('defaults per style / pattern / meter', () => {
    eq(defaultGrooveFor('jazz', 'jazz-four', [4, 4]), 'swing');
    eq(defaultGrooveFor('blues', 'shuffle', [12, 8]), 'twelve-eight');
    eq(defaultGrooveFor('folk', 'waltz', [3, 4]), 'waltz');
    eq(defaultGrooveFor('soul', 'reggae', [4, 4]), 'reggae');
    eq(defaultGrooveFor('classical', 'arpeggio', [4, 4]), 'none');
    eq(getGroove('nope').id, 'none');
  });
  test('every preset arranges inside its own length', () => {
    for (const p of PRESETS) {
      const s = presetToSong(p);
      ok(GROOVES.some((g) => g.id === s.groove), `${p.id} groove ${s.groove}`);
      const total = timeline(s).totalBeats;
      const { bass, drums } = arrangeBand(s);
      ok([...bass, ...drums].every((n) => n.start >= 0 && n.start < total), `${p.id} out of range`);
      if (s.groove !== 'none') ok(drums.length > 0 && bass.length > 0, `${p.id} silent band`);
    }
  });
  test('MIDI export includes bass and drum tracks', () => {
    const s = song('rock', [[['E5', 4]], [['A5', 4]]]);
    const bytes = toMidi(s, getTuning('guitar-standard'));
    eq((bytes[10] << 8) | bytes[11], 4);
    eq(toMidi(s, getTuning('guitar-standard'), { band: false })[11], 2);
  });
});

describe('custom strum patterns & tap tempo', () => {
  test('custom patterns register and expand', () => {
    const p = sanitizePattern({ id: 'custom-test', name: 'Test', meter: [3, 4], perBeat: 2, slots: 'B . D U D U' });
    setCustomPatterns([p]);
    eq(getPattern('custom-test').name, 'Test');
    ok(allPatterns().some((x) => x.id === 'custom-test'));
    eq(patternSteps(getPattern('custom-test'), [3, 4]).steps, ['B', '.', 'D', 'U', 'D', 'U']);
    eq(patternSteps(getPattern('custom-test'), [4, 4]).steps.length, 4); // wrong meter → quarters
    setCustomPatterns([]);
    eq(getPattern('custom-test').id, 'quarters');
  });
  test('tap tempo averages and resets after a pause', () => {
    const t = createTapTempo();
    eq(t.tap(0), null);
    eq(t.tap(500), 120);
    eq(t.tap(1000), 120);
    eq(t.tap(1600), Math.round(60000 / (1600 / 3)));
    eq(t.tap(5000), null);
  });
});
