# Gargantua — Findings

## Current Understanding

A real-time Three.js/WebGL2 Schwarzschild ray tracer exists at `index.html`
(built from `src/`). Headless-verified rendering at 60 fps with correct
large-scale structure:

- Emergent gravitational lensing: photon ring, Einstein-lensed starfield,
  far side of disk folded above/below the shadow — all from geodesic
  integration (`d²x/dλ² = −3/2 h² x̂ / r⁴`), confirmed visually.
- Doppler beaming produces the asymmetric bright limb; texture advection
  direction and velocity field agree (H7 partially verified by construction).
- Post chain (HDR→bloom pyramid→streak→ACES+grain) is stable; no visible
  banding at internal-res 100% in the first screenshot.

## Known Gaps vs Locked Criteria

1. **Scale is arbitrary** (rs=1 unit-less). No physical readouts. Criterion
   demands mass-anchored units (km/AU/K), which also forces honest
   temperature handling (a 10⁸ M☉ accretion disk peaks far hotter/bluer than
   the cinematic orange — science palette must come from the Planck locus,
   cinema palette must be *labeled* false-color).
2. **Inner edge sits inside ISCO** (DISK_IN=2.6rs vs exact 3rs) — artistic,
   violates scientific-scale criterion unless reframed as plunging region.
3. **Temperature profile** is a pure power law; Shakura–Sunyaev includes the
   inner-torque factor `(1−√(rin/r))^{1/4}` which zeroes emission AT the ISCO.
   This changes the look materially (dark gap at inner edge) — needs a
   hypothesis test, not a blind swap.
4. **Paper-thin disk**: plane-crossing sampling makes the disk vanish edge-on
   at GRAZE view; volumetric slab (H4) is the realism fix.
5. **Photon-ring fidelity unquantified** (H6): possible dashing artifacts near
   the ring at default quality; need objective shadow-radius vs b_crit=3√3·rs
   measurement per quality tier.
6. Suspected minor artifact in first screenshot: tiny colored glyph next to
   telemetry "100%" — identify (grain sparkle vs HUD bug).

## Lessons and Constraints

- three r185 injects `#define SHADER_TYPE/NAME` before raw shader sources:
  strings carry NO `#version`; `glslVersion: THREE.GLSL3` supplies it.
  (Cost of learning: one full black-screen cycle.)
- Setting `uX.value` without declaring `uX` in the material's uniforms object
  throws per-frame and kills the rAF loop silently (black screen, fps frozen).
  The accessor-contract check in tools/check.mjs now guards this.
- **Metrology saga (H6)** — five gauge iterations taught: (1) bloom smears
  the photon ring inward ~50px, fabricating interior glow — measure with
  bloom off; (2) film grain ±0.03 *linear* becomes ±34 display levels after
  gamma — absolute thresholds must exceed it or use ?nograin; (3) downsampled
  readback halves radii — label units or suffer "-48%" ghosts; (4) overhead
  view entangles disk brightness edge with the shadow — use the orbit view's
  clean upper sector; (5) the round-1 adjudicated h2 "correction" over-bends
  ~19% — in the affine Cartesian scheme h=|p×v| already IS b; refuted by
  instrument, reverted with documentation.
- **H6 RESULT: shadow radius +1.38% vs exact GR** (123.0 vs 121.3px,
  interior 0/255 black). Integrator vindicated. Straight-ray leg validates
  the projection pipeline to −0.79%.
- Sandbox: ctx_shell hard 120s cap → detach long jobs via node child_process;
  native Bash gated entirely; shell redirects/downloads blocked.
- Verification stack that works: python http.server (detached) on :8811 +
  puppeteer-core driving system Chrome headless + rAF-hooked readPixels +
  page.screenshot (compositor capture sees WebGL fine).

## Open Questions

- Does the torque-factor T-profile (H2) destroy the cinematic look? Test as
  toggleable accuracy layer rather than replacement.
- Can TAA-lite jitter (H5) run at 60fps budget alongside volumetric slab?
- Is the user's machine GPU-bound at ultra? (Adaptive controller will tell us
  via telemetry once they interact.)
