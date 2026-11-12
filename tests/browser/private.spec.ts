import { expect, test } from '@playwright/test'

const first = '8dd72ecf-1d1d-4dbc-89b5-06b7c7b3c1ab'
const second = '18fddbe3-93d2-4e7b-8f42-2d9636b29c0a'
const older = {
  id: 'b37aab52-4a08-4b53-8cee-228725d1ca2b',
  sender_id: second,
  recipient_id: first,
  title: 'An older message request',
  body: 'Remember our test evening 🫶',
  icon: 'Heart',
  created_at: '2025-09-10T10:00:00Z',
  read_at: '2025-09-10T10:01:00Z',
}
const current = {
  id: '8df03102-77e8-438a-a65c-7ae373e2a3b2',
  sender_id: second,
  recipient_id: first,
  title: 'I need a hug',
  body: 'Can I have a hug?',
  icon: 'HeartHandshake',
  created_at: '2026-01-02T10:00:00Z',
  read_at: '2026-01-02T10:01:00Z',
}
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

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
})

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
  let saved = false
  let reaction: string | undefined
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

    if (table === 'search_chat') {
      expect(route.request().postDataJSON().query_text).toBe('TEST')
      return route.fulfill({ json: [older] })
    }
    if (table === 'chat_favorites') {
      if (route.request().method() === 'POST') saved = true
      if (route.request().method() === 'DELETE') saved = false
      if (route.request().method() !== 'GET')
        return route.fulfill({ status: 204 })
      const selection = new URL(route.request().url()).searchParams.get(
        'select',
      )
      return route.fulfill({
        json: saved
          ? [
              selection?.startsWith('entry:')
                ? { entry: older }
                : { entry_id: older.id },
            ]
          : [],
      })
    }
    if (table === 'message_reactions') {
      const method = route.request().method()
      if (method === 'POST' || method === 'PATCH')
        reaction = route.request().postDataJSON().reaction
      if (method === 'DELETE') reaction = undefined
      if (method !== 'GET') return route.fulfill({ status: 204 })
      return route.fulfill({
        json: reaction
          ? [{ entry_id: older.id, user_id: first, reaction }]
          : [],
      })
    }
    if (table === 'chat_entries' && route.request().method() !== 'HEAD') {
      const params = new URL(route.request().url()).searchParams
      if (params.get('select') === 'created_at')
        return route.fulfill({ json: { created_at: older.created_at } })
      return route.fulfill({
        json: params.has('or')
          ? [older]
          : [
              current,
              {
                ...current,
                id: 'f5e46514-596c-497b-824c-1aa280482587',
                title: null,
                body: 'A little love for your day 🫶',
                created_at: '2026-01-02T09:58:00Z',
              },
            ],
      })
    }
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
  await expect(nav).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to Home' }).click()
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
  await expect(
    page.getByRole('heading', { name: 'Create a Love Button' }),
  ).toBeVisible()
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
  await page.setViewportSize({ width: 390, height: 844 })
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

test('search jumps to historical requests, favorites and reactions work', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 780 })
  await page.goto('/chat')
  await expect(page.getByText('I need a hug', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Responded', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Search chat' }).click()
  await page
    .getByRole('searchbox', { name: 'Search chat history' })
    .fill('TEST')
  await page.getByRole('button', { name: /An older message request/ }).click()
  await expect(page).toHaveURL(new RegExp(older.id))
  const card = page.locator('#entry-' + older.id)
  await expect(card).toHaveClass(/focused-entry/)
  await card.getByRole('button', { name: 'Save to favorites' }).click()
  await expect(
    card.getByRole('button', { name: 'Remove from favorites' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Favorites', exact: true }).click()
  await expect(
    page.getByRole('button', { name: /An older message request/ }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close message panel' }).click()
  await card.getByRole('button', { name: 'React to message' }).click()
  const picker = page.getByRole('dialog', { name: 'Choose a reaction' })
  await expect(picker.locator('.reaction-grid button')).toHaveCount(22)
  await page.screenshot({ path: info.outputPath('reaction-320.png') })
  await picker.getByRole('button', { name: '🫶', exact: true }).click()
  await expect(card.locator('.reaction-badge')).toHaveText('🫶')
  await card.getByRole('button', { name: 'React to message' }).click()
  await picker.getByRole('button', { name: '🫶', exact: true }).click()
  await expect(card.locator('.reaction-badge')).toHaveCount(0)
  await card.getByRole('button', { name: 'Remove from favorites' }).click()
  await expect(
    card.getByRole('button', { name: 'Save to favorites' }),
  ).toBeVisible()
})

const widths = [320, 375, 390, 430]
for (const [index, width] of widths.entries()) {
  test(
    'mobile icon picker and chat at ' + width + 'px',
    async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/home')
      await expect(
        page.getByRole('button', { name: 'New button' }),
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: /Create your own button/ }),
      ).toHaveCount(0)
      await page.getByRole('button', { name: 'New button' }).click()
      const tiles = page.locator('.icon-option')
      await expect(tiles).toHaveCount(40)
      await expect(tiles.first()).toBeVisible()
      const layout = await page.locator('.icon-grid').evaluate((grid) => ({
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        overflowing: [...grid.children].some(
          (tile) =>
            tile.scrollWidth > tile.clientWidth + 1 ||
            tile.scrollHeight > tile.clientHeight + 1,
        ),
      }))
      expect(layout).toEqual({
        columns: width === 320 ? 2 : 3,
        overflowing: false,
      })
      await tiles.nth(1).click()
      await expect(tiles.nth(1)).toHaveAttribute('aria-pressed', 'true')
      await page.locator('.icon-grid').scrollIntoViewIfNeeded()
      await page.screenshot({
        path: info.outputPath('icons-' + width + '.png'),
      })
      await page.goto('/settings/appearance')
      await expect(page.locator('.palette')).toHaveCount(6)
      for (const palette of [index, ...(index === 3 ? [4, 5] : [])]) {
        const button = page.locator('.palette').nth(palette)
        await button.click()
        await expect(button).toHaveAttribute('aria-pressed', 'true')
        await expect(button).toBeEnabled()
      }
      await page.goto('/chat')
      await expect(
        page.getByRole('button', { name: 'Search chat' }),
      ).toBeVisible()
      await expect(
        page.getByLabel('Attach photo', { exact: true }).last(),
      ).toHaveCount(1)
      await expect(
        page.getByRole('button', { name: 'Record voice note' }),
      ).toBeVisible()
      await expect(
        page.getByText('I need a hug', { exact: true }),
      ).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width)
      await page.screenshot({ path: info.outputPath('chat-' + width + '.png') })
      await page.goto('/profile')
      await expect(
        page.getByRole('heading', { name: 'My Profile' }),
      ).toBeVisible()
      await expect(
        page.getByText('Install Our Space', { exact: true }),
      ).toHaveCount(0)
      await page.goto('/settings/notifications')
      await expect(
        page.getByRole('heading', { name: 'Notifications', exact: true }),
      ).toBeVisible()
      await expect(page.getByText(/What you.ll be notified about/)).toHaveCount(
        0,
      )
      if (width === 390)
        await page.screenshot({
          path: info.outputPath('notifications-390.png'),
        })
    },
  )
}

test('voice note clock starts, stops and shows final duration', async ({
  page,
}) => {
  await page.goto('/chat')
  await page.getByRole('button', { name: 'Record voice note' }).click()
  const timer = page.locator('.chat-attachments time')
  await expect(timer).toHaveText('00:00')
  await expect(timer).toHaveText(/^00:0[1-5]$/)
  await page.getByRole('button', { name: 'Stop recording' }).click()
  await expect(
    page.locator('audio[aria-label="Voice note preview"]'),
  ).toBeVisible()
  await expect(timer).toHaveText(/^00:0[1-5]$/)
  await page.getByRole('button', { name: 'Discard attachment' }).click()
  await expect(timer).toHaveCount(0)
})

const callId = 'bb76d540-9327-4e22-9f52-36dcf43e672b'
for (const [i, width] of [320, 375, 390, 430].entries()) {
  test(
    'incoming call layout and decline at ' + width + 'px',
    async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 })
      let status = 'ringing'
      const row = () => ({
        id: callId,
        caller_id: second,
        recipient_id: first,
        status,
        offer: 'mock offer',
        answer: null,
        expires_at: new Date(Date.now() + 45000).toISOString(),
      })
      await page.route('**/rest/v1/voice_calls?**', (route) =>
        route.fulfill({ json: row() }),
      )
      await page.route('**/rest/v1/rpc/change_voice', async (route) => {
        const payload = route.request().postDataJSON()
        expect(payload).toMatchObject({ call_id: callId, operation: 'decline' })
        status = 'declined'
        return route.fulfill({ json: row() })
      })
      await page.goto('/chat?call=' + callId)
      const screen = page.getByRole('region', { name: 'Incoming Voice Call' })
      await expect(screen.getByRole('button', { name: 'Answer' })).toBeVisible()
      await expect(screen).toContainText('Semsem is calling')
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width)
      await page.screenshot({
        path: info.outputPath('incoming-' + width + '.png'),
      })
      await screen.getByRole('button', { name: 'Decline' }).click()
      await expect(screen).toHaveCount(0)
      expect(status).toBe('declined')
      await expect(
        page.getByRole('navigation', { name: 'Main navigation' }),
      ).toHaveCount(0)
      await expect(page.getByText('Pending', { exact: true })).toHaveCount(0)
      if (i === 3)
        await expect(
          page.getByRole('button', { name: 'Back to Home' }),
        ).toBeVisible()
    },
  )
}

test('expired notification link shows a missed call', async ({ page }) => {
  await page.route('**/rest/v1/voice_calls?**', (route) =>
    route.fulfill({
      json: {
        id: callId,
        caller_id: second,
        recipient_id: first,
        status: 'missed',
        offer: null,
        answer: null,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    }),
  )
  await page.goto('/chat?call=' + callId)
  await expect(
    page.getByText('Missed voice call.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Answer' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page).toHaveURL(/\/chat$/)
})
