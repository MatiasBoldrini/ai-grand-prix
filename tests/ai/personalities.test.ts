import { describe, expect, it } from 'vitest'
import { driveAi } from '../../src/ai/driver.ts'
import { getPersonality, listPersonalities } from '../../src/ai/registry.ts'
import type { Personality } from '../../src/ai/types.ts'
import { getCar } from '../../src/cars/registry.ts'
import { createRace, stepRace } from '../../src/race/world.ts'
import { getTrack } from '../../src/tracks/registry.ts'
import { locate, sampleAt } from '../../src/tracks/spline.ts'
import type { Track } from '../../src/tracks/types.ts'

const DT = 1 / 60

describe('rival personalities', () => {
  it('loads Agresivo and Creativo for the garage', () => {
    const ids = listPersonalities().map((personality) => personality.id)
    expect(ids).toEqual(expect.arrayContaining(['agresivo', 'cauto', 'creativo']))
    expect(ids.length).toBeGreaterThan(1)

    const agresivo = getPersonality('agresivo')
    const creativo = getPersonality('creativo')
    const cauto = getPersonality('cauto')

    expect(agresivo.name).toBe('Agresivo')
    expect(creativo.name).toBe('Creativo')
    expect(agresivo.blurb).toBe('Frena tarde, se mete pasado a la curva y no toca el atajo.')
    expect(creativo.blurb).toBe('Se abre de la cuerda y agarra el corte apenas lo tiene a tiro.')
    for (const blurb of [agresivo.blurb, creativo.blurb]) {
      expect(blurb).not.toMatch(/\u2014/)
      expect(blurb).not.toMatch(/\p{Extended_Pictographic}/u)
    }

    expect(agresivo.takesShortcuts).toBe(false)
    expect(creativo.takesShortcuts).toBe(true)
    expect(agresivo.aggression).toBeGreaterThan(cauto.aggression)
    expect(agresivo.lookAhead).toBeLessThan(cauto.lookAhead)
    expect(creativo.lineHold).toBeLessThan(cauto.lineHold)
  })

  it('brakes later than Cauto into the same corner', () => {
    const track = getTrack('gradiente')
    const corner = sharpestS(track)
    const early = pedalsAt(getPersonality('cauto'), track, corner - 28, 26)
    const late = pedalsAt(getPersonality('agresivo'), track, corner - 28, 26)
    const committed = pedalsAt(getPersonality('agresivo'), track, corner - 16, 26)

    expect(early.brake).toBeGreaterThan(0.5)
    expect(early.throttle).toBe(0)
    expect(late.brake).toBe(0)
    expect(late.throttle).toBe(1)
    expect(committed.brake).toBeGreaterThan(0.5)
  })

  it('puts the creative car on the shortcut and back on the racing line', () => {
    const watched = watch('creativo', 'flash-7b', 70)
    const track = getTrack('gradiente')
    const cut = track.shortcuts[0]

    expect(watched.shortcut).toBeGreaterThanOrEqual(10)
    expect(watched.cut).not.toBeNull()
    expect(cut).toBeDefined()
    if (watched.cut && cut) {
      const along =
        ((watched.cut.x - cut.x0) * (cut.x1 - cut.x0) +
          (watched.cut.z - cut.z0) * (cut.z1 - cut.z0)) /
        ((cut.x1 - cut.x0) ** 2 + (cut.z1 - cut.z0) ** 2)
      expect(along).toBeGreaterThan(0.2)
      expect(along).toBeLessThan(0.95)
      const vx = cut.x1 - cut.x0
      const vz = cut.z1 - cut.z0
      const length = Math.hypot(vx, vz)
      const side = Math.abs(
        ((watched.cut.x - cut.x0) * vz - (watched.cut.z - cut.z0) * vx) / length,
      )
      expect(side).toBeLessThanOrEqual(cut.halfWidth)
    }
    expect(watched.rejoined).toBe(true)
    expect(watched.lap).toBeGreaterThanOrEqual(1)
    expect(watched.walls).toBe(0)
    expect(watched.grass).toBe(0)
    expect(watched.minSpeed).toBeGreaterThan(-15)
    expect(watched.maxSpeed).toBeLessThan(50)
  })

  it('runs Creativo wider than Cauto without leaving the lap', () => {
    const loose = watch('creativo', 'reasoner-70b', 50)
    const tight = watch('cauto', 'reasoner-70b', 50)

    expect(loose.lap).toBeGreaterThanOrEqual(1)
    expect(tight.lap).toBeGreaterThanOrEqual(1)
    expect(loose.peakLateral).toBeGreaterThan(tight.peakLateral + 3)
    expect(loose.walls).toBe(0)
    expect(loose.minSpeed).toBeGreaterThan(-8)
    expect(loose.maxSpeed).toBeLessThan(50)
  })

  it('keeps Agresivo off the shortcut while carrying more corner speed', () => {
    const late = watch('agresivo', 'reasoner-70b', 55)
    const cautious = watch('cauto', 'reasoner-70b', 55)
    const slidey = watch('agresivo', 'flash-7b', 75)

    expect(late.shortcut).toBe(0)
    expect(slidey.shortcut).toBe(0)
    expect(late.lap).toBeGreaterThanOrEqual(1)
    expect(slidey.lap).toBeGreaterThanOrEqual(1)
    expect(late.walls).toBe(0)
    expect(slidey.walls).toBeLessThanOrEqual(1)
    expect(late.speedAt80).not.toBeNull()
    expect(cautious.speedAt80).not.toBeNull()
    expect(late.speedAt80 ?? 0).toBeGreaterThan((cautious.speedAt80 ?? 0) + 0.8)
    expect(late.minSpeed).toBeGreaterThan(-8)
    expect(slidey.minSpeed).toBeGreaterThan(-20)
    expect(late.maxSpeed).toBeLessThan(50)
    expect(slidey.maxSpeed).toBeLessThan(50)
  })
})

function pedalsAt(personality: Personality, track: Track, s: number, speed: number) {
  const pose = sampleAt(track, s)
  return driveAi({
    personality,
    track,
    x: pose.x,
    z: pose.z,
    yaw: pose.heading,
    speed,
    s,
    lateral: 0,
  })
}

function sharpestS(track: Track): number {
  let best = track.samples[0]
  if (!best) throw new Error('Track has no samples')
  for (const sample of track.samples) {
    if (Math.abs(sample.curvature) > Math.abs(best.curvature)) best = sample
  }
  return best.s
}

function watch(personalityId: string, carId: 'flash-7b' | 'reasoner-70b', seconds: number) {
  const world = createRace({
    track: getTrack('gradiente'),
    player: getCar(carId === 'flash-7b' ? 'reasoner-70b' : 'flash-7b'),
    rival: getCar(carId),
    personality: getPersonality(personalityId),
    laps: 1,
    playerController: 'human',
  })
  let shortcut = 0
  let walls = 0
  let grass = 0
  let minSpeed = 0
  let maxSpeed = 0
  let peakLateral = 0
  let speedAt80: number | null = null
  let cut: { x: number; z: number } | null = null
  let rejoined = false
  const steps = Math.round(seconds / DT)
  for (let i = 0; i < steps; i += 1) {
    stepRace(world, { throttle: 0, brake: 1, steer: 0 }, DT)
    const rival = world.racers[1]
    if (!rival) break
    if (rival.surface === 'shortcut') {
      shortcut += 1
      if (!cut) cut = { x: rival.vehicle.x, z: rival.vehicle.z }
    } else if (cut && rival.surface === 'asphalt') rejoined = true
    if (rival.surface === 'grass') grass += 1
    minSpeed = Math.min(minSpeed, rival.vehicle.speed)
    maxSpeed = Math.max(maxSpeed, rival.vehicle.speed)
    const place = locate(world.track, rival.vehicle.x, rival.vehicle.z, rival.lastS)
    peakLateral = Math.max(peakLateral, Math.abs(place.lateral))
    if (speedAt80 === null && rival.lastS >= 80 && rival.lastS < 100)
      speedAt80 = rival.vehicle.speed
    for (const event of world.events) {
      if (event.racerId === rival.id && event.type === 'wall') walls += 1
    }
    if (rival.lap >= 1) break
  }
  return {
    shortcut,
    walls,
    grass,
    lap: world.racers[1]?.lap ?? 0,
    time: world.time,
    minSpeed,
    maxSpeed,
    peakLateral,
    speedAt80,
    cut,
    rejoined,
  }
}
