import { listPersonalities } from '../../ai/registry.ts'
import {
  PLAYER_ID,
  RIVAL_ID,
  beginNextRound,
  currentChampionship,
  hintCopy,
  ingestRaceSnapshot,
  isComplete,
  leadCopy,
  loadSeason,
  primaryLabel,
  restartSeason,
  roundStatus,
  roundTitle,
  standingText,
  standings,
  type Entrant,
} from '../../championship/standings.ts'
import { listCars } from '../../cars/registry.ts'
import { listTracks } from '../../tracks/registry.ts'
import { button, el } from '../controls.ts'
import { getScreen } from '../screen-registry.ts'
import type { ScreenContext, ScreenModule } from '../types.ts'

const tapped = new WeakSet<ScreenModule>()

/** Listen for the finish snapshot without editing the results screen. */
export function installResultsTap(resultsScreen: ScreenModule): void {
  if (tapped.has(resultsScreen)) return
  const original = resultsScreen.mount
  resultsScreen.mount = (root, ctx) => {
    const mounted = original(root, ctx)
    return {
      update(frame) {
        try {
          mounted.update?.(frame)
        } finally {
          ingestRaceSnapshot(frame.snapshot)
        }
      },
      unmount() {
        mounted.unmount()
      },
    }
  }
  tapped.add(resultsScreen)
}

/**
 * Point the next round at its circuit and start it.
 * `updateState` runs before `startRace` so the race factory reads the new track.
 */
export function startChampionshipRound(
  ctx: Pick<ScreenContext, 'updateState' | 'startRace' | 'resumeAudio' | 'play'>,
): boolean {
  const round = beginNextRound()
  if (!round) return false
  ctx.updateState({ trackId: round.trackId })
  ctx.resumeAudio()
  ctx.play('click')
  ctx.startRace()
  return true
}

export const screen: ScreenModule = {
  id: 'championship',
  menu: { label: 'Campeonato', variant: 'ghost', order: 2 },
  mount(root, ctx) {
    installResultsTap(getScreen('results'))
    const tracks = listTracks().map((track) => ({ id: track.id, name: track.name }))
    loadSeason(tracks)

    const panel = el('main', 'panel')
    const lead = el('p')
    lead.setAttribute('aria-live', 'polite')
    const tableHeading = el('h2', undefined, 'Tabla')
    tableHeading.id = 'championship-standings'
    const table = el('ul', 'stats')
    table.setAttribute('aria-labelledby', tableHeading.id)
    const datesHeading = el('h2', undefined, 'Fechas')
    datesHeading.id = 'championship-rounds'
    const dates = el('ul', 'stats')
    dates.setAttribute('aria-labelledby', datesHeading.id)
    const hint = el('p', 'hint')
    hint.id = 'championship-hint'
    const primary = button('Arrancá la fecha 1', 'primary', () => onPrimary())
    primary.setAttribute('aria-describedby', hint.id)
    const back = button('Volver al menú', 'ghost', () => {
      ctx.play('click')
      ctx.go('menu')
    })

    const render = () => {
      const championship = currentChampionship() ?? loadSeason(tracks)
      const rows = standings(championship, entrantsFrom(ctx))
      const ranked = championship.results.length > 0
      lead.textContent = leadCopy(championship, rows)
      hint.textContent = hintCopy(championship, rivalStyle(ctx))
      table.replaceChildren(
        ...rows.map((row) => {
          const text = standingText(row, ranked)
          return statLine(text.name, text.value)
        }),
      )
      dates.replaceChildren(
        ...championship.rounds.map((round) =>
          statLine(roundTitle(round), roundStatus(championship, round)),
        ),
      )
      primary.textContent = primaryLabel(championship)
      primary.disabled = championship.rounds.length === 0
    }

    const onPrimary = () => {
      const championship = currentChampionship()
      if (!championship || championship.rounds.length === 0) return
      if (isComplete(championship)) {
        ctx.play('click')
        restartSeason(tracks)
        render()
        primary.focus()
        return
      }
      if (!startChampionshipRound(ctx)) render()
    }

    panel.append(
      el('h1', undefined, 'Campeonato'),
      lead,
      tableHeading,
      table,
      datesHeading,
      dates,
      hint,
      primary,
      back,
    )
    render()
    root.append(panel)
    return { unmount: () => panel.remove() }
  },
}

function entrantsFrom(ctx: ScreenContext): Entrant[] {
  const cars = listCars()
  const player = cars.find((car) => car.id === ctx.getState().carId) ?? cars[0]
  const rival = cars.find((car) => car.id !== player?.id) ?? player
  return [
    { id: PLAYER_ID, name: 'Vos' },
    { id: RIVAL_ID, name: rival?.name ?? 'El rival' },
  ]
}

function rivalStyle(ctx: ScreenContext): string | null {
  const style = listPersonalities().find((item) => item.id === ctx.getState().personalityId)
  return style?.name ?? null
}

function statLine(label: string, value: string): HTMLLIElement {
  const item = el('li')
  item.style.alignItems = 'baseline'
  item.style.flexWrap = 'wrap'
  const name = el('span', undefined, label)
  name.style.flex = '1 1 10rem'
  name.style.minWidth = '0'
  const detail = el('span', undefined, value)
  detail.style.flex = '0 0 auto'
  item.append(name, detail)
  return item
}
