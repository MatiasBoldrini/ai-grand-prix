import { describe, expect, it } from 'vitest'
import { getCar } from '../../src/cars/registry.ts'
import { getPersonality } from '../../src/ai/registry.ts'
import { SIM_HZ } from '../../src/core/budget.ts'
import { getTrack } from '../../src/tracks/registry.ts'
import { createRace, stepRace } from '../../src/race/world.ts'

describe('simulation budget', () => {
  it('runs ten seconds of a two-car race well under the frame budget', () => {
    const world = createRace({
      track: getTrack('gradiente'),
      player: getCar('flash-7b'),
      rival: getCar('reasoner-70b'),
      personality: getPersonality('cauto'),
      playerController: 'ai',
    })
    const steps = SIM_HZ * 10
    const started = performance.now()
    for (let i = 0; i < steps; i += 1) {
      stepRace(world, { throttle: 0, brake: 0, steer: 0 }, 1 / SIM_HZ)
    }
    const elapsed = performance.now() - started
    const perFrame = elapsed / (steps / SIM_HZ) / SIM_HZ
    // Ten seconds of sim should cost a small fraction of ten seconds of wall time.
    expect(elapsed).toBeLessThan(1500)
    expect(perFrame).toBeLessThan(2)
  })
})
