// Algorithmic chord-voicing search for ANY fretted tuning (incl. custom & capo).
// Curated textbook shapes (voicingLibrary.js) are returned first when available.
import { parseChord } from './chordParser.js';
import { tuningMidi, instrumentOf } from './tunings.js';
import { CURATED, MOVABLE } from './voicingLibrary.js';
import { mod12 } from './theory.js';

/** @typedef {{frets:number[], fingers:number[], barre:{fret:number,from:number,to:number}|null, baseFret:number, id:string, curated?:boolean, score?:number}} Voicing */

const MAX_SPAN = 3; // highest fretted − lowest fretted (i.e. 4 frets)
const cache = new Map();

/** Importance order when an instrument has fewer strings than chord tones. */
const PRIORITY = ['3', 'b3', '4', '2', 'b7', '7', 'bb7', 'b9', '#9', '#11', 'b13', 'b5', '#5', '6', '13', '1', '9', '11', '5'];

export function voicingId(frets) {
  return frets.map((f) => (f < 0 ? 'x' : f)).join(',');
}

export function parseVoicingId(id, stringCount) {
  if (typeof id !== 'string') return null;
  const parts = id.split(',');
  if (parts.length !== stringCount) return null;
  const frets = parts.map((p) => (p === 'x' ? -1 : Number(p)));
  return frets.every((f) => Number.isInteger(f) && f >= -1 && f <= 24) ? frets : null;
}

/** Derive finger numbers, barre and base fret for a fret array. */
export function analyseShape(frets, fingersHint = null) {
  const fretted = frets.map((f, i) => ({ f, i })).filter((x) => x.f > 0);
  const maxF = fretted.length ? Math.max(...fretted.map((x) => x.f)) : 0;
  const minF = fretted.length ? Math.min(...fretted.map((x) => x.f)) : 0;
  const baseFret = maxF <= 4 ? 1 : minF;
  let fingers = fingersHint ? fingersHint.slice() : null;
  let barre = null;

  if (!fingers) {
    fingers = frets.map(() => 0);
    const atMin = fretted.filter((x) => x.f === minF);
    if (atMin.length >= 2) {
      const from = atMin[0].i, to = atMin[atMin.length - 1].i;
      const between = frets.slice(from, to + 1);
      if (between.every((f) => f !== 0)) barre = { fret: minF, from, to };
    }
    const rest = fretted.filter((x) => !(barre && x.f === minF)).sort((a, b) => a.f - b.f || a.i - b.i);
    let next = barre ? 2 : 1;
    if (barre) atMin.forEach((x) => (fingers[x.i] = 1));
    for (const x of rest) {
      const fing = Math.min(4, Math.max(next, 1 + x.f - minF));
      fingers[x.i] = fing;
      next = fing + 1;
    }
  } else {
    // barre from repeated finger numbers at the same fret
    const byFinger = {};
    frets.forEach((f, i) => { if (f > 0 && fingers[i]) (byFinger[fingers[i]] ||= []).push(i); });
    for (const [, idx] of Object.entries(byFinger)) {
      if (idx.length >= 2 && idx.every((i) => frets[i] === frets[idx[0]])) {
        barre = { fret: frets[idx[0]], from: Math.min(...idx), to: Math.max(...idx) };
        break;
      }
    }
  }
  return { frets, fingers, barre, baseFret, id: voicingId(frets) };
}

function fingerCount(frets) {
  const fretted = frets.filter((f) => f > 0);
  if (!fretted.length) return 0;
  const minF = Math.min(...fretted);
  const idx = frets.map((f, i) => (f === minF ? i : -1)).filter((i) => i >= 0);
  const barreOk = idx.length >= 2 && frets.slice(idx[0], idx[idx.length - 1] + 1).every((f) => f !== 0);
  return barreOk ? 1 + fretted.filter((f) => f > minF).length : fretted.length;
}

function requiredSets(chord, stringCount) {
  const req = chord.tones.filter((t) => !t.optional);
  const opt = chord.tones.filter((t) => t.optional);
  let required = req;
  if (required.length > stringCount) {
    const keep = [...required].sort((a, b) => PRIORITY.indexOf(a.deg) - PRIORITY.indexOf(b.deg)).slice(0, stringCount);
    opt.push(...required.filter((t) => !keep.includes(t)));
    required = keep;
  }
  return { required: [...new Set(required.map((t) => t.pc))], optional: [...new Set(opt.map((t) => t.pc))] };
}

/**
 * Generate playable voicings, best first.
 * @param {string} symbol chord symbol
 * @param {import('./tunings.js').Tuning} tuning
 * @param {{capo?:number, limit?:number}} opts
 * @returns {Voicing[]}
 */
export function getVoicings(symbol, tuning, { capo = 0, limit = 24 } = {}) {
  const chord = parseChord(symbol);
  if (!chord || chord.nc) return [];
  const key = `${tuning.id}|${tuning.strings.join(' ')}|${capo}|${chord.symbol}|${limit}`;
  if (cache.has(key)) return cache.get(key);

  const curated = curatedFor(chord, tuning, capo);
  const generated = search(chord, tuning, capo);
  const seen = new Set(curated.map((v) => v.id));
  const out = [...curated, ...generated.filter((v) => !seen.has(v.id))].slice(0, limit);
  cache.set(key, out);
  return out;
}

/** Curated open shapes; with a capo, the shape is the chord transposed down by the capo. */
function curatedFor(chord, tuning, capo = 0) {
  const list = CURATED[tuning.id];
  if (!list) return [];
  const rootPc = mod12(chord.rootPc - capo);
  const bassPc = chord.bassPc === null ? null : mod12(chord.bassPc - capo);
  return list
    .filter(([sym]) => {
      const c = parseChord(sym);
      return c && c.rootPc === rootPc && c.suffix === chord.suffix && c.bassPc === bassPc;
    })
    .map(([, f, fing]) => {
      const frets = [...f].map((ch) => (ch === 'x' ? -1 : parseInt(ch, 36)));
      return { ...analyseShape(frets, [...fing].map(Number)), curated: true };
    });
}

function search(chord, tuning, capo) {
  const midis = tuningMidi(tuning, capo);
  const n = midis.length;
  const isUke = instrumentOf(tuning) === 'ukulele' || n <= 4;
  const maxFret = Math.max(5, (tuning.frets || 15) - capo);
  const { required, optional } = requiredSets(chord, n);
  const chordPcs = new Set(chord.pcs);
  const bassPc = chord.bassPc ?? chord.rootPc;
  const minPlayed = n <= 4 ? n - 1 : Math.max(3, Math.min(4, required.length + 1));
  const results = new Map();

  // familiar movable shapes first (they get a "familiarity" bonus)
  if (n === 6) {
    for (const [suffix, rootString, offs, fing] of MOVABLE) {
      if (suffix !== chord.suffix || chord.bass) continue;
      const r0 = mod12(chord.rootPc - midis[rootString]);
      for (const r of [r0, r0 + 12]) {
        const frets = offs.map((o) => (o === null ? -1 : r + o));
        if (frets.some((f) => f > maxFret) || frets.some((f, i) => offs[i] !== null && f < 1)) continue;
        evaluate(frets, 6, fing);
      }
    }
  }

  for (let base = 1; base <= maxFret - 2; base++) {
    const hi = Math.min(maxFret, base + MAX_SPAN);
    const options = midis.map((m) => {
      const o = [-1];
      if (chordPcs.has(mod12(m))) o.push(0);
      for (let f = base; f <= hi; f++) if (chordPcs.has(mod12(m + f))) o.push(f);
      return o;
    });
    const frets = new Array(n);
    const walk = (s) => {
      if (s === n) { evaluate(frets.slice()); return; }
      for (const f of options[s]) { frets[s] = f; walk(s + 1); }
    };
    walk(0);
  }

  function evaluate(frets, bonus = 0, fingers = null) {
    const played = frets.map((f, i) => (f >= 0 ? { i, f, midi: midis[i] + f } : null)).filter(Boolean);
    if (played.length < minPlayed) return;
    if (!played.every((p) => chordPcs.has(mod12(p.midi)))) return;
    const fretted = played.filter((p) => p.f > 0).map((p) => p.f);
    if (fretted.length) {
      const span = Math.max(...fretted) - Math.min(...fretted);
      if (span > MAX_SPAN) return;
    }
    const pcs = new Set(played.map((p) => mod12(p.midi)));
    if (!required.every((pc) => pcs.has(pc))) return;
    const lowest = played.reduce((a, b) => (b.midi < a.midi ? b : a));
    const bassOk = mod12(lowest.midi) === bassPc;
    if (!isUke && !bassOk) return;
    if (fingerCount(frets) > 4) return;
    const first = played[0].i, last = played[played.length - 1].i;
    const innerMutes = frets.slice(first, last + 1).filter((f) => f < 0).length;
    if (innerMutes > (n >= 6 ? 1 : 0)) return;
    const id = voicingId(frets);
    if (results.has(id)) return;

    const minF = fretted.length ? Math.min(...fretted) : 0;
    const maxF = fretted.length ? Math.max(...fretted) : 0;
    const opens = played.filter((p) => p.f === 0).length;
    const missingOpt = optional.filter((pc) => !pcs.has(pc)).length;
    const trebleMutes = n - 1 - last;
    const counts = {};
    played.forEach((p) => { const pc = mod12(p.midi); counts[pc] = (counts[pc] || 0) + 1; });
    const third = chord.tones.find((t) => t.deg === '3' || t.deg === 'b3');
    const doubledThird = third && counts[third.pc] > 1 ? counts[third.pc] - 1 : 0;
    const fingersUsed = fingerCount(frets);
    const usesBarre = fretted.length > fingersUsed;

    // open strings sandwiched between fretted notes high up the neck are awkward
    const sandwichedOpens = minF >= 3 ? played.filter((p) => p.f === 0 && p.i > first && p.i < last).length : 0;

    let score = 3 * played.length + bonus;
    score -= 1.5 * sandwichedOpens;
    score -= 5 * missingOpt;
    score -= 4 * innerMutes;
    score -= 2.5 * trebleMutes;
    score += maxF <= 4 ? 1.5 * opens : (minF >= 5 ? -0.7 * opens : 0);
    score -= 0.45 * minF;
    score -= usesBarre ? 2 : 0;
    score -= 0.6 * fingersUsed;
    score -= fretted.length ? 0.8 * (maxF - minF) : 0;
    score -= 1.2 * doubledThird;
    if (isUke && bassOk) score += 1.5;
    if (isUke && played.length < n) score -= 4;
    results.set(id, { ...analyseShape(frets, fingers), score });
  }

  return [...results.values()].sort((a, b) => b.score - a.score);
}

/** Pick the default voicing for a chord, optionally closest to a previous voicing. */
export function defaultVoicing(symbol, tuning, { capo = 0, previous = null, smooth = false } = {}) {
  const list = getVoicings(symbol, tuning, { capo });
  if (!list.length) return null;
  if (!smooth || !previous) return list[0];
  const cands = list.slice(0, 6);
  const centre = (v) => {
    const f = v.frets.filter((x) => x > 0);
    return f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
  };
  const pc = centre(previous);
  return cands.reduce((best, v) => (Math.abs(centre(v) - pc) < Math.abs(centre(best) - pc) ? v : best), cands[0]);
}

/** Resolve the voicing to display for a song chord (locked id or default). */
export function resolveVoicing(symbol, tuning, { capo = 0, voicingId: vid = null, previous = null, smooth = false } = {}) {
  if (vid) {
    const frets = parseVoicingId(vid, tuning.strings.length);
    if (frets) {
      const fromList = getVoicings(symbol, tuning, { capo }).find((v) => v.id === vid);
      return fromList || analyseShape(frets);
    }
  }
  return defaultVoicing(symbol, tuning, { capo, previous, smooth });
}

/** Sounding MIDI notes of a voicing (low → high by string order). */
export function voicingMidi(voicing, tuning, capo = 0) {
  const m = tuningMidi(tuning, capo);
  return voicing.frets.map((f, i) => (f >= 0 ? m[i] + f : null)).filter((x) => x !== null);
}
