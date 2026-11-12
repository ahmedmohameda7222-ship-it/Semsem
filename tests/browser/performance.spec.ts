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

test('simulated slow mobile bandwidth still reaches an interactive profile picker', async ({ page }) => {
  test.setTimeout(40000)
  await page.setViewportSize({ width: 375, height: 812 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 320,
    downloadThroughput: 160_000, // bytes/s, approximately 1.3 Mbps
    uploadThroughput: 50_000,
  })
  const start = Date.now()
  await page.goto('/welcome', { waitUntil: 'domcontentloaded', timeout: 25000 })
  await expect(page.getByRole('button', { name: 'Enter Our World' })).toBeVisible({ timeout: 16000 })
  const interactiveMs = Date.now() - start
  const clickAt = Date.now()
  await page.getByRole('button', { name: 'Enter Our World' }).click()
  await expect(page.getByRole('heading', { name: "Who's here, love?" })).toBeVisible()
  const interactionMs = Date.now() - clickAt
  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return entry ? { domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd), bytes: entry.transferSize } : null
  })
  console.log(JSON.stringify({
    scenario: 'simulated slow mobile network, NOT an Egypt measurement',
    interactiveMs,
    interactionMs,
    navigation,
  }))
  expect(interactiveMs).toBeLessThan(16000)
  expect(interactionMs).toBeLessThan(2200)
  await cdp.detach()
})
