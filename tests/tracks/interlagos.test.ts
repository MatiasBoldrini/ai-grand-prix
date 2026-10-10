import { describe, expect, it } from 'vitest'
import { getPersonality } from '../../src/ai/registry.ts'
import { getCar } from '../../src/cars/registry.ts'
import { wrapAngle } from '../../src/core/math.ts'
import { createRace, playerRacer, stepRace } from '../../src/race/world.ts'
import { getTrack, listTracks } from '../../src/tracks/registry.ts'
import { locate, placeOnTrack, sampleAt } from '../../src/tracks/spline.ts'
import type { Track } from '../../src/tracks/types.ts'

describe('interlagos', () => {
  it('joins the registry under its real Spanish name', () => {
    const ids = listTracks().map((track) => track.id)
    expect(ids).toContain('interlagos')
    expect(new Set(ids).size).toBe(ids.length)

    const track = getTrack('interlagos')
    expect(track.name).toBe('Autódromo de Interlagos')
    expect(track.description).toContain('S do Senna')
    expect(track.description).toContain('Reta Oposta')
    expect(track.description).toContain('Descida do Lago')
    expect(track.description).toContain('Junção')
    expect(track.laps).toBe(2)
    expect(track.width).toBe(16)
    expect(track.runoff).toBe(10)
    expect(track.gates).toBe(12)
    expect(track.shortcuts).toEqual([])
  })

  it('is a closed anticlockwise lap with the real sequence of corners', () => {
    const track = getTrack('interlagos')
    expect(track.length).toBeGreaterThan(820)
    expect(track.length).toBeLessThan(1100)
    expect(track.samples.length).toBeGreaterThan(600)

    const start = sampleAt(track, 0)
    const end = sampleAt(track, track.length - 0.01)
    expect(Math.hypot(start.x - end.x, start.z - end.z)).toBeLessThan(2)

    let turn = 0
    for (let index = 0; index < track.samples.length; index += 1) {
      const current = track.samples[index]
      const next = track.samples[(index + 1) % track.samples.length]
      if (!current || !next) continue
      turn += wrapAngle(next.heading - current.heading)
    }
    expect(turn).toBeGreaterThan(Math.PI * 1.85)
    expect(turn).toBeLessThan(Math.PI * 2.15)

    // S do Senna leaves the straight to the left, then straightens before Curva do Sol.
    expect(wrapAngle(headingAt(track, 0.1) - headingAt(track, 0.05))).toBeGreaterThan(0.6)
    const sennaBend = wrapAngle(headingAt(track, 0.1) - headingAt(track, 0.07))
    const sennaStraighten = wrapAngle(headingAt(track, 0.15) - headingAt(track, 0.12))
    expect(sennaBend).toBeGreaterThan(0.3)
    expect(sennaStraighten).toBeLessThan(sennaBend * 0.55)

    // The opposite side stays fast, then Descida do Lago is the long left off that approach.
    expect(Math.abs(sampleAt(track, track.length * 0.25).curvature)).toBeLessThan(0.012)
    expect(wrapAngle(headingAt(track, 0.42) - headingAt(track, 0.24))).toBeGreaterThan(1.3)

    // Junção turns left onto the climb, and the climb lines up with the start straight.
    expect(wrapAngle(headingAt(track, 0.85) - headingAt(track, 0.75))).toBeGreaterThan(0.9)
    expect(Math.abs(wrapAngle(headingAt(track, 0.02) - headingAt(track, 0.93)))).toBeLessThan(0.2)

    expect(minRadius(track)).toBeGreaterThan(20)
    expect(nearestForeign(track, 100)).toBeGreaterThan(36)
  })

  it('keeps asphalt on the centre line and grass beyond the wall', () => {
    const track = getTrack('interlagos')
    const wall = track.width / 2 + track.runoff
    for (let s = 0; s < track.length; s += 11) {
      const sample = sampleAt(track, s)
      const centre = locate(track, sample.x, sample.z, sample.s)
      expect(centre.surface, `s=${s.toFixed(0)}`).toBe('asphalt')
      expect(Math.abs(centre.lateral), `s=${s.toFixed(0)}`).toBeLessThan(1.5)

      const right = offset(sample, wall + 3)
      const grass = locate(track, right.x, right.z, sample.s)
      expect(grass.surface, `s=${s.toFixed(0)}`).toBe('grass')
      expect(Math.abs(grass.lateral), `s=${s.toFixed(0)}`).toBeGreaterThan(wall)
    }
  })

  it('puts the grid on the straight and counts every checkpoint', () => {
    const track = getTrack('interlagos')
    const world = createRace({
      track,
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      laps: 1,
      playerController: 'ai',
    })
    const player = playerRacer(world)
    const rival = world.racers[1]
    expect(rival).toBeDefined()
    if (!rival) return

    for (const racer of [player, rival]) {
      const here = locate(track, racer.vehicle.x, racer.vehicle.z, racer.lastS)
      expect(here.surface).toBe('asphalt')
      expect(Math.abs(here.lateral)).toBeLessThan(track.width / 2)
      expect(racer.nextGate).toBe(1)
      expect(racer.lap).toBe(0)
    }
    expect(
      Math.hypot(player.vehicle.x - rival.vehicle.x, player.vehicle.z - rival.vehicle.z),
    ).toBeGreaterThan(4)
    expect(Math.abs(wrapAngle(player.vehicle.yaw - rival.vehicle.yaw))).toBeLessThan(0.05)

    const straight = sampleAt(track, 10)
    const ahead = sampleAt(track, 50)
    expect(Math.abs(wrapAngle(ahead.heading - straight.heading))).toBeLessThan(0.08)
    const grid = placeOnTrack(track, 10, -2.3)
    expect(Math.hypot(grid.x - player.vehicle.x, grid.z - player.vehicle.z)).toBeLessThan(0.01)

    const crossed = new Set<number>()
    let previous = player.nextGate
    const maxSteps = 60 * 90
    let steps = 0
    let walls = 0
    let respawns = 0
    for (; steps < maxSteps; steps += 1) {
      stepRace(world, { throttle: 0, brake: 0, steer: 0 }, 1 / 60)
      for (const event of world.events) {
        if (event.type === 'wall') walls += 1
        if (event.type === 'respawn') respawns += 1
      }
      if (player.nextGate !== previous) {
        crossed.add(previous)
        previous = player.nextGate
      }
      if (player.lap >= 1 && rival.lap >= 1) break
    }
    const detail = `steps=${steps} playerLap=${player.lap} rivalLap=${rival.lap} speed=${player.vehicle.speed.toFixed(1)} walls=${walls} respawns=${respawns} gates=${[...crossed].sort((a, b) => a - b).join(',')} lap=${player.lapTimes[0]?.toFixed(1)}`
    expect(player.lap, detail).toBeGreaterThanOrEqual(1)
    expect(rival.lap, detail).toBeGreaterThanOrEqual(1)
    expect(respawns, detail).toBe(0)
    expect(walls, detail).toBe(0)
    expect(crossed, detail).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))
    expect(player.lapTimes[0], detail).toBeGreaterThan(28)
    expect(player.lapTimes[0], detail).toBeLessThan(70)
    expect(Number.isFinite(player.vehicle.x)).toBe(true)
    expect(Number.isFinite(rival.vehicle.x)).toBe(true)
  })

  it('lets an aggressive rival finish the race distance without leaving the wall', () => {
    const track = getTrack('interlagos')
    const world = createRace({
      track,
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('agresivo'),
      playerController: 'ai',
    })
    const maxSteps = 60 * 175
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
    expect(rival?.lap, detail).toBeGreaterThanOrEqual(track.laps)
    expect(respawns, detail).toBe(0)
    expect(walls, detail).toBe(0)
    expect(player.energy, detail).toBeGreaterThan(0)
  })
})

function headingAt(track: Track, fraction: number): number {
  return sampleAt(track, track.length * fraction).heading
}

function minRadius(track: Track): number {
  let radius = Infinity
  for (const sample of track.samples) {
    const curvature = Math.abs(sample.curvature)
    if (curvature > 1e-4) radius = Math.min(radius, 1 / curvature)
  }
  return radius
}

function nearestForeign(track: Track, minAlong: number): number {
  let nearest = Number.POSITIVE_INFINITY
  const samples = track.samples
  for (let i = 0; i < samples.length; i += 3) {
    const current = samples[i]
    if (!current) continue
    for (let j = i + 1; j < samples.length; j += 3) {
      const other = samples[j]
      if (!other) continue
      const along = Math.abs(other.s - current.s)
      const wrapped = Math.min(along, track.length - along)
      if (wrapped < minAlong) continue
      const distance = Math.hypot(other.x - current.x, other.z - current.z)
      if (distance < nearest) nearest = distance
    }
  }
  return nearest
}

function offset(
  sample: { x: number; z: number; heading: number },
  lateral: number,
): { x: number; z: number } {
  const rx = Math.cos(sample.heading)
  const rz = -Math.sin(sample.heading)
  return { x: sample.x + rx * lateral, z: sample.z + rz * lateral }
}
