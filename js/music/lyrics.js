// Lyrics live on bars: bar.lyric is the text sung during the bar. A "^" marks
// where the next chord of the bar starts inside the text, e.g. for a bar with
// C and G: "Hello ^world" → C on "Hello", G on "world".

/** Split a bar lyric into one segment per chord (padded / merged as needed). */
export function splitLyric(lyric, chordCount) {
  const n = Math.max(1, chordCount);
  const parts = String(lyric || '').split('^');
  if (parts.length > n) parts.splice(n - 1, parts.length, parts.slice(n - 1).join(' '));
  while (parts.length < n) parts.push('');
  return parts;
}

/** Inverse of splitLyric. */
export function joinLyric(segments) {
  const s = segments.map((x) => x ?? '');
  while (s.length > 1 && !s[s.length - 1].trim()) s.pop();
  return s.join('^');
}

/** Plain text of a lyric (anchors removed). */
export function lyricText(lyric) {
  return String(lyric || '').replace(/\^/g, '');
}

export function songHasLyrics(song) {
  return song.sections.some((s) => s.bars.some((b) => b.lyric && b.lyric.trim()));
}

/** One bar as inline ChordPro: "[C]Hello [G]world". */
export function barToChordPro(bar) {
  const segs = splitLyric(bar.lyric, bar.chords.length);
  return bar.chords.map((c, i) => `[${c.symbol}]${segs[i]}`).join('');
}

/**
 * Parse one ChordPro bar segment (text between "|" or a whole lyric line chunk)
 * → { chords: string[], dots: number[], lyric: string|null }.
 * Text before the first chord is kept at the start of the lyric.
 */
export function parseChordProSegment(text) {
  const chords = [];
  const pieces = [];
  let pre = '';
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (!chords.length) pre = text.slice(0, m.index);
    else pieces.push(text.slice(last, m.index));
    chords.push(m[1].trim());
    last = re.lastIndex;
  }
  if (chords.length) pieces.push(text.slice(last));
  // beat dots ("." tokens) after a chord extend it; anything else is lyric text
  const dots = pieces.map((p) => (p.match(/(?:^|\s)\.(?=\s|$)/g) || []).length);
  const words = pieces.map((p) => p.replace(/(?:^|\s)\.(?=\s|$)/g, ' '));
  const hasWords = (pre + words.join('')).replace(/[\s|]/g, '').length > 0;
  const segs = words.map((w) => w.replace(/\s+/g, ' '));
  if (pre.trim()) segs[0] = pre.replace(/\s+/g, ' ') + segs[0];
  const lyric = hasWords ? joinLyric(segs.map((s, i) => (i === segs.length - 1 ? s.trimEnd() : s))).replace(/^\s+/, '') : null;
  return { chords, dots, lyric };
}
