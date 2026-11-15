# Data and method provenance

Analysis date and source check: 2026-11-13. These are newly run benchmark analyses, not empirical discoveries or results copied from cited articles. The source researchers collected the records. Brandon Frank Han-Chween Huang did not collect these datasets. Analysis and writing were AI-assisted.

## 1. Wisconsin Diagnostic Breast Cancer

- Creators: William Wolberg, Olvi Mangasarian, Nick Street, W. Street.
- UCI record: https://archive.ics.uci.edu/dataset/17/breast-cancer-wisconsin-diagnostic
- Dataset DOI: https://doi.org/10.24432/C5DW2B
- License: Creative Commons Attribution 4.0, as stated by UCI.
- Loaded through `sklearn.datasets.load_breast_cancer()` from scikit-learn 1.8.0.
- 569 rows, 30 inputs; original labels 0=malignant,1=benign. Analysis intentionally uses 1=malignant.
- Only numerical features and class labels are loaded. No images or names.
- Stable source row ordinal is used for split integrity; it is not a clinical identifier.
- SHA-256 of contiguous float64 input/analysis-label matrix appears in `results.json`.

## 2. Diabetes progression benchmark

- Source study: Efron, Hastie, Johnstone, Tibshirani (2004), Least Angle Regression, Annals of Statistics.
- Source table: https://www4.stat.ncsu.edu/~boos/var.select/diabetes.html
- Study: https://hastie.su.domains/Papers/LARS/LeastAngle_2002.pdf
- Loader documentation: https://scikit-learn.org/stable/modules/generated/sklearn.datasets.load_diabetes.html
- Loaded with `load_diabetes(scaled=False)` from scikit-learn 1.8.0. Scaling is fitted on training only.
- 442 records, 10 baseline variables, one quantitative progression score at one year.
- Raw source table is not separately redistributed here. The reproducible loader and exact package version supply inputs; derived test predictions and target scores are included.
- The original documentation does not fully specify measurement meanings/units, especially `s5`. Do not reinterpret this outcome as blood glucose or HbA1c.

## 3. Heart Failure Clinical Records

- UCI record: https://archive.ics.uci.edu/dataset/519/heart+failure+clinical+records
- Dataset authors listed by UCI: Davide Chicco and Giuseppe Jurman (2020).
- Source study: https://doi.org/10.1186/s12911-020-1023-5
- Original download: https://archive.ics.uci.edu/static/public/519/heart+failure+clinical+records.zip
- License: Creative Commons Attribution 4.0, as stated by UCI.
- Bundled file: `data/heart_failure_clinical_records_dataset.csv`, unchanged from the archive.
- Exact CSV SHA-256 appears in `results.json`.
- 299 records; `DEATH_EVENT` is the retrospective binary target. `time` is follow-up duration and excluded from baseline models. No common prediction horizon is implied.

## Methods

- Sigmoid calibration with independent held-out data: https://scikit-learn.org/stable/modules/generated/sklearn.calibration.CalibratedClassifierCV.html
- Guo et al. (2017), On Calibration of Modern Neural Networks: https://proceedings.mlr.press/v70/guo17a.html — general distinction between discrimination and calibration; this experiment does not use neural networks.
- Lei et al. (2018), Distribution-Free Predictive Inference for Regression: https://www.stat.cmu.edu/~ryantibs/papers/conformal-jasa.pdf
- Angelopoulos & Bates, conformal prediction introduction: https://arxiv.org/abs/2107.07511

## Reproducibility controls

Seed 20261113, recorded environment versions, saved split indices, train-only preprocessing, no external patient data, fixed models and thresholds before test evaluation. No paid training or hosted inference. Data access occurred via public UCI and local scikit-learn resources. One independent statistical reviewer audited the code and independently recalculated the reported results. That audit is a software/statistical check, not scientific peer review.
