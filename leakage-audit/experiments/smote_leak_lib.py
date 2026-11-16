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
