import sys, numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from sklearn.model_selection import StratifiedKFold
from sklearn.neighbors import NearestNeighbors
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score, accuracy_score
def smote(X,y,rng,k=5):
    X=np.asarray(X,float); y=np.asarray(y)
    cls,cnt=np.unique(y,return_counts=True); mino=cls[cnt.argmin()]; need=cnt.max()-cnt.min()
    Xm=X[y==mino]; nn=NearestNeighbors(n_neighbors=k+1).fit(Xm); idx=nn.kneighbors(Xm,return_distance=False)[:,1:]
    i=rng.integers(0,len(Xm),need); j=idx[i,rng.integers(0,k,need)]; g=rng.random((need,1))
    S=Xm[i]+g*(Xm[j]-Xm[i])
    return np.vstack([X,S]), np.concatenate([y,np.full(need,mino)])
df=pd.read_csv(sys.argv[1]); y=df.DEATH_EVENT.values
sets={"11 clinical":df.drop(columns=["DEATH_EVENT","time"]).values,"11 clinical + time":df.drop(columns=["DEATH_EVENT"]).values}
rows=[]
for name,X in sets.items():
  for mode in ["none","SMOTE in training folds","SMOTE before split"]:
    accs,aucs=[],[]
    for rep in range(20):
      rng=np.random.default_rng(1000+rep)
      if mode=="SMOTE before split":
        Xa,ya=smote(X,y,rng)
      else: Xa,ya=X,y
      for tr,te in StratifiedKFold(5,shuffle=True,random_state=rep).split(Xa,ya):
        Xtr,ytr=Xa[tr],ya[tr]
        if mode=="SMOTE in training folds": Xtr,ytr=smote(Xtr,ytr,rng)
        m=RandomForestClassifier(300,random_state=rep,n_jobs=4).fit(Xtr,ytr)
        p=m.predict_proba(Xa[te])[:,1]
        accs.append(accuracy_score(ya[te],p>0.5)); aucs.append(roc_auc_score(ya[te],p))
    rows.append((name,mode,np.mean(accs),np.mean(aucs)))
    print(f"{name:20s}{mode:26s} acc {np.mean(accs):.3f}  AUC {np.mean(aucs):.3f}",flush=True)
pd.DataFrame(rows,columns=["features","resampling","accuracy","auc"]).to_csv(sys.argv[2],index=False)
