import type { VehicleState } from '../physics/types.ts'
import type { TrackLocation } from '../tracks/types.ts'

const CAR_RADIUS = 1.15

/** Equal-mass push. Returns true when the cars overlapped. */
export function separateCars(a: VehicleState, b: VehicleState): boolean {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const dist = Math.hypot(dx, dz)
  const min = CAR_RADIUS * 2
  if (dist >= min || dist < 1e-4) return false
  const nx = dx / dist
  const nz = dz / dist
  const overlap = min - dist
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
  return true
}

/** Keep the car inside the wall. Returns true on a hit. */
export function collideWall(state: VehicleState, location: TrackLocation, runoff: number): boolean {
  const limit = location.width / 2 + runoff
  if (Math.abs(location.lateral) <= limit) return false
  const side = Math.sign(location.lateral) || 1
  const rx = Math.cos(location.heading)
  const rz = -Math.sin(location.heading)
  const overflow = Math.abs(location.lateral) - limit
  state.x -= rx * side * overflow
  state.z -= rz * side * overflow
  const vLat = state.vx * rx + state.vz * rz
  if (vLat * side > 0) {
    state.vx -= rx * vLat * side * 1.15
    state.vz -= rz * vLat * side * 1.15
  }
  state.vx *= 0.76
  state.vz *= 0.76
  state.yawRate *= 0.4
  return true
}
