# Medical AI calibration study verification

Reviewed November 25, 2026. The archived analysis uses baseline source `e684514f15e587e87c179009e34a302b1eece9cb`.

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

Independent JavaScript and Python recomputations match stored metrics within absolute tolerance 1e-12, with exact integer counts. The page leads with row 215 because it is the only record to cross the fixed 50% cutoff. Its malignancy probability rises from 45.71% to 52.08%. Row 190 remains a false negative. The 114 records retain their original test order and all contribute to the reported metrics.

## Passed checks

- All 23 Node tests passed with `node --test tests/*.test.mjs`. They cover metric and receipt validation, the static cohort, the featured record, contextual keyboard selection, the source link after loading and the fallback when verification fails.
- `python -m unittest discover -s tests -p '*_test.py'`: 7 independent receipt tests.
- `python research/build_observatory.py --check`: deterministic receipt and frozen metrics match.
- `node research/build_observatory_view.mjs --check`: complete static 114-row table and cohort match the frozen adapter.
- `python research/verify_results.py`: original verification passes (split integrity, Brier, regression errors, interval coverage, finite-sample quantile/Wilson boundaries and stored leakage exclusion).
- `git diff --check`: no whitespace errors.

Source inspection confirms training-only scaling/logistic fitting and calibration-only sigmoid fitting around a frozen estimator. The original research and site `results.json` bytes are unchanged. The receipt distinguishes original-byte hashes, LF-normalized text hashes and structured hashes.

An independent refit on Windows with scikit-learn 1.7.0 reproduced all 114 pairs of stored predictions to within 2.2 × 10⁻¹⁵. The archived fit used scikit-learn 1.8.0. The source dataset fingerprint and all held-out labels matched the archive.

## Browser review

Chrome touch emulation at 390 × 844 confirmed that selecting test record 81 (source row 215) displays both 45.71% and 52.08% beside the selection in the grid and the expanded table. The same interaction passed with a desktop mouse. Arrow keys, Home and End move among records and Tab exits each view. Both the hosted page and the offline preview preserve the direct dataset link and expose all 114 records with scripting disabled.

Six viewport sizes from 320 to 1440 pixels wide passed reflow checks. At 200% browser zoom the page reflowed to 629 CSS pixels wide, and the selected estimates remained in view. The selected button's accessible name and pressed state were checked in Chrome's accessibility tree. Physical iPhone Safari and spoken screen-reader output remain unverified.

The delivered checks cover A-01–A-03 and A-06–A-08 for frozen calibration arithmetic, provenance and reporting. The Medical AI lab retains its existing confidence-threshold, interval and missingness experiments. The November 24 revision of §5 scopes this addition to the lab's calibration study on the Projects page.
