# Data dictionary and output schema

## WDBC

Thirty features are the mean, standard error, and worst (mean of the three largest) values of ten cell-nucleus measurements: radius, texture, perimeter, area, smoothness, compactness, concavity, concave points, symmetry, and fractal dimension. These are computed from digitized fine-needle aspirate images. The feature names loaded by sklearn are stored in results.json. `truth=1` means malignant; `truth=0` benign. `raw` and `calibrated` are predicted malignancy probabilities for the same held-out record.

## Diabetes

| Feature | Published meaning |
|---|---|
| age | Age in years |
| sex | Binary sex coding in source data; not a general gender representation |
| bmi | Body mass index |
| bp | Average blood pressure |
| s1 | Total serum cholesterol |
| s2 | Low-density lipoproteins |
| s3 | High-density lipoproteins |
| s4 | Total cholesterol / HDL |
| s5 | Possibly log serum triglycerides; source meaning incompletely specified |
| s6 | Blood sugar level |

Target: quantitative progression score one year after baseline; its units are unspecified here. All members of this cohort already had diabetes. Raw numeric values are used before training-only transforms.

## Heart-failure cohort

| Field | Meaning / treatment |
|---|---|
| age | Age in years |
| anaemia | Source binary anemia indicator |
| creatinine_phosphokinase | CPK level, mcg/L per source |
| diabetes | Source binary diabetes indicator |
| ejection_fraction | Percentage |
| high_blood_pressure | Source binary hypertension indicator |
| platelets | Platelet measurement; source UCI reports kiloplatelets/mL |
| serum_creatinine | mg/dL |
| serum_sodium | mEq/L |
| sex | Source binary coding |
| smoking | Source binary smoking indicator |
| time | Follow-up days; excluded from usable baseline models |
| DEATH_EVENT | Event during recorded follow-up; retrospective binary target |

The original file has no missing values. Stress-test masks create missing cells artificially. Demographics are not used to make protected-group safety claims. Unavailable source site/subject group identifiers preclude independent group splitting.

## `results.json`

- `schema`, `date`, `seed`, `environment`: run metadata.
- Each experiment has `split` arrays of zero-based source row indices, `features`, `n`, and exact data digest.
- Calibration: `metrics`, five-bin `reliability` with Wilson intervals, seven `selective` thresholds, and all held-out `records`.
- Conformal: per-model MAE/RMSE/R² and bootstrap MAE interval, three interval levels with calibration radius `q`, coverage and Wilson intervals, BMI strata, and test predictions.
- Robustness: intact-test metrics; four missingness rates; one preview mask plus all 30 AUROC/Brier values per rate/recipe; mean and 5th–95th percentiles over masks.
- Model uncertainty intervals are not patient-level confidence probabilities. Split-conformal intervals have a marginal guarantee only under the stated assumptions.
