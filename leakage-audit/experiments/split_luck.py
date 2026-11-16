import sys,numpy as np,pandas as pd,warnings;warnings.filterwarnings("ignore")
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from smote_leak_lib import smote
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
df=pd.read_csv(sys.argv[1]); y=df.DEATH_EVENT.values
out={}
for name,X in {"clinical":df.drop(columns=["DEATH_EVENT","time"]).values,"clinical+time":df.drop(columns=["DEATH_EVENT"]).values}.items():
  for leak in [False,True]:
    acc=[]
    for s in range(200):
      rng=np.random.default_rng(s); Xa,ya=(smote(X,y,rng) if leak else (X,y))
      a,b,c,d=train_test_split(Xa,ya,test_size=0.2,stratify=ya,random_state=s)
      acc.append((RandomForestClassifier(200,random_state=s,n_jobs=4).fit(a,c).predict(b)==d).mean())
    acc=np.array(acc); print(f"{name:14s} SMOTE-before-split={leak!s:5s} mean {acc.mean():.3f}  p95 {np.percentile(acc,95):.3f}  max {acc.max():.3f}",flush=True)
