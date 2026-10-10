// Standard staff + TAB rendering with VexFlow (window.Vex, loaded via vendor-loader).
import { parseChord, prettyChord } from '../music/chordParser.js';
import { chordToRoman, prettyRoman } from '../music/roman.js';
import { resolveVoicing, voicingMidi } from '../music/voicingEngine.js';
import { writtenOctaveShift } from '../music/tunings.js';
import { vexKeySignature, spellMidi, spellPc, keyPrefersFlats, mod12 } from '../music/theory.js';
import { splitDuration } from '../music/durations.js';
import { escapeHtml } from '../ui/dom.js';

function vexKey(midi, spelled) {
  const s = spellMidi(midi, spelled);
  const acc = { 0: '', 1: '#', 2: '##', '-1': 'b', '-2': 'bb' }[s.acc];
  return `${s.letter.toLowerCase()}${acc}/${s.octave}`;
}

/** Chord label according to display preference. */
export function chordLabel(symbol, key, display = 'chords') {
  if (display === 'roman') return prettyRoman(chordToRoman(symbol, key.tonic));
  if (display === 'both') {
    const c = parseChord(symbol);
    return c?.nc ? 'N.C.' : `${prettyChord(symbol)} (${prettyRoman(chordToRoman(symbol, key.tonic))})`;
  }
  return prettyChord(symbol);
}

/**
 * Render sections as staff + TAB into `container`.
 * @param {HTMLElement} container
 * @param {object} song
 * @param {{tuning:object, width?:number, staff?:boolean, tab?:boolean, display?:string, smooth?:boolean, sections?:object[]}} opts
 * @returns {{bars:{section:string, index:number, x:number, y:number, w:number, h:number, svg:SVGElement}[]}}
 */
export function renderNotation(container, song, opts) {
  const VF = window.Vex?.Flow;
  container.innerHTML = '';
  if (!VF) {
    container.innerHTML = '<p class="text-body-secondary small">Notation library not available.</p>';
    return { bars: [] };
  }
  const { tuning, staff = true, tab = true, display = 'chords', smooth = false } = opts;
  const sections = opts.sections || song.sections;
  if (!staff && !tab) return { bars: [] };
  const width = Math.max(300, Math.floor(opts.width || container.clientWidth || 800));
  const [num, den] = song.timeSignature;
  const capo = song.capo || 0;
  const shift = writtenOctaveShift(tuning);
  const keySig = vexKeySignature(song.key.tonic, song.key.mode);
  const n = tuning.strings.length;
  const geometry = [];
  let prevVoicing = null;
  const flats = keyPrefersFlats(song.key.tonic, song.key.mode);

  sections.forEach((sec, secIdx) => {
    const block = document.createElement('div');
    block.className = 'notation-section';
    const bars = sec.bars;
    if (!bars.length) return;
    const maxChords = Math.max(...bars.map((b) => b.chords.length));
    const minBar = 150 + Math.max(0, maxChords - 2) * 55 + (num > 4 ? 30 : 0);
    const perLine = Math.max(1, Math.min(4, Math.floor((width - 70) / minBar)));
    const lines = Math.ceil(bars.length / perLine);
    const staffH = staff ? 110 : 0;
    const tabH = tab ? n * 13 + 34 : 0;
    const lineH = staffH + tabH + (staff ? 40 : 46);
    const height = lines * lineH + 40;

    const renderer = new VF.Renderer(block, VF.Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();
    const svg = block.querySelector('svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-labelledby', `nt-${sec.id}`);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.removeAttribute('style');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    const textAlt = [];
    for (let line = 0; line < lines; line++) {
      const lineBars = bars.slice(line * perLine, line * perLine + perLine);
      const extra = 70 + (line === 0 && secIdx === 0 ? 25 : 0) + Math.abs(keySigCount(keySig)) * 9;
      const usable = width - 20 - extra;
      const barW = usable / perLine;
      let x = 10;
      const y = 40 + line * lineH;
      lineBars.forEach((bar, j) => {
        const barIdx = line * perLine + j;
        const first = j === 0;
        const w = barW + (first ? extra : 0);
        let st = null, tb = null;
        if (staff) {
          st = new VF.Stave(x, y + (tab ? 0 : 0), w);
          if (first) {
            st.addClef('treble', 'default', shift ? '8vb' : undefined);
            if (keySig !== 'C') st.addKeySignature(keySig);
            if (line === 0 && secIdx === 0) st.addTimeSignature(`${num}/${den}`);
          }
        }
        if (tab) {
          tb = new VF.TabStave(x, y + (staff ? staffH - 20 : 20), w, { num_lines: n });
          if (first) tb.addTabGlyph();
        }
        // barlines for repeats / final
        const isLastBarOfSection = barIdx === bars.length - 1;
        const isLastOfSong = isLastBarOfSection && secIdx === sections.length - 1;
        for (const s of [st, tb].filter(Boolean)) {
          if (sec.repeat > 1 && barIdx === 0) s.setBegBarType(VF.Barline.type.REPEAT_BEGIN);
          if (sec.repeat > 1 && isLastBarOfSection) s.setEndBarType(VF.Barline.type.REPEAT_END);
          else if (isLastOfSong) s.setEndBarType(VF.Barline.type.END);
          else if (isLastBarOfSection) s.setEndBarType(VF.Barline.type.DOUBLE);
        }
        if (st && sec.repeat > 2 && isLastBarOfSection) st.setText(`×${sec.repeat}`, VF.Modifier.Position.ABOVE, { shift_x: w / 2 - 20, shift_y: -10 });
        st?.setContext(ctx).draw();
        tb?.setContext(ctx).draw();
        if (st && tb && first) {
          new VF.StaveConnector(st, tb).setType(VF.StaveConnector.type.BRACKET).setContext(ctx).draw();
          new VF.StaveConnector(st, tb).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
        }
        if (st && tb) new VF.StaveConnector(st, tb).setType(VF.StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();

        // notes
        const staffNotes = [], tabNotes = [], ties = [];
        let used = 0;
        const altParts = [];
        bar.chords.forEach((c) => {
          const chord = parseChord(c.symbol);
          altParts.push(`${chordLabel(c.symbol, song.key, display)} (${c.beats} beat${c.beats > 1 ? 's' : ''})`);
          const pieces = splitDuration(Math.min(c.beats, Math.max(0, num - used)) || c.beats, den);
          used += c.beats;
          const v = chord && !chord.nc ? resolveVoicing(c.symbol, tuning, { capo, voicingId: c.voicingId, previous: prevVoicing, smooth }) : null;
          if (v) prevVoicing = v;
          const label = chordLabel(c.symbol, song.key, display);
          let prev = null;
          pieces.forEach((p, k) => {
            let sn = null, tn = null;
            const dur = p.vex + (p.dots ? 'd' : '');
            if (v) {
              const pcName = new Map(chord.tones.map((t) => [t.pc, t.name]));
              const notes = voicingMidi(v, tuning, capo).map((m) => m + shift).sort((a, b) => a - b);
              const keys = [...new Set(notes)].map((m) => vexKey(m, pcName.get(mod12(m)) || spellPc(m, flats)));
              if (staff) sn = new VF.StaveNote({ keys, duration: dur, clef: 'treble', auto_stem: true });
              if (tab) {
                if (k === 0) {
                  const positions = v.frets.map((f, i) => (f >= 0 ? { str: n - i, fret: f } : null)).filter(Boolean);
                  tn = new VF.TabNote({ positions, duration: dur });
                } else tn = new VF.GhostNote({ duration: dur });
              }
            } else {
              if (staff) sn = new VF.StaveNote({ keys: ['b/4'], duration: dur + 'r', clef: 'treble' });
              if (tab) tn = new VF.GhostNote({ duration: dur });
            }
            if (p.dots && sn) VF.Dot.buildAndAttach([sn], { all: true });
            if (k === 0 && label) {
              const ann = new VF.Annotation(label).setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
              ann.setFont('Arial', 13, 'bold');
              if (sn) sn.addModifier(ann, 0);
              else if (tn) tn.addModifier(ann, 0);
            }
            if (sn && prev && v) ties.push([prev, sn]);
            if (sn) { staffNotes.push(sn); prev = sn; }
            if (tn) tabNotes.push(tn);
          });
        });
        // pad short bars with rests
        if (used < num) {
          splitDuration(num - used, den).forEach((p) => {
            const dur = p.vex + (p.dots ? 'd' : '');
            if (staff) {
              const r = new VF.StaveNote({ keys: ['b/4'], duration: dur + 'r', clef: 'treble' });
              if (p.dots) VF.Dot.buildAndAttach([r], { all: true });
              staffNotes.push(r);
            }
            if (tab) tabNotes.push(new VF.GhostNote({ duration: dur }));
          });
        }
        const voices = [];
        if (staff && staffNotes.length) {
          const vs = new VF.Voice({ num_beats: num, beat_value: den }).setMode(VF.Voice.Mode.SOFT);
          vs.addTickables(staffNotes);
          VF.Accidental.applyAccidentals([vs], keySig);
          voices.push(vs);
        }
        if (tab && tabNotes.length) {
          const vt = new VF.Voice({ num_beats: num, beat_value: den }).setMode(VF.Voice.Mode.SOFT);
          vt.addTickables(tabNotes);
          voices.push(vt);
        }
        if (voices.length) {
          const fmt = new VF.Formatter();
          voices.forEach((vo) => fmt.joinVoices([vo]));
          fmt.formatToStave(voices, st || tb);
          if (staff && voices[0]) voices[0].draw(ctx, st);
          if (tab) voices[voices.length - 1].draw(ctx, tb);
          ties.forEach(([a, b]) => {
            const idx = a.getKeys().map((_, i) => i);
            new VF.StaveTie({ first_note: a, last_note: b, first_indices: idx, last_indices: idx }).setContext(ctx).draw();
          });
        }
        const topY = st ? st.getYForLine(0) - 30 : tb.getYForLine(0) - 25;
        const bottomY = tb ? tb.getYForLine(n - 1) + 10 : st.getYForLine(4) + 20;
        geometry.push({ section: sec.id, index: barIdx, x, y: topY, w, h: bottomY - topY, svg });
        textAlt.push(`Bar ${barIdx + 1}: ${altParts.join(', ') || 'empty'}`);
        x += w;
      });
    }
    themeSvg(svg);
    const alt = document.createElement('p');
    alt.id = `nt-${sec.id}`;
    alt.className = 'visually-hidden';
    alt.textContent = `${sec.name}${sec.repeat > 1 ? `, play ${sec.repeat} times` : ''}. ${textAlt.join('. ')}.`;
    block.prepend(alt);
    container.append(block);
  });
  return { bars: geometry };
}

/** Make VexFlow output follow the page theme (dark mode, print). */
function themeSvg(svg) {
  svg.setAttribute('fill', 'currentColor'); // unattributed glyphs inherit the text colour
  svg.querySelectorAll('[fill="black"],[fill="#000"],[fill="#000000"],[fill="#444"],[fill="#999999"]').forEach((el) => el.setAttribute('fill', 'currentColor'));
  svg.querySelectorAll('[stroke="black"],[stroke="#000"],[stroke="#000000"],[stroke="#444"],[stroke="#999999"]').forEach((el) => el.setAttribute('stroke', 'currentColor'));
  // white knock-out boxes behind TAB numbers → page background
  svg.querySelectorAll('[fill="white"],[fill="#fff"],[fill="#FFF"],[fill="#ffffff"]').forEach((el) => {
    el.removeAttribute('fill');
    el.setAttribute('style', 'fill: var(--notation-bg, #fff)');
  });
}

function keySigCount(k) {
  const map = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
  return map[k] || 0;
}

/** Plain text fallback renderer (used when the notation library is missing). */
export function textChart(song, display) {
  return song.sections.map((s) => `${escapeHtml(s.name)}: ` + s.bars.map((b) => b.chords.map((c) => escapeHtml(chordLabel(c.symbol, song.key, display))).join(' ')).join(' | ')).join('<br>');
}
