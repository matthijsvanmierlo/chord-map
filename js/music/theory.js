// Core pitch / interval / key utilities. Pure functions, no DOM.
// Notes are spelled names ("C", "F#", "Bb", "Cx", "Ebb"); pitch classes are 0–11.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Root choices offered in pickers (common enharmonic spellings). */
export const ROOT_CHOICES = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
/** Key tonics offered in pickers. */
export const KEY_TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'C#', 'G#', 'D#', 'A#'];

export const mod12 = (n) => ((n % 12) + 12) % 12;

const NOTE_RE = /^([A-Ga-g])(bb|b|#|x|##|♭♭|♭|♯|𝄪)?$/;

/** Parse a spelled note → { letter, acc (−2..2), pc } or null. */
export function parseNote(name) {
  if (typeof name !== 'string') return null;
  const m = name.trim().match(NOTE_RE);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const accStr = (m[2] || '').replace(/♭/g, 'b').replace(/♯/g, '#').replace('𝄪', 'x');
  const acc = { '': 0, b: -1, bb: -2, '#': 1, '##': 2, x: 2 }[accStr];
  return { letter, acc, pc: mod12(LETTER_PC[letter] + acc) };
}

export function noteName(letter, acc) {
  const s = acc > 0 ? (acc === 2 ? '##' : '#') : acc < 0 ? 'b'.repeat(-acc) : '';
  return letter + s;
}

export function pcOf(name) {
  const n = parseNote(name);
  return n ? n.pc : null;
}

/** Interval = [diatonicNumber (1-based, may exceed 7), semitones]. */
export const IV = {
  P1: [1, 0], m2: [2, 1], M2: [2, 2], m3: [3, 3], M3: [3, 4], P4: [4, 5], A4: [4, 6], d5: [5, 6],
  P5: [5, 7], A5: [5, 8], m6: [6, 8], M6: [6, 9], d7: [7, 9], m7: [7, 10], M7: [7, 11],
};

/** Transpose a spelled note by an interval, keeping correct letter spelling. */
export function transposeNote(name, [num, semis]) {
  const n = parseNote(name);
  if (!n) return name;
  const steps = num >= 1 ? num - 1 : num + 1; // negative intervals: [-3,-4] = down a M3
  const li = LETTERS.indexOf(n.letter);
  const newLetter = LETTERS[(((li + steps) % 7) + 7) % 7];
  const targetPc = mod12(n.pc + semis);
  let acc = mod12(targetPc - LETTER_PC[newLetter]);
  if (acc > 6) acc -= 12;
  if (acc > 2 || acc < -2) return simplify(noteName(newLetter, 0), targetPc);
  return noteName(newLetter, acc);
}

/** Interval between two spelled notes (ascending, within an octave). */
export function intervalBetween(from, to) {
  const a = parseNote(from), b = parseNote(to);
  if (!a || !b) return [1, 0];
  const steps = (LETTERS.indexOf(b.letter) - LETTERS.indexOf(a.letter) + 7) % 7;
  return [steps + 1, mod12(b.pc - a.pc)];
}

/** Choose a sensible spelling for a pitch class. */
export function spellPc(pc, preferFlats = false) {
  return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
}

/** Replace double accidentals / B#, E#, Cb, Fb with simpler spelling (only when needed). */
export function simplify(name, pc = pcOf(name)) {
  const n = parseNote(name);
  if (n && Math.abs(n.acc) <= 1) return name;
  return spellPc(pc, n ? n.acc < 0 : false);
}

// ---------- modes & keys ----------

export const MODES = {
  major: { name: 'Major (Ionian)', steps: [0, 2, 4, 5, 7, 9, 11], fromMajor: IV.P1 },
  minor: { name: 'Minor (Aeolian)', steps: [0, 2, 3, 5, 7, 8, 10], fromMajor: IV.M6 },
  harmonicMinor: { name: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11], fromMajor: IV.M6 },
  dorian: { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10], fromMajor: IV.M2 },
  phrygian: { name: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10], fromMajor: IV.M3 },
  lydian: { name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11], fromMajor: IV.P4 },
  mixolydian: { name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10], fromMajor: IV.P5 },
  locrian: { name: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10], fromMajor: IV.M7 },
};

/** Spelled 7-note scale for a key. */
export function scaleNotes(tonic, mode = 'major') {
  const m = MODES[mode] || MODES.major;
  return m.steps.map((semi, i) => transposeNote(tonic, [i + 1, semi]));
}


/** Number of sharps (+) / flats (−) in the key signature. */
export function keySignatureCount(tonic, mode = 'major') {
  const notes = scaleNotes(tonic, mode).map(parseNote);
  if (notes.some((n) => !n)) return 0;
  return notes.reduce((s, n) => s + n.acc, 0);
}

/** Relative-major tonic of a key (used for key-signature rendering). */
export function relativeMajor(tonic, mode = 'major') {
  const m = MODES[mode] || MODES.major;
  const [num, semis] = m.fromMajor;
  if (num === 1) return tonic;
  return transposeNote(tonic, [-num, -semis]);
}

/** Key signature as a major-key name VexFlow understands (enharmonic if > 7 accidentals). */
export function vexKeySignature(tonic, mode = 'major') {
  let maj = relativeMajor(tonic, mode);
  const count = keySignatureCount(maj, 'major');
  if (Math.abs(count) > 7 || Math.abs(parseNote(maj)?.acc || 0) > 1) {
    maj = spellPc(pcOf(maj), count > 0);
  }
  const ok = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
  return ok.includes(maj) ? maj : spellPc(pcOf(maj), true);
}

/** Should chromatic notes in this key be spelled with flats? */
export function keyPrefersFlats(tonic, mode = 'major') {
  const c = keySignatureCount(tonic, mode);
  if (c !== 0) return c < 0;
  return parseNote(tonic)?.acc < 0;
}

export function keyLabel(key) {
  if (!key) return '';
  const mode = key.mode || 'major';
  const short = { major: 'major', minor: 'minor', harmonicMinor: 'harmonic minor' }[mode] || (MODES[mode]?.name || mode);
  return `${prettyAcc(key.tonic)} ${short}`;
}

/** Display helper: b → ♭, # → ♯ in note names. */
export function prettyAcc(name) {
  return String(name).replace(/##/g, '𝄪').replace(/#/g, '♯').replace(/(?<=[A-G])bb/g, '𝄫').replace(/(?<=[A-G])b/g, '♭');
}

// ---------- MIDI ----------

const NOTE_OCT_RE = /^([A-Ga-g](?:bb|b|#|x|##)?)(-?\d)$/;

/** "E2" → 40 */
export function midiOf(sci) {
  const m = String(sci).match(NOTE_OCT_RE);
  if (!m) return null;
  const n = parseNote(m[1]);
  return (Number(m[2]) + 1) * 12 + LETTER_PC[n.letter] + n.acc;
}

/** Spell a MIDI number given a preferred spelled pitch class name → { name, octave }. */
export function spellMidi(midi, spelled) {
  const n = parseNote(spelled) || parseNote(spellPc(midi));
  const octave = Math.floor((midi - n.acc - LETTER_PC[n.letter]) / 12) - 1;
  return { name: noteName(n.letter, n.acc), letter: n.letter, acc: n.acc, octave };
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

