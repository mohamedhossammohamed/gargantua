# Protocol — H1/H2/H3 Science Layer

**Locked before implementation** (commit precedes results).

## Change under test

Additive "accuracy layer" behind a `SCIENCE` toggle (key `Y`, HUD chip):

1. **H1 — ISCO-exact inner edge**: disk envelope inner ramp moves
   2.6rs → 3.0rs (exact ISCO). Between horizon and ISCO, add faint
   plunging-streamer haze sampled from the same noise field, sheared inward,
   so the gap reads as physics rather than emptiness.
2. **H2 — Shakura–Sunyaev temperature**: replace pure power law with
   `T(r) = T0 · (r/rin)^{-3/4} · (1 − sqrt(rin/r))^{1/4}`, normalized so
   T_max ≈ 0.488·T0 at r = (49/36)·rin. Cinema palette keeps artistic ramp;
   science palette derives color from Planck-locus fit at true T.
3. **H3 — physical scale**: mass presets
   {stellar 10 M☉, Sgr A* 4.3e6, Gargantua 1e8}; HUD gains live readouts:
   rs in km (2.95 km × M/M☉), camera distance in AU and rs, ISCO radius in
   km, local disk T_max in K (from Ṁ = 0.1 Ṁ_Edd convention), orbital β at
   inner edge. Units update as camera dollies.

## Predictions (locked)

- P1: Science mode shows a visibly darker moat at the ISCO with faint infall
  streaks; cinema mode unchanged (toggle-off bit-comparable).
- P2: Science palette shifts peak emission blue-white for all three masses
  (true T >> 10^4 K); reviewers asked to rate "physical plausibility" should
  score science mode higher even if cinema mode stays prettier.
- P3: HUD numbers self-consistent: β(ISCO)=0.5c exactly for Schwarzschild;
  rs(Gargantua) ≈ 2.95e8 km ≈ 1.97 AU.

## Metrics

- Toggle-off regression: screenshot hash equality with pre-change build at
  identical frozen frame (bit-exact expected — shader branch only).
- Cold-panel plausibility scoring (round ≥3).
- HUD arithmetic unit tests (node script asserting P3 constants).
