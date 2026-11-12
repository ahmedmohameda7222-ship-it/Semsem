import assert from 'node:assert/strict'
import { test } from 'node:test'
import { iceConfiguration } from '../server/ice.js'

test('missing provider credentials preserves best-effort STUN calling', async () => {
  const result = await iceConfiguration({ key: '', secret: '' })
  assert.equal(result.relay, false)
  assert.deepEqual(result.iceServers, [{ urls: 'stun:stun.cloudflare.com:3478' }])
})

test('transient TURN outage falls back to STUN without breaking call startup', async () => {
  const result = await iceConfiguration({
    key: 'key-id', secret: 'secret',
    fetcher: async () => { throw new Error('TURN temporarily unreachable') },
  })
  assert.equal(result.relay, false)
  assert.deepEqual(result.iceServers, [{ urls: 'stun:stun.cloudflare.com:3478' }])
})

test('valid TURN response preserves time-limited relay and fallback STUN', async () => {
  const result = await iceConfiguration({
    key: 'key-id', secret: 'secret',
    fetcher: async () => new Response(JSON.stringify({
      iceServers: [{ urls: ['turn:example.net:3478'], username: 'ephemeral', credential: 'temporary' }],
    }), { status: 200 }),
  })
  assert.equal(result.relay, true)
  assert.equal(result.iceServers.length, 2)
  assert.equal(result.iceServers[1].credential, 'temporary')
})

test('provider responding without TURN credentials fails open to STUN', async () => {
  const result = await iceConfiguration({
    key: 'key-id', secret: 'secret',
    fetcher: async () => new Response(JSON.stringify({
      iceServers: [{ urls: 'stun:example.net:3478' }],
    }), { status: 200 }),
  })
  assert.equal(result.relay, false)
  assert.equal(result.iceServers.length, 1)
})

test('unauthorized provider response never exposes administrative TURN secret', async () => {
  const result = await iceConfiguration({
    key: 'key-id', secret: 'my-long-term-secret',
    fetcher: async () => new Response('forbidden', { status: 403 }),
  })
  assert.equal(JSON.stringify(result).includes('my-long-term-secret'), false)
  assert.equal(result.relay, false)
})

test('missing TURN configuration is reported, instead of silently passing as a healthy relay', async () => {
  const result = await iceConfiguration({ key: '', secret: '' })
  assert.equal(result.relay, false)
  assert.equal(result.turnStatus, 'not_configured')
})

test('Cloudflare rejected TURN credentials are distinguished from NAT issues', async () => {
  const result = await iceConfiguration({
    key: 'key-id',
    secret: 'private-administrative-token',
    fetcher: async () => new Response('not authorized', { status: 403 }),
  })
  assert.equal(result.relay, false)
  assert.equal(result.turnStatus, 'auth_error')
  assert.equal(JSON.stringify(result).includes('private-administrative-token'), false)
})

test('wrong Cloudflare TURN key ID reports a separate invalid-key error', async () => {
  const result = await iceConfiguration({
    key: 'missing-key',
    secret: 'private-token',
    fetcher: async () => new Response('not found', { status: 404 }),
  })
  assert.equal(result.turnStatus, 'invalid_key')
})

test('Cloudflare rate limit is differentiated from an invalid key', async () => {
  const result = await iceConfiguration({
    key: 'valid-key',
    secret: 'private-token',
    fetcher: async () => new Response('too many', { status: 429 }),
  })
  assert.equal(result.turnStatus, 'rate_limited')
})

test('valid TURN credentials return a ready status without exposing the administrator token', async () => {
  const result = await iceConfiguration({
    key: 'key-id',
    secret: 'private-administrative-token',
    fetcher: async () => new Response(JSON.stringify({ iceServers: [
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'],
        username: 'short-lived-user', credential: 'short-lived-credential' },
    ] }), { status: 201 }),
  })
  assert.equal(result.relay, true)
  assert.equal(result.turnStatus, 'ready')
  assert.equal(result.iceServers[1].username, 'short-lived-user')
  assert.equal(JSON.stringify(result).includes('private-administrative-token'), false)
})

test('temporary Cloudflare network errors remain retryable and diagnosable', async () => {
  const result = await iceConfiguration({
    key: 'key-id',
    secret: 'private-token',
    fetcher: async () => { throw new Error('network interrupted') },
  })
  assert.equal(result.turnStatus, 'network_error')
  assert.equal(result.iceServers.length, 1)
})
