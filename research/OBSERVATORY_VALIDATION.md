# Calibration Observatory verification

Review date: 2026-11-21 (America/New_York). Baseline source: `e684514f15e587e87c179009e34a302b1eece9cb`.

This change adds an inspectable view of the frozen November 13 analysis. It does not create a new fitted model, evaluation split, bootstrap run or clinical-validation result.

## Results checked

| Full held-out cohort | Raw logistic | Sigmoid calibrated |
| --- | ---: | ---: |
| Records | 114 | 114 |
| Correct labels | 112 | 113 |
| Brier score | 0.012093829063298542 | 0.020497663495140258 |
| AUROC | 0.9996693121693122 | 0.9996693121693122 |
| False negatives / malignant records | 2 / 42 | 1 / 42 |
| False positives / benign records | 0 / 72 | 0 / 72 |

Independent JavaScript and Python recomputations match stored metrics within absolute tolerance 1e-12, with exact integer counts. Source row 215 changes from false negative to true positive; source row 190 remains false negative. The initial displayed record is the first in the original test order, not a selected success. Full cohort metrics remain fixed during threshold inspection.

## Passed checks

- `node --test tests/*.test.mjs`: 20 tests, including 7 existing tests, metric corruption fixtures, receipt binding, static cohort integrity, controller selection/deferral and fetch/receipt failure paths.
- `python -m unittest discover -s tests -p '*_test.py'`: 7 independent receipt tests.
- `python research/build_observatory.py --check`: deterministic receipt and frozen metrics match.
- `node research/build_observatory_view.mjs --check`: complete static 114-row table and cohort match the frozen adapter.
- `python research/verify_results.py`: original verification passes (split integrity, Brier, regression errors, interval coverage, finite-sample quantile/Wilson boundaries and stored leakage exclusion).
- `git diff --check`: no whitespace errors.

Source inspection confirms training-only scaling/logistic fitting and calibration-only sigmoid fitting around a frozen estimator. The original research and site `results.json` bytes are unchanged. The receipt distinguishes original-byte hashes, LF-normalized text hashes and structured hashes.

The local verification environment was Windows, Python 3.12.9, NumPy 1.26.4 and scikit-learn 1.7.0. Only existing-output verification ran there. It is not the archived fitting environment recorded in the receipt; no claim of a pinned-environment training replay is made.

## Pending review and boundaries

Actual browser rendering, 390px/mobile/tablet/desktop layouts, 200% zoom, keyboard focus and screen-reader operation still need review. The connected browser could not reach the local HTTP preview; browser security policy also rejected local-file navigation. Controller tests use a small Node test harness, not a real browser or accessibility audit. No screenshots or browser performance measurements are claimed.

The delivered checks cover A-01–A-03 and A-06–A-08 for frozen calibration arithmetic, provenance and reporting. They do not prove the behavior of an unrecorded historical execution, independently replay archived bootstrap samples, or fulfill A-04/A-05 expansions. Full missingness replay still requires the research pipeline or new per-mask exports. Interval/missingness Observatory views, new protocols and homepage/film integration remain follow-on work. Publication and deployment are not part of this PR.
