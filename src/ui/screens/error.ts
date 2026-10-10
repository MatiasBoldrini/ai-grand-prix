import { button, el } from '../controls.ts'
import type { ScreenModule } from '../types.ts'

export const screen: ScreenModule = {
  id: 'error',
  mount(root) {
    const panel = el('main', 'panel')
    const message = el(
      'p',
      undefined,
      'No pudimos abrir el gráfico. Probá con otro navegador o actualizá este.',
    )
    message.dataset.error = '1'
    panel.append(
      el('h1', undefined, 'No arrancó el gráfico'),
      message,
      button('Reintentar', 'primary', () => window.location.reload()),
    )
    root.append(panel)
    return { unmount: () => panel.remove() }
  },
}
