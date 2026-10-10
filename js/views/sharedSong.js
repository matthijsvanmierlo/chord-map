// Opened from a share link (#/shared?s=…): preview the song, save it locally.
import { getSong, saveSong, getSettings } from '../state/store.js';
import { decodeSong, shareSupported } from '../export/shareLink.js';
import { renderLeadSheet } from '../render/leadSheet.js';
import { getTuning } from '../music/tunings.js';
import { newId } from '../state/schema.js';
import { escapeHtml, icon, on } from '../ui/dom.js';
import { navigate } from '../router.js';
import { dialog, toast } from '../ui/feedback.js';
import { player } from '../audio/player.js';
import { notFound } from './shared.js';

export default {
  title: () => 'Shared song',
  async render(el, { query }) {
    if (!shareSupported()) {
      el.innerHTML = notFound('exclamation-triangle', 'Can’t open this link here', 'This browser is too old to open share links. Try a current Chrome, Edge, Firefox or Safari.');
      return null;
    }
    let song;
    try {
      song = await decodeSong(query.s || '');
    } catch (e) {
      el.innerHTML = notFound('link-45deg', 'This share link doesn’t work', e.message, '<a class="btn btn-primary" href="#/">Go to the home page</a>');
      return null;
    }
    el.innerHTML = `
      <div class="alert alert-info d-flex flex-wrap align-items-center gap-2" role="status">
        ${icon('link-45deg')} <span class="me-auto">Someone shared <strong>${escapeHtml(song.title)}</strong> with you. Nothing is saved until you choose to.</span>
        <button class="btn btn-primary" type="button" data-act="save">${icon('download')} Save to My Songs</button>
        <button class="btn btn-outline-primary" type="button" data-act="play">${icon('play-fill')} <span>Listen</span></button>
      </div>
      <h1 class="visually-hidden">Shared song: ${escapeHtml(song.title)}</h1>
      <div class="surface p-3" id="sheet"></div>`;
    renderLeadSheet(el.querySelector('#sheet'), song, { tuning: getTuning(song.instrumentId), settings: getSettings(), interactive: true });
    const playBtn = el.querySelector('[data-act="play"]');
    const offs = [
      player.on((type, d) => { if (type === 'state') playBtn.innerHTML = `${icon(d.playing ? 'stop-fill' : 'play-fill')} <span>${d.playing ? 'Stop' : 'Listen'}</span>`; }),
      on(el, 'click', '[data-chord]', (e, t) => player.previewChord(t.dataset.chord, getTuning(song.instrumentId), { capo: song.capo, voicingId: t.dataset.voicing || null })),
      on(el, 'click', '[data-act]', async (e, t) => {
        if (t.dataset.act === 'play') {
          if (player.playing) { player.stop(); return; }
          if (await player.load(song, getTuning(song.instrumentId), { loop: false, countIn: false, metronome: false })) player.play();
          return;
        }
        let toSave = song;
        const existing = getSong(song.id);
        if (existing) {
          const choice = await dialog({
            title: 'You already have this song',
            body: `<p>“${escapeHtml(existing.title)}” is already in My Songs. Replace your copy with the shared version, or keep both?</p>`,
            buttons: [{ label: 'Cancel', value: null }, { label: 'Keep both', value: 'both', variant: 'outline-primary' }, { label: 'Replace mine', value: 'replace', variant: 'primary' }],
          });
          if (!choice) return;
          if (choice === 'both') toSave = { ...song, id: newId(), title: `${song.title} (shared)` };
        }
        const saved = saveSong(toSave);
        toast(`Saved “${saved.title}” to My Songs`);
        navigate(`song/${saved.id}`);
      }),
    ];
    return () => { offs.forEach((o) => o()); player.stop(); };
  },
};
