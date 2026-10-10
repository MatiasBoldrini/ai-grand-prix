export interface Preferences {
  masterVolume: number
  music: boolean
  pixelRatioCap: number
}

const KEY = 'agp-preferences'

/** Lowest pixel ratio the settings screen can store. Keeps a retina panel from going soft. */
export const PIXEL_CAP_MIN = 1
/** Highest pixel ratio the settings screen can store. Above this, integrated GPUs miss 60 fps. */
export const PIXEL_CAP_MAX = 2
/** Default cap. The race reads it through `onPreferences`. */
export const DEFAULT_PIXEL_CAP = 1.25

const defaults: Preferences = {
  masterVolume: 0.8,
  music: true,
  pixelRatioCap: DEFAULT_PIXEL_CAP,
}

export const preferences: Preferences = load()

const listeners = new Set<() => void>()

export function updatePreferences(partial: Partial<Preferences>): void {
  if ('masterVolume' in partial) {
    preferences.masterVolume = clamp01(partial.masterVolume, preferences.masterVolume)
  }
  if (typeof partial.music === 'boolean') {
    preferences.music = partial.music
  }
  if ('pixelRatioCap' in partial) {
    preferences.pixelRatioCap = clampPixel(partial.pixelRatioCap, preferences.pixelRatioCap)
  }
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
      pixelRatioCap: clampPixel(parsed.pixelRatioCap, defaults.pixelRatioCap),
    }
  } catch {
    return { ...defaults }
  }
}

function clamp01(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

function clampPixel(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(PIXEL_CAP_MAX, Math.max(PIXEL_CAP_MIN, value))
}
