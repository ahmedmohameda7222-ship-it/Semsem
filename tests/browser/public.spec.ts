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
      await expect(page.getByText('Every sweet request, every little memory', { exact: false })).toHaveCount(0)
      await expect(page.locator('.auth-foot')).toHaveText('Made just for Us ♡')
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

test('production API validates sign-in input and protects the worker', async ({
  request,
}) => {
  test.skip(!process.env.TEST_BASE_URL, 'Requires Vercel server functions')
  const auth = await request.post('/api/auth', {
    data: { profile: 'unknown', action: 'request' },
  })
  expect(auth.status()).toBe(400)
  expect(auth.headers()['cache-control']).toContain('no-store')
  const push = await request.post('/api/push', { data: { action: 'flush' } })
  expect(push.status()).toBe(401)
  const worker = await request.get('/api/push-cron')
  expect(worker.status()).toBe(401)
})

test('profile selection opens a password form without contacting the OTP broker', async ({
  page,
}) => {
  let requests = 0
  await page.route('**/api/auth', async (route) => {
    requests++
    const payload = route.request().postDataJSON()
    expect(payload).toEqual({
      profile: 'sasa',
      action: 'password',
      password: ' test-only value ',
    })
    await route.fulfill({
      status: 401,
      json: { error: 'The password is incorrect for this profile.' },
    })
  })
  await page.goto('/choose-profile')
  await page.getByRole('button', { name: /Sasa/ }).click()
  const password = page.getByLabel('Password', { exact: true })
  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveAttribute('autocomplete', 'current-password')
  expect(requests).toBe(0)
  await password.fill(' test-only value ')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'The password is incorrect for this profile.',
  )
  await expect(password).toHaveValue('')
  expect(requests).toBe(1)
})
