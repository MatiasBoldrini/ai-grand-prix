import { describe, expect, it } from 'vitest'
import { device as gamepad } from '../../src/input/devices/gamepad.ts'
import { device as keyboard } from '../../src/input/devices/keyboard.ts'
import { device, sampleFromHolds, steerFromOffset } from '../../src/input/devices/touch.ts'
import { listDevices, pollInput } from '../../src/input/registry.ts'

describe('touch controls', () => {
  it('ranks above the keyboard and the gamepad', () => {
    expect(device.id).toBe('touch')
    expect(device.priority).toBe(3)
    expect(device.priority).toBeGreaterThan(gamepad.priority)
    expect(gamepad.priority).toBeGreaterThan(keyboard.priority)
    expect(listDevices().find((item) => item.id === 'touch')?.priority).toBe(3)
  })

  it('stays inactive with no finger so the pedals stay free', () => {
    const sample = device.poll()
    expect(sample.active).toBe(false)
    expect(sample).toMatchObject({
      throttle: 0,
      brake: 0,
      steer: 0,
      pauseEdge: false,
      fpsEdge: false,
      respawnEdge: false,
    })
    expect(device.poll().respawnEdge).toBe(false)
    expect(pollInput().vehicle).toEqual({ throttle: 0, brake: 0, steer: 0 })
    device.unmount?.()
    expect(device.poll().active).toBe(false)
  })

  it('reports active only while a finger is on the wheel or a pedal', () => {
    expect(sampleFromHolds([], 0.4, false)).toMatchObject({ active: false, steer: 0 })
    expect(sampleFromHolds(['respawn'], 0.4, true)).toMatchObject({
      active: false,
      steer: 0,
      throttle: 0,
      brake: 0,
      respawnEdge: true,
    })
    expect(sampleFromHolds(['throttle'], 0.4, false)).toMatchObject({
      active: true,
      throttle: 1,
      brake: 0,
      steer: 0,
    })
    expect(sampleFromHolds(['brake'], 0, false)).toMatchObject({
      active: true,
      throttle: 0,
      brake: 1,
      steer: 0,
    })
    expect(sampleFromHolds(['steer'], 0, false)).toMatchObject({
      active: true,
      steer: 0,
      throttle: 0,
      brake: 0,
    })
    expect(sampleFromHolds(['steer', 'throttle'], 0.5, false)).toMatchObject({
      active: true,
      throttle: 1,
      brake: 0,
      steer: 0.5,
    })
    expect(sampleFromHolds(['steer'], 4, false).steer).toBe(1)
    expect(sampleFromHolds(['steer'], -4, false).steer).toBe(-1)
    expect(sampleFromHolds(['steer'], Number.NaN, false).steer).toBe(0)
  })

  it('softens the center of the wheel and reaches full lock at the end of the throw', () => {
    expect(steerFromOffset(0, 100)).toBe(0)
    expect(steerFromOffset(8, 100)).toBe(0)
    expect(steerFromOffset(9, 100)).toBeGreaterThan(0)
    expect(steerFromOffset(Number.NaN, 100)).toBe(0)
    expect(steerFromOffset(20, 0)).toBe(0)

    const gentle = steerFromOffset(20, 100)
    expect(gentle).toBeGreaterThan(0)
    expect(gentle).toBeLessThan(0.2)

    const half = steerFromOffset(50, 100)
    expect(half).toBeGreaterThan(0.3)
    expect(half).toBeLessThan(0.42)

    expect(steerFromOffset(100, 100)).toBeCloseTo(1)
    expect(steerFromOffset(180, 100)).toBeCloseTo(1)
    expect(steerFromOffset(-100, 100)).toBeCloseTo(-1)
    expect(steerFromOffset(-40, 100)).toBeCloseTo(-steerFromOffset(40, 100))

    let previous = 0
    for (const dx of [0, 8, 10, 16, 24, 36, 52, 68, 84, 100]) {
      const value = steerFromOffset(dx, 100)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })
})
