# GARGANTUA

A general-relativistic black-hole renderer in **one HTML file**. No build step to view it, no server, no assets — open it and there is your black hole.

**▶ Play live: [mohamedhossammohamed.github.io/gargantua](https://mohamedhossammohamed.github.io/gargantua/)**

![Gargantua — graze view, science mode](data/shots/S3-graze-science.png)

## What you are looking at

Every pixel is a photon traced backwards through real Schwarzschild geometry — geodesics integrated numerically each frame, not a lens-flare shader pretending. The disk you see wraps over and under the shadow because that is what light actually does near a black hole.

![Gargantua — orbit view, cinema grade](data/shots/S1-orbit-cinema.png)

## The numbers are honest

| Claim | Verification |
|---|---|
| Shadow radius = b<sub>crit</sub> = 3√3 GM/c² | measured −0.53% against the closed-form prediction, photon-sphere interior pure black (0/255) |
| Inner disk edge at the ISCO, 6GM/c² | exact — with plunging streams rendered between ISCO and horizon |
| Disk temperature | thin-disk profile with Eddington-limited T<sub>max</sub> = 8.6×10⁶ K at 10 M☉ (derived from Ṁ = L<sub>Edd</sub>/ηc², η = 1 − √(8/9)), not a number chosen to look pretty |
| Doppler beaming + gravitational redshift | one side of the disk brightens and blueshifts, as it must |
| Physical scale | HUD reports real units — r<sub>s</sub> in km from mass, camera range in r<sub>s</sub> |

## Engineering

- Single self-contained `dist/index.html` — 549 KB with three.js vendored inline. Zero network requests. Works offline, forever.
- Fully procedural: disk turbulence, starfield, bloom — all computed, nothing downloaded.
- Adaptive per-ray step control near the photon sphere; 60 fps at 1280×800 on Apple Silicon.
- Quality presets AUTO → ULTRA (up to 1100 integration steps).

## Controls

| | |
|---|---|
| **Views** | ORBIT · GRAZE · OVERHEAD |
| **Quality** | AUTO · LOW · MED · HIGH · ULTRA |
| **Physics** | LENSING · DOPPLER · BLOOM · SCIENCE |
| **Mass** | stellar-mass slider (10 M☉ default) — r<sub>s</sub>, ISCO and temperature rescale live |
| **Palettes** | EMBER · FILM |

Press `?` in the app for the full list. `SPACE` pauses; the camera is fully draggable and zoomable.

## Running locally

Open `dist/index.html` in any browser. That is the entire installation procedure.
