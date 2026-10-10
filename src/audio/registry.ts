import type { AudioClip } from './types.ts'

interface ClipModule {
  clip: AudioClip
}

const modules = import.meta.glob<ClipModule>('./clips/*.ts', { eager: true })

export function listClips(): AudioClip[] {
  return Object.values(modules)
    .map((mod) => mod.clip)
    .sort((a, b) => a.id.localeCompare(b.id))
}
