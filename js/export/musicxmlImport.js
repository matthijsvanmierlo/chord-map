// MusicXML import (.musicxml / .xml, and compressed .mxl). Reads chord symbols
// (<harmony>), meter, key, tempo, rehearsal marks (→ sections) and repeats.
import { parseChord } from '../music/chordParser.js';
import { MODES, transposeNote, simplify, noteName } from '../music/theory.js';
import { newSong, newSection, newBar } from '../state/schema.js';

// MusicXML <kind> values → our chord suffixes (inverse of the export table).
const KIND_SUFFIX = {
  major: '', minor: 'm', augmented: 'aug', diminished: 'dim', dominant: '7', 'major-seventh': 'maj7',
  'minor-seventh': 'm7', 'diminished-seventh': 'dim7', 'augmented-seventh': 'aug7', 'half-diminished': 'm7b5',
  'major-minor': 'mmaj7', 'major-sixth': '6', 'minor-sixth': 'm6', 'dominant-ninth': '9', 'major-ninth': 'maj9',
  'minor-ninth': 'm9', 'dominant-11th': '11', 'major-11th': 'maj9', 'minor-11th': 'm11', 'dominant-13th': '13',
  'major-13th': 'maj13', 'minor-13th': 'm11', 'suspended-second': 'sus2', 'suspended-fourth': 'sus4', power: '5',
  'Neapolitan': '', 'Italian': '7', 'French': '7b5', 'German': '7', pedal: '', other: '',
};
const MAJOR_BY_FIFTHS = { '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#' };

// ---------- .mxl (ZIP) ----------

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Minimal ZIP reader: returns Map(name → async () => Uint8Array). */
function readZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This .mxl file is not a valid ZIP archive.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    files.set(name, async () => {
      const lnlen = dv.getUint16(local + 26, true), lelen = dv.getUint16(local + 28, true);
      const start = local + 30 + lnlen + lelen;
      const data = buf.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error('Unsupported compression in .mxl file.');
    });
    p += 46 + nlen + elen + clen;
  }
  return files;
}

async function mxlToXml(bytes) {
  const files = readZip(bytes);
  let path = null;
  if (files.has('META-INF/container.xml')) {
    const c = new TextDecoder().decode(await files.get('META-INF/container.xml')());
    path = new DOMParser().parseFromString(c, 'application/xml').querySelector('rootfile')?.getAttribute('full-path');
  }
  if (!path || !files.has(path)) path = [...files.keys()].find((n) => /\.(xml|musicxml)$/i.test(n) && !n.startsWith('META-INF'));
  if (!path) throw new Error('No MusicXML score found inside this .mxl file.');
  return new TextDecoder().decode(await files.get(path)());
}

// ---------- parsing ----------

const txt = (el, sel) => el?.querySelector(sel)?.textContent?.trim() ?? '';

function harmonySymbol(h) {
  const kindEl = h.querySelector('kind');
  const kind = kindEl?.textContent.trim() || 'major';
  if (kind === 'none') return 'N.C.';
  const step = txt(h, 'root > root-step');
  if (!step) return null;
  const root = noteName(step, Number(txt(h, 'root > root-alter')) || 0);
  const textAttr = kindEl?.getAttribute('text');
  let suffix = KIND_SUFFIX[kind] ?? '';
  if (textAttr != null && parseChord(root + textAttr.replace(/^6\/9$/, '69'))) suffix = parseChord(root + textAttr.replace(/^6\/9$/, '69')).suffix;
  // <degree> alterations (e.g. add b9) when no usable text attribute
  if (textAttr == null) {
    h.querySelectorAll('degree').forEach((d) => {
      const v = txt(d, 'degree-value'), a = Number(txt(d, 'degree-alter')) || 0, type = txt(d, 'degree-type');
      if (type === 'subtract') return;
      const acc = a < 0 ? 'b' : a > 0 ? '#' : '';
      const cand = suffix + (type === 'add' && !acc ? `add${v}` : `${acc}${v}`);
      if (parseChord(root + cand)) suffix = parseChord(root + cand).suffix;
    });
  }
  let sym = root + suffix;
  const bassStep = txt(h, 'bass > bass-step');
  if (bassStep) sym += '/' + noteName(bassStep, Number(txt(h, 'bass > bass-alter')) || 0);
  return parseChord(sym)?.symbol || null;
}

/**
 * Import MusicXML text or .mxl bytes → { song, warnings }.
 * @param {string|Uint8Array|ArrayBuffer} input
 */
export async function fromMusicXML(input) {
  let xml = input;
  if (input instanceof ArrayBuffer) xml = new Uint8Array(input);
  if (xml instanceof Uint8Array) {
    xml = xml[0] === 0x50 && xml[1] === 0x4b ? await mxlToXml(xml) : new TextDecoder().decode(xml);
  }
  const doc = new DOMParser().parseFromString(String(xml), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This file is not valid MusicXML.');
  if (doc.documentElement.nodeName === 'score-timewise') throw new Error('Timewise MusicXML is not supported — re-export as “partwise” (the default in most apps).');
  if (doc.documentElement.nodeName !== 'score-partwise') throw new Error('This XML file is not a MusicXML score.');
  const warnings = [];
  const parts = [...doc.querySelectorAll('part')];
  const part = parts.find((p) => p.querySelector('harmony')) || parts[0];
  if (!part || !part.querySelector('harmony')) throw new Error('No chord symbols found. Only scores with chord symbols (lead sheets) can be imported.');

  let divisions = 1, beats = 4, beatType = 4, fifths = 0, mode = 'major', tempo = null;
  const sections = [];
  let current = null;
  let lastChord = null;
  const startSection = (name) => { current = { name, repeat: 1, bars: [], open: false }; sections.push(current); };

  for (const m of part.querySelectorAll(':scope > measure')) {
    const attr = m.querySelector('attributes');
    if (attr) {
      if (attr.querySelector('divisions')) divisions = Number(txt(attr, 'divisions')) || divisions;
      if (attr.querySelector('time beats')) { beats = Number(txt(attr, 'time beats')) || beats; beatType = Number(txt(attr, 'time beat-type')) || beatType; }
      if (attr.querySelector('key fifths')) { fifths = Number(txt(attr, 'key fifths')) || 0; mode = txt(attr, 'key mode') || mode; }
    }
    const reh = m.querySelector('direction rehearsal');
    if (reh || !current) startSection(reh?.textContent.trim() || (sections.length ? `Section ${sections.length + 1}` : 'A'));
    if (tempo === null) {
      const pm = txt(m, 'metronome per-minute');
      const snd = m.querySelector('sound[tempo]')?.getAttribute('tempo');
      if (pm) tempo = Number(pm); else if (snd) tempo = Math.round((Number(snd) * beatType) / 4);
    }
    if (m.querySelector('barline[location="left"] repeat[direction="forward"]') && current.bars.length) startSection(`${current.name} (repeat)`);

    // walk the measure in time order; harmony elements mark chord starts
    const measureLen = (beats * 4 * divisions) / beatType;
    let pos = 0;
    const starts = [];
    for (const el of m.children) {
      if (el.nodeName === 'harmony') {
        const sym = harmonySymbol(el);
        const off = Number(txt(el, 'offset')) || 0;
        if (sym) starts.push({ pos: Math.max(0, Math.min(measureLen - 1, pos + off)), sym });
        else warnings.push('Skipped a chord symbol that could not be read');
      } else if (el.nodeName === 'note') {
        if (!el.querySelector('chord') && !el.querySelector('grace')) pos += Number(txt(el, 'duration')) || 0;
      } else if (el.nodeName === 'backup') pos -= Number(txt(el, 'duration')) || 0;
      else if (el.nodeName === 'forward') pos += Number(txt(el, 'duration')) || 0;
    }
    starts.sort((a, b) => a.pos - b.pos);
    const unit = (4 * divisions) / beatType; // divisions per meter beat
    const chords = [];
    if (!starts.length || starts[0].pos > 0) {
      if (lastChord) chords.push({ symbol: lastChord, start: 0 });
    }
    starts.forEach((s) => { if (!chords.length || chords[chords.length - 1].start !== s.pos) chords.push({ symbol: s.sym, start: s.pos }); else chords[chords.length - 1].symbol = s.sym; });
    if (!chords.length) chords.push({ symbol: 'N.C.', start: 0 });
    const barBeats = beats;
    let used = 0;
    const barChords = chords.map((c, i) => {
      const end = i < chords.length - 1 ? chords[i + 1].start : measureLen;
      const b = i === chords.length - 1 ? Math.max(1, barBeats - used) : Math.max(1, Math.round((end - c.start) / unit));
      used += b;
      return { symbol: c.symbol, beats: b, voicingId: null };
    });
    lastChord = barChords[barChords.length - 1].symbol;
    current.bars.push(newBar(barChords));

    const back = m.querySelector('barline[location="right"] repeat[direction="backward"]');
    if (back) {
      current.repeat = Math.min(16, Math.max(2, Number(back.getAttribute('times')) || 2));
      startSection(current.name.replace(/ \(repeat\)$/, '') + ' (cont.)');
    }
  }

  const finalSections = sections.filter((s) => s.bars.length)
    .map((s) => ({ ...newSection(s.name.replace(/ \(cont\.\)$/, ''), s.bars), repeat: s.repeat }));
  const modeKey = MODES[mode] ? mode : 'major';
  const majorTonic = MAJOR_BY_FIFTHS[Math.max(-7, Math.min(7, fifths))];
  const tonic = modeKey === 'major' ? majorTonic : simplify(transposeNote(majorTonic, MODES[modeKey].fromMajor));
  const title = txt(doc, 'work > work-title') || txt(doc, 'movement-title') || 'Imported score';
  const composer = [...doc.querySelectorAll('identification creator')].find((c) => c.getAttribute('type') === 'composer')?.textContent.trim() || '';
  const song = newSong({
    title, artist: composer, key: { tonic, mode: modeKey }, timeSignature: [beats, beatType],
    tempo: tempo > 0 ? Math.round(tempo) : 90, sections: finalSections,
  });
  return { song, warnings: [...new Set(warnings)] };
}
