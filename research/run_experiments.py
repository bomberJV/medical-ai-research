"""Three prespecified benchmark experiments; run from any working directory.

No clinical claims, model deployment, patient inputs, or automated care decisions.
Output metrics are computed, never hand-entered. See PROTOCOL.md.
"""
from pathlib import Path
import io, json, hashlib, math, platform, urllib.request, zipfile
import numpy as np
import pandas as pd
import scipy, sklearn
from sklearn.datasets import load_breast_cancer, load_diabetes
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline, make_union
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer, MissingIndicator
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
from sklearn.metrics import roc_auc_score, brier_score_loss, log_loss, confusion_matrix, mean_absolute_error, mean_squared_error, r2_score
from threadpoolctl import threadpool_limits
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'output'; OUT.mkdir(exist_ok=True)
SEED=20261113
rng=np.random.default_rng(SEED)
plt.rcParams.update({'figure.facecolor':'#101710','axes.facecolor':'#101710','savefig.facecolor':'#101710','text.color':'#edf0df','axes.labelcolor':'#a0b397','xtick.color':'#a0b397','ytick.color':'#a0b397','axes.edgecolor':'#374a30','font.size':10,'font.family':'DejaVu Sans','grid.color':'#374a30'})
LIME='#daf57c'; PINK='#e6adbc'; BLUE='#91c4e8'; MUTED='#a0b397'

def native(v):
 if isinstance(v,dict): return {k:native(x) for k,x in v.items()}
 if isinstance(v,(list,tuple)): return [native(x) for x in v]
 if isinstance(v,np.ndarray): return native(v.tolist())
 if isinstance(v,(np.integer,np.floating,np.bool_)): return v.item()
 return v

def digest(a): return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()
def wilson(k,n):
 if not n: return [None,None]
 z=1.95996398454; p=k/n; d=1+z*z/n; c=(p+z*z/(2*n))/d; h=z*np.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
 # Exact zero/all-success boundaries avoid cancellation error around 0 and 1.
 return [0.0 if k==0 else max(0.0,float(c-h)), 1.0 if k==n else min(1.0,float(c+h))]
def bootstrap(y,p,metric,seed=SEED,reps=2000):
 r=np.random.default_rng(seed); vals=[]
 for _ in range(reps):
  ix=r.integers(0,len(y),len(y))
  if metric=='auc' and len(np.unique(y[ix]))<2: continue
  f={'auc':roc_auc_score,'brier':brier_score_loss,'mae':mean_absolute_error}[metric]
  vals.append(f(y[ix],p[ix]))
 return np.quantile(vals,[.025,.975]).tolist()
def paired_brier(y,a,b):
 r=np.random.default_rng(SEED+1); difference=(y-a)**2-(y-b)**2
 return {'difference':float(np.mean(difference)),'ci':np.quantile([np.mean(difference[r.integers(0,len(y),len(y))]) for _ in range(2000)],[.025,.975]).tolist()}
def classification(y,p,ci=True):
 pred=(p>=.5).astype(int); tn,fp,fn,tp=confusion_matrix(y,pred,labels=[0,1]).ravel()
 d={'n':len(y),'auc':roc_auc_score(y,p),'brier':brier_score_loss(y,p),'log_loss':log_loss(y,p,labels=[0,1]),'accuracy':np.mean(pred==y),'tn':tn,'fp':fp,'fn':fn,'tp':tp,'sensitivity':tp/(tp+fn),'specificity':tn/(tn+fp)}
 if ci:d.update(auc_ci=bootstrap(y,p,'auc'),brier_ci=bootstrap(y,p,'brier'))
 return d

def split3(y,stratify=False):
 allidx=np.arange(len(y)); traincal,test=train_test_split(allidx,test_size=.2,random_state=SEED,stratify=y if stratify else None)
 train,cal=train_test_split(traincal,test_size=.25,random_state=SEED+1,stratify=y[traincal] if stratify else None)
 assert not set(train)&set(cal) and not set(train)&set(test) and not set(cal)&set(test)
 return train,cal,test

def savefig(fig,name):
 fig.savefig(OUT/(name+'.svg'),bbox_inches='tight',metadata={'Date':None}); fig.savefig(OUT/(name+'.png'),dpi=160,bbox_inches='tight'); plt.close(fig)

def calibration_experiment():
 ds=load_breast_cancer(); X=ds.data; y=1-ds.target # malignant positive
 tr,ca,te=split3(y,True)
 base=make_pipeline(StandardScaler(),LogisticRegression(C=1,max_iter=3000,random_state=SEED)).fit(X[tr],y[tr])
 calibrated=CalibratedClassifierCV(FrozenEstimator(base),method='sigmoid').fit(X[ca],y[ca])
 a=base.predict_proba(X[te])[:,1]; b=calibrated.predict_proba(X[te])[:,1]
 prior=np.full(len(te),y[tr].mean()); metrics={n:classification(y[te],p) for n,p in [('training_prior',prior),('raw',a),('calibrated',b)]}
 bins=[]
 for name,p in [('raw',a),('calibrated',b)]:
  bb=[]
  for lo,hi in zip(np.arange(0,1,.2),np.arange(.2,1.01,.2)):
   mask=(p>=lo)&((p<hi) if hi<.999 else (p<=1))
   if mask.any(): bb.append({'low':lo,'high':hi,'n':sum(mask),'predicted':p[mask].mean(),'observed':y[te][mask].mean(),'ci':wilson(sum(y[te][mask]),sum(mask))})
  bins.append({'model':name,'bins':bb})
 selective=[]
 for threshold in [.5,.6,.7,.8,.9,.95,.99]:
  mask=np.maximum(b,1-b)>=threshold; n=sum(mask); correct=sum((b[mask]>=.5)==y[te][mask]); fn=sum((b[mask]<.5)&(y[te][mask]==1)); fp=sum((b[mask]>=.5)&(y[te][mask]==0))
  selective.append({'threshold':threshold,'retained':n,'deferred':len(te)-n,'coverage':n/len(te),'accuracy':correct/n if n else None,'accuracy_ci':wilson(correct,n),'false_negatives':fn,'false_positives':fp,'malignant_retained':sum(y[te][mask])})
 fig,axs=plt.subplots(1,2,figsize=(11,4.2)); ax=axs[0]; ax.plot([0,1],[0,1],color=MUTED,ls='--',lw=1,label='Perfect calibration')
 for entry,color in zip(bins,[PINK,LIME]):
  d=entry['bins']; ax.plot([v['predicted'] for v in d],[v['observed'] for v in d],'-o',color=color,label=entry['model'].title());
 ax.set(xlabel='Mean predicted malignancy probability',ylabel='Observed fraction malignant',xlim=(0,1),ylim=(0,1),title='Reliability • five fixed bins'); ax.legend(frameon=False,labelcolor='#edf0df',fontsize=8); ax.grid(alpha=.4)
 ax=axs[1]; ax.plot([x['coverage']*100 for x in selective],[100*x['accuracy'] if x['accuracy'] is not None else np.nan for x in selective],'-o',color=LIME)
 for d in selective:
  if d['accuracy'] is not None: ax.annotate(str(d['threshold']), (d['coverage']*100,d['accuracy']*100),xytext=(0,7),textcoords='offset points',fontsize=8,color=MUTED)
 ax.set(xlabel='Test records retained (%)',ylabel='Accuracy on retained records (%)',title='Selective prediction • fixed thresholds',ylim=(80,102));ax.grid(alpha=.4);fig.tight_layout();savefig(fig,'calibration')
 return {'dataset':'Wisconsin Diagnostic Breast Cancer','n':len(y),'features':list(ds.feature_names),'positive':'malignant','split':{'train':tr,'calibration':ca,'test':te},'data_sha256':digest(np.column_stack([X,y])),'metrics':metrics,'paired_brier_raw_minus_calibrated':paired_brier(y[te],a,b),'reliability':bins,'selective':selective,'records':[{'row':int(i),'truth':int(y[i]),'raw':float(pa),'calibrated':float(pb)} for i,pa,pb in zip(te,a,b)]}

def conformal_quantile(scores,alpha):
 k=math.ceil((len(scores)+1)*(1-alpha))
 return float(np.sort(scores)[k-1]) if k<=len(scores) else float('inf')

def regression_experiment():
 ds=load_diabetes(scaled=False); X=ds.data; y=ds.target;tr,ca,te=split3(y)
 models={'ridge':make_pipeline(StandardScaler(),Ridge(alpha=10)), 'boosting':HistGradientBoostingRegressor(max_iter=150,max_leaf_nodes=8,l2_regularization=10,early_stopping=False,random_state=SEED)}
 report={};records=[]; bmitrain=np.median(X[tr,2])
 for name,model in models.items():
  model.fit(X[tr],y[tr]);pc=model.predict(X[ca]);p=model.predict(X[te]);scores=np.abs(y[ca]-pc); intervals=[]
  for alpha in [.2,.1,.05]:
   q=conformal_quantile(scores,alpha);hit=np.abs(y[te]-p)<=q
   intervals.append({'nominal':1-alpha,'q':q,'width':2*q,'covered':sum(hit),'n':len(te),'coverage':np.mean(hit),'coverage_ci':wilson(sum(hit),len(te))})
  q=intervals[1]['q']; hit=np.abs(y[te]-p)<=q
  sub=[]
  for label,mask in [('BMI ≤ training median',X[te,2]<=bmitrain),('BMI > training median',X[te,2]>bmitrain)]:
   sub.append({'group':label,'n':sum(mask),'covered':sum(hit[mask]),'coverage':np.mean(hit[mask]),'ci':wilson(sum(hit[mask]),sum(mask))})
  report[name]={'mae':mean_absolute_error(y[te],p),'mae_ci':bootstrap(y[te],p,'mae'),'rmse':np.sqrt(mean_squared_error(y[te],p)),'r2':r2_score(y[te],p),'intervals':intervals,'subgroups':sub}
  records.append({'model':name,'predictions':[{'row':int(i),'truth':float(y[i]),'prediction':float(pp)} for i,pp in zip(te,p)]})
 p0=np.full(len(te),np.mean(y[tr]));report['training_mean']={'mae':mean_absolute_error(y[te],p0),'mae_ci':bootstrap(y[te],p0,'mae'),'rmse':np.sqrt(mean_squared_error(y[te],p0)),'r2':r2_score(y[te],p0)}
 fig,axs=plt.subplots(1,2,figsize=(11,4.2)); rec=records[0]['predictions'];order=np.argsort([r['prediction'] for r in rec]);p=np.array([rec[i]['prediction'] for i in order]); yy=np.array([rec[i]['truth'] for i in order]);q=report['ridge']['intervals'][1]['q'];ax=axs[0];ax.fill_between(np.arange(len(p)),p-q,p+q,color=LIME,alpha=.17,label='90% split-conformal interval');ax.plot(p,color=LIME,label='Ridge prediction');ax.scatter(np.arange(len(p)),yy,c=np.where(abs(yy-p)<=q,BLUE,PINK),s=13);ax.set(xlabel='Held-out records sorted by prediction',ylabel='Progression score',title='Uncertainty is wider than a point');ax.legend(frameon=False,labelcolor='#edf0df',fontsize=7)
 ax=axs[1];ax.plot([.75,1],[.75,1],ls='--',color=MUTED)
 for name,color in [('ridge',LIME),('boosting',PINK)]:
  d=report[name]['intervals'];ax.plot([x['nominal'] for x in d],[x['coverage'] for x in d],'-o',color=color,label=name.title())
 ax.set(xlabel='Nominal marginal coverage',ylabel='Observed test coverage',xlim=(.77,.98),ylim=(.7,1.02),title='Coverage is an empirical check');ax.legend(frameon=False,labelcolor='#edf0df');ax.grid(alpha=.4);fig.tight_layout();savefig(fig,'conformal')
 return {'dataset':'Diabetes progression benchmark','n':len(y),'features':list(ds.feature_names),'split':{'train':tr,'calibration':ca,'test':te},'data_sha256':digest(np.column_stack([X,y])),'bmi_training_median':bmitrain,'metrics':report,'records':records}

def heart_experiment():
 datafile=ROOT/'data/heart_failure_clinical_records_dataset.csv'
 if not datafile.exists():
  u='https://archive.ics.uci.edu/static/public/519/heart+failure+clinical+records.zip'
  raw=urllib.request.urlopen(u,timeout=45).read()
  datafile.write_bytes(zipfile.ZipFile(io.BytesIO(raw)).read(datafile.name))
 df=pd.read_csv(datafile); y=df.DEATH_EVENT.to_numpy();features=[c for c in df.columns if c not in ['DEATH_EVENT','time']];X=df[features].to_numpy()
 tr,te=train_test_split(np.arange(len(y)),test_size=.3,stratify=y,random_state=SEED)
 def estimator():return make_pipeline(make_union(SimpleImputer(strategy='median'),MissingIndicator(features='all')),StandardScaler(),LogisticRegression(C=1,max_iter=3000,random_state=SEED))
 base=estimator().fit(X[tr],y[tr]); leaky=estimator().fit(df.drop(columns='DEATH_EVENT').to_numpy()[tr],y[tr])
 # All augmentation stays inside the training set. Copy original plus three independent masks.
 rr=np.random.default_rng(SEED+2); xa=[X[tr].copy()]
 for _ in range(3):
  xx=X[tr].copy();xx[rr.random(xx.shape)<.25]=np.nan;xa.append(xx)
 aug=estimator().fit(np.vstack(xa),np.tile(y[tr],4),logisticregression__sample_weight=np.full(4*len(tr),.25));models={'baseline':base,'augmented':aug}
 clean={n:classification(y[te],m.predict_proba(X[te])[:,1]) for n,m in models.items()}
 clean['leaky_time']=classification(y[te],leaky.predict_proba(df.drop(columns='DEATH_EVENT').to_numpy()[te])[:,1])
 prior=np.full(len(te),y[tr].mean());clean['training_prior']=classification(y[te],prior)
 rows=[]
 for rate in [0,.1,.25,.5]:
  vals={n:[] for n in models}; preview=None
  for j in range(30):
   rr=np.random.default_rng(SEED+300+j);mask=rr.random(X[te].shape)<rate;xx=X[te].copy();xx[mask]=np.nan
   if j==0:preview=mask.tolist()
   for n,m in models.items():
    p=m.predict_proba(xx)[:,1]; vals[n].append({'auc':roc_auc_score(y[te],p),'brier':brier_score_loss(y[te],p)})
  rows.append({'missing_rate':rate,'preview_mask':preview,'models':{n:{metric:{'mean':np.mean([v[metric] for v in vs]),'range90':np.quantile([v[metric] for v in vs],[.05,.95]),'runs':[v[metric] for v in vs]} for metric in ['auc','brier']} for n,vs in vals.items()}})
 fig,axs=plt.subplots(1,2,figsize=(11,4.2));ax=axs[0]
 for name,color in [('baseline',LIME),('augmented',PINK)]:
  xx=[d['missing_rate']*100 for d in rows];vv=[d['models'][name]['auc'] for d in rows];ax.plot(xx,[v['mean'] for v in vv],'-o',color=color,label=name.title());ax.fill_between(xx,[v['range90'][0] for v in vv],[v['range90'][1] for v in vv],color=color,alpha=.15)
 ax.set(xlabel='Artificially missing feature cells (%)',ylabel='AUROC',ylim=(.45,1),title='Same records. Fewer measurements.');ax.legend(frameon=False,labelcolor='#edf0df');ax.grid(alpha=.4)
 ax=axs[1];labels=['Baseline only','Includes follow-up time'];vs=[clean['baseline']['auc'],clean['leaky_time']['auc']];bars=ax.barh(labels,vs,color=[LIME,PINK],height=.5);ax.set(xlim=(0,1),xlabel='Test AUROC',title='A timestamp can make the task easier')
 for bar,v in zip(bars,vs):ax.text(v-.02,bar.get_y()+bar.get_height()/2,f'{v:.3f}',va='center',ha='right',color='#101710',weight='bold')
 fig.tight_layout();savefig(fig,'robustness')
 return {'dataset':'UCI Heart Failure Clinical Records','n':len(y),'features':features,'excluded_predictor':'time','split':{'train':tr,'test':te},'file_sha256':hashlib.sha256(datafile.read_bytes()).hexdigest(),'metrics':clean,'stress':rows,'test_truth':y[te],'test_baseline_probabilities':base.predict_proba(X[te])[:,1]}

@threadpool_limits.wrap(limits=1)
def main():
 result={'schema':1,'date':'2026-11-13','seed':SEED,'environment':{'python':platform.python_version(),'numpy':np.__version__,'pandas':pd.__version__,'scipy':scipy.__version__,'sklearn':sklearn.__version__,'matplotlib':matplotlib.__version__},'calibration':calibration_experiment(),'conformal':regression_experiment(),'robustness':heart_experiment()}
 (OUT/'results.json').write_text(json.dumps(native(result),indent=2,allow_nan=False))
 print(json.dumps({k:{'n':v['n'],'split':{n:len(s) for n,s in v['split'].items()},'metrics':v['metrics']} for k,v in result.items() if k in ['calibration','conformal','robustness']},default=native,indent=2))
if __name__=='__main__':main()
