import type { Personality } from './types.ts'

interface PersonalityModule {
  personality: Personality
}

const modules = import.meta.glob<PersonalityModule>('./personalities/*.ts', { eager: true })

export function listPersonalities(): Personality[] {
  return Object.values(modules)
    .map((mod) => mod.personality)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export function getPersonality(id: string): Personality {
  const personality = listPersonalities().find((item) => item.id === id)
  if (!personality) throw new Error(`Unknown personality "${id}"`)
  return personality
}
