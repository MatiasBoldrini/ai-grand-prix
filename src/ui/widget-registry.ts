import type { HudWidget, MountedScreen, UiFrame } from './types.ts'

interface WidgetModule {
  widget?: HudWidget
}

const modules = import.meta.glob<WidgetModule>('./widgets/*.ts', { eager: true })

export function listWidgets(): HudWidget[] {
  return Object.values(modules)
    .map((mod) => mod.widget)
    .filter((widget): widget is HudWidget => Boolean(widget))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function mountWidgets(parent: HTMLElement): MountedScreen {
  const mounted = listWidgets().map((widget) => widget.mount(parent))
  return {
    update(frame: UiFrame) {
      for (const item of mounted) item.update?.(frame)
    },
    unmount() {
      for (const item of mounted) item.unmount()
    },
  }
}
