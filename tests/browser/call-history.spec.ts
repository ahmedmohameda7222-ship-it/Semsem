import { expect, test } from '@playwright/test'

const first = '8dd72ecf-1d1d-4dbc-89b5-06b7c7b3c1ab'
const second = '18fddbe3-93d2-4e7b-8f42-2d9636b29c0a'

test('private call history summarizes connected calls and ignores ring time', async ({ page }) => {
  test.skip(Boolean(process.env.TEST_BASE_URL), 'Isolated local fixture')
  await page.addInitScript(() => {
    const exp = 4102444800
    const token = 'eyJhbGciOiJIUzI1NiJ9.' +
      btoa(JSON.stringify({ exp, sub: '8dd72ecf-1d1d-4dbc-89b5-06b7c7b3c1ab' }))
        .replaceAll('+','-').replaceAll('/','_').replaceAll('=','') +
      '.fixture'
    localStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: token, refresh_token: 'fixture', expires_at: exp,
      user: { id: '8dd72ecf-1d1d-4dbc-89b5-06b7c7b3c1ab' },
    }))
  })
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const uri = new URL(route.request().url())
    const table = uri.pathname.split('/').at(-1)
    if (table === 'profiles') return route.fulfill({ json: [
      { id: first, stable_key: 'sasa', nickname: 'Sasa', real_name: 'Ahmed', role: 'Husband', theme: 'cherry', reduce_motion: false, avatar_path: null },
      { id: second, stable_key: 'semsem', nickname: 'Semsem', real_name: 'Sama', role: 'Wife', theme: 'scarlet', reduce_motion: false, avatar_path: null },
    ] })
    if (table === 'call_history_totals') return route.fulfill({
      json: { connected_calls: 2, total_seconds: 3752, total_attempts: 4 },
    })
    if (table === 'voice_calls') return route.fulfill({ json: [
      { id: '5c5ad511-3333-4b2e-8f1b-4fd00c12a970', caller_id: first, recipient_id: second,
        status:'ended', created_at:'2026-11-13T01:00:00Z',
        connected_at:'2026-11-13T01:00:20Z', ended_at:'2026-11-13T02:01:20Z' },
      { id: '5c5ad511-3333-4b2e-8f1b-4fd00c12a971', caller_id: second, recipient_id: first,
        status:'missed', created_at:'2026-11-12T20:00:00Z',
        connected_at:null,ended_at:'2026-11-12T20:00:45Z' },
    ] })
    return route.fulfill({ json: [] })
  })
  await page.setViewportSize({ width: 320, height: 780 })
  await page.goto('/chat')
  await page.getByRole('button', { name: 'Call history' }).click()
  const panel = page.getByRole('region', { name: 'Call history' })
  await expect(panel).toBeVisible()
  await expect(panel.getByText('2', { exact: true })).toBeVisible()
  await expect(panel.getByText('1h 2m')).toBeVisible()
  await expect(panel.getByText('1:01:00')).toBeVisible()
  await expect(panel.getByText('Missed')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('call-history-320.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await panel.getByRole('button', { name: 'Close call history' }).click()
  await expect(panel).toHaveCount(0)
})
