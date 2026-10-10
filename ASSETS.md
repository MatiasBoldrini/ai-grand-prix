# Assets

Every binary in `public/assets` is Creative Commons Zero (CC0). Nothing in this folder was drawn or synthesized as original art. The tire screech is the one exception: it is generated in Web Audio because no CC0 screech sample was available.

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

`public/favicon.svg` is a two-shape mark (ink square, lime circle) so the tab is not empty. It is not a Kenney file.

## Audio

| File                              | Original name                | Pack             | Clip id   |
| --------------------------------- | ---------------------------- | ---------------- | --------- |
| `public/assets/audio/click.ogg`   | `click_001.ogg`              | Interface Sounds | `click`   |
| `public/assets/audio/confirm.ogg` | `confirmation_001.ogg`       | Interface Sounds | `confirm` |
| `public/assets/audio/crash.ogg`   | `impactMetal_medium_000.ogg` | Impact Sounds    | `crash`   |
| `public/assets/audio/engine.ogg`  | `spaceEngine_000.ogg`        | Sci-fi Sounds    | `engine`  |
| `public/assets/audio/music.ogg`   | `spaceEngineLow_000.ogg`     | Sci-fi Sounds    | `music`   |

`engine.ogg` is a looping sci-fi engine, pitched by RPM in `src/audio/engine-voice.ts`. If that file fails to decode, the same module falls back to a sawtooth oscillator. `music.ogg` is a low drone from the same pack, not a melody. It loops under the menu and the race.

## Not fetched

- Tire screech. Kenney's packs in this set have no tire-screech one-shot. `src/audio/engine-voice.ts` builds a looping noise buffer and opens it with rear slip. A later audio pass can drop a CC0 sample at `public/assets/audio/screech.ogg` and retire the noise buffer.
- Melodic music. Interface, impact, and sci-fi packs do not include a music bed. The drone above is the stand-in. A CC0 loop belongs at `public/assets/audio/music.ogg` with the same clip id `music`.
- Quaternius and Poly Pizza. Not downloaded. The Kenney Racing Kit already covers the car and the circuit props.
