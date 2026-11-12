import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const headers = Object.fromEntries(
  config.headers.filter((item: { source: string }) => item.source === '/(.*)')
    .flatMap((item: { headers: { key: string; value: string }[] }) => item.headers)
    .map((item: { key: string; value: string }) => [item.key.toLowerCase(), item.value]),
)

test('production headers mitigate XSS, framing and mixed-content downgrade', () => {
  const csp: string = headers['content-security-policy'] ?? ''
  assert.match(csp, /script-src 'self'/)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /base-uri 'self'/)
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-(inline|eval)'/)
  assert.match(headers['strict-transport-security'] ?? '', /max-age=31536000/)
  assert.equal(headers['x-content-type-options'], 'nosniff')
  assert.equal(headers['x-frame-options'], 'DENY')
})

test('content policy permits only intended realtime API, private media and audio preview', () => {
  const csp: string = headers['content-security-policy'] ?? ''
  assert.match(csp, /connect-src[^;]*wss:\/\/dthmpdsyxqnfsdaoicvm\.supabase\.co/)
  assert.match(csp, /connect-src[^;]*https:\/\/dthmpdsyxqnfsdaoicvm\.supabase\.co/)
  assert.match(csp, /media-src[^;]*blob:/)
  assert.match(csp, /img-src[^;]*blob:/)
  assert.match(headers['permissions-policy'] ?? '', /geolocation=\(\)/)
})
