import type { CarDefinition } from '../types.ts'

export const car: CarDefinition = {
  id: 'reasoner-70b',
  name: 'Reasoner 70B',
  team: 'Cátedra Sur',
  summary:
    'Entra a la curva despacio y sale pegado al piso. Gasta mucho por vuelta, pero casi no se va al pasto.',
  stats: {
    speed: 58,
    context: 90,
    reasoning: 88,
    creativity: 25,
    cost: 75,
  },
  color: '#c45c28',
  modelUrl: '/assets/models/raceCarRed.dae',
}
