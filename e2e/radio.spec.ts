import { expect, test, type Locator } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })

test('the race radio clears the ghost delta at 1920x1080', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Arrancá a correr' }).click()

  const ghost = page.locator('[data-ghost-delta]')
  const radio = page.locator('[data-widget="radio"]')
  await expect(ghost).toBeVisible()
  await expect(ghost).toContainText('Grabando')

  await page.keyboard.down('ArrowUp')
  await page.keyboard.down('ArrowLeft')
  await expect(radio).toBeVisible({ timeout: 12_000 })
  await expect(radio).toHaveText(
    /Tocaste el muro\. Enderezá y seguí\.|Otra vez el muro\. Abrí la línea\./,
  )

  const ghostBox = await boxOf(ghost)
  const radioBox = await boxOf(radio)
  expect(separated(ghostBox, radioBox)).toBe(true)
  expect(radioBox.y - (ghostBox.y + ghostBox.height)).toBeGreaterThanOrEqual(12)

  await page.keyboard.up('ArrowUp')
  await page.keyboard.up('ArrowLeft')
  expect(errors, errors.join('\n')).toEqual([])
})

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  if (!box) throw new Error('missing box')
  return box
}

function separated(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
  )
}
