import { clamp } from '../core/math.ts'

/** Radians of yaw per pixel at sensitivity 1. A short swipe looks around the car. */
const YAW_PER_PX = 0.0042
/** Radians of pitch per pixel at sensitivity 1. Pitch is tighter than yaw. */
const PITCH_PER_PX = 0.0028
/** How fast the smoothed orbit catches the pointer target. */
const FOLLOW_RATE = 14
/** How fast the orbit eases back behind the car. */
const RETURN_RATE = 2.8

export const LOOK_IDLE_S = 1.5
/** Longitudinal accel (m/s²) that counts as flooring it. */
export const HARD_ACCEL = 7
export const YAW_LIMIT = 2.45
export const PITCH_MIN = -0.34
export const PITCH_MAX = 0.58

export interface LookState {
  targetYaw: number
  targetPitch: number
  yaw: number
  pitch: number
  idle: number
}

export interface LookDebug {
  yaw: number
  pitch: number
  targetYaw: number
  targetPitch: number
  locked: boolean
}

declare global {
  interface Window {
    __AGP_LOOK?: LookDebug
  }
}

export function createLookState(): LookState {
  return { targetYaw: 0, targetPitch: 0, yaw: 0, pitch: 0, idle: LOOK_IDLE_S }
}

/**
 * Pointer right looks right (positive yaw). Pointer up looks up (positive pitch).
 * A zero delta does not refresh the idle timer.
 */
export function applyLookDelta(
  state: LookState,
  dx: number,
  dy: number,
  sensitivity: number,
): LookState {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return state
  if (dx === 0 && dy === 0) return state
  const sens = Number.isFinite(sensitivity) && sensitivity > 0 ? sensitivity : 1
  return {
    ...state,
    idle: 0,
    targetYaw: clamp(state.targetYaw + dx * YAW_PER_PX * sens, -YAW_LIMIT, YAW_LIMIT),
    targetPitch: clamp(state.targetPitch - dy * PITCH_PER_PX * sens, PITCH_MIN, PITCH_MAX),
  }
}

/**
 * Smooths toward the pointer target. After the pointer rests for 1.5 s, or when
 * the car accelerates hard, the target eases back to the bumper.
 */
export function advanceLook(state: LookState, dt: number, accel: number): LookState {
  const raw = Number.isFinite(dt) ? Math.max(dt, 0) : 0
  // A hitch still counts toward the rest timer. The orbit itself only eases a short step.
  const step = Math.min(raw, 0.05)
  let { targetYaw, targetPitch, yaw, pitch, idle } = state
  idle += Math.min(raw, 0.25)
  const hard = Number.isFinite(accel) && accel >= HARD_ACCEL
  if (idle >= LOOK_IDLE_S || hard) {
    const back = 1 - Math.exp(-RETURN_RATE * step)
    targetYaw += (0 - targetYaw) * back
    targetPitch += (0 - targetPitch) * back
    if (Math.abs(targetYaw) < 1e-4) targetYaw = 0
    if (Math.abs(targetPitch) < 1e-4) targetPitch = 0
  }
  const follow = 1 - Math.exp(-FOLLOW_RATE * step)
  yaw += (targetYaw - yaw) * follow
  pitch += (targetPitch - pitch) * follow
  if (Math.abs(yaw) < 1e-4) yaw = 0
  if (Math.abs(pitch) < 1e-4) pitch = 0
  return { targetYaw, targetPitch, yaw, pitch, idle }
}

let state = createLookState()
let locked = false

export function pushLookDelta(dx: number, dy: number, sensitivity: number): void {
  state = applyLookDelta(state, dx, dy, sensitivity)
  publish()
}

export function advanceSharedLook(dt: number, accel: number): LookState {
  state = advanceLook(state, dt, accel)
  publish()
  return state
}

export function resetLook(): void {
  state = createLookState()
  publish()
}

export function setLookLocked(value: boolean): void {
  locked = value
  publish()
}

export function peekLook(): LookState {
  return state
}

function publish(): void {
  if (typeof window === 'undefined') return
  window.__AGP_LOOK = {
    yaw: state.yaw,
    pitch: state.pitch,
    targetYaw: state.targetYaw,
    targetPitch: state.targetPitch,
    locked,
  }
}
