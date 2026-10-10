// Chord-symbol parser. "Bbm7b5/E" → structured chord with spelled tones.
import { parseNote, transposeNote, mod12, prettyAcc, intervalBetween, simplify } from './theory.js';

// Interval table by chord-degree label → [diatonic number, semitones]
const DEG = {
  '1': [1, 0], b2: [2, 1], '2': [2, 2], b3: [3, 3], '3': [3, 4], '4': [4, 5], '#4': [4, 6],
  b5: [5, 6], '5': [5, 7], '#5': [5, 8], b6: [6, 8], '6': [6, 9], bb7: [7, 9], b7: [7, 10], '7': [7, 11],
  b9: [9, 13], '9': [9, 14], '#9': [9, 15], '11': [11, 17], '#11': [11, 18], b13: [13, 20], '13': [13, 21],
};

/** Normalise common alternative spellings to our canonical suffix vocabulary. */
function normaliseSuffix(s) {
  let q = s
    .replace(/[()\s,]/g, '')
    .replace(/♭/g, 'b').replace(/♯/g, '#')
    .replace(/^[Δ∆]$/, 'maj7')
    .replace(/[Δ∆]/g, 'maj')
    .replace(/ø7?/g, 'm7b5')
    .replace(/[°º]/g, 'dim')
    .replace(/^-(?=\d|maj|$)/, 'm')
    .replace(/^-/, 'm')
    .replace(/^min(?!or)/i, 'm').replace(/^minor/i, 'm')
    .replace(/^Maj|^MAJ|^Ma(?=\d)/, 'maj')
    .replace(/^M(?=\d|$)/, 'maj')
    .replace(/^m(?:Maj|M|maj)(?=\d|$)/, 'mmaj')
    .replace(/^major/i, 'maj')
    .replace(/^\+/, 'aug')
    .replace(/^o7/, 'dim7').replace(/^o$/, 'dim')
    .replace(/^half-?dim(inished)?7?/i, 'm7b5')
    .replace(/^dom/, '')
    .replace(/\+5/g, '#5').replace(/-5/g, 'b5').replace(/\+9/g, '#9').replace(/-9/g, 'b9')
    .replace(/\+11/g, '#11').replace(/-13/g, 'b13')
    .replace(/^maj$/, '')
    .replace(/^6\/9|^69/, '69');
  if (q === 'm69' || q === 'm6/9') q = 'm69';
  return q;
}

/**
 * Parse the quality/suffix part into degree labels.
 * Returns { degrees: Set<label>, optional: Set<label>, kind } or null when unrecognised.
 */
function parseSuffix(q) {
  let rest = q;
  let third = '3', fifth = '5', seventh = null, kind = 'major';
  const add = new Set();
  const opt = new Set();
  let ext = 0;
  let sixth = false, nine69 = false;
  const take = (re) => {
    const m = rest.match(re);
    if (m) rest = rest.slice(m[0].length);
    return m;
  };

  if (take(/^5$/)) return { degrees: new Set(['1', '5']), optional: new Set(), kind: 'power' };
  if (take(/^mmaj(7|9|11|13)?/)) {
    third = 'b3'; seventh = '7'; kind = 'minor-major';
    const n = Number(q.match(/^mmaj(\d+)?/)[1] || 7); ext = n;
  } else if (take(/^m7b5/)) { third = 'b3'; fifth = 'b5'; seventh = 'b7'; kind = 'half-diminished'; ext = 7; }
  else if (take(/^dim7/)) { third = 'b3'; fifth = 'b5'; seventh = 'bb7'; kind = 'diminished-seventh'; ext = 7; }
  else if (take(/^dim/)) { third = 'b3'; fifth = 'b5'; kind = 'diminished'; }
  else if (take(/^aug/)) { fifth = '#5'; kind = 'augmented'; }
  else if (take(/^maj(?=\d)/)) { seventh = '7'; kind = 'major-seventh'; const m = take(/^(7|9|11|13)/); ext = Number(m ? m[1] : 7); }
  else if (take(/^m(?!aj)/)) { third = 'b3'; kind = 'minor'; }

  if (!ext) {
    const m = take(/^(69|6|7|9|11|13)/);
    if (m) {
      if (m[1] === '69') { sixth = true; nine69 = true; }
      else if (m[1] === '6') sixth = true;
      else {
        ext = Number(m[1]);
        if (!seventh) seventh = kind === 'diminished' ? 'bb7' : 'b7';
        if (kind === 'diminished' && ext === 7) kind = 'diminished-seventh';
      }
    }
  }
  if (sixth && (kind === 'major' || kind === 'minor')) kind = kind === 'minor' ? 'minor-sixth' : 'major-sixth';
  if (ext && kind === 'major') kind = 'dominant';
  if (ext && kind === 'minor') kind = 'minor-seventh';

  // modifiers, any order
  let guard = 0;
  while (rest && guard++ < 12) {
    let m;
    if ((m = take(/^sus(2|4)?/))) { third = m[1] === '2' ? '2' : '4'; continue; }
    if ((m = take(/^add(b9|#9|#11|b13|2|4|6|9|11|13)/))) { add.add(m[1]); continue; }
    if ((m = take(/^(b5|#5)/))) { fifth = m[1]; continue; }
    if ((m = take(/^maj7/))) { seventh = '7'; if (kind === 'augmented') kind = 'augmented-major-seventh'; continue; }
    if ((m = take(/^(b9|#9|#11|b13|9|11|13)/))) { add.add(m[1]); if (!seventh && kind !== 'major-sixth') seventh = 'b7'; continue; }
    if ((m = take(/^alt/))) { add.add('b9'); add.add('#9'); add.add('b13'); fifth = null; if (!seventh) seventh = 'b7'; continue; }
    if ((m = take(/^no3/))) { third = null; continue; }
    if ((m = take(/^no5/))) { fifth = null; continue; }
    if ((m = take(/^(\+|aug)/))) { fifth = '#5'; continue; }
    break;
  }
  if (rest) return null;

  const degs = new Set(['1']);
  if (third) degs.add(third);
  if (fifth) degs.add(fifth);
  if (sixth) degs.add('6');
  if (nine69) degs.add('9');
  if (seventh) degs.add(seventh);
  if (ext >= 9) degs.add(add.has('b9') || add.has('#9') ? null : '9');
  if (ext >= 11) degs.add(add.has('#11') ? null : '11');
  if (ext >= 13) degs.add(add.has('b13') ? null : '13');
  degs.delete(null);
  add.forEach((d) => degs.add(d));
  // 13 chords conventionally omit the 11 (except minor) – avoid clash with the 3rd
  if (ext >= 13 && third === '3' && !add.has('11')) degs.delete('11');
  // a 13th chord with explicit b13 (e.g. 7b13): keep only b13
  if (degs.has('b13') && degs.has('13')) degs.delete('13');

  // optional tones for voicing (may be dropped on few-string instruments)
  if (fifth === '5') opt.add('5');
  if (ext >= 11 && third === '3') opt.add('9');
  if (ext >= 11) { opt.add('9'); }
  if (ext >= 13) { opt.add('11'); opt.add('9'); }
  if (ext >= 11 && third === 'b3') opt.add('9');
  if (nine69) opt.add('5');
  if (kind === 'diminished-seventh') opt.delete('5');
  if (kind === 'power') opt.clear();
  return { degrees: degs, optional: opt, kind };
}

const ORDER = ['1', 'b2', '2', 'b3', '3', '4', '#4', 'b5', '5', '#5', 'b6', '6', 'bb7', 'b7', '7', 'b9', '9', '#9', '11', '#11', 'b13', '13'];

/** @typedef {{ symbol:string, root:string, rootPc:number, suffix:string, bass:string|null, bassPc:number|null,
 *  tones:{deg:string,name:string,pc:number,optional:boolean}[], pcs:number[], kind:string, nc?:boolean }} Chord */

const cache = new Map();

/**
 * Parse a chord symbol. Returns a Chord or null if the symbol isn't understood.
 * Accepts ASCII or Unicode accidentals and common jazz shorthands (Δ, ø, °, -, +).
 */
export function parseChord(input) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (cache.has(raw)) return cache.get(raw);
  const result = parseUncached(raw);
  cache.set(raw, result);
  return result;
}

function parseUncached(raw) {
  if (/^(N\.?C\.?|n\.?c\.?|NC)$/.test(raw)) {
    return { symbol: 'N.C.', root: null, rootPc: null, suffix: '', bass: null, bassPc: null, tones: [], pcs: [], kind: 'none', nc: true };
  }
  const s = raw.replace(/♭/g, 'b').replace(/♯/g, '#');
  const m = s.match(/^([A-Ga-g])(bb|b|#|##)?(.*)$/);
  if (!m) return null;
  const root = m[1].toUpperCase() + (m[2] || '');
  let rest = m[3];
  let bass = null;
  const slash = rest.match(/\/([A-Ga-g](?:bb|b|#|##)?)$/);
  if (slash) {
    bass = slash[1][0].toUpperCase() + slash[1].slice(1);
    rest = rest.slice(0, -slash[0].length);
  }
  const suffix = normaliseSuffix(rest);
  const parsed = parseSuffix(suffix);
  if (!parsed) return null;
  const rootN = parseNote(root);
  if (!rootN) return null;
  const degs = [...parsed.degrees].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const tones = degs.map((d) => {
    const name = simplify(transposeNote(root, DEG[d]));
    return { deg: d, name, pc: mod12(rootN.pc + DEG[d][1]), optional: parsed.optional.has(d) };
  });
  const bassN = bass ? parseNote(bass) : null;
  const symbol = root + suffix + (bass ? '/' + bass : '');
  return {
    symbol, root, rootPc: rootN.pc, suffix, bass, bassPc: bassN ? bassN.pc : null,
    tones, pcs: [...new Set(tones.map((t) => t.pc))], kind: parsed.kind,
  };
}

export function isValidChord(sym) {
  return !!parseChord(sym);
}

/** Pretty display: ♭/♯ for accidentals. */
export function prettyChord(sym) {
  if (!sym) return '';
  const c = parseChord(sym);
  if (!c) return sym;
  if (c.nc) return 'N.C.';
  const suf = c.suffix.replace(/b(?=\d)/g, '♭').replace(/#/g, '♯').replace(/^69$/, '6/9').replace(/^m69$/, 'm6/9');
  return prettyAcc(c.root) + suf + (c.bass ? '/' + prettyAcc(c.bass) : '');
}

/** Human description e.g. "C minor seventh". */
export function describeChord(sym) {
  const c = parseChord(sym);
  if (!c) return sym;
  if (c.nc) return 'No chord';
  const names = {
    '': 'major', m: 'minor', '7': 'dominant seventh', maj7: 'major seventh', m7: 'minor seventh',
    m7b5: 'half-diminished seventh', dim: 'diminished', dim7: 'diminished seventh', aug: 'augmented',
    sus2: 'suspended second', sus4: 'suspended fourth', '6': 'major sixth', m6: 'minor sixth',
    '9': 'dominant ninth', maj9: 'major ninth', m9: 'minor ninth', '5': 'power chord', add9: 'add nine',
    '13': 'dominant thirteenth', '11': 'dominant eleventh', m11: 'minor eleventh', '69': 'six-nine',
    '7sus4': 'dominant seventh suspended fourth', mmaj7: 'minor-major seventh', '7b9': 'dominant seventh flat nine',
    '7#9': 'dominant seventh sharp nine', '7alt': 'altered dominant',
  };
  const spoken = (n) => n.replace('bb', ' double flat').replace('b', ' flat').replace('##', ' double sharp').replace('#', ' sharp');
  const q = names[c.suffix] ?? c.suffix;
  return `${spoken(c.root)} ${q}${c.bass ? ' over ' + spoken(c.bass) : ''}`.trim();
}

/** Transpose a chord symbol by a spelled interval. */
export function transposeChord(sym, interval) {
  const c = parseChord(sym);
  if (!c || c.nc) return sym;
  const r = simplify(transposeNote(c.root, interval));
  const b = c.bass ? simplify(transposeNote(c.bass, interval)) : null;
  return r + c.suffix + (b ? '/' + b : '');
}

/** Transpose a chord symbol from one key tonic to another. */
export function transposeChordBetweenKeys(sym, fromTonic, toTonic) {
  return transposeChord(sym, intervalBetween(fromTonic, toTonic));
}

/** Suffixes offered in the chord picker, grouped. */
export const SUFFIX_GROUPS = [
  { name: 'Triads', items: ['', 'm', 'dim', 'aug', 'sus2', 'sus4', '5'] },
  { name: 'Sevenths', items: ['7', 'maj7', 'm7', 'm7b5', 'dim7', 'mmaj7', '7sus4'] },
  { name: 'Sixths & adds', items: ['6', 'm6', '69', 'add9', 'madd9'] },
  { name: 'Extensions', items: ['9', 'maj9', 'm9', '11', 'm11', '13', 'maj13'] },
  { name: 'Altered', items: ['7b9', '7#9', '7#5', '7b5', '7#11', '7b13', '7alt', '9#11', '13b9'] },
];
