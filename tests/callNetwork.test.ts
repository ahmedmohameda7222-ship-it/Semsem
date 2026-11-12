import assert from 'node:assert/strict'
import { test } from 'node:test'
import { turnStatusMessage } from '../src/callNetwork'

test('invalid Cloudflare credentials produce an actionable non-secret call message', () => {
  assert.match(turnStatusMessage('auth_error'), /Cloudflare rejected.*TURN credentials/i)
  assert.match(turnStatusMessage('auth_error'), /Vercel/i)
})

test('missing key and invalid key are different from remote networking trouble', () => {
  assert.match(turnStatusMessage('not_configured'), /not configured/i)
  assert.match(turnStatusMessage('invalid_key'), /TURN Key ID/i)
  assert.match(turnStatusMessage('timeout'), /timed out/i)
})

test('healthy relay does not suggest a configuration error', () => {
  assert.equal(turnStatusMessage('ready'), '')
})

test('unknown and unexpected status codes do not echo uncontrolled text', () => {
  const unexpected = 'secret=PRIVATE-TURN-ADMIN-TOKEN'
  assert.equal(turnStatusMessage(unexpected), 'TURN relay unavailable; trying a direct connection.')
  assert.equal(turnStatusMessage(unexpected).includes('PRIVATE-TURN'), false)
})
