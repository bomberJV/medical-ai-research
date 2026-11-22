# Calibration Observatory export contract

Version: **1.0.0**, dated 2026-11-21. Adapter: `calibration-observatory-v1`.
This contract is fixed before executing its verification/export checks. It is a
view of the frozen 2026-11-13 experiment, not a new fitting or evaluation protocol.
The original [protocol](PROTOCOL.md), prediction records and numerical outputs
remain unchanged. New interval, missingness, subgroup or repeated-evaluation
studies require a separately versioned protocol before running.

## Delivered scope

One public benchmark prediction expands into all 114 WDBC test records. Original
and sigmoid-calibrated probabilities are paired by their source row ordinal.
Accuracy, confusion counts, Brier score and AUROC are recomputed from those
records. The fixed class decision is `p >= 0.5`. The optional retention view uses
only the seven thresholds specified in the original protocol. It does not choose
a threshold from test performance or create intermediate measured results.

`observatory-receipt.json` gives each model result an identifier, dataset and split
references, model version, metric definitions and denominator. It attaches the
original run date, seed and environment; source attribution and documented
license; data, split, prediction, protocol and code hashes; the verification
scope; commands; and limitations. The original execution commit, exact time,
hardware and operating system were not recorded and stay null with reasons.
The source revision identifies the frozen implementation inspected for this
export, not a recovered execution commit.

## Verification and hashing

From the repository root:

```sh
python research/build_observatory.py --check
python -m unittest discover -s tests -p '*_test.py'
node --test tests/*.test.mjs
```

To regenerate only the receipt, run `python research/build_observatory.py`.
`python research/build_site.py` also invokes that exporter. No fitting occurs in
either receipt command. The exporter uses only Python's standard library and
fails if the frozen research and site results differ or a metric disagrees.
Version 1 pins the original result artifact digest; different outputs require a
new versioned export contract. The historical date is a hardcoded analysis-date
label in the original runner, not proof of an actual execution timestamp.

Integers (counts, labels, row identifiers) must match exactly. Recomputed floating
point metrics use **absolute tolerance 1e-12, relative tolerance zero**. Accuracy,
confusion counts, Brier, pairwise AUROC (half credit for ties), log loss,
sensitivity, specificity, the paired Brier mean difference, and all recorded
calibrated retention counts/proportions/Wilson limits are checked independently.
Zero retained records have null accuracy and null Wilson bounds, with an explicit
explanation. Both classes must be present for a defined AUROC.

Artifact hashes use SHA-256 over UTF-8 text after CRLF/CR normalization to LF;
no other whitespace is changed. Structured hashes use UTF-8 compact JSON with
sorted object keys and no nonfinite numbers. Split arrays retain their recorded
order. These conventions are named in the receipt so Windows checkouts reproduce
the same manifest. The dataset matrix digest is the original recorded SHA-256
of contiguous float64 inputs plus analysis labels; the exporter does not claim
to reconstruct that matrix from test predictions.

## Acceptance evidence and boundaries

| Gate | Delivered check / limitation |
| --- | --- |
| A-01 | Check all recorded split partitions for unique, in-range, disjoint rows covering the dataset; calibration records exactly cover the ordered test split. Source audit: StandardScaler/logistic fit training; FrozenEstimator sigmoid fits calibration; no test tuning. The heart-failure baseline excludes `time`. Frozen-record checks cannot prove what an unrecorded historical process executed. |
| A-02 | Recompute calibration metrics and all seven retention rows with exact count and 1e-12 floating tolerances. Interval coverage/width and per-mask robustness are outside this new view. |
| A-03 | Validate retained + deferred = cohort size, equality at the threshold, and zero retained => undefined accuracy. Deferred outcomes remain in the full cohort. |
| A-06 | Label the stored 2000-replicate test-row bootstrap separately from Wilson binomial proportion intervals and corruption-mask variation. Do not recompute or relabel archived bootstrap ranges as new measurements. |
| A-07 | Keep accuracy improvement, worse Brier/log loss, unchanged AUROC and false negatives visible. Preserve the full cohort and deferral denominator. No winner selection, clinical claim or external-validation claim. |
| A-08 | Archive original outputs, environment, protocol and source hashes in the receipt; verification replays arithmetic only. No new research outcomes are produced or used in a homepage film. A future new run must execute the owning experiment/verification pipeline and archive its environment/outputs before film use. |

The original runner can be replayed in its pinned research environment:

```sh
python -m pip install -r research/requirements.txt
python research/run_experiments.py
python research/verify_results.py
python research/build_site.py
```

Run that workflow in a separate checkout: it overwrites research outputs. A
receipt check alone is not a fitted-model replay or scientific validation.

The archived bootstrap intervals condition on one fitted model and one split;
they omit training-set variability. Reliability-bin and retention Wilson limits
are binomial intervals, not bootstrap intervals. Thirty corruption repetitions
reuse the same cohort; their 5th–95th percentile range is mask variation, not a
population confidence interval or 30 independent cohorts. Complete robustness
replay needs the research pipeline or new per-mask prediction exports. No such
replay can be reconstructed from the existing browser summary alone.

## Rights and intended use

The WDBC source, creators, UCI DOI and CC BY 4.0 terms recorded in
[PROVENANCE.md](PROVENANCE.md) remain attached. This change redistributes only
the already-bundled benchmark outcomes/probabilities, row ordinals and derived
results; it adds no images, source feature table or new patient data. Dataset
rights are separate from the repository's Apache-2.0 code and CC BY 4.0 writing
and result licenses. The source check in the existing provenance is dated
2026-11-13. UCI dataset 17 was checked again for rights on 2026-11-21: it lists
William Wolberg, Olvi Mangasarian, Nick Street and W. Street, and permits
sharing/adaptation under CC BY 4.0 with attribution. This rights-page check is
separate from original data retrieval and does not imply a new dataset download.

These are historical benchmark records, not real-person case narratives. No
patient upload, diagnosis, deployment threshold, treatment recommendation,
clinical validation, external validation or safety guarantee is provided.
