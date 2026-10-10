import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, beforeEach } from 'vitest'
import { getPersonality } from '../../src/ai/registry.ts'
import { getCar } from '../../src/cars/registry.ts'
import { hook, readGhostDelta, resetGhostMemory } from '../../src/race/hooks/ghost.ts'
import { listHooks } from '../../src/race/hook-registry.ts'
import { createRace, respawnRacer, stepRace } from '../../src/race/world.ts'
import type { RaceWorld, Racer, RacerSnapshot } from '../../src/race/types.ts'
import { getTrack } from '../../src/tracks/registry.ts'
import { formatGhostReadout } from '../../src/ui/widgets/ghost-delta.ts'
import { listWidgets } from '../../src/ui/widget-registry.ts'

describe('ghost and best lap', () => {
  beforeEach(() => {
    resetGhostMemory()
  })

  it('is discovered as a hook and a hud widget', () => {
    expect(hook.id).toBe('ghost')
    expect(listHooks().map((item) => item.id)).toContain('ghost')
    expect(listWidgets().map((item) => item.id)).toContain('ghost-delta')
  })

  it('imports types only from the race types module', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../src/race/hooks/ghost.ts'),
      'utf8',
    )
    const imported = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1])
    expect(imported).toEqual(['../types.ts'])
    expect(source).toMatch(/import type \{/)
    expect(source).not.toMatch(/^import \{/m)
  })

  it('does not replace racers and stays quiet until a lap exists', () => {
    const world = createWorld()
    const racers = world.racers
    const marker = stub('marker')
    world.extras = [marker]
    for (let i = 0; i < 12; i += 1) sample(world, i * 0.2, i, 1000)
    expect(world.racers).toBe(racers)
    expect(world.racers.map((racer) => racer.id)).toEqual(['player', 'rival'])
    expect(world.extras).toEqual([marker])
    expect(readGhostDelta()).toMatchObject({ phase: 'recording', delta: null, bestLap: null })
  })

  it('replays the best lap and reports how far ahead you are', () => {
    const world = createWorld()
    recordLine(world, 0, 1000)
    closeLap(world, 10, 10, 100, 1000)
    const marker = stub('marker')
    world.extras = [marker]
    sample(world, 12, 140, 5000)

    const delta = readGhostDelta()
    expect(delta.phase).toBe('comparing')
    expect(delta.bestLap).toBe(10)
    expect(delta.delta).toBeCloseTo(-2, 5)

    const replay = world.extras.find((extra) => extra.id === 'ghost')
    expect(replay).toBeDefined()
    expect(world.extras[0]).toBe(marker)
    expect(world.racers).toHaveLength(2)
    expect(replay?.isPlayer).toBe(false)
    expect(replay?.name).toBe('Tu fantasma')
    expect(replay?.modelUrl).toBe(playerOf(world).modelUrl)
    expect(replay?.color).not.toBe(playerOf(world).color)
    expect(replay?.x).toBeCloseTo(1020.55, 2)
    expect(replay?.z).toBeCloseTo(0, 4)

    sample(world, 16, 140, 5000)
    expect(readGhostDelta().delta).toBeCloseTo(2, 5)
    expect(readGhostDelta().bestLap).toBe(10)
  })

  it('keeps a faster lap and ignores a slower one', () => {
    const world = createWorld()
    recordLine(world, 0, 1000)
    closeLap(world, 10, 10, 100, 5)
    recordLine(world, 11, 5)
    closeLap(world, 21, 8, 200, 800)
    expect(readGhostDelta().bestLap).toBe(8)
    const faster = world.extras.find((extra) => extra.id === 'ghost')
    expect(faster?.x).toBeCloseTo(5.55, 2)

    recordLine(world, 22, 800)
    closeLap(world, 32, 12, 300, 800)
    expect(readGhostDelta().bestLap).toBe(8)
    const still = world.extras.find((extra) => extra.id === 'ghost')
    expect(still?.x).toBeCloseTo(5.55, 2)
    expect(world.racers.map((racer) => racer.id)).toEqual(['player', 'rival'])
  })

  it('discards a lap that included a respawn', () => {
    const world = createWorld()
    recordLine(world, 0, 1000)
    const player = playerOf(world)
    world.time = 9
    world.events = [{ type: 'respawn', racerId: player.id, time: world.time }]
    advance(world)
    recordLine(world, 10, 1000)
    closeLap(world, 20, 20, 200, 1000)
    expect(readGhostDelta().bestLap).toBeNull()
    expect(world.extras.find((extra) => extra.id === 'ghost')).toBeUndefined()

    recordLine(world, 21, 40)
    closeLap(world, 31, 9, 300, 40)
    expect(readGhostDelta().bestLap).toBe(9)
    expect(world.extras.some((extra) => extra.id === 'ghost')).toBe(true)
  })

  it('does not turn a respawn teleport into time gained', () => {
    const world = createWorld()
    recordLine(world, 0, 1000)
    closeLap(world, 10, 10, 100, 1000)
    sample(world, 16, 140, 5000)
    const before = readGhostDelta()
    expect(before.phase).toBe('comparing')
    expect(before.delta).toBeCloseTo(2, 5)

    const player = playerOf(world)
    world.time = 17
    world.events = [{ type: 'respawn', racerId: player.id, time: world.time }]
    player.odometer = 500
    player.lastS = 400
    player.vehicle.x = 30
    player.vehicle.z = -10
    advance(world)

    const frozen = readGhostDelta()
    expect(frozen.phase).toBe('comparing')
    expect(frozen.delta).toBeCloseTo(2, 5)
    expect(formatGhostReadout(frozen).value).toBe('+2.000 s')

    sample(world, 25, 800, 80)
    expect(readGhostDelta().phase).toBe('comparing')
    expect(readGhostDelta().delta).toBeCloseTo(2, 5)
    expect(readGhostDelta().bestLap).toBe(10)

    closeLap(world, 26, 3, 900, 80)
    expect(readGhostDelta().bestLap).toBe(10)

    sample(world, 28, 910, 90)
    const behind = readGhostDelta()
    expect(behind.phase).toBe('comparing')
    expect(behind.bestLap).toBe(10)
    expect(behind.delta).toBeCloseTo(1, 5)
    expect(formatGhostReadout(behind).label).toBe('Atrás')

    sample(world, 29, 960, 140)
    const ahead = readGhostDelta()
    expect(ahead.phase).toBe('comparing')
    expect(ahead.bestLap).toBe(10)
    expect(ahead.delta).toBeCloseTo(-3, 5)
    expect(formatGhostReadout(ahead).label).toBe('Adelante')
  })

  it('freezes the delta when R drops the respawn event before the hook', () => {
    const world = createWorld()
    recordLine(world, 0, 1000)
    closeLap(world, 10, 10, 100, 1000)
    sample(world, 16, 140, 5000)
    expect(readGhostDelta().delta).toBeCloseTo(2, 5)

    const player = playerOf(world)
    world.time = 17
    respawnRacer(world, player)
    player.odometer += 300
    stepRace(world, { throttle: 1, brake: 0, steer: 0 }, 1 / 60)

    const after = readGhostDelta()
    expect(after.phase).toBe('comparing')
    expect(after.delta).toBeCloseTo(2, 5)
    expect(after.bestLap).toBe(10)
    expect(formatGhostReadout(after).value).not.toBe('Grabando')
  })

  it('shows Grabando when a respawn lands before any honest delta', () => {
    const world = createWorld()
    recordLine(world, 0, 1000)
    const player = playerOf(world)
    world.time = 9
    world.events = [{ type: 'respawn', racerId: player.id, time: world.time }]
    player.odometer = 400
    player.lastS = 250
    advance(world)
    expect(readGhostDelta()).toMatchObject({ phase: 'recording', delta: null, bestLap: null })
    expect(formatGhostReadout(readGhostDelta()).value).toBe('Grabando')

    closeLap(world, 12, 4, 500, 20)
    expect(readGhostDelta().bestLap).toBeNull()
    expect(formatGhostReadout(readGhostDelta()).value).toBe('Grabando')
  })

  it('keeps the best lap for the next race and not for another track', () => {
    const world = createWorld()
    recordLine(world, 0, 1000)
    closeLap(world, 10, 10, 100, 1000)

    const next = createWorld()
    advance(next)
    expect(readGhostDelta().bestLap).toBe(10)
    expect(next.extras.some((extra) => extra.id === 'ghost')).toBe(true)
    expect(next.racers).toHaveLength(2)
    expect(next.racers[0]?.id).toBe('player')

    const original = next.track
    next.track = { ...original, id: 'otro-circuito' }
    next.extras = []
    next.time = 1
    advance(next)
    expect(readGhostDelta().phase).toBe('recording')
    expect(next.extras.some((extra) => extra.id === 'ghost')).toBe(false)

    next.track = original
    next.extras = []
    next.time = 2
    advance(next)
    expect(readGhostDelta().bestLap).toBe(10)
    expect(next.extras.some((extra) => extra.id === 'ghost')).toBe(true)
  })

  it('spawns the ghost after a real lap without touching the field', () => {
    const world = createRace({
      track: getTrack('gradiente'),
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      laps: 2,
      playerController: 'ai',
    })
    const racers = world.racers
    const player = playerOf(world)
    let respawns = 0
    const maxSteps = 60 * 90
    let steps = 0
    for (; steps < maxSteps && player.lap < 1; steps += 1) {
      stepRace(world, { throttle: 0, brake: 0, steer: 0 }, 1 / 60)
      if (world.events.some((event) => event.type === 'respawn' && event.racerId === player.id)) {
        respawns += 1
      }
    }
    const detail = `steps=${steps} lap=${player.lap} respawns=${respawns} s=${player.lastS.toFixed(1)}`
    expect(player.lap, detail).toBeGreaterThanOrEqual(1)
    expect(player.finished, detail).toBe(false)
    expect(respawns, detail).toBe(0)
    expect(world.racers, detail).toBe(racers)
    expect(readGhostDelta().bestLap, detail).toBeGreaterThan(15)
    const replay = world.extras.find((extra) => extra.id === 'ghost')
    expect(replay, detail).toBeDefined()
    expect(Number.isFinite(readGhostDelta().delta), detail).toBe(true)
    expect(world.racers).toHaveLength(2)
  }, 20_000)
})

describe('ghost delta copy', () => {
  it('speaks the gap in rioplatense without an em dash', () => {
    expect(formatGhostReadout({ phase: 'recording', delta: null, bestLap: null })).toEqual({
      label: 'Fantasma',
      value: 'Grabando',
      tone: 'recording',
      live: 'Todavía no hay mejor vuelta.',
    })
    const ahead = formatGhostReadout({ phase: 'comparing', delta: -0.234, bestLap: 41 })
    expect(ahead).toMatchObject({
      label: 'Adelante',
      value: '-0.234 s',
      tone: 'ahead',
      live: 'Vas 0.234 s adelante de tu mejor vuelta.',
    })
    const behind = formatGhostReadout({ phase: 'comparing', delta: 1.5, bestLap: 41 })
    expect(behind).toMatchObject({
      label: 'Atrás',
      value: '+1.500 s',
      tone: 'behind',
      live: 'Vas 1.500 s atrás de tu mejor vuelta.',
    })
    const even = formatGhostReadout({ phase: 'comparing', delta: 0.02, bestLap: 41 })
    expect(even).toMatchObject({ label: 'Fantasma', value: '0.000 s', tone: 'even' })
    const minute = formatGhostReadout({ phase: 'comparing', delta: -61, bestLap: 80 })
    expect(minute.value).toBe('-1:01.000 s')
    expect(minute.live).toBe('Vas 1:01.000 s adelante de tu mejor vuelta.')
    const copy = [ahead, behind, even, minute].flatMap((view) => [
      view.label,
      view.value,
      view.live,
    ])
    expect(copy.join(' ')).not.toMatch(/[—–]|[\u{1F300}-\u{1FAFF}]/u)
  })
})

function createWorld(): RaceWorld {
  return createRace({
    track: getTrack('gradiente'),
    player: getCar('flash-7b'),
    rival: getCar('reasoner-70b'),
    personality: getPersonality('cauto'),
    laps: 3,
  })
}

function playerOf(world: RaceWorld): Racer {
  const player = world.racers.find((racer) => racer.isPlayer)
  if (!player) throw new Error('Race has no player')
  return player
}

function advance(world: RaceWorld): void {
  const run = hook.afterStep
  if (!run) throw new Error('ghost hook has no afterStep')
  run(world, 1 / 60)
}

function sample(world: RaceWorld, time: number, odometer: number, x: number): void {
  const player = playerOf(world)
  world.time = time
  world.events = []
  player.finished = false
  player.vehicle.x = x
  player.vehicle.z = 0
  player.vehicle.yaw = 0
  player.vehicle.speed = 20
  player.vehicle.steer = 0
  player.vehicle.slipFront = 0
  player.vehicle.slipRear = 0
  player.lastS = odometer
  player.odometer = odometer
  advance(world)
}

/** Ten samples, one second apart, so the lap is long enough to keep. */
function recordLine(world: RaceWorld, startTime: number, x0: number): void {
  for (let i = 0; i < 10; i += 1) {
    const time = startTime + i
    sample(world, time, time * 10, x0 + i * 10)
  }
}

function closeLap(
  world: RaceWorld,
  time: number,
  lapTime: number,
  odometer: number,
  x: number,
): void {
  const player = playerOf(world)
  world.time = time
  world.events = [{ type: 'lap', racerId: player.id, time }]
  player.finished = false
  player.lap += 1
  player.lapTimes = [...player.lapTimes, lapTime]
  player.lapStartedAt = time
  player.odometer = odometer
  player.lastS = 0
  player.vehicle.x = x
  player.vehicle.z = 0
  player.vehicle.yaw = 0
  advance(world)
}

function stub(id: string): RacerSnapshot {
  return {
    id,
    carId: 'flash-7b',
    name: id,
    isPlayer: false,
    color: '#ffffff',
    modelUrl: '/assets/models/raceCarRed.dae',
    x: 0,
    z: 0,
    yaw: 0,
    steer: 0,
    speed: 0,
    slip: 0,
    surface: 'asphalt',
    lap: 0,
    lapTimes: [],
    sectorTimes: [],
    gate: 0,
    energy: 1,
    energyCapacity: 1,
    condition: 1,
    finished: false,
    finishTime: null,
    position: 0,
    odometer: 0,
  }
}
