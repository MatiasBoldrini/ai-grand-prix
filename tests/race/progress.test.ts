import { describe, expect, it } from 'vitest'
import { noteProgress, type ProgressState } from '../../src/race/progress.ts'

function fresh(): ProgressState {
  return {
    lastS: 10,
    nextGate: 1,
    lap: 0,
    lapTimes: [],
    sectorTimes: [],
    lapStartedAt: 0,
    odometer: 0,
    finished: false,
    finishTime: null,
  }
}

describe('lap gates', () => {
  it('counts one lap after every gate, including the wrap to the line', () => {
    const length = 120
    const gates = 4
    let state = fresh()
    let laps = 0
    for (let meter = 11; meter < length * 2 + 15; meter += 1) {
      const result = noteProgress(state, meter % length, length, gates, 2, meter / 20)
      state = result.state
      if (result.completedLap) laps += 1
    }
    expect(laps).toBe(2)
    expect(state.finished).toBe(true)
    expect(state.lapTimes).toHaveLength(2)
    expect(state.finishTime).not.toBeNull()
  })

  it('does not award a gate while reversing', () => {
    let state = fresh()
    state = noteProgress(state, 40, 120, 4, 2, 1).state
    const reversed = noteProgress(state, 20, 120, 4, 2, 2)
    expect(reversed.crossedGate).toBe(false)
    expect(reversed.state.odometer).toBe(state.odometer)
  })
})
