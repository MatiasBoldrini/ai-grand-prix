import { beforeEach, describe, expect, it } from 'vitest'
import { conditionPercent, damageStatus, widget } from '../../src/ui/widgets/damage.ts'
import { listWidgets } from '../../src/ui/widget-registry.ts'
import type { RacerSnapshot, RaceSnapshot } from '../../src/race/types.ts'
import type { UiFrame } from '../../src/ui/types.ts'

class MiniNode {
  tagName: string
  className = ''
  children: MiniNode[] = []
  parentElement: MiniNode | null = null
  style: { width: string } = { width: '' }
  private text: string | null = null
  private attrs = new Map<string, string>()
  classList = {
    toggle: (token: string, force?: boolean): boolean => {
      const parts = new Set(this.className.split(/\s+/).filter(Boolean))
      const on = force ?? !parts.has(token)
      if (on) parts.add(token)
      else parts.delete(token)
      this.className = [...parts].join(' ')
      return on
    },
  }

  constructor(tagName: string) {
    this.tagName = tagName.toLowerCase()
  }

  set textContent(value: string | null) {
    this.text = value
    this.children = []
  }

  get textContent(): string {
    if (this.children.length > 0) return this.children.map((child) => child.textContent).join('')
    return this.text ?? ''
  }

  append(...nodes: MiniNode[]): void {
    for (const node of nodes) {
      node.remove()
      node.parentElement = this
      this.children.push(node)
    }
  }

  remove(): void {
    const parent = this.parentElement
    if (!parent) return
    parent.children = parent.children.filter((child) => child !== this)
    this.parentElement = null
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value)
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }

  querySelector(selector: string): MiniNode | null {
    for (const child of this.children) {
      if (matches(child, selector)) return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }
}

function matches(node: MiniNode, selector: string): boolean {
  if (selector.startsWith('.')) return node.className.split(/\s+/).includes(selector.slice(1))
  const attr = /^\[([^=]+)="([^"]*)"\]$/.exec(selector)
  if (attr?.[1] !== undefined) return node.getAttribute(attr[1]) === (attr[2] ?? '')
  const bare = /^\[([^\]=]+)\]$/.exec(selector)
  if (bare?.[1] !== undefined) return node.getAttribute(bare[1]) !== null
  return node.tagName === selector
}

function installDocument(): void {
  const created = {
    createElement(tag: string): HTMLElement {
      return new MiniNode(tag) as unknown as HTMLElement
    },
  }
  globalThis.document = created as unknown as Document
}

function frame(condition: number): UiFrame {
  const racer: RacerSnapshot = {
    id: 'player',
    carId: 'flash-7b',
    name: 'Vos',
    isPlayer: true,
    color: '#d6e41a',
    modelUrl: '/assets/models/raceCarRed.dae',
    x: 0,
    z: 0,
    yaw: 0,
    steer: 0,
    speed: 10,
    slip: 0,
    surface: 'asphalt',
    lap: 0,
    lapTimes: [],
    sectorTimes: [],
    gate: 1,
    energy: 40,
    energyCapacity: 40,
    condition,
    finished: false,
    finishTime: null,
    position: 1,
    odometer: 0,
  }
  const snapshot: RaceSnapshot = {
    trackId: 'gradiente',
    trackName: 'Autódromo de Potrerillos',
    laps: 2,
    time: 4,
    finished: false,
    racers: [racer],
    extras: [],
    events: [],
  }
  return { snapshot }
}

describe('damage widget', () => {
  beforeEach(() => {
    installDocument()
  })

  it('mounts from the widget registry', () => {
    expect(listWidgets().map((item) => item.id)).toContain('damage')
  })

  it('describes a healthy car, a hit and the limp floor', () => {
    expect(conditionPercent(1)).toBe(100)
    expect(conditionPercent(0.2)).toBe(20)
    expect(damageStatus(1, null)).toBe('Entero')
    expect(damageStatus(0.96, null)).toBe('Apenas un roce.')
    expect(damageStatus(0.86, null)).toBe('Quedó tocado. Empuja menos.')
    expect(damageStatus(0.2, null)).toBe('Quedó muy tocado. Ya casi no empuja.')
    expect(damageStatus(0.86, 14)).toBe('Perdiste 14%.')
    expect(damageStatus(0.2, 8)).toBe('Perdiste 8%. Ya casi no empuja.')
  })

  it('shows the loss after a hit and not on the first paint', () => {
    const parent = new MiniNode('div')
    const mounted = widget.mount(parent as unknown as HTMLElement)
    mounted.update?.(frame(0.96))
    const status = parent.querySelector('[data-damage-status]')
    const value = parent.querySelector('b')
    expect(value?.textContent).toBe('96%')
    expect(status?.textContent).toBe('Apenas un roce.')
    expect(parent.getAttribute('data-condition')).toBeNull()
    expect(parent.querySelector('[data-widget="damage"]')?.getAttribute('data-condition')).toBe(
      '96',
    )
    expect(parent.querySelector('.meter')?.className).not.toContain('low')

    let now = 1_000
    const clock = performance.now.bind(performance)
    performance.now = () => now
    try {
      mounted.update?.(frame(0.84))
      expect(value?.textContent).toBe('84%')
      expect(status?.textContent).toBe('Perdiste 12%.')
      expect(parent.querySelector('.meter')?.className).not.toContain('low')
      now = 1_000 + 2_000
      mounted.update?.(frame(0.84))
      expect(status?.textContent).toBe('Quedó tocado. Empuja menos.')
    } finally {
      performance.now = clock
    }

    const hurt = new MiniNode('div')
    const hurtMounted = widget.mount(hurt as unknown as HTMLElement)
    hurtMounted.update?.(frame(0.4))
    expect(hurt.querySelector('b')?.textContent).toBe('40%')
    expect(hurt.querySelector('.meter')?.className).toContain('low')
    hurtMounted.unmount()

    mounted.update?.({ snapshot: null })
    expect(value?.textContent).toBe('84%')
    mounted.unmount()
    expect(parent.children).toHaveLength(0)
  })
})
