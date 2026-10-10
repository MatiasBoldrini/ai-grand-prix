import { driveAi } from '../ai/driver.ts'
import type { Personality } from '../ai/types.ts'
import { applyTuning } from '../cars/apply-tuning.ts'
import { paramsFromStats } from '../cars/params.ts'
import type { CarDefinition } from '../cars/types.ts'
import { clamp } from '../core/math.ts'
import { surfaceGrip } from '../physics/surfaces.ts'
import type { VehicleInput, VehicleParams } from '../physics/types.ts'
import { createVehicleState, stepVehicle } from '../physics/vehicle.ts'
import { IDLE_INPUT } from '../physics/types.ts'
import { locate, placeOnTrack } from '../tracks/spline.ts'
import type { Track } from '../tracks/types.ts'
import { collideWall, separateCars } from './contact.ts'
import { listHooks } from './hook-registry.ts'
import { noteProgress } from './progress.ts'
import type { RaceEvent, Racer, RacerSnapshot, RaceSnapshot, RaceWorld } from './types.ts'

/** Respawn requested before this step (the R key) or during it (the grass rescue). */
const respawnQueued = new Set<Racer>()

export interface CreateRaceOptions {
  track: Track
  player: CarDefinition
  rival: CarDefinition
  personality: Personality
  laps?: number
  playerController?: 'human' | 'ai'
}

export function createRace(options: CreateRaceOptions): RaceWorld {
  const laps = options.laps ?? options.track.laps
  const player = spawnRacer({
    id: 'player',
    name: 'Vos',
    car: options.player,
    isPlayer: true,
    controller: options.playerController ?? 'human',
    personalityId: null,
    track: options.track,
    lateral: -2.3,
  })
  const rival = spawnRacer({
    id: 'rival',
    name: options.rival.name,
    car: options.rival,
    isPlayer: false,
    controller: 'ai',
    personalityId: options.personality.id,
    track: options.track,
    lateral: 2.3,
  })
  return {
    track: options.track,
    laps,
    time: 0,
    finished: false,
    racers: [player, rival],
    extras: [],
    events: [],
    personality: options.personality,
  }
}

export function stepRace(world: RaceWorld, human: VehicleInput, dt: number): void {
  world.events = []
  world.extras = []
  const driven: VehicleInput[] = []

  for (const racer of world.racers) {
    racer.grace = Math.max(0, racer.grace - dt)
    racer.wallCooldown = Math.max(0, racer.wallCooldown - dt)
    racer.carCooldown = Math.max(0, racer.carCooldown - dt)
    const before = locate(world.track, racer.vehicle.x, racer.vehicle.z, racer.lastS)
    let input = human
    if (racer.finished) input = { throttle: 0, brake: 1, steer: 0 }
    else if (racer.controller === 'ai') {
      input = driveAi({
        personality: world.personality,
        track: world.track,
        x: racer.vehicle.x,
        z: racer.vehicle.z,
        yaw: racer.vehicle.yaw,
        speed: racer.vehicle.speed,
        s: before.s,
        lateral: before.lateral,
      })
    }
    driven.push(input)
    if (!racer.finished) {
      racer.energy = Math.max(0, racer.energy - input.throttle * racer.energyRate * dt)
    }
    const params = scaledParams(racer)
    const mu = surfaceGrip(before.surface)
    racer.vehicle = stepVehicle(racer.vehicle, input, params, mu, dt)
  }

  const player = world.racers[0]
  const rival = world.racers[1]
  if (player && rival && separateCars(player.vehicle, rival.vehicle, player.params, rival.params)) {
    if (player.carCooldown <= 0) {
      pushEvent(world, 'collision', player.id)
      player.carCooldown = 0.35
      rival.carCooldown = 0.35
    }
  }

  world.racers.forEach((racer, index) => {
    const after = locate(world.track, racer.vehicle.x, racer.vehicle.z, racer.lastS)
    if (
      collideWall(racer.vehicle, after, world.track.runoff, racer.params) &&
      racer.wallCooldown <= 0
    ) {
      pushEvent(world, 'wall', racer.id)
      racer.wallCooldown = 0.45
    }
    const settled = locate(world.track, racer.vehicle.x, racer.vehicle.z, after.s)
    if (racer.surface !== 'grass' && settled.surface === 'grass') {
      pushEvent(world, 'offtrack', racer.id)
    }
    racer.surface = settled.surface

    const progress = noteProgress(
      {
        lastS: racer.lastS,
        nextGate: racer.nextGate,
        lap: racer.lap,
        lapTimes: racer.lapTimes,
        sectorTimes: racer.sectorTimes,
        lapStartedAt: racer.lapStartedAt,
        odometer: racer.odometer,
        finished: racer.finished,
        finishTime: racer.finishTime,
      },
      settled.s,
      world.track.length,
      world.track.gates,
      world.laps,
      world.time,
    )
    racer.lastS = progress.state.lastS
    racer.nextGate = progress.state.nextGate
    racer.lap = progress.state.lap
    racer.lapTimes = progress.state.lapTimes
    racer.sectorTimes = progress.state.sectorTimes
    racer.lapStartedAt = progress.state.lapStartedAt
    racer.odometer = progress.state.odometer
    racer.finished = progress.state.finished
    racer.finishTime = progress.state.finishTime
    if (progress.completedLap) pushEvent(world, 'lap', racer.id)
    if (progress.finishedNow) pushEvent(world, 'finish', racer.id)

    const input = driven[index] ?? IDLE_INPUT
    const speed = Math.abs(racer.vehicle.speed)
    const crawling = speed < 1.1 && input.throttle > 0.55 && input.brake < 0.2
    const beached = racer.surface !== 'asphalt' && speed < 1.5
    const lost = Math.abs(settled.lateral) > world.track.width / 2 + world.track.runoff + 12
    if (racer.grace <= 0 && !racer.finished && (beached || crawling || lost)) racer.stuck += dt
    else racer.stuck = 0
    if (racer.stuck > (beached ? 2 : 2.4)) respawnRacer(world, racer)
  })

  publishRespawns(world)
  for (const hook of listHooks()) hook.afterStep?.(world, dt)
  world.time += dt
  const leader = world.racers.find((racer) => racer.isPlayer)
  world.finished = Boolean(leader?.finished)
}

export function respawnRacer(world: RaceWorld, racer: Racer): void {
  const gate = racer.nextGate === 0 ? world.track.gates - 1 : racer.nextGate - 1
  const s = (gate / world.track.gates) * world.track.length + 4
  const pose = placeOnTrack(world.track, s, 0)
  racer.vehicle = createVehicleState(pose.x, pose.z, pose.yaw, 14)
  racer.lastS = s
  racer.stuck = 0
  racer.grace = 1.4
  racer.surface = 'asphalt'
  respawnQueued.add(racer)
}

function publishRespawns(world: RaceWorld): void {
  for (const racer of world.racers) {
    if (!respawnQueued.delete(racer)) continue
    pushEvent(world, 'respawn', racer.id)
  }
}

export function snapshotRace(world: RaceWorld): RaceSnapshot {
  const ranked = [...world.racers].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0)
    if (a.finished) return -1
    if (b.finished) return 1
    return b.odometer - a.odometer
  })
  const position = new Map(ranked.map((racer, index) => [racer.id, index + 1]))
  return {
    trackId: world.track.id,
    trackName: world.track.name,
    laps: world.laps,
    time: world.time,
    finished: world.finished,
    racers: world.racers.map((racer) => toSnapshot(racer, position.get(racer.id) ?? 1)),
    extras: world.extras.map((extra) => ({ ...extra })),
    events: world.events.map((event) => ({ ...event })),
  }
}

function spawnRacer(options: {
  id: string
  name: string
  car: CarDefinition
  isPlayer: boolean
  controller: Racer['controller']
  personalityId: string | null
  track: Track
  lateral: number
}): Racer {
  const params = applyTuning(paramsFromStats(options.car.stats), options.car.id)
  const pose = placeOnTrack(options.track, 10, options.lateral)
  return {
    id: options.id,
    carId: options.car.id,
    name: options.name,
    isPlayer: options.isPlayer,
    controller: options.controller,
    personalityId: options.personalityId,
    color: options.car.color,
    modelUrl: options.car.modelUrl,
    params,
    vehicle: createVehicleState(pose.x, pose.z, pose.yaw, 0),
    energy: params.energyCapacity,
    energyCapacity: params.energyCapacity,
    energyRate: params.energyRate,
    condition: 1,
    lastS: 10,
    nextGate: 1,
    lap: 0,
    lapTimes: [],
    sectorTimes: [],
    lapStartedAt: 0,
    odometer: 0,
    finished: false,
    finishTime: null,
    surface: 'asphalt',
    stuck: 0,
    grace: 0.6,
    wallCooldown: 0,
    carCooldown: 0,
  }
}

function scaledParams(racer: Racer): VehicleParams {
  const energyScale = racer.energy > 0.25 ? 1 : 0.32
  const scale = energyScale * clamp(racer.condition, 0.2, 1)
  return { ...racer.params, engineForce: racer.params.engineForce * scale }
}

function toSnapshot(racer: Racer, position: number): RacerSnapshot {
  return {
    id: racer.id,
    carId: racer.carId,
    name: racer.name,
    isPlayer: racer.isPlayer,
    color: racer.color,
    modelUrl: racer.modelUrl,
    x: racer.vehicle.x,
    z: racer.vehicle.z,
    yaw: racer.vehicle.yaw,
    steer: racer.vehicle.steer,
    speed: racer.vehicle.speed,
    slip: Math.max(Math.abs(racer.vehicle.slipFront), Math.abs(racer.vehicle.slipRear)),
    surface: racer.surface,
    lap: racer.lap,
    lapTimes: [...racer.lapTimes],
    sectorTimes: [...racer.sectorTimes],
    gate: racer.nextGate,
    energy: racer.energy,
    energyCapacity: racer.energyCapacity,
    condition: racer.condition,
    finished: racer.finished,
    finishTime: racer.finishTime,
    position,
    odometer: racer.odometer,
  }
}

function pushEvent(world: RaceWorld, type: RaceEvent['type'], racerId: string): void {
  world.events.push({ type, racerId, time: world.time })
}

export function playerRacer(world: RaceWorld): Racer {
  const player = world.racers.find((racer) => racer.isPlayer)
  if (!player) throw new Error('Race has no player')
  return player
}
