import { createVehicleState } from '../../physics/vehicle.ts'
import { placeOnTrack } from '../../tracks/spline.ts'
import type { RaceHook, RaceWorld, Racer } from '../types.ts'

/**
 * Formation length. The clock in `stepRace` advances after hooks, so holding
 * `world.time` at `-dt` keeps the lap timer on zero until the lights go out.
 */
export const START_HOLD_S = 3

/** How long "¡ya!" stays up after the lights go out. */
export const START_GO_S = 0.8

/**
 * Spawn slot from `createRace`: s = 10, player at -2.3 m, rival at +2.3 m.
 * Duplicated here because a hook cannot import `world.ts` (registry cycle).
 */
const GRID_S = 10
const PLAYER_LATERAL = -2.3
const RIVAL_LATERAL = 2.3

/** One physics step from the grid stays well inside this. A placed test car does not. */
const GRID_REACH = 2.5

const SPAWN_GRACE = 0.6

export type LightsLabel = '' | '3' | '2' | '1' | '¡ya!'

export interface StartLights {
  /** Cars were pinned back to the grid on the step that published this. */
  frozen: boolean
  /** Red lamps that are on. Zero when the lights go out. */
  lit: 0 | 1 | 2 | 3
  label: LightsLabel
  /** Bumps once per new lamp, including lights-out. */
  cue: number
}

interface Session {
  phase: 'hold' | 'go' | 'done'
  held: number
}

const BLANK: StartLights = { frozen: false, lit: 0, label: '', cue: 0 }

let sessions = new WeakMap<RaceWorld, Session>()
let active: RaceWorld | null = null
let published: StartLights = { ...BLANK }

/**
 * `countdown` sorts before `damage` and `ghost`, so the grid is restored
 * before those hooks observe the step.
 */
export const hook: RaceHook = {
  id: 'countdown',
  afterStep(world, dt) {
    stepLights(world, dt)
  },
}

export function readStartLights(): StartLights {
  return { ...published }
}

/** Drops formation state. Tests use this so races do not share a countdown. */
export function resetStartLights(): void {
  sessions = new WeakMap()
  active = null
  published = { ...BLANK }
}

function stepLights(world: RaceWorld, dt: number): void {
  let session = sessions.get(world)
  if (!session) {
    session = { phase: isFormation(world) ? 'hold' : 'done', held: 0 }
    sessions.set(world, session)
  }

  if (session.phase === 'done') {
    if (active === world && published.label !== '') publish(world, blankView())
    return
  }

  if (session.phase === 'go') {
    if (world.time + 1e-9 >= START_GO_S) {
      session.phase = 'done'
      publish(world, blankView())
      return
    }
    publish(world, { frozen: false, lit: 0, label: '¡ya!' })
    return
  }

  if (!Number.isFinite(dt) || dt <= 0) return

  for (const racer of world.racers) pinRacer(world, racer)
  world.events.length = 0
  // `stepRace` adds `dt` after every hook. Cancelling it holds the lap clock at 0.
  world.time = -dt
  session.held += dt

  if (session.held + 1e-4 >= START_HOLD_S) {
    session.phase = 'go'
    publish(world, { frozen: true, lit: 0, label: '¡ya!' })
    return
  }

  publish(world, viewForHeld(session.held))
}

function isFormation(world: RaceWorld): boolean {
  if (!(world.time <= 1e-6)) return false
  if (world.racers.length === 0) return false
  return world.racers.every((racer) => onGrid(world, racer))
}

function onGrid(world: RaceWorld, racer: Racer): boolean {
  const pose = placeOnTrack(world.track, GRID_S, lateralOf(racer))
  const distance = Math.hypot(racer.vehicle.x - pose.x, racer.vehicle.z - pose.z)
  return (
    distance <= GRID_REACH &&
    Math.abs(racer.lastS - GRID_S) <= GRID_REACH &&
    racer.odometer <= GRID_REACH &&
    racer.lap === 0 &&
    !racer.finished
  )
}

function pinRacer(world: RaceWorld, racer: Racer): void {
  const pose = placeOnTrack(world.track, GRID_S, lateralOf(racer))
  racer.vehicle = createVehicleState(pose.x, pose.z, pose.yaw, 0)
  racer.energy = racer.energyCapacity
  racer.lastS = GRID_S
  racer.nextGate = 1
  racer.lap = 0
  racer.lapTimes.length = 0
  racer.sectorTimes.length = 0
  racer.lapStartedAt = 0
  racer.odometer = 0
  racer.finished = false
  racer.finishTime = null
  racer.surface = 'asphalt'
  racer.stuck = 0
  racer.grace = SPAWN_GRACE
  racer.wallCooldown = 0
  racer.carCooldown = 0
}

function lateralOf(racer: Racer): number {
  return racer.isPlayer ? PLAYER_LATERAL : RIVAL_LATERAL
}

function viewForHeld(held: number): Omit<StartLights, 'cue'> {
  if (held < 1) return { frozen: true, lit: 1, label: '3' }
  if (held < 2) return { frozen: true, lit: 2, label: '2' }
  return { frozen: true, lit: 3, label: '1' }
}

function blankView(): Omit<StartLights, 'cue'> {
  return { frozen: false, lit: 0, label: '' }
}

function publish(world: RaceWorld, next: Omit<StartLights, 'cue'>): void {
  const cue =
    next.label !== '' && next.label !== published.label ? published.cue + 1 : published.cue
  published = { ...next, cue }
  active = world
}
