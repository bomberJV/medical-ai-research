"""Fast, independent invariants over saved numerical outputs; no fitting."""
import json,math
from pathlib import Path
import numpy as np
from run_experiments import conformal_quantile,wilson
r=json.loads((Path(__file__).parent/'output/results.json').read_text())
for key in ['calibration','conformal','robustness']:
 d=r[key]; parts=[set(v) for v in d['split'].values()]
 assert set.union(*parts)==set(range(d['n']))
 assert sum(map(len,parts))==d['n']
for model in ['raw','calibrated']:
 d=r['calibration'];p=np.array([v[model] for v in d['records']]);y=np.array([v['truth'] for v in d['records']]);assert np.isclose(np.mean((p-y)**2),d['metrics'][model]['brier'])
for model in ['ridge','boosting']:
 d=r['conformal'];rs=next(x['predictions'] for x in d['records'] if x['model']==model);errors=np.array([abs(x['truth']-x['prediction']) for x in rs]);assert np.isclose(np.mean(errors),d['metrics'][model]['mae'])
 for v in d['metrics'][model]['intervals']:assert sum(errors<=v['q'])==v['covered']
assert conformal_quantile(np.arange(10),.2)==8
assert conformal_quantile(np.arange(10),.1)==9
assert math.isinf(conformal_quantile(np.arange(10),.05))
for k,n in [(0,10),(10,10),(5,10)]:
 lo,hi=wilson(k,n);assert -1e-12<=lo<=k/n<=hi<=1+1e-12
assert wilson(0,10)[0]==0.0
assert wilson(10,10)[1]==1.0
assert 'time' not in r['robustness']['features']
print('Verified split integrity, Brier scores, regression errors, coverage, finite-sample quantiles, Wilson boundaries, and leakage exclusion.')
