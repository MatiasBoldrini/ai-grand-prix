import { describe, expect, it } from 'vitest'
import { chaseAccel, chaseAim, resetChaseAccel } from '../../src/render/layers/camera.ts'

describe('chase camera orbit', () => {
  it('matches the bumper view when the mouse look is centered', () => {
    const aim = chaseAim(2, 4, 0, 0, 0)
    expect(aim.x).toBeCloseTo(2)
    expect(aim.y).toBeCloseTo(3.15)
    expect(aim.z).toBeCloseTo(4 - 8.2)
    expect(aim.lookX).toBeCloseTo(2)
    expect(aim.lookY).toBeCloseTo(1.1)
    expect(aim.lookZ).toBeCloseTo(12)
  })

  it('orbits to the left of the car when the look yaws right', () => {
    const aim = chaseAim(0, 0, 0, Math.PI / 2, 0)
    expect(aim.x).toBeCloseTo(-8.2)
    expect(aim.z).toBeCloseTo(0)
    expect(aim.lookX).toBeGreaterThan(7)
    expect(aim.lookZ).toBeCloseTo(0, 5)
  })

  it('raises the camera and the gaze on a positive pitch', () => {
    const level = chaseAim(0, 0, 0, 0, 0)
    const up = chaseAim(0, 0, 0, 0, 0.4)
    expect(up.y).toBeGreaterThan(level.y)
    expect(up.lookY).toBeGreaterThan(level.lookY)
    expect(up.z).toBeGreaterThan(level.z)
  })

  it('reads acceleration only after it has a previous speed', () => {
    resetChaseAccel()
    expect(chaseAccel(0, 1 / 60)).toBe(0)
    expect(chaseAccel(0.2, 1 / 60)).toBeCloseTo(12)
    expect(chaseAccel(Number.NaN, 1 / 60)).toBe(0)
  })
})
