// MusicXML 4.0 (partwise) export: chord symbols (<harmony>), notated chord
// voicings on a treble staff and the same voicings on a TAB staff.
import { songPrefs } from '../music/voicingPrefs.js';
import { playOrder } from '../music/song.js';
import { parseChord } from '../music/chordParser.js';
import { resolveVoicing, voicingMidi } from '../music/voicingEngine.js';
import { tuningMidi, writtenOctaveShift } from '../music/tunings.js';
import { keySignatureCount, spellMidi, spellPc, keyPrefersFlats, mod12, parseNote } from '../music/theory.js';
import { splitDuration } from '../music/durations.js';

const KIND = {
  '': 'major', m: 'minor', aug: 'augmented', dim: 'diminished', '7': 'dominant', maj7: 'major-seventh',
  m7: 'minor-seventh', dim7: 'diminished-seventh', m7b5: 'half-diminished', mmaj7: 'major-minor',
  '6': 'major-sixth', m6: 'minor-sixth', '9': 'dominant-ninth', maj9: 'major-ninth', m9: 'minor-ninth',
  '11': 'dominant-11th', m11: 'minor-11th', '13': 'dominant-13th', maj13: 'major-13th', m13: 'minor-13th',
  sus2: 'suspended-second', sus4: 'suspended-fourth', '5': 'power', aug7: 'augmented-seventh',
};

const x = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function stepAlter(name) {
  const n = parseNote(name);
  return `<root-step>${n.letter}</root-step>${n.acc ? `<root-alter>${n.acc}</root-alter>` : ''}`;
}

function harmonyXml(chord) {
  if (chord.nc) return '<harmony print-frame="no"><root><root-step text="">C</root-step></root><kind text="N.C.">none</kind></harmony>';
  const kind = KIND[chord.suffix] || 'other';
  const text = chord.suffix.replace(/^69$/, '6/9');
  let out = `<harmony print-frame="no"><root>${stepAlter(chord.root)}</root><kind text="${x(text)}">${kind}</kind>`;
  if (chord.bass) {
    const b = parseNote(chord.bass);
    out += `<bass><bass-step>${b.letter}</bass-step>${b.acc ? `<bass-alter>${b.acc}</bass-alter>` : ''}</bass>`;
  }
  return out + '</harmony>';
}

function pitchXml(midi, spelled) {
  const s = spellMidi(midi, spelled);
  return `<pitch><step>${s.letter}</step>${s.acc ? `<alter>${s.acc}</alter>` : ''}<octave>${s.octave}</octave></pitch>`;
}

/**
 * @param {object} song
 * @param {object} tuning
 * @returns {string} MusicXML document
 */
export function toMusicXML(song, tuning, { smooth = false } = {}) {
  const [num, den] = song.timeSignature;
  const capo = song.capo || 0;
  const n = tuning.strings.length;
  const divisions = 4; // per quarter → one division = one 16th
  const barDur = (num * 16) / den;
  const flats = keyPrefersFlats(song.key.tonic, song.key.mode);
  let fifths = keySignatureCount(song.key.tonic, song.key.mode);
  if (fifths > 7) fifths -= 12;
  if (fifths < -7) fifths += 12;
  const mode = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'].includes(song.key.mode) ? song.key.mode : 'minor';
  const octaveChange = writtenOctaveShift(tuning) ? '<clef-octave-change>-1</clef-octave-change>' : '';
  const today = new Date().toISOString().slice(0, 10);

  const tuningXml = tuning.strings.map((s, i) => {
    const m = s.match(/^([A-G])(#|b)?(\d)$/);
    const alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return `<staff-tuning line="${i + 1}"><tuning-step>${m[1]}</tuning-step>${alter ? `<tuning-alter>${alter}</tuning-alter>` : ''}<tuning-octave>${m[3]}</tuning-octave></staff-tuning>`;
  }).join('');

  const measures = [];
  let mNo = 0;
  let prev = null;
  const order = playOrder(song);
  order.forEach((sec, si) => {
    sec.bars.forEach((bar, bi) => {
      mNo++;
      const parts = [];
      if (mNo === 1) {
        parts.push(`<attributes><divisions>${divisions}</divisions><key><fifths>${fifths}</fifths><mode>${mode}</mode></key>`
          + `<time><beats>${num}</beats><beat-type>${den}</beat-type></time><staves>2</staves>`
          + `<clef number="1"><sign>G</sign><line>2</line>${octaveChange}</clef><clef number="2"><sign>TAB</sign><line>5</line></clef>`
          + `<staff-details number="2"><staff-lines>${n}</staff-lines>${tuningXml}${capo ? `<capo>${capo}</capo>` : ''}</staff-details></attributes>`);
        parts.push(`<direction placement="above"><direction-type><metronome><beat-unit>${den === 8 ? 'eighth' : den === 2 ? 'half' : 'quarter'}</beat-unit><per-minute>${song.tempo}</per-minute></metronome></direction-type><sound tempo="${den === 8 ? song.tempo / 2 : song.tempo}"/></direction>`);
      }
      if (bi === 0) {
        if (sec.repeat > 1) parts.push('<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>');
        parts.push(`<direction placement="above"><direction-type><rehearsal>${x(sec.name)}</rehearsal></direction-type></direction>`);
      }
      const staffNotes = [];
      const tabNotes = [];
      let used = 0;
      const emitRest = (len16) => {
        splitDuration((len16 * den) / 16, den).forEach((p) => {
          const r = `<note><rest/><duration>${p.len}</duration><voice>VOICE</voice><type>${p.type}</type>${p.dots ? '<dot/>' : ''}<staff>STAFF</staff></note>`;
          staffNotes.push(r.replace('VOICE', '1').replace('STAFF', '1'));
          tabNotes.push(r.replace('VOICE', '5').replace('STAFF', '2'));
        });
      };
      bar.chords.forEach((c) => {
        const chord = parseChord(c.symbol);
        const remaining = Math.max(0, barDur - used);
        const lenBeats = Math.min(c.beats, (remaining * den) / 16);
        if (lenBeats <= 0) return;
        const pieces = splitDuration(lenBeats, den);
        if (chord) staffNotes.push(harmonyXml(chord));
        const v = chord && !chord.nc ? resolveVoicing(c.symbol, tuning, { capo, voicingId: c.voicingId, previous: prev, smooth, prefs: songPrefs(song) }) : null;
        if (v) prev = v;
        if (!v) { emitRest(pieces.reduce((s, p) => s + p.len, 0)); used += pieces.reduce((s, p) => s + p.len, 0); return; }
        const pcName = new Map(chord.tones.map((t) => [t.pc, t.name]));
        const open = tuningMidi(tuning, capo);
        const strings = v.frets.map((f, i) => (f >= 0 ? { str: n - i, fret: f, midi: open[i] + f } : null)).filter(Boolean)
          .sort((a, b) => a.midi - b.midi);
        const uniq = [...new Set(voicingMidi(v, tuning, capo))].sort((a, b) => a - b);
        pieces.forEach((p, k) => {
          const tieStart = k < pieces.length - 1, tieStop = k > 0;
          const ties = `${tieStop ? '<tie type="stop"/>' : ''}${tieStart ? '<tie type="start"/>' : ''}`;
          const tied = tieStart || tieStop ? `<notations>${tieStop ? '<tied type="stop"/>' : ''}${tieStart ? '<tied type="start"/>' : ''}</notations>` : '';
          uniq.forEach((m, j) => {
            staffNotes.push(`<note>${j ? '<chord/>' : ''}${pitchXml(m, pcName.get(mod12(m)) || spellPc(m, flats))}<duration>${p.len}</duration>${ties}<voice>1</voice><type>${p.type}</type>${p.dots ? '<dot/>' : ''}<staff>1</staff>${tied}</note>`);
          });
          strings.forEach((s, j) => {
            const tech = `<technical><string>${s.str}</string><fret>${s.fret}</fret></technical>`;
            tabNotes.push(`<note>${j ? '<chord/>' : ''}${pitchXml(s.midi, pcName.get(mod12(s.midi)) || spellPc(s.midi, flats))}<duration>${p.len}</duration>${ties}<voice>5</voice><type>${p.type}</type>${p.dots ? '<dot/>' : ''}<staff>2</staff><notations>${tieStop ? '<tied type="stop"/>' : ''}${tieStart ? '<tied type="start"/>' : ''}${tech}</notations></note>`);
          });
          used += p.len;
        });
      });
      if (used < barDur) emitRest(barDur - used);
      parts.push(...staffNotes, `<backup><duration>${barDur}</duration></backup>`, ...tabNotes);
      const lastOfSec = bi === sec.bars.length - 1;
      const lastOfSong = lastOfSec && si === order.length - 1;
      if (lastOfSec && sec.repeat > 1) parts.push(`<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward" times="${sec.repeat}"/></barline>`);
      else if (lastOfSong) parts.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
      else if (lastOfSec) parts.push('<barline location="right"><bar-style>light-light</bar-style></barline>');
      measures.push(`<measure number="${mNo}">${parts.join('')}</measure>`);
    });
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
<work><work-title>${x(song.title)}</work-title></work>
<identification>${song.artist ? `<creator type="composer">${x(song.artist)}</creator>` : ''}<encoding><software>Fretboard Progressions</software><encoding-date>${today}</encoding-date></encoding></identification>
<part-list><score-part id="P1"><part-name>${x(tuning.instrument === 'ukulele' ? 'Ukulele' : 'Guitar')}</part-name></score-part></part-list>
<part id="P1">
${measures.join('\n')}
</part>
</score-partwise>
`;
}

