import '../menu.css'
import { listPersonalities } from '../../ai/registry.ts'
import { listCars } from '../../cars/registry.ts'
import { listTracks } from '../../tracks/registry.ts'
import { button, el } from '../controls.ts'
import type { ScreenModule } from '../types.ts'

const KEYS =
  'Con el teclado: W acelera, S frena, A y D doblan. Las flechas también. Escape pausa, R te devuelve a la pista y F3 muestra el rendimiento. El gamepad anda con los gatillos.'

export function lapsPhrase(laps: number): string {
  const count = Number.isFinite(laps) ? Math.max(0, Math.trunc(laps)) : 0
  return count === 1 ? '1 vuelta' : `${count} vueltas`
}

export function circuitBlurb(track: { name: string; description: string } | undefined): string {
  if (!track) return 'No hay circuito cargado.'
  return `Hoy se corre en ${track.name}. ${track.description}`
}

export function lineupText(input: {
  carName?: string
  personalityName?: string
  trackName?: string
  laps?: number
  /** Name the circuit again when the player is choosing among several. */
  repeatTrack?: boolean
}): string {
  const car = input.carName?.trim() ?? ''
  const rival = input.personalityName?.trim() ?? ''
  const track = input.trackName?.trim() ?? ''
  if (!car) return 'No hay un modelo cargado. Sin auto no se puede largar.'
  const withCar = `Hoy corrés con ${car}.`
  if (!rival) return `${withCar} Todavía no hay un rival cargado.`
  const withRival = `${withCar} El rival maneja al estilo ${rival}.`
  const laps = input.laps
  if (!track || laps === undefined || !Number.isFinite(laps) || laps <= 0) {
    return `${withRival} No hay circuito cargado, así que no se puede largar.`
  }
  const place = input.repeatTrack ? ` en el circuito ${track}` : ''
  const length =
    Math.trunc(laps) === 1
      ? `Se corre ${lapsPhrase(laps)}${place}.`
      : `Se corren ${lapsPhrase(laps)}${place}.`
  return `${withRival} ${length}`
}

export function canStartRace(input: {
  carName?: string
  personalityName?: string
  trackName?: string
  laps?: number
}): boolean {
  const laps = input.laps
  return Boolean(
    input.carName?.trim() &&
    input.personalityName?.trim() &&
    input.trackName?.trim() &&
    laps !== undefined &&
    Number.isFinite(laps) &&
    laps > 0,
  )
}

export const screen: ScreenModule = {
  id: 'menu',
  mount(root, ctx) {
    const panel = el('main', 'panel menu')
    const tracks = listTracks()
    const state = ctx.getState()
    const picked = tracks.find((track) => track.id === state.trackId) ?? tracks[0]
    if (picked && picked.id !== state.trackId) ctx.updateState({ trackId: picked.id })
    let trackId = picked?.id

    const lineup = el('p', 'menu-lineup')
    lineup.id = 'menu-lineup'
    lineup.setAttribute('aria-live', 'polite')

    const facts = () => {
      const track = tracks.find((item) => item.id === trackId)
      const now = ctx.getState()
      const car = listCars().find((item) => item.id === now.carId)
      const personality = listPersonalities().find((item) => item.id === now.personalityId)
      return {
        carName: car?.name,
        personalityName: personality?.name,
        trackName: track?.name,
        laps: track?.laps,
        repeatTrack: tracks.length > 1,
      }
    }

    const start = button('Arrancá a correr', 'primary', () => {
      ctx.resumeAudio()
      ctx.play('click')
      if (!canStartRace(facts())) return
      ctx.startRace()
    })

    const paint = () => {
      const next = facts()
      const text = lineupText(next)
      if (lineup.textContent !== text) lineup.textContent = text
      start.disabled = !canStartRace(next)
    }

    const intro = el('div', 'menu-block')
    intro.append(
      el('h1', undefined, 'AI Grand Prix'),
      el(
        'p',
        'menu-lead',
        'Cada auto está afinado como un modelo. Velocidad, contexto, razonamiento, creatividad y costo. Elegí uno y salí a ver si te cierra la vuelta.',
      ),
    )

    const circuit = el('div', 'menu-block')
    const heading = el('h2', undefined, 'Circuito')
    heading.id = 'menu-circuit-title'
    circuit.append(heading)
    if (tracks.length > 1) {
      const field = el('fieldset', 'choices menu-circuit')
      field.setAttribute('aria-labelledby', 'menu-circuit-title')
      for (const track of tracks) {
        field.append(
          choice(track, track.id === trackId, () => {
            trackId = track.id
            ctx.updateState({ trackId: track.id })
            paint()
          }),
        )
      }
      circuit.append(field)
    } else {
      circuit.append(el('p', undefined, circuitBlurb(tracks[0])))
    }

    const actions = el('div', 'stack menu-actions')
    actions.append(start)
    for (const link of ctx.links) {
      actions.append(
        button(link.label, link.variant, () => {
          ctx.play('click')
          ctx.go(link.id)
        }),
      )
    }

    panel.append(intro, circuit, lineup, actions, el('p', 'hint menu-keys', KEYS))
    paint()
    root.append(panel)
    return { unmount: () => panel.remove() }
  },
}

function choice(
  track: { id: string; name: string; description: string },
  checked: boolean,
  onChange: () => void,
): HTMLLabelElement {
  const row = el('label', 'choice menu-choice')
  const input = el('input')
  input.type = 'radio'
  input.name = 'track'
  input.value = track.id
  input.checked = checked
  input.addEventListener('change', onChange)
  const copy = el('span', 'menu-choice-copy')
  copy.append(el('span', 'menu-choice-name', track.name))
  if (track.description.trim()) {
    copy.append(el('span', 'menu-choice-note', track.description))
  }
  row.append(input, copy)
  return row
}
