import { clamp } from '../../core/math.ts'
import type { DeviceSample, InputDevice } from '../types.ts'

/**
 * On-screen pedals and a steering wheel for a phone.
 * Priority 3 owns the car only while a finger is on the wheel or a pedal,
 * so an idle overlay leaves the keyboard in charge.
 * The shell replaces `#ui` on every screen, so the overlay mounts beside it.
 */

const STEER_TRAVEL_PX = 68
const STEER_DEADZONE = 0.08
const STEER_CURVE = 1.25
const STYLE_ID = 'agp-touch-style'

export type TouchRole = 'steer' | 'throttle' | 'brake' | 'respawn'

export const device: InputDevice = {
  id: 'touch',
  priority: 3,
  poll,
  mount,
  unmount,
}

/**
 * Positive dx steers right. A short deadzone drops thumb jitter, and the
 * curve keeps small corrections finer than a shove to full lock.
 */
export function steerFromOffset(dx: number, fullLockPx = STEER_TRAVEL_PX): number {
  if (!Number.isFinite(dx) || !Number.isFinite(fullLockPx) || fullLockPx <= 0) return 0
  const linear = clamp(dx / fullLockPx, -1, 1)
  const magnitude = Math.abs(linear)
  if (magnitude <= STEER_DEADZONE) return 0
  const shaped = (magnitude - STEER_DEADZONE) / (1 - STEER_DEADZONE)
  return Math.sign(linear) * shaped ** STEER_CURVE
}

/** Pure read of which contacts own the pedals. A respawn tap is not a finger on the wheel. */
export function sampleFromHolds(
  roles: Iterable<TouchRole>,
  steer: number,
  respawnEdge: boolean,
): DeviceSample {
  let throttle = 0
  let brake = 0
  let steering = false
  for (const role of roles) {
    if (role === 'throttle') throttle = 1
    else if (role === 'brake') brake = 1
    else if (role === 'steer') steering = true
  }
  const steered = steering && Number.isFinite(steer) ? clamp(steer, -1, 1) : 0
  return {
    active: throttle > 0 || brake > 0 || steering,
    throttle,
    brake,
    steer: steered,
    pauseEdge: false,
    fpsEdge: false,
    respawnEdge,
  }
}

interface Hold {
  role: 'steer' | 'throttle' | 'brake'
  originX: number
}

const holds = new Map<number, Hold>()
const roleBuffer: TouchRole[] = []
let steerCommand = 0
let steerLatched = false
let respawnEdge = false
let root: HTMLDivElement | null = null
let wheel: HTMLDivElement | null = null
let rotor: HTMLDivElement | null = null
let gas: HTMLButtonElement | null = null
let brake: HTMLButtonElement | null = null
let styleEl: HTMLStyleElement | null = null
let hostParent: HTMLElement | null = null
let observer: MutationObserver | null = null
let abort: AbortController | null = null

function poll(): DeviceSample {
  roleBuffer.length = 0
  for (const hold of holds.values()) roleBuffer.push(hold.role)
  const sample = sampleFromHolds(roleBuffer, steerCommand, respawnEdge)
  respawnEdge = false
  return sample
}

function mount(parent: HTMLElement): void {
  if (typeof document === 'undefined') return
  unmount()
  abort = new AbortController()
  const { signal } = abort
  hostParent = parent
  styleEl = ensureStyle()
  const dom = buildDom()
  root = dom.root
  wheel = dom.wheel
  rotor = dom.rotor
  gas = dom.gas
  brake = dom.brake

  dom.wheel.addEventListener('pointerdown', onSteerDown, { signal, passive: false })
  dom.gas.addEventListener('pointerdown', (event) => beginPedal(event, 'throttle', gas), {
    signal,
    passive: false,
  })
  dom.brake.addEventListener('pointerdown', (event) => beginPedal(event, 'brake', brake), {
    signal,
    passive: false,
  })
  dom.respawn.addEventListener('pointerdown', onRespawnDown, { signal, passive: false })
  dom.respawn.addEventListener('keydown', onRespawnKey, { signal })
  dom.root.addEventListener('contextmenu', (event) => event.preventDefault(), { signal })
  window.addEventListener('pointermove', onPointerMove, { signal, passive: false })
  window.addEventListener('pointerup', onPointerUp, { signal })
  window.addEventListener('pointercancel', onPointerUp, { signal })
  window.addEventListener('blur', releaseAll, { signal })
  document.addEventListener('visibilitychange', onVisibility, { signal })
  window.matchMedia('(pointer: coarse)').addEventListener('change', syncVisibility, { signal })

  const host = parent.parentElement ?? parent
  host.append(dom.root)
  observer = new MutationObserver(syncVisibility)
  observer.observe(parent, { childList: true })
  syncVisibility()
}

function unmount(): void {
  abort?.abort()
  abort = null
  observer?.disconnect()
  observer = null
  releaseAll()
  root?.remove()
  root = null
  wheel = null
  rotor = null
  gas = null
  brake = null
  styleEl?.remove()
  styleEl = null
  hostParent = null
  holds.clear()
  steerCommand = 0
  steerLatched = false
  respawnEdge = false
}

function onSteerDown(event: PointerEvent): void {
  if (!allowPointer(event) || root?.hidden || hasRole('steer') || !wheel) return
  if (event.cancelable) event.preventDefault()
  holds.set(event.pointerId, { role: 'steer', originX: event.clientX })
  steerCommand = 0
  steerLatched = false
  wheel.classList.add('is-held')
  paintSteer(0)
  capture(wheel, event.pointerId)
}

function beginPedal(
  event: PointerEvent,
  role: 'throttle' | 'brake',
  button: HTMLButtonElement | null,
): void {
  if (!allowPointer(event) || root?.hidden || !button || hasRole(role)) return
  if (event.cancelable) event.preventDefault()
  holds.set(event.pointerId, { role, originX: event.clientX })
  button.dataset.pressed = 'true'
  button.setAttribute('aria-pressed', 'true')
  vibrate(12, event.isTrusted)
  capture(button, event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  const hold = holds.get(event.pointerId)
  if (!hold || hold.role !== 'steer') return
  if (event.cancelable) event.preventDefault()
  paintSteer(event.clientX - hold.originX, event.isTrusted)
}

function onPointerUp(event: PointerEvent): void {
  const hold = holds.get(event.pointerId)
  if (!hold) return
  holds.delete(event.pointerId)
  if (hold.role === 'steer') {
    steerCommand = 0
    steerLatched = false
    wheel?.classList.remove('is-held')
    paintSteer(0)
    return
  }
  const button = hold.role === 'throttle' ? gas : brake
  if (!button) return
  delete button.dataset.pressed
  button.setAttribute('aria-pressed', 'false')
}

function onRespawnDown(event: PointerEvent): void {
  if (!allowPointer(event) || root?.hidden) return
  if (event.cancelable) event.preventDefault()
  respawnEdge = true
}

function onRespawnKey(event: KeyboardEvent): void {
  if (root?.hidden || event.repeat) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  respawnEdge = true
}

function onVisibility(): void {
  if (document.visibilityState !== 'visible') releaseAll()
}

function paintSteer(dx: number, trusted = false): void {
  const linear = clamp(dx / STEER_TRAVEL_PX, -1, 1)
  const shaped = steerFromOffset(dx, STEER_TRAVEL_PX)
  steerCommand = shaped
  if (rotor) rotor.style.transform = `rotate(${(linear * 76).toFixed(2)}deg)`
  if (wheel) {
    wheel.setAttribute('aria-valuenow', shaped.toFixed(2))
    wheel.setAttribute('aria-valuetext', steerText(shaped))
  }
  const locked = Math.abs(linear) >= 0.995
  if (locked && !steerLatched) vibrate(6, trusted)
  steerLatched = locked
}

function steerText(value: number): string {
  const magnitude = Math.abs(value)
  if (magnitude < 0.04) return 'Al medio'
  const side = value > 0 ? 'la derecha' : 'la izquierda'
  if (magnitude >= 0.92) return `A fondo a ${side}`
  return `A ${side}`
}

function releaseAll(): void {
  holds.clear()
  steerCommand = 0
  steerLatched = false
  wheel?.classList.remove('is-held')
  if (rotor) rotor.style.transform = 'rotate(0deg)'
  wheel?.setAttribute('aria-valuenow', '0.00')
  wheel?.setAttribute('aria-valuetext', 'Al medio')
  releasePedal(gas)
  releasePedal(brake)
}

function releasePedal(button: HTMLButtonElement | null): void {
  if (!button) return
  delete button.dataset.pressed
  button.setAttribute('aria-pressed', 'false')
}

function syncVisibility(): void {
  if (!root || !hostParent) return
  const racing = hostParent.querySelector('.hud') !== null
  const show = racing && prefersTouch()
  if (!show) releaseAll()
  root.hidden = !show
}

function prefersTouch(): boolean {
  const override = touchOverride()
  if (override !== null) return override
  const touchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints
  if (touchPoints > 0) return true
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

function touchOverride(): boolean | null {
  if (typeof window === 'undefined') return null
  const value = new URLSearchParams(window.location.search).get('touch')
  if (value === null) return null
  if (value === '0' || value === 'off') return false
  return true
}

function allowPointer(event: PointerEvent): boolean {
  return event.pointerType !== 'mouse' || event.button === 0
}

function hasRole(role: Hold['role']): boolean {
  for (const hold of holds.values()) {
    if (hold.role === role) return true
  }
  return false
}

function capture(target: HTMLElement, pointerId: number): void {
  try {
    target.setPointerCapture(pointerId)
  } catch {
    // Synthetic events and a few mobile browsers refuse capture.
    // The window listeners still follow the finger.
  }
}

function vibrate(ms: number, trusted: boolean): void {
  if (!trusted || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function')
    return
  try {
    navigator.vibrate(ms)
  } catch {
    // Vibration is optional. A blocked call must not stop the car.
  }
}

function ensureStyle(): HTMLStyleElement {
  const existing = document.getElementById(STYLE_ID)
  if (existing instanceof HTMLStyleElement) return existing
  const node = document.createElement('style')
  node.id = STYLE_ID
  node.textContent = TOUCH_CSS
  document.head.append(node)
  return node
}

interface TouchDom {
  root: HTMLDivElement
  wheel: HTMLDivElement
  rotor: HTMLDivElement
  gas: HTMLButtonElement
  brake: HTMLButtonElement
  respawn: HTMLButtonElement
}

function buildDom(): TouchDom {
  const rootNode = document.createElement('div')
  rootNode.className = 'agp-touch'
  rootNode.hidden = true
  rootNode.setAttribute('role', 'group')
  rootNode.setAttribute('aria-label', 'Controles táctiles')

  const respawn = document.createElement('button')
  respawn.type = 'button'
  respawn.className = 'agp-respawn'
  respawn.textContent = 'Reaparecer'

  const wheelNode = document.createElement('div')
  wheelNode.className = 'agp-wheel'
  wheelNode.tabIndex = 0
  wheelNode.setAttribute('role', 'slider')
  wheelNode.setAttribute('aria-label', 'Doblar')
  wheelNode.setAttribute('aria-orientation', 'horizontal')
  wheelNode.setAttribute('aria-valuemin', '-1')
  wheelNode.setAttribute('aria-valuemax', '1')
  wheelNode.setAttribute('aria-valuenow', '0.00')
  wheelNode.setAttribute('aria-valuetext', 'Al medio')
  wheelNode.setAttribute('aria-describedby', 'agp-touch-steer-hint')

  const rotorNode = document.createElement('div')
  rotorNode.className = 'agp-wheel-rotor'
  wheelNode.append(rotorNode)

  const pedals = document.createElement('div')
  pedals.className = 'agp-pedals'
  const brakeNode = pedal('agp-brake', 'Frenar', 'agp-touch-brake-hint')
  const gasNode = pedal('agp-gas', 'Acelerar', 'agp-touch-gas-hint')
  pedals.append(brakeNode, gasNode)

  rootNode.append(
    respawn,
    wheelNode,
    pedals,
    hint('agp-touch-steer-hint', 'Deslizá a los costados para doblar.'),
    hint('agp-touch-gas-hint', 'Mantené apretado para acelerar.'),
    hint('agp-touch-brake-hint', 'Mantené apretado para frenar.'),
  )
  return {
    root: rootNode,
    wheel: wheelNode,
    rotor: rotorNode,
    gas: gasNode,
    brake: brakeNode,
    respawn,
  }
}

function pedal(className: string, label: string, describedBy: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.textContent = label
  button.setAttribute('aria-pressed', 'false')
  button.setAttribute('aria-describedby', describedBy)
  return button
}

function hint(id: string, text: string): HTMLSpanElement {
  const node = document.createElement('span')
  node.id = id
  node.className = 'agp-sr'
  node.textContent = text
  return node
}

const TOUCH_CSS = `
.agp-touch {
  --agp-wheel: 132px; /* steering disc | wheel and the respawn column */
  --agp-edge: 16px; /* screen inset | wheel, pedals, respawn */
  --agp-steer-gap: 10px; /* gap above the wheel | respawn */
  position: absolute;
  inset: 0;
  z-index: 40;
  pointer-events: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.agp-touch[hidden] {
  display: none !important;
}
.agp-pedals {
  position: absolute;
  right: max(var(--agp-edge), env(safe-area-inset-right));
  bottom: max(var(--agp-edge), env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  width: max-content;
  pointer-events: none;
}
.agp-wheel,
.agp-gas,
.agp-brake,
.agp-respawn {
  pointer-events: auto;
  touch-action: none;
  cursor: pointer;
}
.agp-gas,
.agp-brake,
.agp-respawn {
  margin: 0;
  appearance: none;
  font: inherit;
  transition: transform var(--dur-instant) var(--ease-out);
}
.agp-wheel {
  position: absolute;
  left: max(var(--agp-edge), env(safe-area-inset-left));
  bottom: max(var(--agp-edge), env(safe-area-inset-bottom));
  width: var(--agp-wheel);
  height: var(--agp-wheel);
  border-radius: var(--radius-control);
  background: color-mix(in srgb, var(--surface) 84%, transparent);
  box-shadow:
    inset 0 0 0 1px var(--line-strong),
    0 14px 30px rgb(var(--shadow-ink) / 0.45);
}
.agp-wheel:focus,
.agp-gas:focus,
.agp-brake:focus,
.agp-respawn:focus {
  outline: none;
}
.agp-wheel:focus-visible,
.agp-gas:focus-visible,
.agp-brake:focus-visible,
.agp-respawn:focus-visible {
  outline: var(--line-focus) solid var(--ring);
  outline-offset: var(--focus-offset);
}
.agp-wheel-rotor {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% 16px, var(--accent) 0 5px, transparent 5.5px),
    linear-gradient(var(--accent), var(--accent)) 50% 20px / 6px 26px no-repeat;
  transition: transform 160ms var(--ease-out);
}
.agp-wheel-rotor::after {
  content: '';
  position: absolute;
  inset: 31%;
  border-radius: inherit;
  background: var(--surface-3);
  box-shadow: inset 0 0 0 1px var(--line);
}
.agp-wheel.is-held .agp-wheel-rotor {
  transition: none;
}
.agp-gas,
.agp-brake {
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-control);
  padding: 0;
  line-height: var(--leading-snug);
  white-space: nowrap;
}
.agp-gas {
  width: 104px;
  height: 104px;
  background: linear-gradient(180deg, var(--glow-accent-from), var(--glow-accent-to));
  color: var(--glow-accent-fg);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  box-shadow: 0 12px 24px rgb(var(--shadow-ink) / 0.4);
}
.agp-gas[data-pressed='true'] {
  background: linear-gradient(180deg, var(--glow-accent-from-lit), var(--glow-accent-to-lit));
  transform: scale(var(--scale-press));
}
.agp-brake {
  width: 80px;
  height: 80px;
  margin-right: 28px;
  background:
    linear-gradient(var(--warn), var(--warn)) 50% 14px / 28px 4px no-repeat,
    color-mix(in srgb, var(--surface-2) 92%, transparent);
  color: var(--fg);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  box-shadow:
    inset 0 0 0 1px var(--line-strong),
    0 10px 20px rgb(var(--shadow-ink) / 0.35);
}
.agp-brake[data-pressed='true'] {
  background: var(--warn);
  color: var(--on-accent);
  transform: scale(var(--scale-press));
}
.agp-respawn {
  position: absolute;
  left: max(var(--agp-edge), env(safe-area-inset-left));
  bottom: calc(
    var(--agp-edge) + var(--agp-wheel) + var(--agp-steer-gap) + env(safe-area-inset-bottom)
  );
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--agp-wheel);
  min-height: var(--control-md);
  padding: 0 14px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-control);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--fg);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  box-shadow: 0 8px 18px rgb(var(--shadow-ink) / 0.35);
}
.agp-respawn:active {
  transform: scale(var(--scale-press));
}
.agp-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-height: 460px) {
  .agp-touch {
    --agp-wheel: 112px;
    --agp-steer-gap: 8px;
  }
  .agp-gas {
    width: 92px;
    height: 92px;
  }
  .agp-brake {
    width: 72px;
    height: 72px;
    margin-right: 18px;
  }
  .agp-pedals {
    gap: 8px;
  }
  .agp-respawn {
    top: 72px;
    bottom: auto;
    min-width: 0;
  }
}
@media (max-width: 360px) {
  .agp-touch {
    --agp-wheel: 112px;
  }
  .agp-gas {
    width: 92px;
    height: 92px;
  }
  .agp-brake {
    width: 72px;
    height: 72px;
    margin-right: 14px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .agp-wheel-rotor,
  .agp-gas,
  .agp-brake,
  .agp-respawn {
    transition: none;
  }
}
`
