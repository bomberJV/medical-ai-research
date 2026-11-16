"""Download open-access full texts for screened works and extract text. Results in txt/ and fetch_log.csv."""
import json, csv, os, re, io, urllib.request, html
from concurrent.futures import ThreadPoolExecutor
import pypdf
OUT = os.path.dirname(os.path.abspath(__file__)); TXT = os.path.join(OUT, "txt"); os.makedirs(TXT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36", "Accept": "application/pdf,text/html;q=0.9,*/*;q=0.8"}
screen = {r["openalex"]: r for r in csv.DictReader(open(os.path.join(OUT, "screen1.csv"), encoding="utf-8"))}
works = {json.loads(l)["id"].rsplit("/", 1)[-1]: json.loads(l) for l in open(os.path.join(OUT, "citing_works.jsonl"), encoding="utf-8")}

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read(), r.headers.get("Content-Type", ""), r.geturl()

def pdf_text(b):
    rd = pypdf.PdfReader(io.BytesIO(b)); return "\n".join((p.extract_text() or "") for p in rd.pages[:40])

def html_text(b):
    t = b.decode("utf-8", "ignore"); t = re.sub(r"(?is)<(script|style).*?</\1>", " ", t)
    return html.unescape(re.sub(r"(?s)<[^>]+>", " ", t))

def one(wid):
    out = os.path.join(TXT, wid + ".txt")
    if os.path.exists(out): return wid, "cached", ""
    w = works[wid]; pl = w.get("primary_location") or {}
    urls = [u for u in [pl.get("pdf_url"), (w.get("open_access") or {}).get("oa_url"), pl.get("landing_page_url"), w.get("doi")] if u]
    seen = set(); last = "no url"
    for u in urls:
        if u in seen: continue
        seen.add(u)
        try:
            b, ct, final = fetch(u)
            if b[:5] == b"%PDF-":
                t = pdf_text(b); kind = "pdf"
            else:
                m = re.search(rb'citation_pdf_url"\s+content="([^"]+)"', b) or re.search(rb'content="([^"]+)"\s+name="citation_pdf_url"', b)
                if m:
                    try:
                        b2, _, _ = fetch(html.unescape(m.group(1).decode()))
                        if b2[:5] == b"%PDF-":
                            t = pdf_text(b2); kind = "pdf(meta)"
                        else: t = html_text(b); kind = "html"
                    except Exception: t = html_text(b); kind = "html"
                else: t = html_text(b); kind = "html"
            if len(t) > 6000:
                open(out, "w", encoding="utf-8").write(t); return wid, kind, final
            last = f"short {kind} {len(t)}"
        except Exception as e:
            last = type(e).__name__ + ":" + str(e)[:80]
    return wid, "fail", last

ids = [k for k, r in screen.items() if not r["screen1"].startswith("exclude")]
with ThreadPoolExecutor(8) as ex: res = list(ex.map(one, ids))
with open(os.path.join(OUT, "fetch_log.csv"), "w", newline="", encoding="utf-8") as f:
    wr = csv.writer(f); wr.writerow(["openalex", "status", "detail"]); wr.writerows(res)
from collections import Counter; print(len(ids), Counter(r[1] for r in res))
