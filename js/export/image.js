// Export a rendered lead sheet as a single SVG or PNG image (light colours).
import { download, slugify } from '../ui/dom.js';

const INK = '#111';
const PAPER = '#fff';

/** Replace theme-dependent colours so the image looks right anywhere. */
function fixColours(svgText) {
  return svgText
    .replace(/currentColor/g, INK)
    .replace(/var\(--[\w-]+,\s*([^)]+)\)/g, '$1');
}

/**
 * Compose an SVG from a rendered `.lead-sheet` element: text header, diagram
 * strip and each section's notation SVG stacked vertically.
 */
export function composeSVG(sheetEl, song) {
  const width = 900;
  let y = 20;
  const parts = [];
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const title = sheetEl.querySelector('.lead-sheet-title')?.textContent || song.title;
  parts.push(`<text x="${width / 2}" y="${(y += 28)}" text-anchor="middle" font-family="Georgia, serif" font-size="28" font-weight="700" fill="${INK}">${esc(title)}</text>`);
  const artist = sheetEl.querySelector('.lead-sheet-artist')?.textContent;
  if (artist) parts.push(`<text x="${width / 2}" y="${(y += 22)}" text-anchor="middle" font-family="Georgia, serif" font-size="15" font-style="italic" fill="${INK}">${esc(artist)}</text>`);
  sheetEl.querySelectorAll('.lead-sheet-meta').forEach((m) => {
    parts.push(`<text x="${width / 2}" y="${(y += 20)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#444">${esc(m.textContent.trim())}</text>`);
  });
  y += 16;
  // diagrams in rows
  const diagrams = [...sheetEl.querySelectorAll('.diagram-strip svg')];
  let dx = 20, rowH = 0;
  for (const d of diagrams) {
    const w = Number(d.getAttribute('width')), h = Number(d.getAttribute('height'));
    if (dx + w > width - 20) { dx = 20; y += rowH + 8; rowH = 0; }
    parts.push(`<svg x="${dx}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${d.innerHTML}</svg>`);
    dx += w + 10;
    rowH = Math.max(rowH, h);
  }
  y += rowH + 18;
  sheetEl.querySelectorAll('.lead-sheet-section').forEach((sec) => {
    const heading = sec.querySelector('.section-heading')?.textContent.trim().replace(/\s+/g, ' ');
    parts.push(`<text x="20" y="${(y += 20)}" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="${INK}">${esc(heading)}</text>`);
    y += 6;
    sec.querySelectorAll('.notation-host svg').forEach((s) => {
      const vb = (s.getAttribute('viewBox') || '').split(/\s+/).map(Number);
      const w = vb[2] || Number(s.getAttribute('width')), h = vb[3] || Number(s.getAttribute('height'));
      const scale = Math.min(1, (width - 20) / w);
      parts.push(`<svg x="10" y="${y}" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}">${s.innerHTML}</svg>`);
      y += h * scale + 6;
    });
    if (!sec.querySelector('.notation-host svg')) {
      const line = sec.querySelector('.chord-line')?.textContent.trim();
      parts.push(`<text x="20" y="${(y += 20)}" font-family="Arial, sans-serif" font-size="14" fill="${INK}">${esc(line)}</text>`);
      y += 8;
    }
  });
  y += 20;
  const body = parts.join('\n');
  return fixColours(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.ceil(y)}" viewBox="0 0 ${width} ${Math.ceil(y)}">
<rect width="100%" height="100%" fill="${PAPER}"/>
<g color="${INK}">${body}</g>
</svg>`);
}

export function downloadSVG(sheetEl, song) {
  download(`${slugify(song.title)}.svg`, composeSVG(sheetEl, song), 'image/svg+xml');
}

export async function downloadPNG(sheetEl, song, scale = 2) {
  const svg = composeSVG(sheetEl, song);
  const m = svg.match(/<svg[^>]*width="(\d+)" height="(\d+)"/);
  const w = Number(m[1]), h = Number(m[2]);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Could not rasterise the sheet')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    download(`${slugify(song.title)}.png`, blob, 'image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
