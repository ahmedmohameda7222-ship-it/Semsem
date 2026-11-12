import assert from 'node:assert/strict'
import { test } from 'node:test'
import { restorePushSubscription } from '../src/pushRecovery'

const oldSubscription = {
  endpoint: 'https://web.push.apple.com/push-id',
  toJSON: () => ({
    endpoint: 'https://web.push.apple.com/push-id',
    keys: { p256dh: 'public-p256dh', auth: 'auth-key' },
  }),
}

test('restores an existing previously authorized push subscription without new permission', async () => {
  const sent: unknown[] = []
  const restored = await restorePushSubscription({
    permission: () => 'granted',
    existing: async () => oldSubscription,
    register: async (fields) => { sent.push(fields) },
  })
  assert.equal(restored, true)
  assert.deepEqual(sent, [{
    endpoint: 'https://web.push.apple.com/push-id',
    keys: { p256dh: 'public-p256dh', auth: 'auth-key' },
  }])
})

test('never registers push when permission is denied or not requested', async () => {
  let called = false
  for (const state of ['denied', 'default']) {
    assert.equal(await restorePushSubscription({
      permission: () => state,
      existing: async () => { called = true; return oldSubscription },
      register: async () => { called = true },
    }), false)
  }
  assert.equal(called, false)
})

test('does not silently create new subscriptions when the browser has none', async () => {
  let calls = 0
  const restored = await restorePushSubscription({
    permission: () => 'granted',
    existing: async () => null,
    register: async () => { calls++ },
  })
  assert.equal(restored, false)
  assert.equal(calls, 0)
})

test('a failed registration is observable so caller may retry on focus', async () => {
  await assert.rejects(restorePushSubscription({
    permission: () => 'granted',
    existing: async () => oldSubscription,
    register: async () => { throw new Error('temporary network failure') },
  }), /temporary network failure/)
})
