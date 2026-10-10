// Song-level helpers: timeline flattening, preset → song, transposition.
import { parseBarText, romanToChord } from './roman.js';
import { transposeChordBetweenKeys, parseChord } from './chordParser.js';
import { newSong, newSection, newBar } from '../state/schema.js';
import { simplify } from './theory.js';
import { defaultGrooveFor } from '../data/grooves.js';

/** Sections in play order (form, or natural order when form is empty). */
export function playOrder(song) {
  const byId = new Map(song.sections.map((s) => [s.id, s]));
  const order = song.form?.length ? song.form.map((id) => byId.get(id)).filter(Boolean) : song.sections;
  return order;
}

export function barBeats(bar) {
  return bar.chords.reduce((s, c) => s + c.beats, 0);
}

/**
 * Flatten a song into timed chord events (in beats of the time-signature unit).
 * @returns {{events:{symbol:string,beats:number,start:number,sectionId:string,sectionName:string,barIndex:number,chordIndex:number,voicingId:string|null,bar:number}[], totalBeats:number, bars:number}}
 */
export function timeline(song, { sectionIds = null } = {}) {
  const per = song.timeSignature[0];
  const events = [];
  let t = 0;
  let barNo = 0;
  const seen = {};
  for (const sec of playOrder(song)) {
    const occurrence = (seen[sec.id] = (seen[sec.id] ?? -1) + 1);
    if (sectionIds && !sectionIds.includes(sec.id)) continue;
    for (let r = 0; r < sec.repeat; r++) {
      sec.bars.forEach((bar, bi) => {
        let pos = 0;
        bar.chords.forEach((c, ci) => {
          events.push({ symbol: c.symbol, beats: c.beats, start: t + pos, sectionId: sec.id, sectionName: sec.name, barIndex: bi, chordIndex: ci, voicingId: c.voicingId, bar: barNo, pass: r, occurrence });
          pos += c.beats;
        });
        t += Math.max(per, pos);
        barNo++;
      });
    }
  }
  return { events, totalBeats: t, bars: barNo };
}

/** Distinct chord symbols in order of first appearance. */
export function uniqueChords(song) {
  const seen = new Map();
  for (const sec of song.sections) for (const bar of sec.bars) for (const c of bar.chords) {
    if (!seen.has(c.symbol) && !parseChord(c.symbol)?.nc) seen.set(c.symbol, c.voicingId);
  }
  return [...seen.entries()].map(([symbol, voicingId]) => ({ symbol, voicingId }));
}

/** Realise a preset (Roman numerals) as concrete sections in a key. */
export function realisePreset(preset, tonic = preset.defaultKey.tonic) {
  const beatsPerBar = preset.timeSignature[0];
  const parts = preset.sections || [{ name: 'Progression', progression: preset.progression }];
  return parts.map((p) => {
    const { bars } = parseBarText(p.progression, { beatsPerBar, roman: true, keyTonic: tonic });
    return { name: p.name, bars };
  });
}

/** Create a new Song object from a preset. */
export function presetToSong(preset, { tonic, instrumentId } = {}) {
  const key = { tonic: tonic || preset.defaultKey.tonic, mode: preset.defaultKey.mode };
  const sections = realisePreset(preset, key.tonic).map((s) =>
    newSection(s.name, s.bars.map((b) => newBar(b.chords.map((c) => ({ ...c, voicingId: null }))))));
  return newSong({
    title: preset.name,
    notes: [preset.description, preset.practiceTip].filter(Boolean).join('\n\n'),
    tags: [...(preset.tags || [])],
    style: preset.style,
    key,
    timeSignature: [...preset.timeSignature],
    tempo: preset.tempo,
    swing: !!preset.swing,
    instrumentId: instrumentId || 'guitar-standard',
    strumPatternId: preset.strumPatternId || 'quarters',
    groove: defaultGrooveFor(preset.style, preset.strumPatternId, preset.timeSignature),
    sections,
    sourcePresetId: preset.id,
  });
}

/** Transpose every chord of a song into a new key tonic (voicing locks are cleared). */
export function transposeSong(song, newTonic) {
  const from = song.key.tonic;
  const to = simplify(newTonic);
  return {
    ...song,
    key: { ...song.key, tonic: to },
    sections: song.sections.map((sec) => ({
      ...sec,
      bars: sec.bars.map((bar) => ({
        ...bar,
        chords: bar.chords.map((c) => ({ ...c, symbol: transposeChordBetweenKeys(c.symbol, from, to), voicingId: null })),
      })),
    })),
  };
}

/** Diatonic chords for the chord palette (triads + sevenths), as symbols. */
export function diatonicChords(key) {
  const sets = {
    major: [['I', 'Imaj7'], ['ii', 'ii7'], ['iii', 'iii7'], ['IV', 'IVmaj7'], ['V', 'V7'], ['vi', 'vi7'], ['vii°', 'viiø7']],
    minor: [['i', 'i7'], ['ii°', 'iiø7'], ['bIII', 'bIIImaj7'], ['iv', 'iv7'], ['v', 'v7'], ['bVI', 'bVImaj7'], ['bVII', 'bVII7']],
    harmonicMinor: [['i', 'imaj7'], ['ii°', 'iiø7'], ['bIII+', 'bIII+maj7'], ['iv', 'iv7'], ['V', 'V7'], ['bVI', 'bVImaj7'], ['vii°', 'vii°7']],
    dorian: [['i', 'i7'], ['ii', 'ii7'], ['bIII', 'bIIImaj7'], ['IV', 'IV7'], ['v', 'v7'], ['vi°', 'viø7'], ['bVII', 'bVIImaj7']],
    phrygian: [['i', 'i7'], ['bII', 'bIImaj7'], ['bIII', 'bIII7'], ['iv', 'iv7'], ['v°', 'vø7'], ['bVI', 'bVImaj7'], ['bvii', 'bvii7']],
    lydian: [['I', 'Imaj7'], ['II', 'II7'], ['iii', 'iii7'], ['#iv°', '#ivø7'], ['V', 'Vmaj7'], ['vi', 'vi7'], ['vii', 'vii7']],
    mixolydian: [['I', 'I7'], ['ii', 'ii7'], ['iii°', 'iiiø7'], ['IV', 'IVmaj7'], ['v', 'v7'], ['vi', 'vi7'], ['bVII', 'bVIImaj7']],
    locrian: [['i°', 'iø7'], ['bII', 'bIImaj7'], ['biii', 'biii7'], ['iv', 'iv7'], ['bV', 'bVmaj7'], ['bVI', 'bVI7'], ['bvii', 'bvii7']],
  };
  const rows = sets[key.mode] || sets.major;
  return rows.map(([tri, sev]) => ({
    roman: tri, triad: romanToChord(tri, key.tonic), seventh: romanToChord(sev, key.tonic), romanSeventh: sev,
  }));
}

/** Common non-diatonic "colour" chords for a key (secondary dominants, borrowed). */
export function colourChords(key) {
  const list = key.mode === 'major' || key.mode === 'lydian' || key.mode === 'mixolydian'
    ? ['V7/V', 'V7/vi', 'V7/ii', 'V7/IV', 'iv', 'bVII', 'bVI', 'bIII', 'II7', 'bII7', '#iv°7']
    : ['V7', 'IV', 'bII', 'V7/iv', 'V7/bIII', 'vii°7', 'I'];
  return list.map((r) => ({ roman: r, symbol: romanToChord(r, key.tonic) })).filter((x) => x.symbol);
}
