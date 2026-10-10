import { getGameState } from '../../game/state.ts'
import type { VehicleParams } from '../../physics/types.ts'

/**
 * Player setup chosen in the garage. Stock is a true no-op so an untouched
 * car stays on the stat map. Any other bias trades engine, grip, or tank.
 * It follows whichever car is selected when the race is built, so a reload
 * cannot hand the setup to the rival.
 */

export const SETUP_IDS = ['stock', 'engine', 'grip', 'tank'] as const

export type SetupId = (typeof SETUP_IDS)[number]

export interface SetupEffect {
  /** engineForce relative to the untuned car. 0 means no change. */
  engine: number
  /** muRear relative to the untuned car. */
  grip: number
  /** energyCapacity relative to the untuned car. */
  tank: number
}

const STORAGE_KEY = 'agp-garage-setup'

let committed: SetupId = 'stock'

export function readSetup(): SetupId {
  return committed
}

/** Remember the setup. Stock clears the effect but keeps the choice. */
export function commitSetup(bias: SetupId): void {
  committed = bias
  persist()
}

/** Re-read localStorage. Used on boot and by tests that simulate a reload. */
export function restoreSetup(): void {
  committed = load()
}

export function tune(params: VehicleParams, carId: string): VehicleParams {
  if (committed === 'stock' || carId !== getGameState().carId) return params
  return applySetup(params, committed)
}

export function applySetup(params: VehicleParams, bias: SetupId): VehicleParams {
  if (bias === 'stock') return params
  return withBias(params, bias)
}

/** Percent deltas the garage prints. Rounded so +14% stays stable. */
export function setupEffect(params: VehicleParams, bias: SetupId): SetupEffect {
  const tuned = applySetup(params, bias)
  return {
    engine: percentDelta(tuned.engineForce, params.engineForce),
    grip: percentDelta(tuned.muRear, params.muRear),
    tank: percentDelta(tuned.energyCapacity, params.energyCapacity),
  }
}

/** Garage label for a delta. Zero reads as "igual". */
export function formatSetupDelta(percent: number): string {
  if (!Number.isFinite(percent) || percent === 0) return 'igual'
  return percent > 0 ? `+${percent}%` : `${percent}%`
}

function withBias(params: VehicleParams, bias: Exclude<SetupId, 'stock'>): VehicleParams {
  switch (bias) {
    case 'engine':
      // More push down the straight, a shorter tank that also burns faster.
      return {
        ...params,
        engineForce: params.engineForce * 1.14,
        maxSpeed: params.maxSpeed * 1.05,
        energyCapacity: params.energyCapacity * 0.78,
        energyRate: params.energyRate * 1.1,
      }
    case 'grip':
      // Stickier tires and a calmer rear, paid for with a little engine.
      return {
        ...params,
        engineForce: params.engineForce * 0.92,
        muFront: params.muFront * 1.1,
        muRear: params.muRear * 1.1,
        frontCorner: params.frontCorner * 1.08,
        rearCorner: params.rearCorner * 1.08,
        yawDamp: params.yawDamp * 1.06,
        hallucination: params.hallucination * 0.85,
      }
    case 'tank':
      // A larger, slower-burning tank. The straight is a bit shorter.
      return {
        ...params,
        engineForce: params.engineForce * 0.9,
        maxSpeed: params.maxSpeed * 0.97,
        energyCapacity: params.energyCapacity * 1.35,
        energyRate: params.energyRate * 0.82,
      }
  }
}

function percentDelta(next: number, base: number): number {
  if (!(base > 0) || !Number.isFinite(next)) return 0
  return Math.round((next / base - 1) * 100)
}

function persist(): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify({ bias: committed }))
  } catch {
    // Private mode can reject storage. The in-memory setup still applies.
  }
}

function load(): SetupId {
  try {
    return decode(storage()?.getItem(STORAGE_KEY) ?? null)
  } catch {
    return 'stock'
  }
}

function decode(raw: string | null): SetupId {
  if (!raw) return 'stock'
  const parsed = JSON.parse(raw) as { bias?: unknown }
  return isSetupId(parsed.bias) ? parsed.bias : 'stock'
}

function isSetupId(value: unknown): value is SetupId {
  return typeof value === 'string' && (SETUP_IDS as readonly string[]).includes(value)
}

function storage(): Storage | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

restoreSetup()
