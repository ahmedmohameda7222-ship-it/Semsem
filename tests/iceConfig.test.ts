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
