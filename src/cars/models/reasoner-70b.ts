import type { CarDefinition } from '../types.ts'

export const car: CarDefinition = {
  id: 'reasoner-70b',
  name: 'Claude',
  team: 'Anthropic',
  summary:
    'Entra a la curva despacio y sale pegado al piso. Gasta mucho por vuelta, pero casi no se va al pasto.',
  stats: {
    speed: 58,
    context: 90,
    reasoning: 88,
    creativity: 25,
    cost: 75,
  },
  color: '#c4654a',
  livery: {
    body: '#f7f1e8',
    stripe: '#c4654a',
    trim: '#2a2420',
    ink: '#fffaf6',
    wordmark: 'CLAUDE',
  },
  modelUrl: '/assets/models/raceCarRed.dae',
}
