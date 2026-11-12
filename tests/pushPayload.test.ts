import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error The Vercel runtime serves JavaScript functions.
import { pushPayload } from '../server/pushPayload.js'

test('push uses current nickname, actual body, and deep-link entry', () => {
  assert.deepEqual(
    pushPayload({
      event_id: 'entry',
      sender_nickname: 'Sasa',
      body: 'See you soon 🫶',
    }),
    {
      entry: 'entry',
      title: 'Sasa ❤️',
      body: 'See you soon 🫶',
    },
  )
})

test('request notifications retain both title and body', () => {
  const payload = pushPayload({
    event_id: 'entry',
    sender_nickname: 'Semsem',
    title: 'I need a hug',
    body: 'Can you hug me? 🥺',
  })
  assert.equal(payload.title, 'Semsem ❤️ · Attention Request')
  assert.equal(payload.body, 'I need a hug — Can you hug me? 🥺')
})

test('long push text truncates at grapheme boundaries', () => {
  const family = '👍🏽'
  assert.equal(
    pushPayload({ body: family.repeat(181) }).body,
    family.repeat(180) + '…',
  )
})

test('push payload stays below the provider size limit for long emoji clusters', () => {
  const cluster = '👩🏽‍❤️‍👩🏼'
  const payload = pushPayload({ body: cluster.repeat(181) })
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 3000)
  assert.ok(payload.body.endsWith('…'))
})

test('service worker displays the supplied notification and opens its entry', async () => {
  const { readFile } = await import('node:fs/promises')
  const { runInNewContext } = await import('node:vm')
  const listeners = new Map<string, (event: object) => void>()
  let shown: unknown
  let opened: unknown
  runInNewContext(
    await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
    {
      self: {
        addEventListener: (name: string, callback: (event: object) => void) =>
          listeners.set(name, callback),
        registration: {
          showNotification: async (title: string, options: object) => {
            shown = { title, options }
          },
        },
        clients: {
          matchAll: async () => [],
          openWindow: async (url: string) => {
            opened = url
          },
        },
      },
    },
  )
  const entry = '8df03102-77e8-438a-a65c-7ae373e2a3b2'
  let pending: Promise<unknown> | undefined
  const waitUntil = (value: Promise<unknown>) => {
    pending = value
  }
  listeners.get('push')?.({
    data: { json: () => ({ entry, title: 'Sasa ❤️', body: 'See you 🫶' }) },
    waitUntil,
  })
  await pending
  const notice = shown as {
    title: string
    options: { body: string; tag: string; data: object }
  }
  assert.equal(notice.title, 'Sasa ❤️')
  assert.equal(notice.options.body, 'See you 🫶')
  assert.equal(notice.options.tag, entry)
  listeners.get('notificationclick')?.({
    notification: { close: () => {}, data: notice.options.data },
    waitUntil,
  })
  await pending
  assert.equal(opened, '/chat?entry=' + entry)
})
