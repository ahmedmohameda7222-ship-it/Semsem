import { expect, test } from '@playwright/test'

const first = '8dd72ecf-1d1d-4dbc-89b5-06b7c7b3c1ab'
const second = '18fddbe3-93d2-4e7b-8f42-2d9636b29c0a'
const profiles = [
  {
    id: first,
    stable_key: 'sasa',
    real_name: 'Ahmed',
    nickname: 'Sasa',
    role: 'Husband',
    dob: '2000-01-01',
    theme: 'cherry',
    avatar_path: null,
  },
  {
    id: second,
    stable_key: 'semsem',
    real_name: 'Sama',
    nickname: 'Semsem',
    role: 'Wife',
    dob: '2000-01-01',
    theme: 'scarlet',
    avatar_path: null,
  },
]

test.beforeEach(async ({ page }) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    'Isolated local component fixtures',
  )
  const expires = 4102444800
  const token =
    'eyJhbGciOiJIUzI1NiJ9.' +
    Buffer.from(JSON.stringify({ exp: expires, sub: first })).toString(
      'base64url',
    ) +
    '.fixture'
  await page.addInitScript(
    ({ token, expires, first }) => {
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: token,
          expires_at: expires,
          refresh_token: 'fixture',
          user: { id: first },
        }),
      )
    },
    { token, expires, first },
  )
  let theme = 'cherry'
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    if (table === 'profiles') {
      if (route.request().method() === 'PATCH') {
        theme = route.request().postDataJSON().theme
        return route.fulfill({ json: { id: first } })
      }
      return route.fulfill({ json: [{ ...profiles[0], theme }, profiles[1]] })
    }
    if (table === 'important_dates')
      return route.fulfill({
        json: [
          {
            id: 'first',
            slug: 'first',
            title: 'Our First Kiss',
            original_date: '2025-02-26',
            annual: true,
            celebration: 'kisses',
          },
          {
            id: 'anniversary',
            slug: 'anniversary',
            title: 'Our Anniversary',
            original_date: '2024-12-05',
            annual: true,
            celebration: 'anniversary',
          },
          {
            id: 'wedding',
            slug: 'wedding',
            title: 'Our Wedding',
            original_date: null,
            annual: true,
            reserved: true,
            celebration: 'none',
          },
        ],
      })
    if (table === 'attention_buttons')
      return route.fulfill({
        json: [
          {
            id: 'button-one',
            title: 'I need a hug',
            icon: 'HeartHandshake',
            tint: '#BA314F',
            message: 'Can I have a hug?',
          },
        ],
      })
    if (table === 'chat_entries' && route.request().method() !== 'HEAD')
      return route.fulfill({
        json: [
          {
            id: 'request-one',
            sender_id: second,
            recipient_id: first,
            title: 'I need a hug',
            body: 'Can I have a hug?',
            icon: 'HeartHandshake',
            created_at: '2026-01-02T10:00:00Z',
            read_at: '2026-01-02T10:01:00Z',
          },
        ],
      })
    return route.fulfill({ json: [] })
  })
})

test('signed-in screens, themes, search and future child form', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Sasa/ })).toBeVisible()
  await page.screenshot({ path: info.outputPath('home.png') })
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(nav.getByRole('button')).toHaveCount(4)
  await nav.getByRole('button', { name: 'Chat' }).click()
  await expect(page.getByText('I need a hug')).toBeVisible()
  await expect(page.getByText('Seen', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('chat.png') })
  await nav.getByRole('button', { name: 'Our Dates' }).click()
  await expect(page.getByText('Our First Kiss', { exact: true })).toBeVisible()
  await expect(page.getByText('Date not set yet · Tap to add')).toBeVisible()
  await page.screenshot({ path: info.outputPath('dates.png') })
  await nav.getByRole('button', { name: 'Our World' }).click()
  await page.getByRole('button', { name: /Our Family Tree/ }).click()
  await expect(page.getByRole('heading', { name: 'Ahmed' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sama' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('family.png') })
  await page.getByRole('button', { name: 'Add a Child' }).click()
  await expect(page.getByLabel('Status')).toHaveValue('not_born_yet')
  await expect(page.getByLabel('Birth date')).toHaveCount(0)
  await page.getByLabel('Status').selectOption('born')
  await expect(page.getByLabel('Birth date')).toHaveAttribute('required', '')
  await page.goto('/settings/appearance')
  await expect(page.locator('.palette')).toHaveCount(6)
  await page.getByRole('button', { name: /Midnight Romance/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  await page.screenshot({ path: info.outputPath('themes.png') })
  await page.goto('/buttons/new')
  await expect(page.getByRole('heading', { name: 'Create a Love Button' })).toBeVisible()
  await expect(
    page.locator('.icon-grid button').count(),
  ).resolves.toBeGreaterThanOrEqual(36)
  await page.getByRole('searchbox').fill('lips')
  await expect(page.locator('.icon-grid button')).toHaveCount(1)
  await expect(page.locator('.icon-grid button')).toHaveAccessibleName(
    'Kiss lips',
  )
})

test('anniversary remains for 120 seconds without blocking navigation', async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date(2026, 11, 5, 12) })
  await page.goto('/dates')
  await expect(page.getByText('Happy Anniversary!')).toBeVisible()
  await page.screenshot({ path: info.outputPath('anniversary.png') })
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Home' })
    .click()
  await expect(page.getByText('Happy Anniversary!')).toBeVisible()
  await page.clock.fastForward(118000)
  await expect(page.getByText('Happy Anniversary!')).toBeVisible()
  await page.clock.fastForward(3000)
  await expect(page.getByText('Happy Anniversary!')).toHaveCount(0)
})
