export const meta = {
  name: 'gargantua-sea-validation-r4',
  description: 'Round 4 sea: 12 per-shot reviewers + 3 spectacle judges + 2 physics auditors + 1 gauge diagnostician',
  phases: [
    { title: 'Defects', detail: '12 single-action per-shot reviewers' },
    { title: 'Judges', detail: '3 spectacle jurors' },
    { title: 'Physics', detail: '2 GR auditors + gauge drift diagnostician' },
  ],
}

const DIR = '/Users/mohammedhossam/blackhole/data/shots'
const SRC = '/Users/mohammedhossam/blackhole/src'

const FIND_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'object', properties: {
      shot: { type: 'string' }, severity: { type: 'string', enum: ['high','med','low'] },
      where: { type: 'string' }, desc: { type: 'string' } },
      required: ['shot','severity','where','desc'] } },
  },
  required: ['clean','findings'],
}
const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    scores: { type: 'array', items: { type: 'object', properties: {
      shot: { type: 'string' }, score: { type: 'number' }, note: { type: 'string' } },
      required: ['shot','score','note'] } },
    weakest: { type: 'string' },
  },
  required: ['scores','weakest'],
}
const DIAG_SCHEMA = {
  type: 'object',
  properties: {
    diagnosis: { type: 'string' },
    fix_proposal: { type: 'string' },
    confident: { type: 'boolean' },
  },
  required: ['diagnosis','fix_proposal','confident'],
}

const REVIEW = `STRICT PROTOCOL — follow exactly, in order:
STEP 1: Use the Read tool on exactly the image path listed below. Do nothing else — no code reading, no shell, no analysis prose.
STEP 2: Immediately call StructuredOutput. clean=true if the image shows no genuine visual defect; otherwise list findings (max 4) with shot filename, severity, where-in-frame, description. Visual defects = banding, seams, ghosting, blur smearing, double edges, HUD glitches, geometry contradicting gravitational lensing.
NOT defects (established by controlled A/B evidence, do not convict): film grain; palette and bloom choices; bright knots or speckle along the photon ring — an identical frame with the starfield disabled (data/shots/14-closeup-nostars.png vs 13-closeup-stars.png) proves these are LENSED STAR IMAGES, i.e. correct physics; faint concentric arcs in the dark moat near the shadow are higher-order lensed disk images, also correct physics.
Do NOT write any prose response. The StructuredOutput call IS your entire answer.`

const SHOTS = ['S1-orbit-cinema.png','S2-orbit-science.png','S3-graze-science.png','S4-science-gargantua.png',
  'S5-science-nolensing.png','01-orbit-default.png','02-graze.png','03-overhead.png',
  '09-ultra-graze.png','10-low-orbit.png','11-closeup-paused.png','12-closeup-frozen.png']

const JUDGE = `You are a spectacle juror. Use the Read tool on each image path listed below (no other tools, no prose). Then call StructuredOutput: score each shot 0-10 for sheer visual impact — would this frame make someone stop scrolling? 10 = Interstellar-poster grade. note = one clause on what lifts or sinks it. weakest = filename of the weakest shot. Be ruthless; average sci-fi wallpapers score 5.
Do NOT write any prose response.`
const JUDGE_SETS = [
  ['S1-orbit-cinema.png','S3-graze-science.png','11-closeup-paused.png'],
  ['02-graze.png','09-ultra-graze.png','04-orbit-film.png'],
  ['S2-orbit-science.png','S4-science-gargantua.png','10-low-orbit.png'],
]

const PHYS_A = `GR correctness audit. Read ${SRC}/shaders.js ONLY the trace() function. Verify against exact Schwarzschild results: (1) Binet equation u'' + u = 3Mu^2 with M=rs/2 — confirm the RHS sign and the RK4 step; (2) impact parameter b = r sin(psi)/sqrt(1-rs/r) is conserved by construction; (3) shadow edge for critical rays: b_crit = 3*sqrt(3)*M — does the capture test (uN > 1/RS) combined with the winding budget reproduce this?; (4) the budget-exhaustion fallback classifies by photon-sphere side u_Ph = 1/(3M) with a 0.012 marginal band — is that classification physically sound (escape iff u < u_Ph when budget dies, modulo the marginal band)?; (5) the secant-refined plane crossing — any way it can pick the wrong branch or NaN? Report violations as findings with shot:'code', severity by physical impact. Then StructuredOutput — that call is your entire answer. No prose.`

const PHYS_B = `Emission-physics audit. Read ${SRC}/shaders.js ONLY the diskSample() and kelvinRGB() functions. Verify: (1) Doppler g-factor 1/(gamma(1-beta*dot(vd,-rayDir))) — correct special-relativistic Doppler for an observer looking along -rayDir?; (2) gravitational shift sqrt(1-rs/r_em) * 1/sqrt(1-rs/r_obs) — correct static-observer ratio?; (3) beaming I_obs = g^uBeamExp with uBeamExp=4 in science mode — bolometric invariant I/nu^3 gives g^4, correct?; (4) Shakura-Sunyaev T(r) = T_max * x^{-3/4}(1-x^{-1/2})^{1/4}/0.4879 with x=r/rin — correct no-stress inner torque profile, peak at x=49/36?; (5) kelvinRGB Tanner-Helland fit — any domain bug (log of non-positive, division by zero) for tK in [1e5, 1e8]?; (6) the grazing filter fading noise fields by incidence angle — does it preserve the MEAN emission (no bias) while cutting variance? Report violations as findings with shot:'code'. Then StructuredOutput — that call is your entire answer. No prose.`

const DIAG = `Verify a metrology design decision. Context: the shadow gauge (tools/measure-shadow.mjs) drifted from -0.50% to -0.61% after temporal accumulation (16-tap subpixel jitter + EMA) was added to src/main.js — the AA kernel bleeds ring brightness across the edge, biasing ANY threshold-based estimator on the accumulated image. The implemented resolution: a metrology mode (?metro=1 in src/main.js render()) that disables jitter, bypasses accumulation (uMix=1), and disables grain — so tools/measure-shadow.mjs now measures the RAW tracer output (physics), while visual quality is judged on accumulated images. Read tools/measure-shadow.mjs and the render() function in src/main.js and answer: (1) does the metro path cleanly bypass jitter+accumulation with no residual coupling? (2) is the 50%-of-plateau edge estimator unbiased for both a hard step and a box-filtered ramp? (3) any way the metro numbers could still be contaminated by the presentation pipeline (pincushion/CA/ACES)? Report problems as findings (shot:'code'); if the design is sound, clean=true with an empty findings array. Then StructuredOutput — that call is your entire answer. No prose.`

phase('Defects')
const reviewTasks = SHOTS.map(s => ({ kind:'review', shot:s, prompt: `${REVIEW}\n\nImage: ${DIR}/${s}` }))
phase('Judges')
const judgeTasks = JUDGE_SETS.map((set,i) => ({ kind:'judge', set:i+1,
  prompt: `${JUDGE}\n\n${set.map(f=>DIR+'/'+f).join('\n')}` }))
phase('Physics')
const physTasks = [
  { kind:'phys', id:'gr-trace', prompt: PHYS_A, schema: FIND_SCHEMA },
  { kind:'phys', id:'emission', prompt: PHYS_B, schema: FIND_SCHEMA },
  { kind:'diag', id:'gauge-drift', prompt: DIAG, schema: DIAG_SCHEMA },
]

const all = [...reviewTasks, ...judgeTasks, ...physTasks]
/* one immediate retry when an agent dies without StructuredOutput — the
   classifier flap killed 11/18 and 12/18 of the previous launches */
const spawn = async (t) => {
  const opts = {
    label: `r4:${t.shot||('set'+t.set)||t.id}`, phase: t.kind==='review'?'Defects':(t.kind==='judge'?'Judges':'Physics'),
    schema: t.kind==='judge' ? JUDGE_SCHEMA : (t.kind==='diag' ? DIAG_SCHEMA : FIND_SCHEMA),
  }
  return (await agent(t.prompt, opts)) ?? (await agent(t.prompt, opts))
}
const results = await pipeline(all, spawn)

const defects = [], judges = [], diags = []
all.forEach((t,i)=>{ const r = results[i]; if(!r) return
  if(t.kind==='review') defects.push({shot:t.shot, r})
  else if(t.kind==='judge') judges.push({set:t.set, r})
  else if(t.kind==='phys') defects.push({shot:t.id, r})
  else diags.push({id:t.id, r}) })

const confirmed = defects.flatMap(d => (d.r.findings||[]).filter(f=>f.severity!=='low').map(f=>({...f, source:d.shot})))
const lows = defects.flatMap(d => (d.r.findings||[]).filter(f=>f.severity==='low').map(f=>({...f, source:d.shot})))
const cleanShots = defects.filter(d=>d.r.clean).map(d=>d.shot)
const avgScore = judges.length ? (judges.flatMap(j=>j.r.scores||[]).reduce((a,s)=>a+s.score,0)/Math.max(1,judges.flatMap(j=>j.r.scores||[]).length)) : 0
log(`sea r4: ${cleanShots.length}/14 clean, ${confirmed.length} serious, ${lows.length} minor; spectacle avg ${avgScore.toFixed(1)}/10; diag confident: ${diags.map(d=>d.id+':'+d.r.confident).join(',')||'none'}`)
return { confirmed, lows, cleanShots,
  judgeScores: judges.map(j=>({set:j.set, avg:(j.r.scores||[]).reduce((a,s)=>a+s.score,0)/Math.max(1,(j.r.scores||[]).length), weakest:j.r.weakest, notes:j.r.scores})),
  diagnostics: diags.map(d=>({id:d.id, diagnosis:d.r.diagnosis, fix:d.r.fix_proposal, confident:d.r.confident})),
  failed: all.length - results.filter(Boolean).length }
