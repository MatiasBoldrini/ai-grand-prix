export interface CarStats {
  /** Top speed and throttle response. Inspired by model latency. */
  speed: number
  /** Energy tank. Inspired by context length. */
  context: number
  /** Cornering grip and brake authority. Inspired by reasoning. */
  reasoning: number
  /** How willingly the rear steps out, including a slide that can leave the asphalt. */
  creativity: number
  /** Energy burned at full throttle. */
  cost: number
}

export interface CarDefinition {
  id: string
  name: string
  team: string
  summary: string
  stats: CarStats
  /** Body paint. World art, not a UI token. */
  color: string
  modelUrl: string
}
