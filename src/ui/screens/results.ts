import { formatRaceTime } from '../format.ts'
import { button, el } from '../controls.ts'
import type { RaceSnapshot, RacerSnapshot } from '../../race/types.ts'
import type { ScreenModule } from '../types.ts'

/** Labels are the rematch contract. Do not rename them. */
export const PODIUM_REMATCH = 'Otra carrera'
export const PODIUM_MENU = 'Volver al menú'

export interface PodiumEntry {
  id: string
  name: string
  color: string
  position: number
  isPlayer: boolean
  finishLabel: string
  gapLabel: string | null
  lapsLine: string | null
}

export interface PodiumStep extends PodiumEntry {
  /** Flex order so the winner stands in the middle while DOM stays 1, 2, 3. */
  visualOrder: number
}

export interface PodiumView {
  lead: string
  detail: string
  steps: PodiumStep[]
  rows: PodiumEntry[]
}

interface PodiumContext {
  resumeAudio(): void
  play(id: string): void
  startRace(): void
  quit(): void
}

export function podiumActions(ctx: PodiumContext): { rematch: () => void; menu: () => void } {
  return {
    rematch() {
      ctx.resumeAudio()
      ctx.play('click')
      ctx.startRace()
    },
    menu() {
      ctx.play('click')
      ctx.quit()
    },
  }
}

export function paintColor(color: string): string {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : 'var(--fg-3)'
}

/** Gap against the winner. Null when it would display as nothing. */
export function formatGap(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const clock = formatRaceTime(seconds)
  if (clock === '0:00.000') return null
  if (seconds >= 60) return `+${clock}`
  const body = clock.slice(2).replace(/^0/, '')
  return `+${body}`
}

export function rankRacers(racers: readonly RacerSnapshot[]): PodiumEntry[] {
  const ordered = [...racers].sort(compareRacers)
  const winnerTime = ordered[0]?.finishTime ?? null
  return ordered.map((racer, index) => toEntry(racer, winnerTime, index === 0))
}

export function podiumView(snapshot: RaceSnapshot | null): PodiumView {
  if (!snapshot) {
    return {
      lead: 'Estamos cerrando los tiempos.',
      detail: '',
      steps: [],
      rows: [],
    }
  }
  const rows = rankRacers(snapshot.racers)
  return {
    lead: joinSentences([leadCopy(rows), marginCopy(rows)]),
    detail: trackCopy(snapshot.trackName, snapshot.laps),
    steps: rows.slice(0, 3).map((entry, index, all) => ({
      ...entry,
      visualOrder: visualOrder(index, all.length),
    })),
    rows,
  }
}

export const screen: ScreenModule = {
  id: 'results',
  mount(root, ctx) {
    const panel = el('main', 'panel podium')
    const heading = el('h1', undefined, 'Terminó la carrera')
    heading.id = 'results-title'
    panel.setAttribute('aria-labelledby', heading.id)

    const lead = el('p', 'lead')
    lead.setAttribute('role', 'status')
    lead.setAttribute('aria-live', 'polite')
    const detail = el('p', 'hint')
    const stepsHeading = el('h2', undefined, 'Podio')
    stepsHeading.id = 'results-podium-title'
    const board = el('ol', 'podium-board')
    board.setAttribute('aria-labelledby', stepsHeading.id)
    const timesHeading = el('h2', undefined, 'Tiempos')
    timesHeading.id = 'results-times-title'
    const list = el('ol', 'stats')
    list.setAttribute('aria-labelledby', timesHeading.id)

    const body = el('div', 'podium-body')
    body.append(heading, lead, detail, stepsHeading, board, timesHeading, list)
    const actions = podiumActions(ctx)
    const actionBar = el('div', 'podium-actions')
    actionBar.append(
      button(PODIUM_REMATCH, 'primary', actions.rematch),
      button(PODIUM_MENU, 'ghost', actions.menu),
    )
    panel.append(el('style', undefined, PODIUM_CSS), body, actionBar)
    root.append(panel)

    let signature = ''
    const render = (view: PodiumView) => {
      lead.textContent = view.lead
      detail.textContent = view.detail
      detail.hidden = view.detail.length === 0
      const onPodium = view.steps.length > 0
      stepsHeading.hidden = !onPodium
      board.hidden = !onPodium
      board.dataset.count = String(view.steps.length)
      board.replaceChildren(...view.steps.map(stepNode))
      const ranked = view.rows.length > 0
      timesHeading.hidden = !ranked
      list.hidden = !ranked
      list.replaceChildren(...view.rows.map(rowNode))
    }
    render(podiumView(null))
    signature = viewSignature(null)

    return {
      update(frame) {
        const next = viewSignature(frame.snapshot)
        if (next === signature) return
        signature = next
        render(podiumView(frame.snapshot))
      },
      unmount: () => panel.remove(),
    }
  },
}

function stepNode(entry: PodiumStep): HTMLLIElement {
  const item = el('li', entry.isPlayer ? 'podium-step is-you' : 'podium-step')
  item.dataset.place = String(entry.position)
  item.style.order = String(entry.visualOrder)
  const who = el('span', 'who', named(entry))
  who.title = entry.name
  const bar = el('div', 'bar')
  const swatch = el('span', 'swatch')
  swatch.style.background = entry.color
  swatch.setAttribute('aria-hidden', 'true')
  bar.append(
    swatch,
    el('span', 'place', `${entry.position}º`),
    el('span', 'when', entry.finishLabel),
  )
  item.append(who, bar)
  return item
}

function rowNode(entry: PodiumEntry): HTMLLIElement {
  const row = el('li', entry.isPlayer ? 'is-you' : undefined)
  const who = el('span', 'who')
  const name = el('span', 'name')
  const swatch = el('span', 'row-swatch')
  swatch.style.background = entry.color
  swatch.setAttribute('aria-hidden', 'true')
  name.append(swatch, document.createTextNode(`${entry.position}º ${named(entry)}`))
  who.append(name)
  if (entry.lapsLine) who.append(el('small', 'laps', entry.lapsLine))
  const clock = el('span', 'clock', entry.finishLabel)
  if (entry.gapLabel) clock.append(el('small', 'laps', entry.gapLabel))
  row.append(who, clock)
  return row
}

function named(entry: PodiumEntry): string {
  const name = entry.name.trim() || 'El rival'
  return entry.isPlayer ? `${name}, vos` : name
}

function viewSignature(snapshot: RaceSnapshot | null): string {
  if (!snapshot) return 'pending'
  let sign = `${snapshot.trackName}\n${snapshot.laps}`
  for (const racer of snapshot.racers) {
    sign += `\n${racer.id}\t${racer.position}\t${racer.finishTime ?? ''}\t${racer.lapTimes.join(',')}\t${racer.name}\t${racer.isPlayer ? 1 : 0}\t${racer.color}`
  }
  return sign
}

function toEntry(racer: RacerSnapshot, winnerTime: number | null, isWinner: boolean): PodiumEntry {
  const finishLabel = racer.finishTime === null ? 'sin cerrar' : formatRaceTime(racer.finishTime)
  let gapLabel: string | null = null
  if (!isWinner && racer.finishTime !== null && winnerTime !== null) {
    gapLabel = formatGap(racer.finishTime - winnerTime)
  }
  return {
    id: racer.id,
    name: racer.name,
    color: paintColor(racer.color),
    position: racer.position,
    isPlayer: racer.isPlayer,
    finishLabel,
    gapLabel,
    lapsLine: lapsLine(racer.lapTimes),
  }
}

function lapsLine(lapTimes: readonly number[]): string | null {
  if (lapTimes.length === 0) return null
  const labels = lapTimes.map((time) => formatRaceTime(time))
  if (labels.length === 1) return labels[0] ?? null
  let bestIndex = 0
  for (let index = 1; index < lapTimes.length; index += 1) {
    const time = lapTimes[index] ?? Number.POSITIVE_INFINITY
    const best = lapTimes[bestIndex] ?? Number.POSITIVE_INFINITY
    if (time < best) bestIndex = index
  }
  const best = labels[bestIndex]
  if (!best) return labels.join(' · ')
  return `${labels.join(' · ')} · Mejor ${best}`
}

function compareRacers(a: RacerSnapshot, b: RacerSnapshot): number {
  if (a.position !== b.position) return a.position - b.position
  if (a.finishTime !== null && b.finishTime !== null && a.finishTime !== b.finishTime) {
    return a.finishTime - b.finishTime
  }
  if (a.finishTime === null && b.finishTime !== null) return 1
  if (a.finishTime !== null && b.finishTime === null) return -1
  const byName = a.name.localeCompare(b.name, 'es')
  if (byName !== 0) return byName
  return a.id.localeCompare(b.id, 'es')
}

function leadCopy(entries: readonly PodiumEntry[]): string {
  if (entries.length === 0) return 'No hay tiempos para mostrar.'
  const player = entries.find((entry) => entry.isPlayer)
  if (player?.position === 1) return 'Llegaste primero.'
  const winnerName = entries[0] ? named(entries[0]) : 'El rival'
  if (player && player.position > 1) return `Llegaste ${player.position}º. ${winnerName} te ganó.`
  return `${winnerName} llegó antes.`
}

function marginCopy(entries: readonly PodiumEntry[]): string {
  const player = entries.find((entry) => entry.isPlayer)
  if (!player) return ''
  if (player.position === 1) {
    const next = entries.find((entry) => entry.position > 1 && entry.gapLabel)
    if (next?.gapLabel)
      return `Le sacaste ${gapWords(next.gapLabel)} a ${next.name.trim() || 'el rival'}.`
    const pending = entries.filter((entry) => !entry.isPlayer && entry.finishLabel === 'sin cerrar')
    if (pending.length === 1) return `${pending[0]?.name.trim() || 'El rival'} todavía no cerró.`
    if (pending.length > 1) return 'El resto todavía no cerró.'
    return ''
  }
  if (player.gapLabel) return `Te sacó ${gapWords(player.gapLabel)}.`
  if (player.finishLabel === 'sin cerrar') return 'No llegaste a cerrar.'
  return ''
}

function gapWords(gapLabel: string): string {
  const body = gapLabel.startsWith('+') ? gapLabel.slice(1) : gapLabel
  return body.includes(':') ? body : `${body} s`
}

function trackCopy(name: string, laps: number): string {
  const label = name.trim()
  const vueltas = laps === 1 ? '1 vuelta' : laps > 1 ? `${laps} vueltas` : ''
  if (label && vueltas) return `Se corrió en ${label}, a ${vueltas}.`
  if (label) return `Se corrió en ${label}.`
  if (vueltas) return `Se corrió a ${vueltas}.`
  return ''
}

function joinSentences(parts: string[]): string {
  return parts.filter((part) => part.length > 0).join(' ')
}

function visualOrder(index: number, count: number): number {
  if (count >= 2 && index === 0) return 2
  if (count >= 2 && index === 1) return 1
  return index + 1
}

/** Scoped to `.podium`. Shared stylesheets stay untouched. */
const PODIUM_CSS = `
.podium.panel {
  overflow: hidden;
}

.podium .podium-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow: auto;
}

.podium .podium-actions {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 8px;
}

.podium .lead {
  color: var(--fg);
  font-size: var(--text-lg);
  font-weight: var(--weight-medium);
  line-height: var(--leading-snug);
}

.podium .podium-board {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  border-bottom: 1px solid var(--line);
}

.podium .podium-board[data-count='1'] {
  justify-content: center;
}

.podium .podium-step {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  max-width: 11rem;
}

.podium .podium-step .who {
  overflow: hidden;
  padding: 0 2px;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: var(--leading-snug);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.podium .podium-step.is-you .who {
  color: var(--accent);
}

.podium .podium-step .bar {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  min-height: 72px;
  padding: 8px 8px 10px;
  background: var(--surface-3);
  border-radius: var(--radius-panel) var(--radius-panel) 0 0;
  animation: podium-rise 420ms var(--ease-out) both;
}

.podium .podium-step[data-place='1'] .bar {
  min-height: 120px;
  background: var(--accent-wash);
  animation-delay: 120ms;
}

.podium .podium-step[data-place='2'] .bar {
  min-height: 92px;
  animation-delay: 40ms;
}

.podium .podium-step[data-place='3'] .bar {
  min-height: 72px;
  animation-delay: 80ms;
}

.podium .podium-step.is-you .bar {
  box-shadow: inset 0 0 0 1px var(--accent);
}

.podium .podium-step .swatch {
  display: block;
  width: 2rem;
  height: 4px;
  margin-right: auto;
  margin-bottom: auto;
  margin-left: auto;
  border-radius: var(--radius-control);
}

.podium .podium-step .place {
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  text-align: center;
}

.podium .podium-step[data-place='1'] .place {
  color: var(--accent);
}

.podium .podium-step .when {
  overflow: hidden;
  color: var(--fg-2);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.podium .stats li {
  align-items: flex-start;
  padding: 8px 10px;
  border-radius: var(--radius-panel);
}

.podium .stats li.is-you {
  background: var(--accent-wash);
}

.podium .stats .who {
  min-width: 0;
  font-weight: var(--weight-medium);
}

.podium .stats .name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.podium .stats li.is-you .who,
.podium .stats li.is-you .name {
  color: var(--accent);
}

.podium .row-swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: var(--radius-control);
  vertical-align: 0;
}

.podium .laps {
  display: block;
  margin-top: 2px;
  color: var(--fg-2);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--weight-normal);
}

.podium .clock {
  text-align: right;
  white-space: nowrap;
}

.podium .clock .laps {
  color: var(--fg-3);
}

@keyframes podium-rise {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}

@media (max-width: 720px) {
  .podium .podium-body {
    gap: 12px;
  }

  .podium .podium-step[data-place='1'] .bar {
    min-height: 96px;
  }

  .podium .podium-step[data-place='2'] .bar {
    min-height: 76px;
  }

  .podium .podium-step[data-place='3'] .bar {
    min-height: 60px;
  }

  .podium .stats li {
    padding: 6px 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .podium .podium-step .bar {
    animation: none;
  }
}
`
