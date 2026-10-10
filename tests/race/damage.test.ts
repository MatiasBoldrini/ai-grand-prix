import { describe, expect, it } from 'vitest'
import { getPersonality } from '../../src/ai/registry.ts'
import { getCar } from '../../src/cars/registry.ts'
import { createVehicleState } from '../../src/physics/vehicle.ts'
import {
  CONDITION_FLOOR,
  RESPAWN_CONDITION,
  contactLoss,
  hook,
} from '../../src/race/hooks/damage.ts'
import { listHooks } from '../../src/race/hook-registry.ts'
import type { RaceEvent, RaceWorld } from '../../src/race/types.ts'
import { createRace, playerRacer, respawnRacer, stepRace } from '../../src/race/world.ts'
import { placeOnTrack } from '../../src/tracks/spline.ts'
import { getTrack } from '../../src/tracks/registry.ts'

const dt = 1 / 60

function race(): RaceWorld {
  return createRace({
    track: getTrack('gradiente'),
    player: getCar('flash-7b'),
    rival: getCar('reasoner-70b'),
    personality: getPersonality('cauto'),
  })
}

describe('contact damage', () => {
  it('registers the hook by dropping the file in', () => {
    expect(listHooks().map((raceHook) => raceHook.id)).toContain('damage')
  })

  it('chips more condition the faster the wall impact', () => {
    expect(contactLoss('wall', 0)).toBeCloseTo(0.04, 5)
    expect(contactLoss('wall', 35)).toBeCloseTo(0.14, 5)
    expect(contactLoss('wall', 80)).toBe(contactLoss('wall', 35))
    expect(contactLoss('car', 0)).toBeCloseTo(0.025, 5)
    expect(contactLoss('car', 24)).toBeCloseTo(0.175, 5)
    expect(contactLoss('wall', Number.NaN)).toBe(contactLoss('wall', 0))

    const soft = conditionAfterWall(0)
    const hard = conditionAfterWall(36)
    expect(hard).toBeLessThan(soft - 0.05)
    expect(soft).toBeLessThan(1)
    expect(hard).toBeGreaterThan(CONDITION_FLOOR)
  })

  it('reduces only the racer named by a wall event', () => {
    const world = race()
    const racers = world.racers
    const player = playerRacer(world)
    const rival = world.racers[1]
    world.events = [{ type: 'wall', racerId: 'rival', time: 0 }]
    if (rival) {
      rival.vehicle.vx = 22
      rival.vehicle.vz = 0
    }
    hook.afterStep?.(world, dt)
    expect(world.racers).toBe(racers)
    expect(player.condition).toBe(1)
    expect(rival?.condition).toBeCloseTo(1 - contactLoss('wall', 22), 5)
  })

  it('lowers condition when the car is stepped through the wall', () => {
    const world = race()
    const player = playerRacer(world)
    const pose = placeOnTrack(world.track, 40, 24)
    player.vehicle = createVehicleState(pose.x, pose.z, pose.yaw, 18)
    player.lastS = 40
    player.wallCooldown = 0
    stepRace(world, { throttle: 0, brake: 0, steer: 0 }, dt)
    expect(world.events.some((event) => event.type === 'wall' && event.racerId === 'player')).toBe(
      true,
    )
    expect(player.condition).toBeLessThan(1)
    expect(player.condition).toBeGreaterThanOrEqual(CONDITION_FLOOR)
  })

  it('shares a car hit between the two cars that touched', () => {
    const world = race()
    const player = playerRacer(world)
    const rival = world.racers[1]
    expect(rival).toBeDefined()
    if (!rival) return
    player.vehicle.x = 0
    player.vehicle.z = 0
    player.vehicle.vx = 18
    player.vehicle.vz = 0
    rival.vehicle.x = 1.2
    rival.vehicle.z = 0
    rival.vehicle.vx = 0
    rival.vehicle.vz = 0
    world.events = [{ type: 'collision', racerId: 'player', time: 0 }]
    hook.afterStep?.(world, dt)
    const expected = 1 - contactLoss('car', 18)
    expect(player.condition).toBeCloseTo(expected, 5)
    expect(rival.condition).toBeCloseTo(expected, 5)
  })

  it('does not damage a car that was nowhere near the hit', () => {
    const world = race()
    const player = playerRacer(world)
    const rival = world.racers[1]
    if (!rival) return
    player.vehicle.x = 0
    player.vehicle.z = 0
    player.vehicle.vx = 16
    rival.vehicle.x = 40
    rival.vehicle.z = 0
    world.events = [{ type: 'collision', racerId: 'player', time: 0 }]
    hook.afterStep?.(world, dt)
    expect(player.condition).toBeLessThan(1)
    expect(rival.condition).toBe(1)
  })

  it('ignores laps, runoff and respawns', () => {
    const world = race()
    const player = playerRacer(world)
    const ignored: RaceEvent['type'][] = ['lap', 'finish', 'offtrack', 'respawn']
    for (const type of ignored) {
      world.time = 0
      world.events = [{ type, racerId: 'player', time: 0 }]
      hook.afterStep?.(world, dt)
    }
    expect(player.condition).toBe(1)
  })

  it('stops at the limp floor and a respawn restores the chassis', () => {
    const world = race()
    const player = playerRacer(world)
    player.vehicle.vx = 40
    for (let i = 0; i < 12; i += 1) {
      world.time = 0
      world.events = [{ type: 'wall', racerId: 'player', time: 0 }]
      hook.afterStep?.(world, dt)
    }
    expect(player.condition).toBe(CONDITION_FLOOR)
    respawnRacer(world, player)
    expect(player.condition).toBe(CONDITION_FLOOR)
    world.time = 1
    world.events = [{ type: 'respawn', racerId: 'player', time: 1 }]
    hook.afterStep?.(world, dt)
    expect(player.condition).toBeGreaterThanOrEqual(RESPAWN_CONDITION)
  })

  it('charges one scrape once and still hurts a later hit', () => {
    const world = race()
    const player = playerRacer(world)
    player.vehicle.vx = 28
    player.vehicle.vz = 0
    world.time = 0
    world.events = []
    hook.afterStep?.(world, dt)
    const before = player.condition
    for (let i = 0; i < 22; i += 1) {
      world.time = 2 + i * 0.45
      world.events = [{ type: 'wall', racerId: 'player', time: world.time }]
      hook.afterStep?.(world, dt)
    }
    const scraped = before - player.condition
    expect(scraped).toBeGreaterThan(0)
    expect(scraped).toBeLessThanOrEqual(0.15)
    const afterScrape = player.condition
    world.time += 3
    world.events = [{ type: 'wall', racerId: 'player', time: world.time }]
    hook.afterStep?.(world, dt)
    expect(player.condition).toBeLessThan(afterScrape)
  })

  it('makes a damaged car pull less than a healthy one', () => {
    const healthy = race()
    const hurt = race()
    const player = playerRacer(hurt)
    player.vehicle.vx = 30
    hurt.events = [{ type: 'wall', racerId: 'player', time: 0 }]
    hook.afterStep?.(hurt, dt)
    expect(player.condition).toBeLessThan(0.9)

    const healthySpeed = pull(healthy)
    const hurtSpeed = pull(hurt)
    expect(hurtSpeed, `healthy ${healthySpeed} hurt ${hurtSpeed}`).toBeLessThan(healthySpeed - 0.3)
  })
})

function conditionAfterWall(speed: number): number {
  const world = race()
  const player = playerRacer(world)
  player.vehicle.vx = speed
  player.vehicle.vz = 0
  world.events = [{ type: 'wall', racerId: 'player', time: 0 }]
  hook.afterStep?.(world, dt)
  return player.condition
}

function pull(world: RaceWorld): number {
  const pose = placeOnTrack(world.track, 40, 0)
  const player = playerRacer(world)
  player.vehicle = createVehicleState(pose.x, pose.z, pose.yaw, 0)
  player.energy = player.energyCapacity
  player.lastS = 40
  player.wallCooldown = 5
  player.carCooldown = 5
  player.grace = 5
  player.stuck = 0
  const rival = world.racers[1]
  if (rival) {
    const away = placeOnTrack(world.track, 40, 0)
    rival.vehicle = createVehicleState(away.x + 80, away.z + 80, away.yaw, 0)
    rival.wallCooldown = 5
    rival.carCooldown = 5
  }
  const input = { throttle: 1, brake: 0, steer: 0 }
  for (let i = 0; i < 40; i += 1) stepRace(world, input, dt)
  return playerRacer(world).vehicle.speed
}
