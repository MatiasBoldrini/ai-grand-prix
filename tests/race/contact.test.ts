import { describe, expect, it } from 'vitest'
import { getPersonality } from '../../src/ai/registry.ts'
import { getCar } from '../../src/cars/registry.ts'
import { createVehicleState } from '../../src/physics/vehicle.ts'
import type { VehicleState } from '../../src/physics/types.ts'
import { collideWall, separateCars } from '../../src/race/contact.ts'
import type { ContactBody } from '../../src/race/contact.ts'
import { createRace, playerRacer, stepRace } from '../../src/race/world.ts'
import { locate, placeOnTrack } from '../../src/tracks/spline.ts'
import { getTrack } from '../../src/tracks/registry.ts'
import type { TrackLocation } from '../../src/tracks/types.ts'

const body: ContactBody = { mass: 1160, inertia: 1700 }
const heavy: ContactBody = { mass: 1160, inertia: 1900 }

function wall(lateral: number, heading = 0, width = 16): TrackLocation {
  return {
    s: 0,
    x: 0,
    z: 0,
    heading,
    curvature: 0,
    lateral,
    distance: Math.abs(lateral),
    surface: 'grass',
    width,
  }
}

function kinetic(state: VehicleState, spec: ContactBody = body): number {
  return (
    0.5 * spec.mass * (state.vx * state.vx + state.vz * state.vz) +
    0.5 * spec.inertia * state.yawRate * state.yawRate
  )
}

describe('wall contact', () => {
  it('bounces a head-on hit back inside and spends most of the energy', () => {
    const state = createVehicleState(0, 0, Math.PI / 2, 24)
    const before = kinetic(state)
    expect(collideWall(state, wall(16.45), 8, body)).toBe(true)
    expect(state.x).toBeLessThan(0)
    expect(state.vx).toBeLessThan(-4)
    expect(Math.abs(state.yawRate)).toBeLessThan(1.2)
    const after = kinetic(state)
    expect(after).toBeLessThan(before * 0.45)
    expect(after).toBeGreaterThan(before * 0.02)
  })

  it('keeps a slide and adds yaw when the nose clips the wall', () => {
    const state = createVehicleState(0, 0, 0.42, 0)
    state.vx = 8
    state.vz = 26
    state.speed = 26
    const alongBefore = state.vz
    expect(collideWall(state, wall(16.4), 8, body)).toBe(true)
    expect(state.vz).toBeGreaterThan(alongBefore * 0.62)
    expect(state.yawRate).toBeLessThan(-0.35)
    expect(kinetic(state)).toBeLessThan(kinetic({ ...state, vx: 8, vz: 26, yawRate: 0 }))
  })

  it('does not bleed speed while a car is already sliding along the wall', () => {
    const state = createVehicleState(0, 0, 0, 22)
    for (let i = 0; i < 45; i += 1) {
      state.x = 16.35
      state.vx = Math.min(state.vx, 0.4)
      collideWall(state, wall(state.x), 8, body)
    }
    expect(state.vz).toBeGreaterThan(18)
    expect(state.x).toBeLessThan(16.05)
    expect(state.x).toBeGreaterThan(15.7)
    expect(Math.abs(state.yawRate)).toBeLessThan(0.4)
  })

  it('pushes the left wall back toward the track', () => {
    const state = createVehicleState(0, 0, -Math.PI / 2, 18)
    expect(collideWall(state, wall(-16.45), 8, body)).toBe(true)
    expect(state.x).toBeGreaterThan(0)
    expect(state.vx).toBeGreaterThan(3)
  })

  it('does not catapult a car that meets the wall with a wild yaw rate', () => {
    const state = createVehicleState(0, 0, 0.4, 22)
    state.yawRate = 480
    state.vx = 12
    state.vz = 16
    const pre = Math.hypot(state.vx, state.vz)
    expect(collideWall(state, wall(16.6), 8, body)).toBe(true)
    const after = Math.hypot(state.vx, state.vz)
    expect(after).toBeLessThanOrEqual(Math.min(pre, 45) + 1e-6)
    expect(after).toBeLessThanOrEqual(45)
    expect(state.speed).toBeLessThanOrEqual(45)
    expect(Number.isFinite(state.vx)).toBe(true)
    expect(Number.isFinite(state.yawRate)).toBe(true)
    expect(Math.abs(state.yawRate)).toBeLessThanOrEqual(4)
  })

  it('is deterministic', () => {
    const run = () => {
      const state = createVehicleState(1, -2, 0.3, 16)
      state.vx += 4
      collideWall(state, wall(16.4), 8, heavy)
      return state
    }
    expect(run()).toEqual(run())
  })
})

describe('car contact', () => {
  it('separates a head-on crash and drops the combined energy', () => {
    const a = createVehicleState(0, 0, 0, 20)
    const b = createVehicleState(0, 2.3, Math.PI, 18)
    const before = kinetic(a) + kinetic(b)
    expect(separateCars(a, b, body, heavy)).toBe(true)
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(3.2)
    const closing = (b.vz - a.vz) * Math.sign(b.z - a.z || 1)
    expect(closing).toBeGreaterThan(-0.2)
    expect(a.vz).toBeLessThan(12)
    expect(b.vz).toBeGreaterThan(-12)
    expect(kinetic(a) + kinetic(b)).toBeLessThan(before * 0.75)
  })

  it('scrubs a door-to-door rub and yaws both cars', () => {
    const a = createVehicleState(0, 0, 0, 24)
    const b = createVehicleState(1.2, 0, 0, 8)
    const before = kinetic(a) + kinetic(b)
    expect(separateCars(a, b, body, body)).toBe(true)
    expect(Math.abs(b.x - a.x)).toBeGreaterThan(1.7)
    expect(a.speed).toBeLessThan(23.8)
    expect(b.speed).toBeGreaterThan(8.2)
    expect(Math.abs(a.yawRate)).toBeGreaterThan(0.15)
    expect(Math.abs(b.yawRate)).toBeGreaterThan(0.15)
    expect(kinetic(a) + kinetic(b)).toBeLessThan(before)
  })

  it('yaws both cars when the hit is off the centre line', () => {
    const a = createVehicleState(0, 0, 0, 22)
    const b = createVehicleState(1.15, 0.2, 0, 6)
    expect(separateCars(a, b, body, body)).toBe(true)
    expect(Math.abs(a.yawRate)).toBeGreaterThan(0.15)
    expect(Math.abs(b.yawRate)).toBeGreaterThan(0.15)
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(1.5)
  })

  it('does not stick two cars that already overlap on the same spot', () => {
    const a = createVehicleState(0, 0, 0, 8)
    const b = createVehicleState(0.05, 0.05, 0.4, 0)
    expect(separateCars(a, b, body, body)).toBe(true)
    let gap = Math.hypot(b.x - a.x, b.z - a.z)
    expect(gap).toBeGreaterThan(1.6)
    let settled = false
    for (let i = 0; i < 3; i += 1) {
      const again = separateCars(a, b, body, body)
      const next = Math.hypot(b.x - a.x, b.z - a.z)
      expect(next).toBeGreaterThanOrEqual(gap - 0.02)
      gap = next
      if (!again) {
        settled = true
        break
      }
    }
    expect(settled).toBe(true)
    expect(gap).toBeGreaterThan(1.8)
  })

  it('matches a repeated pair of crashes', () => {
    const run = () => {
      const a = createVehicleState(-0.2, 0.4, 0.2, 14)
      const b = createVehicleState(0.8, 1.1, -0.4, 9)
      separateCars(a, b, body, heavy)
      return [a, b]
    }
    expect(run()).toEqual(run())
  })
})

describe('race step collisions', () => {
  it('puts a sliding car back inside the wall and keeps most of its speed', () => {
    const world = createRace({
      track: getTrack('gradiente'),
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
    })
    const player = playerRacer(world)
    const pose = placeOnTrack(world.track, 120, 0)
    const sample = locate(world.track, pose.x, pose.z, 120)
    const rightX = Math.cos(sample.heading)
    const rightZ = -Math.sin(sample.heading)
    const outside = world.track.width / 2 + world.track.runoff + 1.4
    player.vehicle = createVehicleState(
      pose.x + rightX * outside,
      pose.z + rightZ * outside,
      pose.yaw,
      26,
    )
    player.lastS = sample.s
    const rival = world.racers[1]
    if (rival) {
      rival.vehicle = createVehicleState(pose.x + 40, pose.z + 40, pose.yaw, 0)
      rival.carCooldown = 5
    }
    const before = Math.hypot(player.vehicle.vx, player.vehicle.vz)
    stepRace(world, { throttle: 0, brake: 0, steer: 0 }, 1 / 60)
    const after = locate(world.track, player.vehicle.x, player.vehicle.z, player.lastS)
    const limit = world.track.width / 2 + world.track.runoff
    expect(Math.abs(after.lateral)).toBeLessThanOrEqual(limit + 0.05)
    expect(Math.hypot(player.vehicle.vx, player.vehicle.vz)).toBeGreaterThan(before * 0.7)
    expect(world.events.some((event) => event.type === 'wall' && event.racerId === 'player')).toBe(
      true,
    )
    expect(world.events.some((event) => event.type === 'respawn')).toBe(false)
  })

  it('respawns a car that sits on the grass, even while braking', () => {
    const world = createRace({
      track: getTrack('gradiente'),
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
    })
    const player = playerRacer(world)
    const pose = placeOnTrack(world.track, 90, 14)
    player.vehicle = createVehicleState(pose.x, pose.z, pose.yaw, 0.2)
    player.lastS = 90
    player.grace = 0
    player.stuck = 0
    const rival = world.racers[1]
    if (rival) {
      const away = placeOnTrack(world.track, 200, 0)
      rival.vehicle = createVehicleState(away.x, away.z, away.yaw, 12)
      rival.lastS = 200
      rival.grace = 5
    }
    let steps = 0
    for (; steps < 60 * 3; steps += 1) {
      stepRace(world, { throttle: 0, brake: 1, steer: 0 }, 1 / 60)
      if (world.events.some((event) => event.type === 'respawn' && event.racerId === 'player')) {
        break
      }
    }
    expect(steps / 60).toBeLessThan(3)
    expect(steps / 60).toBeGreaterThan(1.5)
    expect(player.vehicle.speed).toBeGreaterThan(8)
    const back = locate(world.track, player.vehicle.x, player.vehicle.z, player.lastS)
    expect(back.surface).toBe('asphalt')
    expect(player.condition).toBeGreaterThanOrEqual(0.85)
  })

  it('does not rescue a car that is only braking on the asphalt', () => {
    const world = createRace({
      track: getTrack('gradiente'),
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
    })
    const player = playerRacer(world)
    const pose = placeOnTrack(world.track, 90, 0)
    player.vehicle = createVehicleState(pose.x, pose.z, pose.yaw, 0.2)
    player.lastS = 90
    player.grace = 0
    const rival = world.racers[1]
    if (rival) rival.grace = 8
    for (let i = 0; i < 60 * 3; i += 1) {
      stepRace(world, { throttle: 0, brake: 1, steer: 0 }, 1 / 60)
    }
    expect(world.events.some((event) => event.type === 'respawn')).toBe(false)
  })
})
