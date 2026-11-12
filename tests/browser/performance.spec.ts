import { expect, test } from '@playwright/test'

// Artificial latency is applied to static assets. The measurements run from
// GitHub's CI location, not from Egypt, and are NOT Egypt network benchmarks.
test('mobile home remains usable with simulated high-latency static assets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/assets/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 650))
    await route.continue()
  })
  const begin = Date.now()
  await page.goto('/welcome', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Enter Our World' })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Enter Our World' }).click()
  await expect(page.getByRole('heading', { name: "Who's here, love?" })).toBeVisible()
  const elapsed = Date.now() - begin
  console.log('Simulated static-asset latency 650 ms: time-to-profile-picker =', elapsed, 'ms')
  expect(elapsed).toBeLessThan(10000)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})
