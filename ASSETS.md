# Assets

Every binary in `public/assets` is Creative Commons Zero (CC0). Nothing in this folder was drawn or synthesized as original art. The procedural tire noise and the menu pad exist only as a fallback inside `src/audio` when a file fails to decode.

Kenney packs used:

- Racing Kit 2.0: https://kenney.nl/assets/racing-kit
- Interface Sounds: https://kenney.nl/assets/interface-sounds
- Impact Sounds: https://kenney.nl/assets/impact-sounds
- Sci-fi Sounds: https://kenney.nl/assets/sci-fi-sounds

License copies live next to the files in `public/assets/licenses/`.

## Models

Source pack: Kenney Racing Kit, Collada, metre units, Y up. Only the red car is loaded; body paint is recolored at runtime from `CarDefinition.color`.

| File                                       | Original name         | Used for                          |
| ------------------------------------------ | --------------------- | --------------------------------- |
| `public/assets/models/raceCarRed.dae`      | `raceCarRed.dae`      | Player and rival, scaled to 4.4 m |
| `public/assets/models/barrierRed.dae`      | `barrier.dae` (red)   | Instanced walls                   |
| `public/assets/models/lightPostModern.dae` | `lightPostModern.dae` | Instanced lamps                   |
| `public/assets/models/grandStand.dae`      | `grandStand.dae`      | Two stands                        |
| `public/assets/models/flagCheckers.dae`    | `flagCheckers.dae`    | Two flags                         |
| `public/assets/models/pylon.dae`           | `pylon.dae`           | Shortcut cones                    |

`public/favicon.svg` is a two-shape mark (cream square, blue peak) so the tab is not empty. It is not a Kenney file.

## Audio

| File                              | Original name                | Source                                    | Clip id   |
| --------------------------------- | ---------------------------- | ----------------------------------------- | --------- |
| `public/assets/audio/click.ogg`   | `click_001.ogg`              | Kenney Interface Sounds                   | `click`   |
| `public/assets/audio/confirm.ogg` | `confirmation_001.ogg`       | Kenney Interface Sounds                   | `confirm` |
| `public/assets/audio/crash.ogg`   | `impactMetal_medium_000.ogg` | Kenney Impact Sounds                      | `crash`   |
| `public/assets/audio/engine.ogg`  | `spaceEngine_000.ogg`        | Kenney Sci-fi Sounds                      | `engine`  |
| `public/assets/audio/screech.ogg` | `skid.ogg`                   | Landeplage, via Kenney Starter Kit Racing | `screech` |
| `public/assets/audio/music.ogg`   | `pure_raceway_bpm160.ogg`    | MintoDog, Pure Raceway (OpenGameArt)      | `music`   |

`engine.ogg` is a looping sci-fi engine. `src/audio/engine-voice.ts` plays it in four gears: playback rate climbs inside a gear and drops on the upshift, with a quiet octave of the same sample for the top end. If that file fails to decode, the same module falls back to a sine, a saw and a triangle on the same gear curve. A missing file does not throw.

`screech.ogg` is a CC0 tire skid, 3.5 s, looped from a short crossfade so the join does not click. The voice opens a band-passed scream and a low scrub with rear slip, and stays quiet at a standstill. If the file fails to decode, the voice builds a one-second brown-noise loop instead. License: `public/assets/licenses/landeplage-skid.txt`.

`music.ogg` is Pure Raceway by MintoDog, CC0, a loopable 160 BPM racing track (96 s). It replaces the sci-fi drone. The bus high-passes it, adds a little presence around 2.4 kHz, and ducks it during a race so the engine stays in front. If the file fails to decode, the bus synthesizes a four-second minor pad into the same chain. License: `public/assets/licenses/mintodog-pure-raceway.txt`.

## Not fetched

- Quaternius and Poly Pizza. Not downloaded. The Kenney Racing Kit already covers the car and the circuit props.
