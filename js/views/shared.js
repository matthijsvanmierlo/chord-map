// Helpers shared by several views.
import { getSettings } from '../state/store.js';
import { getTuning, allTunings } from '../music/tunings.js';
import { resolveVoicing } from '../music/voicingEngine.js';
import { chordDiagramSVG } from '../render/chordDiagram.js';
import { realisePreset } from '../music/song.js';
import { chordToRoman, prettyRoman } from '../music/roman.js';
import { prettyChord } from '../music/chordParser.js';
import { escapeHtml, icon } from '../ui/dom.js';
import { STYLES } from '../data/presets/index.js';
import { KEY_TONICS, prettyAcc, keyLabel, MODES } from '../music/theory.js';

export function currentTuning() {
  return getTuning(getSettings().instrumentId);
}

export function styleInfo(id) {
  return STYLES.find((s) => s.id === id) || { id, name: id, icon: 'music-note' };
}

export function difficultyBadge(d) {
  const label = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }[d] || d;
  const dots = { beginner: 1, intermediate: 2, advanced: 3 }[d] || 1;
  return `<span class="small diff-${d}" title="${label}"><span aria-hidden="true">${'●'.repeat(dots)}${'○'.repeat(3 - dots)}</span> ${label}</span>`;
}

/** Roman + chord summary lines for a preset in a key. */
export function presetLines(preset, tonic) {
  const sections = realisePreset(preset, tonic);
  const bars = sections.flatMap((s) => s.bars);
  const chordsText = bars.map((b) => b.chords.map((c) => prettyChord(c.symbol)).join(' ')).join(' | ');
  const romanText = bars.map((b) => b.chords.map((c) => prettyRoman(chordToRoman(c.symbol, tonic))).join(' ')).join(' | ');
  const unique = [...new Set(bars.flatMap((b) => b.chords.map((c) => c.symbol)))].filter((s) => s !== 'N.C.');
  return { chordsText, romanText, unique, bars: bars.length, sections };
}

export function miniDiagrams(symbols, tuning, max = 6) {
  const s = getSettings();
  return symbols.slice(0, max).map((sym) => chordDiagramSVG(sym, resolveVoicing(sym, tuning), tuning, { width: 78, leftHanded: s.leftHanded, showTuning: false })).join('')
    + (symbols.length > max ? `<span class="small text-body-secondary align-self-center">+${symbols.length - max} more</span>` : '');
}

export function keyOptions(selectedTonic) {
  return KEY_TONICS.map((k) => `<option value="${k}" ${k === selectedTonic ? 'selected' : ''}>${prettyAcc(k)}</option>`).join('');
}

export function modeOptions(selected) {
  return Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
}

export function emptyState(iconName, title, text, actionHtml = '', level = 'h2') {
  return `<div class="empty-state surface">${icon(iconName)}<${level} class="h4 mt-3">${escapeHtml(title)}</${level}><p class="lead-soft">${escapeHtml(text)}</p>${actionHtml}</div>`;
}

/** Full-page "not found" state (carries the page's h1). */
export function notFound(iconName, title, text, actionHtml = '') {
  return emptyState(iconName, title, text, actionHtml, 'h1');
}

export function fillInstrumentSelect(select, selected) {
  const groups = { guitar: 'Guitar', ukulele: 'Ukulele', other: 'Custom' };
  const tunings = allTunings();
  select.innerHTML = Object.entries(groups).map(([k, label]) => {
    const list = tunings.filter((t) => (t.custom ? 'other' : t.instrument) === k);
    if (!list.length) return '';
    return `<optgroup label="${label}">${list.map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === selected ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}</optgroup>`;
  }).join('');
}

export { keyLabel };
