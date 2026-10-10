import { el } from '../controls.ts'
import { formatRaceTime } from '../format.ts'
import type { HudWidget, UiFrame } from '../types.ts'
import type { RaceSnapshot, RacerSnapshot } from '../../race/types.ts'

/**
 * Pit radio. A new lap, wall, shortcut or finish moves the line once.
 * Shortcut is the racer surface on the snapshot: the sim does not emit that
 * event. Update reads UiFrame and nothing else.
 */

export const RADIO_HOLD_S = 2.8

const PRIORITY = {
  lap: 10,
  shortcut: 20,
  wall: 30,
  finish: 40,
} as const

const STYLE_ID = 'agp-radio-style'

const RADIO_CSS = `
.agp-radio {
  position: absolute;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  max-width: min(32rem, calc(100% - 32px));
  margin: 0;
  padding: 8px 14px;
  background: var(--surface);
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: calc(var(--radius-panel) / 2);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: var(--leading-snug);
  text-align: start;
  pointer-events: none;
}

.agp-radio::before {
  content: '';
  flex: 0 0 auto;
  width: 3px;
  align-self: stretch;
  background: var(--accent);
  border-radius: 2px;
}

.agp-radio[hidden] {
  display: none;
}

@media (max-width: 720px) {
  .agp-radio {
    top: 144px;
    max-width: calc(100% - 24px);
  }
}
`

interface RadioCue {
  key: string
  priority: number
  line: string
  at: number
}

export interface RadioState {
  line: string
  revision: number
  activeKey: string | null
  activeUntil: number
  activePriority: number
  queue: readonly RadioCue[]
  seen: readonly string[]
  surfaces: Readonly<Record<string, string>>
  primed: boolean
  snapshot: RaceSnapshot | null
  trackId: string | null
  raceStamp: number
}

export function createRadioState(): RadioState {
  return {
    line: '',
    revision: 0,
    activeKey: null,
    activeUntil: 0,
    activePriority: 0,
    queue: [],
    seen: [],
    surfaces: {},
    primed: false,
    snapshot: null,
    trackId: null,
    raceStamp: 0,
  }
}

export function stepRadio(state: RadioState, frame: UiFrame): RadioState {
  const snapshot = frame.snapshot
  if (!snapshot) return state
  if (snapshot === state.snapshot) return state

  if (
    state.trackId !== null &&
    (snapshot.trackId !== state.trackId || snapshot.time < state.raceStamp)
  ) {
    state = createRadioState()
  }

  const seen = new Set(state.seen)
  const surfaces: Record<string, string> = { ...state.surfaces }
  const cues: RadioCue[] = []
  const finishedIds = new Set<string>()

  for (const event of snapshot.events) {
    if (event.type === 'finish') finishedIds.add(event.racerId)
  }

  for (const event of snapshot.events) {
    if (event.type !== 'lap' && event.type !== 'wall' && event.type !== 'finish') continue
    const key = `${event.type}:${event.racerId}:${event.time}`
    if (event.type === 'lap' && finishedIds.has(event.racerId)) {
      seen.add(key)
      continue
    }
    const racer = findRacer(snapshot, event.racerId)
    const kind = event.type
    pushCue(
      cues,
      seen,
      key,
      racer ? lineForEvent(snapshot, racer, kind, seen) : '',
      rank(kind, racer),
      event.time,
    )
  }

  if (state.primed) {
    for (const racer of snapshot.racers) {
      const previous = surfaces[racer.id]
      if (previous === 'shortcut' || racer.surface !== 'shortcut') continue
      const key = `shortcut:${racer.id}:${snapshot.time}`
      pushCue(cues, seen, key, shortcutLine(racer, seen), rank('shortcut', racer), snapshot.time)
    }
  }

  for (const racer of snapshot.racers) surfaces[racer.id] = racer.surface

  const aired = air(state, snapshot.time, cues)
  return {
    ...aired,
    seen: seen.size === state.seen.length ? state.seen : [...seen],
    surfaces,
    primed: true,
    snapshot,
    trackId: snapshot.trackId,
    raceStamp: snapshot.time,
  }
}

export const widget: HudWidget = {
  id: 'radio',
  mount(parent) {
    acquireStyle()
    const line = el('p', 'agp-radio')
    line.dataset.widget = 'radio'
    line.setAttribute('role', 'status')
    line.setAttribute('aria-live', 'polite')
    line.setAttribute('aria-atomic', 'true')
    line.hidden = true
    parent.append(line)

    let state = createRadioState()
    return {
      update(frame) {
        const next = stepRadio(state, frame)
        if (next.line !== state.line) writeLine(line, next.line)
        state = next
      },
      unmount() {
        line.remove()
        releaseStyle()
      },
    }
  },
}

let styleUsers = 0

function acquireStyle(): void {
  styleUsers += 1
  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.append(style)
  }
  style.textContent = RADIO_CSS
}

function releaseStyle(): void {
  styleUsers = Math.max(0, styleUsers - 1)
  if (styleUsers > 0) return
  document.getElementById(STYLE_ID)?.remove()
}

function writeLine(line: HTMLElement, text: string): void {
  if (text.length === 0) {
    line.hidden = true
    line.textContent = ''
    return
  }
  line.textContent = text
  line.hidden = false
}

function air(
  state: RadioState,
  time: number,
  cues: RadioCue[],
): Pick<
  RadioState,
  'line' | 'revision' | 'activeKey' | 'activeUntil' | 'activePriority' | 'queue'
> {
  const held = state.activeKey !== null && time < state.activeUntil
  const due = !held ? state.queue[0] : undefined
  const pool = due ? [...cues, due] : cues
  if (pool.length === 0) return still(state)

  pool.sort((a, b) => b.priority - a.priority || b.at - a.at)
  const top = pool[0]
  if (!top) return still(state)

  const idle = state.activeKey === null
  if (!idle && held && top.priority <= state.activePriority) {
    return still(state, mergeQueue(state.queue, cues))
  }

  let queue = state.queue
  if (due && top.key === due.key) queue = queue.slice(1)
  const extra = pool.slice(1).filter((cue) => cue.key !== due?.key)
  return {
    line: top.line,
    revision: state.revision + 1,
    activeKey: top.key,
    activeUntil: time + RADIO_HOLD_S,
    activePriority: top.priority,
    queue: mergeQueue(queue, extra),
  }
}

function still(
  state: RadioState,
  queue: readonly RadioCue[] = state.queue,
): Pick<
  RadioState,
  'line' | 'revision' | 'activeKey' | 'activeUntil' | 'activePriority' | 'queue'
> {
  return {
    line: state.line,
    revision: state.revision,
    activeKey: state.activeKey,
    activeUntil: state.activeUntil,
    activePriority: state.activePriority,
    queue,
  }
}

function pushCue(
  cues: RadioCue[],
  seen: Set<string>,
  key: string,
  line: string,
  priority: number,
  at: number,
): void {
  if (seen.has(key)) return
  seen.add(key)
  if (line.length === 0) return
  cues.push({ key, priority, line, at })
}

function mergeQueue(queue: readonly RadioCue[], extra: readonly RadioCue[]): readonly RadioCue[] {
  if (extra.length === 0) return queue
  const merged = [...queue, ...extra]
  merged.sort((a, b) => b.priority - a.priority || b.at - a.at)
  const kept: RadioCue[] = []
  const keys = new Set<string>()
  for (const cue of merged) {
    if (keys.has(cue.key)) continue
    keys.add(cue.key)
    kept.push(cue)
    if (kept.length === 3) break
  }
  return kept
}

function lineForEvent(
  snapshot: RaceSnapshot,
  racer: RacerSnapshot,
  kind: 'lap' | 'wall' | 'finish',
  seen: Set<string>,
): string {
  if (kind === 'lap') return lapLine(snapshot, racer)
  if (kind === 'wall') return wallLine(racer, heard(seen, `wall:${racer.id}:`))
  return finishLine(racer)
}

function lapLine(snapshot: RaceSnapshot, racer: RacerSnapshot): string {
  const clock = lastLap(racer)
  if (!racer.isPlayer) {
    return clock ? `${racer.name} cerró la vuelta en ${clock}.` : `${racer.name} cerró la vuelta.`
  }
  const left = snapshot.laps - racer.lap
  if (left <= 0) return ''
  const head = clock ? `Cerraste la vuelta en ${clock}.` : 'Cerraste la vuelta.'
  const tail = left === 1 ? 'Te queda una.' : `Quedan ${left}.`
  return `${head} ${tail}`
}

function wallLine(racer: RacerSnapshot, repeat: boolean): string {
  if (!racer.isPlayer) {
    return repeat ? `${racer.name} tocó el muro otra vez.` : `${racer.name} tocó el muro.`
  }
  return repeat ? 'Otra vez el muro. Abrí la línea.' : 'Tocaste el muro. Enderezá y seguí.'
}

function shortcutLine(racer: RacerSnapshot, seen: Set<string>): string {
  const repeat = heard(seen, `shortcut:${racer.id}:`)
  if (!racer.isPlayer) {
    return repeat ? `${racer.name} volvió a entrar al corte.` : `${racer.name} entró al corte.`
  }
  return repeat ? 'Otra vez por el corte. Mantené el auto.' : 'Entraste al corte. Mantené el auto.'
}

function finishLine(racer: RacerSnapshot): string {
  const clock = racer.finishTime === null ? null : formatRaceTime(racer.finishTime)
  if (!racer.isPlayer) {
    if (racer.position === 1) {
      return clock ? `${racer.name} cruzó primero en ${clock}.` : `${racer.name} cruzó primero.`
    }
    return clock ? `${racer.name} cruzó en ${clock}.` : `${racer.name} cruzó la meta.`
  }
  if (racer.position === 1) {
    return clock ? `Cruzaste primero en ${clock}.` : 'Cruzaste primero.'
  }
  return clock ? `Llegaste ${racer.position}º en ${clock}.` : `Llegaste ${racer.position}º.`
}

function lastLap(racer: RacerSnapshot): string | null {
  const time = racer.lapTimes[racer.lapTimes.length - 1]
  return time === undefined ? null : formatRaceTime(time)
}

function findRacer(snapshot: RaceSnapshot, id: string): RacerSnapshot | undefined {
  return snapshot.racers.find((racer) => racer.id === id)
}

function rank(kind: keyof typeof PRIORITY, racer: RacerSnapshot | undefined): number {
  return PRIORITY[kind] + (racer?.isPlayer ? 1 : 0)
}

function heard(seen: Set<string>, prefix: string): boolean {
  for (const key of seen) {
    if (key.startsWith(prefix)) return true
  }
  return false
}
