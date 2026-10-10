// Capo helper: which capo position lets a song use the easiest shapes?
import { parseChord } from './chordParser.js';
import { getVoicings } from './voicingEngine.js';
import { uniqueChords } from './song.js';
import { mod12 } from './theory.js';

// Shape names as guitarists say them (open-chord friendly spellings).
const SHAPE_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Name of the shape played for `symbol` with a capo on `capo`. */
export function shapeName(symbol, capo) {
  const c = parseChord(symbol);
  if (!c || c.nc) return symbol;
  const root = SHAPE_ROOTS[mod12(c.rootPc - capo)];
  const bass = c.bass ? '/' + SHAPE_ROOTS[mod12(c.bassPc - capo)] : '';
  return root + c.suffix + bass;
}

/**
 * Rank capo positions for a song.
 * @returns {{capo:number, shapeKey:string, shapes:{symbol:string, shape:string, open:boolean}[], openCount:number, score:number}[]}
 */
export function suggestCapo(song, tuning, { maxCapo = 7 } = {}) {
  const chords = uniqueChords(song).map((c) => c.symbol).filter((s) => parseChord(s) && !parseChord(s).nc);
  if (!chords.length) return [];
  const limit = Math.min(maxCapo, Math.max(0, (tuning.frets || 12) - 5));
  const out = [];
  for (let capo = 0; capo <= limit; capo++) {
    let score = 0;
    let openCount = 0;
    const shapes = chords.map((symbol) => {
      const v = getVoicings(symbol, tuning, { capo, limit: 1, prefs: null })[0];
      const fretted = v ? v.frets.filter((f) => f > 0) : [];
      const open = !!v && (v.curated || (v.frets.includes(0) && Math.max(0, ...fretted) <= 4));
      if (open) openCount++;
      // open shape ≫ low-position shape ≫ barre/high shape
      score += !v ? -20 : open ? 10 : v.barre ? 2 - Math.min(...fretted) * 0.2 : 4 - Math.min(...fretted) * 0.3;
      return { symbol, shape: shapeName(symbol, capo), open };
    });
    score -= capo * 0.35; // all else equal, a lower capo keeps more range
    const keyShape = shapeName(song.key.tonic + (['minor', 'harmonicMinor', 'dorian', 'phrygian'].includes(song.key.mode) ? 'm' : ''), capo);
    out.push({ capo, shapeKey: keyShape, shapes, openCount, score: Math.round(score * 10) / 10 });
  }
  return out.sort((a, b) => b.score - a.score || a.capo - b.capo);
}

