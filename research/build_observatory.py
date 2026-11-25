"""Verify frozen WDBC predictions and export their deterministic experiment receipt.

Standard library only. This does not fit, recalibrate, resample, tune, or replace
research results. See OBSERVATORY.md (export contract 1.0.0).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_VERSION = "1.0.0"
ADAPTER_VERSION = "calibration-observatory-v1"
BASELINE_REVISION = "e684514f15e587e87c179009e34a302b1eece9cb"
FROZEN_RESULTS_SHA256 = "de764658093547349c746b532d2e58ba926240b2bb66b5ea295262f547ca6289"
ORIGINAL_RESULTS_BYTE_SHA256 = "dd97ba35f5c1fe9a8256ec70d543c4020b983e1e1b97b43a7a02fb9ab5949122"
TOLERANCE = 1e-12
THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def text_hash(path):
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def object_hash(value):
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def equal_number(actual, expected, name):
    if actual is None or expected is None:
        require(actual is expected, f"{name}: null mismatch")
    else:
        require(type(expected) in (int, float) and math.isfinite(expected), f"{name}: invalid reference")
        require(math.isclose(actual, expected, abs_tol=TOLERANCE, rel_tol=0), f"{name}: {actual} != {expected}")


def wilson(correct, n):
    if n == 0:
        return [None, None]
    z = 1.95996398454
    p = correct / n
    denominator = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denominator
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator
    return [0.0 if correct == 0 else max(0.0, center - half),
            1.0 if correct == n else min(1.0, center + half)]


def classify(records, model):
    counts = {key: 0 for key in ("tn", "fp", "fn", "tp")}
    for row in records:
        truth, p = row["truth"], row[model]
        require(type(truth) is int and truth in (0, 1), "Truth must be binary")
        require(type(p) in (int, float) and math.isfinite(p) and 0 <= p <= 1,
                "Probability must be finite and in [0, 1]")
        counts[("tp" if p >= 0.5 else "fn") if truth else ("fp" if p >= 0.5 else "tn")] += 1
    n = len(records)
    positives = [row[model] for row in records if row["truth"] == 1]
    negatives = [row[model] for row in records if row["truth"] == 0]
    pairs = len(positives) * len(negatives)
    # Independent pairwise concordance, rather than the research sklearn metric.
    concordance = sum((a > b) + 0.5 * (a == b) for a in positives for b in negatives)
    epsilon = 2.220446049250313e-16  # numpy float64 epsilon used by sklearn log_loss
    losses = []
    for row in records:
        p = min(1 - epsilon, max(epsilon, row[model]))
        losses.append(-math.log(p if row["truth"] else 1 - p))
    return {
        "n": n, **counts, "correct": counts["tn"] + counts["tp"],
        "accuracy": (counts["tn"] + counts["tp"]) / n if n else None,
        "brier": math.fsum((row[model] - row["truth"]) ** 2 for row in records) / n if n else None,
        "auc": concordance / pairs if pairs else None,
        "log_loss": math.fsum(losses) / n if n else None,
        "sensitivity": counts["tp"] / len(positives) if positives else None,
        "specificity": counts["tn"] / len(negatives) if negatives else None,
    }


def selective(records, threshold):
    require(type(threshold) in (int, float) and math.isfinite(threshold) and 0.5 <= threshold <= 1,
            "Confidence threshold must be in [0.5, 1]")
    retained = [row for row in records if max(row["calibrated"], 1 - row["calibrated"]) >= threshold]
    metrics = classify(retained, "calibrated")
    n = len(retained)
    return {
        "threshold": threshold, "retained": n, "deferred": len(records) - n,
        "coverage": n / len(records) if records else None,
        "accuracy": metrics["accuracy"], "accuracy_ci": wilson(metrics["correct"], n),
        "false_negatives": metrics["fn"], "false_positives": metrics["fp"],
        "malignant_retained": metrics["tp"] + metrics["fn"],
        "undefined_accuracy_reason": "No records retained; accuracy has a zero denominator." if not n else None,
    }


def verify_results(results):
    require(results["schema"] == 1, "Unsupported results schema")
    for key in ("calibration", "conformal", "robustness"):
        experiment = results[key]
        rows = []
        for name, partition in experiment["split"].items():
            require(all(type(row) is int and 0 <= row < experiment["n"] for row in partition),
                    f"{key}/{name}: invalid row identifier")
            require(len(set(partition)) == len(partition), f"{key}/{name}: duplicate row")
            rows.extend(partition)
        require(len(rows) == experiment["n"] and len(set(rows)) == len(rows), f"{key}: overlapping/incomplete splits")
        require(set(rows) == set(range(experiment["n"])), f"{key}: split does not cover dataset")
    require("time" not in results["robustness"]["features"], "Follow-up time leaked into usable baseline predictors")
    c = results["calibration"]
    require(set(c["split"]) == {"train", "calibration", "test"}, "Unexpected WDBC partition names")
    require([row["row"] for row in c["records"]] == c["split"]["test"], "Predictions must exactly match the ordered test split")
    require(len(c["records"]) > 0, "The frozen test cohort must not be empty")
    computed = {}
    for model in ("raw", "calibrated"):
        metrics = classify(c["records"], model)
        computed[model] = metrics
        stored = c["metrics"][model]
        for key in ("n", "tn", "fp", "fn", "tp"):
            require(type(stored[key]) is int and metrics[key] == stored[key], f"{model}/{key}: count mismatch")
        for key in ("accuracy", "brier", "auc", "log_loss", "sensitivity", "specificity"):
            equal_number(metrics[key], stored[key], f"{model}/{key}")
    difference = math.fsum((row["raw"] - row["truth"]) ** 2 - (row["calibrated"] - row["truth"]) ** 2
                           for row in c["records"]) / len(c["records"])
    equal_number(difference, c["paired_brier_raw_minus_calibrated"]["difference"], "paired Brier difference")
    require([row["threshold"] for row in c["selective"]] == THRESHOLDS, "Frozen threshold list differs from protocol")
    for stored in c["selective"]:
        value = selective(c["records"], stored["threshold"])
        for key in ("retained", "deferred", "false_negatives", "false_positives", "malignant_retained"):
            require(type(stored[key]) is int and value[key] == stored[key], f"selective/{key}: count mismatch")
        for key in ("coverage", "accuracy"):
            equal_number(value[key], stored[key], f"selective/{key}")
        require(len(stored["accuracy_ci"]) == 2, "selective/Wilson: two bounds required")
        for a, b in zip(value["accuracy_ci"], stored["accuracy_ci"]):
            equal_number(a, b, "selective/Wilson")
    return computed


def build_receipt(root=ROOT):
    results_path = root / "research/output/results.json"
    site_results_path = root / "site/medical/results.json"
    results = json.loads(results_path.read_text(encoding="utf-8"))
    require(text_hash(results_path) == text_hash(site_results_path), "Site and research frozen results differ")
    require(text_hash(results_path) == FROZEN_RESULTS_SHA256,
            "Frozen result identity changed; a new run needs a new versioned export contract")
    computed = verify_results(results)
    c = results["calibration"]
    split_id = "wdbc-split-" + object_hash(c["split"])[:16]
    dataset_id = "wdbc-" + c["data_sha256"][:16]
    run_id = f"recorded-{results['date']}-seed-{results['seed']}"
    artifact_paths = ["research/PROTOCOL.md", "research/PROVENANCE.md", "research/DATA_DICTIONARY.md",
                      "research/requirements.txt", "research/run_experiments.py", "research/verify_results.py",
                      "research/OBSERVATORY.md", "research/build_observatory.py", "site/medical/observatory-model.js"]
    artifacts = [{"path": path, "sha256_utf8_lf": text_hash(root / path)} for path in artifact_paths]
    definitions = {
        "accuracy": {"definition": "Correct labels / evaluated records, with predicted positive iff p >= 0.5.", "unit": "proportion", "direction": "higher"},
        "brier": {"definition": "Mean((p - truth)^2); p is malignancy probability and truth is 0 or 1.", "unit": "squared probability", "direction": "lower"},
        "auc": {"definition": "Concordant positive-negative probability pairs / all such pairs; ties count 0.5.", "unit": "proportion", "direction": "higher", "undefined_when": "One class is absent."},
        "log_loss": {"definition": "Mean negative log probability of the observed class; float64 epsilon clipping as in the recorded runner.", "unit": "natural-log units", "direction": "lower"},
        "tn": {"definition": "truth=0 and p<0.5", "unit": "records"},
        "fp": {"definition": "truth=0 and p>=0.5", "unit": "records"},
        "fn": {"definition": "truth=1 and p<0.5", "unit": "records"},
        "tp": {"definition": "truth=1 and p>=0.5", "unit": "records"},
        "sensitivity": {"definition": "tp / (tp + fn)", "unit": "proportion"},
        "specificity": {"definition": "tn / (tn + fp)", "unit": "proportion"},
        "retention": {"definition": "Retain iff max(p, 1-p) >= preset threshold; deferred records remain in full cohort.", "unit": "records and proportions", "undefined_when": "Zero retained gives null accuracy, never 100%."},
        "paired_brier_raw_minus_calibrated": {"definition": "Mean(raw squared error - calibrated squared error) on paired test rows.", "unit": "squared probability difference", "negative_means": "Calibrated Brier is worse."},
    }
    result_entries = {}
    for name in ("raw", "calibrated"):
        result_entries[name] = {
            "result_id": f"{run_id}-wdbc-{name}", "dataset_id": dataset_id, "split_id": split_id,
            "model_id": f"wdbc-{name}", "model_version": "scikit-learn " + results["environment"]["sklearn"],
            "metric_definitions": "#/metrics/definitions", "denominator": len(c["records"]),
            "values": computed[name], "recorded_values": c["metrics"][name],
            "evidence": "Recomputed from frozen test predictions; uncertainty intervals remain recorded.",
        }
    return {
        "schema_version": SCHEMA_VERSION,
        "receipt_id": f"{run_id}-wdbc-calibration-receipt-v1",
        "experiment_id": "wdbc-sigmoid-calibration",
        "status": "recorded experiment",
        "run": {
            "id": run_id, "source_schema": results["schema"], "date": results["date"], "seed": results["seed"],
            "environment": results["environment"],
            "original_code_revision": None, "original_code_revision_reason": "The original results do not record an execution commit.",
            "date_basis": "Hardcoded analysis-date label in the original runner; not a verified execution timestamp.",
            "timestamp": None, "timestamp_reason": "Only an analysis-date label was recorded, not an execution time.",
            "hardware": None, "hardware_reason": "Not recorded by the original runner.",
            "operating_system": None, "operating_system_reason": "Not recorded by the original runner.",
        },
        "dataset": {
            "id": dataset_id, "name": c["dataset"], "n": c["n"], "feature_count": len(c["features"]), "features": c["features"],
            "positive_class": {"value": 1, "label": "malignant"}, "negative_class": {"value": 0, "label": "benign"},
            "loader": "sklearn.datasets.load_breast_cancer()", "version": "scikit-learn " + results["environment"]["sklearn"],
            "data_sha256": c["data_sha256"], "digest_definition": "Original contiguous float64 feature matrix plus analysis labels, as recorded by run_experiments.digest.",
            "source_url": "https://archive.ics.uci.edu/dataset/17/breast-cancer-wisconsin-diagnostic",
            "doi": "https://doi.org/10.24432/C5DW2B",
            "attribution": "William Wolberg, Olvi Mangasarian, Nick Street and W. Street, as listed by UCI.",
            "license": {"name": "Creative Commons Attribution 4.0", "url": "https://creativecommons.org/licenses/by/4.0/",
                        "basis": "UCI dataset 17 states CC BY 4.0; rights page rechecked 2026-11-21. Original provenance source check dated 2026-11-13.",
                        "rights_review_date": "2026-11-21", "terms_source_url": "https://archive.ics.uci.edu/dataset/17/breast-cancer-wisconsin-diagnostic",
                        "redistribution": "Existing derived benchmark predictions/outcomes and row ordinals; no new source images or feature table."},
            "source_check_date": "2026-11-13", "source_record_id": "Zero-based source row ordinal; not a clinical identifier.",
        },
        "split": {
            "id": split_id, "method": "Stratified fixed 60/20/20. Hold out 20% with seed 20261113, then 25% of the remainder for calibration with seed 20261114.",
            "seed": results["seed"], "calibration_split_seed": results["seed"] + 1,
            "partitions": {name: {"count": len(rows), "rows_sha256": object_hash(rows), "rows": rows} for name, rows in c["split"].items()},
            "verification": "Unique, in-range, disjoint rows; union is all 569 dataset rows; all 114 predictions match the ordered test split.",
        },
        "model": {
            "raw": {"id": "wdbc-raw", "type": "StandardScaler + LogisticRegression", "version": results["environment"]["sklearn"],
                    "parameters": {"C": 1, "max_iter": 3000, "random_state": results["seed"], "other_parameters": "scikit-learn 1.8.0 defaults"}, "fit_partition": "train"},
            "calibrated": {"id": "wdbc-calibrated", "type": "CalibratedClassifierCV(FrozenEstimator(raw), method='sigmoid')", "version": results["environment"]["sklearn"],
                           "parameters": {"method": "sigmoid", "base_estimator": "FrozenEstimator of the trained raw pipeline"}, "fit_partition": "calibration; raw pipeline remains frozen"},
            "decision_rule": "Positive iff p >= 0.5; equality is positive.",
            "selection": "Model hyperparameters, five reliability bins and seven retention thresholds fixed in the original protocol; no test-set tuning.",
        },
        "metrics": {
            "definitions": definitions,
            "denominators": {"test_records": len(c["records"]), "malignant": sum(row["truth"] for row in c["records"]),
                             "benign": sum(1 - row["truth"] for row in c["records"]),
                             "auc_positive_negative_pairs": sum(row["truth"] for row in c["records"]) * sum(1 - row["truth"] for row in c["records"])},
            **result_entries,
            "paired_brier_raw_minus_calibrated": c["paired_brier_raw_minus_calibrated"],
            "preset_calibrated_retention": [selective(c["records"], t) for t in THRESHOLDS],
            "reporting": "Accuracy improves by 1/114; Brier and log loss worsen; AUROC is unchanged. False negatives remain 2 raw and 1 calibrated.",
        },
        "uncertainty": {
            "test_row_bootstrap": {"status": "recorded, not regenerated by this adapter", "replicates": 2000,
                                   "interval": "2.5th–97.5th percentile; paired row bootstrap for Brier difference",
                                   "seed": results["seed"], "paired_difference_seed": results["seed"] + 1,
                                   "limits": "Conditions on one fitted model and split; excludes training variability and external validity."},
            "binomial": {"method": "Wilson 95% interval", "uses": "Recorded reliability-bin proportions and calibrated retained accuracy", "verification": "Retained accuracy bounds independently recomputed."},
            "corruption_masks": {"scope": "Existing heart-failure study, outside this delivered calibration view", "method": "5th–95th percentiles over 30 artificial MCAR masks per level", "limits": "Same cohort reused; not a population confidence interval or independent cohorts."},
        },
        "provenance": {
            "baseline_revision": BASELINE_REVISION, "baseline_revision_role": "Frozen implementation inspected for export; original execution revision is unknown.",
            "repository": "https://github.com/bomberJV/medical-ai-research",
            "results_sha256": text_hash(results_path), "results_path": "research/output/results.json",
            "results_sha256_definition": "SHA-256 after UTF-8 CRLF/CR to LF normalization, as with other text artifacts.",
            "original_results_byte_sha256": ORIGINAL_RESULTS_BYTE_SHA256,
            "original_results_byte_sha256_definition": "Exact archived result bytes at baseline_revision, before checkout line-ending conversion.",
            "records_sha256": object_hash(c["records"]),
            "artifact_hash_definition": "SHA-256 of UTF-8 text normalized CRLF/CR to LF; no other whitespace changes.",
            "structured_hash_definition": "SHA-256 of UTF-8 compact JSON with sorted object keys; arrays in original order; no nonfinite numbers.",
            "artifacts": artifacts,
            "protocol_version": {"date": "2026-11-13", "path": "research/PROTOCOL.md", "identity": "Exact protocol content hash in artifacts; no original version number recorded."},
            "export_contract": {"version": SCHEMA_VERSION, "date": "2026-11-21", "path": "research/OBSERVATORY.md"},
        },
        "verification": {
            "adapter_version": ADAPTER_VERSION, "tolerance": TOLERANCE, "relative_tolerance": 0,
            "counts": "Exact integer equality", "status": "passed frozen-record arithmetic and integrity checks",
            "scope": ["All recorded split partitions are complete and disjoint", "WDBC predictions cover the full ordered test cohort", "Raw/calibrated accuracy, confusion, Brier, AUROC, log loss, sensitivity and specificity", "Paired Brier mean difference", "All seven calibrated retained/deferred counts, proportions and Wilson intervals", "Follow-up time excluded from stored usable heart-failure features"],
            "not_performed": ["Model fitting or full research rerun", "New bootstrap sampling", "Full per-mask robustness replay", "External or clinical validation"],
        },
        "limitations": [
            "One small historical public cohort and one fixed split; no claim of generalization or clinical validation.",
            "Pre-extracted cell features, not an image-reading model, diagnosis, individual prognosis or patient-upload service.",
            "Source site/group identifiers are unavailable; one row per released record does not establish independent site or patient grouping.",
            "Retained accuracy is conditional on selected rows. Deferred rows and adverse outcomes remain visible; zero observed retained errors is not zero population risk.",
            "Frozen predictions cannot establish what an unrecorded historical execution did; leakage controls are documented in protocol and source.",
            "Intervals and missingness remain follow-on Observatory views. Full robustness replay needs the research pipeline or per-mask prediction exports.",
        ],
        "reproduction": {
            "verify": "python research/build_observatory.py --check",
            "export": "python research/build_observatory.py",
            "tests": "python -m unittest discover -s tests -p '*_test.py'",
            "full_pipeline": ["python -m pip install -r research/requirements.txt", "python research/run_experiments.py", "python research/verify_results.py", "python research/build_site.py"],
            "full_pipeline_note": "Use a separate checkout; full fitting overwrites original outputs. This receipt check does not run that pipeline.",
        },
    }


def export_receipt(check=False, root=ROOT):
    receipt = build_receipt(root)
    serialized = json.dumps(receipt, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    destination = root / "site/medical/observatory-receipt.json"
    if check:
        require(destination.exists(), "Receipt missing; run python research/build_observatory.py")
        require(destination.read_text(encoding="utf-8") == serialized, "Receipt stale; regenerate with python research/build_observatory.py")
    else:
        destination.write_text(serialized, encoding="utf-8", newline="\n")
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify frozen arithmetic and require receipt to match; write nothing")
    arguments = parser.parse_args()
    try:
        export_receipt(check=arguments.check)
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(1, f"Observatory verification failed: {error}\n")
    print("Verified frozen calibration metrics, complete splits and preset retention; receipt " + ("matches." if arguments.check else "exported."))


if __name__ == "__main__":
    main()
