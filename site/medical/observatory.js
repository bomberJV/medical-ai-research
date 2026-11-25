import {buildCalibrationComparison, verifyCalibrationReceipt} from './observatory-model.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = (value, digits = 5) => value == null ? 'Undefined' : value.toFixed(digits);
const percent = (value, digits = 2) => value == null ? 'Undefined' : `${(value * 100).toFixed(digits)}%`;
const label = value => value === 1 ? 'Malignant' : 'Benign';
const interval = (values, digits = 5) => values.map(value => format(value, digits)).join(' to ');
let results, comparison, selectedRow;

function outcome(record, model) {
  const correct = record[model + 'Correct'];
  return `<span class="${correct ? '' : 'incorrect'}">${label(record[model + 'Prediction'])} · ${correct ? 'correct' : 'incorrect'}</span>`;
}

function buttonAttributes(record) {
  const selected = record.row === selectedRow;
  return `type="button" data-record="${record.row}" aria-pressed="${selected}" tabindex="${selected ? 0 : -1}"`;
}

function renderCohort() {
  const grid = $('#cohort-grid');
  grid.setAttribute('role', 'toolbar');
  grid.innerHTML = comparison.rows.map((record, index) => {
    const description = `Test record ${index + 1} of ${comparison.cohortSize}, source row ${record.row}, recorded ${label(record.truth)}, raw ${record.rawCorrect ? 'correct' : 'incorrect'}, calibrated ${record.calibratedCorrect ? 'correct' : 'incorrect'}`;
    const marks = ['raw', 'calibrated'].map(model => record[model + 'Correct']
      ? '<span>✓</span>' : '<span class="incorrect">×</span>').join('');
    return `<button class="cohort-tile" ${buttonAttributes(record)} aria-label="${escape(description)}"><span class="tile-number" aria-hidden="true">${String(index + 1).padStart(3, '0')}</span><span class="tile-outcomes" aria-hidden="true">${marks}</span></button>`;
  }).join('');
  $('#record-table').innerHTML = comparison.rows.map(record => `
    <tr data-row="${record.row}">
      <th scope="row"><button class="inspect-row" ${buttonAttributes(record)} aria-label="Inspect source row ${record.row}">${record.row}</button></th>
      <td>${label(record.truth)} (${record.truth})</td>
      <td>${format(record.raw, 8)}</td><td>${outcome(record, 'raw')}</td>
      <td>${format(record.calibrated, 8)}</td><td>${outcome(record, 'calibrated')}</td>
    </tr>`).join('');
  $('#cohort-count').textContent = `${comparison.cohortSize} records in original test order`;
}

function gridColumns() {
  return getComputedStyle($('#cohort-grid')).gridTemplateColumns.split(' ').length;
}

// Keep the readout immediately below the selected visual row at every width.
function placeInGrid(inspector, recordIndex) {
  const tiles = $('#cohort-grid').querySelectorAll('button[data-record]');
  const columns = gridColumns();
  const endOfRow = Math.min((Math.floor(recordIndex / columns) + 1) * columns, tiles.length);
  const lastTile = tiles[endOfRow - 1];
  if (lastTile.nextElementSibling !== inspector) lastTile.after(inspector);
}

function inspectRecord(button, index) {
  const record = comparison.rows[index];
  const oldRow = selectedRow;
  selectedRow = record.row;
  for (const control of document.querySelectorAll(`button[data-record="${oldRow}"], button[data-record="${selectedRow}"]`)) {
    const selected = Number(control.dataset.record) === selectedRow;
    control.tabIndex = selected ? 0 : -1;
    control.setAttribute('aria-pressed', String(selected));
  }

  const readout = document.createElement('section');
  readout.id = 'record-inspector';
  readout.dataset.recordRow = record.row;
  readout.setAttribute('aria-label', `Prediction details for source row ${record.row}`);
  readout.innerHTML = `<div class="inspector-heading"><strong>Test record ${index + 1} of ${comparison.cohortSize}</strong><span>Source row ${record.row} · Recorded <b>${label(record.truth).toLowerCase()}</b></span></div>` +
    ['raw', 'calibrated'].map(model => `
      <div class="inspector-estimate ${model}"><span>${model === 'raw' ? 'Raw' : 'Calibrated'} malignancy probability</span>
      <strong>${percent(record[model])}</strong>${outcome(record, model)}
      <small>Squared error ${format(record[model + 'SquaredError'], 6)}</small></div>`).join('');

  const old = $('#record-inspector');
  if (old) (old.closest('tr') || old).remove();
  const tableRow = button.closest('tr');
  if (tableRow) {
    const detailRow = document.createElement('tr');
    const cell = detailRow.insertCell();
    cell.colSpan = tableRow.cells.length;
    cell.className = 'inspector-cell';
    cell.append(readout);
    tableRow.after(detailRow);
  } else {
    placeInGrid(readout, index);
  }

  button.focus({preventScroll: true});
  readout.scrollIntoView({block: 'nearest', inline: 'nearest'});
  $('#selection-status').textContent = `Source row ${record.row}. Recorded ${label(record.truth).toLowerCase()}. Raw malignancy probability ${percent(record.raw)}, ${record.rawCorrect ? 'correct' : 'incorrect'}. Calibrated ${percent(record.calibrated)}, ${record.calibratedCorrect ? 'correct' : 'incorrect'}.`;
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

function renderReceipt(receipt) {
  const partitions = receipt.split.partitions;
  const version = receipt.schema_version;
  const entries = [
    ['Dataset', `${receipt.dataset.name} · ${receipt.dataset.n} records · ${receipt.dataset.feature_count} features`],
    ['Model', 'StandardScaler → logistic regression C=1, max_iter=3000; frozen pipeline → sigmoid calibration on the calibration partition only'],
    ['Split', `${partitions.train.count} train / ${partitions.calibration.count} calibration / ${partitions.test.count} test · seed ${receipt.run.seed}`],
    ['Analysis date', `${receipt.run.date} · scikit-learn ${receipt.run.environment.sklearn} · Python ${receipt.run.environment.python}. The original run did not record an execution timestamp.`],
    ['Receipt', `${receipt.receipt_id} · schema ${version}`],
    ['Data SHA-256', receipt.dataset.data_sha256],
    ['Results SHA-256', `${receipt.provenance.results_sha256} (UTF-8 text normalized to LF)`],
    ['Verification', 'Frozen prediction recomputation; absolute metric tolerance 1e-12. Integer counts match exactly. No retraining or bootstrap replay in this view.'],
    ['Original code revision', receipt.run.original_code_revision ?? 'Unknown; the original frozen run did not record its execution commit. See receipt for the inspected source baseline and artifact hashes.'],
  ];
  const doi = receipt.dataset.doi.replace(/^https:\/\/doi\.org\//, '');
  const source = `<div><dt>Source</dt><dd><a href="https://doi.org/${escape(doi)}">UCI WDBC · DOI ${escape(doi)}</a> · ${escape(receipt.dataset.license.name)}. Source checked 13 November 2026.</dd></div>`;
  $('#receipt-fields').innerHTML = entries.map(([term, value]) => `<div><dt>${escape(term)}</dt><dd>${escape(value)}</dd></div>`).join('') + source;
  $('#receipt-json').textContent = JSON.stringify(receipt, null, 2);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-record]');
  if (button && comparison) {
    inspectRecord(button, comparison.rows.findIndex(record => record.row === Number(button.dataset.record)));
  }
});

document.addEventListener('keydown', event => {
  const button = event.target.closest('button[data-record]');
  if (!button || !comparison || event.altKey || event.ctrlKey || event.metaKey) return;
  const index = comparison.rows.findIndex(record => record.row === Number(button.dataset.record));
  const grid = button.closest('#cohort-grid');
  const columns = grid ? gridColumns() : 1;
  const last = comparison.rows.length - 1;
  const keys = {ArrowLeft: index - 1, ArrowRight: index + 1, ArrowUp: index - columns,
    ArrowDown: index + columns, Home: 0, End: last};
  if (!Object.hasOwn(keys, event.key)) return;
  event.preventDefault();
  const next = Math.min(last, Math.max(0, keys[event.key]));
  const collection = grid || $('#record-table');
  inspectRecord(collection.querySelector(`button[data-record="${comparison.rows[next].row}"]`), next);
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
  selectedRow = comparison.rows.find(record => !record.rawCorrect && record.calibratedCorrect).row;
  renderCohort();
  renderComparison();
  renderReceipt(receipt);
  $('#cohort-help').hidden = false;
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      const readout = $('#cohort-grid > #record-inspector');
      if (readout) placeInGrid(readout, comparison.rows.findIndex(record => record.row === selectedRow));
    }).observe($('#cohort-grid'));
  }
  $('#load-status').textContent = `Recomputed from all ${comparison.cohortSize} frozen predictions. Counts match exactly; accuracy, Brier and AUROC match stored values within 1e-12. ${globalThis.crypto?.subtle ? 'LF-normalized results SHA-256 matches the receipt.' : 'File hashing is unavailable in this browser; numerical and split checks passed.'} No model was trained or tuned.`;
  $('#load-status').dataset.state = 'verified';
} catch (error) {
  $('#load-status').dataset.state = 'error';
  $('#load-status').textContent = `Interactive verification unavailable: ${error.message} The page retains its labeled reference snapshot. Inspect the downloadable frozen results and receipt; the static table includes every test record.`;
  document.querySelectorAll('button[data-record]').forEach(control => { control.disabled = true; });
}
