import { listTracks } from '../../tracks/registry.ts'
import { button, el } from '../controls.ts'
import type { ScreenModule } from '../types.ts'

export const screen: ScreenModule = {
  id: 'menu',
  mount(root, ctx) {
    const panel = el('main', 'panel')
    const state = ctx.getState()
    const tracks = listTracks()
    panel.append(
      el('h1', undefined, 'AI Grand Prix'),
      el(
        'p',
        undefined,
        'Cada auto está afinado como un modelo. Velocidad, contexto, razonamiento, creatividad y costo. Elegí uno y salí a ver si te cierra la vuelta.',
      ),
    )

    if (tracks.length > 1) {
      const field = el('fieldset', 'choices')
      field.setAttribute('aria-label', 'Circuito')
      const heading = el('h2', undefined, 'Circuito')
      panel.append(heading)
      for (const track of tracks) {
        field.append(
          choice(track.id, track.name, 'track', track.id === state.trackId, () => {
            ctx.updateState({ trackId: track.id })
          }),
        )
      }
      panel.append(field)
    } else {
      const only = tracks[0]
      panel.append(
        el('h2', undefined, 'Circuito'),
        el(
          'p',
          undefined,
          only ? `Hoy se corre en ${only.name}. ${only.description}` : 'No hay circuito cargado.',
        ),
      )
    }

    const actions = el('div', 'stack')
    actions.append(
      button('Arrancá a correr', 'primary', () => {
        ctx.resumeAudio()
        ctx.play('click')
        ctx.startRace()
      }),
    )
    for (const link of ctx.links) {
      actions.append(
        button(link.label, link.variant, () => {
          ctx.play('click')
          ctx.go(link.id)
        }),
      )
    }
    panel.append(
      actions,
      el(
        'p',
        'hint',
        'Con el teclado: W acelera, S frena, A y D doblan. Las flechas también. Escape pausa, R te devuelve a la pista y F3 muestra el rendimiento. El gamepad anda con los gatillos.',
      ),
    )
    root.append(panel)
    return { unmount: () => panel.remove() }
  },
}

function choice(
  id: string,
  label: string,
  group: string,
  checked: boolean,
  onChange: () => void,
): HTMLLabelElement {
  const row = el('label', 'choice')
  const input = el('input')
  input.type = 'radio'
  input.name = group
  input.value = id
  input.checked = checked
  input.addEventListener('change', onChange)
  row.append(input, el('span', undefined, label))
  return row
}
