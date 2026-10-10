// ChordPro export / import (https://www.chordpro.org/).
// Bars are written as  | [Dm7] [G7] | [Cmaj7] |  with beat dots when uneven.
import { playOrder } from '../music/song.js';
import { parseBarText, splitEvenly } from '../music/roman.js';
import { parseChord } from '../music/chordParser.js';
import { parseNote, MODES } from '../music/theory.js';
import { newSong, newSection, newBar } from '../state/schema.js';

export function toChordPro(song) {
  const lines = [];
  const [num, den] = song.timeSignature;
  lines.push(`{title: ${song.title}}`);
  if (song.artist) lines.push(`{artist: ${song.artist}}`);
  const keyName = song.key.tonic + (song.key.mode === 'minor' ? 'm' : '');
  lines.push(`{key: ${keyName}}`);
  if (!['major', 'minor'].includes(song.key.mode)) lines.push(`{meta: mode ${song.key.mode}}`);
  lines.push(`{time: ${num}/${den}}`);
  lines.push(`{tempo: ${song.tempo}}`);
  if (song.capo) lines.push(`{capo: ${song.capo}}`);
  if (song.tags?.length) lines.push(`{meta: tags ${song.tags.join(', ')}}`);
  if (song.notes) song.notes.split(/\n+/).filter(Boolean).forEach((n) => lines.push(`{comment_italic: ${n}}`));
  lines.push('');
  for (const sec of playOrder(song)) {
    const env = /chorus/i.test(sec.name) ? 'chorus' : /bridge/i.test(sec.name) ? 'bridge' : 'verse';
    lines.push(`{start_of_${env}: ${sec.name}${sec.repeat > 1 ? ` (x${sec.repeat})` : ''}}`);
    for (let i = 0; i < sec.bars.length; i += 4) {
      const chunk = sec.bars.slice(i, i + 4).map((bar) => {
        const even = splitEvenly(num, bar.chords.length);
        const isEven = bar.chords.every((c, k) => c.beats === even[k]);
        return bar.chords.map((c) => `[${c.symbol}]` + (isEven ? '' : ' .'.repeat(Math.max(0, c.beats - 1)))).join(' ');
      });
      lines.push(`| ${chunk.join(' | ')} |`);
    }
    lines.push(`{end_of_${env}}`, '');
  }
  return lines.join('\n');
}

/** Parse ChordPro text → Song (throws on empty). */
export function fromChordPro(text) {
  const meta = {};
  const sections = [];
  let current = null;
  const ensure = (name = 'Verse') => {
    if (!current) { current = { name, repeat: 1, lines: [] }; sections.push(current); }
    return current;
  };
  const directive = /^\{\s*([\w_-]+)\s*(?::\s*(.*?))?\s*\}$/;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const d = line.match(directive);
    if (d) {
      const k = d[1].toLowerCase();
      const v = (d[2] || '').trim();
      if (['title', 't'].includes(k)) meta.title = v;
      else if (['artist', 'subtitle', 'st'].includes(k)) meta.artist = meta.artist || v;
      else if (k === 'key') meta.key = v;
      else if (k === 'tempo') meta.tempo = Number(v);
      else if (k === 'time') meta.time = v;
      else if (k === 'capo') meta.capo = Number(v);
      else if (/^(start_of_|so)/.test(k)) {
        const kind = k.replace(/^start_of_/, '').replace(/^so/, '');
        const label = v || ({ c: 'Chorus', v: 'Verse', b: 'Bridge', chorus: 'Chorus', verse: 'Verse', bridge: 'Bridge', grid: 'Grid' }[kind] || 'Section');
        const rep = label.match(/\(x(\d+)\)\s*$/);
        current = { name: label.replace(/\s*\(x\d+\)\s*$/, ''), repeat: rep ? Number(rep[1]) : 1, lines: [] };
        sections.push(current);
      } else if (/^(end_of_|eo)/.test(k)) current = null;
      else if (['comment', 'c', 'comment_italic', 'ci'].includes(k) && !current) meta.notes = [meta.notes, v].filter(Boolean).join('\n');
      continue;
    }
    const chords = [...line.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
    if (!chords.length) continue;
    const sec = ensure();
    if (line.includes('|')) {
      // bar notation: keep dots for beat lengths
      sec.lines.push(line.replace(/\[([^\]]+)\]/g, ' $1 '));
    } else {
      sec.lines.push(chords.join(' | '));
    }
  }
  const [num, den] = (meta.time || '4/4').split('/').map(Number);
  const beatsPerBar = num > 0 && num <= 16 ? num : 4;
  const errors = [];
  const songSections = sections.map((s) => {
    const { bars, errors: e } = parseBarText(s.lines.join(' | '), { beatsPerBar });
    errors.push(...e);
    return { ...newSection(s.name, bars.map((b) => newBar(b.chords.map((c) => ({ ...c, voicingId: null }))))), repeat: Math.min(16, Math.max(1, s.repeat)) };
  }).filter((s) => s.bars.length);
  if (!songSections.length) throw new Error('No chords found in this ChordPro file.');
  let key = { tonic: 'C', mode: 'major' };
  const km = String(meta.key || '').match(/^([A-G](?:#|b)?)(m|min)?$/);
  if (km && parseNote(km[1])) key = { tonic: km[1], mode: km[2] ? 'minor' : 'major' };
  else {
    const first = parseChord(songSections[0].bars[0].chords[0].symbol);
    if (first && !first.nc) key = { tonic: first.root, mode: /^m(?!aj)/.test(first.suffix) ? 'minor' : 'major' };
  }
  const song = newSong({
    title: meta.title || 'Imported song',
    artist: meta.artist || '',
    notes: meta.notes || '',
    key: MODES[key.mode] ? key : { tonic: 'C', mode: 'major' },
    timeSignature: [beatsPerBar, [2, 4, 8, 16].includes(den) ? den : 4],
    tempo: meta.tempo > 0 ? meta.tempo : 90,
    capo: meta.capo > 0 ? meta.capo : 0,
    sections: songSections,
  });
  return { song, errors };
}

