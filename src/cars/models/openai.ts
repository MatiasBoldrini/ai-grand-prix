import type { CarDefinition } from '../types.ts'

export const car: CarDefinition = {
  id: 'openai',
  name: 'GPT',
  team: 'OpenAI',
  summary:
    'Equilibrado de punta a punta. Empuja en la recta y todavía piensa la curva, aunque el tanque no es eterno.',
  stats: {
    speed: 78,
    context: 72,
    reasoning: 80,
    creativity: 40,
    cost: 62,
  },
  color: '#10a37f',
  livery: {
    body: '#f4f7f6',
    stripe: '#101114',
    trim: '#10a37f',
    ink: '#f7f7f5',
    wordmark: 'GPT',
  },
  modelUrl: '/assets/models/raceCarRed.dae',
}
