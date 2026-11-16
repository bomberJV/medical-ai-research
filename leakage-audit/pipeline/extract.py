"""Detect use of the 299-patient dataset in each full text and pull evidence snippets for manual coding."""
import os, re, csv, json
OUT = os.path.dirname(os.path.abspath(__file__)); TXT = os.path.join(OUT, "txt")
screen = {r["openalex"]: r for r in csv.DictReader(open(os.path.join(OUT, "screen1.csv"), encoding="utf-8"))}
def clean(t): return re.sub(r"\s+", " ", t.replace("­", ""))
SIG = {"n299": r"\b299\b", "faisalabad": r"faisalabad", "hfcr": r"heart[ _-]?failure[ _-]?clinical[ _-]?records?", "death_event": r"death[ _]event",
       "cpk": r"creatinine[ _]phosphokinase", "kaggle_larxel": r"larxel|andrewmvd"}
PAT = {
 "time_drop": r"[^.]{0,160}\b(drop|remov|exclud|discard|omit|eliminat|leak|surrogate|proxy)\w*[^.]{0,120}\b(time|follow[- ]up)\b[^.]{0,160}|[^.]{0,160}\b(time|follow[- ]up (period|time|duration))\b[^.]{0,120}\b(drop|remov|exclud|discard|omit|eliminat|leak|surrogate|proxy)\w*[^.]{0,160}",
 "time_feat": r"[^.]{0,200}\btime\b[^.]{0,40}(most|top|highest|important|influential|significant|key|selected|feature|predictor|attribute|shap|rank)[^.]{0,200}|[^.]{0,200}(selected|important|top|key|influential)[^.]{0,80}(features?|predictors?|attributes?|variables?)[^.]{0,120}\btime\b[^.]{0,120}",
 "followup_feat": r"[^.]{0,200}follow[- ]up (time|period|month|duration)[^.]{0,200}",
 "resample": r"[^.]{0,220}\b(smote|adasyn|oversampl|over-sampl|resampl|undersampl|borderline|random over)\w*[^.]{0,220}",
 "split": r"[^.]{0,160}(train(ing)?[ -](and|/)?[ -]?test|test(ing)? set|hold[- ]?out|cross[- ]validation|\d+[- ]fold|80[:/ ]20|70[:/ ]30|split)[^.]{0,160}",
 "metric": r"[^.]{0,120}(accuracy|auc|roc|f1)[^.]{0,30}\b(of|=|:|was|achiev\w*|reach\w*)?\s*(0?\.\d{2,4}|\d{2}(\.\d+)?\s?%)[^.]{0,80}",
 "survival": r"[^.]{0,120}(cox|kaplan|c-index|concordance|random survival forest|hazard)[^.]{0,120}",
}
rows, ev = [], {}
for fn in os.listdir(TXT):
    wid = fn[:-4]; t = clean(open(os.path.join(TXT, fn), encoding="utf-8", errors="ignore").read())
    low = t.lower()
    # cut references section to avoid matching cited work descriptions there
    m = re.search(r"\b(references|bibliography)\b(?!.{0,40}\bto\b)", low[len(low)//2:])
    body = t[: len(low)//2 + m.start()] if m else t
    sig = {k: len(re.findall(v, body, re.I)) for k, v in SIG.items()}
    score = (sig["n299"] > 0) + (sig["faisalabad"] > 0) + (sig["hfcr"] > 0) + (sig["death_event"] > 0) + (sig["cpk"] > 0) + (sig["kaggle_larxel"] > 0)
    e = {k: [s.strip()[:420] for s in dict.fromkeys(mm.group(0) for mm in re.finditer(v, body, re.I))][:6] for k, v in PAT.items()}
    ev[wid] = e
    r = screen.get(wid, {})
    rows.append({"openalex": wid, "year": r.get("year"), "first_author": r.get("first_author"), "venue": r.get("venue"), "title": r.get("title"),
                 "doi": r.get("doi"), "chars": len(body), "ds_score": score, **{"sig_" + k: v for k, v in sig.items()},
                 **{"n_" + k: len(e[k]) for k in PAT}})
rows.sort(key=lambda r: -r["ds_score"])
with open(os.path.join(OUT, "extract.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
json.dump(ev, open(os.path.join(OUT, "evidence.json"), "w", encoding="utf-8"))
from collections import Counter; print(len(rows), Counter(r["ds_score"] for r in rows))
