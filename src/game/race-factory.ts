import { getPersonality } from '../ai/registry.ts'
import { getCar, listCars } from '../cars/registry.ts'
import type { ControllerKind } from '../race/types.ts'
import { createRace } from '../race/world.ts'
import type { RaceWorld } from '../race/types.ts'
import { getTrack } from '../tracks/registry.ts'
import type { GameState } from './state.ts'

export function raceFromState(state: GameState, playerController: ControllerKind): RaceWorld {
  const player = getCar(state.carId)
  const rival = listCars().find((car) => car.id !== player.id) ?? player
  return createRace({
    track: getTrack(state.trackId),
    player,
    rival,
    personality: getPersonality(state.personalityId),
    playerController,
  })
}
