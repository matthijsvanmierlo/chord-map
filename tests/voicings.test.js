import { describe, test, eq, ok } from './harness.js';
import { getVoicings } from '../js/music/voicingEngine.js';
import { CURATED } from '../js/music/voicingLibrary.js';
import { BUILTIN_TUNINGS, getTuning, tuningMidi, instrumentOf } from '../js/music/tunings.js';
import { parseChord } from '../js/music/chordParser.js';
import { mod12 } from '../js/music/theory.js';

function contains(v, chord, tuning) {
  const m = tuningMidi(tuning);
  const played = v.frets.map((f, i) => (f >= 0 ? m[i] + f : null)).filter((x) => x !== null);
  const pcs = new Set(played.map(mod12));
  const req = chord.tones.filter((t) => !t.optional).map((t) => t.pc);
  return { allReq: req.every((p) => pcs.has(p)), onlyChord: [...pcs].every((p) => chord.pcs.includes(p)), lowest: mod12(Math.min(...played)) };
}

describe('voicings', () => {
  test('curated shapes are correct', () => {
    for (const [tid, list] of Object.entries(CURATED)) {
      const t = getTuning(tid);
      for (const [sym, frets] of list) {
        const c = parseChord(sym);
        const v = { frets: [...frets].map((ch) => (ch === 'x' ? -1 : Number(ch))) };
        const r = contains(v, c, t);
        ok(r.onlyChord, `${tid} ${sym} ${frets} has a foreign note`);
        ok(c.tones.filter((x) => !x.optional).length > t.strings.length || r.allReq, `${tid} ${sym} ${frets} missing tone`);
        if (instrumentOf(t) === 'guitar') ok(r.lowest === c.rootPc, `${tid} ${sym} bass not root`);
      }
    }
  });
  test('open G and C come first on guitar', () => {
    const t = getTuning('guitar-standard');
    eq(getVoicings('G', t)[0].id, '3,2,0,0,0,3');
    eq(getVoicings('C', t)[0].id, 'x,3,2,0,1,0');
  });
  test('every common chord in every key on every tuning has a valid voicing', () => {
    const roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const sufs = ['', 'm', '7', 'maj7', 'm7', 'm7b5', 'dim7', 'sus4', '6', '9', 'add9', 'aug', '13', '7b9'];
    for (const t of BUILTIN_TUNINGS) {
      for (const r of roots) for (const s of sufs) {
        const c = parseChord(r + s);
        const vs = getVoicings(r + s, t);
        ok(vs.length > 0, `${t.id}: no voicing for ${r + s}`);
        const res = contains(vs[0], c, t);
        ok(res.onlyChord, `${t.id} ${r + s} foreign note`);
        if (instrumentOf(t) === 'guitar') ok(res.lowest === c.rootPc, `${t.id} ${r + s} bass ${vs[0].id}`);
      }
    }
  });
  test('slash chord bass honoured', () => {
    const t = getTuning('guitar-standard');
    const v = getVoicings('C/E', t)[0];
    eq(contains(v, parseChord('C/E'), t).lowest, 4);
    const d = getVoicings('D/F#', t)[0];
    eq(contains(d, parseChord('D/F#'), t).lowest, 6);
  });
  test('capo shapes', () => {
    const t = getTuning('guitar-standard');
    const v = getVoicings('D', t, { capo: 2 })[0];
    eq(v.id, 'x,3,2,0,1,0'); // C shape with capo 2 sounds D
  });
});
