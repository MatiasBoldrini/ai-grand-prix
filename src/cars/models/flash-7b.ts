import type { CarDefinition } from '../types.ts'

export const car: CarDefinition = {
  id: 'flash-7b',
  name: 'Flash 7B',
  team: 'Taller Norte',
  summary:
    'Responde al toque y se anima a deslizar. Si lo dejás a fondo, el contexto se le acaba antes de la meta.',
  stats: {
    speed: 90,
    context: 38,
    reasoning: 46,
    creativity: 72,
    cost: 24,
  },
  color: '#d6e41a',
  modelUrl: '/assets/models/raceCarRed.dae',
}
