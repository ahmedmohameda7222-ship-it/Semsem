import { expect, test } from '@playwright/test'

for (const width of [320, 375, 390, 430]) {
  test(
    'welcome and profile picker fit ' + width + ' CSS pixels',
    async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await expect(
        page.getByRole('heading', { name: 'Our Space.' }),
      ).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBe(width)
      if (width === 390)
        await page.screenshot({ path: info.outputPath('welcome.png') })
      await page.getByRole('button', { name: 'Enter Our World' }).click()
      await expect(
        page.getByRole('heading', { name: "Who's here, love?" }),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: /Semsem/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /Sasa/ })).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBe(width)
      if (width === 390)
        await page.screenshot({ path: info.outputPath('profiles.png') })
    },
  )
}

test('private routes send a signed-out visitor to welcome', async ({
  page,
}) => {
  await page.goto('/chat?entry=8dd72ecf-1d1d-4dbc-89b5-06b7c7b3c1ab')
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }),
  ).toHaveCount(0)
})

test('serves install manifest and icon', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest')
  expect(response.ok()).toBeTruthy()
  const manifest = await response.json()
  expect(manifest).toMatchObject({
    name: 'Our Space',
    start_url: '/',
    display: 'standalone',
  })
  for (const icon of manifest.icons) {
    const asset = await request.get(icon.src)
    expect(asset.headers()['content-type']).toContain('image/png')
  }
})

test('production service worker controls the shell and reopens offline', async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.TEST_BASE_URL,
    'Requires a configured production build',
  )
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Enter Our World' }),
  ).toBeVisible()
})
