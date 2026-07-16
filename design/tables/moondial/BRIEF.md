# Moondial — Table 1 design brief

**Status: v1 built (pre-brief era; this file added 2026-07-17 with the
differentiation pass).** Table id: `moondial`. Table 1 predates the
BRIEF.md convention — its design truth grew directly in `playfield.svg`,
`rules.json`, `src/table/defs/moondial.ts` and `src/game/moondial.ts`;
this file exists to carry deltas the way the younger tables' briefs do.

**Premise:** a night observatory. The dial, the moon lanes, the
telescope, the lunar eclipse. First panel of the same-night anthology
and its baseline machine: the only symmetric table (funnel bottom, no
outlanes, no kickback, no subway, 3 moon lanes to everyone else's 4) and
the only flat one (no M11 strata) — the "classic" of the lineup by
design, per the differentiation plan's principle that Moondial keeps its
unique symmetric bottom rather than importing the shared kit.

## Differentiation pass (2026-07-17)

**THE GNOMON** — the sundial's pointer, made physical: a retractable
centre post between the flipper tips, risen when its shadow matters —
while the **ball-saver is live** and during **LUNAR ECLIPSE**. Diverter
reuse (blades `up` / `down`, the `down` blade an inert sliver parked in
the sealed void under the plunger saddle — the Phase-0 entcheck
pattern). Findings:

- Post `M 260 990 L 260 1004`, data-width 9: edges sit ~15 mm off the
  resting flipper tips — inside the static wedge band, deliberately:
  the tips sweep that pocket, so a resting ball is always recoverable.
  Simcheck proves the drop rests without draining, a single flip
  recovers it, and the same drop drains with the post down.
- A ball balanced DEAD-centre on the post tip resists a symmetric
  both-flipper pinch (sim-found); a single flip recovers it. Real
  arrivals are never perfectly centred, nudge exists, and the post
  retires with the saver — accepted, watch in play.
- The blade renders as the standard diverter gate in both renderers;
  art pass may later restyle it brass (ball-touch metal).

**FIRST LIGHT** — the lineup's first skill shot (STYLE-GUIDE §4
pattern): `sensor-skill-firstlight`, y 440–500 in the shooter lane. A
soft plunge peaking in the band fires at ≤ 0.75 m/s (`skill.maxSpeed`)
and pays `skill.points` (15,000) + one spotted moon lane; once per
ball. Plunge probe (2026-07-17): roll-back plunges (v 1.1–1.3 of the
0.8–2.0 range) cross y 500 at 0.25–0.71 m/s; the softest lane-exiting
plunge (v 1.4) crosses at 0.88 — clean separation, and the qualifying
window (~v 1.05–1.3) is a real touch target ~20 % of the pull range.
The reward shape is deliberate: a qualifying plunge rolls BACK to the
saddle, so the skill shot banks its award and hands you the real
plunge — the observatory rewards patience.

## Suite results

Simcheck: full moondial suite + 6 new checks (gnomon up/recover/down,
skill pay/once/full-plunge-no) green; soak seeds 1/2/3/7 with the
Phase-0 saver stub (8 s post-launch window raising the gnomon) — see
the differentiation PR for numbers.
