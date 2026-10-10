import { expect, test } from '@playwright/test'
import { PERF_FAIL_FRAME_MS, PERF_FAIL_SIM_MS } from '../src/core/budget.ts'

test('frame time stays inside the headless budget', async ({ page }) => {
  await page.goto('/?autodrive=1&fps=1')
  await page.getByRole('button', { name: 'Arrancá a correr' }).click()
  await page.waitForFunction(() => (window.__AGP?.frameCount ?? 0) > 150)
  const sample = await page.evaluate(() => window.__AGP)
  expect(sample?.avgSimMs ?? 999).toBeLessThan(PERF_FAIL_SIM_MS)
  expect(sample?.avgFrameMs ?? 999).toBeLessThan(PERF_FAIL_FRAME_MS)
})
