/** Render the complete no-JavaScript cohort from the same frozen-record adapter. */
import {readFileSync, writeFileSync} from 'node:fs';
import {buildCalibrationComparison} from '../site/medical/observatory-model.js';

const file = new URL('../site/medical/observatory.html', import.meta.url);
const source = readFileSync(file, 'utf8');
const results = JSON.parse(readFileSync(new URL('../site/medical/results.json', import.meta.url), 'utf8'));
const comparison = buildCalibrationComparison(results);
const label = value => value === 1 ? 'Malignant' : 'Benign';
const table = comparison.rows.map(record => `<tr data-row="${record.row}"><th scope="row">${record.row}</th><td>${label(record.truth)} (${record.truth})</td><td>${record.raw.toFixed(8)}</td><td${record.rawCorrect ? '' : ' class="incorrect"'}>${label(record.rawPrediction)} · ${record.rawCorrect ? 'correct' : 'incorrect'}</td><td>${record.calibrated.toFixed(8)}</td><td${record.calibratedCorrect ? '' : ' class="incorrect"'}>${label(record.calibratedPrediction)} · ${record.calibratedCorrect ? 'correct' : 'incorrect'}</td></tr>`).join('\n');
const grid = comparison.rows.map((record, index) => {
  const number = String(index + 1).padStart(3, '0');
  const models = ['raw', 'calibrated'];
  const marks = models.map(model => record[model + 'Correct']
    ? '<span>✓</span>' : '<span class="incorrect">×</span>').join('');
  const estimates = models.map(model => {
    const name = model === 'raw' ? 'Raw' : 'Calibrated';
    const probability = (record[model] * 100).toFixed(2);
    return `<p><strong>${name} ${probability}%</strong><span>${label(record[model + 'Prediction'])} · ${record[model + 'Correct'] ? 'correct' : 'incorrect'}</span></p>`;
  }).join('');
  return `<details class="native-record" id="record-${number}" name="calibration-record">
    <summary class="cohort-tile" aria-label="Test record ${number}, source row ${record.row}">
      <span class="tile-number">${number}</span><span class="tile-outcomes" aria-hidden="true">${marks}</span>
    </summary>
    <section class="native-estimates" aria-label="Prediction details">
      <header>Test record ${number} · Source row ${record.row}<br>Recorded label <b>${label(record.truth)}</b></header>
      ${estimates}
    </section>
  </details>`;
}).join('\n');
const output = source.replace(/(<tbody id="record-table">)[\s\S]*?(<\/tbody>)/, `$1\n${table}\n$2`).replace(/(<div id="cohort-grid"[^>]*>)[\s\S]*?(<\/div>)/, `$1\n${grid}\n$2`);
if (process.argv.includes('--check')) {
  if (source !== output) throw new Error('Static calibration cohort is stale. Run node research/build_observatory_view.mjs.');
  console.log('Verified static table and cohort contain all 114 frozen test records.');
} else {
  writeFileSync(file, output, 'utf8');
  console.log('Rendered all 114 frozen records in the static calibration table and cohort.');
}
