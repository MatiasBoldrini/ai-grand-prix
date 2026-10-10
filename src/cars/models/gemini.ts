import type { CarDefinition } from '../types.ts'

export const car: CarDefinition = {
  id: 'gemini',
  name: 'Gemini',
  team: 'Google',
  summary:
    'Llega con contexto de sobra y no se achica en la recta. En la horquilla pide un poco más de paciencia.',
  stats: {
    speed: 84,
    context: 80,
    reasoning: 62,
    creativity: 55,
    cost: 48,
  },
  color: '#1a73e8',
  livery: {
    body: '#f7f9fc',
    stripe: '#1a73e8',
    trim: '#f2b42a',
    ink: '#ffffff',
    wordmark: 'GEMINI',
  },
  modelUrl: '/assets/models/raceCarRed.dae',
}
