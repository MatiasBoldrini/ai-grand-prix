import type { Personality } from '../types.ts'

/**
 * Loose line and a long look, so the chicane cut is the aim point.
 * The slidey car reaches the shortcut surface; the planted car runs wide and stays on asphalt.
 */
export const personality: Personality = {
  id: 'creativo',
  name: 'Creativo',
  blurb: 'Se abre de la cuerda y agarra el corte apenas lo tiene a tiro.',
  lookAhead: 26,
  lookAheadSpeed: 0.22,
  aggression: 0.36,
  steerGain: 1.9,
  lineHold: 0.015,
  takesShortcuts: true,
}
