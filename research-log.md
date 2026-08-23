# Research Log

## 2026-08-23 — Session 01

- **init**: Workspace initialized under ~/blackhole. Question locked:
  photorealistic + pixel-perfect + zero-bug + scientifically scaled BH renderer,
  validated by >=10 cold adversarial rounds.
- **context**: Renderer already functional (Three r185 harness, geodesic
  integrator, post chain). Black-screen defect earlier today root-caused
  (r185 #define injection before #version) and fixed; headless Chrome
  verified pixels + screenshot reviewed by lead.
- **protocol(next)**: Capture 12-shot matrix across views/palettes/toggles/
  quality tiers -> cold validation round 1 (>=8 reviewers) -> fix confirmed
  defects -> begin H1/H2/H3 implementation behind accuracy toggles.

## Decisions

- Scientific scale implemented as a *mode* (science HUD + Planck palette)
  coexisting with cinema palette — accuracy without destroying the show.
- Objective pixel-perfect metric chosen before any tuning: rendered shadow
  diameter vs analytic critical impact parameter b_crit = 3√3 rs, target
  <0.5% error at high/ultra tiers.
