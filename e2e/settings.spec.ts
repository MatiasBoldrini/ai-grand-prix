import { expect, test, type Page } from '@playwright/test'

test.use({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
})

test('volume, music and image quality persist and resize the view', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await page.waitForFunction(() => window.__AGP?.ready === true)
  await expect(page.getByRole('heading', { name: 'AI Grand Prix' })).toBeVisible()
  expect(await pixelRatio(page)).toBeCloseTo(1.25, 2)

  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
  await expect(page.locator('.btn-primary')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Listo' })).toHaveClass(/btn-primary/)
  await expect(page.getByRole('radio', { name: 'Balanceada' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Música de fondo' })).toBeChecked()
  await expect(page.getByText('80%')).toBeVisible()

  const panel = await page.locator('main.panel').boundingBox()
  expect(panel).not.toBeNull()
  expect(panel?.width ?? 0).toBeLessThanOrEqual(520)
  expect(panel?.x ?? 999).toBeLessThan(80)

  const slider = page.getByRole('slider', { name: 'Volumen' })
  await slider.focus()
  await slider.press('Home')
  for (let step = 0; step < 8; step += 1) await slider.press('ArrowRight')
  await expect(page.getByText('40%')).toBeVisible()

  await page.getByRole('checkbox', { name: 'Música de fondo' }).uncheck()
  await page.getByRole('radio', { name: 'Liviana' }).check()
  await expect(page.getByText('Elegila si la imagen se traba.')).toBeVisible()
  expect(await pixelRatio(page)).toBeCloseTo(1, 2)

  await page.getByRole('radio', { name: 'Nítida' }).check()
  expect(await pixelRatio(page)).toBeCloseTo(2, 2)
  await page.getByRole('radio', { name: 'Liviana' }).check()

  expect(await stored(page)).toEqual({
    masterVolume: 0.4,
    music: false,
    pixelRatioCap: 1,
  })

  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByRole('heading', { name: 'AI Grand Prix' })).toBeVisible()

  await page.reload()
  await page.waitForFunction(() => window.__AGP?.ready === true)
  expect(await pixelRatio(page)).toBeCloseTo(1, 2)
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByRole('radio', { name: 'Liviana' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Música de fondo' })).not.toBeChecked()
  await expect(page.getByText('40%')).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

  test('the settings sheet stays inside the screen', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__AGP?.ready === true)
    await page.getByRole('button', { name: 'Ajustes' }).click()
    const listo = page.getByRole('button', { name: 'Listo' })
    await listo.scrollIntoViewIfNeeded()
    await expect(listo).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(overflow).toBe(false)
    const panel = await page.locator('main.panel').boundingBox()
    expect(panel?.width ?? 999).toBeLessThanOrEqual(390)
    expect(panel?.x ?? -1).toBeGreaterThanOrEqual(0)
  })
})

async function pixelRatio(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('#view')
    if (!(canvas instanceof HTMLCanvasElement) || canvas.clientWidth === 0) return 0
    return canvas.width / canvas.clientWidth
  })
}

async function stored(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('agp-preferences')
    return raw ? (JSON.parse(raw) as unknown) : null
  })
}
