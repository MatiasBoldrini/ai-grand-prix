import { describe, expect, it } from 'vitest'
import { getPersonality } from '../../src/ai/registry.ts'
import { getCar } from '../../src/cars/registry.ts'
import { createRace, playerRacer, stepRace } from '../../src/race/world.ts'
import { getTrack } from '../../src/tracks/registry.ts'
import { locate, sampleAt } from '../../src/tracks/spline.ts'
import type { Track } from '../../src/tracks/types.ts'

describe('embeddings', () => {
  it('is a closed loop, shorter and tighter than Potrerillos, with the arroyo cut', () => {
    const track = getTrack('embeddings')
    const gradiente = getTrack('gradiente')

    expect(track.id).toBe('embeddings')
    expect(track.name).toBe('Anillo de Uspallata')
    expect(track.length).toBeGreaterThan(420)
    expect(track.length).toBeLessThan(gradiente.length)
    expect(minRadius(track)).toBeGreaterThan(14)
    expect(minRadius(track)).toBeLessThan(minRadius(gradiente))

    const start = sampleAt(track, 0)
    const end = sampleAt(track, track.length - 0.01)
    expect(Math.hypot(start.x - end.x, start.z - end.z)).toBeLessThan(2)

    const cut = track.shortcuts.find((shortcut) => shortcut.id === 'corte-del-arroyo')
    expect(cut, 'shortcut id corte-del-arroyo').toBeDefined()
    if (!cut) return
    const chord = Math.hypot(cut.x1 - cut.x0, cut.z1 - cut.z0)
    expect(chord).toBeGreaterThan(40)
    let along = 0
    for (let index = cut.fromCorner; index < cut.toCorner; index += 1) {
      const current = track.corners[index]
      const next = track.corners[index + 1]
      if (!current || !next) throw new Error(`corner ${index} is missing`)
      along += Math.hypot(next.x - current.x, next.z - current.z)
    }
    expect(along).toBeGreaterThan(chord + 4)

    const wall = track.width / 2 + track.runoff
    let shortcutSamples = 0
    let outsideWall = 0
    for (let step = 1; step < 16; step += 1) {
      const t = step / 16
      const place = locate(track, cut.x0 + (cut.x1 - cut.x0) * t, cut.z0 + (cut.z1 - cut.z0) * t)
      if (place.surface === 'shortcut') shortcutSamples += 1
      if (Math.abs(place.lateral) > wall + 0.35) outsideWall += 1
    }
    expect(shortcutSamples).toBeGreaterThan(3)
    expect(outsideWall).toBe(0)
  })

  it('keeps asphalt on the centre line and grass in the runoff', () => {
    const track = getTrack('embeddings')
    for (const fraction of [0.05, 0.18, 0.42, 0.67, 0.9]) {
      const sample = sampleAt(track, track.length * fraction)
      const here = locate(track, sample.x, sample.z, sample.s)
      expect(here.surface, `s=${sample.s.toFixed(1)}`).toBe('asphalt')
      expect(Math.abs(here.lateral)).toBeLessThan(1.5)
    }
    const straight = sampleAt(track, 36)
    const rx = Math.cos(straight.heading)
    const rz = -Math.sin(straight.heading)
    const grass = locate(
      track,
      straight.x + rx * (track.width / 2 + track.runoff * 0.55),
      straight.z + rz * (track.width / 2 + track.runoff * 0.55),
      straight.s,
    )
    expect(grass.surface).toBe('grass')
  })

  it('lets both cars finish a lap without hitting the wall', () => {
    const world = createRace({
      track: getTrack('embeddings'),
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      laps: 1,
      playerController: 'ai',
    })
    const maxSteps = 60 * 70
    let steps = 0
    let walls = 0
    let respawns = 0
    for (; steps < maxSteps; steps += 1) {
      stepRace(world, { throttle: 0, brake: 0, steer: 0 }, 1 / 60)
      for (const event of world.events) {
        if (event.type === 'wall') walls += 1
        if (event.type === 'respawn') respawns += 1
      }
      const player = playerRacer(world)
      const rival = world.racers[1]
      if (player.lap >= 1 && rival && rival.lap >= 1) break
    }
    const player = playerRacer(world)
    const rival = world.racers[1]
    const detail = `steps=${steps} playerLap=${player.lap} speed=${player.vehicle.speed.toFixed(1)} walls=${walls} respawns=${respawns} lapTime=${player.lapTimes[0]} rivalLap=${rival?.lap} energy=${player.energy.toFixed(1)}`
    expect(player.lap, detail).toBeGreaterThanOrEqual(1)
    expect(rival?.lap, detail).toBeGreaterThanOrEqual(1)
    expect(respawns, detail).toBe(0)
    expect(walls, detail).toBe(0)
    expect(player.lapTimes[0], detail).toBeGreaterThan(12)
    expect(Number.isFinite(player.vehicle.x)).toBe(true)
    expect(Number.isFinite(rival?.vehicle.x)).toBe(true)
  })

  it('finishes the race distance', () => {
    const track = getTrack('embeddings')
    const world = createRace({
      track,
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      playerController: 'ai',
    })
    const maxSteps = 60 * 150
    let steps = 0
    let walls = 0
    let respawns = 0
    for (; steps < maxSteps; steps += 1) {
      stepRace(world, { throttle: 0, brake: 0, steer: 0 }, 1 / 60)
      for (const event of world.events) {
        if (event.type === 'wall') walls += 1
        if (event.type === 'respawn') respawns += 1
      }
      if (world.finished) break
    }
    const player = playerRacer(world)
    const rival = world.racers[1]
    const detail = `steps=${steps} laps=${player.lap}/${track.laps} rivalLap=${rival?.lap} walls=${walls} respawns=${respawns} energy=${player.energy.toFixed(1)} times=${player.lapTimes.map((time) => time.toFixed(1)).join(',')}`
    expect(world.finished, detail).toBe(true)
    expect(player.lap, detail).toBeGreaterThanOrEqual(track.laps)
    expect(rival?.lap, detail).toBeGreaterThanOrEqual(1)
    expect(respawns, detail).toBe(0)
    expect(walls, detail).toBe(0)
    expect(player.energy, detail).toBeGreaterThan(0)
  })
})

function minRadius(track: Track): number {
  let radius = Infinity
  for (const sample of track.samples) {
    const curvature = Math.abs(sample.curvature)
    if (curvature > 1e-4) radius = Math.min(radius, 1 / curvature)
  }
  return radius
}
