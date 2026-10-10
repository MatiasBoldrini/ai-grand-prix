export interface Personality {
  id: string
  name: string
  blurb: string
  /** Metres of pure-pursuit lookahead at low speed. */
  lookAhead: number
  /** Extra lookahead metres per m/s. */
  lookAheadSpeed: number
  /** 0 brakes early, 1 carries speed into the corner. */
  aggression: number
  steerGain: number
  /** How hard the car is pulled back to the centre line. */
  lineHold: number
  takesShortcuts: boolean
}
