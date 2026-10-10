import { describe, expect, it } from 'vitest'
import { getPersonality } from '../../src/ai/registry.ts'
import { getCar } from '../../src/cars/registry.ts'
import { createRace, playerRacer, stepRace } from '../../src/race/world.ts'
import { getTrack, listTracks } from '../../src/tracks/registry.ts'
import { locate, sampleAt } from '../../src/tracks/spline.ts'
import type { Track } from '../../src/tracks/types.ts'

describe('costanera', () => {
  it('joins the registry so the menu can offer more than one circuit', () => {
    const ids = listTracks().map((track) => track.id)
    expect(ids).toContain('costanera')
    expect(ids).toContain('gradiente')
    expect(new Set(ids).size).toBe(ids.length)
    expect(listTracks().length).toBeGreaterThan(1)

    const track = getTrack('costanera')
    expect(track.name).toBe('Circuito de la Costanera')
    expect(track.description.length).toBeGreaterThan(20)
    expect(track.laps).toBe(3)
    expect(track.width).toBe(18)
    expect(track.runoff).toBe(11)
    expect(track.shortcuts.map((shortcut) => shortcut.id)).toEqual(['corte-del-parque'])
    expect(track.shortcuts[0]?.name).toBe('Corte del parque')
  })

  it('is a closed loop with asphalt on the centre line and grass outside the runoff', () => {
    const track = getTrack('costanera')
    expect(track.length).toBeGreaterThan(760)
    expect(track.length).toBeLessThan(880)
    expect(track.samples.length).toBeGreaterThan(400)

    const start = sampleAt(track, 0)
    const end = sampleAt(track, track.length - 0.01)
    expect(Math.hypot(start.x - end.x, start.z - end.z)).toBeLessThan(3)

    const wall = track.width / 2 + track.runoff
    for (let s = 0; s < track.length; s += 12) {
      const sample = sampleAt(track, s)
      const centre = locate(track, sample.x, sample.z, sample.s)
      expect(centre.surface, `s=${s.toFixed(0)}`).toBe('asphalt')
      expect(Math.abs(centre.lateral), `s=${s.toFixed(0)}`).toBeLessThan(1.5)

      const right = offset(sample, wall + 4)
      const grass = locate(track, right.x, right.z, sample.s)
      expect(grass.surface, `s=${s.toFixed(0)}`).toBe('grass')
      expect(Math.abs(grass.lateral), `s=${s.toFixed(0)}`).toBeGreaterThan(wall)
    }
  })

  it('keeps the park cut on shortcut surface and inside the wall', () => {
    const track = getTrack('costanera')
    const shortcut = track.shortcuts[0]
    expect(shortcut).toBeDefined()
    if (!shortcut) return
    const chord = Math.hypot(shortcut.x1 - shortcut.x0, shortcut.z1 - shortcut.z0)
    expect(chord).toBeGreaterThan(90)
    expect(chord).toBeLessThan(track.length * 0.25)

    const entry = locate(track, shortcut.x0, shortcut.z0)
    const exit = locate(track, shortcut.x1, shortcut.z1)
    let along = exit.s - entry.s
    if (along < 0) along += track.length
    expect(along).toBeGreaterThan(chord)

    const wall = track.width / 2 + track.runoff
    for (const t of [0.42, 0.5, 0.58]) {
      const x = shortcut.x0 + (shortcut.x1 - shortcut.x0) * t
      const z = shortcut.z0 + (shortcut.z1 - shortcut.z0) * t
      const here = locate(track, x, z)
      expect(here.surface, `t=${t}`).toBe('shortcut')
      expect(Math.abs(here.lateral), `t=${t}`).toBeLessThanOrEqual(wall)
      expect(Math.abs(here.lateral), `t=${t}`).toBeGreaterThan(track.width / 2)
    }
  })

  it('does not fold back on itself and keeps corners drivable', () => {
    const track = getTrack('costanera')
    expect(nearestForeignSample(track)).toBeGreaterThan(28)
    const sharpest = track.samples.reduce(
      (max, sample) => Math.max(max, Math.abs(sample.curvature)),
      0,
    )
    expect(sharpest).toBeGreaterThan(0.005)
    expect(1 / sharpest).toBeGreaterThan(30)
  })

  it('lets both cars complete a lap without respawning', () => {
    const world = createRace({
      track: getTrack('costanera'),
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      laps: 1,
      playerController: 'ai',
    })
    const maxSteps = 60 * 80
    let walls = 0
    let respawns = 0
    let steps = 0
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
    const detail = `steps=${steps} playerLap=${player.lap} speed=${player.vehicle.speed.toFixed(1)} walls=${walls} respawns=${respawns} rivalLap=${rival?.lap} lap=${player.lapTimes[0]?.toFixed(1)}`
    expect(player.lap, detail).toBeGreaterThanOrEqual(1)
    expect(rival?.lap, detail).toBeGreaterThanOrEqual(1)
    expect(respawns, detail).toBe(0)
    expect(walls, detail).toBeLessThanOrEqual(1)
    expect(player.lapTimes[0], detail).toBeGreaterThan(24)
    expect(player.lapTimes[0], detail).toBeLessThan(42)
    expect(Number.isFinite(player.vehicle.x)).toBe(true)
    expect(Number.isFinite(rival?.vehicle.x)).toBe(true)
  })
})

function offset(
  sample: { x: number; z: number; heading: number },
  lateral: number,
): { x: number; z: number } {
  const rx = Math.cos(sample.heading)
  const rz = -Math.sin(sample.heading)
  return { x: sample.x + rx * lateral, z: sample.z + rz * lateral }
}

function nearestForeignSample(track: Track): number {
  let nearest = Number.POSITIVE_INFINITY
  const samples = track.samples
  for (let i = 0; i < samples.length; i += 2) {
    const current = samples[i]
    if (!current) continue
    for (let j = i + 1; j < samples.length; j += 2) {
      const other = samples[j]
      if (!other) continue
      const along = Math.abs(other.s - current.s)
      const wrapped = Math.min(along, track.length - along)
      if (wrapped < 70) continue
      const distance = Math.hypot(other.x - current.x, other.z - current.z)
      if (distance < nearest) nearest = distance
    }
  }
  return nearest
}
