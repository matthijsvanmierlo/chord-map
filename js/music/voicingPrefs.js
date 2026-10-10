// Chord-shape preferences: classify voicings (triad / shell / drop-2 / drop-3)
// and filter/reorder a voicing list by the user's preferences.
import { tuningMidi } from './tunings.js';
import { mod12 } from './theory.js';

export const STYLE_LABELS = {
  any: 'Any shape',
  triads: 'Triads (3 adjacent strings)',
  shell: 'Shell voicings (root, 3rd, 7th)',
  drop2: 'Drop-2 voicings',
  drop3: 'Drop-3 voicings',
};

/** True when prefs would not change the engine's default output. */
export function isDefaultPrefs(p) {
  return !p || (p.minFret <= 0 && p.maxFret >= 15 && p.preferOpen !== false && (p.style || 'any') === 'any' && !p.avoidBarre && (p.maxStretch ?? 4) >= 4);
}

/**
 * Shape categories for a voicing.
 * @returns {Set<'triad'|'shell'|'drop2'|'drop3'>}
 */
export function classifyVoicing(voicing, chord, tuning, capo = 0) {
  const tags = new Set();
  const open = tuningMidi(tuning, capo);
  const played = voicing.frets.map((f, i) => (f >= 0 ? { i, midi: open[i] + f } : null)).filter(Boolean);
  const pitches = played.map((p) => p.midi).sort((a, b) => a - b);
  const pcs = new Set(pitches.map(mod12));
  const strings = played.map((p) => p.i);
  const stringSpan = Math.max(...strings) - Math.min(...strings);
  const pcOf = (...degs) => chord.tones.find((t) => degs.includes(t.deg))?.pc;

  if (played.length === 3 && pcs.size === 3 && stringSpan === 2) tags.add('triad');

  const root = chord.rootPc;
  const third = pcOf('3', 'b3', '4', '2');
  const seventh = pcOf('7', 'b7', 'bb7', '6');
  const fifth = pcOf('5');
  if (third !== undefined && seventh !== undefined && (played.length === 3 || played.length === 4) && stringSpan <= 4
    && mod12(pitches[0]) === root && pcs.has(third) && pcs.has(seventh) && !(fifth !== undefined && pcs.has(fifth))) {
    tags.add('shell');
  }

  if (played.length === 4 && pcs.size === 4) {
    const [a, b, c, d] = pitches;
    const raised = a + 12;
    if (d - b < 12 && raised > c && raised < d) tags.add('drop2');
    if (d - b < 12 && raised > b && raised < c) tags.add('drop3');
  }
  return tags;
}

/**
 * Apply preferences to a best-first voicing list.
 * @returns {{list: object[], relaxed: boolean}} relaxed = nothing matched, so the unfiltered list is returned
 */
export function applyVoicingPrefs(list, prefs, chord, tuning, capo = 0) {
  if (isDefaultPrefs(prefs)) return { list, relaxed: false };
  const style = prefs.style || 'any';
  const wantTag = { triads: 'triad', shell: 'shell', drop2: 'drop2', drop3: 'drop3' }[style];
  const keep = list.filter((v) => {
    const fretted = v.frets.filter((f) => f > 0);
    const opens = v.frets.filter((f) => f === 0).length;
    if (prefs.minFret > 0 && opens) return false;
    if (fretted.length) {
      const lo = Math.min(...fretted), hi = Math.max(...fretted);
      if (lo < prefs.minFret || hi > prefs.maxFret) return false;
      if (hi - lo + 1 > (prefs.maxStretch ?? 4)) return false;
    }
    if (prefs.avoidBarre && v.barre) return false;
    if (wantTag && !classifyVoicing(v, chord, tuning, capo).has(wantTag)) return false;
    return true;
  });
  if (!keep.length) return { list, relaxed: true };
  if (prefs.preferOpen === false) {
    // closed (movable) shapes first, otherwise keep the engine's ranking
    const closed = keep.filter((v) => !v.frets.includes(0));
    const withOpen = keep.filter((v) => v.frets.includes(0));
    return { list: [...closed, ...withOpen], relaxed: false };
  }
  return { list: keep, relaxed: false };
}

/** Prefs argument for engine calls: a song's own override, or undefined (= app default). */
export function songPrefs(song) {
  return song?.voicingPrefs || undefined;
}

/** Effective prefs for a song: per-song override, else the global setting. */
export function effectivePrefs(song, settings) {
  return song?.voicingPrefs || settings?.voicing || null;
}
