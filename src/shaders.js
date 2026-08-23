/* ============================================================
   GARGANTUA — GLSL library (ESSL 3.00)
   Renderer-agnostic: consumed by the Three.js harness in main.js.
   Units: rs (Schwarzschild radius) = 1. Disk: ISCO-ish inner edge,
   Keplerian differential rotation, Doppler + gravitational shift.
   ============================================================ */

export const VS = `
precision highp float;
in vec3 position;
out vec2 vUv;
void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy,0.0,1.0); }`;

/* ---------------- scene: geodesic integrator ---------------- */
export const FS_SCENE = `
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;

uniform float uTime;
uniform vec3  uCamPos;
uniform mat3  uBasis;
uniform float uTanF;
uniform float uAspect;
uniform int   uSteps;
uniform float uDtScale;
uniform float uLensing;
uniform float uDoppler;
uniform float uGain;
uniform float uOpacity;
uniform float uFlow;
uniform float uTwinkle;
uniform vec3  uTint;

const float RS        = 1.0;    /* Schwarzschild radius */
const float DISK_IN   = 2.6;    /* just outside ISCO (3 rs) for drama */
const float DISK_OUT  = 11.0;
const float ESC_R2    = 1936.0; /* r = 44 */
const int   MAX_STEPS = 420;

/* ---- hashing & noise ---- */
float hash13(vec3 p){
  p = fract(p*0.1031);
  p += dot(p, p.zyx+31.32);
  return fract((p.x+p.y)*p.z);
}
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f*f*(3.0-2.0*f);
  float a = hash13(i);
  float b = hash13(i+vec3(1.0,0.0,0.0));
  float c = hash13(i+vec3(0.0,1.0,0.0));
  float d = hash13(i+vec3(1.0,1.0,0.0));
  float e = hash13(i+vec3(0.0,0.0,1.0));
  float g = hash13(i+vec3(1.0,0.0,1.0));
  float h = hash13(i+vec3(0.0,1.0,1.0));
  float k = hash13(i+vec3(1.0,1.0,1.0));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),
             mix(mix(e,g,u.x),mix(h,k,u.x),u.y),u.z);
}
const mat3 ROT = mat3(vec3(0.36,0.48,-0.80), vec3(-0.80,0.60,0.0), vec3(0.48,0.64,0.60));
float fbm5(vec3 p){
  float s=0.0, a=0.5;
  for(int i=0;i<5;i++){ s+=a*vnoise(p); p=ROT*p*2.03+11.5; a*=0.55; }
  return s;
}
float fbm4(vec3 p){
  float s=0.0, a=0.5;
  for(int i=0;i<4;i++){ s+=a*vnoise(p); p=ROT*p*2.11+7.3; a*=0.55; }
  return s;
}

/* ---- thermal emission ramp (artistic blackbody) ---- */
vec3 blackbody(float t){
  t = clamp(t, 0.22, 2.45);
  vec3 c = mix(vec3(0.20,0.020,0.000), vec3(0.95,0.150,0.012), smoothstep(0.22,0.70,t));
  c = mix(c, vec3(1.02,0.46,0.09), smoothstep(0.70,1.05,t));
  c = mix(c, vec3(1.32,0.89,0.51), smoothstep(1.05,1.45,t));
  c = mix(c, vec3(1.85,1.63,1.29), smoothstep(1.45,1.88,t));
  c = mix(c, vec3(1.92,2.08,2.45), smoothstep(1.88,2.45,t));
  return c;
}

/* ---- celestial sphere ---- */
const mat3 SKYA = mat3(vec3(0.66,0.0,-0.75), vec3(0.0,1.0,0.0), vec3(0.75,0.0,0.66));
const mat3 SKYB = mat3(vec3(1.0,0.0,0.0), vec3(0.0,0.913,0.408), vec3(0.0,-0.408,0.913));
const vec3  BN   = vec3(0.25,0.88,-0.40);
const vec3  CORE = vec3(-0.70,0.15,0.65);

float starLayer(vec3 d, float s, float thr, float amp){
  vec3 p = d*s;
  vec3 id = floor(p);
  float h = hash13(id);
  if(h < thr) return 0.0;
  vec3 f = fract(p)-0.5;
  vec3 off = (vec3(hash13(id+11.1), hash13(id+27.7), hash13(id+43.3))-0.5)*0.62;
  float dd = length(f-off);
  float mag = pow(hash13(id+5.5), 3.2);
  float tw = mix(1.0, 0.72+0.38*sin(uTime*(0.6+h*2.4)+h*39.0), uTwinkle);
  return exp(-dd*dd*110.0)*mag*amp*tw*16.0;
}
vec3 skyColor(vec3 d){
  d = SKYA*SKYB*d;
  vec3 col = vec3(0.0032,0.0042,0.0088);
  float bd = dot(d, BN);
  float band = exp(-bd*bd*24.0);
  float clouds = fbm5(d*2.6+vec3(7.7));
  float dust = fbm4(d*5.9+vec3(-3.1,5.2,1.9));
  float mw = band*(0.30+1.05*pow(clamp(clouds*1.25-0.15,0.0,1.0),1.7));
  mw *= 1.0-0.72*smoothstep(0.42,0.78,dust)*band;
  vec3 mwc = mix(vec3(0.34,0.46,0.92), vec3(1.05,0.74,0.44),
                 clamp(pow(clamp(band*clouds*1.6,0.0,1.0),1.1),0.0,1.0));
  col += mwc*mw*0.50;
  float cg = pow(max(dot(d,CORE),0.0),30.0);
  col += vec3(1.0,0.80,0.55)*cg*band*0.85;
  col += starLayer(d, 70.0, 0.9915, 1.15);
  col += starLayer(d,150.0, 0.9880, 0.75);
  col += starLayer(d,340.0, 0.9855, 0.42);
  return col;
}

/* ---- accretion disk sample ---- */
vec4 diskSample(vec3 q, vec3 rayDir){
  float rr = length(q.xz);
  float inner = smoothstep(DISK_IN*0.84, DISK_IN*1.12, rr);
  float outer = 1.0-smoothstep(DISK_OUT*0.52, DISK_OUT*0.98, rr);
  float env = inner*outer;
  if(env < 0.003) return vec4(0.0);

  float phi = atan(q.z, q.x);
  float omega = uFlow*inversesqrt(rr*rr*rr);
  float ang = phi - omega*uTime;
  float ca_ = cos(ang), sa_ = sin(ang);
  float lr = log(rr);
  float t1 = uTime*0.05;

  float n1 = fbm5(vec3(ca_*1.35, sa_*1.35, lr*4.6)+vec3(0.0,0.0,t1));
  float n2 = fbm4(vec3(ca_*2.9+9.4, sa_*2.9, lr*8.8)+vec3(0.0,0.0,-t1*1.9));
  float n3 = vnoise(vec3(ca_*7.5, sa_*7.5, lr*17.0)+vec3(t1*3.1));

  float dens = n1*0.58+n2*0.30+n3*0.16;
  dens = clamp(dens*1.62-0.30, 0.0, 1.0);
  dens = dens*dens*(3.0-2.0*dens);
  dens *= env;
  if(dens < 0.004) return vec4(0.0);

  float fil = smoothstep(0.52, 0.88, n2);

  /* relativistic shifts: orbital Doppler + gravitational redshift */
  float temp = pow((DISK_IN*1.18)/rr, 0.75);
  float beta = clamp(sqrt(0.5/max(rr-RS, 0.55)), 0.0, 0.80);
  vec3 vd = vec3(-q.z, 0.0, q.x)/max(rr, 1e-4);
  float gam = inversesqrt(max(1.0-beta*beta, 0.01));
  float dopp = 1.0/(gam*(1.0-beta*dot(vd, -rayDir)));
  float grav = sqrt(max(1.0-RS/rr, 0.04));
  float shift = clamp(mix(1.0, dopp*grav, uDoppler), 0.32, 1.95);

  temp *= shift;
  float boost = shift*shift*shift;

  vec3 emis = blackbody(temp)*(dens*(1.0+fil*1.9));
  float rim = 1.0-smoothstep(1.0, 1.5, rr/DISK_IN);   /* white-hot inner edge */
  emis += vec3(1.9,2.0,2.3)*(rim*rim*0.85)*inner;
  emis *= uGain*boost*uTint;

  float alpha = clamp(dens*1.75*uOpacity, 0.0, 1.0);
  return vec4(emis, alpha);
}

/* ---- null-geodesic march ---- */
vec3 trace(vec2 ndc){
  vec3 rd = normalize(uBasis*vec3(ndc.x*uAspect*uTanF, ndc.y*uTanF, 1.0));
  vec3 p = uCamPos;
  vec3 v = rd;
  vec3 hv = cross(p, v);
  float h2 = dot(hv,hv)*uLensing;

  vec3 col = vec3(0.0);
  float T = 1.0;
  bool done = false;

  for(int i=0;i<MAX_STEPS;i++){
    if(i >= uSteps || done) break;
    float r2 = dot(p,p);
    if(r2 < RS*RS){ done = true; continue; }               /* captured */
    if(r2 > ESC_R2 && dot(p,v) > 0.0){                     /* escaped  */
      col += T*skyColor(normalize(v));
      done = true; continue;
    }
    float r = sqrt(r2);
    float dt = clamp(r*0.14*uDtScale, 0.02, 1.4);
    if(abs(p.y) < 1.1 && r > DISK_IN*0.8 && r < DISK_OUT*1.05) dt *= 0.55;

    vec3 acc = (-1.5*h2/(r2*r2*r))*p;
    v += acc*dt;
    vec3 np = p+v*dt;

    if(p.y*np.y < 0.0){
      float f = p.y/(p.y-np.y);
      vec3 hp = mix(p, np, f);
      float hr = length(hp.xz);
      if(hr > DISK_IN*0.84 && hr < DISK_OUT){
        vec4 ds = diskSample(hp, normalize(v));
        col += T*ds.rgb;
        T *= 1.0-ds.a;
        if(T < 0.004){ done = true; continue; }
      }
    }
    p = np;
  }
  if(!done && T > 0.01){
    /* step budget exhausted near the photon sphere — classify by radial
       motion: outward rays are escaping, inward ones are effectively captured */
    col += dot(p,v) > 0.0 ? T*skyColor(normalize(v)) : vec3(0.0);
  }
  return col;
}

void main(){
  vec2 ndc = vUv*2.0-1.0;
  vec3 col = trace(ndc);
  outColor = vec4(col, 1.0);
}`;

/* ---------------- post: bright pass ---------------- */
export const FS_BRIGHT = `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
void main(){
  /* 4-tap prefilter: retires isolated HDR fireflies before they alias
     into the pyramid and the anamorphic streak */
  vec3 c = texture(uSrc, vUv+uTexel*vec2(-0.5,-0.5)).rgb;
  c += texture(uSrc, vUv+uTexel*vec2(0.5,-0.5)).rgb;
  c += texture(uSrc, vUv+uTexel*vec2(-0.5,0.5)).rgb;
  c += texture(uSrc, vUv+uTexel*vec2(0.5,0.5)).rgb;
  c *= 0.25;
  float br = max(max(c.r,c.g),c.b);
  float soft = clamp((br-uThreshold+uKnee)/(2.0*uKnee+1e-4), 0.0, 1.0);
  float w = max(br-uThreshold, 0.0)/max(br, 1e-4)*soft;
  outColor = vec4(c*w, 1.0);
}`;

/* ---------------- post: downsample (box4) ---------------- */
export const FS_DOWN = `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main(){
  vec3 c = texture(uSrc, vUv+uTexel*vec2(-1.0,-1.0)).rgb;
  c += texture(uSrc, vUv+uTexel*vec2(1.0,-1.0)).rgb;
  c += texture(uSrc, vUv+uTexel*vec2(-1.0,1.0)).rgb;
  c += texture(uSrc, vUv+uTexel*vec2(1.0,1.0)).rgb;
  outColor = vec4(c*0.25, 1.0);
}`;

/* ---------------- post: separable gaussian ---------------- */
export const FS_BLUR = `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform vec2 uDir;
void main(){
  vec3 c = texture(uSrc, vUv).rgb*0.2270270;
  vec2 o1 = uDir*uTexel*1.3846153;
  vec2 o2 = uDir*uTexel*3.2307692;
  c += texture(uSrc, vUv+o1).rgb*0.3162162;
  c += texture(uSrc, vUv-o1).rgb*0.3162162;
  c += texture(uSrc, vUv+o2).rgb*0.0702702;
  c += texture(uSrc, vUv-o2).rgb*0.0702702;
  outColor = vec4(c, 1.0);
}`;

/* ---------------- post: anamorphic streak ---------------- */
export const FS_STREAK = `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main(){
  vec3 acc = texture(uSrc, vUv).rgb;
  float wsum = 1.0;
  float w = 0.84;
  for(int i=1;i<=14;i++){
    float fi = float(i);
    float o = fi*fi*0.011+fi*0.012;          /* sqrt-ish spread */
    vec2 dx = vec2(o*uTexel.x*24.0, 0.0);
    acc += texture(uSrc, vUv+dx).rgb*w;
    acc += texture(uSrc, vUv-dx).rgb*w;
    wsum += 2.0*w;
    w *= 0.82;
  }
  outColor = vec4(acc/wsum*vec3(0.62,0.76,1.0), 1.0);
}`;

/* ---------------- post: composite ---------------- */
export const FS_COMPOSITE = `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uB0;
uniform sampler2D uB1;
uniform sampler2D uB2;
uniform sampler2D uB3;
uniform sampler2D uB4;
uniform sampler2D uStreak;
uniform float uTime;
uniform float uBloomStr;
uniform float uStreakStr;
uniform float uExposure;
uniform float uSaturation;
uniform float uHasGlow;
uniform float uGrainAmt;
uniform vec2  uOutTexel;

vec3 aces(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0);
}
float hash12(vec2 p){
  vec3 q = fract(vec3(p.xyx)*0.1031);
  q += dot(q, q.yzx+33.33);
  return fract((q.x+q.y)*q.z);
}
void main(){
  /* mild pincushion + radial chromatic aberration */
  vec2 cc = vUv-0.5;
  float r2 = dot(cc,cc);
  vec2 uv = 0.5+cc*(1.0-0.045*r2);
  float ca = 0.0125*r2;
  vec3 col;
  col.r = texture(uScene, uv+cc*ca).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv-cc*ca).b;

  if(uHasGlow > 0.5){
    vec3 b = texture(uB0, uv).rgb*1.00;
    b += texture(uB1, uv).rgb*0.80;
    b += texture(uB2, uv).rgb*0.62;
    b += texture(uB3, uv).rgb*0.48;
    b += texture(uB4, uv).rgb*0.36;
    col += b*(uBloomStr*0.30);
    col += texture(uStreak, uv).rgb*uStreakStr;
  }
  col *= uExposure;
  col = aces(col);

  float lum = dot(col, vec3(0.2126,0.7152,0.0722));
  col = mix(vec3(lum), col, uSaturation);

  /* vignette */
  float vig = 1.0-0.36*smoothstep(0.32, 0.98, length(cc)*1.42);
  col *= vig;

  /* film grain, luminance-scaled */
  float g = hash12(vUv*uOutTexel+fract(uTime)*371.0)-0.5;
  col += g*uGrainAmt*(1.0-lum*0.65);

  outColor = vec4(pow(max(col,0.0), vec3(1.0/2.2)), 1.0);
}`;
