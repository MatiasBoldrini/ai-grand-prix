import type { CarDefinition } from './types.ts'

interface CarModule {
  car: CarDefinition
}

const modules = import.meta.glob<CarModule>('./models/*.ts', { eager: true })

export function listCars(): CarDefinition[] {
  return Object.values(modules)
    .map((mod) => mod.car)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export function getCar(id: string): CarDefinition {
  const car = listCars().find((item) => item.id === id)
  if (!car) throw new Error(`Unknown car "${id}"`)
  return car
}
