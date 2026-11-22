"""Independent receipt checks and corruption fixtures; no fitting or downloads."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("build_observatory", ROOT / "research/build_observatory.py")
receipt = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(receipt)


class ReceiptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.results = json.loads((ROOT / "research/output/results.json").read_text(encoding="utf-8"))

    def test_recorded_comparison_and_adverse_outcomes(self):
        calculated = receipt.verify_results(self.results)
        self.assertEqual(calculated["raw"]["n"], 114)
        self.assertEqual(calculated["raw"]["correct"], 112)
        self.assertEqual(calculated["calibrated"]["correct"], 113)
        self.assertEqual(calculated["raw"]["fn"], 2)
        self.assertEqual(calculated["calibrated"]["fn"], 1)
        self.assertGreater(calculated["calibrated"]["brier"], calculated["raw"]["brier"])
        self.assertEqual(calculated["raw"]["auc"], calculated["calibrated"]["auc"])

    def test_duplicate_or_overlapping_splits_rejected(self):
        changed = copy.deepcopy(self.results)
        changed["calibration"]["split"]["train"][0] = changed["calibration"]["split"]["test"][0]
        with self.assertRaisesRegex(ValueError, "overlapping"):
            receipt.verify_results(changed)
        changed = copy.deepcopy(self.results)
        changed["calibration"]["split"]["train"][0] = changed["calibration"]["split"]["train"][1]
        with self.assertRaisesRegex(ValueError, "duplicate"):
            receipt.verify_results(changed)

    def test_missing_prediction_is_not_silently_dropped(self):
        changed = copy.deepcopy(self.results)
        changed["calibration"]["records"].pop()
        with self.assertRaisesRegex(ValueError, "exactly match"):
            receipt.verify_results(changed)

    def test_invalid_or_tampered_metric_rejected(self):
        changed = copy.deepcopy(self.results)
        changed["calibration"]["records"][0]["raw"] = float("nan")
        with self.assertRaisesRegex(ValueError, "finite"):
            receipt.verify_results(changed)
        changed = copy.deepcopy(self.results)
        changed["calibration"]["metrics"]["raw"]["brier"] += 1e-8
        with self.assertRaisesRegex(ValueError, "raw/brier"):
            receipt.verify_results(changed)

    def test_threshold_equality_zero_retention_and_single_class_auc(self):
        rows = [{"truth": 1, "calibrated": 0.75}, {"truth": 0, "calibrated": 0.5}]
        at_boundary = receipt.selective(rows, 0.75)
        self.assertEqual((at_boundary["retained"], at_boundary["deferred"]), (1, 1))
        none = receipt.selective(rows, 1.0)
        self.assertEqual(none["retained"] + none["deferred"], 2)
        self.assertIsNone(none["accuracy"])
        self.assertEqual(none["accuracy_ci"], [None, None])
        self.assertIn("zero denominator", none["undefined_accuracy_reason"])
        self.assertIsNone(receipt.classify(rows[:1], "calibrated")["auc"])

    def test_auc_ties_receive_half_credit(self):
        rows = [{"truth": 1, "raw": 0.5}, {"truth": 0, "raw": 0.5}]
        self.assertEqual(receipt.classify(rows, "raw")["auc"], 0.5)

    def test_receipt_identity_denominators_and_unknown_history(self):
        manifest = receipt.build_receipt()
        self.assertEqual(manifest, receipt.build_receipt())
        self.assertEqual(manifest["metrics"]["denominators"]["auc_positive_negative_pairs"], 42 * 72)
        self.assertEqual(manifest["provenance"]["results_sha256"], receipt.FROZEN_RESULTS_SHA256)
        for name in ("raw", "calibrated"):
            result = manifest["metrics"][name]
            self.assertEqual(result["denominator"], 114)
            self.assertEqual(result["split_id"], manifest["split"]["id"])
            self.assertEqual(result["dataset_id"], manifest["dataset"]["id"])
            self.assertEqual(result["metric_definitions"], "#/metrics/definitions")
        self.assertIsNone(manifest["run"]["original_code_revision"])
        self.assertIsNone(manifest["run"]["timestamp"])
        self.assertIsNone(manifest["run"]["hardware"])


if __name__ == "__main__":
    unittest.main()
