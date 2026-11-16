import csv, json, sys, os
sys.stdout.reconfigure(encoding="utf-8")
OUT = os.path.dirname(os.path.abspath(__file__))
lo, hi = int(sys.argv[1]), int(sys.argv[2])
ev = json.load(open(os.path.join(OUT, "evidence.json"), encoding="utf-8"))
rows = [x for x in csv.DictReader(open(os.path.join(OUT, "extract.csv"), encoding="utf-8")) if int(x["ds_score"]) >= 2]
for x in rows[lo:hi]:
    e = ev[x["openalex"]]
    print(f"## {x['openalex']} | {x['year']} | {(x['first_author'] or '')[:20]} | {(x['title'] or '')[:80]}")
    for k, n, w in [("time_drop", 2, 230), ("time_feat", 3, 230), ("followup_feat", 2, 200), ("resample", 1, 220), ("metric", 1, 160)]:
        for s in e[k][:n]:
            print(f"  [{k}] {s[:w]}")
