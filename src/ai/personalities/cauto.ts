import type { Personality } from '../types.ts'

export const personality: Personality = {
  id: 'cauto',
  name: 'Cauto',
  blurb: 'Frena temprano, no se anima al atajo y prioriza quedar en la pista.',
  lookAhead: 18,
  lookAheadSpeed: 0.28,
  aggression: 0.34,
  steerGain: 1.65,
  lineHold: 0.09,
  takesShortcuts: false,
}
