import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScreenContext } from '../../src/ui/types.ts'

interface CatalogTrack {
  id: string
  name: string
  description: string
  laps: number
}

const data = vi.hoisted(() => ({
  tracks: [] as CatalogTrack[],
  cars: [] as { id: string; name: string }[],
  personalities: [] as { id: string; name: string }[],
}))

vi.mock('../../src/tracks/registry.ts', () => ({
  listTracks: () => data.tracks,
}))

vi.mock('../../src/cars/registry.ts', () => ({
  listCars: () => data.cars,
}))

vi.mock('../../src/ai/registry.ts', () => ({
  listPersonalities: () => data.personalities,
}))

const { canStartRace, circuitBlurb, lapsPhrase, lineupText, screen } =
  await import('../../src/ui/screens/menu.ts')

class FakeNode {
  readonly tag: string
  className = ''
  id = ''
  textContent = ''
  type = ''
  name = ''
  value = ''
  checked = false
  disabled = false
  parent: FakeNode | null = null
  readonly children: FakeNode[] = []
  readonly attrs = new Map<string, string>()
  readonly listeners = new Map<string, Array<() => void>>()

  constructor(tag: string) {
    this.tag = tag
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value)
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }

  addEventListener(type: string, fn: () => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(fn)
    this.listeners.set(type, list)
  }

  append(...nodes: FakeNode[]): void {
    for (const node of nodes) {
      node.remove()
      node.parent = this
      this.children.push(node)
    }
  }

  remove(): void {
    const parent = this.parent
    if (!parent) return
    const index = parent.children.indexOf(this)
    if (index >= 0) parent.children.splice(index, 1)
    this.parent = null
  }
}

function installDocument(): void {
  Object.assign(globalThis, {
    document: {
      createElement: (tag: string) => new FakeNode(tag),
    },
  })
}

function walk(node: FakeNode): FakeNode[] {
  return [node, ...node.children.flatMap((child) => walk(child))]
}

function fire(node: FakeNode, type: string): void {
  for (const fn of node.listeners.get(type) ?? []) fn()
}

function context(overrides: Partial<ScreenContext> = {}): ScreenContext & {
  state: { carId: string; trackId: string; personalityId: string }
} {
  const state = { carId: 'flash-7b', trackId: 'gradiente', personalityId: 'cauto' }
  const updateState = vi.fn((partial: Partial<typeof state>) => {
    Object.assign(state, partial)
  })
  return {
    state,
    go: vi.fn(),
    startRace: vi.fn(),
    quit: vi.fn(),
    links: [{ id: 'garage', label: 'Ver el garaje', variant: 'solid', order: 1 }],
    getState: () => ({ ...state }),
    updateState,
    play: vi.fn(),
    resumeAudio: vi.fn(),
    ...overrides,
  }
}

describe('menu copy', () => {
  it('counts laps in rioplatense without a dash', () => {
    expect(lapsPhrase(1)).toBe('1 vuelta')
    expect(lapsPhrase(2)).toBe('2 vueltas')
    expect(lapsPhrase(2)).not.toMatch(/[—–]/u)
  })

  it('describes the only circuit and the lineup the button will start', () => {
    expect(
      circuitBlurb({
        name: 'Autódromo de Potrerillos',
        description: 'Recta larga, una chicana que se puede cortar y dos horquillas.',
      }),
    ).toBe(
      'Hoy se corre en Autódromo de Potrerillos. Recta larga, una chicana que se puede cortar y dos horquillas.',
    )
    expect(
      lineupText({
        carName: 'Flash 7B',
        personalityName: 'Cauto',
        trackName: 'Autódromo de Potrerillos',
        laps: 2,
      }),
    ).toBe('Hoy corrés con Flash 7B. El rival maneja al estilo Cauto. Se corren 2 vueltas.')
    expect(
      lineupText({
        carName: 'Flash 7B',
        personalityName: 'Cauto',
        trackName: 'Óvalo',
        laps: 1,
        repeatTrack: true,
      }),
    ).toContain('Se corre 1 vuelta en el circuito Óvalo.')
  })

  it('refuses to start when the car, the rival or the circuit is missing', () => {
    expect(lineupText({})).toBe('No hay un auto cargado. Sin auto no se puede largar.')
    expect(lineupText({ carName: 'Flash 7B' })).toContain('Todavía no hay un rival cargado.')
    expect(lineupText({ carName: 'Flash 7B', personalityName: 'Cauto' })).toContain(
      'No hay circuito cargado',
    )
    expect(canStartRace({ carName: 'Flash 7B', personalityName: 'Cauto', laps: 2 })).toBe(false)
    expect(
      canStartRace({
        carName: 'Flash 7B',
        personalityName: 'Cauto',
        trackName: 'Autódromo de Potrerillos',
        laps: 2,
      }),
    ).toBe(true)
    expect(circuitBlurb(undefined)).toBe('No hay circuito cargado.')
  })
})

describe('menu screen', () => {
  beforeEach(() => {
    installDocument()
    data.tracks = [
      {
        id: 'gradiente',
        name: 'Autódromo de Potrerillos',
        description: 'Recta larga y dos horquillas.',
        laps: 2,
      },
    ]
    data.cars = [{ id: 'flash-7b', name: 'Flash 7B' }]
    data.personalities = [{ id: 'cauto', name: 'Cauto' }]
  })

  it('keeps Arrancá a correr as the only primary action', () => {
    const ctx = context()
    const root = new FakeNode('div')
    screen.mount(root as unknown as HTMLElement, ctx)
    const nodes = walk(root)
    const text = nodes.map((node) => node.textContent).join('\n')
    const primary = nodes.filter((node) => node.className.split(' ').includes('btn-primary'))
    expect(primary).toHaveLength(1)
    expect(primary[0]?.textContent).toBe('Arrancá a correr')
    expect(primary[0]?.disabled).toBe(false)
    expect(text).toContain('Hoy corrés con Flash 7B.')
    expect(text).toContain('Se corren 2 vueltas.')
    expect(text).not.toContain('en el circuito')
    expect(text).toContain('Hoy se corre en Autódromo de Potrerillos.')
    expect(text).not.toMatch(/[—–]|[\u{1F300}-\u{1FAFF}]/u)
    expect(nodes.some((node) => node.tag === 'input')).toBe(false)
    expect(ctx.updateState).not.toHaveBeenCalled()

    fire(primary[0]!, 'click')
    expect(ctx.resumeAudio).toHaveBeenCalledOnce()
    expect(ctx.play).toHaveBeenCalledWith('click')
    expect(ctx.startRace).toHaveBeenCalledOnce()
  })

  it('lists every circuit, selects a stale id back to the registry, and updates the briefing', () => {
    data.tracks = [
      {
        id: 'gradiente',
        name: 'Autódromo de Potrerillos',
        description: 'Recta larga.',
        laps: 2,
      },
      {
        id: 'costanera',
        name: 'Costanera',
        description: 'Un giro corto al lado del río.',
        laps: 3,
      },
    ]
    const ctx = context()
    ctx.state.trackId = 'ausente'
    const root = new FakeNode('div')
    const mounted = screen.mount(root as unknown as HTMLElement, ctx)
    const nodes = walk(root)
    const radios = nodes.filter((node) => node.tag === 'input' && node.type === 'radio')
    expect(radios.map((radio) => radio.value)).toEqual(['gradiente', 'costanera'])
    expect(radios[0]?.checked).toBe(true)
    expect(ctx.updateState).toHaveBeenCalledWith({ trackId: 'gradiente' })
    expect(nodes.map((node) => node.textContent).join('\n')).toContain(
      'Se corren 2 vueltas en el circuito Autódromo de Potrerillos.',
    )
    const field = nodes.find((node) => node.tag === 'fieldset')
    expect(field?.getAttribute('aria-labelledby')).toBe('menu-circuit-title')

    radios[1]!.checked = true
    fire(radios[1]!, 'change')
    expect(ctx.state.trackId).toBe('costanera')
    expect(nodes.map((node) => node.textContent).join('\n')).toContain(
      'Se corren 3 vueltas en el circuito Costanera.',
    )
    expect(nodes.some((node) => node.textContent === 'Un giro corto al lado del río.')).toBe(true)

    mounted.unmount()
    expect(root.children).toHaveLength(0)
  })

  it('does not start when nothing is loaded and still offers the other menu links', () => {
    data.tracks = []
    data.cars = []
    data.personalities = []
    const ctx = context({
      links: [
        { id: 'garage', label: 'Ver el garaje', variant: 'solid', order: 1 },
        { id: 'settings', label: 'Ajustes', variant: 'ghost', order: 2 },
      ],
    })
    const root = new FakeNode('div')
    screen.mount(root as unknown as HTMLElement, ctx)
    const nodes = walk(root)
    const buttons = nodes.filter((node) => node.tag === 'button')
    expect(buttons.map((node) => node.textContent)).toEqual([
      'Arrancá a correr',
      'Ver el garaje',
      'Ajustes',
    ])
    expect(buttons[0]?.disabled).toBe(true)
    expect(buttons[1]?.className).toContain('btn-solid')
    expect(buttons[2]?.className).toContain('btn-ghost')
    fire(buttons[0]!, 'click')
    expect(ctx.startRace).not.toHaveBeenCalled()
    fire(buttons[2]!, 'click')
    expect(ctx.play).toHaveBeenCalledWith('click')
    expect(ctx.go).toHaveBeenCalledWith('settings')
    expect(nodes.map((node) => node.textContent).join('\n')).toContain('No hay circuito cargado.')
  })
})

describe('menu stylesheet', () => {
  const css = readFileSync(new URL('../../src/ui/menu.css', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../../src/ui/screens/menu.ts', import.meta.url), 'utf8')

  it('is imported by the screen and stays scoped to the landing', () => {
    expect(source).toContain("import '../menu.css'")
    expect(source).not.toMatch(/from ['"]three['"]/)
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const body = withoutComments.replace(/@[^{]+\{/g, '')
    const selectors = body
      .split('}')
      .flatMap((chunk) => (chunk.split('{')[0] ?? '').split(','))
      .map((selector) => selector.trim())
      .filter((selector) => selector.length > 0)
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(selector.startsWith('.menu'), selector).toBe(true)
    }
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/outline\s*:\s*none/)
    expect(css).not.toMatch(/font-weight\s*:\s*[0-9]/)
    expect(css).not.toMatch(/[—–]|[\u{1F300}-\u{1FAFF}]/u)
  })
})
