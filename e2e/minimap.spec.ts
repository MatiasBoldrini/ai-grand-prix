import { expect, test, type Locator, type Page } from '@playwright/test'

test('the minimap shows the circuit during a race', async ({ page }) => {
  const errors = collectErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await startRace(page)
  const map = page.locator('[data-widget="minimap"]')
  await expect(map).toBeVisible()
  await expect(page.getByRole('img', { name: /El punto con la flecha sos vos/ })).toBeVisible()
  expect(await opaquePixels(map)).toBeGreaterThan(200)
  await expectClearOfHud(page, map, 1280, 800)
  const box = await map.boundingBox()
  expect(box?.width).toBeGreaterThan(140)
  expect(box?.width).toBeLessThan(170)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the minimap stays clear of the HUD on a phone', async ({ page }) => {
  const errors = collectErrors(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await startRace(page)
  const map = page.locator('[data-widget="minimap"]')
  await expect(map).toBeVisible()
  expect(await opaquePixels(map)).toBeGreaterThan(120)
  await expectClearOfHud(page, map, 390, 844)
  const box = await map.boundingBox()
  expect(box?.width).toBeGreaterThan(100)
  expect(box?.width).toBeLessThan(130)
  expect(errors, errors.join('\n')).toEqual([])
})

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function startRace(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Arrancá a correr' }).click()
  await page.waitForFunction(
    () => (window.__AGP?.screen ?? '') === 'hud' && (window.__AGP?.frameCount ?? 0) > 2,
  )
}

async function opaquePixels(map: Locator): Promise<number> {
  return map.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')
    if (!context || canvas.width < 2 || canvas.height < 2) return 0
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let opaque = 0
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] ?? 0) > 16) opaque += 1
    }
    return opaque
  })
}

async function expectClearOfHud(
  page: Page,
  map: Locator,
  width: number,
  height: number,
): Promise<void> {
  const pause = await page.getByRole('button', { name: 'Pausa' }).boundingBox()
  const speed = await page.getByText('Velocidad', { exact: true }).boundingBox()
  const box = await map.boundingBox()
  expect(pause).toBeTruthy()
  expect(speed).toBeTruthy()
  expect(box).toBeTruthy()
  if (!pause || !speed || !box) return
  expect(overlaps(pause, box)).toBe(false)
  expect(overlaps(speed, box)).toBe(false)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1)
  expect(box.x + box.width).toBeGreaterThan(width - 40)
  expect(box.y + box.height).toBeGreaterThan(height - 48)
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
