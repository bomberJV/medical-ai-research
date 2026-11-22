import {buildCalibrationComparison, verifyCalibrationReceipt} from './observatory-model.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = (value, digits = 5) => value == null ? 'Undefined' : value.toFixed(digits);
const percent = (value, digits = 2) => value == null ? 'Undefined' : `${(value * 100).toFixed(digits)}%`;
const label = value => value === 1 ? 'Malignant' : 'Benign';
const interval = (values, digits = 5) => values.map(value => format(value, digits)).join(' to ');
let results, comparison, selectedRow;

function renderSelected() {
  const record = comparison.rows.find(row => row.row === selectedRow);
  const position = comparison.rows.indexOf(record) + 1;
  $('#record-detail').innerHTML = `<div class="record-identity"><span class="eyebrow">SOURCE ROW ORDINAL</span><strong>${record.row}</strong><span>Recorded label <b>${label(record.truth)} (${record.truth})</b></span><small>Test position ${position} / ${comparison.cohortSize} · zero-based source ordinal</small></div>` + ['raw', 'calibrated'].map(model => `<div class="prediction ${model}"><span class="model-label">${model === 'raw' ? 'RAW LOGISTIC' : 'SIGMOID CALIBRATED'}</span><strong>${format(record[model] * 100, 2)}<span>%</span></strong><p>Predicted malignancy probability</p><div class="outcome ${record[`${model}Correct`] ? '' : 'incorrect'}">${record[`${model}Correct`] ? '✓' : '×'} ${label(record[`${model}Prediction`])} · ${record[`${model}Correct`] ? 'correct' : 'incorrect'}</div><small>Squared error ${format(record[`${model}SquaredError`], 6)}</small></div>`).join('');
  document.querySelectorAll('[data-record]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.record) === selectedRow)));
  document.querySelectorAll('#record-table tr[data-row]').forEach(row => row.setAttribute('aria-selected', String(Number(row.dataset.row) === selectedRow)));
}

function renderCohort() {
  $('#cohort-grid').innerHTML = comparison.rows.map((record, index) => {
    const deferred = !record.calibratedRetained;
    const description = `Test record ${index + 1} of ${comparison.cohortSize}, source row ${record.row}, recorded ${label(record.truth)}, raw ${record.rawCorrect ? 'correct' : 'incorrect'}, calibrated ${record.calibratedCorrect ? 'correct' : 'incorrect'}, calibrated ${deferred ? 'deferred' : 'retained'} at ${percent(comparison.threshold, 0)} confidence`;
    return `<button class="cohort-tile ${deferred ? 'is-deferred' : ''}" data-record="${record.row}" aria-pressed="${record.row === selectedRow}" aria-label="${escape(description)}"><span class="tile-number" aria-hidden="true">${String(index + 1).padStart(3, '0')}</span><span class="tile-outcomes" aria-hidden="true"><span class="${record.rawCorrect ? '' : 'incorrect'}">${record.rawCorrect ? '✓' : '×'}</span><span class="${record.calibratedCorrect ? '' : 'incorrect'}">${record.calibratedCorrect ? '✓' : '×'}</span></span>${deferred ? '<span class="deferred-mark" aria-hidden="true">D</span>' : ''}</button>`;
  }).join('');
  $('#record-table').innerHTML = comparison.rows.map(record => `<tr data-row="${record.row}" aria-selected="${record.row === selectedRow}"><th scope="row"><button class="inspect-row" data-record="${record.row}" aria-pressed="${record.row === selectedRow}" aria-label="Inspect source row ${record.row}">${record.row}</button></th><td>${label(record.truth)} (${record.truth})</td><td>${format(record.raw, 8)}</td><td class="${record.rawCorrect ? '' : 'incorrect'}">${label(record.rawPrediction)} · ${record.rawCorrect ? 'correct' : 'incorrect'}</td><td>${format(record.calibrated, 8)}</td><td class="${record.calibratedCorrect ? '' : 'incorrect'}">${label(record.calibratedPrediction)} · ${record.calibratedCorrect ? 'correct' : 'incorrect'}</td><td>${record.calibratedRetained ? 'Retained' : 'Deferred'}</td></tr>`).join('');
  $('#cohort-count').textContent = `${comparison.cohortSize} / ${comparison.cohortSize} records shown · original test order`;
}

function renderComparison() {
  const {raw, calibrated} = comparison.full;
  const malignant = raw.tp + raw.fn;
  const benign = raw.tn + raw.fp;
  $('#comparison-body').innerHTML = `
    <tr><th scope="row">Accuracy <small>Correct / all test records</small></th><td>${raw.correct} / ${raw.total}<small>${percent(raw.accuracy)}</small></td><td>${calibrated.correct} / ${calibrated.total}<small>${percent(calibrated.accuracy)}</small></td><td>One more correct label</td></tr>
    <tr><th scope="row">Brier score <small>Mean (probability − label)²</small></th><td>${format(raw.brier)}</td><td>${format(calibrated.brier)}</td><td class="adverse">Worse by ${format(comparison.delta.brier)}</td></tr>
    <tr><th scope="row">False negatives <small>Malignant predicted benign</small></th><td>${raw.fn} / ${malignant}</td><td>${calibrated.fn} / ${malignant}</td><td>One error remains</td></tr>
    <tr><th scope="row">False positives <small>Benign predicted malignant</small></th><td>${raw.fp} / ${benign}</td><td>${calibrated.fp} / ${benign}</td><td>Unchanged</td></tr>
    <tr><th scope="row">True positives <small>Malignant predicted malignant</small></th><td>${raw.tp} / ${malignant}</td><td>${calibrated.tp} / ${malignant}</td><td>One more positive identified</td></tr>
    <tr><th scope="row">True negatives <small>Benign predicted benign</small></th><td>${raw.tn} / ${benign}</td><td>${calibrated.tn} / ${benign}</td><td>Unchanged</td></tr>
    <tr><th scope="row">Log loss <small>Recorded mean negative log probability; lower is better</small></th><td>${format(results.calibration.metrics.raw.log_loss)}</td><td>${format(results.calibration.metrics.calibrated.log_loss)}</td><td class="adverse">Also worsens</td></tr>
    <tr><th scope="row">AUROC <small>Pairwise ranking; higher is better</small></th><td>${format(raw.auc, 6)}</td><td>${format(calibrated.auc, 6)}</td><td>Unchanged ranking</td></tr>`;
  const uncertainty = comparison.uncertainty;
  $('#uncertainty-detail').innerHTML = `<p>${escape(uncertainty.bootstrapMethod)} These are intervals recorded in the original run, not new browser bootstrap estimates.</p><ul><li>Raw Brier: ${interval(uncertainty.raw.brier_ci)}.</li><li>Calibrated Brier: ${interval(uncertainty.calibrated.brier_ci)}.</li><li>Paired raw-minus-calibrated Brier difference: ${format(uncertainty.paired.difference)}; 95% interval ${interval(uncertainty.paired.ci)}.</li><li>Raw and calibrated AUROC intervals: ${interval(uncertainty.raw.auc_ci, 6)} and ${interval(uncertainty.calibrated.auc_ci, 6)}.</li></ul><p>${escape(uncertainty.limitation)} Brier score measures overall probability error; it is not a pure measure of calibration alone.</p>`;
}

function renderSelective() {
  const summary = comparison.selected.calibrated;
  $('#selective-summary').innerHTML = `<div><strong>${summary.retained} <small>/ ${summary.total}</small></strong><span>retained · ${percent(summary.retainedFraction, 1)}</span></div><div><strong>${summary.deferred} <small>/ ${summary.total}</small></strong><span>deferred · ${percent(summary.deferred / summary.total, 1)}</span></div><div><strong>${summary.n ? `${summary.correct} <small>/ ${summary.n}</small>` : 'Undefined'}</strong><span>${summary.n ? `${percent(summary.accuracy)} correct among retained` : 'Accuracy has no denominator: no records retained.'}</span></div>`;
  const ci = comparison.uncertainty.selective.accuracy_ci;
  $('#selective-errors').textContent = summary.n ? `At ${percent(comparison.threshold, 0)}: ${summary.fn} false negative${summary.fn === 1 ? '' : 's'} and ${summary.fp} false positive${summary.fp === 1 ? '' : 's'} among ${summary.n} retained records. ${summary.malignantRetained} / 42 malignant records retained; ${42 - summary.malignantRetained} / 42 deferred. Recorded 95% Wilson interval for retained accuracy: ${ci.map(value => percent(value)).join(' to ')}. All ${summary.total} records remain visible above.` : `All ${summary.total} records are deferred. Retained accuracy is undefined because there is no retained denominator. All records remain visible above.`;
}

function renderReceipt(receipt) {
  const partitions = receipt.split.partitions;
  const version = receipt.schema_version;
  const entries = [
    ['Dataset', `${receipt.dataset.name} · ${receipt.dataset.n} records · ${receipt.dataset.feature_count} features`],
    ['Model', 'StandardScaler → logistic regression C=1, max_iter=3000; frozen pipeline → sigmoid calibration on the calibration partition only'],
    ['Split', `${partitions.train.count} train / ${partitions.calibration.count} calibration / ${partitions.test.count} test · seed ${receipt.run.seed}`],
    ['Analysis date', `${receipt.run.date} · scikit-learn ${receipt.run.environment.sklearn} · Python ${receipt.run.environment.python}. The original run did not record an execution timestamp.`],
    ['Receipt', `${receipt.receipt_id} · schema ${version}`],
    ['Source', `${receipt.dataset.doi} · ${receipt.dataset.license.name}. Original source check: 13 November 2026.`],
    ['Data SHA-256', receipt.dataset.data_sha256],
    ['Results SHA-256', `${receipt.provenance.results_sha256} (UTF-8 text normalized to LF)`],
    ['Verification', 'Frozen prediction recomputation; absolute metric tolerance 1e-12. Integer counts match exactly. No retraining or bootstrap replay in this view.'],
    ['Original code revision', receipt.run.original_code_revision ?? 'Unknown; the original frozen run did not record its execution commit. See receipt for the inspected source baseline and artifact hashes.'],
  ];
  $('#receipt-fields').innerHTML = entries.map(([term, value]) => `<div><dt>${escape(term)}</dt><dd>${escape(value)}</dd></div>`).join('');
  $('#receipt-json').textContent = JSON.stringify(receipt, null, 2);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-record]');
  if (!button || !comparison) return;
  selectedRow = Number(button.dataset.record);
  renderSelected();
});

$('#threshold').addEventListener('change', event => {
  try {
    comparison = buildCalibrationComparison(results, {threshold: Number(event.target.value)});
    renderCohort();
    renderSelective();
    renderSelected();
  } catch (error) {
    $('#load-status').dataset.state = 'error';
    $('#load-status').textContent = `Threshold inspection unavailable: ${error.message}`;
    event.target.disabled = true;
  }
});

async function readJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  const text = await response.text();
  return {text, data: JSON.parse(text)};
}

try {
  $('#load-status').textContent = 'Loading the frozen records and receipt for independent metric checks. The page currently shows its recorded reference snapshot.';
  const [resultFile, receiptFile] = await Promise.all([readJSON('./results.json'), readJSON('./observatory-receipt.json')]);
  results = resultFile.data;
  const receipt = receiptFile.data;
  verifyCalibrationReceipt(receipt, results);
  if (globalThis.crypto?.subtle) {
    const normalizedText = resultFile.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedText));
    const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== receipt.provenance.results_sha256) throw new Error('The frozen results hash does not match the receipt.');
  }
  comparison = buildCalibrationComparison(results);
  selectedRow = comparison.rows[0].row;
  renderCohort();
  renderSelected();
  renderComparison();
  renderSelective();
  renderReceipt(receipt);
  $('#threshold').disabled = false;
  $('#load-status').textContent = `Recomputed from all ${comparison.cohortSize} frozen predictions. Counts match exactly; accuracy, Brier and AUROC match stored values within 1e-12. ${globalThis.crypto?.subtle ? 'LF-normalized results SHA-256 matches the receipt.' : 'File hashing is unavailable in this browser; numerical and split checks passed.'} No model was trained or tuned.`;
  $('#load-status').dataset.state = 'verified';
} catch (error) {
  $('#load-status').dataset.state = 'error';
  $('#load-status').textContent = `Interactive verification unavailable: ${error.message} The page retains its labeled reference snapshot. Inspect the downloadable frozen results and receipt; record and threshold controls remain disabled.`;
  document.querySelectorAll('[data-record], #threshold').forEach(control => { control.disabled = true; });
}
