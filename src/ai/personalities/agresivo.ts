import type { Personality } from '../types.ts'

/**
 * Brakes late and stays off the cut. Lookahead is shorter than Cauto so the
 * corner arrives late; aggression raises the speed the driver will carry in.
 */
export const personality: Personality = {
  id: 'agresivo',
  name: 'Agresivo',
  blurb: 'Frena tarde, se mete pasado a la curva y no toca el atajo.',
  lookAhead: 15,
  lookAheadSpeed: 0.2,
  aggression: 0.58,
  steerGain: 1.7,
  lineHold: 0.1,
  takesShortcuts: false,
}
