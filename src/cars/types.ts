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

/** Original livery: provider colors and a name, never a copied logo. */
export interface CarLivery {
  /** Main body paint. */
  body: string
  /** Broad stripe and the name plate. */
  stripe: string
  /** Thin second stripe. */
  trim: string
  /** Lettering on the plate. */
  ink: string
  /** Model name painted on the car. */
  wordmark: string
}

export interface CarDefinition {
  id: string
  name: string
  team: string
  summary: string
  stats: CarStats
  /** Swatch used by the HUD, the minimap and the podium. World art, not a UI token. */
  color: string
  livery: CarLivery
  modelUrl: string
}
