// Scale library and "what scale fits this chord?" suggestions (chord–scale theory).
import { parseChord } from './chordParser.js';
import { chordToRoman } from './roman.js';
import { transposeNote, simplify, mod12, prettyAcc, pcOf } from './theory.js';

// Each degree is [diatonic number, semitones] so notes are spelled correctly.
const D = (spec) => spec.split(' ').map((t) => {
  const m = t.match(/^(b|#)?(\d+)$/);
  const n = Number(m[2]);
  const base = [0, 0, 2, 4, 5, 7, 9, 11][n];
  return [n, base + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0)];
});

export const SCALES = {
  ionian: { name: 'Major (Ionian)', degrees: D('1 2 3 4 5 6 7') },
  dorian: { name: 'Dorian', degrees: D('1 2 b3 4 5 6 b7') },
  phrygian: { name: 'Phrygian', degrees: D('1 b2 b3 4 5 b6 b7') },
  lydian: { name: 'Lydian', degrees: D('1 2 3 #4 5 6 7') },
  mixolydian: { name: 'Mixolydian', degrees: D('1 2 3 4 5 6 b7') },
  aeolian: { name: 'Natural minor (Aeolian)', degrees: D('1 2 b3 4 5 b6 b7') },
  locrian: { name: 'Locrian', degrees: D('1 b2 b3 4 b5 b6 b7') },
  harmonicMinor: { name: 'Harmonic minor', degrees: D('1 2 b3 4 5 b6 7') },
  phrygianDominant: { name: 'Phrygian dominant', degrees: D('1 b2 3 4 5 b6 b7') },
  melodicMinor: { name: 'Melodic minor', degrees: D('1 2 b3 4 5 6 7') },
  lydianDominant: { name: 'Lydian dominant', degrees: D('1 2 3 #4 5 6 b7') },
  locrianNat2: { name: 'Locrian ♮2', degrees: D('1 2 b3 4 b5 b6 b7') },
  altered: { name: 'Altered (super-Locrian)', degrees: D('1 b2 #2 3 b5 b6 b7') },
  majorPentatonic: { name: 'Major pentatonic', degrees: D('1 2 3 5 6') },
  minorPentatonic: { name: 'Minor pentatonic', degrees: D('1 b3 4 5 b7') },
  blues: { name: 'Blues scale', degrees: D('1 b3 4 b5 5 b7') },
  majorBlues: { name: 'Major blues', degrees: D('1 2 b3 3 5 6') },
  wholeTone: { name: 'Whole tone', degrees: D('1 2 3 #4 #5 b7') },
  halfWhole: { name: 'Diminished (half–whole)', degrees: D('1 b2 #2 3 #4 5 6 b7') },
  wholeHalf: { name: 'Diminished (whole–half)', degrees: D('1 2 b3 4 b5 b6 6 7') },
};

/** Spelled notes + pitch classes for a scale on a root. */
export function scaleOn(root, id) {
  const sc = SCALES[id];
  const notes = sc.degrees.map((iv) => simplify(transposeNote(root, iv)));
  const labels = sc.degrees.map(([n, semi]) => {
    const natural = [0, 0, 2, 4, 5, 7, 9, 11][n];
    const acc = semi - natural;
    return (acc < 0 ? '♭' : acc > 0 ? '♯' : '') + n;
  });
  const rootPc = pcOf(root);
  const pcs = sc.degrees.map(([, semi]) => mod12(rootPc + semi));
  return { id, name: sc.name, root, notes, labels, pcs, title: `${prettyAcc(root)} ${sc.name}` };
}

const WHY = {
  ionian: 'the home major scale — every note fits',
  lydian: 'major with a bright ♯4 (avoids the clash of the 4th against the 3rd)',
  majorPentatonic: 'five safe notes, no half-step clashes',
  mixolydian: 'major with a ♭7 — matches the dominant 7th',
  blues: 'the classic bluesy sound over dominant chords',
  majorBlues: 'country/blues major sound with the ♭3 “blue note”',
  lydianDominant: 'Mixolydian with ♯11 — the jazz sound for 7♯11 and tritone subs',
  altered: 'every tension (♭9 ♯9 ♯11 ♭13) — tension that resolves to the next chord',
  halfWhole: 'symmetric scale containing ♭9, ♯9 and 13 — fits 7♭9 / 13♭9',
  phrygianDominant: 'harmonic-minor colour for a V7 going to a minor chord',
  dorian: 'minor with a natural 6 — the go-to jazz/funk minor sound',
  aeolian: 'the natural minor scale of the key',
  phrygian: 'dark minor with ♭2 — fits iii in a major key and flamenco',
  minorPentatonic: 'five safe notes, the rock/blues favourite',
  melodicMinor: 'minor with major 6 and 7 — fits m6 and m(maj7)',
  harmonicMinor: 'minor with a raised 7th — fits m(maj7) and minor tonic',
  locrianNat2: 'half-diminished sound with a natural 9',
  locrian: 'the diatonic scale for a half-diminished vii',
  wholeHalf: 'symmetric diminished scale that fits fully-diminished chords',
  wholeTone: 'all whole steps — fits augmented and 7♯5 chords',
};

/**
 * Ranked scale suggestions for a chord.
 * @param {string} symbol
 * @param {{tonic:string, mode:string}} key
 * @param {string} style song/preset style (e.g. 'blues', 'jazz')
 * @returns {{id:string, name:string, root:string, notes:string[], labels:string[], why:string}[]}
 */
export function scalesForChord(symbol, key = { tonic: 'C', mode: 'major' }, style = '') {
  const c = parseChord(symbol);
  if (!c || c.nc) return [];
  const roman = key ? chordToRoman(symbol, key.tonic).replace(/\/.*$/, '') : '';
  const s = c.suffix;
  const has = (deg) => c.tones.some((t) => t.deg === deg);
  let ids;
  if (c.kind === 'half-diminished') ids = ['locrianNat2', 'locrian'];
  else if (c.kind === 'diminished-seventh' || c.kind === 'diminished') ids = ['wholeHalf'];
  else if (c.kind === 'augmented' || /aug|#5/.test(s) && !has('b7')) ids = ['wholeTone', 'lydian'];
  else if (s === '5') ids = ['minorPentatonic', 'majorPentatonic', 'mixolydian'];
  else if (c.kind === 'minor-major' || s === 'm6' || s === 'm69') ids = ['melodicMinor', 'dorian', 'harmonicMinor'];
  else if (has('b3')) {
    if (/^iii/.test(roman)) ids = ['phrygian', 'aeolian', 'minorPentatonic'];
    else if (/^vi/.test(roman) || (/^i(?!i|v)/.test(roman) && key.mode !== 'dorian')) ids = ['aeolian', 'dorian', 'minorPentatonic', 'blues'];
    else ids = ['dorian', 'minorPentatonic', 'aeolian', 'blues'];
  } else if (has('b7')) {
    if (/alt/.test(s) || has('#9') && has('b13') || has('#5') || has('b13')) ids = ['altered', 'halfWhole', 'mixolydian'];
    else if (has('b9') || has('#9')) ids = ['halfWhole', 'altered', 'phrygianDominant', 'mixolydian'];
    else if (has('#11') || /^bII7/.test(roman)) ids = ['lydianDominant', 'mixolydian'];
    else if (has('4') && !has('3')) ids = ['mixolydian', 'dorian'];
    else if (style === 'blues' || style === 'rock' || style === 'country') ids = ['blues', 'mixolydian', 'majorBlues', 'minorPentatonic'];
    else ids = ['mixolydian', 'lydianDominant', 'blues', 'majorBlues'];
  } else {
    if (/^IV/.test(roman) || /^bVI|^bVII|^bII/.test(roman) || has('#11')) ids = ['lydian', 'majorPentatonic', 'ionian'];
    else if (style === 'country' || style === 'blues') ids = ['majorPentatonic', 'majorBlues', 'ionian'];
    else ids = ['ionian', 'majorPentatonic', 'lydian'];
  }
  return ids.map((id) => ({ ...scaleOn(c.root, id), why: WHY[id] }));
}
