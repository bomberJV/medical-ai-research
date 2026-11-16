import {seeded} from '../shared/core.js';

const NS = 'http://www.w3.org/2000/svg';
const $ = id => document.getElementById(id);
const pct = v => `${(v * 100).toFixed(1)}%`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function el(name, attrs = {}, text) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}
function randomIndex(n) {
  const limit = Math.floor(2 ** 32 / n) * n; let v;
  do { v = crypto.getRandomValues(new Uint32Array(1))[0]; } while (v >= limit);
  return v % n;
}
// Draw each chart at the pixel width it is shown at, so text and marks keep their size on a phone.
function fit(svg, height, draw) {
  let last = 0;
  const run = () => {
    const w = Math.max(280, Math.round(svg.getBoundingClientRect().width));
    if (w === last) return;
    last = w; svg.setAttribute('viewBox', `0 0 ${w} ${height}`); svg.replaceChildren(); draw(w);
  };
  new ResizeObserver(run).observe(svg.parentElement); run();
}

const data = await fetch('leakage-data.json').then(r => r.json());

/* 01 — the one-column rule */
{
  const svg = $('strip'), cut = $('cut'), rnd = seeded(299);
  const pts = data.patients.map(([t, died]) => ({t, died, j: rnd() - 0.5}));
  const rows = {1: 78, 0: 185}, clean = data.settings.clean.cv_acc;
  const accAt = T => pts.reduce((s, d) => s + ((d.t < T) === (d.died === 1)), 0) / pts.length;
  let x = () => 0, line = null, chosen = false;
  $('cleanacc').textContent = pct(clean);
  function paint() {
    const T = +cut.value; $('cutval').textContent = T;
    line.setAttribute('x1', x(T)); line.setAttribute('x2', x(T));
    for (const d of pts) {
      const right = (d.t < T) === (d.died === 1);
      d.c.setAttribute('fill', right ? (d.died ? 'var(--pink)' : 'var(--lime)') : 'transparent');
      d.c.setAttribute('stroke', d.died ? 'var(--pink)' : 'var(--lime)');
      d.c.setAttribute('fill-opacity', right ? 0.8 : 1);
    }
    const a = accAt(T); $('ruleacc').textContent = pct(a);
    let note = a > clean
      ? `The rule beats every clinical measurement combined by ${((a - clean) * 100).toFixed(1)} points. Filled dots are right, hollow dots are wrong.`
      : 'Filled dots are right, hollow dots are wrong. Keep dragging.';
    if (chosen) note += ' (This cutoff was chosen on the same 299 patients, so it flatters itself a little. It still uses no medical information.)';
    $('rulenote').textContent = note;
  }
  fit(svg, 255, W => {
    const left = 14, right = W - 14;
    x = d => left + d / 290 * (right - left);
    svg.append(el('text', {x: left, y: 30, class: 'strong'}, 'Died during follow-up'));
    svg.append(el('text', {x: left, y: 135, class: 'strong'}, 'Survived to the end of follow-up'));
    for (const d of (W < 500 ? [0, 100, 200] : [0, 50, 100, 150, 200, 250])) svg.append(el('text', {x: x(d), y: 240, 'text-anchor': d ? 'middle' : 'start'}, `${d} d`));
    for (const d of pts) { d.c = el('circle', {cx: x(d.t), cy: rows[d.died] + d.j * 44, r: W < 500 ? 3.2 : 4}); svg.append(d.c); }
    line = el('line', {y1: 40, y2: 215, stroke: 'var(--pink)', 'stroke-width': 2});
    svg.append(line); paint();
  });
  cut.addEventListener('input', () => { chosen = false; paint(); });
  $('bestcut').addEventListener('click', () => {
    let best = 4, bestA = 0;
    for (let T = 4; T <= 285; T++) { const a = accAt(T); if (a > bestA) { bestA = a; best = T; } }
    cut.value = best; chosen = true; paint();
  });
}

/* 02 — how scores inflate */
{
  const state = {time: false, smote: false, rolls: 0, best: null, last: null};
  const svg = $('claims'), rnd = seeded(64);
  const studies = data.studies.filter(s => s.acc != null).map(s => ({...s, j: rnd() - 0.5}));
  let x = () => 0, mark = null, markLabel = null, width = 0;
  const key = () => (state.time ? 'time' : 'clean') + (state.smote ? '+smote' : '');
  const notes = {
    'clean': 'No leaks. This is roughly what the data supports.',
    'time': '<b>Leak 1.</b> The model now sees how long each patient was followed, which is not known when a baseline prediction is made.',
    'clean+smote': '<b>Leak 2.</b> Synthetic patients are interpolated from real ones before the split, so near-copies of test patients end up in the training set.',
    'time+smote': '<b>Both leaks.</b> Most of the studies reporting 90% or more included follow-up time. Now draw a few single splits.'
  };
  function show(v, label) {
    const leaky = state.time || state.smote;
    $('score').textContent = pct(v); $('score').classList.toggle('leaky', leaky);
    $('scorelabel').textContent = label;
    mark.setAttribute('x', x(v) - 2); mark.classList.toggle('leaky', leaky);
    markLabel.setAttribute('x', clamp(x(v), 44, width - 44));
  }
  function refresh() {
    const s = data.settings[key()];
    $('t-time').setAttribute('aria-pressed', state.time); $('t-smote').setAttribute('aria-pressed', state.smote);
    $('rolls').textContent = state.rolls; $('best').textContent = state.best == null ? '–' : pct(state.best);
    let note = notes[key()];
    if (state.rolls) note += ` The highest split so far is ${((state.best - s.cv_acc) * 100).toFixed(1)} points above this setup's average of ${pct(s.cv_acc)}.`;
    $('leaknote').innerHTML = note;
    if (state.last == null) show(s.cv_acc, 'average, 100 cross-validation runs');
    else show(state.last, `this split · average ${pct(s.cv_acc)}`);
  }
  fit(svg, 170, W => {
    width = W; const left = 24, right = W - 24;
    x = v => left + (v - 0.5) / 0.5 * (right - left);
    for (const v of (W < 500 ? [0.5, 0.75, 1] : [0.5, 0.6, 0.7, 0.8, 0.9, 1])) {
      svg.append(el('line', {x1: x(v), x2: x(v), y1: 20, y2: 130, class: 'gridline'}));
      svg.append(el('text', {x: x(v), y: 152, 'text-anchor': 'middle'}, `${Math.round(v * 100)}%`));
    }
    for (const s of studies) {
      const used = s.code === 'used', out = s.code === 'not used';
      svg.append(el('circle', {cx: x(Math.min(s.acc, 100) / 100), cy: 75 + s.j * 60, r: W < 500 ? 4 : 5,
        fill: used ? 'var(--pink)' : out ? 'var(--lime)' : 'transparent', stroke: used ? 'var(--pink)' : out ? 'var(--lime)' : '#6f8366', 'stroke-width': 2, 'fill-opacity': 0.75}));
    }
    mark = el('rect', {y: 16, width: 4, height: 116, class: 'mark'});
    markLabel = el('text', {y: 11, class: 'strong', 'text-anchor': 'middle'}, 'THIS SETUP');
    svg.append(mark, markLabel); refresh();
  });
  const clearSplits = () => { state.rolls = 0; state.best = null; state.last = null; };
  $('t-time').addEventListener('click', () => { state.time = !state.time; clearSplits(); refresh(); });
  $('t-smote').addEventListener('click', () => { state.smote = !state.smote; clearSplits(); refresh(); });
  $('reroll').addEventListener('click', () => {
    const sp = data.settings[key()].splits, v = sp[randomIndex(sp.length)];
    state.rolls++; state.last = v; state.best = Math.max(state.best ?? 0, v); refresh();
  });
  $('reset').addEventListener('click', () => { state.time = false; state.smote = false; clearSplits(); refresh(); });
}

/* 03 — the literature (a plain chart; the searchable table follows human review) */
{
  const svg = $('years'), studies = data.studies;
  const years = [...new Set(studies.map(s => s.year))].sort();
  const count = (yr, code) => studies.filter(s => s.year === yr && s.code === code).length;
  const rows = years.map(yr => ({yr, used: count(yr, 'used'), out: count(yr, 'not used'), unclear: count(yr, 'unclear')}));
  const maxT = Math.max(...rows.map(r => r.used + r.out + r.unclear));
  fit(svg, 270, W => {
    const left = 10, right = W - 10, colW = (right - left) / rows.length, bw = Math.min(64, colW * 0.62), base = 232, y0 = 56;
    const sc = v => v / maxT * (base - y0);
    rows.forEach((r, i) => {
      const bx = left + i * colW + (colW - bw) / 2, t = r.used + r.out + r.unclear;
      if (r.used) svg.append(el('rect', {x: bx, y: base - sc(r.used), width: bw, height: sc(r.used), fill: 'var(--pink)', 'fill-opacity': 0.9}));
      if (r.out) svg.append(el('rect', {x: bx, y: base - sc(r.used + r.out), width: bw, height: sc(r.out), fill: 'var(--lime)', 'fill-opacity': 0.9}));
      if (r.unclear) svg.append(el('rect', {x: bx + 0.5, y: base - sc(t) + 0.5, width: bw - 1, height: sc(r.unclear) - 1, fill: 'transparent', stroke: '#58744c'}));
      if (r.used) svg.append(el('text', {x: bx + bw / 2, y: base - sc(r.used) / 2 + 4, 'text-anchor': 'middle', class: 'onbar'}, r.used));
      svg.append(el('text', {x: bx + bw / 2, y: base - sc(t) - 7, 'text-anchor': 'middle', class: 'strong'}, t));
      svg.append(el('text', {x: bx + bw / 2, y: base + 20, 'text-anchor': 'middle'}, r.yr));
    });
    const iWarn = years.indexOf(2024);
    if (iWarn > 0) {
      const wx = left + iWarn * colW;
      svg.append(el('line', {x1: wx, x2: wx, y1: 12, y2: base + 4, class: 'warn'}));
      svg.append(el('text', {x: wx - 7, y: 22, 'text-anchor': 'end'}, W < 500 ? 'Aug 2023 warning' : 'Aug 2023: flagged as a surrogate'));
    }
    svg.append(el('line', {x1: left, x2: right, y1: base, y2: base, class: 'gridline'}));
  });
  const det = studies.filter(s => s.code !== 'unclear'), used = det.filter(s => s.code === 'used');
  const explicitUsed = used.filter(s => !s.implied).length, excluded = det.length - used.length;
  $('share').textContent = `${Math.round(used.length / det.length * 100)}% of the studies we could check included follow-up time.`;
  $('sharenote').textContent = `${used.length} of ${det.length}. Counting only papers that state it outright: ${Math.round(explicitUsed / (explicitUsed + excluded) * 100)}%.`;
  const late = det.filter(s => s.year >= 2024);
  $('late').textContent = `${late.filter(s => s.code === 'used').length} of ${late.length}`;
}
