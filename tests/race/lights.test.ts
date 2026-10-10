import { beforeEach, describe, expect, it } from 'vitest'
import { getPersonality } from '../../src/ai/registry.ts'
import { getCar } from '../../src/cars/registry.ts'
import { createVehicleState } from '../../src/physics/vehicle.ts'
import { listHooks } from '../../src/race/hook-registry.ts'
import {
  hook,
  readStartLights,
  resetStartLights,
  START_HOLD_S,
} from '../../src/race/hooks/lights.ts'
import { createRace, playerRacer, snapshotRace, stepRace } from '../../src/race/world.ts'
import { placeOnTrack } from '../../src/tracks/spline.ts'
import { getTrack } from '../../src/tracks/registry.ts'
import type { RaceWorld } from '../../src/race/types.ts'

const dt = 1 / 60

describe('start lights', () => {
  beforeEach(() => {
    resetStartLights()
  })

  it('registers ahead of damage and the ghost', () => {
    expect(hook.id).toBe('countdown')
    const ids = listHooks().map((raceHook) => raceHook.id)
    expect(ids).toContain('countdown')
    expect(ids.indexOf('countdown')).toBeLessThan(ids.indexOf('damage'))
    expect(ids.indexOf('countdown')).toBeLessThan(ids.indexOf('ghost'))
  })

  it('holds both cars on the grid and the clock at zero for about three seconds', () => {
    const world = race()
    const racers = world.racers
    const player = playerRacer(world)
    const rival = world.racers[1]
    expect(rival).toBeDefined()
    const gridPlayer = { x: player.vehicle.x, z: player.vehicle.z }
    const gridRival = { x: rival?.vehicle.x ?? 0, z: rival?.vehicle.z ?? 0 }

    let steps = 0
    while (steps < 400) {
      stepRace(world, { throttle: 1, brake: 0, steer: 1 }, dt)
      if (!readStartLights().frozen) break
      steps += 1
      const snap = snapshotRace(world)
      const shown = snap.racers.find((racer) => racer.isPlayer)
      expect(world.racers).toBe(racers)
      expect(world.time).toBe(0)
      expect(player.vehicle.speed).toBe(0)
      expect(rival?.vehicle.speed).toBe(0)
      expect(player.odometer).toBe(0)
      expect(rival?.odometer).toBe(0)
      expect(player.energy).toBe(player.energyCapacity)
      expect(player.vehicle.x).toBeCloseTo(gridPlayer.x, 4)
      expect(player.vehicle.z).toBeCloseTo(gridPlayer.z, 4)
      expect(rival?.vehicle.x).toBeCloseTo(gridRival.x, 4)
      expect(rival?.vehicle.z).toBeCloseTo(gridRival.z, 4)
      expect(shown?.position).toBe(1)
      expect(shown?.speed).toBe(0)
      expect(['3', '2', '1', '¡ya!']).toContain(readStartLights().label)
    }

    expect(steps * dt).toBeGreaterThanOrEqual(START_HOLD_S - 1e-3)
    expect(steps * dt).toBeLessThan(START_HOLD_S + 2 * dt)
    expect(world.time).toBeCloseTo(dt, 6)
    expect(readStartLights().label).toBe('¡ya!')
    expect(readStartLights().lit).toBe(0)
    expect(readStartLights().frozen).toBe(false)
  })

  it('lights the lamps one per second, then lets a better launch lead', () => {
    const world = race()
    const seen = new Set<string>()
    let steps = 0
    while (readStartLights().label !== '¡ya!' && steps < 400) {
      stepRace(world, { throttle: 1, brake: 0, steer: 0 }, dt)
      steps += 1
      seen.add(readStartLights().label)
    }
    expect(seen.has('3')).toBe(true)
    expect(seen.has('2')).toBe(true)
    expect(seen.has('1')).toBe(true)
    expect(readStartLights().cue).toBe(4)

    stepRace(world, { throttle: 1, brake: 0, steer: 0 }, dt)
    expect(world.time).toBeGreaterThan(0)
    expect(readStartLights().frozen).toBe(false)

    const rival = world.racers[1]
    expect(rival).toBeDefined()
    if (!rival) return
    rival.condition = 0.2
    rival.energy = 0
    for (let i = 0; i < 180; i += 1) {
      stepRace(world, { throttle: 1, brake: 0, steer: 0 }, dt)
    }
    const snap = snapshotRace(world)
    const player = snap.racers.find((racer) => racer.isPlayer)
    const other = snap.racers.find((racer) => !racer.isPlayer)
    expect(player?.position).toBe(1)
    expect(player?.odometer ?? 0).toBeGreaterThan(other?.odometer ?? 0)
    expect(world.time).toBeGreaterThan(2)
    expect(readStartLights().label).toBe('')
  })

  it('does not rewind a car that is already off the grid', () => {
    const world = race()
    const player = playerRacer(world)
    const pose = placeOnTrack(world.track, 40, 0)
    player.vehicle = createVehicleState(pose.x, pose.z, pose.yaw, 16)
    player.lastS = 40
    const racers = world.racers
    stepRace(world, { throttle: 1, brake: 0, steer: 0 }, dt)
    expect(world.racers).toBe(racers)
    expect(readStartLights().frozen).toBe(false)
    expect(readStartLights().label).toBe('')
    expect(world.time).toBeCloseTo(dt, 6)
    expect(player.lastS).not.toBe(10)
    expect(Math.hypot(player.vehicle.x - pose.x, player.vehicle.z - pose.z)).toBeGreaterThan(0.05)
  })

  it('leaves a race alone once the clock has already started', () => {
    const world = race()
    world.time = 4
    const before = playerRacer(world).vehicle.x
    stepRace(world, { throttle: 1, brake: 0, steer: 0 }, dt)
    expect(readStartLights().frozen).toBe(false)
    expect(world.time).toBeCloseTo(4 + dt, 6)
    expect(playerRacer(world).vehicle.x).not.toBe(before)
  })
})

function race(): RaceWorld {
  return createRace({
    track: getTrack('gradiente'),
    player: getCar('flash-7b'),
    rival: getCar('reasoner-70b'),
    personality: getPersonality('cauto'),
    playerController: 'human',
  })
}
