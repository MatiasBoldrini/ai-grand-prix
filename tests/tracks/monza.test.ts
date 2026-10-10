import { describe, expect, it } from 'vitest'
import { getPersonality } from '../../src/ai/registry.ts'
import { getCar } from '../../src/cars/registry.ts'
import { createRace, playerRacer, stepRace } from '../../src/race/world.ts'
import { getTrack, listTracks } from '../../src/tracks/registry.ts'
import { locate, placeOnTrack, sampleAt } from '../../src/tracks/spline.ts'
import type { Track } from '../../src/tracks/types.ts'

describe('monza', () => {
  it('joins the registry as Autódromo de Monza', () => {
    const ids = listTracks().map((track) => track.id)
    expect(ids).toContain('monza')
    expect(ids).toContain('gradiente')
    expect(new Set(ids).size).toBe(ids.length)

    const track = getTrack('monza')
    expect(track.name).toBe('Autódromo de Monza')
    expect(track.description.length).toBeGreaterThan(20)
    expect(track.laps).toBe(2)
    expect(track.width).toBe(18)
    expect(track.runoff).toBe(12)
    expect(track.shortcuts.map((shortcut) => shortcut.id)).toEqual(['corte-del-rettifilo'])
    expect(track.shortcuts[0]?.name).toBe('Corte del Rettifilo')
  })

  it('is a closed loop with asphalt on the centre line and grass outside the runoff', () => {
    const track = getTrack('monza')
    expect(track.length).toBeGreaterThan(1100)
    expect(track.length).toBeLessThan(1400)
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
    }

    for (const s of [40, 80, 120, 820, 880, 940]) {
      const sample = sampleAt(track, s)
      for (const side of [1, -1]) {
        const grassPoint = offset(sample, (wall + 4) * side)
        const grass = locate(track, grassPoint.x, grassPoint.z, sample.s)
        expect(grass.surface, `straight s=${s} side=${side}`).toBe('grass')
        expect(Math.abs(grass.lateral), `straight s=${s} side=${side}`).toBeGreaterThan(wall)
      }
    }

    for (const lateral of [-2.3, 2.3]) {
      const pose = placeOnTrack(track, 10, lateral)
      const here = locate(track, pose.x, pose.z, 10)
      expect(here.surface, `grid ${lateral}`).toBe('asphalt')
      expect(Math.abs(here.lateral - lateral), `grid ${lateral}`).toBeLessThan(0.4)
    }
  })

  it('keeps the Rettifilo cut off the asphalt and inside the wall', () => {
    const track = getTrack('monza')
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
    const track = getTrack('monza')
    expect(nearestForeignSample(track)).toBeGreaterThan(40)
    const sharpest = track.samples.reduce(
      (max, sample) => Math.max(max, Math.abs(sample.curvature)),
      0,
    )
    expect(sharpest).toBeGreaterThan(0.005)
    expect(1 / sharpest).toBeGreaterThan(16)
  })

  it('lets both cars complete a lap without respawning', () => {
    const world = createRace({
      track: getTrack('monza'),
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      laps: 1,
      playerController: 'ai',
    })
    const outcome = runUntil(world, 60 * 80, (current) => {
      const player = playerRacer(current)
      const rival = current.racers[1]
      return player.lap >= 1 && Boolean(rival && rival.lap >= 1)
    })
    const player = playerRacer(world)
    const rival = world.racers[1]
    const detail = `steps=${outcome.steps} playerLap=${player.lap} rivalLap=${rival?.lap} walls=${outcome.walls} respawns=${outcome.respawns} lap=${player.lapTimes[0]?.toFixed(1)} maxSpeed=${outcome.maxSpeed.toFixed(1)}`
    expect(player.lap, detail).toBeGreaterThanOrEqual(1)
    expect(rival?.lap, detail).toBeGreaterThanOrEqual(1)
    expect(outcome.respawns, detail).toBe(0)
    expect(outcome.walls, detail).toBe(0)
    expect(outcome.exploded, detail).toBe(false)
    expect(player.lapTimes[0], detail).toBeGreaterThan(36)
    expect(player.lapTimes[0], detail).toBeLessThan(70)
    expect(Number.isFinite(player.vehicle.x)).toBe(true)
    expect(Number.isFinite(rival?.vehicle.x)).toBe(true)
  })

  it('finishes the two-lap race with energy left', () => {
    const track = getTrack('monza')
    const world = createRace({
      track,
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      playerController: 'ai',
    })
    const outcome = runUntil(
      world,
      60 * 140,
      (current) => current.finished && (current.racers[1]?.lap ?? 0) >= track.laps,
    )
    const player = playerRacer(world)
    const rival = world.racers[1]
    const detail = `steps=${outcome.steps} laps=${player.lap}/${rival?.lap} walls=${outcome.walls} respawns=${outcome.respawns} energy=${player.energy.toFixed(1)}/${rival?.energy.toFixed(1)} maxSpeed=${outcome.maxSpeed.toFixed(1)}`
    expect(world.finished, detail).toBe(true)
    expect(player.lap, detail).toBeGreaterThanOrEqual(track.laps)
    expect(rival?.lap, detail).toBeGreaterThanOrEqual(track.laps)
    expect(outcome.respawns, detail).toBe(0)
    expect(outcome.walls, detail).toBe(0)
    expect(outcome.exploded, detail).toBe(false)
    expect(player.energy, detail).toBeGreaterThan(0)
    expect(rival?.energy, detail).toBeGreaterThan(0)
  })
})

function runUntil(
  world: ReturnType<typeof createRace>,
  maxSteps: number,
  done: (world: ReturnType<typeof createRace>) => boolean,
): { steps: number; walls: number; respawns: number; maxSpeed: number; exploded: boolean } {
  let walls = 0
  let respawns = 0
  let maxSpeed = 0
  let exploded = false
  let steps = 0
  for (; steps < maxSteps; steps += 1) {
    stepRace(world, { throttle: 0, brake: 0, steer: 0 }, 1 / 60)
    for (const event of world.events) {
      if (event.type === 'wall') walls += 1
      if (event.type === 'respawn') respawns += 1
    }
    for (const racer of world.racers) {
      const speed = Math.abs(racer.vehicle.speed)
      if (speed > maxSpeed) maxSpeed = speed
      if (speed > 80 || !Number.isFinite(racer.vehicle.x)) exploded = true
    }
    if (exploded || done(world)) break
  }
  return { steps, walls, respawns, maxSpeed, exploded }
}

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
