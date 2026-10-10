import { describe, expect, it } from 'vitest'
import { listPersonalities } from '../../src/ai/registry.ts'
import { applyTuning } from '../../src/cars/apply-tuning.ts'
import { paramsFromStats } from '../../src/cars/params.ts'
import { listCars } from '../../src/cars/registry.ts'
import { listHooks } from '../../src/race/hook-registry.ts'
import { listTracks } from '../../src/tracks/registry.ts'

describe('content registries', () => {
  it('discovers cars, the track and the rival personality by file', () => {
    expect(
      listCars()
        .map((car) => car.id)
        .sort(),
    ).toEqual(['flash-7b', 'reasoner-70b'])
    expect(new Set(listCars().map((car) => car.id)).size).toBe(listCars().length)
    expect(listTracks().map((track) => track.id)).toContain('gradiente')
    expect(listPersonalities().map((personality) => personality.id)).toContain('cauto')
    expect(listHooks()).toEqual([])
  })

  it('leaves physics params unchanged when no tuning file is present', () => {
    const params = paramsFromStats(listCars()[0]!.stats)
    expect(applyTuning(params, 'flash-7b')).toEqual(params)
  })
})
