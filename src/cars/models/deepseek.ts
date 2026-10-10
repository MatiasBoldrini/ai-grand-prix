import type { CarDefinition } from '../types.ts'

export const car: CarDefinition = {
  id: 'deepseek',
  name: 'DeepSeek',
  team: 'DeepSeek',
  summary:
    'Razona la frenada y gasta poco. En la recta no asusta, pero llega a la meta con contexto de sobra.',
  stats: {
    speed: 66,
    context: 76,
    reasoning: 84,
    creativity: 34,
    cost: 18,
  },
  color: '#4d6bfe',
  livery: {
    body: '#f4f6ff',
    stripe: '#24306e',
    trim: '#4d6bfe',
    ink: '#f4f6ff',
    wordmark: 'DEEPSEEK',
  },
  modelUrl: '/assets/models/raceCarRed.dae',
}
