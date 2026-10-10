// Small accessible SVG charts (single series): column chart, line chart,
// sparkline. Follows the dataviz rules: one hue, thin marks, 4px rounded
// data-ends, hairline grid, hover + keyboard-focus tooltips, table fallback.
import { escapeHtml } from '../ui/dom.js';

const SERIES = 'var(--fp-brand)';
const GRID = 'var(--fp-border)';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** One shared tooltip per chart container; text set via textContent. */
function attachTooltip(wrap) {
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.setAttribute('role', 'status');
  tip.hidden = true;
  const v = document.createElement('strong');
  const l = document.createElement('span');
  tip.append(v, l);
  wrap.append(tip);
  return {
    show(target, value, label) {
      v.textContent = value;
      l.textContent = label;
      tip.hidden = false;
      const wr = wrap.getBoundingClientRect(), tr = target.getBoundingClientRect();
      const x = Math.min(Math.max(8, tr.left - wr.left + tr.width / 2 - tip.offsetWidth / 2), wr.width - tip.offsetWidth - 8);
      tip.style.left = `${x}px`;
      tip.style.top = `${Math.max(0, tr.top - wr.top - tip.offsetHeight - 8)}px`;
    },
    hide() { tip.hidden = true; },
  };
}

function tableHTML(rows, [h1, h2]) {
  return `<table class="table table-sm small chart-table"><thead><tr><th scope="col">${escapeHtml(h1)}</th><th scope="col" class="text-end">${escapeHtml(h2)}</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td class="text-end">${escapeHtml(r.display)}</td></tr>`).join('')}</tbody></table>`;
}

/**
 * Column chart. data: [{label, short, value, display}]
 * @param {HTMLElement} host
 * @param {{data:object[], title:string, valueLabel:string, height?:number}} o
 */
export function columnChart(host, { data, title, valueLabel, height = 180 }) {
  // draw at the container's real width so text isn't scaled up or down
  const w = Math.max(320, Math.round(host.clientWidth || data.length * 34 + 48));
  const padL = 36, padB = 26, padT = 10;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const plotH = height - padT - padB;
  const slot = (w - padL - 8) / data.length;
  const bw = Math.min(24, slot - 6);
  const y = (v) => padT + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const bars = data.map((d, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    const top = y(d.value);
    const h = Math.max(0, padT + plotH - top);
    const r = Math.min(4, h);
    const path = h > 0 ? `M${x},${padT + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${padT + plotH} Z` : '';
    return `<g class="chart-hit" tabindex="0" role="img" aria-label="${escapeHtml(`${d.label}: ${d.display}`)}" data-i="${i}">
      <rect x="${padL + i * slot}" y="${padT}" width="${slot}" height="${plotH}" fill="transparent"/>
      ${path ? `<path d="${path}" fill="${SERIES}"/>` : ''}
      <text x="${x + bw / 2}" y="${height - 8}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".7">${escapeHtml(d.short)}</text></g>`;
  }).join('');
  host.innerHTML = `<div class="chart-wrap">
    <svg viewBox="0 0 ${w} ${height}" width="${w}" height="${height}" class="chart-svg" aria-label="${escapeHtml(title)}">
      ${ticks.map((t) => `<line x1="${padL}" x2="${w - 8}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}" stroke-width="1"/>
        <text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" font-size="10" fill="currentColor" opacity=".7">${Math.round(t)}</text>`).join('')}
      ${bars}
    </svg></div>
    <details class="mt-1"><summary class="small">Show as table</summary>${tableHTML(data, ['Day', valueLabel])}</details>`;
  wire(host, data);
}

/**
 * Line chart with end label + crosshair. points: [{label, value, display}]
 */
export function lineChart(host, { data, title, valueLabel, height = 180, minY = null }) {
  if (data.length < 2) {
    host.innerHTML = `<p class="small text-body-secondary mb-0">Practise this song a couple more times to see a trend.</p>${data.length ? tableHTML(data, ['Session', valueLabel]) : ''}`;
    return;
  }
  const w = Math.max(320, Math.round(host.clientWidth || 560)), padL = 40, padR = 72, padB = 22, padT = 12;
  const vals = data.map((d) => d.value);
  const lo = minY ?? Math.floor(Math.min(...vals) / 10) * 10;
  const hi = niceMax(Math.max(...vals) - lo) + lo;
  const plotH = height - padT - padB, plotW = w - padL - padR;
  const x = (i) => padL + (i / (data.length - 1)) * plotW;
  const y = (v) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const last = data[data.length - 1];
  const ticks = [lo, (lo + hi) / 2, hi];
  host.innerHTML = `<div class="chart-wrap">
    <svg viewBox="0 0 ${w} ${height}" width="${w}" height="${height}" class="chart-svg" aria-label="${escapeHtml(title)}">
      ${ticks.map((t) => `<line x1="${padL}" x2="${w - padR}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}" stroke-width="1"/>
        <text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" font-size="10" fill="currentColor" opacity=".7">${Math.round(t)}</text>`).join('')}
      <polygon points="${padL},${padT + plotH} ${pts} ${x(data.length - 1)},${padT + plotH}" fill="${SERIES}" opacity=".1"/>
      <polyline points="${pts}" fill="none" stroke="${SERIES}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <line class="chart-cross" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" stroke="currentColor" stroke-width="1" opacity="0"/>
      ${data.map((d, i) => `<g class="chart-hit" tabindex="0" role="img" aria-label="${escapeHtml(`${d.label}: ${d.display}`)}" data-i="${i}" data-x="${x(i)}">
        <rect x="${x(i) - Math.max(12, plotW / data.length / 2)}" y="${padT}" width="${Math.max(24, plotW / data.length)}" height="${plotH}" fill="transparent"/>
        <circle cx="${x(i)}" cy="${y(d.value)}" r="${i === data.length - 1 ? 5 : 3}" fill="${SERIES}" stroke="var(--fp-surface)" stroke-width="2"/></g>`).join('')}
      <text x="${x(data.length - 1) + 9}" y="${y(last.value) + 4}" font-size="12" font-weight="600" fill="currentColor">${escapeHtml(last.display)}</text>
    </svg></div>
    <details class="mt-1"><summary class="small">Show as table</summary>${tableHTML(data, ['Session', valueLabel])}</details>`;
  wire(host, data);
}

function wire(host, data) {
  const wrap = host.querySelector('.chart-wrap');
  const tip = attachTooltip(wrap);
  const cross = host.querySelector('.chart-cross');
  const show = (g) => {
    const d = data[Number(g.dataset.i)];
    tip.show(g.querySelector('circle, path') || g, d.display, d.label);
    g.classList.add('is-hover');
    if (cross) { cross.setAttribute('x1', g.dataset.x); cross.setAttribute('x2', g.dataset.x); cross.setAttribute('opacity', '.35'); }
  };
  const hide = (g) => { tip.hide(); g?.classList.remove('is-hover'); cross?.setAttribute('opacity', '0'); };
  host.querySelectorAll('.chart-hit').forEach((g) => {
    g.addEventListener('pointerenter', () => show(g));
    g.addEventListener('pointerleave', () => hide(g));
    g.addEventListener('focus', () => show(g));
    g.addEventListener('blur', () => hide(g));
  });
}

/** Tiny inline trend line (de-emphasised, current point in the accent). */
export function sparklineSVG(values, { width = 120, height = 28, label = 'Trend' } = {}) {
  if (values.length < 2) return '';
  const lo = Math.min(...values), hi = Math.max(...values);
  const x = (i) => 3 + (i / (values.length - 1)) * (width - 6);
  const y = (v) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const li = values.length - 1;
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(label)}">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".45" stroke-linejoin="round"/>
    <circle cx="${x(li)}" cy="${y(values[li])}" r="3.5" fill="${SERIES}"/></svg>`;
}
