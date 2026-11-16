"""Build the data file behind site/medical/leakage.html.

Recomputes the single-split accuracy distributions (200 stratified 80/20 splits per setting) and the
cross-validated means, and packs them with the follow-up times and the anonymised study codes.
Run from the repository root:  python3 leakage-audit/build_site_data.py
"""
import csv, json, os, sys
import numpy as np, pandas as pd
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "experiments"))
from smote_leak_lib import smote  # noqa: E402

ROOT = os.path.dirname(HERE)
df = pd.read_csv(os.path.join(ROOT, "research", "data", "heart_failure_clinical_records_dataset.csv"))
y = df.DEATH_EVENT.values
X = {False: df.drop(columns=["DEATH_EVENT", "time"]).values, True: df.drop(columns=["DEATH_EVENT"]).values}

settings = {}
for use_time in (False, True):
    for leak in (False, True):
        key = ("time" if use_time else "clean") + ("+smote" if leak else "")
        Xs = X[use_time]
        splits = []
        for s in range(200):
            rng = np.random.default_rng(s)
            Xa, ya = smote(Xs, y, rng) if leak else (Xs, y)
            a, b, c, d = train_test_split(Xa, ya, test_size=0.2, stratify=ya, random_state=s)
            splits.append(round(float((RandomForestClassifier(200, random_state=s, n_jobs=4).fit(a, c).predict(b) == d).mean()), 4))
        accs, aucs = [], []
        for rep in range(20):
            rng = np.random.default_rng(1000 + rep)
            Xa, ya = smote(Xs, y, rng) if leak else (Xs, y)
            for tr, te in StratifiedKFold(5, shuffle=True, random_state=rep).split(Xa, ya):
                m = RandomForestClassifier(300, random_state=rep, n_jobs=4).fit(Xa[tr], ya[tr])
                p = m.predict_proba(Xa[te])[:, 1]
                accs.append(((p > 0.5) == ya[te]).mean()); aucs.append(roc_auc_score(ya[te], p))
        settings[key] = {"splits": splits, "cv_acc": round(float(np.mean(accs)), 4), "cv_auc": round(float(np.mean(aucs)), 4)}
        print(key, settings[key]["cv_acc"], settings[key]["cv_auc"], max(splits), flush=True)

studies = []
for r in csv.DictReader(open(os.path.join(HERE, "data", "coded_studies.csv"), encoding="utf-8")):
    if r["design"] != "classifier":
        continue
    acc = float(r["acc_pct"]) if r["acc_pct"] else None
    studies.append({"year": int(r["year"]), "code": r["time_code"],
                    "implied": "implied" in r["time_input"] or "secondary" in r["time_input"], "acc": acc})

out = {
    "generated": "2026-11-15",
    "patients": [[int(t), int(d)] for t, d in zip(df.time, df.DEATH_EVENT)],
    "settings": settings,
    "studies": studies,
}
path = os.path.join(ROOT, "site", "medical", "leakage-data.json")
json.dump(out, open(path, "w"), separators=(",", ":"))
print("wrote", path, os.path.getsize(path), "bytes;", len(studies), "studies")
