export interface ProgressState {
  lastS: number
  nextGate: number
  lap: number
  lapTimes: number[]
  sectorTimes: number[]
  lapStartedAt: number
  odometer: number
  finished: boolean
  finishTime: number | null
}

export interface ProgressResult {
  state: ProgressState
  crossedGate: boolean
  completedLap: boolean
  finishedNow: boolean
}

export function noteProgress(
  state: ProgressState,
  s: number,
  length: number,
  gates: number,
  totalLaps: number,
  now: number,
): ProgressResult {
  let delta = s - state.lastS
  if (delta < -length / 2) delta += length
  else if (delta > length / 2) delta -= length

  const next: ProgressState = {
    ...state,
    lastS: s,
    lapTimes: state.lapTimes,
    sectorTimes: state.sectorTimes,
    odometer: state.finished || delta <= 0 ? state.odometer : state.odometer + delta,
  }
  let crossedGate = false
  let completedLap = false
  let finishedNow = false

  if (!state.finished && delta > 0.02) {
    const gateS = (state.nextGate / gates) * length
    if (crossedForward(state.lastS, s, gateS, length)) {
      crossedGate = true
      const startedLap = state.nextGate === 0
      next.sectorTimes = [...state.sectorTimes, now]
      next.nextGate = (state.nextGate + 1) % gates
      if (startedLap) {
        completedLap = true
        const lapTime = now - state.lapStartedAt
        next.lap = state.lap + 1
        next.lapTimes = [...state.lapTimes, lapTime]
        next.sectorTimes = []
        next.lapStartedAt = now
        if (next.lap >= totalLaps) {
          next.finished = true
          next.finishTime = now
          finishedNow = true
        }
      }
    }
  }
  return { state: next, crossedGate, completedLap, finishedNow }
}

function crossedForward(last: number, current: number, gate: number, length: number): boolean {
  if (current >= last) return gate >= last && gate < current
  // A small backward move stays below the halfway mark. Wrapping forward jumps it.
  if (last - current <= length / 2) return false
  return gate >= last || gate < current
}
