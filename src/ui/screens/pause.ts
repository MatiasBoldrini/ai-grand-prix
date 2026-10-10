import { button, el } from '../controls.ts'
import type { ScreenModule } from '../types.ts'

export const screen: ScreenModule = {
  id: 'pause',
  mount(root, ctx) {
    const scrim = el('div', 'scrim')
    const panel = el('main', 'panel')
    panel.append(
      el('h1', undefined, 'Pausa'),
      el(
        'p',
        undefined,
        'La pista te espera. W acelera, S frena, A y D doblan. R te pone de nuevo en el asfalto.',
      ),
      button('Seguí corriendo', 'primary', () => {
        ctx.play('click')
        ctx.go('hud')
      }),
      button('Abandoná la carrera', 'ghost', () => {
        ctx.play('click')
        ctx.quit()
      }),
    )
    scrim.append(panel)
    root.append(scrim)
    return { unmount: () => scrim.remove() }
  },
}
