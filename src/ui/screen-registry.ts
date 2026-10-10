import type { MenuLink, ScreenModule } from './types.ts'

interface ScreenFile {
  screen: ScreenModule
}

const modules = import.meta.glob<ScreenFile>('./screens/*.ts', { eager: true })

export function listScreens(): ScreenModule[] {
  return Object.values(modules)
    .map((mod) => mod.screen)
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function getScreen(id: string): ScreenModule {
  const screen = listScreens().find((item) => item.id === id)
  if (!screen) throw new Error(`Unknown screen "${id}"`)
  return screen
}

export function menuLinks(): MenuLink[] {
  return listScreens()
    .flatMap((screen) => {
      if (!screen.menu) return []
      return [
        {
          id: screen.id,
          label: screen.menu.label,
          variant: screen.menu.variant,
          order: screen.menu.order,
        },
      ]
    })
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'es'))
}
