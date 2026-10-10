import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPersonality } from '../../src/ai/registry.ts'
import { applyTuning } from '../../src/cars/apply-tuning.ts'
import { paramsFromStats } from '../../src/cars/params.ts'
import { getCar } from '../../src/cars/registry.ts'
import {
  applySetup,
  commitSetup,
  formatSetupDelta,
  readSetup,
  restoreSetup,
  setupEffect,
} from '../../src/cars/tuning/setup.ts'
import { createVehicleState, stepVehicle } from '../../src/physics/vehicle.ts'
import type { VehicleInput, VehicleParams } from '../../src/physics/types.ts'
import { updateGameState } from '../../src/game/state.ts'
import { createRace, playerRacer } from '../../src/race/world.ts'
import { getTrack } from '../../src/tracks/registry.ts'

const flash = () => getCar('flash-7b')
const baseParams = () => paramsFromStats(flash().stats)

afterEach(() => {
  commitSetup('stock')
  updateGameState({ carId: 'flash-7b' })
  vi.unstubAllGlobals()
})

describe('garage setup', () => {
  it('leaves an untouched car identical', () => {
    const params = baseParams()
    expect(readSetup()).toBe('stock')
    expect(applyTuning(params, 'flash-7b')).toBe(params)
    expect(applyTuning(params, 'reasoner-70b')).toBe(params)
    expect(setupEffect(params, 'stock')).toEqual({ engine: 0, grip: 0, tank: 0 })
  })

  it('opens the engine and shortens the tank when that setup is committed', () => {
    const params = baseParams()
    commitSetup('engine')
    const tuned = applyTuning(params, 'flash-7b')
    expect(tuned).not.toBe(params)
    expect(tuned.engineForce).toBeGreaterThan(params.engineForce)
    expect(tuned.maxSpeed).toBeGreaterThan(params.maxSpeed)
    expect(tuned.energyCapacity).toBeLessThan(params.energyCapacity)
    expect(tuned.energyRate).toBeGreaterThan(params.energyRate)
    expect(params.engineForce).toBe(baseParams().engineForce)
    expect(applyTuning(params, 'reasoner-70b')).toBe(params)
    expect(setupEffect(params, 'engine')).toEqual({ engine: 14, grip: 0, tank: -22 })
  })

  it('trades engine for grip or for a longer tank', () => {
    const params = baseParams()
    commitSetup('grip')
    const planted = applyTuning(params, 'flash-7b')
    expect(planted.engineForce).toBeLessThan(params.engineForce)
    expect(planted.muFront).toBeGreaterThan(params.muFront)
    expect(planted.muRear).toBeGreaterThan(params.muRear)
    expect(planted.rearCorner).toBeGreaterThan(params.rearCorner)
    expect(planted.hallucination).toBeLessThan(params.hallucination)
    expect(setupEffect(params, 'grip')).toEqual({ engine: -8, grip: 10, tank: 0 })

    commitSetup('tank')
    const tank = applyTuning(params, 'flash-7b')
    expect(tank.energyCapacity).toBeGreaterThan(params.energyCapacity)
    expect(tank.energyRate).toBeLessThan(params.energyRate)
    expect(tank.engineForce).toBeLessThan(params.engineForce)
    const stockSeconds = params.energyCapacity / params.energyRate
    const tankSeconds = tank.energyCapacity / tank.energyRate
    expect(tankSeconds).toBeGreaterThan(stockSeconds * 1.4)
    expect(setupEffect(params, 'tank')).toEqual({ engine: -10, grip: 0, tank: 35 })
  })

  it('puts the committed setup on the player only when the race is created', () => {
    const stock = createRace({
      track: getTrack('gradiente'),
      player: flash(),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
    })
    commitSetup('tank')
    const tuned = createRace({
      track: getTrack('gradiente'),
      player: flash(),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
    })
    const stockPlayer = playerRacer(stock)
    const tunedPlayer = playerRacer(tuned)
    expect(tunedPlayer.energyCapacity).toBeGreaterThan(stockPlayer.energyCapacity)
    expect(tunedPlayer.energy).toBeCloseTo(tunedPlayer.energyCapacity)
    expect(tunedPlayer.params.engineForce).toBeLessThan(stockPlayer.params.engineForce)
    expect(tuned.racers[1]?.params.engineForce).toBe(stock.racers[1]?.params.engineForce)
    expect(tuned.racers[1]?.energyCapacity).toBe(stock.racers[1]?.energyCapacity)
  })

  it('pulls away from a stock car on the straight', () => {
    const params = baseParams()
    const input: VehicleInput = { throttle: 1, brake: 0, steer: 0 }
    const stockSpeed = run(params, input, 4)
    const engineSpeed = run(applySetup(params, 'engine'), input, 4)
    const tankSpeed = run(applySetup(params, 'tank'), input, 4)
    expect(engineSpeed).toBeGreaterThan(stockSpeed + 1)
    expect(tankSpeed).toBeLessThan(stockSpeed)
  })

  it('follows the car selected for the race, including after the selection changes', () => {
    const flashParams = baseParams()
    const reasonerParams = paramsFromStats(getCar('reasoner-70b').stats)
    commitSetup('engine')
    expect(applyTuning(flashParams, 'flash-7b').engineForce).toBeGreaterThan(
      flashParams.engineForce,
    )
    expect(applyTuning(reasonerParams, 'reasoner-70b')).toBe(reasonerParams)

    updateGameState({ carId: 'reasoner-70b' })
    expect(applyTuning(reasonerParams, 'reasoner-70b').engineForce).toBeGreaterThan(
      reasonerParams.engineForce,
    )
    expect(applyTuning(flashParams, 'flash-7b')).toBe(flashParams)
  })

  it('prints a stable garage label for each delta', () => {
    expect(formatSetupDelta(0)).toBe('igual')
    expect(formatSetupDelta(14)).toBe('+14%')
    expect(formatSetupDelta(-22)).toBe('-22%')
    expect(formatSetupDelta(Number.NaN)).toBe('igual')
  })

  it('restores a saved setup and ignores junk', () => {
    const box = new Map<string, string>()
    vi.stubGlobal('localStorage', memoryStorage(box))
    commitSetup('grip')
    expect(JSON.parse(box.get('agp-garage-setup') ?? '{}')).toEqual({ bias: 'grip' })

    commitSetup('stock')
    box.set('agp-garage-setup', JSON.stringify({ bias: 'engine' }))
    restoreSetup()
    const params = baseParams()
    expect(readSetup()).toBe('engine')
    expect(applyTuning(params, 'flash-7b').engineForce).toBeGreaterThan(params.engineForce)

    box.set('agp-garage-setup', '{')
    restoreSetup()
    expect(readSetup()).toBe('stock')
    expect(applyTuning(params, 'flash-7b')).toBe(params)

    box.set('agp-garage-setup', JSON.stringify({ bias: 'nitro' }))
    restoreSetup()
    expect(readSetup()).toBe('stock')

    box.set('agp-garage-setup', JSON.stringify({ carId: 'reasoner-70b', bias: 'tank' }))
    restoreSetup()
    expect(readSetup()).toBe('tank')
  })

  it('keeps the in-memory setup when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => commitSetup('engine')).not.toThrow()
    expect(applyTuning(baseParams(), 'flash-7b').engineForce).toBeGreaterThan(
      baseParams().engineForce,
    )
    expect(() => restoreSetup()).not.toThrow()
    expect(readSetup()).toBe('stock')
  })
})

function run(params: VehicleParams, input: VehicleInput, seconds: number): number {
  let state = createVehicleState(0, 0, 0, 0)
  const steps = Math.round(seconds * 60)
  for (let i = 0; i < steps; i += 1) state = stepVehicle(state, input, params, 1, 1 / 60)
  return state.speed
}

function memoryStorage(box: Map<string, string>): Storage {
  return {
    get length() {
      return box.size
    },
    clear: () => box.clear(),
    getItem: (key) => box.get(key) ?? null,
    key: (index) => [...box.keys()][index] ?? null,
    removeItem: (key) => box.delete(key),
    setItem: (key, value) => box.set(key, value),
  }
}
