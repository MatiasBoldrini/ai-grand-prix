import { clamp } from '../core/math.ts'
import type { VehicleInput, VehicleParams, VehicleState } from './types.ts'

const GRAVITY = 9.81
const SUBSTEPS = 4

export function createVehicleState(x: number, z: number, yaw: number, speed = 0): VehicleState {
  return {
    x,
    z,
    yaw,
    vx: Math.sin(yaw) * speed,
    vz: Math.cos(yaw) * speed,
    yawRate: 0,
    steer: 0,
    ax: 0,
    speed,
    slipFront: 0,
    slipRear: 0,
  }
}

/**
 * One fixed tick of a bicycle model with a linear tire, friction-circle
 * saturation, longitudinal weight transfer and a rear-slide "hallucination".
 * Pure: same state + input + dt => same next state. No wall clock, no RNG.
 */
export function stepVehicle(
  state: VehicleState,
  input: VehicleInput,
  params: VehicleParams,
  surfaceMu: number,
  dt: number,
): VehicleState {
  const throttle = clamp(input.throttle, 0, 1)
  const brake = clamp(input.brake, 0, 1)
  const steer = clamp(input.steer, -1, 1)
  const subDt = dt / SUBSTEPS
  let next = state
  for (let i = 0; i < SUBSTEPS; i += 1) {
    next = stepOnce(next, throttle, brake, steer, params, surfaceMu, subDt)
  }
  return next
}

function stepOnce(
  state: VehicleState,
  throttle: number,
  brake: number,
  steerInput: number,
  params: VehicleParams,
  surfaceMu: number,
  dt: number,
): VehicleState {
  const speedScale = 1 / (1 + Math.abs(state.speed) * 0.012)
  const steerTarget = steerInput * params.maxSteer * (0.45 + 0.55 * speedScale)
  const steer = moveTowards(state.steer, steerTarget, params.steerSpeed * dt)

  const fx = Math.sin(state.yaw)
  const fz = Math.cos(state.yaw)
  const rx = Math.cos(state.yaw)
  const rz = -Math.sin(state.yaw)

  const vLong = state.vx * fx + state.vz * fz
  const vLat = state.vx * rx + state.vz * rz
  const b = params.cgToFront
  const c = params.cgToRear
  const wheelbase = b + c
  const weight = params.mass * GRAVITY

  let loadFront = (weight * c) / wheelbase - (params.mass * state.ax * params.cgHeight) / wheelbase
  loadFront = clamp(loadFront, weight * 0.18, weight * 0.82)
  const loadRear = weight - loadFront

  const muFront = params.muFront * surfaceMu
  const muRear = params.muRear * surfaceMu
  const peakFront = Math.max(1, muFront * loadFront)
  const peakRear = Math.max(1, muRear * loadRear)

  const slipFront = slipAngle(vLat + state.yawRate * b, vLong) - steer
  const slipRear = slipAngle(vLat - state.yawRate * c, vLong)

  let fyFront = -saturate(params.frontCorner * slipFront, peakFront)
  let fyRear = -saturate(params.rearCorner * slipRear, peakRear)

  const speedRatio = Math.max(0, vLong) / Math.max(1, params.maxSpeed)
  const fade = speedRatio >= 1 ? 0 : 1 - speedRatio ** 3
  const drive = throttle * params.engineForce * fade
  const rearShare = clamp(0.5 + params.driveRearBias, 0.35, 0.85)
  const drag = params.drag * surfaceMuDrag(surfaceMu) * vLong * Math.abs(vLong)
  const roll = params.rolling * vLong
  const brakeForce = Math.min(brake * params.brakeForce, (peakFront + peakRear) * 0.92)
  const brakeSign = Math.abs(vLong) < 0.25 ? 0 : Math.sign(vLong)

  let fxFront = drive * (1 - rearShare) - drag * 0.45 - roll * 0.4 - brakeForce * 0.62 * brakeSign
  let fxRear = drive * rearShare - drag * 0.55 - roll * 0.6 - brakeForce * 0.38 * brakeSign

  ;[fxFront, fyFront] = frictionCircle(fxFront, fyFront, peakFront)
  ;[fxRear, fyRear] = frictionCircle(fxRear, fyRear, peakRear)

  const fxSum = fxFront + fxRear
  const fySum = fyFront + fyRear
  const aLong = fxSum / params.mass
  const aLat = fySum / params.mass

  let yawAcc = (fyFront * b - fyRear * c) / params.inertia
  const lowSpeedDamp = Math.abs(vLong) < 3 ? 900 : 0
  yawAcc -= (state.yawRate * (params.yawDamp + lowSpeedDamp)) / params.inertia
  if (params.hallucination > 0 && Math.abs(slipRear) > 0.34 && Math.abs(steer) > 0.12) {
    yawAcc += params.hallucination * Math.sign(steer)
  }

  let vx = state.vx + (fx * aLong + rx * aLat) * dt
  let vz = state.vz + (fz * aLong + rz * aLat) * dt
  let yawRate = state.yawRate + yawAcc * dt

  const vLongAfter = vx * fx + vz * fz
  if (brake > 0.15 && vLong * vLongAfter < 0) {
    vx -= fx * vLongAfter
    vz -= fz * vLongAfter
  }
  if (brake > 0.45 && Math.abs(vLong) < 0.6 && throttle < 0.1) {
    vx *= 0.4
    vz *= 0.4
    yawRate *= 0.5
  }

  return {
    x: state.x + vx * dt,
    z: state.z + vz * dt,
    yaw: state.yaw + yawRate * dt,
    vx,
    vz,
    yawRate,
    steer,
    ax: aLong,
    speed: vx * fx + vz * fz,
    slipFront,
    slipRear,
  }
}

function slipAngle(vLat: number, vLong: number): number {
  return Math.atan2(vLat, Math.abs(vLong) + 1)
}

function saturate(force: number, peak: number): number {
  return peak * Math.tanh(force / peak)
}

function frictionCircle(fx: number, fy: number, peak: number): [number, number] {
  const mag = Math.hypot(fx, fy)
  if (mag <= peak || mag < 1e-6) return [fx, fy]
  const scale = peak / mag
  return [fx * scale, fy * scale]
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  const delta = target - current
  if (Math.abs(delta) <= maxDelta) return target
  return current + Math.sign(delta) * maxDelta
}

/** Grass (mu < 1) adds rolling resistance. Asphalt stays at 1. */
function surfaceMuDrag(surfaceMu: number): number {
  return surfaceMu >= 0.95 ? 1 : 1 + (1 - surfaceMu) * 1.4
}
