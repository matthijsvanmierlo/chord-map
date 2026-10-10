// Pure practice-log statistics (used by Train and the Practice dashboard).

const DAY = 86400000;

/** Local calendar day key "YYYY-MM-DD". */
export function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Canonical key for a chord pair (order-independent). */
export function pairKey(a, b) {
  return [a, b].sort().join('|');
}

/**
 * Headline numbers + daily totals.
 * @param {object[]} log practice-log entries
 * @param {{seconds:number, entries:number}} totals archived totals
 */
export function practiceSummary(log, totals = { seconds: 0, entries: 0 }, now = new Date(), days = 14) {
  const byDay = new Map();
  for (const e of log) byDay.set(dayKey(e.date), (byDay.get(dayKey(e.date)) || 0) + e.seconds);
  const daily = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    daily.push({ date: d, key: dayKey(d), seconds: byDay.get(dayKey(d)) || 0 });
  }
  // streak: consecutive days with any practice, ending today (or yesterday if nothing yet today)
  let streak = 0;
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!byDay.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY);
  while (byDay.has(dayKey(cursor))) { streak++; cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1); }
  const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  return {
    totalSeconds: totals.seconds + log.reduce((s, e) => s + e.seconds, 0),
    sessions: totals.entries + log.length,
    weekSeconds: log.filter((e) => new Date(e.date) >= weekAgo).reduce((s, e) => s + e.seconds, 0),
    streak,
    daily,
  };
}

/** Seconds practised per ref (songs/presets), most first. */
export function timeByRef(log, totals = { byRef: {} }, kind = 'practice') {
  const m = new Map(Object.entries(totals.byRef || {}));
  for (const e of log) if (e.kind === kind && e.ref) m.set(e.ref, (m.get(e.ref) || 0) + e.seconds);
  return [...m.entries()].map(([ref, seconds]) => ({ ref, seconds })).sort((a, b) => b.seconds - a.seconds);
}

/** Tempo reached per practice session for one song, oldest first. */
export function tempoHistory(log, ref) {
  return log.filter((e) => e.kind === 'practice' && e.ref === ref && e.tempoEnd).sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ date: e.date, tempo: e.tempoEnd }));
}

/** Drill results for a chord pair: { best, last, history: number[] }. */
export function drillStats(log, ref) {
  const runs = log.filter((e) => e.kind === 'drill' && e.ref === ref).sort((a, b) => a.date.localeCompare(b.date));
  // normalise to changes per minute so different durations compare fairly
  const perMin = runs.map((e) => Math.round((e.score || 0) * 60 / Math.max(1, e.seconds)));
  return { runs: runs.length, best: perMin.length ? Math.max(...perMin) : null, last: perMin[perMin.length - 1] ?? null, history: perMin };
}

/** Quiz accuracy per mode: { ref: {correct, total, pct} } */
export function quizAccuracy(log) {
  const out = {};
  for (const e of log) {
    if (e.kind !== 'quiz') continue;
    const r = (out[e.ref] ||= { correct: 0, total: 0 });
    r.correct += e.score || 0;
    r.total += e.total || 0;
  }
  for (const r of Object.values(out)) r.pct = r.total ? Math.round((100 * r.correct) / r.total) : 0;
  return out;
}

export function formatDuration(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

// ---------- flashcards (Leitner boxes) ----------

/** Days until a card in each box is due again. */
export const BOX_INTERVAL_DAYS = [0, 0, 1, 3, 7, 16];

/** New Leitner state after a rating: 'again' | 'hard' | 'good'. */
export function rateCard(card, rating, now = new Date()) {
  const box = card?.box || 1;
  const next = rating === 'good' ? Math.min(5, box + 1) : rating === 'hard' ? box : 1;
  const due = new Date(now.getTime() + BOX_INTERVAL_DAYS[next] * DAY + (rating === 'again' ? 60000 : 0));
  return { box: next, due: due.toISOString() };
}

/** Cards due now (or never seen), oldest due first, capped. */
export function dueCards(keys, state, now = new Date(), limit = 20) {
  return keys
    .map((k) => ({ k, due: state[k] ? Date.parse(state[k].due) : 0, box: state[k]?.box || 0 }))
    .filter((c) => c.due <= now.getTime())
    .sort((a, b) => a.due - b.due || a.box - b.box)
    .slice(0, limit)
    .map((c) => c.k);
}
