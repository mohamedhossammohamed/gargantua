# GARGANTUA — Living Scientific Audit

Last full revision: round 11 of the adversarial sea (hostile falsification +
numerical-analysis panel). This is the honesty ledger: what is exact, what is
approximated, what is NOT implemented, and the current largest scientific
weakness. Updated every iteration. No claim of "100% exact" — every claim
carries its error.

## 1. Implemented physics — basis and verification status

| Phenomenon | Governing theory | Status | Evidence |
|---|---|---|---|
| Null geodesics | Binet form of the exact Schwarzschild null orbit: u'' + u = 3Mu², RK4 | **Exact ODE, numerical solution** | suite: shadow boundary −0.0000% at two camera radii; convergence order gated to p ∈ [4.06, 4.11]; Binet invariant ≤ 1e-7 |
| Event horizon | r = rs | exact (capture test) | interior luminance 0/255 in metro gauge |
| Photon sphere | r = 1.5 rs | exact (u_Ph = 1/(3M)) | separatrix resolves at b_crit ± 1e-7; 3.1-orbit winding |
| Shadow radius | b_crit = 3√3 GM/c² | **+0.15% measured, GPU end-to-end, scene space** | ?metro gauge (AA/accumulation/grain/pincushion off; bloom/ultra/HDR asserted) — this number is also the fp32 executed-arithmetic validation (the suite is fp64 source-level; the two chains agree, closing the float gap the round-11 audit flagged) |
| ISCO | r = 6GM/c² = 3 rs | exact AND rendered as such: the science envelope opens at 0.97–1.03 rs·rin (round-11), and the sampling window admits the plunge band down to 1.15 rs (round-12: the cinema 0.84 ramp constant had leaked into the science window and silenced everything inside 2.52 rs) | pinned from source in suite |
| Plunging region | rendered r ∈ [1.15, 2.94] rs | **approximation, disclosed**: kinematics = free-fall from infinity (v = √(rs/r) local static, clamped 0.93; exact zero-angular-momentum infall — true ISCO-parity geodesics run slower here); Doppler measured against the RADIAL direction (round-12: the azimuthal cosine painted an orbital signature on infall); full g on chromaticity and amplitude; fixed scalars disclosed: amplitude ×0.40, chromaticity ×0.55·T_max, pattern speed 2.4×Ω_K and density texture illustrative | code; this row is the disclosure |
| Orbital motion | Ω_K = √(M/r³) | exact | pinned from main.js upload in suite |
| Orbital velocity | β = √(M/(r−rs)) | **exact** — identical to the locally-measured circular-orbit speed | symbolic verification (round-3) |
| SR Doppler | g = 1/[γ(1−β cosθ)] | exact; **science mode forces uDoppler = 1** (round-11: the film palette's 0.32 silently gutted it) | hostile audit finding, fixed |
| Static-frame emission angle | cosθ = k·b·√f/r, k = cos(orbital/disk dihedral) | exact at any inclination (round-12: the round-10 coplanar form skipped k and under-beamed inclined views up to 16% — the nonlinear local-frame map does not commute with the dihedral) | hostile-audit numeric check + tetrad derivation |
| Gravitational redshift | √(1−rs/r_em)/√(1−rs/r_obs) | exact for static emitter/observer | round-10 audit |
| Beaming | I_obs = g⁴·I_em, applied exactly once (body AND plunge tracked separately — round-11 removed the plunge g⁸ reintroduction) | exact | round-11 audit finding, fixed |
| Observed color | T_obs = g·T_em, Planck locus, sRGB→linear decoded; **science mode forces saturation = 1.0** (round-11: ember's 1.14 pushed chroma off-locus) | exact chromaticity path | hostile audit finding, fixed |
| Disk temperature | Shakura–Sunyaev with no-stress inner torque; peak x = 49/36, f = 0.4879 | exact profile | peak computed 0.48789 |
| T_max normalization | Eddington Ṁ = L_Edd/ηc², η = 1−√(8/9) → 8.6×10⁶ K at 10 M☉ | standard estimate | replaced a 7× super-Eddington constant (round-2) |
| Weak-field lensing | 4M/b + (15π/4)(M/b)² | **matches 2PN to 0.78%** (residual = 3PN + finite r_start) | suite test 5 |

## 2. Explicit non-implementations (documented, not silent)

- **Kerr / spin / frame dragging / ergosphere: NOT implemented.** Exact for
  a = 0 only; no Kerr claims anywhere in the UI. A Kerr tracer needs the
  full Hamiltonian formulation — the next high-impact improvement if
  attempted, gated behind this suite's zero-spin pins.
- **Volumetric disk: NOT implemented** — infinitely thin plane sampled at
  crossings; the grazing filter is the documented mitigation.
- **Disk emission is procedural turbulence, not radiative transfer.**
  Amplitudes and chromaticity are physical in science mode; opacity and
  scattering are illustrative.
- **Plunge-band pattern speed (2.4× Ω_K) and density texture are
  illustrative**; the kinematics/radiometry are the documented free-fall
  approximation above.
- **Coplanar degenerate framing**: at camera elevation exactly 0 the ray
  plane coincides with the disk plane and the sign-change crossing test
  never fires. Handled since round 12 (the coplanar case samples the plane
  every step — a ray confined to the disk IS always inside it).
- **Known bounded sky-direction systematics** (star positions only; the
  shadow is unaffected): budget-dead inbound near-critical rays sample the
  sky along the tangent, discarding radian-scale remaining winding for the
  tiny class that starves mid-flight at low budgets; grazing rays can cross
  the plane twice within one step (odd/even crossing ambiguity, bounded by
  the step cap); the escape-sphere tail (~0.9°) and the shipped-schedule
  weak-field deflection (~0.011 rad) as quantified above.

## 3. Rendering approximations (visual, not physics)

Full artistic layer, all OFF in ?metro measurements: 32-phase temporal
accumulation (presentation AA), film grain, bloom pyramid, anamorphic
streak (the only chromatic aberration), **vignette (up to −36% corners,
unconditional — disclosed here per round-11), exposure ×1.05, saturation
grade (forced 1.0 in science), ACES tone map**. The gauge samples a sector
where the vignette is provably 1.0 (round-11 diagnostician).
- Grazing noise filter: variance-shrink around face-on means; mean-preserving
  by construction, residual Cov(dens, fil) cross-term a few percent (round-11
  auditor-quantified).

## 4. Numerical characteristics (measured)

- RK4 on Binet, adaptive dφ = dt·0.09·clamp(0.35/u, 0.6, 1).
- Convergence: boundary error −1.85e-7 → −6.44e-10 (order gated 3.5–4.5).
- Invariant drift ≤ 1.01e-7 (12 significant digits).
- Shadow boundary: −0.0000% (fp64 mirror, two camera radii); +0.15% (GPU fp32
  end-to-end, scene space).
- **Known, bounded systematics** (all documented, all invisible without an
  external reference, none affect the shadow criterion):
  - escape-sphere tail ~0.9° on escaped rays' sky directions (r = 65);
  - shipped-schedule weak-field deflection error ~0.011 rad absolute
    (suite-measured); the dφ schedule is open-loop, not an error-feedback
    controller — near the separatrix, perturbations amplify e-fold per
    radian, so accuracy is certified at the production geometry by the GPU
    gauge rather than uniformly;
  - in-band exhaustion tiebreak inflates the shadow by db/b ~ 3.5e-4;
  - horizon capture quantizes r to one step (~0.02 rs) — cosmetic on a black
    silhouette;
  - escape-crossing interpolation is O(dφ²) (~0.006°) — subdominant to the tail.
- Suite pins are parsed from shipped source: changing uDiskIn, uFlow, or
  ESC_R2 in the app now fails the suite loudly (round-11 closed the
  self-referential-pin hole).

## 5. Largest remaining scientific weakness (current)

**Kerr/spin absence** remains #1. #2: the fixed open-loop step schedule —
an error-feedback controller (per-step local-error estimate adapting dφ)
would uniformize accuracy across camera geometries; current certification is
at the production camera plus the suite's convergence study. #3: thin-plane
procedural disk vs radiative transfer.

## 6. Verification protocol

- `node tools/science-suite.mjs` — offline closed-form battery (ALL GREEN required).
- `node tools/measure-shadow-converged.mjs` — GPU gauge in ?metro with
  precondition asserts (bloom/ultra/HDR).
- Cold adversarial sea: 20 rotating independent agents per round (defect
  hunters, spectacle jurors, GR auditor, emission auditor, numerical
  analyst, hostile falsifier, metrology verifier) — findings fixed in batch,
  re-run until clean. Round 11's hostile panel falsified the audit itself
  twice (palette leak, ISCO edge); both falsifications are fixed above.
