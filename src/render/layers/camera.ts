import { PerspectiveCamera, Vector3 } from 'three'
import { clamp } from '../../core/math.ts'
import { advanceSharedLook, resetLook } from '../../input/mouse-look.ts'
import { trackBounds } from '../../tracks/spline.ts'
import type { RenderContext, RenderFrame, RenderLayer } from '../types.ts'

const desired = new Vector3()
const look = new Vector3()
const lookPoint = new Vector3()
let camera: PerspectiveCamera | null = null
let lastMode = ''
let trackedSpeed = 0
let speedReady = false

const CHASE_BACK = 8.2
const CHASE_HEIGHT = 3.15
const CHASE_LOOK_AHEAD = 8
const CHASE_LOOK_HEIGHT = 1.1

export interface ChaseAim {
  x: number
  y: number
  z: number
  lookX: number
  lookY: number
  lookZ: number
}

/** Orbit around the car. Zero look yaw and pitch is the bumper view. */
export function chaseAim(
  carX: number,
  carZ: number,
  carYaw: number,
  lookYaw: number,
  lookPitch: number,
): ChaseAim {
  const aim = carYaw + lookYaw
  const pitch = clamp(lookPitch, -0.34, 0.58)
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)
  const sinA = Math.sin(aim)
  const cosA = Math.cos(aim)
  return {
    x: carX - sinA * CHASE_BACK * cosP,
    y: CHASE_HEIGHT + sinP * 4.4,
    z: carZ - cosA * CHASE_BACK * cosP,
    lookX: carX + sinA * CHASE_LOOK_AHEAD * Math.cos(pitch * 0.45),
    lookY: CHASE_LOOK_HEIGHT + sinP * 7,
    lookZ: carZ + cosA * CHASE_LOOK_AHEAD * Math.cos(pitch * 0.45),
  }
}

/** First sample is zero so a race start does not look like a launch. */
export function chaseAccel(speed: number, dt: number): number {
  if (!speedReady || !(dt > 0) || !Number.isFinite(speed)) {
    trackedSpeed = Number.isFinite(speed) ? speed : 0
    speedReady = true
    return 0
  }
  const accel = (speed - trackedSpeed) / dt
  trackedSpeed = speed
  return Number.isFinite(accel) ? accel : 0
}

export function resetChaseAccel(): void {
  speedReady = false
  trackedSpeed = 0
}

export const layer: RenderLayer = {
  id: 'camera',
  order: 40,
  setup(ctx: RenderContext) {
    camera = ctx.camera
    camera.fov = 68
    camera.near = 0.1
    camera.far = 480
    camera.position.set(0, 30, 40)
    camera.updateProjectionMatrix()
  },
  update(frame: RenderFrame) {
    if (!camera) return
    if (frame.mode === 'menu') {
      resetLook()
      resetChaseAccel()
      orbit(frame)
    } else chase(frame)
    lastMode = frame.mode
  },
  dispose() {
    camera = null
    lastMode = ''
    resetLook()
    resetChaseAccel()
  },
}

function orbit(frame: RenderFrame): void {
  if (!camera) return
  const bounds = trackBounds(frame.track)
  const angle = frame.time * 0.12
  const distance = bounds.radius + 48
  camera.position.set(
    bounds.centerX + Math.sin(angle) * distance,
    36,
    bounds.centerZ + Math.cos(angle) * distance,
  )
  camera.lookAt(bounds.centerX, 0, bounds.centerZ)
  setFov(62)
}

function chase(frame: RenderFrame): void {
  if (!camera) return
  const follow = frame.poses.find((pose) => pose.id === 'player') ?? frame.poses[0]
  if (!follow) return
  const accel = chaseAccel(follow.speed, frame.dt)
  const gaze = advanceSharedLook(frame.dt, accel)
  const aim = chaseAim(follow.x, follow.z, follow.yaw, gaze.yaw, gaze.pitch)
  desired.set(aim.x, aim.y, aim.z)
  const activity = clamp((Math.abs(gaze.yaw) + Math.abs(gaze.pitch)) / 0.35, 0, 1)
  const rate = 5 + activity * 9
  const blend = lastMode !== 'race' ? 1 : 1 - Math.exp(-rate * Math.max(frame.dt, 0))
  camera.position.lerp(desired, blend)
  look.set(aim.lookX, aim.lookY, aim.lookZ)
  lookPoint.lerp(look, blend)
  camera.lookAt(lookPoint)
  setFov(68 + clamp(follow.speed, 0, 52) * 0.2)
}

function setFov(fov: number): void {
  if (!camera || Math.abs(camera.fov - fov) < 0.2) return
  camera.fov = fov
  camera.updateProjectionMatrix()
}
