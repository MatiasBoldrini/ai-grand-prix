import type { Personality } from '../ai/types.ts'
import type { SurfaceId } from '../physics/surfaces.ts'
import type { VehicleParams, VehicleState } from '../physics/types.ts'
import type { Track } from '../tracks/types.ts'

export type ControllerKind = 'human' | 'ai'

export interface RaceEvent {
  type: 'lap' | 'finish' | 'collision' | 'offtrack' | 'wall' | 'respawn'
  racerId: string
  time: number
}

/** Read-only view for UI, ghosts and widgets. Do not mutate. */
export interface RacerSnapshot {
  id: string
  carId: string
  name: string
  isPlayer: boolean
  color: string
  modelUrl: string
  x: number
  z: number
  yaw: number
  steer: number
  speed: number
  slip: number
  surface: SurfaceId
  lap: number
  lapTimes: number[]
  sectorTimes: number[]
  gate: number
  energy: number
  energyCapacity: number
  condition: number
  finished: boolean
  finishTime: number | null
  position: number
  odometer: number
}

export interface RaceSnapshot {
  trackId: string
  trackName: string
  laps: number
  time: number
  finished: boolean
  racers: RacerSnapshot[]
  extras: RacerSnapshot[]
  events: RaceEvent[]
}

/**
 * Mutable race. Hooks may push `extras`, change `condition`, and read poses.
 * Import this file as a type from a hook so the registry does not cycle.
 */
export interface Racer {
  id: string
  carId: string
  name: string
  isPlayer: boolean
  controller: ControllerKind
  personalityId: string | null
  color: string
  modelUrl: string
  params: VehicleParams
  vehicle: VehicleState
  energy: number
  energyCapacity: number
  energyRate: number
  condition: number
  lastS: number
  nextGate: number
  lap: number
  lapTimes: number[]
  sectorTimes: number[]
  lapStartedAt: number
  odometer: number
  finished: boolean
  finishTime: number | null
  surface: SurfaceId
  stuck: number
  grace: number
  wallCooldown: number
  carCooldown: number
}

export interface RaceWorld {
  track: Track
  laps: number
  time: number
  finished: boolean
  racers: Racer[]
  extras: RacerSnapshot[]
  events: RaceEvent[]
  personality: Personality
}

export interface RaceHook {
  id: string
  afterStep?: (world: RaceWorld, dt: number) => void
}
