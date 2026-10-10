# Architecture

AI Grand Prix is a static Vite + TypeScript game. Physics runs headless at a fixed 60 Hz. Three.js only draws. New cars, tracks, personalities, screens, widgets, sounds, input devices, render layers, tuning passes, and race hooks appear by dropping a file into a folder. Registries use `import.meta.glob` and must not be edited to register content.

UI copy is Rioplatense Spanish (voseo, sentence case, no emoji, no em dash). Identifiers, comments, and this document are English.

## Modules

| Path          | Owns                                                  | Must not                                            |
| ------------- | ----------------------------------------------------- | --------------------------------------------------- |
| `src/core`    | Fixed timestep, vec helpers, pose blend, perf budgets | Import Three.js or touch the DOM                    |
| `src/physics` | Pure bicycle model and surface friction               | Read the clock, the track, or the DOM               |
| `src/cars`    | Car data and the stat-to-`VehicleParams` map          | Integrate motion                                    |
| `src/tracks`  | Spline circuits and surface queries                   | Step a vehicle                                      |
| `src/ai`      | Personalities and the pure-pursuit controller         | Mutate race state                                   |
| `src/race`    | World step: input, energy, contact, gates, hooks      | Render or play audio                                |
| `src/input`   | Keyboard and gamepad samples                          | Know about cars                                     |
| `src/audio`   | Web Audio bus                                         | Import Three.js                                     |
| `src/render`  | Scene, camera, models, FPS overlay                    | Step physics                                        |
| `src/ui`      | Screens and HUD widgets                               | Import Three.js                                     |
| `src/game`    | Preferences, selected car/track/rival, the frame loop | Grow feature logic that belongs in a hook or screen |

ESLint blocks `three` imports outside `src/render` and `src/game` (`src/game/app.ts` is the composition root). `erasableSyntaxOnly` is on: no enums, no parameter properties. Relative imports use the `.ts` extension.

## Simulation contract

`stepVehicle(state, input, params, surfaceMu, dt)` in `src/physics/vehicle.ts` is pure. `dt` from the game is always `1 / SIM_HZ` (`src/core/budget.ts`). There is no `Math.random` in the sim. Yaw `0` faces `+Z`. Positive steer yaws right. Brake does not reverse.

`FixedStepper.advance` in `src/core/loop.ts` accumulates frame time, caps a hitch at 0.25 s, and runs at most 5 steps. Leftover time is clamped so a long stall cannot spiral.

`createRace` / `stepRace` / `snapshotRace` / `respawnRacer` live in `src/race/world.ts`. One step: locate on the spline, read human or AI input, drain energy, integrate, separate cars, collide with the wall, emit surface events, advance gates, respawn if stuck, run hooks, then advance the clock. The player finishing ends the race. `condition` (default `1`) scales engine force so a damage hook can limp a car without editing the solver. An empty tank scales force to `0.32`.

`RaceSnapshot` is the read-only view for UI, ghosts, and widgets. `player.lap` is completed laps. The HUD shows `lap + 1`.

`window.__AGP` (`AgpDebug` in `src/game/app.ts`) is part of the test contract: `ready`, `screen`, `frameCount`, `avgFrameMs`, `avgSimMs`, `playerLap`, `playerSpeed`, `finished`.

## File contracts

Drop the file. Export the name in the table. Do not edit the registry.

| Add          | File                           | Export                               |
| ------------ | ------------------------------ | ------------------------------------ |
| Car          | `src/cars/models/<id>.ts`      | `car: CarDefinition`                 |
| Tuning       | `src/cars/tuning/<id>.ts`      | `tune(params, carId): VehicleParams` |
| Track        | `src/tracks/circuits/<id>.ts`  | `track: TrackDefinition`             |
| Personality  | `src/ai/personalities/<id>.ts` | `personality: Personality`           |
| Screen       | `src/ui/screens/<id>.ts`       | `screen: ScreenModule`               |
| HUD widget   | `src/ui/widgets/<id>.ts`       | `widget: HudWidget`                  |
| Sound        | `src/audio/clips/<id>.ts`      | `clip: AudioClip`                    |
| Input device | `src/input/devices/<id>.ts`    | `device: InputDevice`                |
| Render layer | `src/render/layers/<id>.ts`    | `layer: RenderLayer`                 |
| Race hook    | `src/race/hooks/<id>.ts`       | `hook: RaceHook`                     |

Hooks import `RaceWorld` and `RaceHook` with `import type` from `src/race/types.ts`. Importing `src/race/world.ts` cycles the hook registry. A hook may set `racer.condition`, push `world.extras`, and append events. It must not replace `world.racers`.

A screen with `menu: { label, variant, order }` shows up on the menu through `menuLinks()`. `ScreenContext` is `go`, `startRace`, `quit`, `links`, `getState`, `updateState`, `play`, `resumeAudio`.

`AudioBus`: `resume`, `play(id)`, `setMode('menu' | 'race' | 'quiet')`, `updateEngine(rpm, throttle, slip)`, `missing()`.

`InputDevice.priority`: keyboard is `1`, gamepad is `2`. The highest priority device that reports `active` owns the pedals. Edges (`pause`, `fps`, `respawn`) are OR-ed. A touch device should use priority `3` and report `active` only while a finger is down.

`RenderLayer.order`: world `0`, track `10`, props `20`, cars `30`, camera `40`. A particle layer fits at `25`.

`CarStats` are `0..100`. `paramsFromStats` is the only place that turns them into forces. A tuning hook runs after that map.

`TrackDefinition.corners` is a closed loop in the XZ plane (Y is up, so corners are `{x, z}` stored as `Vec2` of x and z). `buildTrack` resamples, smooths curvature, and resolves shortcut chords. `locate` is the surface query.

## Render and audio rules

- Daytime scene only: a gradient sky mesh, warm sun, a hemisphere fill, and linear fog for depth. No post-processing and no shadows, so an integrated GPU can hold 60 fps. `antialias: false`. Pixel ratio is `min(devicePixelRatio, preferences.pixelRatioCap)` with a default cap of `1.25`.
- Cars and props use Lambert. The sky, grass, and track use a basic material: the ground is flat, so a per-pixel light would shade every pixel the same. Repeated props are instanced. One merged mesh for a unique prop.
- Draw-call target stays in the low dozens. Do not add per-frame geometry allocation on the hot path.
- Car liveries are original color blocks and name text from `CarDefinition.livery`. Do not copy provider logos.
- Engine pitch follows RPM. Screech is procedural noise (see `ASSETS.md`). Collisions use the `crash` clip. UI uses `click` and `confirm`.

## Testing and perf

| Check         | Command                     | Fails when                                                                                     |
| ------------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| Unit          | `npm test`                  | Physics, registries, or the headless lap break                                                 |
| Headless perf | `tests/perf/budget.test.ts` | 10 s of two cars costs more than 1500 ms, or a step averages more than 2 ms                    |
| Browser smoke | `npm run test:e2e`          | Console error, race never starts, autodrive never exceeds 8 m/s, or a full lap never completes |
| Browser perf  | `e2e/perf.spec.ts`          | Average frame time ≥ `PERF_FAIL_FRAME_MS` (33) or sim time ≥ `PERF_FAIL_SIM_MS` (6)            |

`PERF_FAIL_FRAME_MS` is 30 fps, half the target. Do not raise it to hide a regression. The in-game overlay is F3, or `/?fps=1`.

The headless lap drives both cars with the AI on Potrerillos (`gradiente`, `tests/race/lap.test.ts`). `/?autodrive=1` is the same controller in the browser. CI (`.github/workflows/ci.yml`) runs lint, format, unit tests, build, and Playwright.

## UI

The interface is a light daytime system. Tokens live in `src/ui/tokens.css` and are named by the job they do. A new custom property needs a `/* job | used by */` comment. Components read those roles, never a raw color. Reuse `src/ui/controls.ts` and the button classes in `src/ui/style.css`. One primary action per screen. The HUD is the exception: driving is the action, so the pause button stays ghost, drawn as a chip so it stays readable over the sky.

World colors and car paint are not UI tokens. The swatch stays on `CarDefinition.color`. The painted panels stay on `CarDefinition.livery`. Copy is Rioplatense, sentence case, with visible focus. No emoji and no em dash.

## Parallel feature backlog

Each item is one agent. Touch only the files listed. Registries, `src/game/app.ts`, `src/race/world.ts`, `src/race/types.ts`, `src/race/contact.ts`, `src/physics`, `src/core`, `src/ui/tokens.css`, `src/ui/style.css`, and the existing e2e specs are shared. Leave them alone. Add a new test file rather than editing `tests/race/lap.test.ts` or `e2e/smoke.spec.ts`.

1. **Costanera circuit.** Scope: a second closed circuit with its own shortcut, width, runoff, and laps. Files: `src/tracks/circuits/costanera.ts`, `tests/tracks/costanera.test.ts`. Done when `listTracks()` includes it, asphalt sits on the centre line, grass sits outside the runoff, and the menu offers the circuit because more than one track exists.
2. **Uspallata circuit.** Scope: a third circuit, tighter and shorter than Potrerillos. Files: `src/tracks/circuits/embeddings.ts`, `tests/tracks/embeddings.test.ts`. Done when length, closure, and the shortcut id are asserted, and the file does not edit `gradiente.ts`.
3. **Rival personalities.** Scope: `agresivo` (late braking, no shortcut) and `creativo` (takes the shortcut, looser line). Files: `src/ai/personalities/agresivo.ts`, `src/ai/personalities/creativo.ts`, `tests/ai/personalities.test.ts`. Done when both ids load, the garage lists them (it already does once `listPersonalities().length > 1`), and a headless run shows the creative car using the shortcut surface at least once.
4. **Garage tuning.** Scope: a setup control that writes a `tune` hook so engine, grip, or tank change before the race. Files: `src/ui/screens/garage.ts`, `src/cars/tuning/setup.ts`. Done when the hook is identity for an untouched car and changes `engineForce` or `energyCapacity` when the player commits a setup. Do not edit `src/cars/apply-tuning.ts`.
5. **Minimap.** Scope: a HUD widget that draws the spline and racer dots on a small canvas. Files: `src/ui/widgets/minimap.ts`. Done when the widget mounts from the registry during a race and reads only `UiFrame`. No new draw calls in Three.js.
6. **Audio polish.** Scope: richer engine pitch, a real CC0 screech if one is added under `public/assets/audio/`, and a clearer music bed. Files: `src/audio/engine-voice.ts`, `src/audio/manager.ts`, `src/audio/clips/*`, `ASSETS.md` for any new file. Done when `AudioBus` method names stay the same and a missing file still falls back without throwing. Do not edit `src/audio/types.ts`.
7. **Skid and dust.** Scope: a render layer for short-lived skid marks and grass dust, fed by `RenderPose.slip` and speed. Files: `src/render/layers/particles.ts`. Done when the layer order is `25`, repeated marks are instanced or capped (a fixed buffer, not unbounded growth), and `e2e/perf.spec.ts` still passes. Do not add shadows or post-processing.
8. **Menu polish.** Scope: the landing layout only. Files: `src/ui/screens/menu.ts`, `src/ui/menu.css` (new, imported by the screen). Done when the primary action is still "Arrancá a correr" and copy stays Rioplatense. Do not restyle the HUD.
9. **Touch controls.** Scope: on-screen pedals and a steer control for a phone. Files: `src/input/devices/touch.ts`. Done when the device priority is `3`, `active` is true only while a finger is down, and keyboard still works with no finger present. Do not edit `keyboard.ts` or `gamepad.ts`.
10. **Ghost and best lap.** Scope: record the player pose during a race and replay the best lap as an `extras` racer. Files: `src/race/hooks/ghost.ts`, `src/ui/widgets/ghost-delta.ts`. Done when the hook imports types only from `src/race/types.ts`, stores samples on `world.extras` or its own module state, and the widget shows a delta. Do not replace `world.racers`.
11. **Contact damage.** Scope: lower `condition` after wall and car hits so the engine force falls, and show it. Files: `src/race/hooks/damage.ts`, `src/ui/widgets/damage.ts`. Done when a wall event reduces that racer's `condition` and the HUD widget shows the loss. Do not edit `contact.ts` or the force scale in `world.ts`.
12. **Championship.** Scope: a points table across several races and a menu entry. Files: `src/championship/standings.ts`, `src/ui/screens/championship.ts`. Done when the screen exports `menu`, calls `updateState` plus `startRace` to launch the next round, and keeps standings in its own module. Do not edit `src/game/state.ts`.
13. **Settings.** Scope: volume, music mute, and pixel-ratio cap. Files: `src/ui/screens/settings.ts`, `src/game/preferences.ts`. Done when the screen is on the menu, changes persist in `localStorage` under the existing key, and the race reads them through `onPreferences`. This item is the only one allowed to edit `preferences.ts`.
14. **Podium.** Scope: a finish screen that ranks every racer and offers a rematch. Files: `src/ui/screens/results.ts` only. Done when finish order, lap times, and the two existing actions ("Otra carrera", "Volver al menú") still work.
15. **Radio commentary.** Scope: a HUD line that reacts to `snapshot.events` (lap, wall, shortcut, finish). Files: `src/ui/widgets/radio.ts`. Done when a new event changes the line once and the widget does not subscribe to anything outside `UiFrame`.
