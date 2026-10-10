import { describe, test, eq, ok } from './harness.js';
import { newSong } from '../js/state/schema.js';
import { playOrder, presetToSong, timeline } from '../js/music/song.js';
import { PRESETS } from '../js/data/presets/index.js';
import { getTuning } from '../js/music/tunings.js';
import { splitLyric, joinLyric, barToChordPro, parseChordProSegment } from '../js/music/lyrics.js';
import { toChordPro, fromChordPro } from '../js/export/chordpro.js';
import { encodeSong, decodeSong } from '../js/export/shareLink.js';
import { toMidi, chordNotes, PPQ } from '../js/export/midi.js';
import { toMusicXML } from '../js/export/musicxml.js';
import { fromMusicXML } from '../js/export/musicxmlImport.js';

const G = getTuning('guitar-standard');
const chordsOf = (s) => playOrder(s).map((x) => [x.name, x.repeat, x.bars.map((b) => b.chords.map((c) => `${c.symbol}:${c.beats}`).join(' '))]);

/** Minimal SMF reader for tests. */
function readMidi(bytes) {
  const dv = new DataView(bytes.buffer);
  const str = (o) => String.fromCharCode(...bytes.subarray(o, o + 4));
  ok(str(0) === 'MThd', 'no MThd');
  const format = dv.getUint16(8), ntrks = dv.getUint16(10), division = dv.getUint16(12);
  let p = 14;
  const tracks = [];
  for (let t = 0; t < ntrks; t++) {
    ok(str(p) === 'MTrk', 'no MTrk');
    const len = dv.getUint32(p + 4);
    let q = p + 8; const end = q + len; let tick = 0; let running = 0;
    const tr = { ons: 0, offs: 0, meta: [], lastTick: 0, ended: false };
    while (q < end) {
      let d = 0, b;
      do { b = bytes[q++]; d = (d << 7) | (b & 127); } while (b & 128);
      tick += d;
      let st = bytes[q];
      if (st & 0x80) q++; else st = running;
      if (st === 0xff) {
        const type = bytes[q++]; let l = 0;
        do { b = bytes[q++]; l = (l << 7) | (b & 127); } while (b & 128);
        tr.meta.push({ type, data: bytes.subarray(q, q + l) }); q += l;
        if (type === 0x2f) tr.ended = true;
      } else {
        running = st;
        const hi = st & 0xf0;
        if (hi === 0xc0 || hi === 0xd0) q += 1;
        else { const vel = bytes[q + 1]; if (hi === 0x90 && vel > 0) tr.ons++; else if (hi === 0x80 || hi === 0x90) tr.offs++; q += 2; }
      }
      tr.lastTick = tick;
    }
    tracks.push(tr);
    p = end;
  }
  return { format, ntrks, division, tracks };
}

const lyricSong = () => newSong({
  title: 'Lyric test', key: { tonic: 'G', mode: 'major' },
  sections: [
    { name: 'Verse', repeat: 1, bars: [
      { chords: [{ symbol: 'G', beats: 4 }], lyric: 'Hello darling' },
      { chords: [{ symbol: 'C', beats: 2 }, { symbol: 'D', beats: 2 }], lyric: 'how are ^you today' },
      { chords: [{ symbol: 'Em', beats: 3 }, { symbol: 'D', beats: 1 }] },
    ] },
    { name: 'Chorus', repeat: 2, bars: [{ chords: [{ symbol: 'C', beats: 4 }], lyric: 'la la' }, { chords: [{ symbol: 'G', beats: 4 }] }] },
  ],
});

describe('lyrics', () => {
  test('split / join', () => {
    eq(splitLyric('Hello ^world', 2), ['Hello ', 'world']);
    eq(splitLyric('a^b^c', 2), ['a', 'b c']);
    eq(splitLyric('only', 3), ['only', '', '']);
    eq(joinLyric(['a ', 'b', '']), 'a ^b');
  });
  test('bar ⇄ inline ChordPro', () => {
    eq(barToChordPro({ chords: [{ symbol: 'C' }, { symbol: 'G' }], lyric: 'Hello ^world' }), '[C]Hello [G]world');
    eq(parseChordProSegment(' [C]Hello [G]world '), { chords: ['C', 'G'], dots: [0, 0], lyric: 'Hello ^world' });
    eq(parseChordProSegment(' [Am] . . [D7] '), { chords: ['Am', 'D7'], dots: [2, 0], lyric: null });
  });
  test('ChordPro round-trip keeps lyrics, beats, sections and repeats', () => {
    const s = lyricSong();
    const { song: back, errors } = fromChordPro(toChordPro(s));
    eq(errors, []);
    eq(chordsOf(back), chordsOf(s));
    eq(back.sections[0].bars.map((b) => b.lyric ?? null), ['Hello darling', 'how are ^you today', null]);
    eq(back.sections[1].bars[0].lyric, 'la la');
  });
  test('songbook-style ChordPro (chords inline in lyrics, no bars)', () => {
    const { song } = fromChordPro('{title: Amazing}\n[G]Amazing [G7]grace, how [C]sweet the [G]sound');
    eq(song.sections[0].bars.map((b) => `${b.chords[0].symbol}|${b.lyric}`), ['G|Amazing', 'G7|grace, how', 'C|sweet the', 'G|sound']);
  });
});

describe('share links', () => {
  test('round-trip', async () => {
    const s = lyricSong();
    const code = await encodeSong(s);
    ok(/^1\.[A-Za-z0-9_-]+$/.test(code), 'not url-safe');
    const back = await decodeSong(code);
    eq(chordsOf(back), chordsOf(s));
    eq(back.title, s.title);
    eq(back.sections[0].bars[1].lyric, 'how are ^you today');
  });
  test('bad codes give friendly errors', async () => {
    let m = ''; try { await decodeSong('nope'); } catch (e) { m = e.message; } ok(/not recognised/.test(m));
    m = ''; try { await decodeSong('1.!!!!'); } catch (e) { m = e.message; } ok(/damaged/.test(m));
  });
  test('typical song fits comfortably in a URL', async () => {
    const code = await encodeSong(presetToSong(PRESETS.find((p) => p.id === 'jazz-rhythm-changes') || PRESETS[0]));
    ok(code.length < 4000, `length ${code.length}`);
  });
});

describe('MIDI export', () => {
  test('valid SMF with correct note counts', () => {
    const s = lyricSong();
    const bytes = toMidi(s, G);
    const m = readMidi(bytes);
    eq([m.format, m.ntrks, m.division], [1, 2, PPQ]);
    const expected = chordNotes(s, G).notes.length;
    eq(m.tracks[1].ons, expected);
    eq(m.tracks[1].offs, expected);
    ok(m.tracks.every((t) => t.ended), 'missing end of track');
    const tempo = m.tracks[0].meta.find((x) => x.type === 0x51).data;
    eq((tempo[0] << 16) | (tempo[1] << 8) | tempo[2], Math.round(60000000 / s.tempo));
    // last note-off lands at the end of the song
    const total = timeline(s).totalBeats * PPQ;
    ok(m.tracks[1].lastTick <= total && m.tracks[1].lastTick > total - PPQ, `last tick ${m.tracks[1].lastTick}`);
  });
  test('6/8 tempo is converted to quarter notes', () => {
    const s = newSong({ timeSignature: [6, 8], tempo: 180, sections: [{ bars: [{ chords: [{ symbol: 'C', beats: 6 }] }] }] });
    const tempo = readMidi(toMidi(s, G)).tracks[0].meta.find((x) => x.type === 0x51).data;
    eq((tempo[0] << 16) | (tempo[1] << 8) | tempo[2], Math.round(60000000 / 90));
  });
  test('extra tracks', () => {
    const m = readMidi(toMidi(lyricSong(), G, { extraTracks: [{ name: 'Bass', channel: 1, program: 33, notes: [{ tick: 0, dur: 100, midi: 43, vel: 90 }] }] }));
    eq([m.ntrks, m.tracks[2].ons], [3, 1]);
  });
});

describe('MusicXML import', () => {
  test('round-trip of every preset through our exporter', async () => {
    for (const p of PRESETS) {
      const s = presetToSong(p);
      const { song: back } = await fromMusicXML(toMusicXML(s, G));
      eq(chordsOf(back).map(([, r, b]) => [r, b]), chordsOf(s).map(([, r, b]) => [r, b]), `${p.id}:`);
      eq([back.key, back.timeSignature, back.tempo], [s.key.mode === 'harmonicMinor' ? { ...s.key, mode: 'minor' } : s.key, s.timeSignature, s.tempo], `${p.id} meta:`);
    }
  });
  test('reads a hand-written lead sheet with kinds, alters, bass and offsets', async () => {
    const xml = `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Hand</work-title></work>
      <part-list><score-part id="P1"><part-name>Lead</part-name></score-part></part-list>
      <part id="P1">
        <measure number="1"><attributes><divisions>2</divisions><key><fifths>-1</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <harmony><root><root-step>G</root-step></root><kind>minor-seventh</kind></harmony>
          <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><type>half</type></note>
          <harmony><root><root-step>C</root-step></root><kind>dominant</kind><degree><degree-value>9</degree-value><degree-alter>-1</degree-alter><degree-type>add</degree-type></degree></harmony>
          <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><type>half</type></note></measure>
        <measure number="2"><harmony><root><root-step>B</root-step><root-alter>-1</root-alter></root><kind>major</kind><bass><bass-step>D</bass-step></bass></harmony>
          <note><rest/><duration>8</duration><type>whole</type></note></measure>
        <measure number="3"><note><rest/><duration>8</duration><type>whole</type></note></measure>
      </part></score-partwise>`;
    const { song } = await fromMusicXML(xml);
    eq(song.title, 'Hand');
    eq(song.key, { tonic: 'F', mode: 'major' });
    eq(song.sections[0].bars.map((b) => b.chords.map((c) => `${c.symbol}:${c.beats}`).join(' ')), ['Gm7:2 C7b9:2', 'Bb/D:4', 'Bb/D:4']);
  });
  test('compressed .mxl', async () => {
    const xml = toMusicXML(presetToSong(PRESETS[0]), G);
    const zip = await makeZip({ 'META-INF/container.xml': '<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>', 'score.xml': xml });
    const { song } = await fromMusicXML(zip);
    eq(chordsOf(song).map(([, r, b]) => b), chordsOf(presetToSong(PRESETS[0])).map(([, r, b]) => b));
  });
  test('friendly errors', async () => {
    let m = ''; try { await fromMusicXML('<html/>'); } catch (e) { m = e.message; } ok(/not a MusicXML/.test(m));
    m = ''; try { await fromMusicXML('<score-partwise><part id="P1"><measure/></part></score-partwise>'); } catch (e) { m = e.message; } ok(/No chord symbols/.test(m));
  });
});

/** Build a small deflated ZIP in the browser (test helper). */
async function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = enc.encode(content);
    const comp = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const nameB = enc.encode(name);
    const local = new Uint8Array(30 + nameB.length); const dl = new DataView(local.buffer);
    dl.setUint32(0, 0x04034b50, true); dl.setUint16(8, 8, true); dl.setUint32(18, comp.length, true); dl.setUint32(22, raw.length, true); dl.setUint16(26, nameB.length, true);
    local.set(nameB, 30);
    const cen = new Uint8Array(46 + nameB.length); const dc = new DataView(cen.buffer);
    dc.setUint32(0, 0x02014b50, true); dc.setUint16(10, 8, true); dc.setUint32(20, comp.length, true); dc.setUint32(24, raw.length, true); dc.setUint16(28, nameB.length, true); dc.setUint32(42, offset, true);
    cen.set(nameB, 46);
    parts.push(local, comp); central.push(cen);
    offset += local.length + comp.length;
  }
  const cenSize = central.reduce((t, c) => t + c.length, 0);
  const eocd = new Uint8Array(22); const de = new DataView(eocd.buffer);
  de.setUint32(0, 0x06054b50, true); de.setUint16(8, central.length, true); de.setUint16(10, central.length, true); de.setUint32(12, cenSize, true); de.setUint32(16, offset, true);
  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((t, a) => t + a.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
