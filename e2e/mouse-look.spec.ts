import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })

test('pointer lock orbits the chase camera and escape still pauses', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await page.waitForFunction(() => window.__AGP?.ready === true)
  await page.getByRole('button', { name: 'Arrancá a correr' }).click()
  await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible()

  await page.locator('#view').click({ position: { x: 960, y: 540 } })
  await page.waitForFunction(() => document.pointerLockElement?.id === 'view')

  await page.evaluate(() => {
    document.dispatchEvent(
      new MouseEvent('mousemove', { movementX: 220, movementY: -30, bubbles: true }),
    )
  })
  await page.waitForFunction(() => (window.__AGP_LOOK?.targetYaw ?? 0) > 0.4)
  await page.waitForFunction(() => (window.__AGP_LOOK?.targetPitch ?? 0) > 0.05)
  await page.waitForFunction(() => (window.__AGP_LOOK?.yaw ?? 0) > 0.05)

  await page.keyboard.down('KeyW')
  await page.keyboard.down('KeyD')
  await page.waitForFunction(() => (window.__AGP?.playerSpeed ?? 0) > 4, undefined, {
    timeout: 8_000,
  })
  await page.keyboard.up('KeyD')
  await page.keyboard.up('KeyW')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Pausa' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull()

  await page.waitForTimeout(450)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

test('look sensitivity stays in the settings screen', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__AGP?.ready === true)
  await page.getByRole('button', { name: 'Ajustes' }).click()
  const slider = page.getByRole('slider', { name: 'Sensibilidad del mouse' })
  await expect(slider).toBeVisible()
  await expect(page.getByText('1.0×')).toBeVisible()
  await expect(page.getByText('Hacé clic en la pista para mirar alrededor del auto.')).toBeVisible()
  await slider.focus()
  await slider.press('End')
  await expect(page.getByText('1.8×')).toBeVisible()

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('agp-preferences')
    return raw ? (JSON.parse(raw) as { lookSensitivity?: number }) : null
  })
  expect(stored?.lookSensitivity).toBeCloseTo(1.8)

  await page.reload()
  await page.waitForFunction(() => window.__AGP?.ready === true)
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByText('1.8×')).toBeVisible()
})
