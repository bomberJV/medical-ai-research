import sys, os, re
sys.stdout.reconfigure(encoding="utf-8")
OUT = os.path.dirname(os.path.abspath(__file__))
SKIP = re.compile(r"real[- ]time|same time|computation(al)? time|training time|time[- ]series|time complexity|execution time|processing time|time[- ]consuming|at a time|at the time|over time|each time|running time|response time|time-to-event|time to event|survival time|in time|of time|time and cost|save time|time period|first time|long time|timely|time-varying|time-dependent", re.I)
for wid in sys.argv[1:]:
    t = re.sub(r"\s+", " ", open(os.path.join(OUT, "txt", wid + ".txt"), encoding="utf-8", errors="ignore").read())
    m = re.search(r"\b(references|bibliography)\b", t[len(t)//2:], re.I)
    body = t[: len(t)//2 + m.start()] if m else t
    hits = [mm for mm in re.finditer(r"\btime\b|follow[- ]?up", body, re.I) if not SKIP.search(body[max(0, mm.start()-15): mm.end()+15])]
    print(f"## {wid}  ({len(hits)} hits)")
    shown = 0
    for mm in hits:
        s = body[max(0, mm.start()-110): mm.end()+110]
        if re.search(r"\[\s*4\s*,|4\s*[-â€“]\s*285|follow-up period\s*(\(days\))?\s*days|died during the follow", s, re.I): continue
        print("   ", s); shown += 1
        if shown >= 5: break
    feats = [x.group(0) for x in re.finditer(r"[^.]{0,80}\b(all|twelve|eleven|thirteen|12|11|13)\s+(input |clinical |independent )?(features|attributes|variables|predictors)\b[^.]{0,80}", body, re.I)]
    for f in feats[:2]: print("   [count]", f)

