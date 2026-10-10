import { getScreen, menuLinks } from './screen-registry.ts'
import type { MountedScreen, ScreenContext, UiFrame } from './types.ts'

export class Shell {
  private mounted: MountedScreen | null = null
  private readonly root: HTMLElement
  private readonly context: Omit<ScreenContext, 'go' | 'links'>
  screenId = 'loading'

  constructor(root: HTMLElement, context: Omit<ScreenContext, 'go' | 'links'>) {
    this.root = root
    this.context = context
  }

  show(id: string): void {
    this.mounted?.unmount()
    this.root.replaceChildren()
    const screen = getScreen(id)
    const ctx: ScreenContext = {
      ...this.context,
      links: menuLinks(),
      go: (next) => this.show(next),
    }
    this.mounted = screen.mount(this.root, ctx)
    this.screenId = id
    const primary = this.root.querySelector<HTMLButtonElement>('.btn-primary')
    primary?.focus()
  }

  update(frame: UiFrame): void {
    this.mounted?.update?.(frame)
  }
}
