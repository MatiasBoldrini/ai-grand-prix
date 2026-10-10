import { el } from '../controls.ts'
import type { ScreenModule } from '../types.ts'

export const screen: ScreenModule = {
  id: 'loading',
  mount(root) {
    const panel = el('main', 'panel')
    panel.append(
      el('h1', undefined, 'Cargando la pista'),
      el('p', undefined, 'Estamos armando el circuito, los autos y el audio.'),
      el('div', 'spinner'),
    )
    root.append(panel)
    return { unmount: () => panel.remove() }
  },
}
