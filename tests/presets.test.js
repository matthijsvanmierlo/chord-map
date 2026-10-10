import { describe, test, ok, eq } from './harness.js';
import { PRESETS, STYLES } from '../js/data/presets/index.js';
import { STRUM_PATTERNS } from '../js/data/strumPatterns.js';
import { parseBarText } from '../js/music/roman.js';
import { presetToSong } from '../js/music/song.js';
import { getVoicings } from '../js/music/voicingEngine.js';
import { getTuning } from '../js/music/tunings.js';

describe('presets', () => {
  test('ids unique, fields valid', () => {
    const ids = new Set();
    for (const p of PRESETS) {
      ok(!ids.has(p.id), `duplicate ${p.id}`); ids.add(p.id);
      ok(STYLES.some((s) => s.id === p.style), `${p.id} style`);
      ok(STRUM_PATTERNS.some((s) => s.id === p.strumPatternId), `${p.id} pattern ${p.strumPatternId}`);
      ok(p.progression || p.sections, `${p.id} has no progression`);
    }
  });
  test('every token parses and every bar is full, in every key', () => {
    for (const p of PRESETS) {
      const parts = p.sections || [{ progression: p.progression }];
      for (const tonic of [p.defaultKey.tonic, 'F', 'Bb', 'E']) {
        for (const part of parts) {
          const { bars, errors } = parseBarText(part.progression, { beatsPerBar: p.timeSignature[0], roman: true, keyTonic: tonic });
          eq(errors, [], `${p.id} in ${tonic}:`);
          bars.forEach((b, i) => eq(b.chords.reduce((s, c) => s + c.beats, 0), p.timeSignature[0], `${p.id} bar ${i + 1}:`));
        }
      }
    }
  });
  test('every preset chord is playable on guitar and ukulele', () => {
    const g = getTuning('guitar-standard'), u = getTuning('ukulele-standard');
    for (const p of PRESETS) {
      const song = presetToSong(p);
      for (const sec of song.sections) for (const bar of sec.bars) for (const c of bar.chords) {
        if (c.symbol === 'N.C.') continue;
        ok(getVoicings(c.symbol, g).length, `${p.id}: no guitar voicing for ${c.symbol}`);
        ok(getVoicings(c.symbol, u).length, `${p.id}: no uke voicing for ${c.symbol}`);
      }
    }
  });
});
