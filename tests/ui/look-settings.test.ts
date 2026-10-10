import { describe, expect, it } from 'vitest'
import { lookPercent, sensitivityFromPercent } from '../../src/ui/screens/settings.ts'

describe('look sensitivity setting', () => {
  it('maps the default orbit to 1.0× and keeps the slider on a 10 percent step', () => {
    expect(lookPercent(1)).toBe(100)
    expect(sensitivityFromPercent(100)).toBe(1)
    expect(sensitivityFromPercent(180)).toBe(1.8)
    expect(sensitivityFromPercent(40)).toBe(0.4)
    expect(sensitivityFromPercent(45)).toBe(0.5)
    expect(lookPercent(1.74)).toBe(170)
  })
})
