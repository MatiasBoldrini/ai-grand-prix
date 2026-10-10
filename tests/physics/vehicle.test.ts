import { describe, expect, it } from 'vitest'
import { paramsFromStats } from '../../src/cars/params.ts'
import type { CarStats } from '../../src/cars/types.ts'
import { createVehicleState, stepVehicle } from '../../src/physics/vehicle.ts'
import type { VehicleInput } from '../../src/physics/types.ts'

const balanced: CarStats = {
  speed: 70,
  context: 70,
  reasoning: 70,
  creativity: 20,
  cost: 40,
}

const dt = 1 / 60

function run(input: VehicleInput, seconds: number, surfaceMu = 1, speed = 0) {
  const params = paramsFromStats(balanced)
  let state = createVehicleState(0, 0, 0, speed)
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    state = stepVehicle(state, input, params, surfaceMu, dt)
  }
  return state
}

describe('vehicle', () => {
  it('accelerates down the road under throttle', () => {
    const state = run({ throttle: 1, brake: 0, steer: 0 }, 3)
    expect(state.speed).toBeGreaterThan(18)
    expect(state.z).toBeGreaterThan(20)
    expect(Math.abs(state.x)).toBeLessThan(2)
    expect(Number.isFinite(state.yaw)).toBe(true)
  })

  it('turns right when the wheel is turned right', () => {
    const state = run({ throttle: 0.75, brake: 0, steer: 0.8 }, 3)
    expect(state.yaw).toBeGreaterThan(0.25)
    expect(state.x).toBeGreaterThan(1)
  })

  it('stops sooner on asphalt than on grass', () => {
    const params = paramsFromStats(balanced)
    const brake: VehicleInput = { throttle: 0, brake: 1, steer: 0 }
    let asphalt = createVehicleState(0, 0, 0, 28)
    let grass = createVehicleState(0, 0, 0, 28)
    let asphaltTime = 0
    let grassTime = 0
    for (let i = 0; i < 60 * 12; i += 1) {
      if (asphalt.speed > 1) {
        asphalt = stepVehicle(asphalt, brake, params, 1, dt)
        asphaltTime = (i + 1) * dt
      }
      if (grass.speed > 1) {
        grass = stepVehicle(grass, brake, params, 0.42, dt)
        grassTime = (i + 1) * dt
      }
    }
    expect(grassTime).toBeGreaterThan(asphaltTime + 0.3)
  })

  it('is deterministic for a scripted input', () => {
    const params = paramsFromStats(balanced)
    const inputs: VehicleInput[] = [
      { throttle: 1, brake: 0, steer: 0 },
      { throttle: 0.7, brake: 0, steer: 0.4 },
      { throttle: 0.2, brake: 0.8, steer: -0.3 },
    ]
    const simulate = () => {
      let state = createVehicleState(2, -4, 0.2, 6)
      inputs.forEach((input) => {
        for (let i = 0; i < 45; i += 1) state = stepVehicle(state, input, params, 1, dt)
      })
      return state
    }
    expect(simulate()).toEqual(simulate())
  })

  it('maps higher speed and creativity onto different params', () => {
    const slow = paramsFromStats({ ...balanced, speed: 10, creativity: 0 })
    const fast = paramsFromStats({ ...balanced, speed: 100, creativity: 100 })
    expect(fast.maxSpeed).toBeGreaterThan(slow.maxSpeed)
    expect(fast.engineForce).toBeGreaterThan(slow.engineForce)
    expect(fast.muRear).toBeLessThan(slow.muRear)
    expect(fast.hallucination).toBeGreaterThan(0)
  })
})
