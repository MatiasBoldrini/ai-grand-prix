import type { RaceHook, RaceWorld, Racer, RacerSnapshot } from '../types.ts'

/**
 * A pose sample from the player's current lap. Stored in module state because
 * `stepRace` clears `world.extras` at the start of every step.
 */
interface Sample {
  t: number
  dist: number
  x: number
  z: number
  yaw: number
  steer: number
  speed: number
  slip: number
}

interface BestLap {
  lapTime: number
  samples: Sample[]
}

export interface GhostReadout {
  phase: 'recording' | 'comparing'
  /** Seconds the player is behind the best lap. Negative means ahead. */
  delta: number | null
  bestLap: number | null
}

const CAP = 60 * 180
const MIN_SAMPLES = 8
/** Keeps the replayed car beside the recorded line so the two meshes do not occupy one volume. */
const SIDE = 0.55

const buffer: Sample[] = []
const bestByTrack = new Map<string, BestLap>()
const played: Sample = blankSample()
const ghostLaps: number[] = []
const ghostSectors: number[] = []

const ghost: RacerSnapshot = {
  id: 'ghost',
  carId: 'ghost',
  name: 'Tu fantasma',
  isPlayer: false,
  color: '#d5e6f2',
  modelUrl: '',
  x: 0,
  z: 0,
  yaw: 0,
  steer: 0,
  speed: 0,
  slip: 0,
  surface: 'asphalt',
  lap: 0,
  lapTimes: ghostLaps,
  sectorTimes: ghostSectors,
  gate: 0,
  energy: 1,
  energyCapacity: 1,
  condition: 1,
  finished: false,
  finishTime: null,
  position: 0,
  odometer: 0,
}

const readout: GhostReadout = { phase: 'recording', delta: null, bestLap: null }

let count = 0
let dirty = false
let lastTime = -1
let anchorTime = Number.NaN
let anchorOdometer = 0

export const hook: RaceHook = {
  id: 'ghost',
  afterStep(world, dt) {
    stepGhost(world, dt)
  },
}

export function readGhostDelta(): GhostReadout {
  return readout
}

/** Clears recordings. Tests use this so cases do not share a best lap. */
export function resetGhostMemory(): void {
  bestByTrack.clear()
  count = 0
  dirty = false
  lastTime = -1
  anchorTime = Number.NaN
  anchorOdometer = 0
  readout.phase = 'recording'
  readout.delta = null
  readout.bestLap = null
}

function stepGhost(world: RaceWorld, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return
  const player = world.racers.find((racer) => racer.isPlayer)
  if (!player) return

  if (world.time + 1e-4 < lastTime) {
    count = 0
    dirty = false
    anchorTime = Number.NaN
  }

  const lapped = world.events.some((event) => event.type === 'lap' && event.racerId === player.id)
  const respawned = world.events.some(
    (event) => event.type === 'respawn' && event.racerId === player.id,
  )

  // The lap clock has already rolled when the event arrives, so commit the
  // buffer from the lap that just ended before sampling the new one.
  if (lapped) {
    const lapTime = player.lapTimes[player.lapTimes.length - 1]
    if (
      !dirty &&
      lapTime !== undefined &&
      Number.isFinite(lapTime) &&
      lapTime > 0.5 &&
      count >= MIN_SAMPLES
    ) {
      considerBest(world.track.id, lapTime)
    }
    dirty = false
    beginLap(player)
  } else if (player.lapStartedAt !== anchorTime) {
    beginLap(player)
  }

  if (respawned) {
    dirty = true
    count = 0
  }

  if (!dirty && !player.finished) record(player, world.time)
  lastTime = world.time
  if (!player.finished) publish(world, player)
}

function beginLap(player: Racer): void {
  count = 0
  anchorTime = player.lapStartedAt
  anchorOdometer = player.odometer
}

function record(player: Racer, time: number): void {
  if (count >= CAP) {
    dirty = true
    return
  }
  const x = player.vehicle.x
  const z = player.vehicle.z
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(player.lastS)) return
  const t = time - anchorTime
  const previous = count > 0 ? buffer[count - 1] : undefined
  if (previous && t <= previous.t) return
  const sample = slot(count)
  sample.t = t
  sample.dist = player.odometer - anchorOdometer
  sample.x = x
  sample.z = z
  sample.yaw = player.vehicle.yaw
  sample.steer = player.vehicle.steer
  sample.speed = player.vehicle.speed
  sample.slip = Math.max(Math.abs(player.vehicle.slipFront), Math.abs(player.vehicle.slipRear))
  count += 1
}

function considerBest(trackId: string, lapTime: number): void {
  const current = bestByTrack.get(trackId)
  if (current && current.lapTime <= lapTime) return
  const samples: Sample[] = []
  for (let i = 0; i < count; i += 1) {
    const sample = buffer[i]
    if (!sample) return
    const prior = samples[samples.length - 1]
    if (prior && sample.t <= prior.t) return
    samples.push({
      t: sample.t,
      dist: sample.dist,
      x: sample.x,
      z: sample.z,
      yaw: sample.yaw,
      steer: sample.steer,
      speed: sample.speed,
      slip: sample.slip,
    })
  }
  if (!samples[0]) return
  bestByTrack.set(trackId, { lapTime, samples })
}

function publish(world: RaceWorld, player: Racer): void {
  const best = bestByTrack.get(world.track.id)
  readout.bestLap = best?.lapTime ?? null
  if (!best || best.samples.length < 2) {
    readout.phase = 'recording'
    readout.delta = null
    return
  }

  const elapsed = Math.max(0, world.time - player.lapStartedAt)
  const ghostTime = timeAtDist(best.samples, player.odometer - anchorOdometer, best.lapTime)
  readout.phase = 'comparing'
  readout.delta = elapsed - ghostTime

  const end = best.samples[best.samples.length - 1]
  if (!end || elapsed > end.t) return
  if (!poseAt(best.samples, elapsed, played)) return

  const rx = Math.cos(played.yaw)
  const rz = -Math.sin(played.yaw)
  ghost.carId = player.carId
  ghost.modelUrl = player.modelUrl
  ghost.x = played.x + rx * SIDE
  ghost.z = played.z + rz * SIDE
  ghost.yaw = played.yaw
  ghost.steer = played.steer
  ghost.speed = played.speed
  ghost.slip = played.slip
  ghost.energy = player.energyCapacity
  ghost.energyCapacity = player.energyCapacity
  ghost.odometer = played.dist
  dropGhost(world)
  world.extras.push(ghost)
}

function dropGhost(world: RaceWorld): void {
  const index = world.extras.findIndex((extra) => extra.id === 'ghost')
  if (index >= 0) world.extras.splice(index, 1)
}

function poseAt(samples: readonly Sample[], time: number, into: Sample): boolean {
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (!first || !last) return false
  if (time <= first.t) {
    copySample(first, into)
    return true
  }
  if (time > last.t) return false
  let lo = 0
  let hi = samples.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    const sample = samples[mid]
    if (!sample || sample.t < time) lo = mid
    else hi = mid
  }
  const a = samples[lo]
  const b = samples[hi]
  if (!a || !b) return false
  const span = b.t - a.t
  const alpha = span > 1e-6 ? (time - a.t) / span : 0
  into.t = time
  into.dist = a.dist + (b.dist - a.dist) * alpha
  into.x = a.x + (b.x - a.x) * alpha
  into.z = a.z + (b.z - a.z) * alpha
  into.yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * alpha
  into.steer = a.steer + (b.steer - a.steer) * alpha
  into.speed = a.speed + (b.speed - a.speed) * alpha
  into.slip = a.slip + (b.slip - a.slip) * alpha
  return true
}

function timeAtDist(samples: readonly Sample[], dist: number, lapTime: number): number {
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (!first || !last) return 0
  if (dist <= first.dist) return first.t
  if (dist >= last.dist) return lapTime
  let lo = 0
  let hi = samples.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    const sample = samples[mid]
    if (!sample || sample.dist < dist) lo = mid
    else hi = mid
  }
  const a = samples[lo]
  const b = samples[hi]
  if (!a || !b) return first.t
  const span = b.dist - a.dist
  const alpha = span > 1e-6 ? (dist - a.dist) / span : 0
  return a.t + (b.t - a.t) * alpha
}

function slot(index: number): Sample {
  const existing = buffer[index]
  if (existing) return existing
  const created = blankSample()
  buffer[index] = created
  return created
}

function blankSample(): Sample {
  return { t: 0, dist: 0, x: 0, z: 0, yaw: 0, steer: 0, speed: 0, slip: 0 }
}

function copySample(from: Sample, into: Sample): void {
  into.t = from.t
  into.dist = from.dist
  into.x = from.x
  into.z = from.z
  into.yaw = from.yaw
  into.steer = from.steer
  into.speed = from.speed
  into.slip = from.slip
}

function wrapAngle(angle: number): number {
  const tau = Math.PI * 2
  let next = (angle + Math.PI) % tau
  if (next < 0) next += tau
  return next - Math.PI
}
