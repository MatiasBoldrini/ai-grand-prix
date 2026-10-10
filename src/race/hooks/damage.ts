import { clamp } from '../../core/math.ts'
import type { RaceHook, Racer, RaceWorld } from '../types.ts'

/**
 * Lowest condition that still scales the engine. The race step already
 * clamps force with this floor; stopping here keeps the HUD and the car honest.
 */
export const CONDITION_FLOOR = 0.2

const WALL_BASE = 0.04
const WALL_GAIN = 0.1
const CAR_BASE = 0.025
const CAR_GAIN = 0.15
/** Cars farther apart than this were not the pair that just touched. */
const CAR_REACH = 6

interface BodySample {
  x: number
  z: number
  vx: number
  vz: number
}

/**
 * Pose at the end of the previous step, which is the pose that entered
 * this step's contact solve. Wall and car resolution have already bled
 * the speed by the time the hook runs.
 */
const previous = new Map<string, BodySample>()

/** Deterministic condition lost in one impact. `impact` is metres per second. */
export function contactLoss(kind: 'wall' | 'car', impact: number): number {
  const speed = Number.isFinite(impact) ? Math.max(0, impact) : 0
  if (kind === 'wall') {
    const severity = clamp((speed - 5) / 30, 0, 1)
    return WALL_BASE + WALL_GAIN * severity
  }
  const severity = clamp(speed / 24, 0, 1)
  return CAR_BASE + CAR_GAIN * severity
}

export const hook: RaceHook = {
  id: 'damage',
  afterStep(world) {
    if (world.time === 0) previous.clear()
    for (const event of world.events) {
      if (event.type === 'wall') {
        const racer = findRacer(world, event.racerId)
        if (racer) applyLoss(racer, contactLoss('wall', bodySpeed(racer)))
      } else if (event.type === 'collision') {
        const racer = findRacer(world, event.racerId)
        if (!racer) continue
        const other = nearestOther(world, racer)
        const impact = other ? closingSpeed(racer, other) : bodySpeed(racer)
        const loss = contactLoss('car', impact)
        applyLoss(racer, loss)
        if (other) applyLoss(other, loss)
      }
    }
    for (const racer of world.racers) remember(racer)
  },
}

function applyLoss(racer: Racer, loss: number): void {
  if (!Number.isFinite(loss) || loss <= 0) return
  racer.condition = Math.max(CONDITION_FLOOR, racer.condition - loss)
}

function findRacer(world: RaceWorld, id: string): Racer | undefined {
  for (const racer of world.racers) {
    if (racer.id === id) return racer
  }
  return undefined
}

function nearestOther(world: RaceWorld, racer: Racer): Racer | undefined {
  let best: Racer | undefined
  let bestDistance = CAR_REACH
  for (const other of world.racers) {
    if (other.id === racer.id) continue
    const distance = Math.hypot(
      other.vehicle.x - racer.vehicle.x,
      other.vehicle.z - racer.vehicle.z,
    )
    if (distance < bestDistance) {
      best = other
      bestDistance = distance
    }
  }
  return best
}

function bodySpeed(racer: Racer): number {
  const sample = previous.get(racer.id)
  if (sample) return Math.hypot(sample.vx, sample.vz)
  return Math.hypot(racer.vehicle.vx, racer.vehicle.vz)
}

function closingSpeed(a: Racer, b: Racer): number {
  const aSample = previous.get(a.id)
  const bSample = previous.get(b.id)
  const ax = aSample?.x ?? a.vehicle.x
  const az = aSample?.z ?? a.vehicle.z
  const bx = bSample?.x ?? b.vehicle.x
  const bz = bSample?.z ?? b.vehicle.z
  const avx = aSample?.vx ?? a.vehicle.vx
  const avz = aSample?.vz ?? a.vehicle.vz
  const bvx = bSample?.vx ?? b.vehicle.vx
  const bvz = bSample?.vz ?? b.vehicle.vz
  const dx = bx - ax
  const dz = bz - az
  const dist = Math.hypot(dx, dz)
  if (dist < 1e-4) return Math.hypot(avx - bvx, avz - bvz)
  const nx = dx / dist
  const nz = dz / dist
  return Math.max(0, (avx - bvx) * nx + (avz - bvz) * nz)
}

function remember(racer: Racer): void {
  let sample = previous.get(racer.id)
  if (!sample) {
    sample = { x: 0, z: 0, vx: 0, vz: 0 }
    previous.set(racer.id, sample)
  }
  sample.x = racer.vehicle.x
  sample.z = racer.vehicle.z
  sample.vx = racer.vehicle.vx
  sample.vz = racer.vehicle.vz
}
