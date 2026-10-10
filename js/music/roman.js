// Roman-numeral ⇄ chord-symbol conversion and the bar-text grammar shared by
// presets, quick text entry and paste-import.
//
// Numerals are always relative to the MAJOR scale of the tonic, with explicit
// accidentals (pop/jazz convention): in A minor, "i bVI bIII bVII" = Am F C G.
import { transposeNote, intervalBetween, simplify, prettyAcc, mod12 } from './theory.js';
import { parseChord } from './chordParser.js';

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11];
const ROMAN_RE = /^([b#♭♯]*)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)([°oø+]?)(.*)$/;

function degreeNote(tonic, degree, acc) {
  return simplify(transposeNote(tonic, [degree, MAJOR_SEMIS[degree - 1] + acc]));
}

function accOf(str) {
  let a = 0;
  for (const ch of str) a += ch === 'b' || ch === '♭' ? -1 : 1;
  return a;
}

function parseNumeral(tok) {
  const m = tok.match(ROMAN_RE);
  if (!m) return null;
  const degree = NUMERALS.indexOf(m[2].toUpperCase()) + 1;
  return { acc: accOf(m[1]), degree, lower: m[2] === m[2].toLowerCase(), mark: m[3], suffix: m[4] };
}

/**
 * Realise a Roman-numeral token in a key → chord symbol (or null if invalid).
 * Supports: ii7, V7, bVII, #iv°7, iiø7, V+, IVmaj7, V7/V, viiø7/ii, I/3, i/b7.
 */
export function romanToChord(token, keyTonic) {
  const t = String(token).trim();
  if (/^N\.?C\.?$/i.test(t)) return 'N.C.';
  const parts = t.split('/');
  const head = parts.shift();
  let bassDeg = null;
  let target = null;
  for (const p of parts) {
    const bm = p.match(/^([b#♭♯]?)([1-7])$/);
    if (bm) bassDeg = { acc: accOf(bm[1]), degree: Number(bm[2]) };
    else if (target === null) target = p;
    else return null;
  }
  let tonic = keyTonic;
  if (target) {
    const tn = parseNumeral(target);
    if (!tn || tn.mark || tn.suffix) return null;
    tonic = degreeNote(keyTonic, tn.degree, tn.acc);
  }
  const n = parseNumeral(head);
  if (!n) return null;
  const root = degreeNote(tonic, n.degree, n.acc);
  let suffix = n.suffix.replace(/♭/g, 'b').replace(/♯/g, '#');
  if (n.mark === '°' || n.mark === 'o') suffix = suffix.startsWith('7') ? 'dim' + suffix : 'dim' + suffix;
  else if (n.mark === 'ø') suffix = 'm7b5' + suffix.replace(/^7/, '');
  else if (n.mark === '+') suffix = 'aug' + suffix;
  else if (n.lower) suffix = 'm' + suffix;
  const bass = bassDeg ? degreeNote(keyTonic, bassDeg.degree, bassDeg.acc) : null;
  const sym = root + suffix + (bass && bass !== root ? '/' + bass : '');
  return parseChord(sym) ? sym : null;
}

/** Roman-numeral label for a chord symbol in a key (display only). */
export function chordToRoman(sym, keyTonic) {
  const c = parseChord(sym);
  if (!c) return '?';
  if (c.nc) return 'N.C.';
  const degLabel = (note) => {
    const [num, semis] = intervalBetween(keyTonic, note);
    let acc = mod12(semis - MAJOR_SEMIS[num - 1]);
    if (acc > 6) acc -= 12;
    return { num, acc, pre: acc < 0 ? 'b'.repeat(-acc) : '#'.repeat(acc) };
  };
  const r = degLabel(c.root);
  const numeral = NUMERALS[r.num - 1];
  const s = c.suffix;
  let out;
  if (c.kind === 'half-diminished') out = numeral.toLowerCase() + 'ø' + s.replace(/^m7b5/, '7');
  else if (c.kind === 'diminished-seventh') out = numeral.toLowerCase() + '°' + s.replace(/^dim/, '');
  else if (c.kind === 'diminished') out = numeral.toLowerCase() + '°' + s.replace(/^dim/, '');
  else if (s.startsWith('aug')) out = numeral + '+' + s.slice(3);
  else if (/^m(?!aj)/.test(s)) out = numeral.toLowerCase() + s.slice(1);
  else out = numeral + s;
  let label = r.pre + out;
  if (c.bass) {
    const b = degLabel(c.bass);
    label += '/' + b.pre + b.num;
  }
  return label;
}

export function prettyRoman(label) {
  return prettyAcc(String(label).replace(/^b/, '♭').replace(/^#/, '♯').replace(/\/b(\d)/, '/♭$1').replace(/\/#(\d)/, '/♯$1'))
    .replace(/(?<=\d)b(?=\d)/g, '♭');
}

// ---------- bar-text grammar ----------
// "Dm7 . G7 . | Cmaj7 | % | N.C."  — bars split by "|", "." or "/" extends
// the previous chord one beat, "%" repeats the previous bar.

/**
 * @param {string} text
 * @param {{beatsPerBar:number, roman?:boolean, keyTonic?:string}} opts
 * @returns {{bars:{chords:{symbol:string,beats:number}[]}[], errors:string[]}}
 */
export function parseBarText(text, { beatsPerBar = 4, roman = false, keyTonic = 'C' } = {}) {
  const errors = [];
  const bars = [];
  const cleaned = String(text).replace(/\|\|/g, '|').replace(/[\r\n]+/g, '|').trim().replace(/^\|+|\|+$/g, '');
  if (!cleaned) return { bars, errors };
  for (const rawBar of cleaned.split('|')) {
    const toks = rawBar.trim().split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    if (toks.length === 1 && toks[0] === '%') {
      if (!bars.length) { errors.push('"%" needs a previous bar to repeat'); continue; }
      bars.push({ chords: bars[bars.length - 1].chords.map((c) => ({ ...c })) });
      continue;
    }
    const items = [];
    let hadDots = false;
    for (const tok of toks) {
      if (tok === '.' || tok === '/') {
        hadDots = true;
        if (items.length) items[items.length - 1].units++;
        else errors.push(`Bar "${rawBar.trim()}" starts with a beat mark`);
        continue;
      }
      const sym = roman ? romanToChord(tok, keyTonic) : (parseChord(tok) ? parseChord(tok).symbol : null);
      if (!sym) { errors.push(`Unrecognised ${roman ? 'numeral' : 'chord'} "${tok}"`); continue; }
      items.push({ symbol: sym, units: 1 });
    }
    if (!items.length) continue;
    let beats;
    const totalUnits = items.reduce((s, i) => s + i.units, 0);
    if (hadDots || totalUnits >= beatsPerBar) beats = items.map((i) => i.units);
    else beats = splitEvenly(beatsPerBar, items.length);
    bars.push({ chords: items.map((it, i) => ({ symbol: it.symbol, beats: beats[i] })) });
  }
  return { bars, errors };
}

/** 4 beats / 3 chords → [2,1,1]; 3/2 → [2,1] */
export function splitEvenly(total, n) {
  if (n <= 0) return [];
  if (n >= total) return Array(n).fill(1);
  const base = Math.floor(total / n);
  const out = Array(n).fill(base);
  let rem = total - base * n;
  for (let i = 0; rem > 0; i++, rem--) out[i]++;
  return out;
}

/** Inverse of parseBarText (optionally rendering numerals). */
export function barsToText(bars, { beatsPerBar = 4, roman = false, keyTonic = 'C' } = {}) {
  return bars.map((bar) => {
    const even = splitEvenly(beatsPerBar, bar.chords.length);
    const isEven = bar.chords.every((c, i) => c.beats === even[i]);
    return bar.chords.map((c) => {
      const label = roman ? chordToRoman(c.symbol, keyTonic) : c.symbol;
      return isEven ? label : [label, ...Array(Math.max(0, c.beats - 1)).fill('.')].join(' ');
    }).join(' ');
  }).join(' | ');
}
