"""Render the calibration figure with uncertainty and denominators, without refitting."""
import json
from pathlib import Path
import matplotlib.pyplot as plt
from run_experiments import OUT, LIME, PINK, MUTED, savefig
r=json.loads((OUT/'results.json').read_text())['calibration']
fig,axs=plt.subplots(1,2,figsize=(12,4.6));ax=axs[0];ax.plot([0,1],[0,1],color=MUTED,ls='--',lw=1)
for entry,color in zip(r['reliability'],[PINK,LIME]):
 d=entry['bins'];xx=[v['predicted'] for v in d]; yy=[v['observed'] for v in d]
 errs=[[max(0,v['observed']-v['ci'][0]) for v in d],[max(0,v['ci'][1]-v['observed']) for v in d]]
 ax.errorbar(xx,yy,yerr=errs,fmt='o-',color=color,lw=1,capsize=3,label=entry['model'].title())
 for v in d:ax.annotate(f"n={v['n']}",(v['predicted'],v['observed']),xytext=(5,-14 if entry['model']=='raw' else 8),textcoords='offset points',fontsize=7,color=color)
ax.set(xlabel='Mean predicted malignancy probability',ylabel='Observed fraction malignant',xlim=(-.03,1.03),ylim=(-.07,1.08),title='Reliability • Wilson 95% intervals');ax.legend(frameon=False,labelcolor='#edf0df',fontsize=8,loc='upper left');ax.grid(alpha=.4)
d=r['selective'];ax=axs[1];xx=[v['coverage']*100 for v in d];yy=[v['accuracy']*100 for v in d];errs=[[max(0,(v['accuracy']-v['accuracy_ci'][0])*100) for v in d],[max(0,(v['accuracy_ci'][1]-v['accuracy'])*100) for v in d]];ax.errorbar(xx,yy,yerr=errs,fmt='o-',color=LIME,capsize=3,lw=1)
for i,v in enumerate(d):ax.annotate(f"{v['threshold']} / n={v['retained']}",(xx[i],yy[i]),xytext=(0,8+10*(i%2)),textcoords='offset points',ha='center',fontsize=7,color=MUTED)
ax.set(xlabel='Test records retained (%)',ylabel='Accuracy among retained (%)',title='Fixed threshold / retained count',ylim=(89,105));ax.grid(alpha=.4);fig.tight_layout();savefig(fig,'calibration')
