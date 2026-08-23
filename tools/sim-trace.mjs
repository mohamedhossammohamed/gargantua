/* Trajectory dump for a single ray — where does the scheme actually go? */
const RS = 1.0, ESC_R2 = 1936.0;
function dot(a,b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }

function trace(b, d, dtScale, steps, useCorrection, useSlab){
  const p = [0, 0, d];
  const v = [b, 0, -Math.sqrt(Math.max(0, d*d - b*b))];
  const vl = Math.hypot(v[0],v[1],v[2]); v[0]/=vl; v[1]/=vl; v[2]/=vl;
  const hv = [p[1]*v[2]-p[2]*v[1], p[2]*v[0]-p[0]*v[2], p[0]*v[1]-p[1]*v[0]];
  let h2 = dot(hv,hv);
  if(useCorrection) h2 /= (1 - RS/d);
  let rmin = 1e9;
  const log = [];
  for(let i = 0; i < steps; i++){
    const r2 = dot(p,p);
    const r = Math.sqrt(r2);
    rmin = Math.min(rmin, r);
    if(i % Math.floor(steps/12) === 0) log.push(`i=${i} r=${r.toFixed(2)} |v|=${Math.hypot(...v).toFixed(3)}`);
    if(r2 < RS*RS){ log.push(`CAPTURED at i=${i} r=${r.toFixed(3)} rmin=${rmin.toFixed(3)}`); return {log, captured:true, rmin}; }
    if(r2 > ESC_R2 && dot(p,v) > 0){ log.push(`ESCAPED at i=${i} r=${r.toFixed(1)} rmin=${rmin.toFixed(3)}`); return {log, captured:false, rmin}; }
    let dt = Math.min(1.4, Math.max(0.02, r*0.14*dtScale));
    if(useSlab && Math.abs(p[1]) < 1.1) dt *= 0.55;
    const k = -1.5*h2/(r2*r2*r);
    v[0]+=k*p[0]*dt; v[1]+=k*p[1]*dt; v[2]+=k*p[2]*dt;
    p[0]+=v[0]*dt; p[1]+=v[1]*dt; p[2]+=v[2]*dt;
  }
  log.push(`EXHAUSTED r=${Math.sqrt(dot(p,p)).toFixed(2)} rmin=${rmin.toFixed(3)}`);
  return {log, captured: Math.sqrt(dot(p,p)) < 2, rmin};
}

const d = 17.05;
for(const b of [1.0, 2.0, 2.7, 3.5, 6.0]){
  const r = trace(b, d, 0.58, 400, true, false);
  console.log(`b=${b}: ${r.captured?'CAPTURED':'escaped'} rmin=${r.rmin.toFixed(3)}  [${r.log.at(-1)}]`);
}
console.log('--- no correction, no slab, dt fine 0.25 fixed ---');
for(const b of [2.0, 2.7, 3.5]){
  const r = trace(b, d, 0.25, 4000, false, false);
  console.log(`b=${b}: ${r.captured?'CAPTURED':'escaped'} rmin=${r.rmin.toFixed(3)}  [${r.log.at(-1)}]`);
}
