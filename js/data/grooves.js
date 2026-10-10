// Backing-band grooves: drum step patterns + bass-line patterns per style.
// arrangeBand() is pure — the player (Tone.js) and MIDI export both use it.
import { timeline } from '../music/song.js';
import { parseChord } from '../music/chordParser.js';
import { mod12 } from '../music/theory.js';

// Drum steps: one character per step ("x" hit, "o" soft hit, "." rest); steps = beats × perBeat.
// Bass: id of a pattern below. `meter` null = fits any meter (generic).
export const GROOVES = [
  { id: 'none', name: 'No backing band' },
  { id: 'rock', name: 'Rock', meter: [4, 4], perBeat: 2, drums: { kick: 'x...xx..', snare: '..x...x.', hat: 'xxxxxxxx' }, bass: 'eighths' },
  { id: 'pop', name: 'Pop', meter: [4, 4], perBeat: 2, drums: { kick: 'x..xx...', snare: '..x...x.', hat: 'xoxoxoxo' }, bass: 'root-fifth' },
  { id: 'ballad', name: 'Ballad', meter: [4, 4], perBeat: 2, drums: { kick: 'x.....x.', snare: '....x...', hat: 'x.x.x.x.' }, bass: 'root' },
  { id: 'folk', name: 'Folk', meter: [4, 4], perBeat: 2, drums: { kick: 'x...x...', rim: '..x...x.', hat: 'o.o.o.o.' }, bass: 'root-fifth' },
  { id: 'country', name: 'Country two-step', meter: [4, 4], perBeat: 2, drums: { kick: 'x...x...', snare: 'oxoxoxox', hat: '..x...x.' }, bass: 'alternating' },
  { id: 'swing', name: 'Jazz swing', meter: [4, 4], perBeat: 2, swing: true, drums: { ride: 'x.xxx.xx', hat: '..x...x.', kick: 'o.o.o.o.' }, bass: 'walking' },
  { id: 'shuffle', name: 'Blues shuffle', meter: [4, 4], perBeat: 2, swing: true, drums: { kick: 'x...x...', snare: '..x...x.', hat: 'xxxxxxxx' }, bass: 'boogie' },
  { id: 'bossa', name: 'Bossa nova', meter: [4, 4], perBeat: 2, drums: { kick: 'x..xx..x', rim: 'x..x..x.', hat: 'oooooooo' }, bass: 'bossa' },
  { id: 'latin', name: 'Son / salsa', meter: [4, 4], perBeat: 2, drums: { kick: '...x...x', rim: '..x.x...', hat: 'x.x.x.x.' }, bass: 'tumbao' },
  { id: 'reggae', name: 'Reggae one-drop', meter: [4, 4], perBeat: 2, drums: { kick: '....x...', rim: '....x...', hat: '.x.x.x.x' }, bass: 'reggae' },
  { id: 'funk', name: 'Funk', meter: [4, 4], perBeat: 4, drums: { kick: 'x..x......x..x..', snare: '....x..o....x...', hat: 'xoxoxoxoxoxoxoxo' }, bass: 'funk' },
  { id: 'waltz', name: 'Waltz (3/4)', meter: [3, 4], perBeat: 1, drums: { kick: 'x..', hat: '.xx' }, bass: 'waltz' },
  { id: 'six-eight', name: '6/8 ballad', meter: [6, 8], perBeat: 1, drums: { kick: 'x.....', snare: '...x..', hat: 'xoxxox' }, bass: 'compound' },
  { id: 'twelve-eight', name: '12/8 slow blues', meter: [12, 8], perBeat: 1, swing: false, drums: { kick: 'x.....x.....', snare: '...x.....x..', hat: 'xooxooxooxoo' }, bass: 'compound' },
];

// Bass patterns relative to the chord start, repeating every `period` beats.
// Degrees: R root, 3, 5, 6, b7, 8 (octave), 5b (fifth below), N (next chord's root).
const BASS = {
  root: { period: 4, notes: [[0, 4, 'R']] },
  'root-fifth': { period: 2, notes: [[0, 1, 'R'], [1, 1, '5']] },
  alternating: { period: 2, notes: [[0, 1, 'R'], [1, 1, '5b']] },
  eighths: { period: 1, notes: [[0, 0.5, 'R'], [0.5, 0.5, 'R']] },
  boogie: { period: 4, notes: [[0, 0.5, 'R'], [0.5, 0.5, '3'], [1, 0.5, '5'], [1.5, 0.5, '6'], [2, 0.5, 'b7'], [2.5, 0.5, '6'], [3, 0.5, '5'], [3.5, 0.5, '3']] },
  bossa: { period: 4, notes: [[0, 1.5, 'R'], [1.5, 0.5, '5'], [2, 1.5, '5'], [3.5, 0.5, 'R']] },
  tumbao: { period: 4, notes: [[1.5, 1.5, '5'], [3, 1, 'N']] },
  reggae: { period: 4, notes: [[0.5, 1, 'R'], [2, 1, '5'], [3, 0.5, 'R'], [3.5, 0.5, '3']] },
  funk: { period: 4, notes: [[0, 0.25, 'R'], [0.75, 0.25, 'R'], [1.5, 0.25, '8'], [2, 0.25, 'R'], [2.75, 0.25, '5'], [3.5, 0.25, 'b7']] },
  waltz: { period: 3, notes: [[0, 1, 'R'], [1, 1, '5'], [2, 1, '5']] },
  compound: { period: 6, notes: [[0, 3, 'R'], [3, 3, '5']] },
};

const DRUM_VEL = { kick: 0.9, snare: 0.8, hat: 0.45, ride: 0.5, rim: 0.65 };
export const GM_DRUMS = { kick: 36, snare: 38, rim: 37, hat: 42, ride: 51 };

export function getGroove(id) {
  return GROOVES.find((g) => g.id === id) || GROOVES[0];
}

/** Sensible default groove for a preset/song style + strum pattern + meter. */
export function defaultGrooveFor(style, strumPatternId, [num, den] = [4, 4]) {
  const byPattern = { reggae: 'reggae', funk: 'funk', bossa: 'bossa', rumba: 'latin', waltz: 'waltz', shuffle: 'shuffle', 'jazz-four': 'swing', charleston: 'swing', 'rock-eighths': 'rock', 'boom-chick': 'country', 'six-eight': 'six-eight' };
  if (den === 8 && num === 12) return 'twelve-eight';
  if (den === 8 && num === 6) return 'six-eight';
  if (num === 3) return 'waltz';
  if (byPattern[strumPatternId]) return byPattern[strumPatternId];
  return { jazz: 'swing', blues: 'shuffle', folk: 'folk', country: 'country', pop: 'pop', rock: 'rock', latin: 'bossa', soul: 'pop', world: 'folk', classical: 'none' }[style] || 'none';
}

/** Bass register: E1 (28) … D#2 (39) for the root, so lines sit under the guitar. */
function bassRoot(pc) {
  return 28 + mod12(pc - 4);
}

function degreeMidi(chord, root, deg, nextRoot) {
  const tone = (...degs) => chord.tones.find((t) => degs.includes(t.deg));
  const off = (t, d) => (t ? mod12(t.pc - chord.rootPc) : d);
  switch (deg) {
    case 'R': return root;
    case '3': return root + off(tone('3', 'b3', '4', '2'), 4);
    case '5': return root + off(tone('5', 'b5', '#5'), 7);
    case '5b': return root + off(tone('5', 'b5', '#5'), 7) - 12;
    case '6': return root + off(tone('6', '13'), 9);
    case 'b7': return root + off(tone('b7', '7', 'bb7'), 10);
    case '8': return root + 12;
    case 'N': return nextRoot ?? root;
    default: return root;
  }
}

/** Keep a bass note in a playable register (B0–C3). */
function fold(m) {
  while (m < 23) m += 12;
  while (m > 48) m -= 12;
  return m;
}

/** Walking bass for one chord: root first, chord tones, chromatic approach to the next root. */
function walkingLine(chord, root, beats, nextRoot) {
  const tones = ['R', '3', '5', 'b7'].map((d) => degreeMidi(chord, root, d, nextRoot));
  const line = [];
  for (let b = 0; b < beats; b++) {
    if (b === 0) line.push(root);
    else if (b === beats - 1 && nextRoot != null) {
      const prev = line[line.length - 1];
      let target = nextRoot;
      while (target - prev > 6) target -= 12;
      while (prev - target > 6) target += 12;
      line.push(target + (prev > target ? 1 : -1)); // half step above or below the next root
    } else line.push(tones[b % tones.length] + (b >= 4 ? 12 : 0));
  }
  return line.map(fold);
}

/** Generic fallback groove for meters without a dedicated pattern. */
function genericGroove([num, den]) {
  const compound = den === 8 && num % 3 === 0;
  const drums = { kick: '', snare: '', hat: '' };
  for (let b = 0; b < num; b++) {
    drums.kick += b === 0 || (compound && b === num / 2) ? 'x' : '.';
    drums.snare += !compound && b % 2 === 1 ? 'x' : compound && b % 3 === 0 && b > 0 && b !== num / 2 ? 'x' : '.';
    drums.hat += 'x';
  }
  return { perBeat: 1, drums, bass: compound ? 'compound' : 'root' };
}

/**
 * Arrange bass + drums for a song.
 * @returns {{bass:{start:number,dur:number,midi:number,vel:number}[], drums:{start:number,dur:number,drum:string,vel:number}[], groove:object}}
 * Times are in beats of the song's meter (same units as timeline()).
 */
export function arrangeBand(song, { grooveId = song.groove, sectionIds = null } = {}) {
  const groove = getGroove(grooveId);
  if (!groove || groove.id === 'none') return { bass: [], drums: [], groove: GROOVES[0] };
  const ts = song.timeSignature;
  const fits = groove.meter && groove.meter[0] === ts[0] && groove.meter[1] === ts[1];
  const g = fits ? groove : { ...groove, ...genericGroove(ts) };
  const swing = (groove.swing || song.swing) && g.perBeat === 2;
  const swingPos = (t) => {
    if (!swing) return t;
    const frac = t - Math.floor(t);
    return Math.abs(frac - 0.5) < 1e-6 ? Math.floor(t) + 2 / 3 : t;
  };
  const { events, totalBeats } = timeline(song, { sectionIds });
  const num = ts[0];
  const bass = [];
  const drums = [];

  // drums: one pattern per bar
  const barStarts = [...new Set(events.filter((e) => e.chordIndex === 0).map((e) => e.start))];
  for (const bs of barStarts) {
    for (const [drum, steps] of Object.entries(g.drums)) {
      for (let i = 0; i < steps.length && i < num * g.perBeat; i++) {
        const ch = steps[i];
        if (ch === '.') continue;
        const start = bs + i / g.perBeat;
        if (start >= totalBeats) continue;
        const accent = i === 0 ? 1.1 : i % g.perBeat === 0 ? 1 : 0.85;
        drums.push({ start: swingPos(start), dur: 1 / g.perBeat / 2, drum, vel: Math.min(1, DRUM_VEL[drum] * accent * (ch === 'o' ? 0.55 : 1)) });
      }
    }
  }

  // bass: per chord event
  events.forEach((ev, i) => {
    const c = parseChord(ev.symbol);
    if (!c || c.nc) return;
    const nextC = events[i + 1] ? parseChord(events[i + 1].symbol) : null;
    const nextRoot = nextC && !nextC.nc ? bassRoot(nextC.bassPc ?? nextC.rootPc) : null;
    const root = bassRoot(c.bassPc ?? c.rootPc);
    if (g.bass === 'walking') {
      const per = Math.max(1, Math.round(ev.beats));
      walkingLine(c, root, per, nextRoot).forEach((m, k) => bass.push({ start: ev.start + k, dur: 0.95, midi: m, vel: k === 0 ? 0.85 : 0.7 }));
      return;
    }
    const pat = BASS[g.bass] || BASS.root;
    for (let base = 0; base < ev.beats; base += pat.period) {
      for (const [off, dur, deg] of pat.notes) {
        const t = base + off;
        if (t >= ev.beats - 1e-6) continue;
        const d = Math.min(dur, ev.beats - t);
        bass.push({ start: swingPos(ev.start + t), dur: d * 0.92, midi: fold(degreeMidi(c, root, deg, nextRoot)), vel: t === 0 ? 0.85 : 0.7 });
      }
    }
  });
  return { bass, drums, groove: g };
}
