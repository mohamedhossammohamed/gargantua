# GARGANTUA — Living Scientific Audit

Last full revision: round 10 of the adversarial sea. This document is the
honesty ledger: what is exact, what is approximated, what is NOT implemented,
and what the current largest scientific weakness is. It must be updated every
iteration. Nothing here claims "100% exact" — every claim carries its error.

## 1. Implemented physics — basis and verification status

| Phenomenon | Governing theory | Status | Evidence |
|---|---|---|---|
| Null geodesics | Binet form of the exact Schwarzschild null orbit: u'' + u = 3Mu², RK4 | **Exact ODE, numerical solution** | science-suite: shadow boundary −0.000% vs b_crit; RK4 convergence ratio 17.2 ≈ 2⁴; Binet invariant conserved to 1e-7 over 1500 steps |
| Event horizon | r = rs = 2GM/c² | exact (capture test u > 1/rs) | interior luminance 0/255 in metro gauge |
| Photon sphere | r = 1.5 rs = 3GM/c² | exact (u_Ph = 1/(3M)) | separatrix resolves at b_crit ± 1e-7; near-critical rays wind 3.1 orbits |
| Shadow radius | b_crit = 3√3 GM/c² | **measured +0.2% (scene space)** | headless gauge in ?metro mode (AA, accumulation, grain, pincushion all disabled; bloom-off asserted, tier/HDR asserted) |
| ISCO | r = 6GM/c² = 3 rs | exact (science-mode inner edge) | pinned constant in suite |
| Plunging region | streams between ISCO and horizon | rendered (qualitative) | visible in science graze shots; density model is illustrative, not a solution of the relativistic Euler equations |
| Orbital motion | Ω_K = √(M/r³) (exact Schwarzschild coordinate frequency) | exact | pinned in suite (uFlow = 0.70711 = √M, r^-3/2 in shader) |
| Orbital velocity | β = √(M/(r−rs)) | **exact** — algebraically identical to the locally-measured circular-orbit speed √(M/r)/√(1−rs/r) | verified symbolically (round-3) |
| Special-relativistic Doppler | g = 1/[γ(1−β cosθ)] | exact SR formula | round-10 audit verified structure |
| Static-frame emission angle | cosθ = b·√f/r, f = 1−rs/r | **exact** (round-10 fix; the plot-frame dot product over-beamed the approaching limb ~21% after g⁴) | tetrad derivation; two independent auditor derivations agree |
| Gravitational redshift | √(1−rs/r_em)/√(1−rs/r_obs), static observers | exact for static observer/emitter | round-10 audit clean |
| Relativistic beaming | I_obs = g⁴·I_em (bolometric), applied once | exact (round-7 removed a g⁸ double-count) | round-10 audit: "applied exactly once" |
| Observed color | T_obs = g·T_em on the Planck locus | exact chromaticity mapping; Tanner–Helland sRGB fit decoded to linear (round-5; the fit itself drifts from the true Planck locus above ~4×10⁴ K — documented below) | round-10 audit domain-clean |
| Disk temperature | Shakura–Sunyaev T(r) ∝ x^(−3/4)(1−√(rin/r))^(1/4), no-stress inner torque; peak x = 49/36, f = 0.4879 | exact profile shape | peak constant computed 0.48789 (round-10 audit) |
| T_max normalization | Eddington: Ṁ = L_Edd/ηc², η = 1−√(8/9) → T_max = 8.6×10⁶ K at 10 M☉ | standard thin-disk estimate | derived in code comment; replaced a ~7× super-Eddington constant (round-2) |
| Weak-field lensing | deflection → 4M/b + (15π/4)(M/b)² | **matches 2PN series** | science-suite test 5 |
| Light-bending tail truncation | escape sphere r = 65 | documented systematic: ~0.9° under-deflection on escaped rays' sky directions (uniform, invisible without reference; does not affect shadow) | suite test 6 bounds it |

## 2. Explicit non-implementations (documented, not silent)

- **Kerr geometry / spin / frame dragging / ergosphere: NOT implemented.**
  The simulation is exact for the a = 0 (Schwarzschild) limit only. The
  orbital-plane Binet formulation does not generalize to Kerr (no conserved
  planar orbit); a Kerr tracer requires the full Hamiltonian formulation
  with non-integrable trajectories — feasible in WebGL but a ground-up
  rederivation with its own regression suite. Until then the renderer makes
  no Kerr claims anywhere in its UI.
- **Volumetric disk thickness: NOT implemented.** The disk is an infinitely
  thin plane sampled at crossings. Edge-on optical depth is therefore
  under-represented; the grazing filter is the documented mitigation.
- **Disk emission is a turbulence model, not radiative transfer.** Density
  fields are procedural fbm advected at Ω_K; the T(r)⁴ amplitude and the
  g-factors are physical, but the opacity/scattering are illustrative.
  Science mode keeps amplitudes and chromaticity physical; cinema mode is
  explicitly artistic (labeled in-app).
- **Plunging-region density** is procedural, not a solution of relativistic
  hydrodynamics.

## 3. Rendering approximations (visual, not physics)

- 32-phase subpixel jitter + EMA temporal accumulation: presentation-layer
  AA; converges static frames to a ~32-tap supersample. Physics claims are
  measured with it disabled (?metro).
- Grazing-incidence noise filter: variance-shrink around face-on means —
  mean-preserving by construction (round-10 rewrite), cuts aliasing
  variance. Second-order Jensen effects through the density clamp ~1%
  (auditor-quantified).
- Film grain, bloom, anamorphic streak, ACES grade: artistic layer, off in
  metro, CA confined to the streak.
- Film grain ±0.03 linear is visible in dark regions at display gamma —
  intentional aesthetic, never present in measurements.

## 4. Numerical characteristics (measured)

- Integrator: RK4 on the Binet equation, adaptive dφ = dt·0.09·clamp(0.35/u, 0.6, 1).
- Convergence: boundary error −1.85e-7 → −1.07e-8 → −6.44e-10 as dt halves
  (ratio 17.2 ≈ 2⁴ — clean fourth order).
- Conservation: Binet invariant drift ≤ 1e-7 over full integrations.
- Shadow boundary at production settings: −0.000% (offline mirror),
  +0.2% (GPU end-to-end, scene space).
- Known numerical edge: the in-band exhaustion tiebreak captures
  b ∈ (b_crit, b_crit + 9e-4) — shadow inflation 3.5e-4 relative, accepted
  and documented.

## 5. Largest remaining scientific weakness (current)

**Kerr/spin is absent** — the largest gap between this renderer and the
general case. Second: the disk is thin-plane procedural turbulence rather
than radiative transfer. Both are documented above; the next high-impact
improvement, if attempted, is a Kerr Hamiltonian tracer behind the same
gauge/suite discipline (zero-spin limit must reduce to the current
Schwarzschild results — the suite already pins those).

## 6. Verification protocol

- `node tools/science-suite.mjs` — offline closed-form battery (must be ALL GREEN).
- `node tools/measure-shadow-converged.mjs` — GPU shadow gauge in ?metro
  (asserts bloom off, ultra tier, HDR targets; aborts otherwise).
- Cold adversarial sea: rotating independent reviewer agents (defect
  hunters, spectacle jurors, GR auditor, emission auditor, hostile
  diagnostician) — findings fixed in batch, re-run until clean.
- Every physics change re-runs the full stack; the suite pins the shader's
  constants so silent drift fails loudly.
