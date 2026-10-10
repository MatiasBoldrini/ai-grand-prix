import type { CarDefinition } from '../types.ts'

export const car: CarDefinition = {
  id: 'mistral',
  name: 'Mistral',
  team: 'Mistral AI',
  summary:
    'Liviano y con hambre de curva. Gira con ganas y el tanque alcanza si no lo dejás clavado a fondo.',
  stats: {
    speed: 82,
    context: 50,
    reasoning: 60,
    creativity: 64,
    cost: 36,
  },
  color: '#e85d04',
  livery: {
    body: '#242220',
    stripe: '#e85d04',
    trim: '#f4efe6',
    ink: '#1a1614',
    wordmark: 'MISTRAL',
  },
  modelUrl: '/assets/models/raceCarRed.dae',
}
