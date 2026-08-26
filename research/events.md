# GARGANTUA — Interactive Events: Physics Design

Charter: no event ships without documented equations, quantified
approximations, and suite tests. Everything renders through the existing
Schwarzschild tracer (single .html file preserved).

## E1. Tidal Disruption Event (TDE) — "black hole eats a sun"

Exact physics:
- Timelike geodesics in Schwarzschild, Binet form: u'' + u = M/L² + 3Mu²
  (per-ray debris integration on CPU; perihelion precession is EXACT and
  visible — Δφ_periapsis = 6πM/(a(1−e²)) is a suite test).
- Tidal radius: r_t = R★(M_BH/M★)^{1/3} ≈ 8.9 rs for (Sgr A*, sun) —
  the disruption happens INSIDE the frame, just outside the ISCO.
- Debris energy spread (Stone-type, scaled to the hole):
  Δε = GM_BH·R★/r_t² ≈ 3.45×10⁻⁴ (c² units) for (4.3×10⁶ M☉, sun).
  The star spawns at E = 1 − Δε/2 so the ±Δε spread STRADDLES the binding
  threshold: genuinely half the debris is unbound. Debris velocities are
  derived from the first integral at each particle's own (E, L) — no
  ad-hoc kicks.
- Time compression: NONE of the dynamics is compressed; with the correct
  Δε the stream wraps on physically-scaled orbital times. A small L spread
  (±6%, from the star's self-rotation) widens the ribbon.

Approximations (documented):
- Debris = N=600 test particles (no self-gravity, no hydro pressure after
  disruption — standard "geometric TDE" approximation, valid while the
  stream is cold).
- The stream renders as a density locus: CPU integrates all N particles
  (RK4, timelike Binet) each event-tick; the locus bakes to a (r,φ) table
  the shader samples at plane crossings. Density = proximity to the locus ×
  per-particle temperature proxy (compression at periapsis).
- The star renders as an equatorial bright spot of radius R★ (thin-disk
  star approximation) until disruption.

## E2. Gas infall

- Stream of particles launched from r≈20 rs with sub-circular L; each
  particle loses angular momentum parametrically (dL/dt = −k·L·Ω(r),
  documented as a viscosity proxy — NOT MHD). Orbits are exact timelike
  geodesics otherwise. Particles vanish inside the horizon.
- Same locus rendering as E1.

## E3. Relativistic jets ("laser beams")

- Two collimated outflows along ±y (the disk normal). Kinematics: bulk
  β = 0.99 (Γ ≈ 7.1), apparent speed may exceed c (superluminal motion) —
  exact SR projection, shown in the HUD.
- EMISSION: exact SR beaming via the same g-factor machinery —
  g = 1/[Γ(1−β cosθ)], I = g³·I' per-frequency (jets are spectral) with
  the Doppler color shift. The approaching jet brightens; the receding one
  dims — the standard two-sided jet asymmetry.
- NOT modeled (documented): Blandford–Znajek launching (requires spin +
  magnetosphere — our tracer is a=0), internal shocks, radiative transfer.
  Collimation is a parametric cone profile.

## E4. Binary black hole merger

- Inspiral: Peters (1964) quadrupole formula, geometric units:
  da/dt = −(64/5)·m₁m₂(m₁+m₂)/a³ (circular). CPU-integrated.
  TIME COMPRESSION ×500 (documented): the true decay at the shipped masses
  takes hours of wall time; the compressed evolution follows the exact a⁴
  self-similar law, so only the clock is rescaled.
- Merger remnant: M_f = (m₁+m₂)(1−ε), ε ≈ 0.05 (numerical-relativity value
  for equal-mass non-spinning binaries). Area-theorem check (suite 9c):
  M_f,irr ≥ √(m₁²+m₂²) — the IRREDUCIBLE mass bound, not the total mass.
- Merger: at a ≈ 6(m₁+m₂) (ISCO-ish) the bodies plunge. Final mass from
  the area theorem + measured GW efficiency: M_f = (m₁+m₂)·(1−ε), ε ≈ 0.05
  for equal masses (documented as the numerical-relativity value for
  equal-mass non-spinning binaries).
- RENDERING APPROXIMATION (documented): two-center lensing has no exact
  solution. While a >> radii, the secondary renders as an occluding black
  disk (horizon-radius silhouette) over the primary's lensed background;
  the primary's lensing is the full tracer. No GW "flash" is rendered —
  gravitational waves are not light; the honest visual is the shadows
  coalescing into the larger final shadow.

## Suite tests to add

- r_t formula vs the disruption radius used.
- Timelike periapsis precession vs 6πM/(a(1−e²)) for the TDE orbit.
- Peters da/dt integrated vs a closed-form equal-mass merger time.
- Jet beaming: g(θ=0)/g(θ=π) = [(1+β)/(1−β)] — ratio check in the mirror.
- Merger mass: M_f ≥ m₁+m₂ (area theorem) and ε within the NR band.
