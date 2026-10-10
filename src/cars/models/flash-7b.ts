import type { CarDefinition } from '../types.ts'

export const car: CarDefinition = {
  id: 'flash-7b',
  name: 'Grok',
  team: 'xAI',
  summary:
    'Responde al toque y se anima a deslizar. Si lo dejás a fondo, el contexto se le acaba antes de la meta.',
  stats: {
    speed: 90,
    context: 38,
    reasoning: 46,
    creativity: 72,
    cost: 24,
  },
  color: '#1c1c1c',
  livery: {
    body: '#f6f3ec',
    stripe: '#1c1c1c',
    trim: '#e2a122',
    ink: '#f6f3ec',
    wordmark: 'GROK',
  },
  modelUrl: '/assets/models/raceCarRed.dae',
}
