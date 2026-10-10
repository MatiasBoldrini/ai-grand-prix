import { clamp } from '../core/math.ts'
import type { VehicleParams } from '../physics/types.ts'
import type { CarStats } from './types.ts'

/** Map the five public stats onto the integrator. Higher creativity slides more. */
export function paramsFromStats(stats: CarStats): VehicleParams {
  const speed = unit(stats.speed)
  const reasoning = unit(stats.reasoning)
  const creativity = unit(stats.creativity)
  const context = unit(stats.context)
  const cost = unit(stats.cost)
  return {
    mass: 1160,
    inertia: 1900 - creativity * 400,
    cgToFront: 1.22,
    cgToRear: 1.38,
    cgHeight: 0.46,
    maxSteer: 0.46,
    steerSpeed: 3.2,
    engineForce: 7200 + speed * 5400,
    maxSpeed: 38 + speed * 22,
    brakeForce: 15000,
    drag: 1.15,
    rolling: 14,
    frontCorner: 62000 + reasoning * 18000,
    rearCorner: 64000 + reasoning * 12000 - creativity * 16000,
    muFront: 1.15 + reasoning * 0.2,
    muRear: 1.12 + reasoning * 0.18 - creativity * 0.28,
    yawDamp: 2200 - creativity * 900,
    driveRearBias: 0.05 + creativity * 0.2,
    hallucination: creativity * creativity * 2.2,
    energyCapacity: 50 + context * 110,
    energyRate: 0.55 + cost * 1.15,
  }
}

function unit(value: number): number {
  return clamp(value, 0, 100) / 100
}
