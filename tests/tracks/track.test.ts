import { describe, expect, it } from 'vitest'
import { getTrack, listTracks } from '../../src/tracks/registry.ts'
import { locate, sampleAt } from '../../src/tracks/spline.ts'

describe('gradiente', () => {
  it('is a closed loop long enough to race', () => {
    const track = getTrack('gradiente')
    expect(listTracks().map((item) => item.id)).toContain('gradiente')
    expect(track.length).toBeGreaterThan(700)
    expect(track.length).toBeLessThan(1200)
    expect(track.samples.length).toBeGreaterThan(400)
    const start = sampleAt(track, 0)
    const end = sampleAt(track, track.length - 0.01)
    expect(Math.hypot(start.x - end.x, start.z - end.z)).toBeLessThan(3)
    const here = locate(track, start.x, start.z)
    expect(here.surface).toBe('asphalt')
    expect(Math.abs(here.lateral)).toBeLessThan(1.5)
  })

  it('marks the grass outside the asphalt and keeps the chicane cut', () => {
    const track = getTrack('gradiente')
    const start = sampleAt(track, 40)
    const rx = Math.cos(start.heading)
    const rz = -Math.sin(start.heading)
    const outside = locate(track, start.x + rx * 30, start.z + rz * 30, start.s)
    expect(outside.surface).toBe('grass')
    expect(track.shortcuts.map((shortcut) => shortcut.id)).toContain('corte-chicana')
  })
})
