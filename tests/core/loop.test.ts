import { describe, expect, it } from 'vitest'
import { FixedStepper } from '../../src/core/loop.ts'
import { mixPose } from '../../src/core/pose.ts'
import { wrapAngle } from '../../src/core/math.ts'

describe('fixed stepper', () => {
  it('runs exactly one step per dt frame', () => {
    const stepper = new FixedStepper(60)
    let steps = 0
    for (let i = 0; i < 60; i += 1) {
      const result = stepper.advance(stepper.dt, () => {
        steps += 1
      })
      expect(result.steps).toBe(1)
    }
    expect(steps).toBe(60)
  })

  it('passes a constant dt into the simulation', () => {
    const stepper = new FixedStepper(60)
    const seen: number[] = []
    stepper.advance(stepper.dt * 3, (dt) => seen.push(dt))
    expect(seen).toEqual([stepper.dt, stepper.dt, stepper.dt])
  })

  it('caps a hitch so a stalled tab cannot spiral', () => {
    const stepper = new FixedStepper(60, 5)
    let steps = 0
    const result = stepper.advance(2, () => {
      steps += 1
    })
    expect(steps).toBe(5)
    expect(result.alpha).toBeGreaterThanOrEqual(0)
    expect(result.alpha).toBeLessThanOrEqual(1)
  })
})

describe('pose mix', () => {
  it('takes the short way around a yaw wrap', () => {
    const mixed = mixPose(
      { x: 0, z: 0, yaw: Math.PI - 0.1, steer: 0 },
      { x: 0, z: 2, yaw: -Math.PI + 0.1, steer: 0 },
      0.5,
    )
    expect(Math.abs(wrapAngle(mixed.yaw - Math.PI))).toBeLessThan(0.05)
    expect(mixed.z).toBeCloseTo(1)
  })
})
