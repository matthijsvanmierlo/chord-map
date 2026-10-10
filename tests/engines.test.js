import { describe, test, eq, ok } from './harness.js';
import { getVoicings, getVoicingsInfo } from '../js/music/voicingEngine.js';
import { classifyVoicing, isDefaultPrefs } from '../js/music/voicingPrefs.js';
import { defaultVoicingPrefs, newSong } from '../js/state/schema.js';
import { getTuning } from '../js/music/tunings.js';
import { parseChord } from '../js/music/chordParser.js';
import { suggestCapo, shapeName } from '../js/music/capo.js';
import { reharmSuggestions } from '../js/music/reharm.js';
import { scalesForChord, scaleOn } from '../js/music/scales.js';

const G = getTuning('guitar-standard');
const prefs = (p) => ({ ...defaultVoicingPrefs(), ...p });
const songOf = (key, bars) => newSong({ key, sections: [{ name: 'A', bars: bars.map((b) => ({ chords: b.map(([symbol, beats]) => ({ symbol, beats })) })) }] });

describe('voicing preferences', () => {
  test('defaults are a no-op', () => {
    ok(isDefaultPrefs(defaultVoicingPrefs()));
    eq(getVoicings('Am7', G, { prefs: defaultVoicingPrefs() }).map((v) => v.id), getVoicings('Am7', G, { prefs: null }).map((v) => v.id));
  });
  test('default top shapes stay full (≥4 strings) for common chords', () => {
    for (const s of ['C', 'G', 'D', 'Am', 'Em', 'F', 'Bm', 'A7', 'Dm7', 'Cmaj7', 'G7', 'E7', 'Bb', 'F#m']) {
      ok(getVoicings(s, G, { prefs: null })[0].frets.filter((f) => f >= 0).length >= 4, `${s} top shape too thin`);
    }
  });
  test('fret range and no open strings', () => {
    const list = getVoicings('C', G, { prefs: prefs({ minFret: 5, maxFret: 10 }) });
    ok(list.length > 0);
    ok(list.every((v) => !v.frets.includes(0) && v.frets.filter((f) => f > 0).every((f) => f >= 5 && f <= 10)), 'out of range');
  });
  test('avoid barre & max stretch', () => {
    ok(getVoicings('F', G, { prefs: prefs({ avoidBarre: true }) }).every((v) => !v.barre));
    ok(getVoicings('Cmaj7', G, { prefs: prefs({ maxStretch: 3 }) }).every((v) => { const f = v.frets.filter((x) => x > 0); return !f.length || Math.max(...f) - Math.min(...f) <= 2; }));
  });
  test('style filters produce correctly classified shapes', () => {
    for (const [style, tag, sym] of [['drop2', 'drop2', 'Cmaj7'], ['drop3', 'drop3', 'G7'], ['shell', 'shell', 'Dm7'], ['triads', 'triad', 'A']]) {
      const list = getVoicings(sym, G, { prefs: prefs({ style }) });
      ok(list.length > 0, `${style}: none for ${sym}`);
      ok(list.every((v) => classifyVoicing(v, parseChord(sym), G).has(tag)), `${style}: misclassified ${sym}`);
    }
  });
  test('classifier on textbook shapes', () => {
    const c = (sym, frets) => classifyVoicing({ frets }, parseChord(sym), G);
    ok(c('Cmaj7', [-1, 3, 5, 4, 5, -1]).has('drop2'), 'x3545x drop2');
    ok(c('G7', [3, -1, 3, 4, 3, -1]).has('drop3'), '3x343x drop3');
    ok(c('G7', [3, -1, 3, 4, -1, -1]).has('shell'), '3x34xx shell');
    ok(!c('C', [-1, 3, 2, 0, 1, 0]).has('shell'));
  });
  test('impossible prefs relax instead of returning nothing', () => {
    const r = getVoicingsInfo('C13', getTuning('ukulele-standard'), { prefs: prefs({ style: 'drop3' }) });
    ok(r.relaxed && r.list.length > 0);
  });
});

describe('capo helper', () => {
  test('Ab major → capo 1 with G-family shapes', () => {
    const r = suggestCapo(songOf({ tonic: 'Ab', mode: 'major' }, [[['Ab', 4]], [['Db', 4]], [['Eb', 4]], [['Fm', 4]]]), G);
    eq(r[0].capo, 1);
    eq(r[0].shapes.map((s) => s.shape), ['G', 'C', 'D', 'Em']);
    eq(r[0].shapeKey, 'G');
  });
  test('open keys stay at capo 0', () => {
    eq(suggestCapo(songOf({ tonic: 'G', mode: 'major' }, [[['G', 4]], [['C', 4]], [['D', 4]]]), G)[0].capo, 0);
  });
  test('Bb minor → a capo that gives Am/Em shapes', () => {
    const r = suggestCapo(songOf({ tonic: 'Bb', mode: 'minor' }, [[['Bbm', 4]], [['Ebm', 4]], [['F7', 4]]]), G);
    ok([1, 6].includes(r[0].capo), `capo ${r[0].capo}`);
  });
  test('shape names', () => { eq(shapeName('F#m7', 2), 'Em7'); eq(shapeName('C/E', 3), 'A/C#'); });
});

describe('reharmonisation', () => {
  const ii_v_i = songOf({ tonic: 'C', mode: 'major' }, [[['Dm7', 4]], [['G7', 4]], [['C', 4]]]);
  const at = (song, bar, ci = 0) => reharmSuggestions(song, song.sections[0].id, song.sections[0].bars[bar].id, ci);
  const byId = (list, id) => list.find((s) => s.id === id);
  test('tritone sub of G7 → C is Db7', () => eq(byId(at(ii_v_i, 1), 'tritone').chords, [['Db7', 4]]));
  test('backdoor into C', () => eq(byId(at(ii_v_i, 1), 'backdoor').chords, [['Fm7', 2], ['Bb7', 2]]));
  test('ii–V not offered when the ii is already there', () => ok(!byId(at(ii_v_i, 1), 'ii-v')));
  test('ii–V inserted before a bare V', () => {
    const s = songOf({ tonic: 'F', mode: 'major' }, [[['F', 4]], [['C7', 4]], [['F', 4]]]);
    eq(byId(at(s, 1), 'ii-v').chords, [['Gm7', 2], ['C7', 2]]);
  });
  test('minor target gets a half-diminished ii', () => {
    const s = songOf({ tonic: 'A', mode: 'minor' }, [[['Am', 4]], [['E7', 4]], [['Am', 4]]]);
    eq(byId(at(s, 1), 'ii-v').chords, [['Bm7b5', 2], ['E7', 2]]);
  });
  test('secondary dominant & passing diminished', () => {
    const s = songOf({ tonic: 'C', mode: 'major' }, [[['C', 4]], [['Dm', 4]]]);
    const list = at(s, 0);
    eq(byId(list, 'secondary').chords, [['A7', 4]]);
    eq(byId(list, 'passing-dim').chords, [['C', 2], ['C#dim7', 2]]);
  });
  test('no secondary-dominant suggestion when the chord already is V7 of the next', () => {
    const s = songOf({ tonic: 'C', mode: 'major' }, [[['A7', 4]], [['Dm', 4]]]);
    ok(!byId(at(s, 0), 'secondary'));
  });
  test('IV gets minor iv and ii substitutes; colours offered', () => {
    const s = songOf({ tonic: 'G', mode: 'major' }, [[['C', 4]], [['G', 4]]]);
    const list = at(s, 0);
    eq(byId(list, 'minor-iv').chords, [['Cm', 4]]);
    eq(byId(list, 'relative-ii').chords, [['Am7', 4]]);
    ok(byId(list, 'colour-maj7'));
  });
  test('apply returns a new song and leaves the original untouched', () => {
    const sug = byId(at(ii_v_i, 1), 'backdoor');
    const out = sug.apply(ii_v_i);
    eq(out.sections[0].bars[1].chords.map((c) => c.symbol), ['Fm7', 'Bb7']);
    eq(ii_v_i.sections[0].bars[1].chords.map((c) => c.symbol), ['G7']);
  });
  test('every suggestion parses and keeps the beat count', () => {
    const s = songOf({ tonic: 'D', mode: 'major' }, [[['D', 4]], [['Bm', 2], ['G', 2]], [['A7', 4]], [['D', 4]]]);
    s.sections[0].bars.forEach((bar, bi) => bar.chords.forEach((c, ci) => {
      for (const sug of reharmSuggestions(s, s.sections[0].id, bar.id, ci)) {
        ok(sug.chords.every(([sym]) => parseChord(sym)), `${sug.id} bad chord`);
        eq(sug.chords.reduce((t, [, b]) => t + b, 0), c.beats, `${sug.id} beats`);
      }
    }));
  });
});

describe('scales', () => {
  const first = (sym, key, style) => scalesForChord(sym, key, style)[0].id;
  const C = { tonic: 'C', mode: 'major' };
  test('chord–scale choices', () => {
    eq(first('Dm7', C), 'dorian');
    eq(first('G7', C), 'mixolydian');
    eq(first('G7', C, 'blues'), 'blues');
    eq(first('Em7', C), 'phrygian');
    eq(first('Am7', C), 'aeolian');
    eq(first('Fmaj7', C), 'lydian');
    eq(first('Bm7b5', C), 'locrianNat2');
    eq(first('G7alt', C), 'altered');
    eq(first('G7b9', C), 'halfWhole');
    eq(first('Bdim7', C), 'wholeHalf');
    eq(first('Db7', C), 'lydianDominant');
  });
  test('spelling', () => {
    eq(scaleOn('Bb', 'mixolydian').notes, ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'Ab']);
    eq(scaleOn('A', 'blues').notes, ['A', 'C', 'D', 'Eb', 'E', 'G']);
    eq(scaleOn('G', 'altered').notes, ['G', 'Ab', 'A#', 'B', 'Db', 'Eb', 'F']);
    eq(scaleOn('E', 'minorPentatonic').pcs, [4, 7, 9, 11, 2]);
  });
});
