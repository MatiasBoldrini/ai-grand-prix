import type { RaceHook } from './types.ts'

interface HookModule {
  hook?: RaceHook
}

const modules = import.meta.glob<HookModule>('./hooks/*.ts', { eager: true })

export function listHooks(): RaceHook[] {
  return Object.values(modules)
    .map((mod) => mod.hook)
    .filter((hook): hook is RaceHook => Boolean(hook))
    .sort((a, b) => a.id.localeCompare(b.id))
}
