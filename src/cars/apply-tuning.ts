import type { VehicleParams } from '../physics/types.ts'

export interface TuningHook {
  (params: VehicleParams, carId: string): VehicleParams
}

interface TuningModule {
  tune?: TuningHook
}

const modules = import.meta.glob<TuningModule>('./tuning/*.ts', { eager: true })

/** Identity until a file in src/cars/tuning exports `tune`. */
export function applyTuning(params: VehicleParams, carId: string): VehicleParams {
  let next = params
  for (const mod of Object.values(modules)) {
    if (mod.tune) next = mod.tune(next, carId)
  }
  return next
}
