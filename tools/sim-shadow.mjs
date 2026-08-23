/* Offline replica of FS_SCENE trace(): find the coded capture boundary b*
   and compare with analytic b_crit = 3*sqrt(3)*M. Same dt schedule,
   same Euler-Cromer, same constants. No GPU, no guesswork. */

const RS = 1.0, DISK_IN = 2.6, DISK_OUT = 11.0, ESC_R2 = 1936.0;

function captureB(d, dtScale, steps, slabRefine = true){
  /* ray launched from camera at (0, y0, d) toward origin with lateral
     offset b: p0=(0,0,d), v0=normalize((b? no — use pure b in x)) */
  let lo = 0.05, hi = 6.0;
  const captured = b => {
    const p = [0, 0, d];
    const v = norm([b, 0, -Math.sqrt(Math.max(0, d*d - b*b))]);  /* aims past origin by b */
    let hv = cross(p, v), h2 = dot(hv,hv)/(1 - RS/d);
    for(let i = 0; i < steps; i++){
      const r2 = dot(p,p);
      if(r2 < RS*RS) return true;
      if(r2 > ESC_R2 && dot(p,v) > 0) return false;
      const r = Math.sqrt(r2);
      let dt = Math.min(1.4, Math.max(0.02, r*0.14*dtScale));
      if(slabRefine && Math.abs(p[1]) < 1.1 && r > DISK_IN*0.8 && r < DISK_OUT*1.05) dt *= 0.55;
      const k = -1.5*h2/(r2*r2*r);
      v[0]+=k*p[0]*dt; v[1]+=k*p[1]*dt; v[2]+=k*p[2]*dt;
      p[0]+=v[0]*dt; p[1]+=v[1]*dt; p[2]+=v[2]*dt;
    }
    return dot(p,p) < RS*RS*4;   /* ended near hole: treat as captured-ish */
  };
  if(captured(hi)) return hi;
  for(let i = 0; i < 40; i++){
    const mid = (lo+hi)/2;
    if(captured(mid)) hi = mid; else lo = mid;
  }
  return (lo+hi)/2;
}
function dot(a,b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function norm(a){ const l=Math.hypot(a[0],a[1],a[2]); return [a[0]/l,a[1]/l,a[2]/l]; }

const d = 17.05;
console.log('analytic b_crit =', (3*Math.sqrt(3)*0.5).toFixed(4));
for(const [dtS, steps] of [[0.58,400],[0.75,290],[1.0,190],[1.5,120]]){
  const b = captureB(d, dtS, steps);
  console.log(`dtScale=${dtS} steps=${steps}: coded b* = ${b.toFixed(4)}  (${(100*(b-2.598076)/2.598076).toFixed(2)}% vs analytic)`);
}
/* angular translation at d, and px at fov63/800px */
const bc = captureB(d, 0.58, 400);
const sinT = bc*Math.sqrt(1-1/d)/d;
console.log('implied shadow radius px =', (Math.tan(Math.asin(sinT))/0.6121*400).toFixed(1));
