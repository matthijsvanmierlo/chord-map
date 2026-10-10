// Full song sheet: title/meta, chord-diagram strip and staff+TAB per section.
import { songPrefs } from '../music/voicingPrefs.js';
import { uniqueChords, playOrder } from '../music/song.js';
import { resolveVoicing } from '../music/voicingEngine.js';
import { chordDiagramSVG } from './chordDiagram.js';
import { renderNotation, chordLabel } from './notation.js';
import { keyLabel } from '../music/theory.js';
import { getPattern, patternLabel } from '../data/strumPatterns.js';
import { escapeHtml } from '../ui/dom.js';
import { splitLyric, songHasLyrics } from '../music/lyrics.js';

/** Chords-over-words block for a section (bars without lyrics still show their chords). */
function lyricSheetHTML(sec, song, display) {
  return `<div class="lyric-sheet">${sec.bars.map((bar) => {
    const segs = splitLyric(bar.lyric, bar.chords.length);
    return `<span class="ls-bar">${bar.chords.map((c, i) => `<span class="ls-seg"><span class="ls-chord">${escapeHtml(chordLabel(c.symbol, song.key, display))}</span><span class="ls-words">${escapeHtml(segs[i] || '') || '&nbsp;'}</span></span>`).join('')}</span>`;
  }).join('')}</div>`;
}

/**
 * Render a lead sheet into `container`.
 * @param {HTMLElement} container
 * @param {object} song
 * @param {{tuning:object, settings:object, width?:number, showMeta?:boolean}} opts
 */
export function renderLeadSheet(container, song, { tuning, settings, width, showMeta = true, interactive = false }) {
  const notation = settings.notation;
  const display = settings.chordDisplay;
  const chords = uniqueChords(song);
  const meta = [
    keyLabel(song.key),
    `${song.timeSignature[0]}/${song.timeSignature[1]}`,
    `♩ = ${song.tempo}`,
    song.capo ? `Capo ${song.capo}` : '',
    tuning.name,
    `Strum: ${getPattern(song.strumPatternId).name}`,
  ].filter(Boolean);

  container.innerHTML = `
    <div class="lead-sheet">
      ${showMeta ? `<header class="lead-sheet-head">
        <h2 class="lead-sheet-title">${escapeHtml(song.title)}</h2>
        ${song.artist ? `<p class="lead-sheet-artist">${escapeHtml(song.artist)}</p>` : ''}
        <p class="lead-sheet-meta">${meta.map(escapeHtml).join(' · ')}</p>
        <p class="lead-sheet-meta small">Pattern: <span class="font-monospace">${escapeHtml(patternLabel(getPattern(song.strumPatternId)))}</span></p>
      </header>` : ''}
      ${notation.diagrams ? `<div class="diagram-strip" aria-label="Chord shapes used">
        ${chords.map((c) => {
          const svg = chordDiagramSVG(c.symbol, resolveVoicing(c.symbol, tuning, { capo: song.capo, voicingId: c.voicingId, prefs: songPrefs(song) }), tuning, { width: 104, leftHanded: settings.leftHanded, capo: song.capo });
          return interactive
            ? `<button type="button" class="diagram-button diagram-cell" data-chord="${escapeHtml(c.symbol)}" data-voicing="${escapeHtml(c.voicingId || '')}" title="Play ${escapeHtml(c.symbol)}">${svg}</button>`
            : `<figure class="diagram-cell">${svg}</figure>`;
        }).join('')}
      </div>` : ''}
      <div class="lead-sheet-sections"></div>
      ${song.notes && showMeta ? `<section class="lead-sheet-notes"><h3 class="h6">Notes</h3><p>${escapeHtml(song.notes).replace(/\n/g, '<br>')}</p></section>` : ''}
    </div>`;
  const host = container.querySelector('.lead-sheet-sections');
  const w = width || host.clientWidth || 800;
  const result = { bars: [] };
  const showLyrics = notation.lyrics !== false && songHasLyrics(song);
  const seen = {};
  for (const sec of playOrder(song)) {
    const occurrence = (seen[sec.id] = (seen[sec.id] ?? -1) + 1);
    const wrap = document.createElement('section');
    wrap.className = 'lead-sheet-section';
    wrap.innerHTML = `<h3 class="section-heading">${escapeHtml(sec.name)}${sec.repeat > 1 ? ` <span class="badge text-bg-secondary">×${sec.repeat}</span>` : ''}</h3>
      ${showLyrics && sec.bars.some((b) => b.lyric) ? lyricSheetHTML(sec, song, display) : `<p class="chord-line">${sec.bars.map((b) => b.chords.map((c) => escapeHtml(chordLabel(c.symbol, song.key, display))).join(' ')).join(' <span aria-hidden="true">|</span> ')}</p>`}
      <div class="notation-host"></div>`;
    host.append(wrap);
    if (notation.staff || notation.tab) {
      const r = renderNotation(wrap.querySelector('.notation-host'), song, {
        tuning, width: w, staff: notation.staff, tab: notation.tab, display, smooth: settings.smoothVoicing, sections: [sec], lyrics: showLyrics,
      });
      result.bars.push(...r.bars.map((b) => ({ ...b, occurrence })));
    }
  }
  return result;
}
