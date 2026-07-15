# Physics tuning — current defaults + change log

The live retuned values. **Source of truth is `src/tuning.ts`** — update
this doc when defaults change there. The untouched historical baseline is
[original-defaults.md](original-defaults.md).

Player note: defaults only apply to fresh browsers; existing players carry
their localStorage values until they hit "Reset to defaults" in the panel.

## Current defaults (2026-07-02)

| Key | Current | vs original | Meaning |
|---|---|---|---|
| `slopeDeg` | 6.5 | — | Table incline; gravity = 9.81 × sin(slope) |
| `ballDensity` | 140 | — | ≈ 80 g ball |
| `ballRestitution` | **0.2** | was 0.3 | Ball bounciness |
| `ballFriction` | 0.05 | — | Surface grip / spin transfer |
| `ballLinearDamping` | **0.10** | was 0.02 | Rolling drag |
| `ballAngularDamping` | 0.02 | — | Spin decay |
| `wallRestitution` | **0.15** | was 0.25 | Rail liveliness |
| `wallFriction` | 0.1 | — | Rail grip |
| `flipperMaxTorque` | 1.5 | — | Motor strength |
| `flipperUpSpeed` | 30 | — | Stroke speed (tip ≈ 2.4 m/s) |
| `flipperDownSpeed` | 8 | — | Return speed |
| `plungerMinSpeed` | 0.8 | — | Zero-charge launch |
| `plungerMaxSpeed` | **2.0** | was 2.6 | Full-charge launch |
| `plungerChargeTime` | 1.1 | — | Hold to full power |
| `bumperKick` | 0.09 | — | Pop-bumper impulse |
| `slingKick` | 0.11 | — | Slingshot impulse |
| `kickerEject` | 1.35 | new 2026-07-04 | Telescope-scoop eject speed along `KICKER.eject` (feeds the left flipper) |
| `cameraViewH` | 0.75 | — | Camera zoom (not physics) |
| `sfxVolume` | 0.5 | — | SFX bus |
| `musicVolume` | 0.25 | — | Music bus |
| `debugOverlay` | **false** | was true | Dev overlay (physics bodies); off for players |

## Change log

| Date | Change | Rationale | Verified |
|---|---|---|---|
| 2026-07-02 | `plungerMaxSpeed` 2.6 → 2.0 | Full plunge cleared the orbit with excess pace; more useful short-plunge range | orbit completes on full plunge (simcheck) |
| 2026-07-02 | `ballRestitution` 0.3 → 0.2, `wallRestitution` 0.25 → 0.15 | Heavier, more controlled ball; less rubber-ball chaos | 26/26 simcheck, 3× 10-min soaks, 0 stuck |
| 2026-07-02 | `ballLinearDamping` 0.02 → 0.15 | Rallies settle sooner; ball sheds speed between hits | 26/26 simcheck, 3× 10-min soaks, 0 stuck |
| 2026-07-02 | `ballLinearDamping` 0.15 → 0.10 | 0.15 played slightly too draggy in practice | 26/26 simcheck, 2 soaks, 0 stuck |
| 2026-07-04 | `kickerEject` added at 1.35 | New telescope kickout scoop; speed chosen so the eject clears the scoop hood and lands mid left flipper | simcheck: kickout crosses y=0.95 at x=0.212; 3× 10-min soaks, 0 stuck |
| 2026-07-08 | `debugOverlay` true → false | Was a dev convenience default; shipped the physics-body overlay to fresh players (visible on the public build). Off by default; still toggleable in the settings/debug panel | build passes; overlay reachable via panel |
| 2026-07-15 | `renderScale` removed from Tuning | Now a per-renderer display setting in Game (`pinball-render-scale-2d-v1` = 1, `-3d-v1` = 0.75) like the render mode, so tuning resets can't change sharpness. 3D defaults lower: bloom + fragment shading cost far more per pixel, and the 3D look hides the softness that would smear 2D line art. Old `renderScale` values in saved tuning are ignored (fresh per-mode defaults apply) | build passes; slider edits the active renderer's value |

Balance watch-item: the combined 2026-07-02 changes slow the table — if
orbits/bank shots start feeling under-rewarded, adjust point values in
`design/tables/moondial/rules.json`, not the physics.
