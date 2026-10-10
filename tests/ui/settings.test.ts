import { describe, expect, it } from 'vitest'
import { getScreen, menuLinks } from '../../src/ui/screen-registry.ts'
import { screen } from '../../src/ui/screens/settings.ts'

describe('settings screen', () => {
  it('registers a menu entry for volume and image quality', () => {
    expect(screen.id).toBe('settings')
    expect(screen.menu).toEqual({ label: 'Ajustes', variant: 'ghost', order: 20 })
    expect(getScreen('settings')).toBe(screen)

    const links = menuLinks()
    const settings = links.find((link) => link.id === 'settings')
    const garage = links.findIndex((link) => link.id === 'garage')
    const settingsIndex = links.findIndex((link) => link.id === 'settings')
    expect(settings).toMatchObject({ label: 'Ajustes', variant: 'ghost' })
    expect(garage).toBeGreaterThanOrEqual(0)
    expect(settingsIndex).toBeGreaterThan(garage)
  })
})
