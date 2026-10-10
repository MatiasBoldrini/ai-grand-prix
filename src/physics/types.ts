export interface VehicleState {
  x: number
  z: number
  yaw: number
  vx: number
  vz: number
  yawRate: number
  /** Current steered-wheel angle in radians. */
  steer: number
  /** Longitudinal acceleration from the previous substep, used for weight transfer. */
  ax: number
  /** Signed speed along the nose, metres per second. */
  speed: number
  slipFront: number
  slipRear: number
}

export interface VehicleInput {
  /** 0..1 */
  throttle: number
  /** 0..1. Brakes. There is no reverse gear. */
  brake: number
  /** -1 left .. 1 right */
  steer: number
}

/**
 * Tunable vehicle. Cars map AI-style stats onto this struct; the integrator
 * only reads these numbers so a new car is data, not a new solver.
 */
export interface VehicleParams {
  mass: number
  inertia: number
  cgToFront: number
  cgToRear: number
  cgHeight: number
  maxSteer: number
  steerSpeed: number
  engineForce: number
  maxSpeed: number
  brakeForce: number
  drag: number
  rolling: number
  frontCorner: number
  rearCorner: number
  muFront: number
  muRear: number
  yawDamp: number
  /** 0 balanced, higher sends more drive to the rear axle. */
  driveRearBias: number
  /** Extra yaw acceleration when the rear is already sliding and the wheel is turned. */
  hallucination: number
  energyCapacity: number
  energyRate: number
}

export const IDLE_INPUT: VehicleInput = { throttle: 0, brake: 0, steer: 0 }
