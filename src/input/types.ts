import type { VehicleInput } from '../physics/types.ts'

export interface DeviceSample {
  active: boolean
  throttle: number
  brake: number
  steer: number
  pauseEdge: boolean
  fpsEdge: boolean
  respawnEdge: boolean
}

export interface InputDevice {
  id: string
  /** Higher priority wins when several devices claim the pedals. */
  priority: number
  poll(): DeviceSample
  mount?(parent: HTMLElement): void
  unmount?(): void
}

export interface PolledInput {
  vehicle: VehicleInput
  pauseEdge: boolean
  fpsEdge: boolean
  respawnEdge: boolean
}

export const IDLE_SAMPLE: DeviceSample = {
  active: false,
  throttle: 0,
  brake: 0,
  steer: 0,
  pauseEdge: false,
  fpsEdge: false,
  respawnEdge: false,
}
