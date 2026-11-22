# Medical AI, under pressure

[![Tests](https://github.com/bomberJV/medical-ai-research/actions/workflows/tests.yml/badge.svg)](https://github.com/bomberJV/medical-ai-research/actions/workflows/tests.yml) · [Open it on brandonfhuang.com](https://brandonfhuang.com/projects/play/medical/)

Three actual, reproducible benchmark experiments prepared for Brandon Frank Han-Chween Huang with AI-assisted analysis and writing. Public data; no clinical service, patient-input interface, or new patient collection. Study date: November 13, 2026.

## Run

Python 3.12 was used. From `research/` in the downloaded package (or this directory in the site repository):

```sh
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements.txt
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 python3 run_experiments.py
python3 render_calibration.py
python3 verify_results.py
```

`output/results.json` records every numerical result, test prediction, split index, environment version, and dataset hash. The run writes SVG and PNG figures. Fixed thread limits avoid excessive parallelism for these small datasets. The two scikit-learn datasets are local package resources; the attributed UCI heart-failure CSV is bundled. If it is removed, the script downloads its original UCI archive.

## Browse the completed experiment

From the top-level downloaded folder:

```sh
python3 -m http.server 8000 --directory site
```

Open http://localhost:8000/medical/. The view uses recorded results; it does not retrain models or send health data anywhere. You can explore confidence thresholds, conformal coverages, model comparisons, and paired missingness masks. The reports can be printed to PDF from a browser.

## AI Reliability Observatory

The calibration comparison is available at `site/medical/observatory.html` (with the server above, open http://localhost:8000/medical/observatory.html). Inspect any of the 114 held-out WDBC records, compare raw and sigmoid-calibrated probabilities, and download the experiment receipt. Accuracy, Brier score, AUROC and confusion counts are independently recomputed from frozen predictions. The complete cohort stays visible when inspecting the protocol's fixed abstention thresholds.

This view reuses the recorded November 13 run. It does not train a new model, tune thresholds or establish clinical validation. The receipt includes dataset and split hashes, model configuration, metric definitions, uncertainty scope, original environment and explicit unknown historical metadata. Expanded interval and missingness Observatory views remain follow-on work; the existing notebook studies remain available.

```sh
python research/build_observatory.py --check
npm test
```

The receipt exporter uses only the Python standard library. See [the versioned Observatory export contract](research/OBSERVATORY.md) for regeneration, verification tolerances and acceptance boundaries.

## Experiments

1. **Confidence is not accuracy.** WDBC logistic classification, independent sigmoid calibration, predefined selective-prediction thresholds. Calibration worsened Brier score on this split despite improving classification by one case.
2. **A prediction needs room to be wrong.** Raw diabetes features; ridge and boosting models with split-conformal intervals. Coverage, width, error, and exploratory BMI strata are reported separately.
3. **A model meets missing information.** Heart-failure baseline classification, future-information leakage demonstration, and paired missing-cell stress tests with a training-only augmentation comparator.

Read `PROTOCOL.md`, `DATA_DICTIONARY.md`, and `PROVENANCE.md` before interpreting the outputs. All models and thresholds were fixed before evaluation. The independent audit corrected the augmentation sample weighting and consistent indicator features before interpretation; it did not select models from test performance.

## Rebuild the site reports

From the repository root, run `python research/build_site.py` to rebuild the three reports in `site/medical/` from the saved results.

## Tests

`verify_results.py` independently recomputes selected results, checks split integrity, and verifies conformal helpers. The original repository additionally contains seven Node tests for view calculations and leakage guards; a portable copy is in `tests/medical.test.mjs`.

```sh
node --test tests/medical.test.mjs
```

Run this from the top-level package. Node 22 or newer recommended. No JavaScript dependency installation is required.

## Interpretation limits

Small historical datasets; one fixed split; no external hospital, prospective, temporal, imaging, or clinical-utility validation. Bootstrap intervals describe test-row sampling conditional on the fit. Missingness bands describe artificial corruption only. Different dataset cohorts are not a combined meta-analysis. The models are not medical devices, and no patient-level recommendations are generated.

## License

Created by Brandon Frank Han-Chween Huang ([brandonfhuang.com](https://brandonfhuang.com)).

- **Code** (scripts, styles, page markup, tests and tools): [Apache License 2.0](LICENSE). Keep the [NOTICE](NOTICE) file with any copy or derivative.
- **Writing, figures, papers, results and narration recordings**: [CC BY 4.0](LICENSE-CC-BY-4.0.txt). Credit “Brandon Frank Han-Chween Huang” and link to https://brandonfhuang.com or this repository.
- **Third-party files** keep their own licenses:
  - The UCI datasets keep their CC BY 4.0 terms and the diabetes data its scikit-learn source; attribution is in [research/PROVENANCE.md](research/PROVENANCE.md).
  - `site/shared/symbols.woff` is a DejaVu font subset under the Bitstream Vera license ([site/shared/FONT-LICENSE.txt](site/shared/FONT-LICENSE.txt)).
