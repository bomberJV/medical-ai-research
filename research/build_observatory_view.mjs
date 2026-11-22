/** Render the complete no-JavaScript cohort from the same frozen-record adapter. */
import {readFileSync, writeFileSync} from 'node:fs';
import {buildCalibrationComparison} from '../site/medical/observatory-model.js';

const file = new URL('../site/medical/observatory.html', import.meta.url);
const source = readFileSync(file, 'utf8');
const results = JSON.parse(readFileSync(new URL('../site/medical/results.json', import.meta.url), 'utf8'));
const comparison = buildCalibrationComparison(results);
const label = value => value === 1 ? 'Malignant' : 'Benign';
const table = comparison.rows.map(record => `<tr data-row="${record.row}"><th scope="row">${record.row}</th><td>${label(record.truth)} (${record.truth})</td><td>${record.raw.toFixed(8)}</td><td${record.rawCorrect ? '' : ' class="incorrect"'}>${label(record.rawPrediction)} · ${record.rawCorrect ? 'correct' : 'incorrect'}</td><td>${record.calibrated.toFixed(8)}</td><td${record.calibratedCorrect ? '' : ' class="incorrect"'}>${label(record.calibratedPrediction)} · ${record.calibratedCorrect ? 'correct' : 'incorrect'}</td><td>Retained at 50%</td></tr>`).join('\n');
const grid = comparison.rows.map((record, index) => `<span class="cohort-tile" role="img" aria-label="Test record ${index + 1} of ${comparison.cohortSize}, source row ${record.row}, raw ${record.rawCorrect ? 'correct' : 'incorrect'}, calibrated ${record.calibratedCorrect ? 'correct' : 'incorrect'}"><span class="tile-number" aria-hidden="true">${String(index + 1).padStart(3, '0')}</span><span class="tile-outcomes" aria-hidden="true"><span${record.rawCorrect ? '' : ' class="incorrect"'}>${record.rawCorrect ? '✓' : '×'}</span><span${record.calibratedCorrect ? '' : ' class="incorrect"'}>${record.calibratedCorrect ? '✓' : '×'}</span></span></span>`).join('\n');
const output = source.replace(/(<tbody id="record-table">)[\s\S]*?(<\/tbody>)/, `$1\n${table}\n$2`).replace(/(<div id="cohort-grid" class="cohort-grid" aria-label="All held-out records">)[\s\S]*?(<\/div>)/, `$1\n${grid}\n$2`);
if (process.argv.includes('--check')) {
  if (source !== output) throw new Error('Static Observatory cohort is stale. Run node research/build_observatory_view.mjs.');
  console.log('Verified static table and cohort contain all 114 frozen test records.');
} else {
  writeFileSync(file, output, 'utf8');
  console.log('Rendered all 114 frozen records in the static Observatory table and cohort.');
}
