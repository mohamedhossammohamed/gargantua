# GARGANTUA

A general-relativistic black-hole renderer in **one HTML file**. No build step to view it, no server, no assets — open it and there is your black hole.

**▶ Play live: [mohamedhossammohamed.github.io/gargantua](https://mohamedhossammohamed.github.io/gargantua/)**

![Gargantua — graze view, science mode](data/shots/S3-graze-science.png)

## What you are looking at

Every pixel is a photon traced backwards through exact Schwarzschild geometry — the Binet equation `u'' + u = 3Mu²` integrated RK4 per ray per frame, not a lens-flare shader pretending. The disk wraps over and under the shadow because that is what light actually does near a black hole. The bright knots strung along the photon ring are not noise: turn the starfield off (`?nostars`) and they vanish — each one is a background star smeared into view by the ring's extreme magnification.

![Gargantua — orbit view, cinema grade](data/shots/S1-orbit-cinema.png)

## The numbers are honest — and measured, not claimed

| Claim | Verification |
|---|---|
| Shadow radius = b<sub>crit</sub> = 3√3 GM/c² | **+0.2%** measured in scene space by a headless gauge that disables the AA, the accumulation, the grain and the pincushion warp before it measures anything (`?metro`), photon-sphere interior pure black (0/255) |
| Inner disk edge at the ISCO, 6GM/c² | exact — with plunging streams rendered between ISCO and horizon |
| Disk temperature | Shakura–Sunyaev profile with the no-stress inner torque factor; Eddington-limited T<sub>max</sub> = 8.6×10⁶ K at 10 M☉ (Ṁ = L<sub>Edd</sub>/ηc², η = 1 − √(8/9)) — the earlier constant was ~7× super-Eddington until a cold reviewer convicted it |
| Relativistic shifting | Doppler g-factor in the emitter's local static frame, gravitational redshift, beaming I<sub>obs</sub> = g⁴, observed color from T<sub>obs</sub> = g·T<sub>em</sub> on the Planck locus |
| Physical scale | HUD reports real units — r<sub>s</sub> in km from mass, camera range in r<sub>s</sub>/AU |

The gauge itself has a war story: three estimator revisions, a pincushion warp that had been quietly inflating every measurement since the first commit, and a bisection bracket that silently degenerated to the naive estimator. The final version asserts its own preconditions (bloom off) or refuses to measure.

## How it came to look like this

A standing panel of cold-context reviewer agents convicts every frame: per-shot defect hunters, spectacle jurors, and auditors that re-derive the GR from the source. Findings from that panel, all fixed:

- **The beaded photon ring** — high-order caustic images are sub-texel thin and aliased into bead-chains. Cured with temporal accumulation: 32-phase subpixel jitter blended across frames, converging any static frame to a true supersample.
- **Black specks on the rim** — winding rays that exhausted their step budget were classified by the sign of dw/dφ, painting physically-escaping rays black. Now classified by photon-sphere side.
- **A mirrored universe bug** — the initial du/dφ was hardcoded positive, so any ray starting *outward* integrated the φ-reflected orbit. Dormant in centered framings; fatal the moment the hole leaves frame-center.
- **Tree rings in the haze** — coarse far-field steps quantized the terminal sky direction into concentric bands; the escape-sphere crossing is now interpolated, exactly like disk crossings.
- **Double-gamma'd starlight** — the Planck chromaticity fit is display-referred sRGB; feeding it to a linear pipeline as radiance washed every science-mode color toward pastel.

Full audit trail in `findings.md` and `research-state.yaml`.

## Engineering

- Single self-contained `dist/index.html` — ~550 KB with three.js vendored inline. Zero network requests. Works offline, forever.
- Fully procedural: disk turbulence, starfield, bloom — all computed, nothing downloaded.
- Adaptive per-ray step control near the photon sphere; temporal accumulation; adaptive internal resolution. 60 fps at 1280×800 on Apple Silicon.
- Quality presets AUTO → ULTRA (up to 1500 integration steps).

## Controls

| | |
|---|---|
| **Views** | ORBIT · GRAZE · OVERHEAD |
| **Quality** | AUTO · LOW · MED · HIGH · ULTRA |
| **Physics** | LENSING · DOPPLER · BLOOM · SCIENCE |
| **Mass** | STELLAR → SGR A* → GARGANTUA — r<sub>s</sub>, ISCO and temperature rescale live |
| **Palettes** | EMBER · FILM |

Press `?` in the app for the full list. `SPACE` pauses; the camera is fully draggable and zoomable.

## Running locally

Open `dist/index.html` in any browser. That is the entire installation procedure.
