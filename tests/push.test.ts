import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error The Vercel runtime serves JavaScript functions.
import { allowedEndpoint } from '../server/push.js'

test('accepts supported HTTPS push providers', () => {
  assert.equal(allowedEndpoint('https://web.push.apple.com/a'), true)
  assert.equal(allowedEndpoint('https://fcm.googleapis.com/a'), true)
  assert.equal(
    allowedEndpoint('https://updates.push.services.mozilla.com/a'),
    true,
  )
})

test('rejects malformed and non-provider endpoints', () => {
  for (const endpoint of [
    'garbage',
    'http://web.push.apple.com/a',
    'https://example.com/a',
    null,
    'https://web.push.apple.com:8080/a',
  ]) {
    assert.equal(allowedEndpoint(endpoint), false)
  }
})
