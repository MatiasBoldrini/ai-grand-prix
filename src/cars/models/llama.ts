import type { CarDefinition } from '../types.ts'

export const car: CarDefinition = {
  id: 'llama',
  name: 'Llama',
  team: 'Meta',
  summary:
    'Sale barato y se anima a cruzar el auto. No es el más rápido, pero aguanta varias vueltas sin pedir boxes.',
  stats: {
    speed: 70,
    context: 64,
    reasoning: 58,
    creativity: 68,
    cost: 30,
  },
  color: '#0668e1',
  livery: {
    body: '#f3f6fb',
    stripe: '#0668e1',
    trim: '#f7f4ee',
    ink: '#ffffff',
    wordmark: 'LLAMA',
  },
  modelUrl: '/assets/models/raceCarRed.dae',
}
