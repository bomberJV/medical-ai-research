import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADAPTER_VERSION, METRIC_TOLERANCE, PRESET_THRESHOLDS,
  classificationSummary, verifyCalibrationResults, buildCalibrationComparison, verifyCalibrationReceipt,
} from '../site/medical/observatory-model.js';

const results = JSON.parse(readFileSync(new URL('../site/medical/results.json', import.meta.url)));
const receipt = JSON.parse(readFileSync(new URL('../site/medical/observatory-receipt.json', import.meta.url)));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= METRIC_TOLERANCE, `${actual} != ${expected}`);
const copy = () => structuredClone(results);

test('A-02: independent hand-calculated accuracy, Brier and pairwise AUROC include ties', () => {
  const rows = [
    { truth: 1, raw: 0.8 }, { truth: 1, raw: 0.5 },
    { truth: 0, raw: 0.5 }, { truth: 0, raw: 0.1 },
  ];
  const summary = classificationSummary(rows, 'raw');
  assert.deepEqual([summary.tn, summary.fp, summary.fn, summary.tp], [1, 1, 0, 2]);
  assert.equal(summary.correct, 3);
  assert.equal(summary.accuracy, 3 / 4);
  close(summary.brier, (0.04 + 0.25 + 0.25 + 0.01) / 4);
  close(summary.log_loss, -(Math.log(0.8) + Math.log(0.5) + Math.log(0.5) + Math.log(0.9)) / 4);
  assert.equal(summary.auc, 3.5 / 4);
  assert.equal(classificationSummary(rows.map(row => ({ ...row, raw: 0.5 })), 'raw').auc, 0.5);
});

test('A-01/A-02: frozen split and all 114 test predictions verify, including unchanged AUROC and adverse Brier', () => {
  const comparison = buildCalibrationComparison(results);
  assert.equal(comparison.verification.status, 'verified');
  assert.equal(comparison.verification.adapterVersion, ADAPTER_VERSION);
  assert.equal(comparison.verification.tolerance, 1e-12);
  assert.equal(comparison.verification.countTolerance, 0);
  assert.equal(comparison.cohortSize, 114);
  assert.equal(comparison.full.raw.correct, 112);
  assert.equal(comparison.full.calibrated.correct, 113);
  close(comparison.full.raw.brier, 0.012093829063298542);
  close(comparison.full.calibrated.brier, 0.020497663495140258);
  close(comparison.full.raw.auc, 0.9996693121693122);
  assert.equal(comparison.full.raw.auc, comparison.full.calibrated.auc);
  assert.equal(comparison.full.raw.fn, 2);
  assert.equal(comparison.full.calibrated.fn, 1);
  assert.equal(comparison.delta.correct, 1);
  assert.ok(comparison.delta.brier > 0, 'the worsening probability score must remain visible');
  assert.ok(comparison.rows.some(row => !row.rawCorrect));
  assert.ok(comparison.rows.some(row => !row.calibratedCorrect));
  assert.equal(comparison.rows[0].row, results.calibration.records[0].row);
  assert.equal(comparison.rows[0].raw, results.calibration.records[0].raw);
});

test('A-01: split leakage, missing records, duplicate rows and foreign test IDs fail closed', () => {
  const overlap = copy();
  overlap.calibration.split.calibration[0] = overlap.calibration.split.train[0];
  assert.throws(() => verifyCalibrationResults(overlap), /exhaustive, unique and disjoint/);
  const missing = copy(); missing.calibration.records.pop();
  assert.throws(() => verifyCalibrationResults(missing), /denominator/);
  const duplicate = copy(); duplicate.calibration.records[0].row = duplicate.calibration.records[1].row;
  assert.throws(() => verifyCalibrationResults(duplicate), /complete test partition/);
  const foreign = copy(); foreign.calibration.records[0].row = foreign.calibration.split.train[0];
  assert.throws(() => verifyCalibrationResults(foreign), /complete test partition/);
  const incomplete = copy(); incomplete.calibration.split.train.pop();
  assert.throws(() => verifyCalibrationResults(incomplete), /exhaustive, unique and disjoint/);
  const reordered = copy(); reordered.calibration.records.reverse();
  assert.equal(verifyCalibrationResults(reordered).status, 'verified', 'identity is source row, not display position');
});

test('A-02: altered stored metrics and invalid predictions cannot masquerade as verified', () => {
  for (const field of ['brier', 'accuracy', 'auc', 'fn', 'n']) {
    const altered = copy(); altered.calibration.metrics.raw[field] += 0.001;
    assert.throws(() => verifyCalibrationResults(altered), /differs/);
  }
  const delta = copy(); delta.calibration.paired_brier_raw_minus_calibrated.difference *= -1;
  assert.throws(() => verifyCalibrationResults(delta), /paired Brier/);
  const probability = copy(); probability.calibration.records[0].calibrated = NaN;
  assert.throws(() => verifyCalibrationResults(probability), /probability/);
  const truth = copy(); truth.calibration.records[0].truth = 2;
  assert.throws(() => verifyCalibrationResults(truth), /binary/);
  const schema = copy(); schema.schema = 99;
  assert.throws(() => verifyCalibrationResults(schema), /unsupported/);
  const classDefinition = copy(); classDefinition.calibration.positive = 'benign';
  assert.throws(() => verifyCalibrationResults(classDefinition), /positive-class/);
  const run = copy(); run.seed += 1;
  assert.throws(() => verifyCalibrationResults(run), /frozen experiment metadata/);
  const features = copy(); features.calibration.features.pop();
  assert.throws(() => verifyCalibrationResults(features), /frozen experiment metadata/);
  const resizedSplit = copy(); resizedSplit.calibration.split.train.push(resizedSplit.calibration.split.calibration.pop());
  assert.throws(() => verifyCalibrationResults(resizedSplit), /frozen split denominators/);
  const dataset = copy(); dataset.calibration.data_sha256 = '0'.repeat(64);
  assert.throws(() => verifyCalibrationResults(dataset), /dataset SHA-256/);
});

test('A-02/A-03: every preset preserves the complete cohort and reconciles retained/deferred denominators', () => {
  const full = buildCalibrationComparison(results).full;
  for (const threshold of PRESET_THRESHOLDS) {
    const comparison = buildCalibrationComparison(results, { threshold });
    assert.equal(comparison.rows.length, 114);
    assert.deepEqual(comparison.full, full);
    for (const model of ['raw', 'calibrated']) {
      const summary = comparison.selected[model];
      assert.equal(summary.retained + summary.deferred, comparison.cohortSize);
      assert.equal(summary.tn + summary.fp + summary.fn + summary.tp, summary.retained);
      assert.equal(summary.correct + summary.fp + summary.fn, summary.retained);
      assert.equal(comparison.rows.filter(row => row[`${model}Retained`]).length, summary.retained);
    }
    const expected = results.calibration.selective.find(row => row.threshold === threshold);
    assert.equal(comparison.selected.calibrated.retained, expected.retained);
    assert.equal(comparison.selected.calibrated.fn, expected.false_negatives);
    assert.equal(comparison.selected.calibrated.accuracy, expected.accuracy);
  }
  assert.throws(() => buildCalibrationComparison(results, { threshold: 0.75 }), /prespecified/);
  assert.throws(() => buildCalibrationComparison(results, { threshold: 1 }), /prespecified/);
});

test('A-03: exact threshold boundary is retained and zero retained never becomes perfect accuracy', () => {
  const rows = [{ truth: 1, calibrated: 0.75 }, { truth: 0, calibrated: 0.25 }];
  assert.equal(classificationSummary(rows, 'calibrated', 0.75).retained, 2);
  const empty = classificationSummary(rows, 'calibrated', 1);
  assert.equal(empty.total, 2);
  assert.equal(empty.retained, 0);
  assert.equal(empty.deferred, 2);
  assert.equal(empty.accuracy, null);
  assert.equal(empty.brier, null);
  assert.equal(empty.auc, null);
  assert.match(empty.undefinedReason, /No records retained/);
  assert.equal(classificationSummary([], 'raw').retainedFraction, null);
  assert.equal(classificationSummary([{ truth: 1, raw: 0.9 }], 'raw').auc, null);
  for (const threshold of [NaN, Infinity, -1, 0.49, 1.01]) assert.throws(() => classificationSummary(rows, 'calibrated', threshold), /threshold/);
  assert.throws(() => classificationSummary(rows, 'unknown'), /unknown/);
  assert.throws(() => classificationSummary([{ truth: 0, raw: 1.1 }], 'raw'), /probability/);
});

test('A-06/A-07: uncertainty stays recorded and methods are distinct; no favorable-only reduction', () => {
  const comparison = buildCalibrationComparison(results, { threshold: 0.95 });
  assert.deepEqual(comparison.uncertainty.raw.brier_ci, results.calibration.metrics.raw.brier_ci);
  assert.deepEqual(comparison.uncertainty.paired.ci, results.calibration.paired_brier_raw_minus_calibrated.ci);
  assert.match(comparison.uncertainty.paired.method, /paired test-row/);
  assert.match(comparison.uncertainty.selective.method, /Wilson binomial/);
  assert.match(comparison.uncertainty.limitation, /one fitted model and one split/);
  assert.match(comparison.uncertainty.limitation, /Corruption-mask variation/);
  assert.equal(comparison.rows.filter(row => !row.calibratedCorrect).length, 1);
  assert.equal(comparison.full.calibrated.n, 114);
  assert.ok(comparison.selected.calibrated.deferred > 0);
  const malformed = copy(); malformed.calibration.metrics.raw.brier_ci.reverse();
  assert.throws(() => verifyCalibrationResults(malformed), /interval is invalid/);
});

test('A-08: the adapter leaves immutable frozen research and browser records identical', () => {
  const before = JSON.stringify(results);
  const comparison = buildCalibrationComparison(results);
  comparison.rows[0].raw = 0;
  comparison.uncertainty.raw.brier_ci[0] = 0;
  assert.equal(JSON.stringify(results), before);
  const research = JSON.parse(readFileSync(new URL('../research/output/results.json', import.meta.url)));
  assert.deepEqual(results, research);
  assert.match(comparison.verification.scope, /No model fitting or bootstrap replay/);
});

test('A-08: receipt is bound to the actual run, split, model and metrics before display', () => {
  const verified = verifyCalibrationReceipt(receipt, results);
  assert.equal(verified.receiptStatus, 'matched');
  assert.equal(verified.receiptId, receipt.receipt_id);
  const corruptions = [
    r => { r.schema_version = '2.0.0'; },
    r => { r.receipt_id += '-unrelated'; },
    r => { r.dataset.name = 'Other dataset'; },
    r => { r.dataset.data_sha256 = '0'.repeat(64); },
    r => { r.dataset.positive_class.label = 'benign'; },
    r => { r.run.seed += 1; },
    r => { r.run.environment.sklearn = 'other'; },
    r => { r.run.original_code_revision = 'invented'; },
    r => { r.split.partitions.test.rows.reverse(); },
    r => { r.split.partitions.calibration.count += 1; },
    r => { r.model.raw.parameters.C = 10; },
    r => { r.model.calibrated.fit_partition = 'test'; },
    r => { r.metrics.raw.split_id = 'unrelated-split'; },
    r => { r.metrics.calibrated.denominator = 113; },
    r => { r.metrics.raw.values.brier += 1e-8; },
    r => { r.metrics.calibrated.values.log_loss += 1e-8; },
    r => { r.metrics.raw.recorded_values.auc_ci[0] = 0.1; },
    r => { r.metrics.definitions.brier.direction = 'higher'; },
    r => { delete r.metrics.definitions.accuracy; },
    r => { r.metrics.denominators.malignant = 41; },
    r => { r.metrics.preset_calibrated_retention[1].deferred = 0; },
    r => { r.metrics.preset_calibrated_retention[0].accuracy_ci[0] = 1; },
    r => { r.uncertainty.test_row_bootstrap.replicates = 100; },
    r => { r.provenance.results_sha256 = '0'.repeat(64); },
    r => { r.verification.tolerance = 0.01; },
  ];
  for (const corrupt of corruptions) {
    const altered = structuredClone(receipt);
    corrupt(altered);
    assert.throws(() => verifyCalibrationReceipt(altered, results), /Calibration record check:/);
  }
});
