"""Second-pass check: for each coded paper, where in the paper does the time evidence sit?
Flags papers whose only evidence lies in introduction / related-work text (possible misattribution)."""
import os, re, sys, json
sys.stdout.reconfigure(encoding="utf-8")
OUT = os.path.dirname(os.path.abspath(__file__))
HEAD = re.compile(r"\b(\d\.?\s*)?(abstract|introduction|related works?|literature review|background|previous (work|studies)|materials? and methods?|methodology|methods?|proposed (method|model|approach|framework)|experiment\w*|results?( and discussion)?|discussion|conclusions?)\b", re.I)
EVID = re.compile(r"\btime\b[^.]{0,60}(most|top|highest|important|influential|significant|selected|feature|predictor|attribute|shap|rank|exclu|remov|drop|omit|leak)|(exclu|remov|drop|omit|discard)\w*[^.]{0,60}\b(time|follow[- ]up)\b|(selected|important|top|key)[^.]{0,60}(features?|variables?|attributes?)[^.]{0,100}\btime\b", re.I)
for wid in sys.argv[1:]:
    p = os.path.join(OUT, "txt", wid + ".txt")
    if not os.path.exists(p): print(wid, "NO TEXT"); continue
    t = re.sub(r"\s+", " ", open(p, encoding="utf-8", errors="ignore").read())
    m = re.search(r"\b(references|bibliography)\b", t[len(t)//2:], re.I)
    body = t[: len(t)//2 + m.start()] if m else t
    heads = [(h.start(), h.group(2).lower()) for h in HEAD.finditer(body)]
    secs = []
    for e in EVID.finditer(body):
        prev = [h for h in heads if h[0] < e.start()]
        sec = prev[-1][1] if prev else "start"
        rel = round(e.start() / max(1, len(body)), 2)
        secs.append(f"{sec}@{rel}")
    own = [s for s in secs if not re.match(r"(abstract|introduction|related|literature|background|previous|start)", s)]
    flag = "OK" if own else ("INTRO/RELATED ONLY" if secs else "NO EVIDENCE MATCH")
    print(wid, flag, secs[:6])
