// Reharmonisation ideas for one chord in a song. Pure: every suggestion's
// apply(song) returns a NEW song object; nothing is mutated.
import { parseChord, prettyChord, transposeChord } from './chordParser.js';
import { romanToChord, chordToRoman, prettyRoman } from './roman.js';
import { transposeNote, simplify, mod12, pcOf } from './theory.js';

/** Flattened chord positions in editor order. */
function positions(song) {
  const out = [];
  song.sections.forEach((sec, si) => sec.bars.forEach((bar, bi) => bar.chords.forEach((c, ci) => out.push({ si, bi, ci, sectionId: sec.id, barId: bar.id, chord: c }))));
  return out;
}

function replaceAt(song, sectionId, barId, chordIdx, newChords) {
  const next = structuredClone(song);
  const bar = next.sections.find((s) => s.id === sectionId)?.bars.find((b) => b.id === barId);
  if (!bar) return next;
  bar.chords.splice(chordIdx, 1, ...newChords.map(([symbol, beats]) => ({ symbol, beats, voicingId: null })));
  return next;
}

const isMinor = (c) => c.tones.some((t) => t.deg === 'b3');
const hasDeg = (c, d) => c.tones.some((t) => t.deg === d);
const isDominant = (c) => hasDeg(c, '3') && hasDeg(c, 'b7');
const isMajorTriadish = (c) => hasDeg(c, '3') && !hasDeg(c, 'b7') && !hasDeg(c, '7') && c.kind !== 'augmented';
const fifthAbove = (note) => simplify(transposeNote(note, [5, 7]));
const label = (syms) => syms.map(prettyChord).join(' → ');

/**
 * Suggestions for the chord at (sectionId, barId, chordIdx).
 * @returns {{id:string, label:string, chords:[string, number][], explanation:string, apply:(song:object)=>object}[]}
 */
export function reharmSuggestions(song, sectionId, barId, chordIdx) {
  const pos = positions(song);
  const i = pos.findIndex((p) => p.sectionId === sectionId && p.barId === barId && p.ci === chordIdx);
  if (i < 0) return [];
  const cur = parseChord(pos[i].chord.symbol);
  if (!cur || cur.nc) return [];
  const beats = pos[i].chord.beats;
  const nextRaw = pos[i + 1] ? parseChord(pos[i + 1].chord.symbol) : null;
  const next = nextRaw && !nextRaw.nc ? nextRaw : null;
  const prevRaw = pos[i - 1] ? parseChord(pos[i - 1].chord.symbol) : null;
  const tonic = song.key.tonic;
  const roman = chordToRoman(cur.symbol, tonic);
  const half = Math.floor(beats / 2);
  const out = [];
  const add = (id, chords, explanation) => {
    if (chords.some(([s]) => !parseChord(s))) return;
    if (chords.length === 1 && chords[0][0] === cur.symbol) return;
    if (out.some((o) => o.label === label(chords.map(([s]) => s)))) return;
    out.push({ id, chords, label: label(chords.map(([s]) => s)), explanation, apply: (s) => replaceAt(s, sectionId, barId, chordIdx, chords) });
  };
  const resolvesDownFifth = next && mod12(cur.rootPc - next.rootPc) === 7;
  const domSuffix = ['7', '9', '13'].includes(cur.suffix) ? cur.suffix : '7';

  // 1. Tritone substitution
  if (resolvesDownFifth && isDominant(cur)) {
    const sub = transposeChord(cur.root + domSuffix, [5, 6]);
    add('tritone', [[sub, beats]], `Tritone substitution: ${prettyChord(sub)} shares the tritone of ${prettyChord(cur.symbol)} and slides down a half step into ${prettyChord(next.symbol)}.`);
  }
  // 2. Insert the related ii before a V
  if (resolvesDownFifth && (isDominant(cur) || isMajorTriadish(cur)) && beats >= 2) {
    const ii = fifthAbove(cur.root) + (isMinor(next) ? 'm7b5' : 'm7');
    const alreadyThere = prevRaw && !prevRaw.nc && prevRaw.rootPc === parseChord(ii)?.rootPc;
    if (!alreadyThere) {
      add('ii-v', [[ii, half], [cur.root + domSuffix, beats - half]], `ii–V: put ${prettyChord(ii)} (the ii of ${prettyChord(next.symbol)}) before the dominant so the roots fall in fifths.`);
    }
  }
  // 3. Secondary dominant of the next chord
  if (next) {
    const v = fifthAbove(next.root) + '7';
    const target = prettyRoman(chordToRoman(next.symbol, tonic).replace(/\/.*$/, ''));
    if (!(cur.rootPc === parseChord(v).rootPc && isDominant(cur))) {
      add('secondary', [[v, beats]], `Secondary dominant: ${prettyChord(v)} is V7 of ${prettyChord(next.symbol)} (V7/${target}) and pulls strongly into it.`);
      if (beats >= 2) add('approach', [[cur.symbol, half], [v, beats - half]], `Keep ${prettyChord(cur.symbol)}, then approach ${prettyChord(next.symbol)} with its dominant ${prettyChord(v)} for the last ${beats - half} beat${beats - half > 1 ? 's' : ''}.`);
    }
  }
  // 4. Backdoor ii–V into the tonic
  if (next && next.rootPc === pcOf(tonic) && !isMinor(next) && cur.rootPc === pcOf(fifthAbove(tonic))) {
    const iv7 = romanToChord('iv7', tonic), bVII7 = romanToChord('bVII7', tonic);
    if (beats >= 2) add('backdoor', [[iv7, half], [bVII7, beats - half]], `Backdoor progression: ${prettyChord(iv7)} → ${prettyChord(bVII7)} resolves to ${prettyChord(next.symbol)} from a whole step below — a softer, bluesy cadence.`);
    add('backdoor-short', [[bVII7, beats]], `Backdoor dominant: ${prettyChord(bVII7)} (♭VII7) resolves up a whole step to the tonic instead of V7.`);
  }
  // 5. Diatonic relatives (shared notes)
  const base = roman.replace(/\/.*$/, '');
  if (/^I(maj7|6|69|add9)?$/.test(base)) {
    add('relative-vi', [[romanToChord('vi7', tonic), beats]], `Relative substitute: vi7 shares three notes with I and gives a softer, minor colour.`);
    add('relative-iii', [[romanToChord('iii7', tonic), beats]], `Relative substitute: iii7 shares three notes with Imaj7 — common in jazz turnarounds.`);
  }
  if (/^IV(maj7|6|add9)?$/.test(base)) add('relative-ii', [[romanToChord('ii7', tonic), beats]], `Relative substitute: ii7 has the same function as IV (pre-dominant) and leads smoothly to V.`);
  // 6. Modal interchange (borrowed from the parallel minor)
  if (/^IV(maj7|6)?$/.test(base)) add('minor-iv', [[romanToChord(cur.suffix === '6' ? 'iv6' : 'iv', tonic), beats]], `Borrowed minor iv: the ♭6 of the key adds a bittersweet colour (the "Beatles" or "plagal minor" sound).`);
  if (/^vi7?$/.test(base)) add('bVI', [[romanToChord('bVI', tonic), beats]], `Borrowed ♭VI from the parallel minor — a dramatic, cinematic surprise.`);
  if (/^ii7?$/.test(base)) add('ii-half-dim', [[romanToChord('iiø7', tonic), beats]], `Borrowed iiø7 from the parallel minor — darker pre-dominant before V.`);
  if (/^V7?$/.test(base) && next && next.rootPc === pcOf(tonic)) add('bVII', [[romanToChord('bVII', tonic), beats]], `♭VII → I (Mixolydian cadence) instead of V → I — the rock/folk "back-door" sound.`);
  // 7. Diminished passing chord
  if (next && mod12(next.rootPc - cur.rootPc) === 2 && beats >= 2) {
    const dim = simplify(transposeNote(cur.root, [1, 1])) + 'dim7';
    add('passing-dim', [[cur.symbol, half], [dim, beats - half]], `Passing diminished: ${prettyChord(dim)} creates a chromatic bass line up to ${prettyChord(next.symbol)}.`);
  }
  // 8. Colour: add sevenths / extensions
  const colour = {
    '': /^V$/.test(base) ? ['7', '9'] : ['maj7', '6', 'add9'],
    m: ['m7', 'm9'], '7': ['9', '13'], m7: ['m9', 'm11'], maj7: ['maj9', '69'], '6': ['69'], sus4: ['7sus4'],
  }[cur.suffix];
  (colour || []).slice(0, 2).forEach((suf) => {
    const sym = cur.root + suf + (cur.bass ? '/' + cur.bass : '');
    add(`colour-${suf}`, [[sym, beats]], `Colour: ${prettyChord(sym)} keeps the same function with a richer sound.`);
  });
  return out;
}
