export type AudioMode = 'menu' | 'race' | 'quiet'

export interface AudioBus {
  resume(): void
  play(id: string): void
  setMode(mode: AudioMode): void
  updateEngine(rpm: number, throttle: number, slip: number): void
  /** Names of clips that failed to decode. The race still runs. */
  missing(): string[]
}

export interface AudioClip {
  id: string
  url: string
  kind: 'one-shot' | 'engine' | 'music'
}
