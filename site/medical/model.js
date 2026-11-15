export function selectiveSummary(records,threshold,model='calibrated'){
 if(!Number.isFinite(threshold)||threshold<.5||threshold>1)throw new Error('Threshold must be in [0.5, 1]');
 const retained=records.filter(r=>Math.max(r[model],1-r[model])>=threshold);
 const wrong=retained.filter(r=>Number(r[model]>=.5)!==r.truth);
 return {n:retained.length,deferred:records.length-retained.length,accuracy:retained.length?1-wrong.length/retained.length:null,fn:retained.filter(r=>r.truth===1&&r[model]<.5).length,fp:retained.filter(r=>r.truth===0&&r[model]>=.5).length};
}
export function intervalSummary(records,q){
 if(!Number.isFinite(q)||q<0)throw new Error('Interval radius must be nonnegative');
 const covered=records.filter(r=>Math.abs(r.truth-r.prediction)<=q).length;
 return {n:records.length,covered,coverage:records.length?covered/records.length:null,width:2*q};
}
export function percentage(value,digits=1){return value==null?'—':(value*100).toFixed(digits)+'%';}
export function finiteExtent(records,q){return [Math.floor(Math.min(...records.map(r=>Math.min(r.truth,r.prediction-q)))/50)*50,Math.ceil(Math.max(...records.map(r=>Math.max(r.truth,r.prediction+q)))/50)*50];}
