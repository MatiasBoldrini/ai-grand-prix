/**
 * A three-round points season. Standings live here, not on `GameState`,
 * which only stores the car, the track and the rival.
 *
 * The shell delivers a finish snapshot to the mounted screen. That screen is
 * `results`, so the championship screen wraps its mount and calls
 * `ingestRaceSnapshot` once the player has armed a round from here.
 */

export const SEASON_LENGTH = 3
export const PLAYER_ID = 'player'
export const RIVAL_ID = 'rival'

/** First and second. Anyone else in the field scores nothing. */
const POINTS_BY_PLACE = [8, 5] as const

const FIELD = new Set<string>([PLAYER_ID, RIVAL_ID])

export interface TrackRef {
  id: string
  name: string
}

export interface RoundPlan {
  index: number
  trackId: string
  trackName: string
}

export interface ClassifiedRacer {
  id: string
  name: string
  position: number
  finishTime: number | null
}

export interface ClassifiedRace {
  finished: boolean
  racers: readonly ClassifiedRacer[]
}

export interface RoundResult {
  index: number
  trackId: string
  trackName: string
  finishers: ClassifiedRacer[]
}

export interface Championship {
  rounds: RoundPlan[]
  results: RoundResult[]
  /** Round waiting for a finish. Null when nothing is on track. */
  pendingIndex: number | null
}

export interface StandingRow {
  id: string
  name: string
  points: number
  wins: number
  /** 1-based. Tied rows share a place. */
  position: number
}

export interface Entrant {
  id: string
  name: string
}

export type Title = { kind: 'none' } | { kind: 'leader'; row: StandingRow } | { kind: 'tie' }

export function pointsForPosition(position: number): number {
  if (position < 1) return 0
  return POINTS_BY_PLACE[position - 1] ?? 0
}

export function planRounds(tracks: readonly TrackRef[]): RoundPlan[] {
  if (tracks.length === 0) return []
  const rounds: RoundPlan[] = []
  for (let index = 0; index < SEASON_LENGTH; index += 1) {
    const track = tracks[index % tracks.length]
    if (!track) continue
    rounds.push({ index, trackId: track.id, trackName: track.name })
  }
  return rounds
}

export function createChampionship(tracks: readonly TrackRef[]): Championship {
  return { rounds: planRounds(tracks), results: [], pendingIndex: null }
}

export function isComplete(championship: Championship): boolean {
  return championship.rounds.length > 0 && championship.results.length >= championship.rounds.length
}

export function nextRound(championship: Championship): RoundPlan | null {
  const done = new Set(championship.results.map((result) => result.index))
  return championship.rounds.find((round) => !done.has(round.index)) ?? null
}

/** Score a finish against the armed round. Returns the same object when nothing changes. */
export function recordFinish(championship: Championship, race: ClassifiedRace): Championship {
  if (championship.pendingIndex === null || !race.finished) return championship
  const round = championship.rounds[championship.pendingIndex]
  if (!round) return championship
  if (championship.results.some((result) => result.index === round.index)) {
    return { ...championship, pendingIndex: null }
  }
  const finishers = race.racers
    .filter((racer) => FIELD.has(racer.id))
    .map((racer) => ({
      id: racer.id,
      name: racer.name,
      position: racer.position,
      finishTime: racer.finishTime,
    }))
    .sort((a, b) => a.position - b.position)
  if (finishers.length === 0) return championship
  return {
    rounds: championship.rounds,
    pendingIndex: null,
    results: [
      ...championship.results,
      { index: round.index, trackId: round.trackId, trackName: round.trackName, finishers },
    ],
  }
}

export function standings(championship: Championship, entrants: readonly Entrant[]): StandingRow[] {
  const seed = new Map(entrants.map((entrant, index) => [entrant.id, index]))
  const table = new Map<string, { id: string; name: string; points: number; wins: number }>()
  for (const entrant of entrants) {
    if (!FIELD.has(entrant.id)) continue
    table.set(entrant.id, { id: entrant.id, name: entrant.name, points: 0, wins: 0 })
  }
  for (const result of championship.results) {
    for (const finisher of result.finishers) {
      if (!FIELD.has(finisher.id)) continue
      const row = table.get(finisher.id) ?? {
        id: finisher.id,
        name: finisher.name,
        points: 0,
        wins: 0,
      }
      row.name = finisher.name
      row.points += pointsForPosition(finisher.position)
      if (finisher.position === 1) row.wins += 1
      table.set(finisher.id, row)
    }
  }
  const sorted = [...table.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.wins !== a.wins) return b.wins - a.wins
    return (seed.get(a.id) ?? 99) - (seed.get(b.id) ?? 99)
  })
  let place = 0
  let previousKey = ''
  return sorted.map((row, index) => {
    const key = `${row.points}:${row.wins}`
    if (key !== previousKey) {
      place = index + 1
      previousKey = key
    }
    return { ...row, position: place }
  })
}

export function titleHolder(rows: readonly StandingRow[]): Title {
  const top = rows[0]
  if (!top || (top.points === 0 && top.wins === 0)) return { kind: 'none' }
  const tied = rows.filter((row) => row.points === top.points && row.wins === top.wins)
  if (tied.length > 1) return { kind: 'tie' }
  return { kind: 'leader', row: top }
}

export function standingText(
  row: StandingRow,
  showPlace: boolean,
): { name: string; value: string } {
  const value =
    row.wins === 1
      ? `${row.points} pts, 1 victoria`
      : row.wins > 1
        ? `${row.points} pts, ${row.wins} victorias`
        : `${row.points} pts`
  return { name: showPlace ? `${row.position}º ${row.name}` : row.name, value }
}

export function roundTitle(round: RoundPlan): string {
  return `Fecha ${round.index + 1}, ${round.trackName}`
}

export function roundStatus(championship: Championship, round: RoundPlan): string {
  const result = championship.results.find((item) => item.index === round.index)
  if (!result) return championship.pendingIndex === round.index ? 'En curso' : 'Pendiente'
  const player = result.finishers.find((finisher) => finisher.id === PLAYER_ID)
  if (!player) return 'Sin resultado'
  if (player.position === 1) return 'Ganaste'
  if (player.position === 2) return 'Segundo'
  return `Puesto ${player.position}`
}

export function primaryLabel(championship: Championship): string {
  if (championship.rounds.length === 0) return 'Sin circuitos'
  if (isComplete(championship)) return 'Otro campeonato'
  const next = nextRound(championship)
  if (!next) return 'Otro campeonato'
  const verb = championship.pendingIndex === next.index ? 'Retomá' : 'Arrancá'
  return `${verb} la fecha ${next.index + 1}`
}

export function leadCopy(championship: Championship, rows: readonly StandingRow[]): string {
  if (championship.rounds.length === 0) {
    return 'No hay circuitos cargados para armar el campeonato.'
  }
  if (isComplete(championship)) return completeCopy(rows)
  if (championship.results.length === 0) return freshCopy(championship)
  return midCopy(championship, rows)
}

export function hintCopy(championship: Championship, rivalStyle: string | null): string {
  if (championship.rounds.length === 0)
    return 'Cuando haya un circuito cargado, vas a poder largar.'
  const style = rivalStyle ? ` El rival maneja al estilo ${rivalStyle}.` : ''
  if (isComplete(championship)) {
    return 'Otro campeonato arranca de cero, con el auto que tengas en el garaje.'
  }
  if (championship.pendingIndex !== null) {
    return `La fecha quedó a medias. La podés retomar cuando quieras.${style}`
  }
  return `El auto sale del garaje.${style} Al cerrar la fecha, volvé a entrar para ver la tabla.`
}

const seasonStore: { current: Championship | null } = { current: null }

export function resetChampionshipStore(): void {
  seasonStore.current = null
}

export function currentChampionship(): Championship | null {
  return seasonStore.current
}

export function loadSeason(tracks: readonly TrackRef[]): Championship {
  const rounds = planRounds(tracks)
  const current = seasonStore.current
  if (current && (hasProgress(current) || sameRounds(current.rounds, rounds))) return current
  const created: Championship = { rounds, results: [], pendingIndex: null }
  seasonStore.current = created
  return created
}

export function restartSeason(tracks: readonly TrackRef[]): Championship {
  seasonStore.current = createChampionship(tracks)
  return seasonStore.current
}

/** Arm the next round, or keep the one already on track so a quit can be retried. */
export function beginNextRound(): RoundPlan | null {
  const current = seasonStore.current
  if (!current || isComplete(current)) return null
  let season = current
  if (season.pendingIndex === null) {
    const next = nextRound(season)
    if (!next) return null
    season = { ...season, pendingIndex: next.index }
    seasonStore.current = season
  }
  const pending = season.pendingIndex
  if (pending === null) return null
  return season.rounds[pending] ?? null
}

export function ingestRaceSnapshot(race: ClassifiedRace | null | undefined): boolean {
  const current = seasonStore.current
  if (!current || !race) return false
  const next = recordFinish(current, race)
  if (next === current) return false
  seasonStore.current = next
  return true
}

function hasProgress(championship: Championship): boolean {
  return championship.results.length > 0 || championship.pendingIndex !== null
}

function sameRounds(left: readonly RoundPlan[], right: readonly RoundPlan[]): boolean {
  if (left.length !== right.length) return false
  return left.every((round, index) => {
    const other = right[index]
    return (
      other?.index === round.index &&
      other.trackId === round.trackId &&
      other.trackName === round.trackName
    )
  })
}

function freshCopy(championship: Championship): string {
  const base = `${fechasPhrase(championship.rounds.length)} El primero suma 8 puntos y el segundo, 5.${circuitSentence(championship.rounds)}`
  if (championship.pendingIndex === null) return base
  return `${base} La fecha ${championship.pendingIndex + 1} quedó a medias.`
}

function midCopy(championship: Championship, rows: readonly StandingRow[]): string {
  const next = nextRound(championship)
  const falta = next ? ` Falta la fecha ${next.index + 1}.` : ''
  const title = titleHolder(rows)
  if (title.kind === 'tie') return `Van empatados.${falta}`
  if (title.kind === 'leader' && title.row.id === PLAYER_ID) {
    return `Vas primero con ${title.row.points} puntos.${falta}`
  }
  if (title.kind === 'leader') {
    return `${title.row.name} va primero con ${title.row.points} puntos.${falta}`
  }
  return freshCopy(championship)
}

function completeCopy(rows: readonly StandingRow[]): string {
  const title = titleHolder(rows)
  if (title.kind === 'tie') {
    return 'Empataron el campeonato. Misma cantidad de puntos y de victorias.'
  }
  if (title.kind === 'leader' && title.row.id === PLAYER_ID) {
    return `Te quedaste con el campeonato. Sumaste ${title.row.points} puntos.`
  }
  if (title.kind === 'leader') {
    return `El título se lo llevó ${title.row.name}, con ${title.row.points} puntos.`
  }
  return 'El campeonato cerró sin puntos cargados.'
}

function circuitSentence(rounds: readonly RoundPlan[]): string {
  const names = [...new Set(rounds.map((round) => round.trackName))]
  const only = names[0]
  if (names.length === 1 && only) return ` Todas en ${only}.`
  if (names.length > 1) return ' Cada fecha cambia de circuito.'
  return ''
}

function fechasPhrase(count: number): string {
  if (count === 1) return 'Es una fecha.'
  return `Son ${countWord(count)} fechas.`
}

function countWord(count: number): string {
  const words = [
    'cero',
    'una',
    'dos',
    'tres',
    'cuatro',
    'cinco',
    'seis',
    'siete',
    'ocho',
    'nueve',
    'diez',
  ]
  return words[count] ?? String(count)
}
