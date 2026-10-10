import { clamp, wrapAngle } from '../core/math.ts'
import type { VehicleInput } from '../physics/types.ts'
import { sampleAt } from '../tracks/spline.ts'
import type { Track } from '../tracks/types.ts'
import type { Personality } from './types.ts'

export interface DriverView {
  personality: Personality
  track: Track
  x: number
  z: number
  yaw: number
  speed: number
  s: number
  lateral: number
}

/** Pure-pursuit driver. Same view always returns the same pedals. */
export function driveAi(view: DriverView): VehicleInput {
  const { personality, track } = view
  const look = personality.lookAhead + Math.abs(view.speed) * personality.lookAheadSpeed
  let aimX = sampleAt(track, view.s + look).x
  let aimZ = sampleAt(track, view.s + look).z
  if (personality.takesShortcuts) {
    const cut = nearestShortcut(view, look)
    if (cut) {
      aimX = cut.x
      aimZ = cut.z
    }
  }
  const desired = Math.atan2(aimX - view.x, aimZ - view.z)
  const err = wrapAngle(desired - view.yaw)
  let steer = clamp(err * personality.steerGain - view.lateral * personality.lineHold, -1, 1)

  const probe = sampleAt(track, view.s + Math.max(12, look * 0.65))
  const radius = 1 / Math.max(Math.abs(probe.curvature), 0.004)
  const cornerSpeed = Math.sqrt(9.81 * radius) * (0.58 + personality.aggression * 0.5)
  const target = Math.min(cornerSpeed, 46)
  let throttle = 1
  let brake = 0
  if (view.speed > target + 2) {
    throttle = 0
    brake = clamp((view.speed - target) / 11, 0.15, 1)
  } else if (view.speed > target) {
    throttle = 0.3
  }
  if (Math.abs(view.lateral) > track.width * 0.42) {
    brake = Math.max(brake, 0.45)
    throttle = Math.min(throttle, 0.35)
    steer = clamp(steer - Math.sign(view.lateral) * 0.45, -1, 1)
  }
  if (Math.abs(err) > 0.85) {
    throttle = Math.min(throttle, 0.25)
    brake = Math.max(brake, 0.25)
  }
  return { throttle, brake, steer }
}

function nearestShortcut(view: DriverView, look: number): { x: number; z: number } | null {
  let best: { x: number; z: number; distance: number } | null = null
  for (const shortcut of view.track.shortcuts) {
    const x = shortcut.x0 + (shortcut.x1 - shortcut.x0) * 0.65
    const z = shortcut.z0 + (shortcut.z1 - shortcut.z0) * 0.65
    const distance = Math.hypot(x - view.x, z - view.z)
    if (distance < look && distance > 8 && (!best || distance < best.distance)) {
      best = { x, z, distance }
    }
  }
  return best
}
