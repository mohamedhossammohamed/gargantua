# Gargantua

Real-time general-relativistic black hole renderer, Three.js harness.
Builds to a single self-contained `index.html` — no runtime dependencies,
no network fetches.

## What it does

- **Null-geodesic ray tracing** — every pixel integrates a photon path through
  the Schwarzschild metric (`d²x/dλ² = −3⁄2 h² x̂ / r⁴`, conserved angular
  momentum `h = |x × v|`). Gravitational lensing of both the accretion disk and
  the background starfield falls out of the integration for free: photon ring,
  Einstein-ring star swirl, and the far side of the disk folded above and below
  the shadow are emergent, not painted on.
- **Relativistic accretion disk** — Keplerian differential rotation shears
  procedural fBm turbulence into spiral streaks; thin-disk temperature profile
  `T ∝ r^(−3/4)` drives an artistic blackbody ramp; orbital Doppler beaming
  (`δ³` intensity boost, blueshift on the approaching limb) plus gravitational
  redshift `√(1−rs/r)` produce the asymmetric bright/dark sides.
- **Cinematic post chain** — HDR (RGBA16F) internal buffer → prefiltered Karis-
  knee bright pass → 5-level blur pyramid → anamorphic streak → composite with
  radial chromatic aberration, ACES tonemap, saturation grade, vignette, film grain.
- **Tiered adaptive quality** — auto mode measures frame-time EMA against the
  rolling achievable minimum (vsync-aware) and steps through discrete internal-
  resolution tiers {100–50%}, promoting/demoting integrator step count at the
  floors; manual Low→Ultra locks it (120–400 steps).

## Layout

```
index.html              ← built deliverable (self-contained; Three r185 bundled in)
standalone-webgl2.html  ← earlier zero-dependency build, same shaders, raw WebGL2 harness
src/shaders.js          ← all GLSL (renderer-agnostic, ESSL 3.00)
src/main.js             ← Three.js harness: renderer, RT pyramid, passes, camera, UI
src/template.html       ← markup/CSS shell
build.mjs               ← esbuild bundle + HTML stitch
tools/check.mjs         ← static gate: shader balance, ESSL scan, uniform contract,
                          external-reference ban on the dist artifact
```

## Build & verify

```
npm install        # three + esbuild
node build.mjs     # -> dist/index.html and ./index.html (~540 KB)
node tools/check.mjs
```

## Controls

| Input | Action |
|---|---|
| drag / scroll / pinch | orbit / dolly |
| `1 2 3` | view presets (orbit, graze, overhead) |
| `space` | freeze motion |
| `L` `D` `B` | toggle lensing, Doppler beaming, bloom |
| `P` | palette (Ember ↔ Film) |
| `Q` | cycle quality · `H` hide interface · `?` help card |

## Note

The physics and post GLSL are byte-identical across both harnesses; only the
resource/pass layer differs (raw WebGL2 vs THREE.WebGLRenderer +
RawShaderMaterial + WebGLRenderTarget).
