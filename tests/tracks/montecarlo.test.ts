import { describe, expect, it } from 'vitest'
import { getPersonality } from '../../src/ai/registry.ts'
import { getCar } from '../../src/cars/registry.ts'
import { createRace, playerRacer, stepRace } from '../../src/race/world.ts'
import { getTrack, listTracks } from '../../src/tracks/registry.ts'
import { locate, placeOnTrack, sampleAt } from '../../src/tracks/spline.ts'
import type { Track } from '../../src/tracks/types.ts'

describe('montecarlo', () => {
  it('joins the registry with the street-circuit name', () => {
    const ids = listTracks().map((track) => track.id)
    expect(ids).toContain('montecarlo')
    expect(new Set(ids).size).toBe(ids.length)

    const track = getTrack('montecarlo')
    expect(track.name).toBe('Circuito de Montecarlo')
    expect(track.description).toMatch(/Sainte Dévote/)
    expect(track.description).toMatch(/Massenet/)
    expect(track.description).toMatch(/Casino/)
    expect(track.description).toMatch(/horquilla/)
    expect(track.description).toMatch(/túnel/)
    expect(track.description).toMatch(/piscina/)
    expect(track.description).toMatch(/Rascasse/)
    expect(track.laps).toBe(2)
    expect(track.width).toBeLessThan(getTrack('embeddings').width)
    expect(track.runoff).toBeLessThan(6)
    expect(track.shortcuts).toEqual([])
    expect(track.gates).toBeGreaterThanOrEqual(8)
  })

  it('is a closed street loop with asphalt on the line and grass beyond the wall', () => {
    const track = getTrack('montecarlo')
    expect(track.length).toBeGreaterThan(1600)
    expect(track.length).toBeLessThan(2200)
    expect(track.samples.length).toBeGreaterThan(400)

    const start = sampleAt(track, 0)
    const end = sampleAt(track, track.length - 0.01)
    expect(Math.hypot(start.x - end.x, start.z - end.z)).toBeLessThan(3)

    const wall = track.width / 2 + track.runoff
    for (let s = 0; s < track.length; s += 10) {
      const sample = sampleAt(track, s)
      const centre = locate(track, sample.x, sample.z, sample.s)
      expect(centre.surface, `s=${s.toFixed(0)}`).toBe('asphalt')
      expect(Math.abs(centre.lateral), `s=${s.toFixed(0)}`).toBeLessThan(1.5)

      const right = offset(sample, wall + 3)
      const grass = locate(track, right.x, right.z, sample.s)
      expect(grass.surface, `s=${s.toFixed(0)}`).toBe('grass')
    }
  })

  it('keeps the start grid on the asphalt and inside the walls', () => {
    const track = getTrack('montecarlo')
    const wall = track.width / 2 + track.runoff
    for (const s of [10, 14]) {
      for (const lateral of [-2.3, 2.3]) {
        const pose = placeOnTrack(track, s, lateral)
        const here = locate(track, pose.x, pose.z, s)
        expect(here.surface, `s=${s} lat=${lateral}`).toBe('asphalt')
        expect(Math.abs(here.lateral), `s=${s} lat=${lateral}`).toBeLessThan(track.width / 2)
        expect(Math.abs(here.lateral), `s=${s} lat=${lateral}`).toBeLessThan(wall - 1)
      }
    }
  })

  it('keeps the hairpin tighter than the tunnel straight', () => {
    const track = getTrack('montecarlo')
    const radius = minRadius(track)
    expect(radius).toBeGreaterThan(40)
    expect(radius).toBeLessThan(80)
    expect(maxRadius(track)).toBeGreaterThan(radius * 5)
  })

  it('lets the cautious and the creative rival finish a lap without touching a wall', () => {
    for (const personalityId of ['cauto', 'creativo'] as const) {
      const world = createRace({
        track: getTrack('montecarlo'),
        player: getCar('flash-7b'),
        rival: getCar('reasoner-70b'),
        personality: getPersonality(personalityId),
        laps: 1,
        playerController: 'ai',
      })
      const maxSteps = 60 * 120
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
      const detail = `${personalityId} steps=${steps} playerLap=${player.lap} walls=${walls} respawns=${respawns} lap=${player.lapTimes[0]?.toFixed(1)} rivalLap=${rival?.lap} energy=${player.energy.toFixed(1)}`
      expect(player.lap, detail).toBeGreaterThanOrEqual(1)
      expect(rival?.lap, detail).toBeGreaterThanOrEqual(1)
      expect(respawns, detail).toBe(0)
      expect(walls, detail).toBe(0)
      expect(player.lapTimes[0], detail).toBeGreaterThan(40)
      expect(player.lapTimes[0], detail).toBeLessThan(100)
      expect(Number.isFinite(player.vehicle.x), detail).toBe(true)
      expect(Number.isFinite(rival?.vehicle.x), detail).toBe(true)
    }
  })

  it('finishes the race distance with energy left', () => {
    const track = getTrack('montecarlo')
    const world = createRace({
      track,
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      playerController: 'ai',
    })
    const maxSteps = 60 * 170
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

function offset(
  sample: { x: number; z: number; heading: number },
  lateral: number,
): { x: number; z: number } {
  const rx = Math.cos(sample.heading)
  const rz = -Math.sin(sample.heading)
  return { x: sample.x + rx * lateral, z: sample.z + rz * lateral }
}

function minRadius(track: Track): number {
  let radius = Infinity
  for (const sample of track.samples) {
    const curvature = Math.abs(sample.curvature)
    if (curvature > 1e-4) radius = Math.min(radius, 1 / curvature)
  }
  return radius
}

function maxRadius(track: Track): number {
  let radius = 0
  for (const sample of track.samples) {
    const curvature = Math.abs(sample.curvature)
    if (curvature > 1e-4) radius = Math.max(radius, 1 / curvature)
  }
  return radius
}
