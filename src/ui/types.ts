import type { AudioBus } from '../audio/types.ts'
import type { RaceSnapshot } from '../race/types.ts'
import type { GameState } from '../game/state.ts'

export interface MenuLink {
  id: string
  label: string
  variant: 'solid' | 'ghost'
  order: number
}

export interface ScreenContext {
  go(id: string): void
  startRace(): void
  quit(): void
  links: MenuLink[]
  getState(): GameState
  updateState(partial: Partial<GameState>): void
  play(id: string): void
  resumeAudio(): void
}

export interface UiFrame {
  snapshot: RaceSnapshot | null
}

export interface MountedScreen {
  update?: (frame: UiFrame) => void
  unmount(): void
}

export interface ScreenModule {
  id: string
  menu?: { label: string; variant: 'solid' | 'ghost'; order: number }
  mount(root: HTMLElement, ctx: ScreenContext): MountedScreen
}

export interface HudWidget {
  id: string
  mount(parent: HTMLElement): MountedScreen
}

export type { AudioBus }
