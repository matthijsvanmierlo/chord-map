// Horizontal fretboard map (SVG) for any tuning: chord tones, scale notes and
// the current shape. Highest-pitched string on top, like TAB.
import { tuningMidi } from '../music/tunings.js';
import { mod12, prettyAcc } from '../music/theory.js';
import { escapeHtml } from '../ui/dom.js';

/**
 * @param {{tuning:object, capo?:number, fromFret?:number, toFret?:number, leftHanded?:boolean,
 *   chordPcs?:number[], rootPc?:number|null, scalePcs?:number[], names?:Map<number,string>, labels?:Map<number,string>,
 *   showIntervals?:boolean, voicing?:{frets:number[]}|null, title?:string}} o
 * @returns {{svg:string, positions:{string:number, stringName:string, fret:number, pc:number, name:string, kind:string}[]}}
 */
export function fretboardSVG(o) {
  const { tuning, capo = 0, fromFret = 0, toFret = 12, leftHanded = false, chordPcs = [], rootPc = null, scalePcs = [],
    names = new Map(), labels = new Map(), showIntervals = false, voicing = null, title = 'Fretboard' } = o;
  const open = tuningMidi(tuning, capo);
  const n = open.length;
  const fw = 46, sh = 26, padL = 34, padT = 18, padB = 26;
  const frets = toFret - fromFret + 1; // includes the "open" column when fromFret = 0
  const width = padL + frets * fw + 12;
  const height = padT + (n - 1) * sh + padB;
  // string index 0 (chin side, usually lowest) at the bottom
  const y = (s) => padT + (n - 1 - s) * sh;
  const xCol = (f) => {
    const col = f - fromFret;
    const x = padL + col * fw + fw / 2;
    return leftHanded ? width - x : x;
  };
  const out = [];
  const positions = [];
  const chord = new Set(chordPcs);
  const scale = new Set(scalePcs);

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" class="fretboard" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(title)}">`);
  out.push(`<title>${escapeHtml(title)}</title>`);
  // inlays
  for (let f = Math.max(1, fromFret); f <= toFret; f++) {
    const fx = xCol(f);
    const mid = padT + ((n - 1) * sh) / 2;
    if ([3, 5, 7, 9, 15, 17, 19, 21].includes(f)) out.push(`<circle cx="${fx}" cy="${mid}" r="5" fill="currentColor" opacity=".12"/>`);
    if (f === 12 || f === 24) out.push(`<circle cx="${fx}" cy="${mid - sh}" r="5" fill="currentColor" opacity=".12"/><circle cx="${fx}" cy="${mid + sh}" r="5" fill="currentColor" opacity=".12"/>`);
    out.push(`<text x="${fx}" y="${height - 6}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">${f + capo}</text>`);
  }
  // fret wires (between columns); a left border when the map doesn't start at the nut
  if (fromFret > 0) {
    const xl = leftHanded ? xCol(fromFret) + fw / 2 : xCol(fromFret) - fw / 2;
    out.push(`<line x1="${xl}" y1="${y(n - 1)}" x2="${xl}" y2="${y(0)}" stroke="currentColor" stroke-width="1.2" opacity=".6"/>`);
  }
  for (let f = fromFret; f <= toFret; f++) {
    const xl = leftHanded ? xCol(f) - fw / 2 : xCol(f) + fw / 2;
    if (f === 0) {
      out.push(`<line x1="${xl}" y1="${y(n - 1) - 4}" x2="${xl}" y2="${y(0) + 4}" stroke="currentColor" stroke-width="5"/>`);
    } else {
      out.push(`<line x1="${xl}" y1="${y(n - 1)}" x2="${xl}" y2="${y(0)}" stroke="currentColor" stroke-width="1.2" opacity=".6"/>`);
    }
  }
  // strings
  for (let s = 0; s < n; s++) {
    const x1 = leftHanded ? 12 : padL, x2 = leftHanded ? width - padL : width - 12;
    out.push(`<line x1="${x1}" y1="${y(s)}" x2="${x2}" y2="${y(s)}" stroke="currentColor" stroke-width="${1 + (n - s) * 0.18}" opacity=".85"/>`);
    out.push(`<text x="${leftHanded ? width - 14 : 14}" y="${y(s) + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor">${escapeHtml(prettyAcc(tuning.strings[s].replace(/\d+$/, '')))}</text>`);
  }
  // notes
  for (let s = 0; s < n; s++) {
    for (let f = fromFret; f <= toFret; f++) {
      const pc = mod12(open[s] + f);
      const inChord = chord.has(pc), inScale = scale.has(pc);
      if (!inChord && !inScale) continue;
      const isRoot = pc === rootPc;
      const inShape = voicing && voicing.frets[s] === f;
      const kind = isRoot ? 'root' : inChord ? 'chord' : 'scale';
      const name = names.get(pc) || '';
      positions.push({ string: s, stringName: tuning.strings[s].replace(/\d+$/, ''), fret: f, pc, name, kind, inShape: !!inShape });
      const cx = xCol(f), cy = y(s);
      const label = showIntervals ? (labels.get(pc) || '') : prettyAcc(name);
      const cls = `fb-note fb-${kind}${inShape ? ' fb-shape' : ''}`;
      if (kind === 'scale') out.push(`<circle class="${cls}" cx="${cx}" cy="${cy}" r="10" fill="var(--fb-bg, #fff)" stroke="currentColor" stroke-width="1.5"/>`);
      else out.push(`<circle class="${cls}" cx="${cx}" cy="${cy}" r="11" stroke-width="${inShape ? 3 : 0}"/>`);
      out.push(`<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="${label.length > 2 ? 8.5 : 10}" font-weight="700" class="fb-label fb-label-${kind}">${escapeHtml(label)}</text>`);
    }
  }
  out.push('</svg>');
  return { svg: out.join(''), positions };
}

/** Plain-language list of positions for screen readers / a text view. */
export function positionsText(positions) {
  const byString = new Map();
  for (const p of positions) {
    const k = `${p.stringName}-${p.string}`;
    if (!byString.has(k)) byString.set(k, { name: p.stringName, items: [] });
    byString.get(k).items.push(`${p.fret === 0 ? 'open' : `fret ${p.fret}`} ${prettyAcc(p.name)}${p.kind === 'root' ? ' (root)' : p.kind === 'scale' ? '' : ''}`);
  }
  return [...byString.values()].reverse().map((s) => `${prettyAcc(s.name)} string: ${s.items.join(', ')}`);
}
