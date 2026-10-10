export interface Preferences {
  masterVolume: number
  music: boolean
  pixelRatioCap: number
}

const KEY = 'agp-preferences'

const defaults: Preferences = {
  masterVolume: 0.8,
  music: true,
  pixelRatioCap: 1.25,
}

export const preferences: Preferences = load()

const listeners = new Set<() => void>()

export function updatePreferences(partial: Partial<Preferences>): void {
  Object.assign(preferences, partial)
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences))
  } catch {
    // Private mode can reject storage. The in-memory value still applies.
  }
  for (const listener of listeners) listener()
}

export function onPreferences(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function load(): Preferences {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw) as Partial<Preferences>
    return {
      masterVolume: clamp01(parsed.masterVolume, defaults.masterVolume),
      music: typeof parsed.music === 'boolean' ? parsed.music : defaults.music,
      pixelRatioCap:
        typeof parsed.pixelRatioCap === 'number' ? parsed.pixelRatioCap : defaults.pixelRatioCap,
    }
  } catch {
    return { ...defaults }
  }
}

function clamp01(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}
