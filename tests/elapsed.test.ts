import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatElapsed } from '../src/elapsed'

test('elapsed displays whole seconds and minute rollover', () => {
  assert.equal(formatElapsed(0), '00:00')
  assert.equal(formatElapsed(1.9), '00:01')
  assert.equal(formatElapsed(59), '00:59')
  assert.equal(formatElapsed(60), '01:00')
  assert.equal(formatElapsed(155), '02:35')
  assert.equal(formatElapsed(-1), '00:00')
})
