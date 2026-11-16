import sys, numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from sklearn.model_selection import RepeatedStratifiedKFold, cross_validate
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
df=pd.read_csv(sys.argv[1]); y=df.DEATH_EVENT
sets={"11 baseline":df.drop(columns=["DEATH_EVENT","time"]),"baseline+time":df.drop(columns=["DEATH_EVENT"]),"time only":df[["time"]],"EF+creatinine":df[["ejection_fraction","serum_creatinine"]],"EF+creat+time":df[["ejection_fraction","serum_creatinine","time"]]}
models={"logistic":make_pipeline(StandardScaler(),LogisticRegression(max_iter=3000)),"random forest":RandomForestClassifier(300,random_state=0),"grad boost":GradientBoostingClassifier(random_state=0)}
cv=RepeatedStratifiedKFold(n_splits=5,n_repeats=20,random_state=20261115)
for m,est in models.items():
  for s,X in sets.items():
    r=cross_validate(est,X,y,cv=cv,scoring=["roc_auc","accuracy"],n_jobs=4)
    print(f"{m:14s}{s:15s} AUC {r['test_roc_auc'].mean():.3f} ±{r['test_roc_auc'].std():.3f}  acc {r['test_accuracy'].mean():.3f}")
print(df.groupby("DEATH_EVENT").time.describe())
