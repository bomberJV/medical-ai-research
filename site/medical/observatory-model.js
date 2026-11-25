/** Read-only adapter for the recorded WDBC experiment. No fitting or tuning. */
export const ADAPTER_VERSION = 'calibration-observatory-v1';
export const METRIC_TOLERANCE = 1e-12;
export const PRESET_THRESHOLDS = Object.freeze([0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99]);
export const FROZEN_CALIBRATION = Object.freeze({
  dataset: 'Wisconsin Diagnostic Breast Cancer', n: 569, featureCount: 30,
  train: 341, calibration: 114, test: 114, seed: 20261113, date: '2026-11-13',
  sklearn: '1.8.0', dataSha256: '28fc6b7cdb8a1824689c926a6004e0800c4032a4ee1db540331d0b293ff2a468',
});

const MODELS = ['raw', 'calibrated'];
const fail = message => { throw new Error(`Calibration record check: ${message}`); };

function checkProbabilityRecord(record, model) {
  if (!record || (record.truth !== 0 && record.truth !== 1)) fail('outcomes must be binary, with malignant = 1');
  if (!Number.isFinite(record[model]) || record[model] < 0 || record[model] > 1) {
    fail(`${model} probability must be finite and in [0, 1]`);
  }
}

/** Pairwise concordance with half credit for ties; null without both classes. */
function pairwiseAuc(records, model) {
  const positive = records.filter(record => record.truth === 1);
  const negative = records.filter(record => record.truth === 0);
  if (!positive.length || !negative.length) return null;
  let concordance = 0;
  for (const a of positive) for (const b of negative) {
    concordance += a[model] > b[model] ? 1 : a[model] === b[model] ? 0.5 : 0;
  }
  return concordance / (positive.length * negative.length);
}

/**
 * Recompute on retained rows. The denominator of every selected metric is n;
 * total and deferred keep the original cohort visible. Exactly p = .5 is positive.
 */
export function classificationSummary(records, model = 'calibrated', threshold = 0.5) {
  if (!Array.isArray(records)) fail('records must be an array');
  if (!MODELS.includes(model)) fail('unknown probability model');
  if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 1) fail('threshold must be in [0.5, 1]');
  for (const record of records) checkProbabilityRecord(record, model);
  const retained = records.filter(record => Math.max(record[model], 1 - record[model]) >= threshold);
  let tn = 0, fp = 0, fn = 0, tp = 0, squaredError = 0, negativeLogProbability = 0;
  for (const record of retained) {
    const positive = record[model] >= 0.5;
    if (record.truth === 1) { if (positive) tp++; else fn++; }
    else { if (positive) fp++; else tn++; }
    squaredError += (record[model] - record.truth) ** 2;
    const clipped = Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, record[model]));
    negativeLogProbability -= record.truth ? Math.log(clipped) : Math.log1p(-clipped);
  }
  const n = retained.length, total = records.length, correct = tn + tp;
  const auc = pairwiseAuc(retained, model);
  return {
    total, n, retained: n, deferred: total - n,
    retainedFraction: total ? n / total : null,
    correct, accuracy: n ? correct / n : null,
    brier: n ? squaredError / n : null, auc,
    log_loss: n ? negativeLogProbability / n : null,
    tn, fp, fn, tp, malignantRetained: tp + fn,
    sensitivity: tp + fn ? tp / (tp + fn) : null,
    specificity: tn + fp ? tn / (tn + fp) : null,
    undefinedReason: n ? null : 'No records retained; accuracy, Brier score and AUROC are undefined.',
    aucUndefinedReason: auc === null ? 'AUROC requires both outcome classes among retained records.' : null,
  };
}

function sameNumber(actual, recorded, label) {
  if (actual === null || recorded === null) {
    if (actual !== recorded) fail(`${label} differs from the frozen record`);
  } else if (!Number.isFinite(actual) || !Number.isFinite(recorded) || Math.abs(actual - recorded) > METRIC_TOLERANCE) {
    fail(`${label} differs from the frozen record (absolute tolerance ${METRIC_TOLERANCE})`);
  }
}

function sameCount(actual, recorded, label) {
  if (!Number.isInteger(recorded) || actual !== recorded) fail(`${label} count differs from the frozen record`);
}

function checkInterval(interval, label, minimum = 0, maximum = 1) {
  if (!Array.isArray(interval) || interval.length !== 2 || interval.some(value => !Number.isFinite(value)) ||
      interval[0] > interval[1] || interval[0] < minimum || interval[1] > maximum) fail(`${label} interval is invalid`);
}

/** Fail closed if the source schema, split, cohort, or recomputable claims disagree. */
export function verifyCalibrationResults(results) {
  if (!results || results.schema !== 1) fail('unsupported results schema');
  const data = results.calibration;
  if (!data || !Number.isInteger(data.n) || data.n < 1) fail('dataset size is missing');
  if (data.dataset !== FROZEN_CALIBRATION.dataset || data.n !== FROZEN_CALIBRATION.n ||
      results.seed !== FROZEN_CALIBRATION.seed || results.date !== FROZEN_CALIBRATION.date ||
      results.environment?.sklearn !== FROZEN_CALIBRATION.sklearn ||
      !Array.isArray(data.features) || data.features.length !== FROZEN_CALIBRATION.featureCount ||
      new Set(data.features).size !== FROZEN_CALIBRATION.featureCount) fail('unsupported frozen experiment metadata');
  if (data.positive !== 'malignant') fail('positive-class definition changed');
  if (data.data_sha256 !== FROZEN_CALIBRATION.dataSha256) fail('dataset SHA-256 does not match the frozen experiment');
  const partitions = ['train', 'calibration', 'test'];
  if (!data.split || Object.keys(data.split).length !== partitions.length) fail('expected train/calibration/test partitions');
  const allRows = [];
  for (const partition of partitions) {
    const rows = data.split[partition];
    if (!Array.isArray(rows) || !rows.length) fail(`${partition} partition is empty or missing`);
    allRows.push(...rows);
  }
  if (allRows.length !== data.n || new Set(allRows).size !== data.n ||
      allRows.some(row => !Number.isInteger(row) || row < 0 || row >= data.n)) {
    fail('split partitions must be exhaustive, unique and disjoint');
  }
  if (partitions.some(partition => data.split[partition].length !== FROZEN_CALIBRATION[partition])) fail('frozen split denominators changed');
  if (!Array.isArray(data.records) || data.records.length !== data.split.test.length) fail('test cohort denominator changed');
  const testRows = new Set(data.split.test);
  if (new Set(data.records.map(record => record.row)).size !== data.records.length ||
      data.records.some(record => !testRows.has(record.row))) fail('prediction rows do not match the complete test partition');

  const recomputed = {};
  for (const model of MODELS) {
    const summary = classificationSummary(data.records, model);
    recomputed[model] = summary;
    const recorded = data.metrics?.[model];
    if (!recorded) fail(`${model} metrics are missing`);
    for (const metric of ['n', 'tn', 'fp', 'fn', 'tp']) sameCount(summary[metric], recorded[metric], `${model}.${metric}`);
    for (const metric of ['accuracy', 'brier', 'auc', 'log_loss', 'sensitivity', 'specificity']) sameNumber(summary[metric], recorded[metric], `${model}.${metric}`);
    checkInterval(recorded.brier_ci, `${model} Brier bootstrap`);
    checkInterval(recorded.auc_ci, `${model} AUROC bootstrap`);
  }
  const paired = data.paired_brier_raw_minus_calibrated;
  if (!paired) fail('paired Brier comparison is missing');
  const pairedDifference = data.records.reduce((sum, row) => sum + (row.raw - row.truth) ** 2 - (row.calibrated - row.truth) ** 2, 0) / data.records.length;
  sameNumber(pairedDifference, paired.difference, 'paired Brier raw minus calibrated');
  checkInterval(paired.ci, 'paired Brier bootstrap', -1, 1);

  if (!Array.isArray(data.selective) || data.selective.length !== PRESET_THRESHOLDS.length ||
      new Set(data.selective.map(row => row.threshold)).size !== PRESET_THRESHOLDS.length) fail('preset threshold records are incomplete');
  for (const threshold of PRESET_THRESHOLDS) {
    const recorded = data.selective.find(row => row.threshold === threshold);
    if (!recorded) fail(`preset threshold ${threshold} is missing`);
    const summary = classificationSummary(data.records, 'calibrated', threshold);
    for (const [actual, saved] of [['retained', 'retained'], ['deferred', 'deferred'], ['fn', 'false_negatives'], ['fp', 'false_positives'], ['malignantRetained', 'malignant_retained']]) {
      sameCount(summary[actual], recorded[saved], `threshold ${threshold}.${saved}`);
    }
    sameNumber(summary.retainedFraction, recorded.coverage, `threshold ${threshold}.coverage`);
    sameNumber(summary.accuracy, recorded.accuracy, `threshold ${threshold}.accuracy`);
    if (summary.n) checkInterval(recorded.accuracy_ci, `threshold ${threshold} Wilson`);
    else if (!Array.isArray(recorded.accuracy_ci) || recorded.accuracy_ci.length !== 2 || recorded.accuracy_ci.some(value => value !== null)) fail('empty retained cohort must have an undefined interval');
  }
  return {
    status: 'verified', adapterVersion: ADAPTER_VERSION, tolerance: METRIC_TOLERANCE,
    countTolerance: 0, cohortSize: data.records.length,
    scope: 'Frozen predictions, split integrity, raw/calibrated metrics and preset selective totals. No model fitting or bootstrap replay.',
  };
}

/** One adapter supplies the table, selected record and complete-cohort comparison. */
export function buildCalibrationComparison(results, { threshold = 0.5 } = {}) {
  if (!PRESET_THRESHOLDS.includes(threshold)) fail('choose one of the seven prespecified thresholds; no interpolation');
  const verification = verifyCalibrationResults(results);
  const data = results.calibration;
  const full = Object.fromEntries(MODELS.map(model => [model, classificationSummary(data.records, model)]));
  const selected = Object.fromEntries(MODELS.map(model => [model, classificationSummary(data.records, model, threshold)]));
  const rows = data.records.map(record => ({
    ...record,
    rawPrediction: Number(record.raw >= 0.5), calibratedPrediction: Number(record.calibrated >= 0.5),
    rawCorrect: Number(record.raw >= 0.5) === record.truth,
    calibratedCorrect: Number(record.calibrated >= 0.5) === record.truth,
    rawRetained: Math.max(record.raw, 1 - record.raw) >= threshold,
    calibratedRetained: Math.max(record.calibrated, 1 - record.calibrated) >= threshold,
    rawSquaredError: (record.raw - record.truth) ** 2,
    calibratedSquaredError: (record.calibrated - record.truth) ** 2,
  }));
  const selective = data.selective.find(row => row.threshold === threshold);
  return {
    cohortSize: rows.length, rows, full, selected, threshold, verification,
    delta: {
      accuracy: full.calibrated.accuracy - full.raw.accuracy,
      brier: full.calibrated.brier - full.raw.brier,
      correct: full.calibrated.correct - full.raw.correct,
    },
    uncertainty: {
      raw: { brier_ci: [...data.metrics.raw.brier_ci], auc_ci: [...data.metrics.raw.auc_ci] },
      calibrated: { brier_ci: [...data.metrics.calibrated.brier_ci], auc_ci: [...data.metrics.calibrated.auc_ci] },
      paired: {
        difference: data.paired_brier_raw_minus_calibrated.difference,
        ci: [...data.paired_brier_raw_minus_calibrated.ci],
        method: 'Recorded 95% paired test-row percentile bootstrap interval; 2000 replicates; raw minus calibrated Brier.',
      },
      selective: {
        accuracy_ci: [...selective.accuracy_ci],
        method: 'Recorded 95% Wilson binomial interval for calibrated retained accuracy.',
      },
      bootstrapMethod: 'Recorded 95% test-row percentile bootstrap intervals; 2000 replicates.',
      limitation: 'Intervals condition on one fitted model and one split, not training variability or external validation. Corruption-mask variation belongs to the separate missingness study.',
    },
  };
}

function sameRecordedValue(expected, actual, path) {
  if (typeof expected === 'number') return sameNumber(expected, actual, path);
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) fail(`${path} does not match the frozen receipt identity`);
    expected.forEach((value, index) => sameRecordedValue(value, actual[index], `${path}[${index}]`));
  } else if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') fail(`${path} is missing`);
    for (const [key, value] of Object.entries(expected)) sameRecordedValue(value, actual[key], `${path}.${key}`);
  } else if (actual !== expected) fail(`${path} does not match the frozen receipt identity`);
}

/**
 * Bind the displayed receipt to this adapter's frozen experiment, not merely to
 * a matching date. Byte hashing is a separate asynchronous browser/build check.
 */
export function verifyCalibrationReceipt(receipt, results) {
  const verification = verifyCalibrationResults(results);
  const data = results.calibration;
  const runId = `recorded-${results.date}-seed-${results.seed}`;
  const datasetId = `wdbc-${data.data_sha256.slice(0, 16)}`;
  const splitId = 'wdbc-split-9e85e1556838f4f7';
  sameRecordedValue({
    schema_version: '1.0.0', experiment_id: 'wdbc-sigmoid-calibration',
    receipt_id: `${runId}-wdbc-calibration-receipt-v1`,
    run: {
      id: runId, source_schema: results.schema, date: results.date, seed: results.seed,
      environment: results.environment, original_code_revision: null, timestamp: null,
    },
    dataset: {
      id: datasetId, name: data.dataset, n: data.n, feature_count: data.features.length,
      features: data.features, data_sha256: data.data_sha256,
      version: `scikit-learn ${results.environment.sklearn}`,
      positive_class: {value: 1, label: 'malignant'}, negative_class: {value: 0, label: 'benign'},
    },
    split: {id: splitId, seed: results.seed, calibration_split_seed: results.seed + 1},
    model: {
      raw: {id: 'wdbc-raw', version: results.environment.sklearn, type: 'StandardScaler + LogisticRegression', fit_partition: 'train', parameters: {C: 1, max_iter: 3000, random_state: results.seed}},
      calibrated: {id: 'wdbc-calibrated', version: results.environment.sklearn, type: "CalibratedClassifierCV(FrozenEstimator(raw), method='sigmoid')", fit_partition: 'calibration; raw pipeline remains frozen', parameters: {method: 'sigmoid'}},
      decision_rule: 'Positive iff p >= 0.5; equality is positive.',
    },
    provenance: {results_sha256: 'de764658093547349c746b532d2e58ba926240b2bb66b5ea295262f547ca6289'},
    verification: {adapter_version: ADAPTER_VERSION, tolerance: METRIC_TOLERANCE, relative_tolerance: 0},
  }, receipt, 'receipt');

  for (const [partition, rows] of Object.entries(data.split)) {
    const declared = receipt.split.partitions?.[partition];
    sameRecordedValue({count: rows.length, rows}, declared, `receipt.split.${partition}`);
  }
  for (const name of ['accuracy', 'brier', 'auc', 'log_loss', 'tn', 'fp', 'fn', 'tp', 'sensitivity', 'specificity', 'retention', 'paired_brier_raw_minus_calibrated']) {
    const definition = receipt.metrics?.definitions?.[name];
    if (!definition || typeof definition.definition !== 'string' || !definition.definition.trim() ||
        typeof definition.unit !== 'string' || !definition.unit.trim()) fail(`receipt metric definition ${name} is missing`);
  }
  sameRecordedValue({accuracy: {direction: 'higher'}, auc: {direction: 'higher'}, brier: {direction: 'lower'}, log_loss: {direction: 'lower'}}, receipt.metrics.definitions, 'receipt.metrics.definitions');

  for (const model of MODELS) {
    const summary = classificationSummary(data.records, model);
    const entry = receipt.metrics?.[model];
    sameRecordedValue({
      result_id: `${runId}-wdbc-${model}`, dataset_id: datasetId, split_id: splitId,
      model_id: `wdbc-${model}`, model_version: `scikit-learn ${results.environment.sklearn}`,
      metric_definitions: '#/metrics/definitions', denominator: data.records.length,
      recorded_values: data.metrics[model],
    }, entry, `receipt.metrics.${model}`);
    for (const key of ['n', 'tn', 'fp', 'fn', 'tp', 'correct']) sameCount(summary[key], entry.values?.[key], `receipt.${model}.${key}`);
    for (const key of ['accuracy', 'brier', 'auc', 'log_loss', 'sensitivity', 'specificity']) sameNumber(summary[key], entry.values?.[key], `receipt.${model}.${key}`);
  }
  const positives = data.records.filter(row => row.truth === 1).length;
  const negatives = data.records.length - positives;
  sameRecordedValue({test_records: data.records.length, malignant: positives, benign: negatives, auc_positive_negative_pairs: positives * negatives}, receipt.metrics.denominators, 'receipt.metrics.denominators');
  sameRecordedValue(data.paired_brier_raw_minus_calibrated, receipt.metrics.paired_brier_raw_minus_calibrated, 'receipt.metrics.paired_brier');
  const retention = receipt.metrics.preset_calibrated_retention;
  if (!Array.isArray(retention) || retention.length !== PRESET_THRESHOLDS.length) fail('receipt retention records are incomplete');
  data.selective.forEach((record, index) => sameRecordedValue(record, retention[index], `receipt.retention[${index}]`));
  sameRecordedValue({
    test_row_bootstrap: {replicates: 2000, seed: results.seed, paired_difference_seed: results.seed + 1},
    binomial: {method: 'Wilson 95% interval'},
  }, receipt.uncertainty, 'receipt.uncertainty');
  return {...verification, receiptId: receipt.receipt_id, receiptSchema: receipt.schema_version, receiptStatus: 'matched'};
}
