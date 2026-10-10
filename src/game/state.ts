export interface GameState {
  carId: string
  trackId: string
  personalityId: string
}

const state: GameState = {
  carId: 'flash-7b',
  trackId: 'gradiente',
  personalityId: 'cauto',
}

export function getGameState(): GameState {
  return { ...state }
}

export function updateGameState(partial: Partial<GameState>): void {
  Object.assign(state, partial)
}
