import {seeded} from '../shared/core.js';

const NS = 'http://www.w3.org/2000/svg';
const $ = id => document.getElementById(id);
const pct = v => `${(v * 100).toFixed(1)}%`;
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

const data = await fetch('leakage-data.json').then(r => r.json());

/* 01 — the one-column rule */
{
  const svg = $('strip'), cut = $('cut'), pts = data.patients;
  const x = d => 40 + d / 290 * 690, rows = {1: 78, 0: 185}, rnd = seeded(299);
  svg.append(el('text', {x: 40, y: 30, class: 'strong'}, 'Died during follow-up'));
  svg.append(el('text', {x: 40, y: 135, class: 'strong'}, 'Survived to the end of follow-up'));
  for (const d of [0, 50, 100, 150, 200, 250]) svg.append(el('text', {x: x(d), y: 240, 'text-anchor': 'middle'}, `${d} d`));
  const dots = pts.map(([t, died]) => {
    const c = el('circle', {cx: x(t), cy: rows[died] + (rnd() - 0.5) * 44, r: 4});
    svg.append(c); return {c, t, died};
  });
  const line = el('line', {y1: 40, y2: 215, stroke: 'var(--pink)', 'stroke-width': 2});
  svg.append(line);
  const accAt = T => dots.reduce((s, d) => s + ((d.t < T) === (d.died === 1)), 0) / dots.length;
  const clean = data.settings.clean.cv_acc;
  $('cleanacc').textContent = pct(clean);
  function draw() {
    const T = +cut.value; $('cutval').textContent = T;
    line.setAttribute('x1', x(T)); line.setAttribute('x2', x(T));
    for (const d of dots) {
      const right = (d.t < T) === (d.died === 1);
      d.c.setAttribute('fill', right ? (d.died ? 'var(--pink)' : 'var(--lime)') : 'transparent');
      d.c.setAttribute('stroke', d.died ? 'var(--pink)' : 'var(--lime)');
      d.c.setAttribute('fill-opacity', right ? 0.8 : 1);
    }
    const a = accAt(T); $('ruleacc').textContent = pct(a);
    $('rulenote').textContent = a > clean
      ? `The rule beats every clinical measurement combined by ${((a - clean) * 100).toFixed(1)} points. Filled dots are right, hollow dots are wrong.`
      : 'Filled dots are right, hollow dots are wrong. Keep dragging.';
  }
  cut.addEventListener('input', draw);
  $('bestcut').addEventListener('click', () => {
    let best = 4, bestA = 0;
    for (let T = 4; T <= 285; T++) { const a = accAt(T); if (a > bestA) { bestA = a; best = T; } }
    cut.value = best; draw();
    $('rulenote').textContent += ' (This cutoff was chosen on the same 299 patients, so it flatters itself a little. It still uses no medical information.)';
  });
  draw();
}

/* 02 — the recipe */
{
  const state = {time: false, smote: false, rolls: 0, best: null, last: null};
  const claims = $('claims'), studies = data.studies.filter(s => s.acc != null);
  const x = v => 40 + (v - 0.5) / 0.5 * 690;
  for (const v of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
    claims.append(el('line', {x1: x(v), x2: x(v), y1: 20, y2: 130, class: 'gridline'}));
    claims.append(el('text', {x: x(v), y: 152, 'text-anchor': 'middle'}, `${Math.round(v * 100)}%`));
  }
  const rnd = seeded(64);
  for (const s of studies) {
    const used = s.code === 'used', excl = s.code === 'not used';
    claims.append(el('circle', {cx: x(Math.min(s.acc, 100) / 100), cy: 60 + (rnd() - 0.5) * 60, r: 5,
      fill: used ? 'var(--pink)' : 'transparent', stroke: used ? 'var(--pink)' : excl ? 'var(--lime)' : '#6f8366', 'stroke-width': 2, 'fill-opacity': 0.75}));
  }
  const you = el('rect', {y: 14, width: 4, height: 118, class: 'you'});
  const youLabel = el('text', {y: 12, class: 'strong', 'text-anchor': 'middle'}, 'YOU');
  claims.append(you, youLabel);

  const key = () => (state.time ? 'time' : 'clean') + (state.smote ? '+smote' : '');
  const notes = {
    'clean': 'No shortcuts. This is roughly what the data can honestly support.',
    'time': '<b>Leak 1.</b> The model now sees how long each patient was followed, which it could never know at the start.',
    'clean+smote': '<b>Leak 2.</b> Synthetic patients are blended from real ones before the split, so near-copies of test patients sit in the training set.',
    'time+smote': '<b>Both leaks.</b> This is the recipe behind most of the 95%+ claims. Now reroll the split a few times.'
  };
  function show(v, label) {
    const leaky = state.time || state.smote || state.rolls > 0;
    $('score').textContent = pct(v); $('score').classList.toggle('leaky', leaky);
    $('scorelabel').textContent = label;
    you.setAttribute('x', x(v) - 2); youLabel.setAttribute('x', x(v)); you.classList.toggle('leaky', leaky);
  }
  function refresh() {
    const s = data.settings[key()];
    $('t-time').setAttribute('aria-pressed', state.time); $('t-smote').setAttribute('aria-pressed', state.smote);
    $('rolls').textContent = state.rolls; $('best').textContent = state.best == null ? '–' : pct(state.best);
    let note = notes[key()];
    if (state.rolls) note += ` Your best split is ${((state.best - s.cv_acc) * 100).toFixed(1)} points above this setup's honest average of ${pct(s.cv_acc)}.`;
    $('leaknote').innerHTML = note;
    if (state.last == null) show(s.cv_acc, 'honest average, 100 cross-validation runs');
    else show(state.last, `this split · honest average ${pct(s.cv_acc)}`);
  }
  const resetRolls = () => { state.rolls = 0; state.best = null; state.last = null; };
  $('t-time').addEventListener('click', () => { state.time = !state.time; resetRolls(); refresh(); });
  $('t-smote').addEventListener('click', () => { state.smote = !state.smote; resetRolls(); refresh(); });
  $('reroll').addEventListener('click', () => {
    const sp = data.settings[key()].splits, v = sp[randomIndex(sp.length)];
    state.rolls++; state.last = v; state.best = Math.max(state.best ?? 0, v); refresh();
  });
  $('reset').addEventListener('click', () => { state.time = false; state.smote = false; resetRolls(); refresh(); });
  refresh();
}

/* 03 — the literature */
{
  const svg = $('years'), studies = data.studies;
  const years = [...new Set(studies.map(s => s.year))].sort();
  const order = {'used': 0, 'not used': 1, 'unclear': 2};
  const colW = 690 / years.length, per = 5, gap = 16, baseY = 170;
  const label = s => `${s.year} · ${s.code === 'used' ? `used follow-up time (${s.implied ? 'inferred: all columns used' : 'stated'})` : s.code === 'not used' ? 'left follow-up time out' : 'could not tell'}${s.acc != null ? ` · reported ${s.acc.toFixed(1)}%` : ''}`;
  const dots = [];
  years.forEach((yr, i) => {
    const cx0 = 40 + i * colW + (colW - per * gap) / 2 + gap / 2;
    svg.append(el('text', {x: 40 + i * colW + colW / 2, y: baseY + 26, 'text-anchor': 'middle'}, yr));
    studies.filter(s => s.year === yr).sort((a, b) => order[a.code] - order[b.code]).forEach((s, j) => {
      const used = s.code === 'used', excl = s.code === 'not used';
      const c = el('circle', {cx: cx0 + (j % per) * gap, cy: baseY - Math.floor(j / per) * gap, r: 6.5, class: 'dot', tabindex: 0,
        fill: used ? 'var(--pink)' : 'transparent', stroke: used ? 'var(--pink)' : excl ? 'var(--lime)' : '#6f8366', 'stroke-width': 2,
        'fill-opacity': used && s.implied ? 0.45 : 0.85, 'aria-label': label(s)});
      const read = () => { $('studyread').innerHTML = `<strong>${label(s)}</strong>`; };
      c.addEventListener('mouseenter', read); c.addEventListener('focus', read);
      svg.append(c); dots.push({c, s});
    });
  });
  const iWarn = years.indexOf(2024);
  if (iWarn > 0) {
    const wx = 40 + iWarn * colW;
    svg.append(el('line', {x1: wx, x2: wx, y1: 30, y2: baseY + 10, class: 'warn'}));
    svg.append(el('text', {x: wx - 8, y: 38, 'text-anchor': 'end'}, 'Aug 2023: flagged as a surrogate'));
  }
  const det = studies.filter(s => s.code !== 'unclear'), used = det.filter(s => s.code === 'used');
  const explicitUsed = used.filter(s => !s.implied).length, excluded = det.length - used.length;
  $('share').textContent = `${Math.round(used.length / det.length * 100)}% of the studies we could check used follow-up time.`;
  $('sharenote').textContent = `${used.length} of ${det.length}. Counting only papers that say so outright: ${Math.round(explicitUsed / (explicitUsed + excluded) * 100)}%. Faded pink dots are the inferred ones.`;
  const late = det.filter(s => s.year >= 2024);
  $('late').textContent = `${late.filter(s => s.code === 'used').length} of ${late.length}`;
  const filters = {all: () => true, hi: s => s.acc != null && s.acc >= 90, explicit: s => !(s.code === 'used' && s.implied)};
  document.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-f]').forEach(o => o.setAttribute('aria-pressed', o === b));
    const f = filters[b.dataset.f];
    for (const d of dots) d.c.classList.toggle('faded', !f(d.s));
  }));
}
