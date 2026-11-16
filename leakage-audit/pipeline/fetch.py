"""Fetch every work citing the two source papers of the UCI heart-failure dataset from OpenAlex,
then run a first, rule-based screen. Stdlib only."""
import json, csv, re, time, urllib.request, urllib.parse, os, sys

OUT = os.path.dirname(os.path.abspath(__file__))
SOURCES = {"W3012665221": "Chicco2020", "W2739315321": "Ahmad2017"}
FIELDS = "id,doi,title,publication_year,type,primary_location,open_access,abstract_inverted_index,authorships,cited_by_count"

def get(url):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(url)

def abstract(inv):
    if not inv: return ""
    pos = {}
    for w, idx in inv.items():
        for i in idx: pos[i] = w
    return " ".join(pos[i] for i in sorted(pos))

works = {}
for wid, tag in SOURCES.items():
    page = 1
    while page:
        q = urllib.parse.urlencode({"filter": f"cites:{wid}", "per-page": 200, "page": page, "select": FIELDS})
        d = get("https://api.openalex.org/works?" + q)
        for w in d["results"]:
            rec = works.setdefault(w["id"], dict(w, cites=[]))
            rec["cites"].append(tag)
        page = page + 1 if len(d["results"]) == 200 else None
        time.sleep(0.2)
    print(tag, "done; running total", len(works), flush=True)

with open(os.path.join(OUT, "citing_works.jsonl"), "w", encoding="utf-8") as f:
    for w in works.values(): f.write(json.dumps(w) + "\n")

DATASET = re.compile(r"\b299\b|heart failure clinical record|faisalabad|\buci\b|kaggle|ahmad et al|chicco", re.I)
TASK = re.compile(r"surviv|mortal|death|died|prognos|predict|classif", re.I)
HF = re.compile(r"heart failure|cardiac|cardiovascular|heart", re.I)
ML = re.compile(r"machine learning|deep learning|classifier|random forest|xgboost|neural|svm|support vector|boosting|logistic regression|smote|accuracy|auc|ensemble", re.I)

rows = []
for w in works.values():
    ab = abstract(w.get("abstract_inverted_index"))
    text = (w.get("title") or "") + " " + ab
    src = ((w.get("primary_location") or {}).get("source") or {}).get("display_name") or ""
    first = (w.get("authorships") or [{}])[0].get("author", {}).get("display_name", "") if w.get("authorships") else ""
    if not ab:
        screen = "manual (no abstract)"
    elif DATASET.search(text) and HF.search(text) and ML.search(text) and TASK.search(text):
        screen = "candidate"
    elif HF.search(text) and ML.search(text) and TASK.search(text):
        screen = "possible (HF+ML, dataset not named)"
    else:
        screen = "exclude (topic)"
    oa = (w.get("open_access") or {})
    rows.append({"openalex": w["id"].rsplit("/", 1)[-1], "doi": (w.get("doi") or "").replace("https://doi.org/", ""),
                 "year": w.get("publication_year"), "type": w.get("type"), "first_author": first,
                 "venue": src, "title": (w.get("title") or "").replace("\n", " "), "cites": "+".join(w["cites"]),
                 "oa": oa.get("is_oa"), "oa_url": oa.get("oa_url") or "", "screen1": screen,
                 "has_299": bool(re.search(r"\b299\b", text)), "mentions_time": bool(re.search(r"follow-up time|follow up time|\btime\b feature|follow-up period", ab, re.I))})

rows.sort(key=lambda r: (r["screen1"], -(r["year"] or 0)))
with open(os.path.join(OUT, "screen1.csv"), "w", newline="", encoding="utf-8") as f:
    wr = csv.DictWriter(f, fieldnames=list(rows[0].keys())); wr.writeheader(); wr.writerows(rows)
from collections import Counter
print("total", len(rows), Counter(r["screen1"] for r in rows))

