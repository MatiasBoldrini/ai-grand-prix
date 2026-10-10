import { clamp } from '../core/math.ts'
import type { VehicleState } from '../physics/types.ts'
import type { TrackLocation } from '../tracks/types.ts'

/** Distance from the centre of mass to each axle circle, metres. */
const AXLE_OFFSET = 1.12
/** Radius of an axle circle. Two of them cover the nose, the tail and the sides. */
const BODY_RADIUS = 0.9
const SLOP = 0.02
/** Outward speed that still counts as a shove, not a scrape. */
const BOUNCE_ABOVE = 1.25
const WALL_RESTITUTION = 0.38
const WALL_FRICTION = 0.55
const CAR_RESTITUTION = 0.32
const CAR_FRICTION = 0.5
const CAR_ITERS = 4
/** One contact can yaw the car, not throw it into a spin the tires cannot catch. */
const YAW_STEP = 1.15
/** Longitudinal and vector speed after a wall hit stay under this. */
const SPEED_CEILING = 45
/** Absolute yaw rate left on the car so the next frame cannot catapult it. */
const YAW_CEILING = 4

export interface ContactBody {
  mass: number
  inertia: number
}

const DEFAULT_BODY: ContactBody = { mass: 1160, inertia: 1700 }

interface Sphere {
  ox: number
  oz: number
  x: number
  z: number
}

/**
 * Two axle circles per car. Position is corrected every iteration; the bounce
 * and the scrape run once, on the deepest contact, so a slide along the other
 * car does not get a fresh elastic hit every pass.
 * Returns true when the cars overlapped.
 */
export function separateCars(
  a: VehicleState,
  b: VehicleState,
  bodyA: ContactBody = DEFAULT_BODY,
  bodyB: ContactBody = DEFAULT_BODY,
): boolean {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const dist = Math.hypot(dx, dz)
  if (dist >= 1e-4 && !hardImpact(a, b, dx, dz, dist)) {
    return legacySeparate(a, b, dx, dz, dist)
  }

  const reach = AXLE_OFFSET * 2 + BODY_RADIUS * 2
  if (dist >= reach) return false

  const yawA = a.yawRate
  const yawB = b.yawRate
  let hit = false
  let bounced = false
  let hardHit = false
  for (let iter = 0; iter < CAR_ITERS; iter += 1) {
    const pair = deepestPair(a, b)
    if (!pair) break
    hit = true
    const kind = separatePair(a, b, pair, bodyA, bodyB, !bounced)
    if (kind === 'hard') hardHit = true
    if (kind !== 'none') bounced = true
  }
  if (hit) {
    limitYaw(a, yawA, hardHit ? YAW_STEP : 0.45)
    limitYaw(b, yawB, hardHit ? YAW_STEP : 0.45)
    syncSpeed(a)
    syncSpeed(b)
  }
  return hit
}

/**
 * Keep the body inside the wall. A hard hit bounces, yaws and scrubs speed.
 * A car already sliding on the barrier only loses the outward component, so
 * the same contact cannot multiply the velocity away frame after frame.
 * Returns true on a hit.
 */
export function collideWall(
  state: VehicleState,
  location: TrackLocation,
  runoff: number,
  body: ContactBody = DEFAULT_BODY,
): boolean {
  const wall = location.width / 2 + runoff
  const cgPen = Math.abs(location.lateral) - wall
  if (cgPen <= SLOP) return false

  const side = Math.sign(location.lateral) || 1
  const rightX = Math.cos(location.heading)
  const rightZ = -Math.sin(location.heading)
  const nx = rightX * side
  const nz = rightZ * side
  const push = cgPen - SLOP
  state.x -= nx * push
  state.z -= nz * push

  const fx = Math.sin(state.yaw)
  const fz = Math.cos(state.yaw)
  const noseOut = (fx * rightX + fz * rightZ) * side
  const lever =
    Math.abs(noseOut) > 0.18
      ? Math.sign(noseOut) * AXLE_OFFSET * Math.min(1, Math.abs(noseOut) * 2)
      : 0
  const ox = fx * lever + nx * BODY_RADIUS
  const oz = fz * lever + nz * BODY_RADIUS
  const preSpeed = Math.hypot(state.vx, state.vz)
  const [px, pz] = pointVelocity(state, ox, oz)
  const vOut = px * nx + pz * nz
  const yawBefore = state.yawRate
  if (vOut > 0) {
    const hard = vOut > BOUNCE_ABOVE
    const e = hard ? WALL_RESTITUTION : 0
    const mu = hard ? WALL_FRICTION : WALL_FRICTION * 0.15
    const rot = rotationalInv(ox, oz, nx, nz, body)
    const j = (-(1 + e) * vOut) / rot.inv
    applyImpulse(state, ox, oz, j * nx, j * nz, body)
    scrape(state, ox, oz, nx, nz, j, mu, body)
    limitYaw(state, yawBefore, hard ? 0.7 : 0.28)
  }
  state.yawRate = clamp(state.yawRate, -YAW_CEILING, YAW_CEILING)
  capSpeed(state, Math.min(preSpeed, SPEED_CEILING))
  syncSpeed(state)
  return true
}

interface Pair {
  a: Sphere
  b: Sphere
  overlap: number
  nx: number
  nz: number
}

function deepestPair(a: VehicleState, b: VehicleState): Pair | null {
  const left = spheres(a)
  const right = spheres(b)
  let best: Pair | null = null
  for (const sa of left) {
    for (const sb of right) {
      const dx = sb.x - sa.x
      const dz = sb.z - sa.z
      const dist = Math.hypot(dx, dz)
      const minDist = BODY_RADIUS * 2
      if (dist >= minDist) continue
      const overlap = minDist - dist
      if (best && overlap <= best.overlap) continue
      let nx = 1
      let nz = 0
      if (dist >= 1e-6) {
        nx = dx / dist
        nz = dz / dist
      } else {
        const gx = b.x - a.x
        const gz = b.z - a.z
        const gap = Math.hypot(gx, gz)
        if (gap >= 1e-6) {
          nx = gx / gap
          nz = gz / gap
        }
      }
      best = { a: sa, b: sb, overlap, nx, nz }
    }
  }
  return best
}

function separatePair(
  a: VehicleState,
  b: VehicleState,
  pair: Pair,
  bodyA: ContactBody,
  bodyB: ContactBody,
  withVelocity: boolean,
): 'none' | 'rub' | 'hard' {
  const { nx, nz, overlap } = pair
  const invA = 1 / Math.max(bodyA.mass, 1)
  const invB = 1 / Math.max(bodyB.mass, 1)
  const share = invA + invB
  a.x -= nx * overlap * (invA / share)
  a.z -= nz * overlap * (invA / share)
  b.x += nx * overlap * (invB / share)
  b.z += nz * overlap * (invB / share)

  if (!withVelocity) return 'rub'
  const oxA = pair.a.ox + nx * BODY_RADIUS
  const ozA = pair.a.oz + nz * BODY_RADIUS
  const oxB = pair.b.ox - nx * BODY_RADIUS
  const ozB = pair.b.oz - nz * BODY_RADIUS
  const [vax, vaz] = pointVelocity(a, oxA, ozA)
  const [vbx, vbz] = pointVelocity(b, oxB, ozB)
  const reln = (vbx - vax) * nx + (vbz - vaz) * nz
  const tx = -nz
  const tz = nx
  const relt = (vbx - vax) * tx + (vbz - vaz) * tz
  const approaching = Math.max(0, -reln)
  const slip = Math.abs(relt)
  // Matched-pace side-by-side racing only needs to be pushed apart.
  if (approaching <= 0.45 && slip < 7) return 'rub'

  const hard = approaching > 3.2
  const e = hard ? CAR_RESTITUTION : 0
  const rotA = rotationalInv(oxA, ozA, nx, nz, bodyA)
  const rotB = rotationalInv(oxB, ozB, nx, nz, bodyB)
  const inv = rotA.inv + rotB.inv
  const j = approaching > 0 ? (-(1 + e) * reln) / inv : 0
  if (j !== 0) {
    applyImpulse(a, oxA, ozA, -j * nx, -j * nz, bodyA)
    applyImpulse(b, oxB, ozB, j * nx, j * nz, bodyB)
  }
  const reduced = 1 / inv
  const mu = hard ? CAR_FRICTION : 0.55
  const normalMag = Math.max(Math.abs(j), slip > 7 ? Math.min(slip, 14) * reduced * 0.22 : 0)
  scrapePair(a, b, oxA, ozA, oxB, ozB, nx, nz, normalMag, mu, bodyA, bodyB)
  return hard ? 'hard' : 'rub'
}

function scrape(
  state: VehicleState,
  ox: number,
  oz: number,
  nx: number,
  nz: number,
  j: number,
  mu: number,
  body: ContactBody,
): void {
  const tx = -nz
  const tz = nx
  const [px, pz] = pointVelocity(state, ox, oz)
  const vTan = px * tx + pz * tz
  const rot = rotationalInv(ox, oz, tx, tz, body)
  let jt = -vTan / rot.inv
  const limit = mu * Math.abs(j)
  jt = clamp(jt, -limit, limit)
  applyImpulse(state, ox, oz, jt * tx, jt * tz, body)
}

function scrapePair(
  a: VehicleState,
  b: VehicleState,
  oxA: number,
  ozA: number,
  oxB: number,
  ozB: number,
  nx: number,
  nz: number,
  j: number,
  mu: number,
  bodyA: ContactBody,
  bodyB: ContactBody,
): void {
  const tx = -nz
  const tz = nx
  const [vax, vaz] = pointVelocity(a, oxA, ozA)
  const [vbx, vbz] = pointVelocity(b, oxB, ozB)
  const relt = (vbx - vax) * tx + (vbz - vaz) * tz
  const inv =
    rotationalInv(oxA, ozA, tx, tz, bodyA).inv + rotationalInv(oxB, ozB, tx, tz, bodyB).inv
  let jt = -relt / inv
  const limit = mu * Math.abs(j)
  jt = clamp(jt, -limit, limit)
  applyImpulse(a, oxA, ozA, -jt * tx, -jt * tz, bodyA)
  applyImpulse(b, oxB, ozB, jt * tx, jt * tz, bodyB)
}

function spheres(state: VehicleState): Sphere[] {
  const fx = Math.sin(state.yaw)
  const fz = Math.cos(state.yaw)
  return [AXLE_OFFSET, -AXLE_OFFSET].map((offset) => {
    const ox = fx * offset
    const oz = fz * offset
    return { ox, oz, x: state.x + ox, z: state.z + oz }
  })
}

function pointVelocity(state: VehicleState, ox: number, oz: number): [number, number] {
  return [state.vx + state.yawRate * oz, state.vz - state.yawRate * ox]
}

function rotationalInv(
  ox: number,
  oz: number,
  nx: number,
  nz: number,
  body: ContactBody,
): { inv: number; rn: number } {
  const rn = oz * nx - ox * nz
  const inv = 1 / Math.max(body.mass, 1) + (rn * rn) / Math.max(body.inertia, 1)
  return { inv, rn }
}

function applyImpulse(
  state: VehicleState,
  ox: number,
  oz: number,
  ix: number,
  iz: number,
  body: ContactBody,
): void {
  state.vx += ix / Math.max(body.mass, 1)
  state.vz += iz / Math.max(body.mass, 1)
  state.yawRate += (oz * ix - ox * iz) / Math.max(body.inertia, 1)
}

/** Racing-line rubs stay soft so two cars can run together without spinning out. */
const LEGACY_REACH = 2.3

function hardImpact(
  a: VehicleState,
  b: VehicleState,
  dx: number,
  dz: number,
  dist: number,
): boolean {
  const nx = dx / dist
  const nz = dz / dist
  const reln = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz
  const relt = (b.vx - a.vx) * -nz + (b.vz - a.vz) * nx
  if (-reln > 3.2) return true
  return dist < LEGACY_REACH && Math.abs(relt) > 8
}

function legacySeparate(
  a: VehicleState,
  b: VehicleState,
  dx: number,
  dz: number,
  dist: number,
): boolean {
  if (dist >= LEGACY_REACH || dist < 1e-4) return false
  const nx = dx / dist
  const nz = dz / dist
  const overlap = LEGACY_REACH - dist
  a.x -= nx * overlap * 0.5
  a.z -= nz * overlap * 0.5
  b.x += nx * overlap * 0.5
  b.z += nz * overlap * 0.5
  const closing = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz
  if (closing < 0) {
    const impulse = (-1.12 * closing) / 2
    a.vx -= impulse * nx
    a.vz -= impulse * nz
    b.vx += impulse * nx
    b.vz += impulse * nz
  }
  syncSpeed(a)
  syncSpeed(b)
  return true
}

function syncSpeed(state: VehicleState): void {
  state.speed = state.vx * Math.sin(state.yaw) + state.vz * Math.cos(state.yaw)
}

/** A wall hit may reverse the car. It may not leave it faster than it arrived. */
function capSpeed(state: VehicleState, cap: number): void {
  const mag = Math.hypot(state.vx, state.vz)
  if (mag <= cap || mag < 1e-8) return
  const scale = cap / mag
  state.vx *= scale
  state.vz *= scale
}

function limitYaw(state: VehicleState, before: number, step = YAW_STEP): void {
  const delta = state.yawRate - before
  if (Math.abs(delta) <= step) return
  state.yawRate = before + Math.sign(delta) * step
}
