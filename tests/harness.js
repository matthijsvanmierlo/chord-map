// Minimal in-browser test harness (no dependencies). Open tests/index.html,
// or run headless: chromium --headless --dump-dom http://localhost:8000/tests/
const results = [];
let current = '';

export function describe(name, fn) { current = name; fn(); current = ''; }

const pending = [];

/** Sync or async test. Results keep declaration order. */
export function test(name, fn) {
  const full = current ? `${current} › ${name}` : name;
  const row = { name: full, ok: true };
  results.push(row);
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      pending.push(r.then(() => {}, (e) => { row.ok = false; row.error = e.message; }));
    }
  } catch (e) { row.ok = false; row.error = e.message; }
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`);
}

export function ok(cond, msg = 'assertion failed') { if (!cond) throw new Error(msg); }

export async function report() {
  await Promise.all(pending);
  const failed = results.filter((r) => !r.ok);
  const out = document.getElementById('results');
  out.innerHTML = '';
  const summary = document.createElement('p');
  summary.id = 'summary';
  summary.textContent = `${results.length - failed.length}/${results.length} passed` + (failed.length ? ` — ${failed.length} FAILED` : ' — ALL PASS');
  summary.style.fontWeight = 'bold';
  summary.style.color = failed.length ? '#b00020' : '#0a7a2f';
  out.append(summary);
  const ul = document.createElement('ul');
  for (const r of [...failed, ...results.filter((x) => x.ok)]) {
    const li = document.createElement('li');
    li.textContent = `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.error ? '  →  ' + r.error : ''}`;
    if (!r.ok) li.style.color = '#b00020';
    ul.append(li);
  }
  out.append(ul);
  document.title = failed.length ? 'FAIL' : 'PASS';
}
