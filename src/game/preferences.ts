export interface Preferences {
  masterVolume: number
  music: boolean
  pixelRatioCap: number
  /** Multiplier on chase-camera mouse look. 1 is the default orbit speed. */
  lookSensitivity: number
}

const KEY = 'agp-preferences'

/** Lowest pixel ratio the settings screen can store. Keeps a retina panel from going soft. */
export const PIXEL_CAP_MIN = 1
/** Highest pixel ratio the settings screen can store. Above this, integrated GPUs miss 60 fps. */
export const PIXEL_CAP_MAX = 2
/** Default cap. The race reads it through `onPreferences`. */
export const DEFAULT_PIXEL_CAP = 1.25
/** Slowest chase-camera orbit the settings screen can store. */
export const LOOK_SENS_MIN = 0.4
/** Fastest chase-camera orbit the settings screen can store. */
export const LOOK_SENS_MAX = 1.8
/** Default orbit speed. One pixel moves the same angle the camera was tuned for. */
export const DEFAULT_LOOK_SENS = 1

const defaults: Preferences = {
  masterVolume: 0.8,
  music: true,
  pixelRatioCap: DEFAULT_PIXEL_CAP,
  lookSensitivity: DEFAULT_LOOK_SENS,
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
  if ('lookSensitivity' in partial) {
    preferences.lookSensitivity = clampLook(partial.lookSensitivity, preferences.lookSensitivity)
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
      lookSensitivity: clampLook(parsed.lookSensitivity, defaults.lookSensitivity),
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

function clampLook(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(LOOK_SENS_MAX, Math.max(LOOK_SENS_MIN, value))
}
