import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'agp-preferences'

let store: Map<string, string>

function installStorage(options?: { failSet?: boolean }): void {
  store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (options?.failSet) throw new Error('denied')
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  })
}

async function loadPreferences() {
  vi.resetModules()
  return import('../../src/game/preferences.ts')
}

describe('preferences', () => {
  beforeEach(() => {
    installStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('starts from the integrated-GPU defaults when nothing is stored', async () => {
    const prefs = await loadPreferences()
    expect(prefs.preferences).toEqual({
      masterVolume: 0.8,
      music: true,
      pixelRatioCap: 1.25,
      lookSensitivity: 1,
    })
  })

  it('persists volume, music and pixel cap under the existing key', async () => {
    const prefs = await loadPreferences()
    prefs.updatePreferences({ masterVolume: 0.4, music: false, pixelRatioCap: 1 })
    expect(JSON.parse(store.get(KEY) ?? '')).toEqual({
      masterVolume: 0.4,
      music: false,
      pixelRatioCap: 1,
      lookSensitivity: 1,
    })

    vi.resetModules()
    const again = await import('../../src/game/preferences.ts')
    expect(again.preferences).toEqual({
      masterVolume: 0.4,
      music: false,
      pixelRatioCap: 1,
      lookSensitivity: 1,
    })
  })

  it('notifies listeners so the race can apply the new values', async () => {
    const prefs = await loadPreferences()
    const seen: Array<{ volume: number; music: boolean; cap: number }> = []
    const stop = prefs.onPreferences(() => {
      seen.push({
        volume: prefs.preferences.masterVolume,
        music: prefs.preferences.music,
        cap: prefs.preferences.pixelRatioCap,
      })
    })
    prefs.updatePreferences({ pixelRatioCap: 2 })
    prefs.updatePreferences({ masterVolume: 0.2 })
    stop()
    prefs.updatePreferences({ music: false })
    expect(seen).toEqual([
      { volume: 0.8, music: true, cap: 2 },
      { volume: 0.2, music: true, cap: 2 },
    ])
    expect(prefs.preferences.music).toBe(false)
  })

  it('clamps volume and pixel cap and ignores a bad music value', async () => {
    const prefs = await loadPreferences()
    prefs.updatePreferences({
      masterVolume: 4,
      music: 'no' as unknown as boolean,
      pixelRatioCap: 8,
    })
    expect(prefs.preferences).toEqual({
      masterVolume: 1,
      music: true,
      pixelRatioCap: 2,
      lookSensitivity: 1,
    })
    prefs.updatePreferences({ masterVolume: -1, pixelRatioCap: 0.2 })
    expect(prefs.preferences.masterVolume).toBe(0)
    expect(prefs.preferences.pixelRatioCap).toBe(1)
    prefs.updatePreferences({ masterVolume: Number.NaN, pixelRatioCap: Number.POSITIVE_INFINITY })
    expect(prefs.preferences.masterVolume).toBe(0)
    expect(prefs.preferences.pixelRatioCap).toBe(1)
    prefs.updatePreferences({ lookSensitivity: 9 })
    expect(prefs.preferences.lookSensitivity).toBe(1.8)
    prefs.updatePreferences({ lookSensitivity: 0 })
    expect(prefs.preferences.lookSensitivity).toBe(0.4)
    prefs.updatePreferences({ lookSensitivity: Number.NaN })
    expect(prefs.preferences.lookSensitivity).toBe(0.4)
  })

  it('falls back when stored JSON is corrupt or partial', async () => {
    store.set(KEY, '{')
    const broken = await loadPreferences()
    expect(broken.preferences.pixelRatioCap).toBe(1.25)

    store.set(
      KEY,
      JSON.stringify({ masterVolume: 'alto', music: 1, pixelRatioCap: null, extra: true }),
    )
    vi.resetModules()
    const partial = await import('../../src/game/preferences.ts')
    expect(partial.preferences).toEqual({
      masterVolume: 0.8,
      music: true,
      pixelRatioCap: 1.25,
      lookSensitivity: 1,
    })
  })

  it('keeps the in-memory value when storage rejects the write', async () => {
    installStorage({ failSet: true })
    const prefs = await loadPreferences()
    const seen: number[] = []
    prefs.onPreferences(() => seen.push(prefs.preferences.masterVolume))
    prefs.updatePreferences({ masterVolume: 0.3, music: false })
    expect(prefs.preferences.masterVolume).toBe(0.3)
    expect(prefs.preferences.music).toBe(false)
    expect(seen).toEqual([0.3])
    expect(store.size).toBe(0)
  })
})
