// Accessible SVG chord-box diagrams for any number of strings.
import { prettyChord, describeChord } from '../music/chordParser.js';
import { prettyAcc } from '../music/theory.js';
import { escapeHtml } from '../ui/dom.js';

const FINGER_NAMES = ['', 'index', 'middle', 'ring', 'pinky'];

/** Screen-reader description of a voicing. */
export function describeVoicing(symbol, voicing, tuning, capo = 0) {
  if (!voicing) return `${describeChord(symbol)}: no playable shape found`;
  const strings = tuning.strings.map((s) => s.replace(/\d+$/, ''));
  const parts = voicing.frets.map((f, i) => {
    const s = `${strings[i]} string`;
    if (f < 0) return `${s} muted`;
    if (f === 0) return `${s} open`;
    const fing = voicing.fingers?.[i] ? ` ${FINGER_NAMES[voicing.fingers[i]]} finger` : '';
    return `${s} fret ${f}${fing}`;
  });
  return `${describeChord(symbol)}${capo ? `, capo ${capo}` : ''}: ${parts.join(', ')}`;
}

/**
 * Render a chord diagram as an SVG string.
 * @param {string} symbol
 * @param {import('../music/voicingEngine.js').Voicing|null} voicing
 * @param {import('../music/tunings.js').Tuning} tuning
 * @param {{width?:number, leftHanded?:boolean, showName?:boolean, showTuning?:boolean, capo?:number, className?:string}} opts
 */
export function chordDiagramSVG(symbol, voicing, tuning, opts = {}) {
  const { width = 120, leftHanded = false, showName = true, showTuning = true, capo = 0, className = '' } = opts;
  const n = tuning.strings.length;
  const label = escapeHtml(describeVoicing(symbol, voicing, tuning, capo));
  const name = escapeHtml(prettyChord(symbol));
  const padL = 22, padR = 10;
  const top = (showName ? 30 : 6) + 16;
  const gridW = width - padL - padR;
  const sx = gridW / (n - 1);
  const frets = voicing ? voicing.frets : new Array(n).fill(-1);
  const fretted = frets.filter((f) => f > 0);
  const base = voicing ? voicing.baseFret : 1;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const rows = Math.max(4, Math.min(6, maxF - base + 1));
  const fy = Math.min(26, sx * 1.25);
  const gridH = rows * fy;
  const height = top + gridH + (showTuning ? 22 : 8);
  const x = (i) => padL + (leftHanded ? n - 1 - i : i) * sx;
  const y = (row) => top + row * fy;
  const out = [];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" class="chord-diagram ${className}" viewBox="0 0 ${width} ${height.toFixed(1)}" width="${width}" height="${height.toFixed(1)}" role="img" aria-label="${label}">`);
  out.push(`<title>${label}</title>`);
  if (showName) out.push(`<text x="${width / 2 + (padL - padR) / 2}" y="20" text-anchor="middle" class="cd-name" font-size="17" font-weight="600" fill="currentColor">${name}</text>`);
  if (!voicing) {
    out.push(`<text x="${width / 2}" y="${top + gridH / 2}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">no shape</text></svg>`);
    return out.join('');
  }
  // strings
  for (let i = 0; i < n; i++) out.push(`<line x1="${x(i)}" y1="${y(0)}" x2="${x(i)}" y2="${y(rows)}" stroke="currentColor" stroke-width="1.1" opacity=".85"/>`);
  // frets
  for (let r = 0; r <= rows; r++) {
    const nut = r === 0 && base === 1;
    out.push(`<line x1="${padL}" y1="${y(r)}" x2="${padL + gridW}" y2="${y(r)}" stroke="currentColor" stroke-width="${nut ? 4.5 : 1.1}" ${nut ? 'stroke-linecap="square"' : 'opacity=".85"'}/>`);
  }
  if (base > 1) out.push(`<text x="${padL - 6}" y="${y(0) + fy * 0.68}" text-anchor="end" font-size="11" fill="currentColor">${base}fr</text>`);
  // open / muted markers
  frets.forEach((f, i) => {
    const cy = top - 9;
    if (f < 0) {
      const d = 4;
      out.push(`<path d="M${x(i) - d} ${cy - d}L${x(i) + d} ${cy + d}M${x(i) + d} ${cy - d}L${x(i) - d} ${cy + d}" stroke="currentColor" stroke-width="1.5"/>`);
    } else if (f === 0) {
      out.push(`<circle cx="${x(i)}" cy="${cy}" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/>`);
    }
  });
  const r = Math.min(sx * 0.38, fy * 0.38);
  // barre
  const b = voicing.barre;
  if (b) {
    const row = b.fret - base;
    const x1 = Math.min(x(b.from), x(b.to)), x2 = Math.max(x(b.from), x(b.to));
    out.push(`<rect x="${x1 - r}" y="${y(row) + fy / 2 - r}" width="${x2 - x1 + 2 * r}" height="${2 * r}" rx="${r}" fill="currentColor" class="cd-dot"/>`);
  }
  // dots
  frets.forEach((f, i) => {
    if (f <= 0) return;
    const row = f - base;
    const cx = x(i), cy = y(row) + fy / 2;
    const onBarre = b && f === b.fret && i >= b.from && i <= b.to && voicing.fingers?.[i] === voicing.fingers?.[b.from];
    if (!onBarre) out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" class="cd-dot"/>`);
    const fing = voicing.fingers?.[i];
    if (fing && (!onBarre || i === b.from)) {
      out.push(`<text x="${onBarre && b ? (x(b.from) + x(b.to)) / 2 : cx}" y="${cy + r * 0.42}" text-anchor="middle" font-size="${(r * 1.2).toFixed(1)}" font-weight="700" class="cd-finger" style="fill: var(--cd-finger, #fff)">${fing}</text>`);
    }
  });
  if (showTuning) {
    tuning.strings.forEach((s, i) => {
      out.push(`<text x="${x(i)}" y="${y(rows) + 15}" text-anchor="middle" font-size="9.5" fill="currentColor" opacity=".7">${escapeHtml(prettyAcc(s.replace(/\d+$/, '')))}</text>`);
    });
  }
  out.push('</svg>');
  return out.join('');
}
