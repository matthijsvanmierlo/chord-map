// Strumming / picking patterns. `slots` divide one bar into equal steps
// (`perBeat` steps per beat). Tokens:
//   D = down-strum (all strings)   U = up-strum (upper strings)
//   d = short/muted down chop      B = bass note (lowest string)   b = alternate bass
//   1..4 = single treble string counted from the highest string   . = rest
// Patterns are meter-specific; a pattern whose meter differs from the song
// falls back to one strum per beat.

export const STRUM_PATTERNS = [
  { id: 'whole', name: 'Whole bar (one strum)', meter: null, perBeat: 1, slots: 'D' },
  { id: 'quarters', name: 'Quarter notes', meter: null, perBeat: 1, slots: 'D' },
  { id: 'eighths', name: 'Eighths (down-up)', meter: [4, 4], perBeat: 2, slots: 'D U D U D U D U' },
  { id: 'folk', name: 'Folk / pop (D-DU-UDU)', meter: [4, 4], perBeat: 2, slots: 'D . D U . U D U' },
  { id: 'boom-chick', name: 'Country boom-chick', meter: [4, 4], perBeat: 2, slots: 'B . D U b . D U' },
  { id: 'waltz', name: 'Waltz (bass-strum-strum)', meter: [3, 4], perBeat: 1, slots: 'B D D' },
  { id: 'six-eight', name: '6/8 · 12/8 lilt', meter: null, perBeat: 1, slots: 'B D U b D U', compound: true },
  { id: 'shuffle', name: 'Blues shuffle', meter: [4, 4], perBeat: 2, slots: 'D U D U D U D U', swing: true },
  { id: 'jazz-four', name: 'Jazz four-to-the-bar', meter: [4, 4], perBeat: 1, slots: 'd d d d' },
  { id: 'charleston', name: 'Charleston comping', meter: [4, 4], perBeat: 2, slots: 'd . . d . . . .' },
  { id: 'bossa', name: 'Bossa nova', meter: [4, 4], perBeat: 2, slots: 'B 1 . 1 b . 1 .' },
  { id: 'travis', name: 'Travis picking', meter: [4, 4], perBeat: 2, slots: 'B 1 b 2 B 1 b 2' },
  { id: 'arpeggio', name: 'Classical arpeggio (p-i-m-a)', meter: null, perBeat: 2, slots: 'B 3 2 1 2 3 B 3 2 1 2 3 B 3 2 1' },
  { id: 'reggae', name: 'Reggae skank', meter: [4, 4], perBeat: 2, slots: '. d . d . d . d' },
  { id: 'rock-eighths', name: 'Rock eighths (all down)', meter: [4, 4], perBeat: 2, slots: 'D D D D D D D D' },
  { id: 'funk', name: 'Funk sixteenths', meter: [4, 4], perBeat: 4, slots: 'D . d U . U d . D . d U . U d U' },
  { id: 'rumba', name: 'Rumba / flamenco', meter: [4, 4], perBeat: 2, slots: 'D . d U . U D U' },
];

let customPatterns = [];

/** Install user-made patterns (from settings). */
export function setCustomPatterns(list) {
  customPatterns = Array.isArray(list) ? list.filter((p) => p && p.id && p.slots) : [];
}

/** Built-in + custom patterns. */
export function allPatterns() {
  return [...STRUM_PATTERNS, ...customPatterns];
}

export function getPattern(id) {
  return allPatterns().find((p) => p.id === id) || STRUM_PATTERNS[1];
}

/** Tokens a pattern step can hold, in the order the editor cycles through them. */
export const PATTERN_TOKENS = ['.', 'D', 'U', 'd', 'B', 'b', '1', '2', '3', '4'];
export const TOKEN_NAMES = {
  '.': 'rest', D: 'down strum', U: 'up strum', d: 'muted chop', B: 'bass note', b: 'alternate bass',
  1: 'highest string', 2: '2nd string', 3: '3rd string', 4: '4th string',
};

/**
 * Expand a pattern into step events for one bar of a given meter.
 * Returns { perBeat, steps: string[] } with steps.length = beatsPerBar*perBeat.
 */
export function patternSteps(pattern, [num, den]) {
  let p = pattern;
  const fits = !p.meter || (p.meter[0] === num && p.meter[1] === den);
  if (!fits) p = getPattern('quarters');
  const tokens = p.slots.split(/\s+/);
  const perBeat = p.perBeat;
  const n = num * perBeat;
  if (p.id === 'whole') return { perBeat: 1, steps: ['D', ...Array(num - 1).fill('.')] };
  if (p.compound) {
    // 6/8-style: tokens are per eighth (beat unit), repeat across the bar
    return { perBeat: 1, steps: Array.from({ length: num }, (_, i) => tokens[i % tokens.length]) };
  }
  return { perBeat, steps: Array.from({ length: n }, (_, i) => tokens[i % tokens.length]) };
}

/** Human-readable arrows for a pattern (for display). */
export function patternLabel(pattern) {
  const map = { D: '↓', U: '↑', d: '⤓', B: 'B', b: 'b', '.': '·' };
  return pattern.slots.split(/\s+/).map((t) => map[t] || t).join(' ');
}
