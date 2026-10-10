import { mixPose } from '../core/pose.ts'
import { SIM_HZ } from '../core/budget.ts'
import { FixedStepper } from '../core/loop.ts'
import { AudioManager } from '../audio/manager.ts'
import { mountDevices, pollInput } from '../input/registry.ts'
import { onPreferences, preferences } from './preferences.ts'
import { raceFromState } from './race-factory.ts'
import { getGameState, updateGameState } from './state.ts'
import { playerRacer, respawnRacer, snapshotRace, stepRace } from '../race/world.ts'
import type { RaceSnapshot, RaceWorld } from '../race/types.ts'
import { FpsOverlay } from '../render/fps.ts'
import type { RenderPose } from '../render/types.ts'
import { RaceView } from '../render/scene.ts'
import { getCar, listCars } from '../cars/registry.ts'
import { placeOnTrack } from '../tracks/spline.ts'
import { getTrack } from '../tracks/registry.ts'
import { Shell } from '../ui/shell.ts'
import { clamp } from '../core/math.ts'

export interface AgpDebug {
  ready: boolean
  screen: string
  frameCount: number
  avgFrameMs: number
  avgSimMs: number
  playerLap: number
  playerSpeed: number
  finished: boolean
}

declare global {
  interface Window {
    __AGP?: AgpDebug
  }
}

export async function startGame(options: {
  canvas: HTMLCanvasElement
  ui: HTMLElement
  fps: HTMLElement
}): Promise<void> {
  const audio = new AudioManager()
  const fps = new FpsOverlay(options.fps)
  const stepper = new FixedStepper(SIM_HZ)
  const autodrive = new URLSearchParams(window.location.search).has('autodrive')
  let world: RaceWorld | null = null
  let current: RaceSnapshot | null = null
  let previous: RaceSnapshot | null = null
  let alpha = 1
  let paused = false
  let confirmed = false
  let audioMode: 'menu' | 'race' | 'quiet' = 'quiet'
  let frameCount = 0
  let last = performance.now()
  let raceView: RaceView

  const shell = new Shell(options.ui, {
    startRace,
    quit,
    getState: getGameState,
    updateState: updateGameState,
    play: (id) => audio.play(id),
    resumeAudio: () => audio.resume(),
  })

  mountDevices(options.ui)
  shell.show('loading')

  try {
    await audio.load()
    raceView = await RaceView.create(options.canvas)
  } catch (error) {
    shell.show('error')
    const node = options.ui.querySelector('[data-error]')
    if (node) {
      node.textContent =
        error instanceof Error
          ? `No pudimos abrir el gráfico. ${error.message}`
          : 'No pudimos abrir el gráfico.'
    }
    return
  }

  raceView.setPixelRatioCap(preferences.pixelRatioCap)
  onPreferences(() => {
    raceView.setPixelRatioCap(preferences.pixelRatioCap)
    audio.setMode(audioMode)
  })
  window.addEventListener('resize', () => raceView.resize())

  if (audio.missing().length > 0) {
    const banner = document.createElement('p')
    banner.className = 'banner'
    banner.setAttribute('role', 'status')
    banner.textContent = 'Falta algún audio. La carrera sigue, sin ese sonido.'
    options.ui.parentElement?.append(banner)
  }

  setMode('menu')
  shell.show('menu')

  const loop = (now: number) => {
    const frameMs = Math.min(100, Math.max(0, now - last))
    last = now
    const input = pollInput()
    if (input.fpsEdge) fps.toggle()
    if (input.pauseEdge && world) {
      if (shell.screenId === 'hud') {
        paused = true
        shell.show('pause')
      } else if (shell.screenId === 'pause') {
        paused = false
        shell.show('hud')
      }
    }

    const simStarted = performance.now()
    const racing = Boolean(world) && !paused && shell.screenId === 'hud'
    if (world && racing) {
      if (input.respawnEdge) respawnRacer(world, playerRacer(world))
      const stepped = stepper.advance(frameMs / 1000, (dt) => {
        if (!world) return
        stepRace(world, input.vehicle, dt)
      })
      alpha = stepped.alpha
      previous = current
      current = snapshotRace(world)
      if (current.events.some((event) => event.type === 'collision' || event.type === 'wall')) {
        audio.play('crash')
      }
      const player = current.racers.find((racer) => racer.isPlayer)
      audio.updateEngine(
        rpm(player?.speed ?? 0, input.vehicle.throttle),
        input.vehicle.throttle,
        player?.slip ?? 0,
      )
      if (world.finished && !confirmed) {
        confirmed = true
        audio.play('confirm')
        setMode('menu')
        shell.show('results')
        shell.update({ snapshot: current })
      }
    } else {
      audio.updateEngine(900, 0, 0)
    }
    const simMs = performance.now() - simStarted

    const track = world?.track ?? getTrack(getGameState().trackId)
    const mode = world && shell.screenId !== 'menu' && shell.screenId !== 'garage' ? 'race' : 'menu'
    raceView.render({
      dt: frameMs / 1000,
      time: now / 1000,
      track,
      poses:
        mode === 'race' && current ? movingPoses(previous, current, alpha) : parkedPoses(track.id),
      mode,
    })
    if (shell.screenId === 'hud' || shell.screenId === 'results') {
      shell.update({ snapshot: current })
    }
    fps.push(frameMs, simMs)
    frameCount += 1
    const averages = fps.averages()
    const player = current?.racers.find((racer) => racer.isPlayer)
    window.__AGP = {
      ready: true,
      screen: shell.screenId,
      frameCount,
      avgFrameMs: averages.frameMs,
      avgSimMs: averages.simMs,
      playerLap: player?.lap ?? 0,
      playerSpeed: player?.speed ?? 0,
      finished: Boolean(world?.finished),
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  function startRace(): void {
    world = raceFromState(getGameState(), autodrive ? 'ai' : 'human')
    current = snapshotRace(world)
    previous = current
    alpha = 1
    paused = false
    confirmed = false
    stepper.reset()
    setMode('race')
    shell.show('hud')
  }

  function quit(): void {
    world = null
    current = null
    previous = null
    paused = false
    confirmed = false
    setMode('menu')
    shell.show('menu')
  }

  function setMode(mode: 'menu' | 'race' | 'quiet'): void {
    audioMode = mode
    audio.setMode(mode)
  }
}

function movingPoses(
  previous: RaceSnapshot | null,
  current: RaceSnapshot,
  alpha: number,
): RenderPose[] {
  const bodies = current.racers.map((racer) => {
    const before = previous?.racers.find((item) => item.id === racer.id) ?? racer
    const pose = mixPose(before, racer, alpha)
    return toPose(racer, pose.x, pose.z, pose.yaw, pose.steer)
  })
  const extras = current.extras.map((extra) =>
    toPose(extra, extra.x, extra.z, extra.yaw, extra.steer),
  )
  return [...bodies, ...extras]
}

function parkedPoses(trackId: string): RenderPose[] {
  const track = getTrack(trackId)
  const cars = listCars()
  const player = getCar(getGameState().carId)
  const rival = cars.find((car) => car.id !== player.id) ?? player
  const left = placeOnTrack(track, 14, -2.3)
  const right = placeOnTrack(track, 14, 2.3)
  return [
    {
      id: 'player',
      ...left,
      steer: 0,
      speed: 0,
      slip: 0,
      color: player.color,
      modelUrl: player.modelUrl,
    },
    {
      id: 'rival',
      x: right.x,
      z: right.z,
      yaw: right.yaw,
      steer: 0,
      speed: 0,
      slip: 0,
      color: rival.color,
      modelUrl: rival.modelUrl,
    },
  ]
}

function toPose(
  racer: { id: string; speed: number; slip: number; color: string; modelUrl: string },
  x: number,
  z: number,
  yaw: number,
  steer: number,
): RenderPose {
  return {
    id: racer.id,
    x,
    z,
    yaw,
    steer,
    speed: racer.speed,
    slip: racer.slip,
    color: racer.color,
    modelUrl: racer.modelUrl,
  }
}

function rpm(speed: number, throttle: number): number {
  const ratio = clamp(Math.abs(speed) / 52, 0, 1.2)
  return 900 + ratio * 5600 + throttle * 500
}
