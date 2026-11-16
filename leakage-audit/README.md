# Follow-up time leakage audit

An audit of machine-learning studies that use the UCI Heart Failure Clinical Records dataset (299 patients). Most classifiers built on this dataset use the follow-up `time` column as an input. That column is not known at baseline and partly encodes the outcome.

Status: draft, pending independent human verification of every coding. Not peer-reviewed. Retrieval, screening, coding, experiments and drafting were AI-assisted (Claude, Anthropic), directed by Brandon Huang.

## Main numbers

- 105 classification studies coded: 55 used follow-up time, 12 excluded it, 38 unclear. Of the 67 that could be determined, 82% used it (73% counting only explicit statements).
- 2024–2026: 30 of 36 determinable studies used it, after the issue was flagged in 2023.
- 28 studies report accuracy of 90% or more: 19 used time, 7 unclear, 2 did not. 4 of the 28 trained on synthetic or expanded versions of the dataset (a 5,000-record Kaggle version, or generated records), not the 299 patients.
- Random forest, 5×20 cross-validation: AUROC 0.79 on the 11 clinical features, 0.91 with `time`, 0.96 with `time` and SMOTE applied before the split.

## Contents

| Path | What it is |
| --- | --- |
| `data/coded_studies.csv` | All 134 coded works: OpenAlex ID, citation frame or search, design, data used (299 patients or a synthetic/expanded version), time code, oversampling note, headline metric, evidence note |
| `data/screen1.csv` | All 764 works citing the two source papers (OpenAlex, retrieved 2026-11-15), with the first abstract-level screen |
| `data/extract.csv` | Dataset-signature scores and evidence counts for the 241 full texts obtained |
| `data/fetch_log*.csv` | Full-text retrieval outcome per work |
| `data/web_reading_first_pass.csv` | First 25 studies coded by web reading before the citation sweep |
| `pipeline/` | Retrieval and coding helpers (below) |
| `experiments/` | Leakage experiments on the dataset in `../research/data/` |

## Reproduce

Experiments (Python 3.12, scikit-learn 1.9, pandas, numpy):

```sh
cd experiments
python3 leak_cv.py ../../research/data/heart_failure_clinical_records_dataset.csv
python3 smote_leak.py ../../research/data/heart_failure_clinical_records_dataset.csv smote_results.csv
python3 split_luck.py ../../research/data/heart_failure_clinical_records_dataset.csv
```

Literature pipeline. Each script reads and writes files in its own folder, so copy `pipeline/` to a working folder first. Network access is needed; `getpdf.py` needs `pypdf`.

1. `fetch.py` — citing works from OpenAlex (page-based paging) → `citing_works.jsonl`, `screen1.csv`.
2. `getpdf.py` — open-access full texts → `txt/`, `fetch_log.csv`. Edit the selection line to run the excluded set.
3. `extract.py` — dataset-signature score and evidence snippets → `extract.csv`, `evidence.json`.
4. `brief.py`, `probe.py` — print evidence for manual coding.
5. `sectioncheck.py` — second pass: where in each paper the evidence sits.

Full texts are not included: they belong to their publishers. OpenAlex results change over time, so a rerun will not match `screen1.csv` exactly.

## Coding rules

| Code | Rule |
| --- | --- |
| used (explicit) | Time named as a selected feature, a top-ranked feature, or a model input |
| used (implied) | All columns used, or time listed among inputs, and no exclusion stated |
| not used | The paper states time was removed or excluded |
| unclear | Neither can be established from the text obtained |
| survival | Time is the outcome of a survival model; not a leak |

## Limits

Full text was obtained for 241 of 764 citing works; 67 likely-relevant paywalled works are unassessed. 24 "used" codes are implied. Oversampling placement is usually unstated. Coding was done by an AI system in two passes, plus a third pass that checked every statement about a named study against its full text (corrections are marked "review 2026-11-15" in the notes column). It must be checked by a person before publication. Two near-duplicate texts are counted once.
