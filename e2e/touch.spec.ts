import { expect, test, type Locator, type Page } from '@playwright/test'

test('hides the on-screen pedals on a desktop pointer', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await expect(page.locator('.agp-touch')).toHaveCount(1)
  await expect(page.locator('.agp-touch')).toBeHidden()
  await page.getByRole('button', { name: 'Arrancá a correr' }).click()
  await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible()
  await expect(page.locator('.agp-touch')).toBeHidden()
  expect(errors, errors.join('\n')).toEqual([])
})

test.describe('phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  })

  test('keeps the keyboard in charge until a finger is down', async ({ page }) => {
    const errors = trackErrors(page)
    await startRace(page)
    await expect(page.locator('.agp-touch')).toBeHidden()
    await page.getByRole('button', { name: 'Arrancá a correr' }).click()
    await expect(page.getByRole('slider', { name: 'Doblar' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Acelerar' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Frenar' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reaparecer' })).toBeVisible()

    const wheel = page.getByRole('slider', { name: 'Doblar' })
    await dispatchPointer(wheel, 'pointerdown', 1)
    await dispatchPointer(wheel, 'pointermove', 1, 90)
    await expect(wheel).toHaveAttribute('aria-valuenow', '1.00')
    await expect(wheel).toHaveAttribute('aria-valuetext', 'A fondo a la derecha')
    await dispatchPointer(wheel, 'pointerup', 1)
    await expect(wheel).toHaveAttribute('aria-valuenow', '0.00')
    await expect(wheel).toHaveAttribute('aria-valuetext', 'Al medio')

    // Touch has priority 3. If it reported active with no finger, W would do nothing.
    await page.keyboard.down('KeyW')
    await page.waitForFunction(() => (window.__AGP?.playerSpeed ?? 0) > 8, undefined, {
      timeout: 12_000,
    })
    await page.keyboard.up('KeyW')

    const brake = page.getByRole('button', { name: 'Frenar' })
    await dispatchPointer(brake, 'pointerdown', 2)
    await expect(brake).toHaveAttribute('aria-pressed', 'true')
    await page.waitForFunction(() => (window.__AGP?.playerSpeed ?? 0) < 3, undefined, {
      timeout: 12_000,
    })
    await dispatchPointer(brake, 'pointerup', 2)
    await expect(brake).toHaveAttribute('aria-pressed', 'false')

    const gas = page.getByRole('button', { name: 'Acelerar' })
    await dispatchPointer(gas, 'pointerdown', 3)
    await expect(gas).toHaveAttribute('aria-pressed', 'true')
    await page.waitForFunction(() => (window.__AGP?.playerSpeed ?? 0) > 8, undefined, {
      timeout: 12_000,
    })
    await dispatchPointer(gas, 'pointerup', 3)
    await expect(gas).toHaveAttribute('aria-pressed', 'false')

    await page.keyboard.down('KeyS')
    await page.waitForFunction(() => (window.__AGP?.playerSpeed ?? 0) < 3, undefined, {
      timeout: 12_000,
    })
    await page.keyboard.up('KeyS')
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('fits the wheel and pedals around the pause button', async ({ page }) => {
    const errors = trackErrors(page)
    await startRace(page)
    await page.getByRole('button', { name: 'Arrancá a correr' }).click()
    await expect(page.getByRole('button', { name: 'Acelerar' })).toBeVisible()
    await expectFit(page)

    await page.setViewportSize({ width: 844, height: 390 })
    await expect(page.getByRole('button', { name: 'Acelerar' })).toBeVisible()
    await expectFit(page)

    await page.getByRole('button', { name: 'Pausa' }).click()
    await expect(page.getByRole('heading', { name: 'Pausa' })).toBeVisible()
    await expect(page.locator('.agp-touch')).toBeHidden()
    await page.getByRole('button', { name: 'Seguí corriendo' }).click()
    await expect(page.getByRole('button', { name: 'Acelerar' })).toBeVisible()
    await page.getByRole('button', { name: 'Reaparecer' }).click()
    expect(errors, errors.join('\n')).toEqual([])
  })
})

async function startRace(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'AI Grand Prix' })).toBeVisible()
}

function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function dispatchPointer(
  locator: Locator,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerId: number,
  dx = 0,
): Promise<void> {
  await locator.evaluate(
    (el, arg) => {
      const rect = el.getBoundingClientRect()
      el.dispatchEvent(
        new PointerEvent(arg.type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: rect.left + rect.width / 2 + arg.dx,
          clientY: rect.top + rect.height / 2,
          pointerId: arg.pointerId,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          buttons: arg.type === 'pointerup' ? 0 : 1,
        }),
      )
    },
    { type, pointerId, dx },
  )
}

async function expectFit(page: Page): Promise<void> {
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('missing viewport')
  const wheel = await box(page.getByRole('slider', { name: 'Doblar' }))
  const gas = await box(page.getByRole('button', { name: 'Acelerar' }))
  const brake = await box(page.getByRole('button', { name: 'Frenar' }))
  const respawn = await box(page.getByRole('button', { name: 'Reaparecer' }))
  const pause = await box(page.getByRole('button', { name: 'Pausa' }))
  const speed = await box(page.locator('.readout', { hasText: 'Velocidad' }))
  const time = await box(page.locator('.readout', { hasText: 'Tiempo' }))
  const context = await box(page.locator('.readout', { hasText: 'Contexto' }))
  const position = await box(page.locator('.readout', { hasText: 'Puesto' }))
  for (const item of [wheel, gas, brake, respawn, pause]) inside(item, viewport)
  for (const control of [wheel, gas, brake, respawn]) {
    expect(overlaps(control, pause)).toBe(false)
    expect(overlaps(control, speed)).toBe(false)
    expect(overlaps(control, time)).toBe(false)
    expect(overlaps(control, context)).toBe(false)
    expect(overlaps(control, position)).toBe(false)
  }
  expect(overlaps(wheel, gas)).toBe(false)
  expect(overlaps(wheel, brake)).toBe(false)
  expect(overlaps(respawn, wheel)).toBe(false)
  expect(brake.x + brake.width).toBeLessThanOrEqual(gas.x + gas.width + 1)
  expect(brake.y + brake.height).toBeLessThanOrEqual(gas.y + 1)
}

function inside(
  item: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
): void {
  expect(item.x).toBeGreaterThanOrEqual(-1)
  expect(item.y).toBeGreaterThanOrEqual(-1)
  expect(item.x + item.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(item.y + item.height).toBeLessThanOrEqual(viewport.height + 1)
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

async function box(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const value = await locator.boundingBox()
  expect(value).not.toBeNull()
  if (!value) throw new Error('missing box')
  return value
}
