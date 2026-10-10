import { describe, expect, it } from 'vitest'
import { getCar } from '../../src/cars/registry.ts'
import { getPersonality } from '../../src/ai/registry.ts'
import { getTrack } from '../../src/tracks/registry.ts'
import { createRace, playerRacer, stepRace } from '../../src/race/world.ts'

describe('full lap', () => {
  it('drives the player and the rival around Gradiente', () => {
    const world = createRace({
      track: getTrack('gradiente'),
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      laps: 1,
      playerController: 'ai',
    })
    const maxSteps = 60 * 90
    let steps = 0
    for (; steps < maxSteps; steps += 1) {
      stepRace(world, { throttle: 0, brake: 0, steer: 0 }, 1 / 60)
      const player = playerRacer(world)
      const rival = world.racers[1]
      if (player.lap >= 1 && rival && rival.lap >= 1) break
    }
    const player = playerRacer(world)
    const rival = world.racers[1]
    const detail = `steps=${steps} playerLap=${player.lap} playerS=${player.lastS.toFixed(1)} speed=${player.vehicle.speed.toFixed(1)} lateral=${locateLateral(player)} rivalLap=${rival?.lap}`
    expect(player.lap, detail).toBeGreaterThanOrEqual(1)
    expect(rival?.lap, detail).toBeGreaterThanOrEqual(1)
    expect(player.lapTimes[0], detail).toBeGreaterThan(15)
    expect(Number.isFinite(player.vehicle.x)).toBe(true)
    expect(Number.isFinite(rival?.vehicle.x)).toBe(true)
  })
})

function locateLateral(racer: { vehicle: { x: number; z: number }; lastS: number }): string {
  return `${racer.vehicle.x.toFixed(1)},${racer.vehicle.z.toFixed(1)} s=${racer.lastS.toFixed(1)}`
}
